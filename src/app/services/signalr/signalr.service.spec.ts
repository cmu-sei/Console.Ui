// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { ActivatedRoute } from '@angular/router';
import { ComnAuthService, ComnSettingsService } from '@cmusei/crucible-common';
import {
  BASE_PATH,
  VmUser,
  VmsService,
  VsphereService as ApiVsphereService,
} from '../../generated/vm-api';
import { VmService } from '../../state/vm/vm.service';
import { UserQuery } from '../../state/user/user.query';
import { VsphereQuery } from '../../state/vsphere/vsphere.query';
import { SignalRService } from './signalr.service';
import {
  FakeHubConnection,
  mockHubConnectionBuilder,
  MockHubConnectionBuilderOptions,
  rejectInvokes,
} from '../../test-utils/fake-hub-connection';
import { unstubbed } from '../../test-utils/unstubbed';
import { activatedRouteStub } from '../../test-utils/activated-route';
import {
  captureUnhandledRejections,
  flush,
} from '../../test-utils/unhandled-rx-errors';
import { recordEmissions } from '../../test-utils/record-emissions';
import { TEST_BASE_PATH } from '../../test-utils/default-test-providers';

type AuthStub = Pick<ComnAuthService, 'user$' | 'getAuthorizationToken'>;

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
      { provide: ComnAuthService, useValue: auth },
      { provide: BASE_PATH, useValue: TEST_BASE_PATH },
      // The real VsphereService and UserService run, so hub events land in
      // their real stores. These are only their unrelated edges.
      provideHttpClient(),
      provideHttpClientTesting(),
      unstubbed(ApiVsphereService, 'VsphereService (generated vm-api)'),
      unstubbed(ComnSettingsService),
      unstubbed(VmService),
      // The real UserPermissionsService behind VsphereService: its readOnly$
      // stays silent until load(), which nothing here calls, so these are
      // placeholders for its edges.
      unstubbed(VmsService),
      { provide: ActivatedRoute, useValue: activatedRouteStub().route },
    ],
  });

  const service = TestBed.inject(SignalRService);
  return {
    service,
    hub,
    user$,
    userQuery: TestBed.inject(UserQuery),
    vsphereQuery: TestBed.inject(VsphereQuery),
    connection: (): FakeHubConnection => hub.connections[0],
  };
}

const ALICE: VmUser = {
  userId: 'u1',
  username: 'Alice',
  activeVmId: 'vm-7',
  lastVmId: 'vm-6',
};

// joinUser() builds the connection synchronously and invokes 'JoinUser' once
// start() resolves, so the hub's reply can be seeded right after the call.
function follow(ctx: ReturnType<typeof setup>, vmUser: VmUser = ALICE) {
  const joined = ctx.service.joinUser('u1', 'view-1', 'team-1');
  // joinGroups() also invokes 'JoinUser' once start() resolves, so answer
  // every JoinUser call rather than only the first.
  ctx
    .connection()
    .invoke.mockImplementation((method: string) =>
      Promise.resolve(method === 'JoinUser' ? vmUser : undefined),
    );
  return joined;
}

async function connected(vmId = 'vm-1') {
  const ctx = setup();
  ctx.service.joinVm(vmId);
  await flush();
  const connection = ctx.connection();
  connection.invoke.mockClear();
  return { ...ctx, connection };
}

