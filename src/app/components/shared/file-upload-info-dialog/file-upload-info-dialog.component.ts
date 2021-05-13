// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Component, Inject } from '@angular/core';

@Component({
  selector: 'file-upload-info-dialog',
  templateUrl: './file-upload-info-dialog.component.html',
})
export class FileUploadInfoDialogComponent {
  public title: string;
  public username = '';
  public password = '';
  public filepath = '';

  constructor(
    @Inject(MAT_DIALOG_DATA) data,
    private dialogRef: MatDialogRef<FileUploadInfoDialogComponent>
  ) {
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
