// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Component, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { VsphereVirtualMachine } from '../../generated/vm-api';
import { VmQuery } from '../../state/vm/vm.query';

@Component({
  selector: 'app-console',
  templateUrl: './console.component.html',
  styleUrls: ['./console.component.scss'],
})
export class ConsoleComponent {
  @Input() readOnly = false;

  @Input() set vmId(value: string) {
    this._vmId = value;
    this.vm$ = this.vmQuery.selectEntity(value);
  }

  get vmId(): string {
    return this._vmId;
  }

  _vmId: string;

  vm$: Observable<VsphereVirtualMachine>;

  constructor(private vmQuery: VmQuery) {}
}
