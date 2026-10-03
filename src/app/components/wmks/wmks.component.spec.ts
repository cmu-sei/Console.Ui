// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { screen } from '@testing-library/angular';
import { of, throwError } from 'rxjs';
import {
  VsphereService as ApiVsphereService,
  VsphereVirtualMachine,
} from '../../generated/vm-api';
import { VirtualMachineToolsStatus, VmResolution } from '../../models/vm/vm-model';
import { VmService } from '../../state/vm/vm.service';
import { VsphereService } from '../../state/vsphere/vsphere.service';
import { WmksComponent } from './wmks.component';
import { renderComponent } from '../../test-utils/render-component';
import { ApiStub } from '../../test-utils/api-stub';
import { unstubbed } from '../../test-utils/unstubbed';
import { FakeWmksLib, installFakeWmks, WMKS_CONST } from '../../test-utils/fake-wmks';

function vsphereVm(overrides: Partial<VsphereVirtualMachine> = {}): VsphereVirtualMachine {
  return { id: 'vm-1', name: 'Alpha', state: 'on', isOwner: true, ...overrides };
}

// The fake WMKS SDK; installed in beforeEach.
let wmksLib: FakeWmksLib;

async function renderWmks(
  options: { readOnly?: boolean; vm?: VsphereVirtualMachine } = {},
) {
  // The real VsphereService runs: it fetches the Vm, creates the WMKS client
  // and derives connected$/disconnected$. Only the vm-api endpoints it calls
  // are stubbed.
  const api = {
    getVsphereVirtualMachine: vi.fn((_id: string) => of(options.vm ?? vsphereVm())),
    getVsphereVirtualMachineToolsStatus: vi.fn(() => of(VirtualMachineToolsStatus.toolsOk)),
    powerOffVsphereVirtualMachine: vi.fn(() => of('poweroff submitted')),
  } satisfies ApiStub<ApiVsphereService>;
  const connect = vi.spyOn(VsphereService.prototype, 'connect');
  const disconnect = vi.spyOn(VsphereService.prototype, 'disconnect');

  const rendered = await renderComponent(WmksComponent, {
    inputs: { vmId: 'vm-1', ...('readOnly' in options ? { readOnly: options.readOnly } : {}) },
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ApiVsphereService, useValue: api },
      // VsphereService injects VmService but never calls it.
      unstubbed(VmService),
    ],
  });
  const vsphere = rendered.fixture.debugElement.injector.get(VsphereService);
  return { ...rendered, api, vsphere, connect, disconnect };
}

