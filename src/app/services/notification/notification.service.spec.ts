// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { ComnAuthService } from '@cmusei/crucible-common';
import { BASE_PATH } from '../../generated/vm-api';
import { NotificationData } from '../../models/notification/notification-model';
import { NotificationService } from './notification.service';
import {
  mockHubConnectionBuilder,
  MockHubConnectionBuilderOptions,
  rejectInvokes,
} from '../../test-utils/fake-hub-connection';
import {
  captureUnhandledRejections,
  flush,
} from '../../test-utils/unhandled-rx-errors';
import { recordEmissions } from '../../test-utils/record-emissions';
import { TEST_BASE_PATH } from '../../test-utils/default-test-providers';

type AuthStub = Pick<ComnAuthService, 'user$' | 'getAuthorizationToken'>;

// The service calls start() synchronously right after build(), so a failing
// start() or invoke() is seeded from the builder's onBuild hook.
function setup(hubOptions: MockHubConnectionBuilderOptions = {}) {
  const hub = mockHubConnectionBuilder(hubOptions);
  // A Subject so tests can simulate a token renewal; it never emits on its own.
  const user$ = new Subject<unknown>();
  const auth: AuthStub = {
    user$: user$ as AuthStub['user$'],
    getAuthorizationToken: () => 'token-1',
  };

  TestBed.configureTestingModule({
    providers: [
      NotificationService,
      { provide: ComnAuthService, useValue: auth },
      { provide: BASE_PATH, useValue: TEST_BASE_PATH },
    ],
  });

  return { service: TestBed.inject(NotificationService), hub, user$ };
}

const START_FAILED_MESSAGE =
  'Error while establishing Progress connection with the VM Console API.';

function task(overrides: Partial<NotificationData> = {}): NotificationData {
  return {
    taskId: 't1',
    taskName: 'Mount ISO',
    taskType: 'Iso',
    broadcastTime: '2026-01-01T00:00:00Z',
    progress: '50',
    state: 'running',
    ...overrides,
  };
}

