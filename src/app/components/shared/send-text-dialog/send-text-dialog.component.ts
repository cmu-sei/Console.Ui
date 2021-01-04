// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'send-text-dialog',
  templateUrl: './send-text-dialog.component.html',
  styleUrls: ['./send-text-dialog.component.scss'],
})
export class SendTextDialogComponent {
  public title: string;
  public textToSend: string;

  constructor(
    @Inject(MAT_DIALOG_DATA) data,
    private dialogRef: MatDialogRef<SendTextDialogComponent>
  ) {
    this.dialogRef.disableClose = true;
  }

  close() {
    this.textToSend = '';
    this.dialogRef.close(undefined);
  }

  send() {
    this.dialogRef.close(this.textToSend);
  }
}