describe('WmksComponent', () => {
  beforeEach(() => {
    // The component and the service log every connection step.
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    wmksLib = installFakeWmks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Verifies: with no client yet, the component connects immediately using the read-only state it was given.
   * Interacts with: real VsphereService.connect (spied, calls through); the generated getVsphereVirtualMachine stub.
   * Data: vmId 'vm-1'; readOnly true.
   */
  it('connects straight away with the read-only state', async () => {
    const { connect, api } = await renderWmks({ readOnly: true });
    expect(connect).toHaveBeenCalledWith('vm-1', true);
    expect(api.getVsphereVirtualMachine).toHaveBeenCalledWith('vm-1');
  });

  /**
   * Verifies: until the read-only state is known, the component does not connect.
   * Interacts with: real VsphereService.connect; the generated getVsphereVirtualMachine stub.
   * Data: readOnly input never set.
   */
  it('waits for the read-only state before connecting', async () => {
    const { connect, api } = await renderWmks();
    expect(connect).not.toHaveBeenCalled();
    expect(api.getVsphereVirtualMachine).not.toHaveBeenCalled();
  });

  /**
   * Verifies: connection attempts repeat every 5 seconds until the WMKS client reports CONNECTED, and resume after it disconnects.
   * Interacts with: the component's interval/takeUntil/repeat timer; real VsphereService connected$/disconnected$; the fake WMKS client's state events; getVsphereVirtualMachine stub.
   * Data: readOnly false; no ticket for two attempts, then a ticket; CONNECTED, then DISCONNECTED.
   * Why: real timer logic, so fake timers drive the 5 second interval.
   */
  it('retries every 5 seconds until connected and again after a disconnect', async () => {
    vi.useFakeTimers();
    const { api } = await renderWmks({ readOnly: false, vm: vsphereVm() });
    expect(api.getVsphereVirtualMachine).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(api.getVsphereVirtualMachine).toHaveBeenCalledTimes(2);

    api.getVsphereVirtualMachine.mockReturnValue(of(vsphereVm({ ticket: 'ticket-1' })));
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.getVsphereVirtualMachine).toHaveBeenCalledTimes(3);
    const [client] = wmksLib.clients;
    expect(client.connect).toHaveBeenCalledWith('ticket-1');

    client.changeState(WMKS_CONST.ConnectionState.CONNECTED);
    await vi.advanceTimersByTimeAsync(10000);
    expect(api.getVsphereVirtualMachine).toHaveBeenCalledTimes(3);

    client.changeState(WMKS_CONST.ConnectionState.DISCONNECTED);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.getVsphereVirtualMachine).toHaveBeenCalledTimes(4);
  });

  /**
   * Verifies: an existing but disconnected client is reconnected; a connected one is resized to the container instead.
   * Interacts with: the fake WMKS client's getConnectionState/updateScreen; real VsphereService.connect and vmResolution.
   * Data: first fetch returns a ticket (client created, still DISCONNECTED); the client reports CONNECTED before the third check.
   */
  it('reconnects a dropped client and resizes a connected one', async () => {
    vi.useFakeTimers();
    const { fixture, api, vsphere } = await renderWmks({
      readOnly: false,
      vm: vsphereVm({ ticket: 'ticket-1' }),
    });
    const [client] = wmksLib.clients;
    api.getVsphereVirtualMachine.mockReturnValue(of(vsphereVm()));

    await vi.advanceTimersByTimeAsync(5000);
    expect(api.getVsphereVirtualMachine).toHaveBeenCalledTimes(2);

    client.connectionState = WMKS_CONST.ConnectionState.CONNECTED;
    const resolutions: VmResolution[] = [];
    vsphere.vmResolution.subscribe((r) => resolutions.push(r));
    await vi.advanceTimersByTimeAsync(5000);
    fixture.detectChanges();

    expect(api.getVsphereVirtualMachine).toHaveBeenCalledTimes(2);
    expect(client.updateScreen).toHaveBeenCalled();
    // jsdom has no layout, so the container measures 0x0.
    expect(resolutions.at(-1)).toEqual({ width: 0, height: 0 });
  });

  /**
   * Verifies: an unreachable API (HTTP status 0) never produces the "not reachable" message; the page keeps saying it is connecting.
   * Interacts with: getVsphereVirtualMachine stub failing; real VsphereService.connect error callback (model.state); the rendered progress heading.
   * Data: HttpErrorResponse status 0 'Unknown Error'; one retry tick.
   * Why: fake timers run the 5 second retry that re-reads model.state.
   */
  it('never explains an unreachable API', async () => {
    vi.useFakeTimers();
    const { fixture, api, vsphere } = await renderWmks({ readOnly: false });
    api.getVsphereVirtualMachine.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' })),
    );
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    fixture.detectChanges();

    expect(vsphere.model.state).toBe('Http failure response for (unknown url): 0 Unknown Error');
    expect(
      screen.queryByRole('heading', { name: 'The VM Console API is currently not reachable.' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Connecting/ })).toBeInTheDocument();
  });

  /**
   * Verifies: the Vm state VsphereService reports picks the placeholder icon over the console.
   * Interacts with: getVsphereVirtualMachine stub; real VsphereService show* flags; the rendered mat-icon.
   * Data: Vm state under test.
   * Why: MatIconHarness waits for the fixture to stabilise, which the component's 5 second connect interval never lets happen, and the icon is aria-hidden (mat-icon's default; its alt attribute does not apply), so no role query reaches it: it is read from the DOM.
   */
  it.each([
    ['off', 'ic_power_settings_new_black_48px'],
    ['error', 'ic_error_outline_black_48px'],
  ])("shows the placeholder icon for a Vm in state '%s'", async (state, icon) => {
    const { fixture, container } = await renderWmks({
      readOnly: false,
      vm: vsphereVm({ state }),
    });
    fixture.detectChanges();
    expect(container.querySelector('mat-icon')).toHaveAttribute('data-mat-icon-name', icon);
  });

  /**
   * Verifies: the lock placeholder renders when showLock is set.
   * Interacts with: real VsphereService.showLock; the rendered mat-icon (read from the DOM, as above).
   * Data: showLock set by the test (nothing in the app sets it to true today).
   */
  it('shows the lock icon when showLock is set', async () => {
    const { fixture, container, vsphere } = await renderWmks();
    vsphere.showLock = true;
    fixture.detectChanges();
    expect(container.querySelector('mat-icon')).toHaveAttribute(
      'data-mat-icon-name',
      'ic_lock_outline_black_48px',
    );
  });

  /**
   * Verifies: a submitted power-off shows the shutting-down message ahead of the powered-off icon.
   * Interacts with: real VsphereService.powerOff over the powerOffVsphereVirtualMachine stub; showPoweringOff and showPower.
   * Data: Vm state 'off' (showPower); power off answered 'poweroff submitted'.
   */
  it('shows the shutting-down message while powering off', async () => {
    const { fixture, vsphere } = await renderWmks({
      readOnly: false,
      vm: vsphereVm({ state: 'off' }),
    });
    vsphere.powerOff('vm-1');
    fixture.detectChanges();

    expect(vsphere.showPower).toBe(true);
    expect(
      screen.getByRole('heading', { name: 'Shutting Down... Please wait...' }),
    ).toBeInTheDocument();
  });

  /**
   * Verifies: switching Vms and leaving the page both tear the current console down.
   * Interacts with: the vmId input via rerender; ComponentFixture.destroy; real VsphereService.disconnect (spied).
   * Data: vmId 'vm-1' → 'vm-2', then destroy.
   */
  it('disconnects when the Vm changes and on destroy', async () => {
    const { fixture, disconnect, rerender } = await renderWmks({ readOnly: false });
    disconnect.mockClear();

    await rerender({ inputs: { vmId: 'vm-2' }, partialUpdate: true });
    expect(disconnect).toHaveBeenCalledTimes(1);

    fixture.destroy();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });
});
