// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Component, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { Vm, VmType, VsphereVirtualMachine } from '../../generated/vm-api';
import { VmService } from '../../state/vm/vm.service';
import { VsphereQuery } from '../../state/vsphere/vsphere.query';

@Component({
  selector: 'app-console',
  templateUrl: './console.component.html',
  styleUrls: ['./console.component.scss'],
})
export class ConsoleComponent {
  @Input() readOnly;

  @Input() set vmId(value: string) {
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

  constructor(
    private vsphereQuery: VsphereQuery,
    private vmService: VmService
  ) {}
}
