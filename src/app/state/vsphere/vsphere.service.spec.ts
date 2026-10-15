// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, Params } from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
import { ComnSettingsService } from '@cmusei/crucible-common';
import {
  AppSystemPermission,
  AppTeamPermission,
  AppViewPermission,
  BASE_PATH,
  VsphereService as ApiVsphereService,
  VsphereVirtualMachine,
} from '../../generated/vm-api';
import { VirtualMachineToolsStatus } from '../../models/vm/vm-model';
import { VmService } from '../vm/vm.service';
import { VsphereService } from './vsphere.service';
import { VsphereQuery } from './vsphere.query';
import { ApiStub } from '../../test-utils/api-stub';
import { recordEmissions } from '../../test-utils/record-emissions';
import { fileList } from '../../test-utils/file-list';
import {
  FakeWmksClient,
  installFakeWmks,
  WMKS_CONST,
} from '../../test-utils/fake-wmks';
import {
  captureUnhandledRxErrors,
  flush,
} from '../../test-utils/unhandled-rx-errors';
import { TEST_BASE_PATH } from '../../test-utils/default-test-providers';
import { activatedRouteStub } from '../../test-utils/activated-route';
import {
  PermissionGrants,
  permissionDataProviders,
} from '../../test-utils/mock-permission-data.service';
import { unstubbed } from '../../test-utils/unstubbed';

function vsphereVm(
  overrides: Partial<VsphereVirtualMachine> = {},
): VsphereVirtualMachine {
  return { id: 'vm-1', name: 'Alpha', state: 'on', isOwner: true, ...overrides };
}

// A Vm controller by default, so the readOnly query param decides read-only.
function setup(
  options: { grants?: PermissionGrants; queryParams?: Params } = {},
) {
  const route = activatedRouteStub(options.queryParams ?? {});
  const api = {
    getVsphereVirtualMachine: vi.fn((id: string) => of(vsphereVm({ id }))),
    getVsphereVirtualMachineToolsStatus: vi.fn(() =>
      of(VirtualMachineToolsStatus.toolsOk),
    ),
    powerOnVsphereVirtualMachine: vi.fn(() => of('poweron submitted')),
    powerOffVsphereVirtualMachine: vi.fn(() => of('poweroff submitted')),
    rebootVsphereVirtualMachine: vi.fn(() => of('reboot submitted')),
    shutdownVsphereVirtualMachine: vi.fn(() => of('shutdown submitted')),
    validateVsphereVirtualMachineCredentials: vi.fn(() => of(undefined)),
    getFileUrlVsphereVirtualMachine: vi.fn(() =>
      of({ url: 'https://files.test/x', fileName: 'x.txt' }),
    ),
    changeVsphereVirtualMachineNetwork: vi.fn(() => of(vsphereVm())),
    mountVsphereVirtualMachineIso: vi.fn(() => of(vsphereVm())),
    setVsphereVirtualMachineResolution: vi.fn(() => of(undefined)),
    revertToVsphereVirtualMachineSnapshot: vi.fn(() => of(undefined)),
    revertVsphereVirtualMachine: vi.fn(() => of(undefined)),
    getVsphereVirtualMachineSnapshots: vi.fn(() => of([{ id: 's1' }])),
    getVsphereVirtualMachineIsos: vi.fn(() => of([])),
  } satisfies ApiStub<ApiVsphereService>;

  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ApiVsphereService, useValue: api },
      {
        provide: ComnSettingsService,
        useValue: { settings: { WMKS: { RetryConnectionInterval: 7 } } },
      },
      // VsphereService injects VmService but never calls it.
      unstubbed(VmService),
      // The real UserPermissionsService decides read-only from the grants and
      // the route's readOnly query param.
      ...permissionDataProviders(
        options.grants ?? { view: [AppViewPermission.ControlViewVms] },
      ),
      { provide: ActivatedRoute, useValue: route.route },
      { provide: BASE_PATH, useValue: TEST_BASE_PATH },
    ],
  });

  return {
    service: TestBed.inject(VsphereService),
    query: TestBed.inject(VsphereQuery),
    http: TestBed.inject(HttpTestingController),
    api,
    setQueryParams: route.setQueryParams,
  };
}

