import { Injectable } from '@angular/core';
import { EntityState, EntityStore, StoreConfig } from '@datorama/akita';
import { Vm } from '../../generated/vm-api';

export interface VmState extends EntityState<Vm, string> {}

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'vm' })
export class VmStore extends EntityStore<VmState> {
  constructor() {
    super();
  }
}
