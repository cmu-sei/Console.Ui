// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { A11yModule } from '@angular/cdk/a11y';
import { Component } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialogClose } from '@angular/material/dialog';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { CRUCIBLE_DIALOG_IMPORTS } from '@cmusei/crucible-common';

@Component({
  selector: 'file-upload-progress-dialog',
  templateUrl: './file-upload-progress-dialog.component.html',
  styleUrls: ['./file-upload-progress-dialog.component.scss'],
  imports: [
    ...CRUCIBLE_DIALOG_IMPORTS,
    A11yModule,
    MatButton,
    MatDialogClose,
    MatProgressSpinner,
  ],
})
export class FileUploadProgressDialogComponent {}
