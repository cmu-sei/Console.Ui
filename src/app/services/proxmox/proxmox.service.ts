/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ChangeProxmoxVirtualMachineNetwork,
  ProxmoxService as ApiProxmoxService,
  ProxmoxVirtualMachine,
} from '../../generated/vm-api';
import { NoVNCService } from '../novnc/novnc.service';

@Injectable({
  providedIn: 'root',
})
export class ProxmoxService {
  constructor(
    private novncService: NoVNCService,
    private apiProxmoxService: ApiProxmoxService,
  ) {}

  public getVm(id: string): Observable<ProxmoxVirtualMachine> {
    return this.apiProxmoxService.getProxmoxVirtualMachine(id);
  }

  public changeNic(
    id: string,
    adapter: string,
    network: string,
  ): Observable<ProxmoxVirtualMachine> {
    const data: ChangeProxmoxVirtualMachineNetwork = { adapter, network };
    return this.apiProxmoxService.changeProxmoxVirtualMachineNetwork(id, data);
  }

  public sendCtrlAltDel() {
    this.novncService.sendCtrlAltDel();
  }

  public sendClipboardText(text: string) {
    this.novncService.sendClipboardText(text);
  }
}