// The canvas WMKS renders into. Present only while a console is connected.
function addMainCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.id = 'mainCanvas';
  canvas.style.pointerEvents = 'auto';
  canvas.tabIndex = 1;
  document.body.appendChild(canvas);
  onTestFinished(() => canvas.remove());
  return canvas;
}

describe('VsphereService', () => {
  beforeEach(() => {
    // The service logs every connection and power step; keep test output clean.
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('store', () => {
    /**
     * Verifies: getVm() upserts the API's vSphere Vm into the vSphere store so VsphereQuery emits it.
     * Interacts with: generated VsphereService.getVsphereVirtualMachine stub; real vSphere store and VsphereQuery.
     * Data: Vm 'vm-1'.
     */
    it('getVm() stores the fetched Vm', async () => {
      const { service, query, api } = setup();
      const seen = recordEmissions(query.selectEntityNotNull('vm-1'));

      await firstValueFrom(service.getVm('vm-1'));

      expect(api.getVsphereVirtualMachine).toHaveBeenCalledWith('vm-1');
      expect(seen).toEqual([vsphereVm()]);
    });

    /**
     * Verifies: checkForVmTools() writes the tools status into the stored entity.
     * Interacts with: getVsphereVirtualMachineToolsStatus stub; real store update; VsphereQuery.getEntity.
     * Data: stored 'vm-1'; API reports toolsOld.
     */
    it('checkForVmTools() records the tools status on the stored Vm', async () => {
      const { service, query, api } = setup();
      service.add(vsphereVm());
      api.getVsphereVirtualMachineToolsStatus.mockReturnValue(
        of(VirtualMachineToolsStatus.toolsOld),
      );

      await firstValueFrom(service.checkForVmTools('vm-1'));

      expect(query.getEntity('vm-1')?.vmToolsStatus).toBe('toolsOld');
    });

    /**
     * Verifies: add/update/remove/setActive write through to the vSphere store.
     * Interacts with: real vSphere store via VsphereService; VsphereQuery.
     * Data: 'vm-1' added, renamed, made active, removed.
     */
    it('writes add, update, setActive and remove through to the store', () => {
      const { service, query } = setup();

      service.add(vsphereVm());
      service.update('vm-1', { name: 'Beta' });
      service.setActive('vm-1');
      expect(query.getActive()?.name).toBe('Beta');

      service.remove('vm-1');
      expect(query.getCount()).toBe(0);
      expect(query.getActiveId()).toBeNull();
    });
  });

  describe('read-only canvas', () => {
    /**
     * Verifies: when a Vm controller picks read-only (?readOnly=true), the WMKS canvas stops taking pointer and keyboard input.
     * Interacts with: real UserPermissionsService.readOnly$ (subscribed in the constructor) over permissionDataProviders and the route stub; #mainCanvas.
     * Data: view ControlViewVms; canvas starting with pointer-events 'auto' and tabIndex 1; readOnly=true pushed to the route.
     */
    it('blocks input on the canvas when a controller turns read-only on', () => {
      const { setQueryParams } = setup();
      const canvas = addMainCanvas();

      setQueryParams({ readOnly: 'true' });

      expect(canvas.style.pointerEvents).toBe('none');
      expect(canvas.tabIndex).toBe(-1);
    });

    /**
     * Verifies: a user who can see but not control the Vm gets a blocked canvas whatever the URL says.
     * Interacts with: real UserPermissionsService gate (denied) over permissionDataProviders; #mainCanvas.
     * Data: system ViewVms, team ViewTeamVms, view ViewViewVms (no control permission); ?readOnly=false; canvas present before the service starts.
     */
    it('blocks input on the canvas for a user who cannot control the Vm', () => {
      const canvas = addMainCanvas();
      setup({
        grants: {
          system: [AppSystemPermission.ViewVms],
          team: [AppTeamPermission.ViewTeamVms],
          view: [AppViewPermission.ViewViewVms],
        },
        queryParams: { readOnly: 'false' },
      });

      expect(canvas.style.pointerEvents).toBe('none');
      expect(canvas.tabIndex).toBe(-1);
    });

    /**
     * Verifies: a Vm controller who has not chosen read-only keeps an interactive canvas.
     * Interacts with: real UserPermissionsService gate (allowed) over permissionDataProviders; #mainCanvas.
     * Data: view ControlViewVms; ?readOnly=false; canvas present before the service starts.
     */
    it('leaves the canvas interactive for a Vm controller', () => {
      const canvas = addMainCanvas();
      setup({ queryParams: { readOnly: 'false' } });

      expect(canvas.style.pointerEvents).toBe('auto');
      expect(canvas.tabIndex).toBe(1);
    });

    /**
     * Verifies: while read-only, attempts (e.g. by WMKS) to re-enable the canvas are reverted.
     * Interacts with: the MutationObserver setReadOnly installs; #mainCanvas style and tabindex.
     * Data: read-only canvas; style and tabindex reset to interactive values.
     * Why: flush() lets the MutationObserver callback run.
     */
    it('re-blocks the canvas if something re-enables it while read-only', async () => {
      const { setQueryParams } = setup();
      const canvas = addMainCanvas();
      setQueryParams({ readOnly: 'true' });

      canvas.style.pointerEvents = 'auto';
      canvas.tabIndex = 3;
      await flush();

      expect(canvas.style.pointerEvents).toBe('none');
      expect(canvas.tabIndex).toBe(-1);
    });

    /**
     * Verifies: leaving read-only restores the canvas's previous input settings and stops re-blocking it.
     * Interacts with: readOnly=true then no readOnly param on the route; the MutationObserver; #mainCanvas.
     * Data: view ControlViewVms; canvas pointer-events 'auto', tabIndex 1 before read-only.
     */
    it('restores the canvas when the controller turns read-only off', async () => {
      const { setQueryParams } = setup();
      const canvas = addMainCanvas();
      setQueryParams({ readOnly: 'true' });

      setQueryParams({});
      expect(canvas.style.pointerEvents).toBe('auto');
      expect(canvas.tabIndex).toBe(1);

      canvas.style.pointerEvents = 'visible';
      await flush();
      expect(canvas.style.pointerEvents).toBe('visible');
    });

    /**
     * Verifies: read-only changes before any console has rendered are a no-op rather than an error.
     * Interacts with: readOnly$ via the route stub; document.getElementById('mainCanvas') returning null.
     * Data: no canvas in the document; readOnly=true then removed.
     */
    it('ignores read-only changes when there is no canvas yet', () => {
      const { setQueryParams } = setup();
      expect(() => {
        setQueryParams({ readOnly: 'true' });
        setQueryParams({});
      }).not.toThrow();
    });

    /**
     * Verifies: an unrelated query-param change re-emits read-only, and lifting read-only afterwards leaves the canvas blocked.
     * Interacts with: real UserPermissionsService.readOnly$ (combineLatest over queryParamMap, no distinctUntilChanged); setReadOnly; #mainCanvas.
     * Data: view ControlViewVms; ?readOnly=true, then ?readOnly=true&theme=dark-theme (the theme toggle), then ?theme=dark-theme.
     */
    it('leaves the canvas blocked after a theme change re-applies read-only and it is then lifted', async () => {
      const { service, setQueryParams } = setup();
      const canvas = addMainCanvas();
      const setReadOnly = vi.spyOn(service, 'setReadOnly');

      setQueryParams({ readOnly: 'true' });
      setQueryParams({ readOnly: 'true', theme: 'dark-theme' });
      expect(setReadOnly.mock.calls).toEqual([[true], [true]]);

      setQueryParams({ theme: 'dark-theme' });
      expect(canvas.style.pointerEvents).toBe('none');
      expect(canvas.tabIndex).toBe(-1);

      canvas.style.pointerEvents = 'auto';
      await flush();
      expect(canvas.style.pointerEvents).toBe('none');
    });

    /**
     * Verifies: lifting read-only after the canvas has been destroyed throws.
     * Interacts with: setReadOnly(true) on a canvas, the canvas removed (as WMKS destroy() does), then setReadOnly(false).
     * Data: canvas present for read-only, absent when it is lifted.
     */
    it('throws when read-only is lifted after the canvas is gone', () => {
      const { service } = setup();
      const canvas = addMainCanvas();
      service.setReadOnly(true);
      canvas.remove();

      expect(() => service.setReadOnly(false)).toThrow(TypeError);
    });
  });

  describe('connect()', () => {
    const states: Array<
      [string, { showError: boolean; showPower: boolean; showLoading: boolean }]
    > = [
      ['error', { showError: true, showPower: false, showLoading: false }],
      ['off', { showError: false, showPower: true, showLoading: false }],
      ['', { showError: false, showPower: false, showLoading: true }],
    ];

    /**
     * Verifies: the Vm's reported state picks which placeholder the WMKS component shows, without creating a console.
     * Interacts with: getVsphereVirtualMachine stub; the service's show* flags; the fake WMKS SDK.
     * Data: a Vm with the state under test and a ticket.
     */
    it.each(states)('shows the %j placeholder without connecting', async (state, flags) => {
      const wmks = installFakeWmks();
      const { service, api } = setup();
      api.getVsphereVirtualMachine.mockReturnValue(
        of(vsphereVm({ state, ticket: 'ticket-1' })),
      );

      await service.connect('vm-1', false);

      expect(service.showError).toBe(flags.showError);
      expect(service.showPower).toBe(flags.showPower);
      expect(service.showLoading).toBe(flags.showLoading);
      expect(service.showPoweringOff).toBe(false);
      expect(wmks.createWMKS).not.toHaveBeenCalled();
    });

    /**
     * Verifies: a powered-on Vm with a ticket creates a WMKS client with the configured options and connects it once.
     * Interacts with: getVsphereVirtualMachine stub; the fake WMKS SDK; ComnSettingsService WMKS settings.
     * Data: state 'on', ticket 'ticket-1', isOwner true, RetryConnectionInterval 7.
     */
    it('creates and connects a WMKS client for a running Vm with a ticket', async () => {
      const wmks = installFakeWmks();
      const { service, api } = setup();
      api.getVsphereVirtualMachine.mockReturnValue(
        of(vsphereVm({ ticket: 'ticket-1' })),
      );

      await service.connect('vm-1', false);

      expect(wmks.createWMKS).toHaveBeenCalledWith('wmksContainer', {
        changeResolution: true,
        rescale: true,
        position: WMKS_CONST.Position.CENTER,
        retryConnectionInterval: 7,
      });
      const [client] = wmks.clients;
      expect(client.connect).toHaveBeenCalledWith('ticket-1');
      expect(service.model.ticket).toBeNull();
      expect(service.showLoading).toBe(false);
    });

    /**
     * Verifies: a client that is already connected is not asked to connect again.
     * Interacts with: the fake WMKS client's getConnectionState.
     * Data: createWMKS returns a client already in the CONNECTED state.
     */
    it('does not reconnect a client that reports itself connected', async () => {
      const wmks = installFakeWmks();
      const connected = new FakeWmksClient();
      connected.connectionState = WMKS_CONST.ConnectionState.CONNECTED;
      wmks.createWMKS.mockReturnValue(connected);
      const { service, api } = setup();
      api.getVsphereVirtualMachine.mockReturnValue(
        of(vsphereVm({ ticket: 'ticket-1' })),
      );

      await service.connect('vm-1', false);

      expect(connected.connect).not.toHaveBeenCalled();
    });

    /**
     * Verifies: a running Vm without a ticket stays on the loading placeholder.
     * Interacts with: getVsphereVirtualMachine stub; the fake WMKS SDK.
     * Data: state 'on', no ticket.
     */
    it('keeps loading when a running Vm has no ticket', async () => {
      const wmks = installFakeWmks();
      const { service } = setup();

      await service.connect('vm-1', false);

      expect(service.showLoading).toBe(true);
      expect(wmks.createWMKS).not.toHaveBeenCalled();
    });

    /**
     * Verifies: connecting read-only blocks the freshly rendered canvas.
     * Interacts with: connect(id, true); setReadOnly; #mainCanvas.
     * Data: running Vm with a ticket; canvas present.
     */
    it('applies read-only to the new console', async () => {
      installFakeWmks();
      const { service, api } = setup();
      const canvas = addMainCanvas();
      api.getVsphereVirtualMachine.mockReturnValue(
        of(vsphereVm({ ticket: 'ticket-1' })),
      );

      await service.connect('vm-1', true);

      expect(canvas.style.pointerEvents).toBe('none');
    });

    /**
     * Verifies: an API failure is recorded on the model so the page can show it, keeping the Vm id.
     * Interacts with: getVsphereVirtualMachine stub rejecting; service.model.
     * Data: error message 'Http failure'.
     */
    it('records an API failure on the model', async () => {
      const { service, api } = setup();
      api.getVsphereVirtualMachine.mockReturnValue(
        throwError(() => new Error('Http failure')),
      );

      await service.connect('vm-1', false);

      expect(service.model).toMatchObject({
        id: 'vm-1',
        name: 'Virtual Machine',
        state: 'Http failure',
      });
    });
  });

  describe('WMKS events', () => {
    async function connected() {
      const wmks = installFakeWmks();
      const ctx = setup();
      ctx.api.getVsphereVirtualMachine.mockReturnValue(
        of(vsphereVm({ ticket: 'ticket-1' })),
      );
      await ctx.service.connect('vm-1', false);
      return { ...ctx, client: wmks.clients[0] };
    }

    /**
     * Verifies: CONNECTED clears every placeholder, emits connected$, and starts checking VMware Tools.
     * Interacts with: the fake WMKS client's CONNECTION_STATE_CHANGE handler; connected$; getVsphereVirtualMachineToolsStatus stub.
     * Data: tools status toolsOk.
     */
    it('marks the console connected and checks VMware Tools', async () => {
      const { service, client, api } = await connected();
      const connectedSeen = recordEmissions(service.connected$);
      service.showError = true;

      client.changeState(WMKS_CONST.ConnectionState.CONNECTED);

      expect(connectedSeen).toEqual([true]);
      expect(service.showError).toBe(false);
      expect(service.showLoading).toBe(false);
      expect(api.getVsphereVirtualMachineToolsStatus).toHaveBeenCalledWith(
        'vm-1',
      );
      expect(service.model.vmToolsStatus).toBe('toolsOk');
      // The fake client has no SDK internals, so the lock-key workaround reports failure.
      expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
        expect.stringContaining('lock-key workaround'),
      );
    });

    /**
     * Verifies: the Tools check repeats every 10 seconds while Tools reports not running, and stops once it runs.
     * Interacts with: the interval/takeWhile poll started on CONNECTED; getVsphereVirtualMachineToolsStatus stub.
     * Data: Tools reports toolsNotRunning, then toolsOk.
     * Why: this is real timer logic, so fake timers stand in for the 10 second interval.
     */
    it('polls VMware Tools until it is running', async () => {
      const { client, api } = await connected();
      vi.useFakeTimers();
      api.getVsphereVirtualMachineToolsStatus.mockReturnValue(
        of(VirtualMachineToolsStatus.toolsNotRunning),
      );

      client.changeState(WMKS_CONST.ConnectionState.CONNECTED);
      expect(api.getVsphereVirtualMachineToolsStatus).toHaveBeenCalledTimes(1);

      api.getVsphereVirtualMachineToolsStatus.mockReturnValue(
        of(VirtualMachineToolsStatus.toolsOk),
      );
      vi.advanceTimersByTime(10000);
      expect(api.getVsphereVirtualMachineToolsStatus).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(30000);
      expect(api.getVsphereVirtualMachineToolsStatus).toHaveBeenCalledTimes(2);
    });

    /**
     * Verifies: a failing Tools status request escapes to the global ErrorHandler on every poll, and polling carries on.
     * Interacts with: the interval/takeWhile poll started on CONNECTED; getVsphereVirtualMachineToolsStatus stub erroring; rxjs unhandled-error hook.
     * Data: Tools reports toolsNotRunning on the first check, then every request fails with a 500.
     * Why: this is real timer logic, so fake timers stand in for the 10 second interval.
     */
    it('leaves a failed Tools check to ErrorService on every poll', async () => {
      const errors = captureUnhandledRxErrors();
      const { service, client, api } = await connected();
      vi.useFakeTimers();
      const failure = new Error('500 Internal Server Error');
      api.getVsphereVirtualMachineToolsStatus.mockReturnValue(
        throwError(() => failure),
      );

      client.changeState(WMKS_CONST.ConnectionState.CONNECTED);
      // Two more polls, plus 1ms so rxjs's setTimeout rethrow of the last
      // error runs before the next poll.
      vi.advanceTimersByTime(20001);

      // Not a defect under CONVENTIONS.md section 3: the inner
      // checkForVmTools(...).subscribe() (vsphere.service.ts:331) has no error
      // callback, so each failure reaches ErrorService (the global
      // ErrorHandler, main.ts:81), which shows it; no loading flag is left
      // set. The poll keeps running because Tools still reports not running.
      expect(api.getVsphereVirtualMachineToolsStatus).toHaveBeenCalledTimes(3);
      expect(errors).toEqual([failure, failure, failure]);
      expect(service.model.vmToolsStatus).toBe(
        VirtualMachineToolsStatus.toolsNotRunning,
      );
    });

    /**
     * Verifies: CONNECTING switches the page back to its loading placeholder.
     * Interacts with: the fake WMKS client's CONNECTION_STATE_CHANGE handler; show* flags.
     * Data: showPower set before the event.
     */
    it('shows loading while connecting', async () => {
      const { service, client } = await connected();
      service.showPower = true;
      service.showLoading = false;

      client.changeState(WMKS_CONST.ConnectionState.CONNECTING);

      expect(service.showLoading).toBe(true);
      expect(service.showPower).toBe(false);
    });

    /**
     * Verifies: DISCONNECTED tears the WMKS client down and emits disconnected$.
     * Interacts with: the fake WMKS client (unregister/disconnect/destroy); disconnected$.
     * Data: a connected console.
     */
    it('tears the client down on disconnect', async () => {
      const { service, client } = await connected();
      const disconnectedSeen = recordEmissions(service.disconnected$);

      client.changeState(WMKS_CONST.ConnectionState.DISCONNECTED);

      expect(client.unregister).toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalled();
      expect(client.destroy).toHaveBeenCalled();
      expect(service.wmks).toBeNull();
      // The initial false, then two more: the handler calls disconnect() (which publishes
      // false) and then publishes false again itself.
      expect(disconnectedSeen).toEqual([true, true, true]);
    });

    /**
     * Verifies: text the guest copies is published on vmClipBoard; an empty copy is ignored.
     * Interacts with: the fake WMKS client's COPY handler; vmClipBoard.
     * Data: COPY events with 'secret' and ''.
     */
    it('publishes guest clipboard copies', async () => {
      const { service, client } = await connected();
      const seen = recordEmissions(service.vmClipBoard);

      client.emit(WMKS_CONST.Events.COPY, 'secret');
      client.emit(WMKS_CONST.Events.COPY, '');

      expect(seen).toEqual(['', 'secret']);
    });
  });

  describe('power', () => {
    /**
     * Verifies: each power command calls its vSphere endpoint with the Vm id.
     * Interacts with: generated VsphereService power stubs.
     * Data: Vm 'vm-1'; the command under test.
     */
    it.each<
      [
        'powerOn' | 'powerOff' | 'reBoot' | 'shutdownOS',
        (
          | 'powerOnVsphereVirtualMachine'
          | 'powerOffVsphereVirtualMachine'
          | 'rebootVsphereVirtualMachine'
          | 'shutdownVsphereVirtualMachine'
        ),
      ]
    >([
      ['powerOn', 'powerOnVsphereVirtualMachine'],
      ['powerOff', 'powerOffVsphereVirtualMachine'],
      ['reBoot', 'rebootVsphereVirtualMachine'],
      ['shutdownOS', 'shutdownVsphereVirtualMachine'],
    ])('%s() calls %s', (command, endpoint) => {
      const { service, api } = setup();
      service[command]('vm-1');
      expect(api[endpoint]).toHaveBeenCalledWith('vm-1');
    });

    /**
     * Verifies: powerOff() shows the "Shutting Down" placeholder only when the API accepts the request.
     * Interacts with: powerOffVsphereVirtualMachine stub; showPoweringOff.
     * Data: the API response under test.
     */
    it.each([
      ['poweroff submitted', true],
      ['already off', false],
    ])('answers a power off response of %j with showPoweringOff %s', (response, shown) => {
      const { service, api } = setup();
      api.powerOffVsphereVirtualMachine.mockReturnValue(of(response));
      service.powerOff('vm-1');
      expect(service.showPoweringOff).toBe(shown);
    });

    /**
     * Verifies: a failed reboot drops the one-time ticket so the next connect fetches a fresh one.
     * Interacts with: rebootVsphereVirtualMachine stub rejecting; service.model.ticket.
     * Data: model with ticket 'stale'.
     */
    it('clears the ticket when reboot fails', () => {
      const { service, api } = setup();
      service.model = vsphereVm({ ticket: 'stale' });
      api.rebootVsphereVirtualMachine.mockReturnValue(
        throwError(() => new Error('nope')),
      );

      service.reBoot('vm-1');

      expect(service.model.ticket).toBeNull();
    });

    /**
     * Verifies: a failed power on is only logged; no placeholder changes and the ticket is kept.
     * Interacts with: powerOnVsphereVirtualMachine stub rejecting; console.log spy; show* flags.
     * Data: model with ticket 't1'; API error 'nope'.
     */
    it('only logs a failed power on', () => {
      const { service, api } = setup();
      service.model = vsphereVm({ ticket: 't1' });
      api.powerOnVsphereVirtualMachine.mockReturnValue(
        throwError(() => new Error('nope')),
      );

      service.powerOn('vm-1');

      expect(vi.mocked(console.log)).toHaveBeenCalledWith(
        'error sending poweron console API',
      );
      expect(service.showPower).toBe(false);
      expect(service.showError).toBe(false);
      expect(service.model.ticket).toBe('t1');
    });

    /**
     * Verifies: a failed power off is only logged and the "Shutting Down" placeholder stays hidden.
     * Interacts with: powerOffVsphereVirtualMachine stub rejecting; console.log spy; showPoweringOff.
     * Data: API error 'nope'.
     */
    it('only logs a failed power off', () => {
      const { service, api } = setup();
      api.powerOffVsphereVirtualMachine.mockReturnValue(
        throwError(() => new Error('nope')),
      );

      service.powerOff('vm-1');

      expect(vi.mocked(console.log)).toHaveBeenCalledWith(
        'error sending poweroff to console API',
      );
      expect(service.showPoweringOff).toBe(false);
    });

    /**
     * Verifies: a failed guest shutdown drops the one-time ticket and logs, under the reboot message.
     * Interacts with: shutdownVsphereVirtualMachine stub rejecting; console.log spy; service.model.ticket.
     * Data: model with ticket 'stale'; API error 'nope'.
     */
    it('clears the ticket when shutdown fails', () => {
      const { service, api } = setup();
      service.model = vsphereVm({ ticket: 'stale' });
      api.shutdownVsphereVirtualMachine.mockReturnValue(
        throwError(() => new Error('nope')),
      );

      service.shutdownOS('vm-1');

      expect(vi.mocked(console.log)).toHaveBeenCalledWith(
        'error sending reboot to console API',
      );
      expect(service.model.ticket).toBeNull();
    });
  });

  describe('API requests', () => {
    /**
     * Verifies: verifyCredentials() sends the entered upload credentials and path.
     * Interacts with: uploadConfig; validateVsphereVirtualMachineCredentials stub.
     * Data: username 'admin', password 'pw', filepath 'C:\\Temp\\'.
     */
    it('verifies the entered upload credentials', () => {
      const { service, api } = setup();
      service.uploadConfig = {
        username: 'admin',
        password: 'pw',
        filepath: 'C:\\Temp\\',
      };
      service.verifyCredentials('vm-1');
      expect(api.validateVsphereVirtualMachineCredentials).toHaveBeenCalledWith(
        'vm-1',
        { username: 'admin', password: 'pw', filePath: 'C:\\Temp\\' },
      );
    });

    /**
     * Verifies: getVmFileUrl() asks for a download URL with the stored credentials.
     * Interacts with: uploadConfig; getFileUrlVsphereVirtualMachine stub.
     * Data: file '/tmp/log.txt'; username 'root', password 'pw'.
     */
    it('requests a file download URL with the stored credentials', () => {
      const { service, api } = setup();
      service.uploadConfig = { username: 'root', password: 'pw', filepath: '' };
      service.getVmFileUrl('vm-1', '/tmp/log.txt');
      expect(api.getFileUrlVsphereVirtualMachine).toHaveBeenCalledWith('vm-1', {
        filePath: '/tmp/log.txt',
        username: 'root',
        password: 'pw',
      });
    });

    /**
     * Verifies: network, ISO, resolution and snapshot commands send the payloads vm.api expects.
     * Interacts with: the generated VsphereService stub named in the row.
     * Data: adapter 'Network adapter 1' -> 'net-2'; iso '[ds] a.iso'; 1280x720; snapshot 's1'; revert.
     */
    it.each<[string, (service: VsphereService) => void, keyof ApiVsphereService, unknown[]]>([
      [
        'changeNic()',
        (s) => s.changeNic('vm-1', 'Network adapter 1', 'net-2'),
        'changeVsphereVirtualMachineNetwork',
        ['vm-1', { adapter: 'Network adapter 1', network: 'net-2' }],
      ],
      [
        'mountIso()',
        (s) => s.mountIso('vm-1', '[ds] a.iso'),
        'mountVsphereVirtualMachineIso',
        ['vm-1', { iso: '[ds] a.iso' }],
      ],
      [
        'setResolution()',
        (s) => s.setResolution('vm-1', { width: 1280, height: 720 }),
        'setVsphereVirtualMachineResolution',
        ['vm-1', { width: 1280, height: 720 }],
      ],
      [
        'revertToSnapshot()',
        (s) => s.revertToSnapshot('vm-1', 's1'),
        'revertToVsphereVirtualMachineSnapshot',
        ['vm-1', { snapshotId: 's1' }],
      ],
      ['revert()', (s) => s.revert('vm-1'), 'revertVsphereVirtualMachine', ['vm-1']],
    ])('%s sends the payload vm.api expects', (_command, act, endpoint, args) => {
      const { service, api } = setup();
      act(service);
      expect(api[endpoint as keyof typeof api]).toHaveBeenCalledWith(...args);
    });

    /**
     * Verifies: getSnapshots() returns the API's snapshot list unchanged.
     * Interacts with: getVsphereVirtualMachineSnapshots stub.
     * Data: one snapshot 's1'.
     */
    it('passes the snapshot list through', async () => {
      const { service, api } = setup();
      expect(await firstValueFrom(service.getSnapshots('vm-1'))).toEqual([
        { id: 's1' },
      ]);
      expect(api.getVsphereVirtualMachineSnapshots).toHaveBeenCalledWith('vm-1');
    });

    /**
     * Verifies: getIsos() returns the API's ISO list unchanged.
     * Interacts with: getVsphereVirtualMachineIsos stub.
     * Data: an empty ISO list.
     */
    it('passes the ISO list through', async () => {
      const { service, api } = setup();
      expect(await firstValueFrom(service.getIsos('vm-1'))).toEqual([]);
      expect(api.getVsphereVirtualMachineIsos).toHaveBeenCalledWith('vm-1');
    });

    /**
     * Verifies: sendFileToVm() POSTs multipart form data with the credentials, path and every file to the upload endpoint.
     * Interacts with: HttpTestingController (the service builds this request itself rather than using the generated client).
     * Data: two files 'a.txt' and 'b.txt'; credentials admin/pw; path '/tmp/'.
     */
    it('uploads files as multipart form data', async () => {
      const { service, http } = setup();
      service.uploadConfig = { username: 'admin', password: 'pw', filepath: '/tmp/' };
      const files = fileList(
        new File(['a'], 'a.txt'),
        new File(['b'], 'b.txt'),
      );

      const done = firstValueFrom(service.sendFileToVm('vm-1', files));
      const req = http.expectOne(
        `${TEST_BASE_PATH}/api/vms/vsphere/vm-1/actions/upload-file`,
      );
      expect(req.request.method).toBe('POST');
      const body = req.request.body as FormData;
      expect(body.get('username')).toBe('admin');
      expect(body.get('password')).toBe('pw');
      expect(body.get('filepath')).toBe('/tmp/');
      expect((body.get('a.txt') as File).name).toBe('a.txt');
      expect((body.get('b.txt') as File).name).toBe('b.txt');
      req.flush({});

      await done;
      http.verify();
    });

    /**
     * Verifies: getUploadConfig() throws because uploadConfig is a plain object, not an observable.
     * Interacts with: VsphereService.getUploadConfig.
     * Data: the default uploadConfig.
     */
    it('getUploadConfig() throws', () => {
      const { service } = setup();
      expect(() => service.getUploadConfig()).toThrow(TypeError);
    });
  });

  /**
   * Verifies: disconnect() without a client only publishes the disconnected state.
   * Interacts with: VsphereService.disconnect; connectionStatus$.
   * Data: no WMKS client created.
   */
  it('disconnect() without a client reports disconnected', () => {
    const { service } = setup();
    const status = recordEmissions(service.connectionStatus$);
    service.disconnect();
    expect(status).toEqual([{ connected: false }, { connected: false }]);
  });
});
