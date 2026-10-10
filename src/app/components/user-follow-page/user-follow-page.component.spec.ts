// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { Component, Input } from '@angular/core';
import { By } from '@angular/platform-browser';
import { screen } from '@testing-library/angular';
import { RouterQuery } from '@datorama/akita-ng-router-store';
import { VmUser } from '../../generated/vm-api';
import { SignalRService } from '../../services/signalr/signalr.service';
import { UserStore } from '../../state/user/user.store';
import { VmStore as VsphereStore } from '../../state/vsphere/vsphere.store';
import { UserFollowPageComponent } from './user-follow-page.component';
import { ConsoleComponent } from '../console/console.component';
import { renderComponent } from '../../test-utils/render-component';
import {
  captureUnhandledRejections,
  captureUnhandledRxErrors,
  flush,
} from '../../test-utils/unhandled-rx-errors';

@Component({ selector: 'app-console', template: '' })
class ConsoleStubComponent {
  @Input() readOnly: boolean;
  @Input() allowReadOnlyToggle: boolean;
  @Input() vmId: string;
}

const PARAMS: Record<string, string> = { userId: 'u1', viewId: 'view-1' };

type HubStub = Pick<SignalRService, 'startConnection' | 'joinUser' | 'leaveUser'>;

async function renderFollowPage(
  vmUser: VmUser = { userId: 'u1', lastVmId: 'vm-last' },
  hub: Partial<HubStub> = {},
) {
  const signalr = {
    startConnection: vi.fn(() => Promise.resolve()),
    joinUser: vi.fn(() => Promise.resolve(vmUser)),
    leaveUser: vi.fn(),
    ...hub,
  } satisfies HubStub;
  const routerQuery = {
    getParams: ((key: string) => PARAMS[key]) as RouterQuery['getParams'],
    getQueryParams: ((key: string) => (key === 'teamId' ? 'team-1' : null)) as RouterQuery['getQueryParams'],
  } satisfies Pick<RouterQuery, 'getParams' | 'getQueryParams'>;

  const rendered = await renderComponent(UserFollowPageComponent, {
    childStubs: [{ replace: ConsoleComponent, with: ConsoleStubComponent }],
    providers: [
      { provide: SignalRService, useValue: signalr },
      { provide: RouterQuery, useValue: routerQuery },
    ],
  });
  await flush();

  // The real stores behind UserQuery and VsphereQuery; SignalRService fills them in the app.
  const injector = rendered.fixture.debugElement.injector;
  const users = injector.get(UserStore);
  const vms = injector.get(VsphereStore);
  const followAlice = () => {
    users.add({ id: 'u1', name: 'Alice' });
    users.setActive('u1');
  };
  const consoleStub = () =>
    rendered.fixture.debugElement.query(By.directive(ConsoleStubComponent))
      ?.componentInstance as ConsoleStubComponent | undefined;

  return { ...rendered, signalr, users, vms, followAlice, consoleStub };
}

