// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatIconHarness } from '@angular/material/icon/testing';
import { NEVER, Observable, of, throwError } from 'rxjs';
import {
  PowerState,
  ProxmoxConsole,
  ProxmoxService as ApiProxmoxService,
  Vm,
  VmType,
} from '../../../generated/vm-api';
import { ProxmoxConsoleComponent } from './proxmox-console.component';
import { NovncComponent } from '../../novnc/novnc.component';
import { renderComponent } from '../../../test-utils/render-component';
import { ApiStub } from '../../../test-utils/api-stub';

@Component({ selector: 'app-novnc', template: '' })
class NovncStubComponent {
  @Input() url: string;
  @Input() ticket: string;
  @Input() readOnly: boolean;
  @Output() reconnect = new EventEmitter<number>();
}

const VM: Vm = { id: 'vm-1', name: 'Alpha', type: VmType.Proxmox };

async function renderProxmoxConsole(
  consoles: () => Observable<ProxmoxConsole>,
  inputs: { readOnly?: boolean } = {},
) {
  const api = {
    getProxmoxConsole: vi.fn(consoles),
  } satisfies ApiStub<ApiProxmoxService>;
  const rendered = await renderComponent(ProxmoxConsoleComponent, {
    childStubs: [{ replace: NovncComponent, with: NovncStubComponent }],
    inputs: { vm: VM, readOnly: inputs.readOnly ?? false },
    providers: [{ provide: ApiProxmoxService, useValue: api }],
  });
  const novnc = () =>
    rendered.fixture.debugElement.query(By.directive(NovncStubComponent))
      ?.componentInstance as NovncStubComponent | undefined;
  const iconName = async () => {
    const icons = await TestbedHarnessEnvironment.loader(rendered.fixture).getAllHarnesses(
      MatIconHarness,
    );
    return icons.length ? icons[0].getName() : null;
  };
  return { ...rendered, api, novnc, iconName };
}

describe('ProxmoxConsoleComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Verifies: a console with a ticket is handed to noVNC with the read-only state, and polling stops.
   * Interacts with: generated ProxmoxService.getProxmoxConsole stub; the app-novnc stub.
   * Data: running Vm; url 'wss://pve/ws', ticket 't-1'; readOnly true.
   * Why: fake timers drive the 5 second poll so "no further requests" can be asserted.
   */
  it('connects noVNC with the ticket and stops polling', async () => {
    vi.useFakeTimers();
    const { fixture, api, novnc } = await renderProxmoxConsole(
      () => of({ url: 'wss://pve/ws', ticket: 't-1', powerState: PowerState.On }),
      { readOnly: true },
    );
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    expect(novnc()?.url).toBe('wss://pve/ws');
    expect(novnc()?.ticket).toBe('t-1');
    expect(novnc()?.readOnly).toBe(true);

    await vi.advanceTimersByTimeAsync(20000);
    expect(api.getProxmoxConsole).toHaveBeenCalledOnce();
  });

  /**
   * Verifies: a powered-off or suspended Vm shows the power icon and keeps polling every 5 seconds.
   * Interacts with: getProxmoxConsole stub; MatIconHarness.
   * Data: powerState Off without a ticket, then Suspended.
   */
  it('shows the power icon and keeps polling while the Vm is off', async () => {
    vi.useFakeTimers();
    const { fixture, api, novnc, iconName } = await renderProxmoxConsole(() =>
      of({ powerState: PowerState.Off }),
    );
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    expect(await iconName()).toBe('ic_power_settings_new_black_48px');
    expect(novnc()).toBeUndefined();

    api.getProxmoxConsole.mockReturnValue(of({ powerState: PowerState.Suspended }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.getProxmoxConsole).toHaveBeenCalledTimes(2);
    expect(await iconName()).toBe('ic_power_settings_new_black_48px');
  });

  /**
   * Verifies: an API failure shows the error icon and polling continues until a console is available.
   * Interacts with: getProxmoxConsole stub (error, then a ticket); MatIconHarness; the app-novnc stub.
   * Data: first request fails; the next returns ticket 't-1'.
   */
  it('shows the error icon and retries after a failure', async () => {
    vi.useFakeTimers();
    const { fixture, api, novnc, iconName } = await renderProxmoxConsole(() =>
      throwError(() => new Error('nope')),
    );
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(await iconName()).toBe('ic_error_outline_black_48px');

    api.getProxmoxConsole.mockReturnValue(of({ url: 'wss://pve/ws', ticket: 't-1' }));
    await vi.advanceTimersByTimeAsync(5000);
    fixture.detectChanges();

    expect(novnc()?.ticket).toBe('t-1');
  });

  /**
   * Verifies: ticks are skipped while a console request is still in flight.
   * Interacts with: getProxmoxConsole stub returning an observable that never emits (exhaustMap).
   * Data: 20 seconds of polling with the first request outstanding.
   */
  it('does not pile up requests while one is in flight', async () => {
    vi.useFakeTimers();
    // NEVER stands in for a request that hasn't returned.
    const { api } = await renderProxmoxConsole(() => NEVER);
    await vi.advanceTimersByTimeAsync(20000);
    expect(api.getProxmoxConsole).toHaveBeenCalledOnce();
  });

  /**
   * Verifies: a noVNC reconnect request restarts polling after an exponential delay capped at 10 seconds.
   * Interacts with: the app-novnc stub's reconnect output; getProxmoxConsole stub.
   * Data: reconnect attempts 1 (4s delay) and 3 (capped at 10s).
   */
  it('backs off before fetching a new console after a disconnect', async () => {
    vi.useFakeTimers();
    const { fixture, api, novnc } = await renderProxmoxConsole(() =>
      of({ url: 'wss://pve/ws', ticket: 't-1' }),
    );
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(api.getProxmoxConsole).toHaveBeenCalledTimes(1);

    novnc()!.reconnect.emit(1);
    await vi.advanceTimersByTimeAsync(3999);
    expect(api.getProxmoxConsole).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.getProxmoxConsole).toHaveBeenCalledTimes(2);

    fixture.detectChanges();
    novnc()!.reconnect.emit(3);
    await vi.advanceTimersByTimeAsync(9999);
    expect(api.getProxmoxConsole).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.getProxmoxConsole).toHaveBeenCalledTimes(3);
  });

  /**
   * Verifies: destroying the component stops polling.
   * Interacts with: ComponentFixture.destroy; getProxmoxConsole stub.
   * Data: Vm off (polling), then destroyed.
   */
  it('stops polling when destroyed', async () => {
    vi.useFakeTimers();
    const { fixture, api } = await renderProxmoxConsole(() => of({ powerState: PowerState.Off }));
    await vi.advanceTimersByTimeAsync(0);

    fixture.destroy();
    await vi.advanceTimersByTimeAsync(20000);

    expect(api.getProxmoxConsole).toHaveBeenCalledOnce();
  });
});
