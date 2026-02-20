// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogTitle,
  MatDialogActions,
} from '@angular/material/dialog';
import { Component, Inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatInput } from '@angular/material/input';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';


@Component({
    selector: 'file-upload-info-dialog',
    templateUrl: './file-upload-info-dialog.component.html',
    imports: [
    MatDialogTitle,
    FormsModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatDialogActions,
    MatButton
]
})
export class FileUploadInfoDialogComponent {
  public title: string;
  public username = '';
  public password = '';
  public filepath = '';

  public showCredentials = true;

  constructor(
    @Inject(MAT_DIALOG_DATA) data,
    private dialogRef: MatDialogRef<FileUploadInfoDialogComponent>,
  ) {
    if (data?.showCredentials != null) {
      this.showCredentials = data.showCredentials;
    }
    this.dialogRef.disableClose = true;
  }

  close() {
    this.dialogRef.close({});
  }

  done() {
    this.dialogRef.close({
      username: this.username,
      password: this.password,
      filepath: this.filepath,
    });
  }
}