describe('SignalRService', () => {
  describe('startConnection()', () => {
    /**
     * Verifies: the first call builds one /hubs/vm connection whose token factory returns the user's access token, and starts it.
     * Interacts with: mocked HubConnectionBuilder (withUrl/withAutomaticReconnect/build); ComnAuthService.getAuthorizationToken stub.
     * Data: BASE_PATH 'https://vm-api.test'; token 'token-1'.
     */
    it('builds and starts a single /hubs/vm connection', async () => {
      const { service, hub } = setup();

      await service.startConnection();

      expect(hub.connections).toHaveLength(1);
      expect(hub.connections[0].start).toHaveBeenCalledOnce();
      const [url, options] = hub.withUrl.mock.calls[0] as [
        string,
        signalR.IHttpConnectionOptions,
      ];
      expect(url).toBe(`${TEST_BASE_PATH}/hubs/vm`);
      expect(options.accessTokenFactory?.()).toBe('token-1');
    });

    /**
     * Verifies: repeated calls reuse the in-flight connection rather than opening another.
     * Interacts with: mocked HubConnectionBuilder.build; the memoized connection promise.
     * Data: three startConnection() calls.
     */
    it('reuses the connection on later calls', async () => {
      const { service, hub } = setup();
      const first = service.startConnection();
      expect(service.startConnection()).toBe(first);
      await service.startConnection();
      expect(hub.connections).toHaveLength(1);
    });

    /**
     * Verifies: the reconnect policy backs off exponentially to a 60 second cap and adds up to 5 seconds of jitter.
     * Interacts with: the RetryPolicy handed to withAutomaticReconnect; Math.random.
     * Data: retry counts 0, 1, 4, 10 with no jitter; retry 0 with maximum jitter.
     */
    it('backs off exponentially with jitter, capped at 60 seconds', async () => {
      const { service, hub } = setup();
      await service.startConnection();
      const policy = hub.retryPolicy()!;
      const delay = (previousRetryCount: number) =>
        policy.nextRetryDelayInMilliseconds({
          previousRetryCount,
          elapsedMilliseconds: 0,
          retryReason: new Error('lost'),
        });

      vi.spyOn(Math, 'random').mockReturnValue(0);
      expect([0, 1, 4, 10].map(delay)).toEqual([2000, 4000, 32000, 60000]);

      vi.spyOn(Math, 'random').mockReturnValue(0.999);
      expect(delay(0)).toBe(7000);
    });

    /**
     * Verifies: a start() that rejects is cached, so later hub calls never retry; only an auth renewal starts the connection again.
     * Interacts with: FakeHubConnection.start (rejects once via onBuild); joinVm(); ComnAuthService.user$ Subject; captureUnhandledRejections.
     * Data: start() rejects with 'negotiation failed'; joinVm('vm-1') then joinVm('vm-2'); then user$ emits once.
     */
    it('never retries a failed start until the signed-in user is renewed', async () => {
      const rejections = captureUnhandledRejections();
      const failure = new Error('negotiation failed');
      const ctx = setup({
        onBuild: (c) => c.start.mockRejectedValueOnce(failure),
      });

      ctx.service.joinVm('vm-1');
      await flush();
      ctx.service.joinVm('vm-2');
      await flush();

      await expect(ctx.service.startConnection()).rejects.toBe(failure);
      expect(ctx.hub.connections).toHaveLength(1);
      expect(ctx.connection().start).toHaveBeenCalledOnce();
      expect(ctx.connection().invoke).not.toHaveBeenCalled();
      // The joinGroups() chain and both joinVm() calls reject unhandled; see
      // 'lets a failed hub promise in %s escape unhandled' below.
      expect(rejections).toEqual([failure, failure, failure]);

      // Only a renewed sign-in stops and restarts the connection.
      ctx.user$.next({});
      await flush();
      expect(ctx.connection().start).toHaveBeenCalledTimes(2);
      expect(ctx.connection().invoke).toHaveBeenCalledWith('JoinVm', 'vm-2');
    });
  });

  describe('unhandled hub failures', () => {
    // Arms the failure, triggers the step, and returns a reader for the hub
    // methods invoked afterwards (they run a microtask later, once
    // startConnection() resolves).
    type Arm = (failure: Error) => Promise<() => string[]>;

    const failedStart: Arm = async (failure) => {
      const ctx = setup({
        onBuild: (c) => c.start.mockRejectedValueOnce(failure),
      });
      await ctx.service.startConnection().catch(() => undefined);
      return () => ctx.connection().invoke.mock.calls.map(([m]) => m);
    };
    const failedRestart: Arm = async (failure) => {
      const { connection, user$ } = await connected();
      connection.start.mockRejectedValueOnce(failure);
      user$.next({});
      return () => connection.invoke.mock.calls.map(([m]) => m);
    };
    const failedInvoke =
      (act: (service: SignalRService) => void): Arm =>
      async (failure) => {
        const { service, connection } = await connected();
        const calls = rejectInvokes(connection, failure);
        act(service);
        return () => calls.map(([m]) => m);
      };

    /**
     * Verifies: every hub promise the service drops without a .catch turns a hub failure into an unhandled rejection (current behavior).
     * Interacts with: mockHubConnectionBuilder (start() rejecting via onBuild or after connecting); rejectInvokes; captureUnhandledRejections.
     * Data: the method in the row; a connection joined to 'vm-1' for the invoke rows; failure 'hub down'.
     */
    it.each<[string, string[], Arm]>([
      ['startConnection()', [], failedStart],
      ['reconnect()', [], failedRestart],
      ['leaveUser()', ['LeaveUser'], failedInvoke((s) => s.leaveUser('u1', 'view-1'))],
      ['joinVm()', ['JoinVm'], failedInvoke((s) => s.joinVm('vm-2'))],
      ['leaveVm()', ['LeaveVm'], failedInvoke((s) => s.leaveVm('vm-1'))],
      [
        'setActiveVirtualMachine()',
        ['SetActiveVirtualMachine'],
        failedInvoke((s) => s.setActiveVirtualMachine('vm-1')),
      ],
      [
        'unsetActiveVirtualMachine()',
        ['UnsetActiveVirtualMachine'],
        failedInvoke((s) => s.unsetActiveVirtualMachine()),
      ],
    ])('lets a failed hub promise in %s escape unhandled', async (_method, invokes, arm) => {
      const rejections = captureUnhandledRejections();
      const failure = new Error('hub down');

      const invoked = await arm(failure);
      await flush();

      expect(invoked()).toEqual(invokes);
      expect(rejections).toEqual([failure]);
    });
  });

  describe('joinUser()', () => {
    /**
     * Verifies: following a user joins their hub group and seeds the user and their active Vm into the stores.
     * Interacts with: FakeHubConnection.invoke ('JoinUser' result); real UserStore/UserQuery; real vSphere store/VsphereQuery.
     * Data: user 'u1' ('Alice') in view 'view-1', team 'team-1', currently on 'vm-7'.
     */
    it('joins the user group and stores the followed user and their active Vm', async () => {
      const ctx = setup();
      const { userQuery, vsphereQuery, hub } = ctx;

      expect(await follow(ctx)).toBe(ALICE);
      expect(hub.connections[0].invoke).toHaveBeenCalledWith(
        'JoinUser',
        'u1',
        'view-1',
        'team-1',
      );
      expect(userQuery.getActive()).toEqual({ id: 'u1', name: 'Alice' });
      expect(vsphereQuery.getActiveId()).toBe('vm-7');
    });

    /**
     * Verifies: leaveUser() invokes 'LeaveUser' and stops rejoining that user after a reconnect.
     * Interacts with: FakeHubConnection.invoke and its onreconnected callbacks.
     * Data: user 'u1' in view 'view-1'.
     */
    it('leaves the user group and forgets it for reconnects', async () => {
      const ctx = setup();
      const { service, connection } = ctx;
      await follow(ctx);
      connection().invoke.mockClear();

      service.leaveUser('u1', 'view-1');
      await flush();
      expect(connection().invoke).toHaveBeenCalledWith('LeaveUser', 'u1', 'view-1');

      connection().invoke.mockClear();
      connection().reconnectedCallbacks.forEach((cb) => cb());
      expect(connection().invoke).not.toHaveBeenCalledWith(
        'JoinUser',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('hub events', () => {
    /**
     * Verifies: an 'ActiveVirtualMachine' push moves the followed user's active Vm in the vSphere store.
     * Interacts with: FakeHubConnection.trigger; real VsphereQuery.selectActiveId.
     * Data: pushes 'vm-2' then null (the user left every console).
     */
    it('tracks the followed user switching Vms', async () => {
      const { connection, vsphereQuery } = await connected();
      const active = recordEmissions(vsphereQuery.selectActiveId());

      connection.trigger('ActiveVirtualMachine', 'vm-2');
      connection.trigger('ActiveVirtualMachine', null);

      expect(active).toEqual([undefined, 'vm-2', null]);
    });

    /**
     * Verifies: an ungrouped 'CurrentVirtualMachineUsers' push for the joined Vm replaces the user list.
     * Interacts with: FakeHubConnection.trigger; currentVmUsers$.
     * Data: Vm 'vm-1'; users ['alice', 'bob'].
     */
    it('publishes the users on the joined Vm', async () => {
      const { service, connection } = await connected();
      connection.trigger('CurrentVirtualMachineUsers', 'vm-1', ['alice', 'bob']);
      expect(service.currentVmUsers$.getValue()).toEqual(['alice', 'bob']);
    });

    /**
     * Verifies: user lists for other Vms are ignored.
     * Interacts with: FakeHubConnection.trigger; currentVmUsers$.
     * Data: joined 'vm-1'; push for 'vm-9'.
     */
    it('ignores user lists for other Vms', async () => {
      const { service, connection } = await connected();
      connection.trigger('CurrentVirtualMachineUsers', 'vm-9', ['mallory']);
      expect(service.currentVmUsers$.getValue()).toEqual([]);
    });

    /**
     * Verifies: per-group user lists are merged into one de-duplicated list, and a group's update replaces only that group.
     * Interacts with: FakeHubConnection.trigger with a groupId; currentVmUsers$.
     * Data: group 'team-a' [alice, bob], group 'team-b' [bob, carol], then 'team-a' [dave].
     */
    it('merges scoped presence groups without duplicates', async () => {
      const { service, connection } = await connected();

      connection.trigger('CurrentVirtualMachineUsers', 'vm-1', ['alice', 'bob'], 'team-a');
      connection.trigger('CurrentVirtualMachineUsers', 'vm-1', ['bob', 'carol'], 'team-b');
      expect(service.currentVmUsers$.getValue()).toEqual(['alice', 'bob', 'carol']);

      connection.trigger('CurrentVirtualMachineUsers', 'vm-1', ['dave'], 'team-a');
      expect(service.currentVmUsers$.getValue()).toEqual(['dave', 'bob', 'carol']);
    });

    /**
     * Verifies: an ungrouped list discards earlier per-group lists, and a null list counts as empty.
     * Interacts with: FakeHubConnection.trigger; currentVmUsers$.
     * Data: group 'team-a' [alice]; ungrouped [zed]; group 'team-b' null.
     */
    it('resets groups on an ungrouped list and treats null as empty', async () => {
      const { service, connection } = await connected();

      connection.trigger('CurrentVirtualMachineUsers', 'vm-1', ['alice'], 'team-a');
      connection.trigger('CurrentVirtualMachineUsers', 'vm-1', ['zed']);
      expect(service.currentVmUsers$.getValue()).toEqual(['zed']);

      connection.trigger('CurrentVirtualMachineUsers', 'vm-1', null, 'team-b');
      expect(service.currentVmUsers$.getValue()).toEqual([]);
    });
  });

  describe('Vm groups', () => {
    /**
     * Verifies: joinVm() clears the previous Vm's users and invokes 'JoinVm' once connected.
     * Interacts with: FakeHubConnection.invoke; currentVmUsers$.
     * Data: users present for 'vm-1'; join 'vm-2'.
     */
    it('joins a Vm group and clears the previous user list', async () => {
      const { service, connection } = await connected();
      connection.trigger('CurrentVirtualMachineUsers', 'vm-1', ['alice']);
      const users = recordEmissions(service.currentVmUsers$);

      service.joinVm('vm-2');
      await flush();

      expect(users).toEqual([['alice'], []]);
      expect(connection.invoke).toHaveBeenCalledWith('JoinVm', 'vm-2');
    });

    /**
     * Verifies: leaveVm() invokes 'LeaveVm', clears users, and ignores later lists for the Vm it left.
     * Interacts with: FakeHubConnection.invoke/trigger; currentVmUsers$.
     * Data: left 'vm-1'; a late push for 'vm-1'.
     */
    it('leaves a Vm group and ignores late user lists for it', async () => {
      const { service, connection } = await connected();
      connection.trigger('CurrentVirtualMachineUsers', 'vm-1', ['alice']);

      service.leaveVm('vm-1');
      await flush();
      connection.trigger('CurrentVirtualMachineUsers', 'vm-1', ['late']);

      expect(connection.invoke).toHaveBeenCalledWith('LeaveVm', 'vm-1');
      expect(service.currentVmUsers$.getValue()).toEqual([]);
    });

    /**
     * Verifies: setting and unsetting the active Vm invoke the matching hub methods.
     * Interacts with: FakeHubConnection.invoke.
     * Data: active Vm 'vm-1'.
     */
    it('sets and unsets the active Vm', async () => {
      const { service, connection } = await connected();

      service.setActiveVirtualMachine('vm-1');
      service.unsetActiveVirtualMachine();
      await flush();

      expect(connection.invoke).toHaveBeenCalledWith('SetActiveVirtualMachine', 'vm-1');
      expect(connection.invoke).toHaveBeenCalledWith('UnsetActiveVirtualMachine');
    });
  });

  describe('reconnects', () => {
    /**
     * Verifies: while SignalR is reconnecting the user list is cleared, since it is no longer current.
     * Interacts with: FakeHubConnection onreconnecting callbacks; currentVmUsers$.
     * Data: users ['alice'] on 'vm-1'.
     */
    it('clears the user list while reconnecting', async () => {
      const { service, connection } = await connected();
      connection.trigger('CurrentVirtualMachineUsers', 'vm-1', ['alice']);

      connection.reconnectingCallbacks.forEach((cb) => cb());

      expect(service.currentVmUsers$.getValue()).toEqual([]);
    });

    /**
     * Verifies: after an automatic reconnect every remembered group is rejoined.
     * Interacts with: FakeHubConnection onreconnected callbacks and invoke.
     * Data: following 'u1'/'view-1'/'team-1', joined 'vm-1', active 'vm-1'.
     */
    it('rejoins the user, Vm and active Vm after reconnecting', async () => {
      const ctx = setup();
      const { service, connection } = ctx;
      await follow(ctx);
      service.joinVm('vm-1');
      service.setActiveVirtualMachine('vm-1');
      await flush();
      connection().invoke.mockClear();

      connection().reconnectedCallbacks.forEach((cb) => cb());
      await flush();

      expect(connection().invoke).toHaveBeenCalledWith('JoinUser', 'u1', 'view-1', 'team-1');
      expect(connection().invoke).toHaveBeenCalledWith('JoinVm', 'vm-1');
      expect(connection().invoke).toHaveBeenCalledWith('SetActiveVirtualMachine', 'vm-1');
    });

    /**
     * Verifies: a renewed auth user restarts the connection and rejoins its groups.
     * Interacts with: ComnAuthService.user$ Subject; FakeHubConnection stop/start/invoke.
     * Data: joined 'vm-1'; user$ emits once.
     */
    it('restarts the connection when the signed-in user is renewed', async () => {
      const { connection, user$ } = await connected();

      user$.next({});
      await flush();

      expect(connection.stop).toHaveBeenCalledOnce();
      expect(connection.start).toHaveBeenCalledTimes(2);
      expect(connection.invoke).toHaveBeenCalledWith('JoinVm', 'vm-1');
    });

    /**
     * Verifies: an auth renewal before any connection exists does nothing.
     * Interacts with: ComnAuthService.user$ Subject; mocked HubConnectionBuilder.
     * Data: no connection started; user$ emits once.
     */
    it('ignores an auth renewal before connecting', async () => {
      const { user$, hub } = setup();
      user$.next({});
      await flush();
      expect(hub.connections).toHaveLength(0);
    });
  });
});
