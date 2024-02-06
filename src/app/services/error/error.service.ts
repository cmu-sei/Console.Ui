// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Injectable, Injector, ErrorHandler } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { SystemMessageService } from '../system-message/system-message.service';

@Injectable({
  providedIn: 'root',
})
export class ErrorService implements ErrorHandler {
  constructor(private injector: Injector) {}

  handleError(err: any) {
    const messageService = this.injector.get(SystemMessageService);
    // Http failure response for (unknown url): 0 Unknown Error
    if (err instanceof HttpErrorResponse) {
      const apiError = <HttpErrorResponse>err.error;
      if (apiError.name !== undefined) {
        messageService.displayMessage(apiError.name, apiError.message);
      } else if (
        err.message ===
        'Http failure response for (unknown url): 0 Unknown Error'
      ) {
        messageService.displayMessage(
          'VM API Error',
          'The VM Console API could not be reached.',
        );
      } else {
        messageService.displayMessage(err.statusText, err.message);
      }
    } else if (err.message.startsWith('Uncaught (in promise)')) {
      if (err.rejection.message === 'Network Error') {
        messageService.displayMessage(
          'Identity Server Error',
          'The Identity Server could not be reached for user authentication.',
        );
      } else {
        console.log(err.rejection.message);
      }
    } else {
      console.log(err);
    }
  }
}
