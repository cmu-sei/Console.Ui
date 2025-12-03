// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Component, Inject, OnInit } from '@angular/core';
import {
  MatBottomSheetRef,
  MAT_BOTTOM_SHEET_DATA,
} from '@angular/material/bottom-sheet';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';

@Component({
    selector: 'app-system-message',
    templateUrl: './system-message.component.html',
    styleUrls: ['./system-message.component.scss'],
    imports: [MatIconButton, MatIcon]
})
export class SystemMessageComponent implements OnInit {
  public displayTitle: string;
  public displayMessage: string;

  constructor(
    public messageSheet: MatBottomSheetRef<SystemMessageComponent>,
    @Inject(MAT_BOTTOM_SHEET_DATA) public data: any,
  ) {
    this.displayTitle = data.title;
    this.displayMessage = data.message;
  }

  ngOnInit() {}

  close() {
    this.messageSheet.dismiss();
  }
}
