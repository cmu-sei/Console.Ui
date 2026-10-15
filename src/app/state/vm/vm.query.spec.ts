// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { applyTransaction } from '@datorama/akita';
import { Vm, VmType } from '../../generated/vm-api';
import { VmStore } from './vm.store';
import { VmQuery } from './vm.query';
import { recordEmissions } from '../../test-utils/record-emissions';

function vm(overrides: Partial<Vm> = {}): Vm {
  return { id: 'vm-1', name: 'Alpha', type: VmType.Vsphere, ...overrides };
}

// A pure store/query pair: no TestBed, a fresh store per test.
function createState() {
  const store = new VmStore();
  const query = new VmQuery(store);
  return { store, query };
}

describe('VmQuery', () => {
  /**
   * Verifies: the real store feeds its query, and the store registers under its configured Akita name.
   * Interacts with: real VmStore and VmQuery.
   * Data: one Vm entity 'vm-1'.
   */
  it('reads a seeded entity and is registered as the "vm" store', () => {
    const { store, query } = createState();
    store.set([vm()]);
    expect(query.getEntity('vm-1')?.name).toBe('Alpha');
    expect(store.storeName).toBe('vm');
  });

  describe('selectEntityNotNull()', () => {
    /**
     * Verifies: selectEntityNotNull stays silent while the entity is missing and emits once it is added.
     * Interacts with: real VmStore.add; VmQuery.selectEntityNotNull.
     * Data: subscribe before 'vm-1' exists, then add it.
     */
    it('waits for the entity to exist before emitting', () => {
      const { store, query } = createState();
      const seen = recordEmissions(query.selectEntityNotNull('vm-1'));
      expect(seen).toEqual([]);

      store.add(vm());

      expect(seen).toEqual([vm()]);
    });

    /**
     * Verifies: selectEntityNotNull emits each update to the entity and suppresses the removal.
     * Interacts with: real VmStore.update/remove; VmQuery.selectEntityNotNull.
     * Data: 'vm-1' renamed to 'Beta', then removed.
     */
    it('emits updates and filters out the removal', () => {
      const { store, query } = createState();
      store.add(vm());
      const seen = recordEmissions(query.selectEntityNotNull('vm-1'));

      store.update('vm-1', { name: 'Beta' });
      store.remove('vm-1');

      expect(seen.map((v) => v.name)).toEqual(['Alpha', 'Beta']);
    });

    /**
     * Verifies: changes to other entities do not re-emit the selected one.
     * Interacts with: real VmStore.add/update; VmQuery.selectEntityNotNull (distinctUntilChanged).
     * Data: 'vm-1' selected; 'vm-2' added and updated.
     */
    it('ignores changes to other entities', () => {
      const { store, query } = createState();
      store.add(vm());
      const seen = recordEmissions(query.selectEntityNotNull('vm-1'));

      store.add(vm({ id: 'vm-2', name: 'Other' }));
      store.update('vm-2', { name: 'Other 2' });

      expect(seen).toHaveLength(1);
    });
  });

  /**
   * Verifies: selectAll reflects the store sequence and an applyTransaction batch emits once.
   * Interacts with: real VmStore; VmQuery.selectAll; Akita applyTransaction.
   * Data: two adds inside one transaction.
   */
  it('emits a transaction as a single change', async () => {
    const { store, query } = createState();
    const seen = recordEmissions(query.selectAll());

    applyTransaction(() => {
      store.add(vm());
      store.add(vm({ id: 'vm-2', name: 'Beta' }));
    });

    expect(seen.map((list) => list.map((v) => v.id))).toEqual([
      [],
      ['vm-1', 'vm-2'],
    ]);
    expect(await firstValueFrom(query.selectCount())).toBe(2);
  });
});
