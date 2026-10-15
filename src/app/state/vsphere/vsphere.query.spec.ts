// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect } from 'vitest';
import { getStoreByName } from '@datorama/akita';
import { VsphereVirtualMachine } from '../../generated/vm-api';
import { VmStore as VsphereStore } from './vsphere.store';
import { VsphereQuery } from './vsphere.query';
import { VmStore } from '../vm/vm.store';
import { recordEmissions } from '../../test-utils/record-emissions';

function vsphereVm(
  overrides: Partial<VsphereVirtualMachine> = {},
): VsphereVirtualMachine {
  return { id: 'vm-1', name: 'Alpha', state: 'on', ...overrides };
}

function createState() {
  const store = new VsphereStore();
  const query = new VsphereQuery(store);
  return { store, query };
}

describe('VsphereQuery', () => {
  /**
   * Verifies: selectEntityNotNull waits for the vSphere entity and then emits its updates.
   * Interacts with: real vsphere VmStore add/update; VsphereQuery.selectEntityNotNull.
   * Data: 'vm-1' added, then its state changed to 'off'.
   */
  it('emits the entity once it exists and on each update', () => {
    const { store, query } = createState();
    const seen = recordEmissions(query.selectEntityNotNull('vm-1'));

    store.add(vsphereVm());
    store.update('vm-1', { state: 'off' });

    expect(seen.map((v) => v.state)).toEqual(['on', 'off']);
  });

  /**
   * Verifies: the active id (what the user-follow page follows) is tracked by the store's ActiveState.
   * Interacts with: real vsphere VmStore.setActive; VsphereQuery.selectActiveId.
   * Data: active id starts unset, then 'vm-2', then null.
   */
  it('tracks the active Vm id', () => {
    const { store, query } = createState();
    const seen = recordEmissions(query.selectActiveId());

    store.setActive('vm-2');
    store.setActive(null);

    expect(seen).toEqual([undefined, 'vm-2', null]);
  });

  /**
   * Verifies: the vSphere store and the generic Vm store are separate instances that both register under the Akita name 'vm'.
   * Interacts with: both real VmStore classes; Akita's global store registry (getStoreByName).
   * Data: one store of each class, the vSphere one constructed last.
   */
  it('shares the "vm" store name with the generic Vm store', () => {
    const generic = new VmStore();
    const vsphere = new VsphereStore();

    generic.add({ id: 'generic-1' });
    vsphere.add({ id: 'vsphere-1' });

    expect(generic.storeName).toBe('vm');
    expect(vsphere.storeName).toBe('vm');
    expect(getStoreByName('vm')).toBe(vsphere);
    expect(generic.getValue().ids).toEqual(['generic-1']);
    expect(vsphere.getValue().ids).toEqual(['vsphere-1']);
  });
});
