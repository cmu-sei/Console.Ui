// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Injectable, Injector, ErrorHandler, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { SystemMessageService } from '../system-message/system-message.service';

@Injectable({
  providedIn: 'root',
})
export class ErrorService implements ErrorHandler {
  private injector = inject(Injector);

  handleError(err: any) {
    const messageService = this.injector.get(SystemMessageService);
    if (err instanceof HttpErrorResponse) {
      // A request that asked for a Blob (Download File) gets its error body as a Blob too.
      if (err.error instanceof Blob) {
        err.error
          .text()
          .then((text) => this.showHttpError(err, this.parseJson(text)))
          .catch(() => this.showHttpError(err, null));
        return;
      }
      this.showHttpError(err, err.error);
    } else if (
      typeof err?.message === 'string' &&
      err.message.startsWith('Uncaught (in promise)')
    ) {
      if (err.rejection?.message === 'Network Error') {
        messageService.displayMessage(
          'Identity Server Error',
          'The Identity Server could not be reached for user authentication.',
        );
      } else {
        console.log(err.rejection?.message ?? err.rejection);
      }
    } else {
      console.log(err);
    }
  }

  private parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private showHttpError(err: HttpErrorResponse, body: any) {
    const messageService = this.injector.get(SystemMessageService);
    // The body is null for an empty response (a 401 from JwtBearer), a string for an HTML error
    // page, or JSON; only JSON can name the error.
    const apiError = body;
    if (apiError?.name !== undefined && apiError?.name !== null) {
      messageService.displayMessage(apiError.name, apiError.message);
    } else if (typeof apiError?.title === 'string' && apiError.title) {
      // ProblemDetails, as vm.api returns: the title is the reason ("You do not have permission
      // to ..."). The detail is left out on purpose; for a 500 it can carry a stack trace.
      messageService.displayMessage(httpErrorHeading(err), apiError.title);
    } else if (err.status === 0) {
      // Http failure response for (unknown url): 0 Unknown Error
      messageService.displayMessage(
        'VM API Error',
        'The VM Console API could not be reached.',
      );
    } else {
      messageService.displayMessage(httpErrorHeading(err), err.message);
    }
  }
}

// "VM API Error (403)". Not the status text: HTTP/2 has none, and Angular's XHR backend then
// reports 'OK', so a refused request would be headed "OK".
function httpErrorHeading(err: HttpErrorResponse): string {
  return `VM API Error (${err.status})`;
}
