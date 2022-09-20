/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import { Injectable } from '@angular/core';
import RFB from '../../../../node_modules/@novnc/novnc/core/rfb.js';

@Injectable({
  providedIn: 'root',
})
export class NoVNCService {
  private rfb: RFB;

  constructor() {}

  startClient(
    url: string,
    ticket: string,
    elementId: string,
    readOnly: boolean,
    backgroundColor: string
  ) {
    // Creating a new RFB object will start a new connection
    this.rfb = new RFB(document.getElementById(elementId), url, {
      credentials: {
        password: ticket,
      },
    });

    this.rfb.background = backgroundColor;
    this.rfb.viewOnly = readOnly;
    this.rfb.scaleViewport = true;
  }

  public setViewOnly(viewOnly: boolean) {
    if (this.rfb) {
      this.rfb.viewOnly = viewOnly;
    }
  }

  public setConnectListener(func: Function) {
    this.rfb.addEventListener('connect', func);
  }

  public setDisconnectListener(func: Function) {
    this.rfb.addEventListener('disconnect', func);
  }

  public setSecurityFailureListener(func: Function) {
    this.rfb.addEventListener('securityfailure', func);
  }

  public sendCtrlAltDel() {
    this.rfb.sendCtrlAltDel();
  }
}
