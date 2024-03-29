/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import { Injectable } from '@angular/core';
import {
  EntityState,
  EntityStore,
  StoreConfig,
  ActiveState,
} from '@datorama/akita';
import { VsphereVirtualMachine } from '../../generated/vm-api/model/vsphereVirtualMachine';

export interface VsphereState
  extends EntityState<VsphereVirtualMachine, string>,
    ActiveState<string> {}

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'vm' })
export class VmStore extends EntityStore<VsphereState> {
  constructor() {
    super();
  }
}
