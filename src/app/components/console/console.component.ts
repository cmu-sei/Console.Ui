// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Component, Input } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Vm, VmType, VsphereVirtualMachine } from '../../generated/vm-api';
import { VmService } from '../../state/vm/vm.service';
import { VsphereQuery } from '../../state/vsphere/vsphere.query';
import { AsyncPipe } from '@angular/common';
import { WmksComponent } from '../wmks/wmks.component';
import { OptionsBarComponent } from '../options-bar/options-bar.component';
import { ProxmoxConsoleComponent } from '../proxmox/proxmox-console/proxmox-console.component';
import { OptionsBar2Component } from '../options-bar2/options-bar2.component';

@Component({
  selector: 'app-console',
  templateUrl: './console.component.html',
  styleUrls: ['./console.component.scss'],
  standalone: true,
  imports: [
    OptionsBar2Component,
    ProxmoxConsoleComponent,
    OptionsBarComponent,
    WmksComponent,
    AsyncPipe,
  ],
})
export class ConsoleComponent {
  @Input({ required: true }) readOnly;

  @Input({ required: true }) set vmId(value: string) {
    this._vmId = value;
    this.vsphereVm$ = this.vsphereQuery.selectEntity(value);
    this.virtualMachine$ = this.vmService.get(value);
  }

  public get vmType(): typeof VmType {
    return VmType;
  }

  get vmId(): string {
    return this._vmId;
  }

  _vmId: string;

  vsphereVm$: Observable<VsphereVirtualMachine>;
  virtualMachine$: Observable<Vm>;

  readOnlyManual = false;

  get readOnlyInternal() {
    return this.readOnlyManual || this.readOnly;
  }

  constructor(
    private vsphereQuery: VsphereQuery,
    private vmService: VmService,
  ) {}

  onReadOnlyChanged(event: boolean) {
    this.readOnlyManual = event;
  }
}
