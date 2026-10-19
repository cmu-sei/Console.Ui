/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import { Injectable, inject } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { VsphereVirtualMachine } from '../../generated/vm-api';
import { VmStore, VsphereState } from './vsphere.store';

@Injectable({ providedIn: 'root' })
export class VsphereQuery extends QueryEntity<VsphereState> {
  protected store: VmStore;

  constructor() {
    const store = inject(VmStore);

    super(store);

    this.store = store;
  }

  public selectEntityNotNull(id: string): Observable<VsphereVirtualMachine> {
    return super.selectEntity(id).pipe(filter((vm) => vm != null));
  }
}