describe('NotificationService', () => {
  beforeEach(() => {
    // The service logs connection lifecycle to the console; keep test output clean.
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  describe('connectToProgressHub()', () => {
    /**
     * Verifies: connecting builds one /hubs/progress connection authenticated with the user's token and joins the Vm's group once started.
     * Interacts with: mocked HubConnectionBuilder; FakeHubConnection start/invoke; ComnAuthService.getAuthorizationToken stub.
     * Data: Vm 'vm-1'; token 'token-1'.
     */
    it('builds a /hubs/progress connection and joins the Vm group', async () => {
      const { service, hub } = setup();

      await service.connectToProgressHub('vm-1');
      await flush();

      expect(hub.connections).toHaveLength(1);
      const [url, options] = hub.withUrl.mock.calls[0] as [
        string,
        signalR.IHttpConnectionOptions,
      ];
      expect(url).toBe(`${TEST_BASE_PATH}/hubs/progress`);
      expect(options.accessTokenFactory?.()).toBe('token-1');
      expect(hub.connections[0].invoke).toHaveBeenCalledWith('Join', 'vm-1');
    });

    /**
     * Verifies: a second call reuses the existing connection instead of building another.
     * Interacts with: mocked HubConnectionBuilder.build; the memoized connection promise.
     * Data: two calls for 'vm-1'.
     */
    it('reuses the connection on later calls', async () => {
      const { service, hub } = setup();
      const first = service.connectToProgressHub('vm-1');
      expect(service.connectToProgressHub('vm-1')).toBe(first);
      expect(hub.connections).toHaveLength(1);
    });

    /**
     * Verifies: no group is joined when there is no Vm id.
     * Interacts with: FakeHubConnection.invoke.
     * Data: connectToProgressHub(undefined), as OptionsBarComponent does before its vmId input is bound.
     */
    it('does not join a group without a Vm id', async () => {
      const { service, hub } = setup();
      await service.connectToProgressHub(undefined);
      await flush();
      expect(hub.connections[0].invoke).not.toHaveBeenCalled();
    });

    /**
     * Verifies: hub task updates are republished on tasksInProgress.
     * Interacts with: FakeHubConnection.trigger; tasksInProgress BehaviorSubject.
     * Data: one task pushed with the event under test.
     */
    it.each(['Progress', 'Complete'])(
      "publishes '%s' task lists on tasksInProgress",
      async (event) => {
        const { service, hub } = setup();
        await service.connectToProgressHub('vm-1');
        const seen = recordEmissions(service.tasksInProgress);

        hub.connections[0].trigger(event, [task({ state: event })]);

        expect(seen).toEqual([[], [task({ state: event })]]);
      },
    );

    /**
     * Verifies: when the hub can't start, the failure is logged and the returned promise rejects.
     * Interacts with: FakeHubConnection.start rejecting (onBuild); console.log spy; captureUnhandledRejections.
     * Data: start() rejects with 'refused'.
     */
    it('logs a failed start and rejects the returned promise', async () => {
      const rejections = captureUnhandledRejections();
      const refused = new Error('refused');
      const { service } = setup({
        onBuild: (c) => c.start.mockRejectedValueOnce(refused),
      });

      await expect(service.connectToProgressHub('vm-1')).rejects.toBe(refused);
      await flush();

      expect(vi.mocked(console.log)).toHaveBeenCalledWith(START_FAILED_MESSAGE);
      // The rethrow is pinned in 'lets the rethrow in connectToProgressHub()
      // escape as an unhandled rejection' below.
      expect(rejections).toEqual([new Error(START_FAILED_MESSAGE)]);
    });

    const escapes: Array<[string, (failure: Error) => Promise<unknown>]> = [
      [
        'the rethrow in connectToProgressHub()',
        async (failure) => {
          const { service } = setup({
            onBuild: (c) => c.start.mockRejectedValueOnce(failure),
          });
          await service.connectToProgressHub('vm-1').catch(() => undefined);
          return new Error(START_FAILED_MESSAGE);
        },
      ],
      [
        "a failed 'Join' in joinGroups()",
        async (failure) => {
          const { service } = setup({
            onBuild: (c) => rejectInvokes(c, failure),
          });
          await service.connectToProgressHub('vm-1');
          return failure;
        },
      ],
      [
        'a failed restart in reconnect()',
        async (failure) => {
          const { service, hub, user$ } = setup();
          await service.connectToProgressHub('vm-1');
          hub.connections[0].start.mockRejectedValueOnce(failure);
          user$.next({});
          return failure;
        },
      ],
    ];

    /**
     * Verifies: each hub promise the service drops without a .catch turns a hub failure into an unhandled rejection (current behavior).
     * Interacts with: mockHubConnectionBuilder (start() rejecting, or rejectInvokes); ComnAuthService.user$ Subject; captureUnhandledRejections.
     * Data: the failing step named in the row; failure 'hub down'.
     */
    it.each(escapes)('lets %s escape as an unhandled rejection', async (_step, run) => {
      const rejections = captureUnhandledRejections();
      const failure = new Error('hub down');

      const expected = await run(failure);
      await flush();

      expect(rejections).toEqual([expected]);
    });
  });

  describe('reconnect on auth renewal', () => {
    /**
     * Verifies: a renewed signed-in user restarts the progress connection and rejoins the Vm group.
     * Interacts with: ComnAuthService.user$ Subject; FakeHubConnection stop/start/invoke.
     * Data: connected for 'vm-1'; user$ emits once.
     */
    it('restarts and rejoins when the user is renewed', async () => {
      const { service, hub, user$ } = setup();
      await service.connectToProgressHub('vm-1');
      await flush();
      const [connection] = hub.connections;
      connection.invoke.mockClear();

      user$.next({});
      await flush();

      expect(connection.stop).toHaveBeenCalledOnce();
      expect(connection.start).toHaveBeenCalledTimes(2);
      expect(connection.invoke).toHaveBeenCalledWith('Join', 'vm-1');
    });

    /**
     * Verifies: a renewal before any connection exists does nothing.
     * Interacts with: ComnAuthService.user$ Subject; mocked HubConnectionBuilder.
     * Data: no connection; user$ emits once.
     */
    it('ignores a renewal before connecting', async () => {
      const { hub, user$ } = setup();
      user$.next({});
      await flush();
      expect(hub.connections).toHaveLength(0);
    });
  });
});
