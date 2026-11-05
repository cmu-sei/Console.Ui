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
  return Object.assign(
    new Error(`Uncaught (in promise): ${rejection.message}`),
    {
      rejection,
    },
  );
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
    expect(messages.displayMessage).toHaveBeenCalledWith(
      'Forbidden',
      'No access',
    );
  });

  /**
   * Verifies: a status-0 failure (API unreachable) gets the friendly "could not be reached" message.
   * Interacts with: SystemMessageService.displayMessage spy.
   * Data: HttpErrorResponse status 0 'Unknown Error' with no url, as HttpClient reports a network failure.
   */
  it('explains an unreachable API', () => {
    const { service, messages } = setup();
    service.handleError(
      new HttpErrorResponse({
        status: 0,
        statusText: 'Unknown Error',
        error: {},
      }),
    );
    expect(messages.displayMessage).toHaveBeenCalledWith(
      'VM API Error',
      'The VM Console API could not be reached.',
    );
  });

  /**
   * Verifies: any other HTTP error is shown with its status code and message.
   * Interacts with: SystemMessageService.displayMessage spy.
   * Data: HttpErrorResponse 500 'Server Error' for a url, with an unnamed body.
   */
  it('shows other HTTP errors by status code', () => {
    const { service, messages } = setup();
    const err = new HttpErrorResponse({
      status: 500,
      statusText: 'Server Error',
      url: 'https://vm-api.test/api/vms/1',
      error: {},
    });
    service.handleError(err);
    expect(messages.displayMessage).toHaveBeenCalledWith(
      'VM API Error (500)',
      err.message,
    );
  });

  /**
   * Verifies: an HTTP error whose body is empty or not JSON is shown by status code instead of crashing the handler.
   * Interacts with: SystemMessageService.displayMessage spy.
   * Data: a 401 with error null (an empty body, as JwtBearer sends) and a 413 with an HTML string body.
   */
  it.each<[string, number, string, unknown]>([
    ['no body', 401, 'Unauthorized', null],
    ['an HTML body', 413, 'Payload Too Large', '<html><body>413</body></html>'],
  ])(
    'shows an HTTP error with %s by status code',
    (_label, status, statusText, error) => {
      const { service, messages } = setup();
      const err = new HttpErrorResponse({
        status,
        statusText,
        url: 'https://vm-api.test/api/x',
        error,
      });

      expect(() => service.handleError(err)).not.toThrow();
      expect(messages.displayMessage).toHaveBeenCalledWith(
        `VM API Error (${status})`,
        err.message,
      );
    },
  );

  /**
   * Verifies: any status-0 failure is explained as an unreachable API, whatever url HttpClient reports.
   * Interacts with: SystemMessageService.displayMessage spy.
   * Data: HttpErrorResponse status 0 with a url (CORS or connection refused on a known endpoint).
   */
  it('explains an unreachable API that has a url', () => {
    const { service, messages } = setup();
    service.handleError(
      new HttpErrorResponse({
        status: 0,
        statusText: 'Unknown Error',
        url: 'https://vm-api.test/api/vms/1',
        error: null,
      }),
    );
    expect(messages.displayMessage).toHaveBeenCalledWith(
      'VM API Error',
      'The VM Console API could not be reached.',
    );
  });

  /**
   * Verifies: a ProblemDetails body is shown with its title as the reason, never its detail (which can hold a stack trace).
   * Interacts with: SystemMessageService.displayMessage spy.
   * Data: a 403 ProblemDetails, and a 500 whose detail is a stack trace.
   */
  it.each<[string, number, string, object, string]>([
    [
      'a 403',
      403,
      'Forbidden',
      {
        title: 'You do not have permission to download files from this vm.',
        status: 403,
      },
      'You do not have permission to download files from this vm.',
    ],
    [
      'a 500 with a stack trace',
      500,
      'Internal Server Error',
      {
        title: 'Value cannot be null.',
        status: 500,
        detail: 'System.ArgumentNullException ... at Player.Vm.Api',
      },
      'Value cannot be null.',
    ],
  ])(
    'shows the title of %s ProblemDetails',
    (_label, status, statusText, error, shown) => {
      const { service, messages } = setup();
      service.handleError(
        new HttpErrorResponse({
          status,
          statusText,
          url: 'https://vm-api.test/api/x',
          error,
        }),
      );
      expect(messages.displayMessage).toHaveBeenCalledWith(
        `VM API Error (${status})`,
        shown,
      );
    },
  );

  /**
   * Verifies: the heading comes from the status code, not the status text.
   * Interacts with: SystemMessageService.displayMessage spy.
   * Data: a 403 ProblemDetails with statusText 'OK', which is what Angular's XHR backend reports over HTTP/2 (no status text on the wire).
   * Why: over HTTP/2 a refused request was headed "OK".
   */
  it('heads a refused request by its status code over HTTP/2', () => {
    const { service, messages } = setup();
    service.handleError(
      new HttpErrorResponse({
        status: 403,
        statusText: 'OK',
        url: 'https://vm-api.test/api/x',
        error: {
          title: 'You do not have permission to revert this vm.',
          status: 403,
        },
      }),
    );
    expect(messages.displayMessage).toHaveBeenCalledWith(
      'VM API Error (403)',
      'You do not have permission to revert this vm.',
    );
  });

  /**
   * Verifies: a Blob error body (a request that asked for a Blob, like Download File) is read, and its ProblemDetails title shown; a Blob that isn't JSON falls back to the status code.
   * Interacts with: SystemMessageService.displayMessage spy.
   * Data: a 400 whose body is a JSON ProblemDetails Blob, and a 502 whose body is an HTML Blob.
   */
  it('reads a ProblemDetails Blob body', async () => {
    const { service, messages } = setup();
    const body = new Blob(
      [
        JSON.stringify({
          title: 'The file path must be an absolute path.',
          status: 400,
        }),
      ],
      { type: 'application/problem+json' },
    );
    service.handleError(
      new HttpErrorResponse({
        status: 400,
        statusText: 'Bad Request',
        url: 'https://vm-api.test/api/x',
        error: body,
      }),
    );
    await vi.waitFor(() =>
      expect(messages.displayMessage).toHaveBeenCalledWith(
        'VM API Error (400)',
        'The file path must be an absolute path.',
      ),
    );
  });

  it('falls back to the status code for a Blob body that is not JSON', async () => {
    const { service, messages } = setup();
    const err = new HttpErrorResponse({
      status: 502,
      statusText: 'Bad Gateway',
      url: 'https://vm-api.test/api/x',
      error: new Blob(['<html>502</html>'], { type: 'text/html' }),
    });
    service.handleError(err);
    await vi.waitFor(() =>
      expect(messages.displayMessage).toHaveBeenCalledWith(
        'VM API Error (502)',
        err.message,
      ),
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
    const err = Object.assign(new Error('Uncaught (in promise): undefined'), {
      rejection: undefined,
    });
    expect(() => service.handleError(err)).not.toThrow();
  });
});
