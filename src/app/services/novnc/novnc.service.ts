/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import { Injectable } from '@angular/core';
import RFB from '@novnc/novnc/lib/rfb.js';

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
    backgroundColor: string,
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
    // Enable receiving clipboard from VM (but not automatic paste)
    this.rfb.clipboardDown = true;
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

  public setClipboardListener(func: Function) {
    this.rfb.addEventListener('clipboard', func);
  }

  public sendCtrlAltDel() {
    this.rfb.sendCtrlAltDel();
  }

  public sendClipboardText(text: string) {
    console.log('NoVNCService.sendClipboardText - text:', text, 'rfb:', this.rfb);
    if (this.rfb) {
      this.rfb.clipboardPasteFrom(text);
      console.log('Called rfb.clipboardPasteFrom');
    } else {
      console.error('RFB not initialized');
    }
  }

  public getClipboardText(): string | null {
    // The clipboard data is received via the clipboard event listener
    // We need to store the last received clipboard data
    return this.lastClipboardText;
  }

  private lastClipboardText: string | null = null;

  public storeClipboardText(text: string) {
    this.lastClipboardText = text;
  }
}
