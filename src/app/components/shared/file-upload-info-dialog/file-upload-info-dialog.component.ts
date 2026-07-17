// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { A11yModule } from '@angular/cdk/a11y';
import { Component, Inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CRUCIBLE_DIALOG_IMPORTS } from '@cmusei/crucible-common';

export interface FileUploadInfoDialogData {
  showCredentials?: boolean;
}

export interface FileUploadInfoDialogResult {
  username: string;
  password: string;
  filepath: string;
}

@Component({
  selector: 'file-upload-info-dialog',
  templateUrl: './file-upload-info-dialog.component.html',
  styleUrls: ['./file-upload-info-dialog.component.scss'],
  imports: [
    ...CRUCIBLE_DIALOG_IMPORTS,
    A11yModule,
    ReactiveFormsModule,
    MatFormField,
    MatLabel,
    MatInput,
  ],
})
export class FileUploadInfoDialogComponent {
  public title: string;
  public readonly form;
  public readonly showCredentials: boolean;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: FileUploadInfoDialogData,
    private dialogRef: MatDialogRef<
      FileUploadInfoDialogComponent,
      FileUploadInfoDialogResult
    >,
    formBuilder: FormBuilder,
  ) {
    this.showCredentials = data.showCredentials ?? true;
    this.form = formBuilder.nonNullable.group({
      filepath: '',
      username: '',
      password: '',
    });
  }

  done() {
    this.dialogRef.close(this.form.getRawValue());
  }
}
