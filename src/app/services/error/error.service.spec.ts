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
   * Verifies: an HTTP error with no response body crashes the error handler.
   * Interacts with: ErrorService.handleError.
   * Data: HttpErrorResponse 401 with error null (an empty body, as JwtBearer sends).
   */
  it('throws on an HTTP error with no body', () => {
    const { service, messages } = setup();
    expect(() =>
      service.handleError(new HttpErrorResponse({ status: 401, error: null })),
    ).toThrow(TypeError);
    expect(messages.displayMessage).not.toHaveBeenCalled();
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
   * Verifies: a thrown value without a message (not an Error) crashes the error handler.
   * Interacts with: ErrorService.handleError.
   * Data: the thrown value under test.
   */
  it.each<[string, unknown]>([
    ['a thrown string', 'boom'],
    ['a plain object', { status: 404 }],
  ])('throws on %s', (_label, thrown) => {
    const { service } = setup();
    expect(() => service.handleError(thrown)).toThrow(TypeError);
  });
});
