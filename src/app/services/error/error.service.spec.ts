// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { SystemMessageService } from '../system-message/system-message.service';
import { ErrorService } from './error.service';

function setup() {
  const messages = {
    displayMessage: vi.fn(),
  } satisfies Pick<SystemMessageService, 'displayMessage'>;
  TestBed.configureTestingModule({
    providers: [{ provide: SystemMessageService, useValue: messages }],
  });
  return { service: TestBed.inject(ErrorService), messages };
}

// What zone.js hands the ErrorHandler for an unhandled promise rejection.
function uncaughtInPromise(rejection: Error) {
  return Object.assign(new Error(`Uncaught (in promise): ${rejection.message}`), {
    rejection,
  });
}

describe('ErrorService', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  /**
   * Verifies: an API error that carries a name is shown with the API's own name and message.
   * Interacts with: SystemMessageService.displayMessage spy.
   * Data: HttpErrorResponse whose body is { name: 'Forbidden', message: 'No access' }.
   */
  it('shows a named API error', () => {
    const { service, messages } = setup();
    service.handleError(
      new HttpErrorResponse({
        status: 403,
        error: { name: 'Forbidden', message: 'No access' },
      }),
    );
    expect(messages.displayMessage).toHaveBeenCalledWith('Forbidden', 'No access');
  });

  /**
   * Verifies: a status-0 failure (API unreachable) gets the friendly "could not be reached" message.
   * Interacts with: SystemMessageService.displayMessage spy.
   * Data: HttpErrorResponse status 0 'Unknown Error' with no url, as HttpClient reports a network failure.
   */
  it('explains an unreachable API', () => {
    const { service, messages } = setup();
    service.handleError(
      new HttpErrorResponse({ status: 0, statusText: 'Unknown Error', error: {} }),
    );
    expect(messages.displayMessage).toHaveBeenCalledWith(
      'VM API Error',
      'The VM Console API could not be reached.',
    );
  });

  /**
   * Verifies: any other HTTP error is shown with its status text and message.
   * Interacts with: SystemMessageService.displayMessage spy.
   * Data: HttpErrorResponse 500 'Server Error' for a url, with an unnamed body.
   */
  it('shows other HTTP errors by status text', () => {
    const { service, messages } = setup();
    const err = new HttpErrorResponse({
      status: 500,
      statusText: 'Server Error',
      url: 'https://vm-api.test/api/vms/1',
      error: {},
    });
    service.handleError(err);
    expect(messages.displayMessage).toHaveBeenCalledWith('Server Error', err.message);
  });

  /**
   * Verifies: an HTTP error whose body is empty or not JSON is shown by status text instead of crashing the handler.
   * Interacts with: SystemMessageService.displayMessage spy.
   * Data: a 401 with error null (an empty body, as JwtBearer sends) and a 413 with an HTML string body.
   */
  it.each<[string, number, string, unknown]>([
    ['no body', 401, 'Unauthorized', null],
    ['an HTML body', 413, 'Payload Too Large', '<html><body>413</body></html>'],
  ])('shows an HTTP error with %s by status text', (_label, status, statusText, error) => {
    const { service, messages } = setup();
    const err = new HttpErrorResponse({ status, statusText, url: 'https://vm-api.test/api/x', error });

    expect(() => service.handleError(err)).not.toThrow();
    expect(messages.displayMessage).toHaveBeenCalledWith(statusText, err.message);
  });

  /**
   * Verifies: any status-0 failure is explained as an unreachable API, whatever url HttpClient reports.
   * Interacts with: SystemMessageService.displayMessage spy.
   * Data: HttpErrorResponse status 0 with a url (CORS or connection refused on a known endpoint).
   */
  it('explains an unreachable API that has a url', () => {
    const { service, messages } = setup();
    service.handleError(
      new HttpErrorResponse({ status: 0, statusText: 'Unknown Error', url: 'https://vm-api.test/api/vms/1', error: null }),
    );
    expect(messages.displayMessage).toHaveBeenCalledWith(
      'VM API Error',
      'The VM Console API could not be reached.',
    );
  });

  /**
   * Verifies: an unhandled rejection caused by a network failure during sign-in is explained as the identity server being unreachable.
   * Interacts with: SystemMessageService.displayMessage spy.
   * Data: an 'Uncaught (in promise)' error whose rejection message is 'Network Error'.
   */
  it('explains an unreachable identity server', () => {
    const { service, messages } = setup();
    service.handleError(uncaughtInPromise(new Error('Network Error')));
    expect(messages.displayMessage).toHaveBeenCalledWith(
      'Identity Server Error',
      'The Identity Server could not be reached for user authentication.',
    );
  });

  /**
   * Verifies: other unhandled rejections and ordinary errors are logged, not shown.
   * Interacts with: console.log spy; SystemMessageService.displayMessage spy.
   * Data: the error under test and what is logged for it.
   */
  it.each<[string, () => [Error, unknown]]>([
    [
      "an unhandled rejection other than 'Network Error'",
      () => [uncaughtInPromise(new Error('Timeout')), 'Timeout'],
    ],
    [
      'an ordinary Error',
      () => {
        const plain = new Error('boom');
        return [plain, plain];
      },
    ],
  ])('logs %s without showing it', (_label, make) => {
    const { service, messages } = setup();
    const [error, logged] = make();

    service.handleError(error);

    expect(vi.mocked(console.log).mock.calls).toEqual([[logged]]);
    expect(messages.displayMessage).not.toHaveBeenCalled();
  });

  /**
   * Verifies: a thrown value without a message (not an Error) is logged instead of crashing the handler.
   * Interacts with: console.log spy; SystemMessageService.displayMessage spy.
   * Data: the thrown value under test, and an unhandled rejection that rejected with a non-Error.
   */
  it.each<[string, unknown]>([
    ['a thrown string', 'boom'],
    ['a plain object', { status: 404 }],
    ['null', null],
  ])('logs %s without crashing', (_label, thrown) => {
    const { service, messages } = setup();
    expect(() => service.handleError(thrown)).not.toThrow();
    expect(vi.mocked(console.log).mock.calls).toEqual([[thrown]]);
    expect(messages.displayMessage).not.toHaveBeenCalled();
  });

  it('logs an unhandled rejection with no Error without crashing', () => {
    const { service } = setup();
    const err = Object.assign(new Error('Uncaught (in promise): undefined'), { rejection: undefined });
    expect(() => service.handleError(err)).not.toThrow();
  });
});
