// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect } from 'vitest';
import { User } from './user.model';
import { UserStore } from './user.store';
import { UserQuery } from './user.query';
import { recordEmissions } from '../../test-utils/record-emissions';

function user(overrides: Partial<User> = {}): User {
  return { id: 'u1', name: 'Alice', ...overrides };
}

// A pure store/query pair: no TestBed, a fresh store per test.
function createState() {
  const store = new UserStore();
  const query = new UserQuery(store);
  return { store, query };
}

describe('UserQuery', () => {
  /**
   * Verifies: the real store feeds its query, and the store registers under its configured Akita name.
   * Interacts with: real UserStore and UserQuery.
   * Data: one User entity 'u1'.
   */
  it('reads a seeded user and is registered as the "user" store', () => {
    const { store, query } = createState();
    store.set([user()]);
    expect(query.getEntity('u1')?.name).toBe('Alice');
    expect(store.storeName).toBe('user');
  });

  /**
   * Verifies: selectActive emits the user the follow page marks active, and undefined before any is active.
   * Interacts with: real UserStore.add/setActive; UserQuery.selectActive.
   * Data: users 'u1' and 'u2'; 'u2' made active.
   */
  it('selects the active user', () => {
    const { store, query } = createState();
    store.add([user(), user({ id: 'u2', name: 'Bob' })]);
    const active = recordEmissions(query.selectActive());

    store.setActive('u2');

    expect(active).toEqual([undefined, { id: 'u2', name: 'Bob' }]);
  });

  describe('selectEntityNotNull()', () => {
    /**
     * Verifies: selectEntityNotNull stays silent while the user is missing and emits once it is added.
     * Interacts with: real UserStore.add; UserQuery.selectEntityNotNull.
     * Data: subscribe before 'u1' exists, then add it.
     */
    it('waits for the user to exist before emitting', () => {
      const { store, query } = createState();
      const seen = recordEmissions(query.selectEntityNotNull('u1'));
      expect(seen).toEqual([]);

      store.add(user());

      expect(seen).toEqual([user()]);
    });

    /**
     * Verifies: selectEntityNotNull emits each update to the user and suppresses the removal.
     * Interacts with: real UserStore.update/remove; UserQuery.selectEntityNotNull.
     * Data: 'u1' renamed to 'Alicia', then removed.
     */
    it('emits updates and filters out the removal', () => {
      const { store, query } = createState();
      store.add(user());
      const seen = recordEmissions(query.selectEntityNotNull('u1'));

      store.update('u1', { name: 'Alicia' });
      store.remove('u1');

      expect(seen.map((u) => u.name)).toEqual(['Alice', 'Alicia']);
    });

    /**
     * Verifies: changes to other users do not re-emit the selected one.
     * Interacts with: real UserStore.add/update; UserQuery.selectEntityNotNull (distinctUntilChanged).
     * Data: 'u1' selected; 'u2' added and updated.
     */
    it('ignores changes to other users', () => {
      const { store, query } = createState();
      store.add(user());
      const seen = recordEmissions(query.selectEntityNotNull('u1'));

      store.add(user({ id: 'u2', name: 'Bob' }));
      store.update('u2', { name: 'Robert' });

      expect(seen).toEqual([user()]);
    });

    /**
     * Verifies: a user removed and added again is emitted again after the suppressed removal.
     * Interacts with: real UserStore.remove/add; UserQuery.selectEntityNotNull.
     * Data: 'u1' removed, then re-added as 'Alice again'.
     */
    it('emits the user again when it is re-added after a removal', () => {
      const { store, query } = createState();
      store.add(user());
      const seen = recordEmissions(query.selectEntityNotNull('u1'));

      store.remove('u1');
      store.add(user({ name: 'Alice again' }));

      expect(seen.map((u) => u.name)).toEqual(['Alice', 'Alice again']);
    });
  });
});
