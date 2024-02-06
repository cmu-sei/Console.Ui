// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Component, Inject } from '@angular/core';
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialogTitle,
  MatDialogActions,
} from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

@Component({
  selector: 'message-dialog',
  templateUrl: './message-dialog.component.html',
  styleUrls: ['./message-dialog.component.scss'],
  standalone: true,
  imports: [MatDialogTitle, MatProgressSpinner, MatDialogActions, MatButton],
})
export class MessageDialogComponent {
  public title: string;
  public message: string;
  public removeArtifacts: boolean = true;
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<MessageDialogComponent>,
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
