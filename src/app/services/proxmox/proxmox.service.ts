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
}
