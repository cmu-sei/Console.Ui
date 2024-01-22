// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Component, Inject } from '@angular/core';
import { MatLegacyDialogRef as MatDialogRef, MAT_LEGACY_DIALOG_DATA as MAT_DIALOG_DATA } from '@angular/material/legacy-dialog';
import { ComnSettingsService } from '@cmusei/crucible-common';

@Component({
  selector: 'send-text-dialog',
  templateUrl: './send-text-dialog.component.html',
  styleUrls: ['./send-text-dialog.component.scss'],
})
export class SendTextDialogComponent {
  public title: string;
  public textToSend: string;
  public pasteSpeed: string;

  constructor(
    @Inject(MAT_DIALOG_DATA) data,
    public settingsService: ComnSettingsService,
    private dialogRef: MatDialogRef<SendTextDialogComponent>
  ) {
    this.dialogRef.disableClose = true;
  }

  close() {
    this.textToSend = '';
    this.dialogRef.close(undefined);
  }

  setPasteSpeed(speed: string) {
    this.pasteSpeed = speed;
  }

  send() {
    this.dialogRef.close({
      textToSend: this.textToSend,
      timeout: this.pasteSpeed,
    });
  }
}
