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
    const vm = this.vmQuery.getEntity(id);

    const text = await navigator.clipboard.readText();

    switch (vm.type) {
      case 'Proxmox':
        this.proxmoxService.sendClipboardText(text);
        break;
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
