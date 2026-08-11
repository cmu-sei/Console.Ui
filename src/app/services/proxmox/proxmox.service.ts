/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ChangeProxmoxVirtualMachineNetwork,
  MountProxmoxVirtualMachineIso,
  ProxmoxService as ApiProxmoxService,
  ProxmoxVirtualMachine,
} from '../../generated/vm-api';
import { IsoResult } from '../../models/vm/iso-result';
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

  // Cast to the hand-written IsoResult for the same reason VsphereService.getIsos does: the mount
  // dialog decorates each result with its own `hide`/`display` fields, which the generated model
  // does not carry.
  public getIsos(id: string): Observable<IsoResult[]> {
    return this.apiProxmoxService.getProxmoxVirtualMachineIsos(
      id,
    ) as unknown as Observable<IsoResult[]>;
  }

  // `iso` is the mountValue from getIsos - a Proxmox volume id. The API only accepts values it just
  // handed out for this Vm, so it must be passed through unmodified.
  public mountIso(id: string, iso: string): Observable<ProxmoxVirtualMachine> {
    const data: MountProxmoxVirtualMachineIso = { iso };
    return this.apiProxmoxService.mountProxmoxVirtualMachineIso(id, data);
  }

  public sendCtrlAltDel() {
    this.novncService.sendCtrlAltDel();
  }

  public sendClipboardText(text: string) {
    this.novncService.sendClipboardText(text);
  }
}
