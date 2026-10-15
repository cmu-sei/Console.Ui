// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect } from 'vitest';
import { UserStore } from './user.store';
import { UserQuery } from './user.query';
import { UserService } from './user.service';
import { recordEmissions } from '../../test-utils/record-emissions';

function createState() {
  const store = new UserStore();
  const query = new UserQuery(store);
  const service = new UserService(store);
  return { store, query, service };
}

describe('UserService', () => {
  /**
   * Verifies: add() stores the user and setActive() makes it the active user the follow page renders.
   * Interacts with: UserService.add/setActive over a real UserStore; UserQuery.selectActive.
   * Data: user 'u1' named 'Alice'.
   */
  it('adds a user and marks it active', () => {
    const { query, service } = createState();
    const active = recordEmissions(query.selectActive());

    service.add({ id: 'u1', name: 'Alice' });
    service.setActive('u1');

    expect(active).toEqual([undefined, { id: 'u1', name: 'Alice' }]);
  });

  /**
   * Verifies: update() changes the stored user and selectEntityNotNull emits the new value.
   * Interacts with: UserService.update; UserQuery.selectEntityNotNull.
   * Data: 'u1' renamed from 'Alice' to 'Alicia'.
   */
  it('updates a user', () => {
    const { query, service } = createState();
    service.add({ id: 'u1', name: 'Alice' });
    const seen = recordEmissions(query.selectEntityNotNull('u1'));

    service.update('u1', { name: 'Alicia' });

    expect(seen.map((u) => u.name)).toEqual(['Alice', 'Alicia']);
  });

  /**
   * Verifies: remove() deletes the user, clears it as active, and selectEntityNotNull does not emit the removal.
   * Interacts with: UserService.remove; UserQuery.selectEntityNotNull/getActiveId.
   * Data: active user 'u1' removed.
   */
  it('removes a user without emitting null to selectEntityNotNull', () => {
    const { query, service } = createState();
    service.add({ id: 'u1', name: 'Alice' });
    service.setActive('u1');
    const seen = recordEmissions(query.selectEntityNotNull('u1'));

    service.remove('u1');

    expect(seen).toHaveLength(1);
    expect(query.hasEntity('u1')).toBe(false);
    expect(query.getActiveId()).toBeNull();
  });

  /**
   * Verifies: adding a user id that already exists keeps the original (Akita add() does not upsert).
   * Interacts with: UserService.add twice with the same id; UserQuery.getEntity.
   * Data: 'u1' added as 'Alice', then again as 'Renamed'.
   */
  it('keeps the first copy when the same user is added again', () => {
    const { query, service } = createState();
    service.add({ id: 'u1', name: 'Alice' });
    service.add({ id: 'u1', name: 'Renamed' });
    expect(query.getEntity('u1')?.name).toBe('Alice');
  });
});
