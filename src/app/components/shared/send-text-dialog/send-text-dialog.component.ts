// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Component, Inject } from '@angular/core';
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialogTitle,
  MatDialogActions,
} from '@angular/material/dialog';
import { ComnSettingsService } from '@cmusei/crucible-common';
import { MatFormField, MatInput } from '@angular/material/input';
import { MatTooltip } from '@angular/material/tooltip';
import { MatIcon } from '@angular/material/icon';
import { MatMenuTrigger, MatMenu, MatMenuItem } from '@angular/material/menu';
import { MatIconButton, MatButton } from '@angular/material/button';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'send-text-dialog',
  templateUrl: './send-text-dialog.component.html',
  styleUrls: ['./send-text-dialog.component.scss'],
  standalone: true,
  imports: [
    FormsModule,
    MatDialogTitle,
    MatIconButton,
    MatMenuTrigger,
    MatIcon,
    MatMenu,
    MatMenuItem,
    MatTooltip,
    MatInput,
    MatDialogActions,
    MatButton,
    MatFormField,
  ],
})
export class SendTextDialogComponent {
  public title: string;
  public textToSend: string;
  public pasteSpeed: string;

  constructor(
    @Inject(MAT_DIALOG_DATA) data,
    public settingsService: ComnSettingsService,
    private dialogRef: MatDialogRef<SendTextDialogComponent>,
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
