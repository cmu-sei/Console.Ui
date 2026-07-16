// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { A11yModule } from '@angular/cdk/a11y';
import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';
import { MatFormField } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import {
  ComnSettingsService,
  CRUCIBLE_DIALOG_IMPORTS,
} from '@cmusei/crucible-common';

export interface SendTextDialogResult {
  textToSend: string;
  timeout: string | undefined;
}

@Component({
  selector: 'send-text-dialog',
  templateUrl: './send-text-dialog.component.html',
  styleUrls: ['./send-text-dialog.component.scss'],
  imports: [
    ...CRUCIBLE_DIALOG_IMPORTS,
    A11yModule,
    ReactiveFormsModule,
    MatIconButton,
    MatMenuTrigger,
    MatIcon,
    MatMenu,
    MatMenuItem,
    MatTooltip,
    MatInput,
    MatFormField,
  ],
})
export class SendTextDialogComponent {
  public title: string;
  public readonly form;

  constructor(
    public settingsService: ComnSettingsService,
    private dialogRef: MatDialogRef<
      SendTextDialogComponent,
      SendTextDialogResult
    >,
    formBuilder: FormBuilder,
  ) {
    this.form = formBuilder.group({
      textToSend: formBuilder.nonNullable.control(''),
      pasteSpeed: formBuilder.control<string | undefined>(undefined),
    });
  }

  setPasteSpeed(speed: string) {
    this.form.controls.pasteSpeed.setValue(speed);
  }

  send() {
    const { textToSend, pasteSpeed } = this.form.getRawValue();
    this.dialogRef.close({ textToSend, timeout: pasteSpeed });
  }
}
