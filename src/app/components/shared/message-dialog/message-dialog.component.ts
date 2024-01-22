// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Component, Inject } from '@angular/core';
import { MatLegacyDialogRef as MatDialogRef, MAT_LEGACY_DIALOG_DATA as MAT_DIALOG_DATA } from '@angular/material/legacy-dialog';

@Component({
  selector: 'message-dialog',
  templateUrl: './message-dialog.component.html',
  styleUrls: ['./message-dialog.component.scss'],
})
export class MessageDialogComponent {
  public title: string;
  public message: string;
  public removeArtifacts: boolean = true;
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<MessageDialogComponent>
  ) {
    this.dialogRef.disableClose = true;
  }
  onClick(message: boolean): void {
    this.data.artifacts && this.data.artifacts.length > 0
      ? (this.data.removeArtifacts = this.removeArtifacts)
      : (this.data.removeArtifacts = false);
    this.data.message = message;
    this.dialogRef.close(this.data);
  }
}