describe('UserFollowPageComponent', () => {
  /**
   * Verifies: the page joins the followed user's SignalR group with the route's user, view and team.
   * Interacts with: RouterQuery stub; SignalRService stub.
   * Data: route user 'u1', view 'view-1', ?teamId=team-1.
   */
  it('joins the followed user from the route', async () => {
    const { signalr } = await renderFollowPage();
    expect(signalr.joinUser).toHaveBeenCalledWith('u1', 'view-1', 'team-1');
    expect(document.title).toBe('Following...');
  });

  /**
   * Verifies: "Loading..." shows until the followed user is in the store.
   * Interacts with: real UserStore/UserQuery.
   * Data: empty user store.
   */
  it('shows Loading... until the user is known', async () => {
    await renderFollowPage();
    expect(screen.getByRole('heading', { name: 'Loading...' })).toBeInTheDocument();
  });

  /**
   * Verifies: the followed user's active Vm is shown read-only with no toggle, whatever the follower's own permissions.
   * Interacts with: real UserStore and vSphere store (active ids); the app-console stub's inputs.
   * Data: user 'Alice' active on 'vm-7'.
   */
  it('shows the followed Vm read-only without the toggle', async () => {
    const { fixture, followAlice, vms, consoleStub } = await renderFollowPage();
    followAlice();
    vms.setActive('vm-7');
    fixture.detectChanges();

    expect(screen.getByRole('heading', { name: /Following Alice/ })).toBeInTheDocument();
    expect(consoleStub()?.vmId).toBe('vm-7');
    expect(consoleStub()?.readOnly).toBe(true);
    expect(consoleStub()?.allowReadOnlyToggle).toBe(false);
    expect(document.title).toBe('Alice - Following');
  });

  /**
   * Verifies: when the user has no active Vm the page keeps showing their last one and marks them inactive.
   * Interacts with: vSphere store active id cleared; VmUser.lastVmId from joinUser; isActive$ (debounced 100ms).
   * Data: lastVmId 'vm-last'; no active Vm.
   */
  it('falls back to the last Vm and marks the user inactive', async () => {
    const { fixture, followAlice, consoleStub } = await renderFollowPage();
    followAlice();
    fixture.detectChanges();

    expect(await screen.findByRole('heading', { name: 'Following Alice (inactive)' })).toBeInTheDocument();
    expect(consoleStub()?.vmId).toBe('vm-last');
  });

  /**
   * Verifies: a user with no current or previous Vm gets an explanatory message instead of a console.
   * Interacts with: VmUser without lastVmId; real stores.
   * Data: Alice with no active Vm and no lastVmId.
   */
  it('says when the user is not viewing a Vm', async () => {
    const { fixture, followAlice, consoleStub } = await renderFollowPage({ userId: 'u1' });
    followAlice();
    fixture.detectChanges();

    expect(
      screen.getByRole('heading', { name: 'Alice is not currently viewing a virtual machine' }),
    ).toBeInTheDocument();
    expect(consoleStub()).toBeUndefined();
  });

  /**
   * Verifies: leaving the page leaves the followed user's group.
   * Interacts with: ComponentFixture.destroy; SignalRService.leaveUser stub.
   * Data: route user 'u1', view 'view-1'.
   */
  it('leaves the user group on destroy', async () => {
    const { fixture, signalr } = await renderFollowPage();
    fixture.destroy();
    await flush();
    expect(signalr.leaveUser).toHaveBeenCalledWith('u1', 'view-1');
  });

  // Plain functions, not vi.fn: a vi.fn marks the rejections it returns as handled.
  const failOnCall =
    (failure: Error, failing: number): HubStub['startConnection'] =>
    () => {
      failing--;
      return failing === 0 ? Promise.reject(failure) : Promise.resolve();
    };

  /**
   * Verifies: each hub promise the page drops without a .catch turns a hub failure into an unhandled rejection (current behavior).
   * Interacts with: the SignalRService stub (start or join rejecting); ComponentFixture.destroy; captureUnhandledRxErrors (failures inside the Angular zone, which the fixture rethrows from NgZone.onError) and captureUnhandledRejections (the destroy, run from the test body).
   * Data: the failing call named in the row rejects with 'hub down'.
   */
  it.each<[string, (failure: Error) => Partial<HubStub>, boolean]>([
    ['startConnection() in ngOnInit', (f) => ({ startConnection: failOnCall(f, 1) }), false],
    ['joinUser() in ngOnInit', (f) => ({ joinUser: () => Promise.reject(f) }), false],
    ['startConnection() in leaveUser()', (f) => ({ startConnection: failOnCall(f, 2) }), true],
  ])('lets a failed %s escape unhandled', async (_call, hub, destroy) => {
    const failure = new Error('hub down');
    const rxErrors = captureUnhandledRxErrors();
    const rejections = captureUnhandledRejections();
    const { fixture } = await renderFollowPage(undefined, hub(failure));
    if (destroy) {
      fixture.destroy();
    }
    await flush();

    expect(rxErrors).toEqual(destroy ? [] : [failure]);
    expect(rejections).toEqual(destroy ? [failure] : []);
  });
});
