/*
Copyright 2021 Carnegie Mellon University. All Rights Reserved. 
 Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
*/

import { Injectable } from '@angular/core';
import { tap } from 'rxjs/operators';
import { Vm, VmsService } from '../../generated/vm-api';
import { ProxmoxService } from '../../services/proxmox/proxmox.service';
import { VmQuery } from './vm.query';
import { VmStore } from './vm.store';
import { Params, Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class VmService {
  constructor(
    private vmStore: VmStore,
    private vmsService: VmsService,
    private vmQuery: VmQuery,
    private proxmoxService: ProxmoxService,
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
      case 'Proxmox':
        this.proxmoxService.sendCtrlAltDel();
        break;
    }
  }

  async sendClipboardText(id: string) {
    console.log('sendClipboardText called for VM:', id);
    const vm = this.vmQuery.getEntity(id);

    try {
      const text = await navigator.clipboard.readText();
      console.log('Read text from clipboard:', text);

      switch (vm.type) {
        case 'Proxmox':
          this.proxmoxService.sendClipboardText(text);
          break;
      }
    } catch (error) {
      console.error('Paste to VM failed:', error);
    }
  }

  async copyClipboardFromVm(id: string) {
    console.log('copyClipboardFromVm called for VM:', id);
    const vm = this.vmQuery.getEntity(id);

    try {
      switch (vm.type) {
        case 'Proxmox':
          await this.proxmoxService.copyClipboardFromVm();
          console.log('Copy from VM completed');
          break;
      }
    } catch (error) {
      console.error('Copy from VM failed:', error);
    }
  }

  powerOn(id: string) {
    this.vmsService.bulkPowerOn({ ids: [id] }).subscribe();
  }

  powerOff(id: string) {
    this.vmsService.bulkPowerOff({ ids: [id] }).subscribe();
  }

  reboot(id: string) {
    this.vmsService.bulkReboot({ ids: [id] }).subscribe();
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
