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
      // The body is null for an empty response (a 401 from JwtBearer), a string for an HTML error
      // page, or JSON; only JSON can name the error.
      const apiError = err.error;
      if (apiError?.name !== undefined && apiError?.name !== null) {
        messageService.displayMessage(apiError.name, apiError.message);
      } else if (err.status === 0) {
        // Http failure response for (unknown url): 0 Unknown Error
        messageService.displayMessage(
          'VM API Error',
          'The VM Console API could not be reached.',
        );
      } else {
        messageService.displayMessage(err.statusText, err.message);
      }
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
}
