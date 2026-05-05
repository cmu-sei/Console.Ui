/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import { Injectable } from '@angular/core';
import { NoVNCService } from '../novnc/novnc.service';

@Injectable({
  providedIn: 'root',
})
export class ProxmoxService {
  constructor(private novncService: NoVNCService) {}

  public sendCtrlAltDel() {
    this.novncService.sendCtrlAltDel();
  }

  public sendClipboardText(text: string) {
    console.log('ProxmoxService.sendClipboardText:', text);
    this.novncService.sendClipboardText(text);
  }

  public async copyClipboardFromVm() {
    console.log('ProxmoxService.copyClipboardFromVm called');
    const text = this.novncService.getClipboardText();
    console.log('Got text from VM clipboard:', text);
    if (text) {
      await navigator.clipboard.writeText(text);
      console.log('Wrote to browser clipboard');
    } else {
      console.log('No clipboard text available from VM');
    }
  }
}
