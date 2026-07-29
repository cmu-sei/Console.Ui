/*
Copyright 2021 Carnegie Mellon University. All Rights Reserved. 
 Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
*/

import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  ProxmoxService as ApiProxmoxService,
  Vm,
  VmsService,
  VmType,
  VsphereService as ApiVsphereService,
} from '../../generated/vm-api';
import { ProxmoxService } from '../../services/proxmox/proxmox.service';
import { VmQuery } from './vm.query';
import { VmStore } from './vm.store';
import { Params, Router } from '@angular/router';

export type PowerAction = 'powerOn' | 'powerOff' | 'reboot' | 'shutdown';

@Injectable({ providedIn: 'root' })
export class VmService {
  constructor(
    private vmStore: VmStore,
    private vmsService: VmsService,
    private vmQuery: VmQuery,
    private proxmoxService: ProxmoxService,
    private apiProxmoxService: ApiProxmoxService,
    private apiVsphereService: ApiVsphereService,
    private router: Router,
  ) {}

  get(id: string) {
    return this.vmsService.getVm(id).pipe(
      tap((vm: Vm) => {
        this.vmStore.upsert(id, vm);
      }),
    );
  }

  add(vm: Vm) {
    this.vmStore.add(vm);
  }

  update(id, vm: Partial<Vm>) {
    this.vmStore.update(id, vm);
  }

  remove(id: string) {
    this.vmStore.remove(id);
  }

  sendCtrlAltDel(id: string) {
    const vm = this.vmQuery.getEntity(id);

    switch (vm.type) {
      case VmType.Proxmox:
        this.proxmoxService.sendCtrlAltDel();
        break;
    }
  }

  async sendClipboardText(id: string) {
    const vm = this.vmQuery.getEntity(id);

    const text = await navigator.clipboard.readText();

    switch (vm.type) {
      case VmType.Proxmox:
        this.proxmoxService.sendClipboardText(text);
        break;
    }
  }

  /**
   * Dispatches a power action to the API for whichever provider backs this vm. The per-vm endpoints
   * are used rather than the bulk ones since the console only ever acts on a single vm.
   */
  powerAction(id: string, action: PowerAction): Observable<string> {
    const vm = this.vmQuery.getEntity(id);

    switch (vm?.type) {
      case VmType.Proxmox:
        return this.proxmoxPowerAction(id, action);
      case VmType.Vsphere:
        return this.vspherePowerAction(id, action);
      default:
        return throwError(
          () =>
            new Error(
              `Power operations are not supported for this virtual machine.`,
            ),
        );
    }
  }

  private proxmoxPowerAction(
    id: string,
    action: PowerAction,
  ): Observable<string> {
    switch (action) {
      case 'powerOn':
        return this.apiProxmoxService.powerOnProxmoxVirtualMachine(id);
      case 'powerOff':
        return this.apiProxmoxService.powerOffProxmoxVirtualMachine(id);
      case 'reboot':
        return this.apiProxmoxService.rebootProxmoxVirtualMachine(id);
      case 'shutdown':
        return this.apiProxmoxService.shutdownProxmoxVirtualMachine(id);
    }
  }

  private vspherePowerAction(
    id: string,
    action: PowerAction,
  ): Observable<string> {
    switch (action) {
      case 'powerOn':
        return this.apiVsphereService.powerOnVsphereVirtualMachine(id);
      case 'powerOff':
        return this.apiVsphereService.powerOffVsphereVirtualMachine(id);
      case 'reboot':
        return this.apiVsphereService.rebootVsphereVirtualMachine(id);
      case 'shutdown':
        return this.apiVsphereService.shutdownVsphereVirtualMachine(id);
    }
  }

  setReadOnly(value: boolean) {
    const queryParams: Params = { readOnly: value };

    this.router.navigate([], {
      //relativeTo: this.activatedRoute,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
