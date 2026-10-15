// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
import {
  ProxmoxService as ApiProxmoxService,
  Vm,
  VmsService,
  VmType,
  VsphereService as ApiVsphereService,
} from '../../generated/vm-api';
import { ProxmoxService } from '../../services/proxmox/proxmox.service';
import { PowerAction, VmService } from './vm.service';
import { VmQuery } from './vm.query';
import { ApiStub } from '../../test-utils/api-stub';
import { recordEmissions } from '../../test-utils/record-emissions';
import { stubClipboard } from '../../test-utils/clipboard';

type ProxmoxPowerMethod =
  | 'powerOnProxmoxVirtualMachine'
  | 'powerOffProxmoxVirtualMachine'
  | 'rebootProxmoxVirtualMachine'
  | 'shutdownProxmoxVirtualMachine';
type VspherePowerMethod =
  | 'powerOnVsphereVirtualMachine'
  | 'powerOffVsphereVirtualMachine'
  | 'rebootVsphereVirtualMachine'
  | 'shutdownVsphereVirtualMachine';

function vm(overrides: Partial<Vm> = {}): Vm {
  return { id: 'vm-1', name: 'Alpha', type: VmType.Vsphere, ...overrides };
}

function setup() {
  const vmsService = {
    getVm: vi.fn((id: string) => of(vm({ id }))),
  } satisfies ApiStub<VmsService>;
  const apiProxmox = {
    powerOnProxmoxVirtualMachine: vi.fn(() => of('proxmox on')),
    powerOffProxmoxVirtualMachine: vi.fn(() => of('proxmox off')),
    rebootProxmoxVirtualMachine: vi.fn(() => of('proxmox reboot')),
    shutdownProxmoxVirtualMachine: vi.fn(() => of('proxmox shutdown')),
  } satisfies ApiStub<ApiProxmoxService>;
  const apiVsphere = {
    powerOnVsphereVirtualMachine: vi.fn(() => of('vsphere on')),
    powerOffVsphereVirtualMachine: vi.fn(() => of('vsphere off')),
    rebootVsphereVirtualMachine: vi.fn(() => of('vsphere reboot')),
    shutdownVsphereVirtualMachine: vi.fn(() => of('vsphere shutdown')),
  } satisfies ApiStub<ApiVsphereService>;
  const proxmoxService = {
    sendCtrlAltDel: vi.fn(),
    sendClipboardText: vi.fn(),
  } satisfies Pick<ProxmoxService, 'sendCtrlAltDel' | 'sendClipboardText'>;
  const router = {
    navigate: vi.fn(() => Promise.resolve(true)),
  } satisfies Pick<Router, 'navigate'>;

  TestBed.configureTestingModule({
    providers: [
      { provide: VmsService, useValue: vmsService },
      {
        provide: ApiProxmoxService,
        useValue: apiProxmox,
      },
      {
        provide: ApiVsphereService,
        useValue: apiVsphere,
      },
      { provide: ProxmoxService, useValue: proxmoxService },
      { provide: Router, useValue: router },
    ],
  });

  return {
    service: TestBed.inject(VmService),
    query: TestBed.inject(VmQuery),
    vmsService,
    apiProxmox,
    apiVsphere,
    proxmoxService,
    router,
  };
}

describe('VmService', () => {
  describe('get()', () => {
    /**
     * Verifies: get() fetches the Vm, upserts it into the store, and VmQuery emits it.
     * Interacts with: VmsService.getVm stub; real VmStore; real VmQuery.selectEntityNotNull.
     * Data: Vm 'vm-1' named 'Alpha'.
     */
    it('upserts the fetched Vm so the query emits it', async () => {
      const { service, query, vmsService } = setup();
      const seen = recordEmissions(query.selectEntityNotNull('vm-1'));

      const result = await firstValueFrom(service.get('vm-1'));

      expect(vmsService.getVm).toHaveBeenCalledWith('vm-1');
      expect(result).toEqual(vm());
      expect(seen).toEqual([vm()]);
    });

    /**
     * Verifies: a second get() merges the fresh API copy over the stored entity.
     * Interacts with: VmsService.getVm stub (two results); real store upsert; VmQuery.getEntity.
     * Data: 'vm-1' first 'Alpha', then 'Beta' with a power state.
     */
    it('replaces stored fields on a later fetch', async () => {
      const { service, query, vmsService } = setup();
      await firstValueFrom(service.get('vm-1'));
      vmsService.getVm.mockReturnValue(of(vm({ name: 'Beta', powerState: 'On' })));

      await firstValueFrom(service.get('vm-1'));

      expect(query.getEntity('vm-1')).toEqual(
        vm({ name: 'Beta', powerState: 'On' }),
      );
    });

    /**
     * Verifies: an API error propagates and leaves the store empty.
     * Interacts with: VmsService.getVm stub rejecting with a 404; VmQuery.getCount.
     * Data: an HTTP-like error object with status 404.
     */
    it('propagates an API error without storing anything', async () => {
      const { service, query, vmsService } = setup();
      vmsService.getVm.mockReturnValue(throwError(() => ({ status: 404 })));

      await expect(firstValueFrom(service.get('vm-1'))).rejects.toEqual({
        status: 404,
      });
      expect(query.getCount()).toBe(0);
    });
  });

  /**
   * Verifies: add(), update() and remove() write straight through to the store.
   * Interacts with: real VmStore via VmService; VmQuery.selectAll emissions.
   * Data: 'vm-1' added, renamed to 'Beta', removed.
   */
  it('adds, updates and removes entities', () => {
    const { service, query } = setup();
    const seen = recordEmissions(query.selectAll());

    service.add(vm());
    service.update('vm-1', { name: 'Beta' });
    service.remove('vm-1');

    expect(seen.map((list) => list.map((v) => v.name))).toEqual([
      [],
      ['Alpha'],
      ['Beta'],
      [],
    ]);
  });

  describe('powerAction()', () => {
    const proxmoxCases: Array<[PowerAction, ProxmoxPowerMethod]> = [
      [PowerAction.PowerOn, 'powerOnProxmoxVirtualMachine'],
      [PowerAction.PowerOff, 'powerOffProxmoxVirtualMachine'],
      [PowerAction.Reboot, 'rebootProxmoxVirtualMachine'],
      [PowerAction.Shutdown, 'shutdownProxmoxVirtualMachine'],
    ];

    /**
     * Verifies: a power action on a stored Proxmox Vm goes to the matching per-Vm Proxmox endpoint.
     * Interacts with: real VmQuery lookup of the Vm type; generated ProxmoxService stub.
     * Data: Proxmox Vm 'vm-1'; the action under test.
     */
    it.each(proxmoxCases)('sends %s to %s for a Proxmox Vm', async (action, method) => {
      const { service, apiProxmox, apiVsphere } = setup();
      service.add(vm({ type: VmType.Proxmox }));

      await firstValueFrom(service.powerAction('vm-1', action));

      expect(apiProxmox[method]).toHaveBeenCalledWith('vm-1');
      for (const fn of Object.values(apiVsphere)) {
        expect(fn).not.toHaveBeenCalled();
      }
    });

    const vsphereCases: Array<[PowerAction, VspherePowerMethod]> = [
      [PowerAction.PowerOn, 'powerOnVsphereVirtualMachine'],
      [PowerAction.PowerOff, 'powerOffVsphereVirtualMachine'],
      [PowerAction.Reboot, 'rebootVsphereVirtualMachine'],
      [PowerAction.Shutdown, 'shutdownVsphereVirtualMachine'],
    ];

    /**
     * Verifies: a power action on a stored vSphere Vm goes to the matching per-Vm vSphere endpoint.
     * Interacts with: real VmQuery lookup of the Vm type; generated VsphereService stub.
     * Data: vSphere Vm 'vm-1'; the action under test.
     */
    it.each(vsphereCases)('sends %s to %s for a vSphere Vm', async (action, method) => {
      const { service, apiProxmox, apiVsphere } = setup();
      service.add(vm({ type: VmType.Vsphere }));

      await firstValueFrom(service.powerAction('vm-1', action));

      expect(apiVsphere[method]).toHaveBeenCalledWith('vm-1');
      for (const fn of Object.values(apiProxmox)) {
        expect(fn).not.toHaveBeenCalled();
      }
    });

    /**
     * Verifies: the API's response string is passed through to the caller.
     * Interacts with: generated ProxmoxService stub; powerAction() return value.
     * Data: Proxmox Vm; PowerOn responding 'proxmox on'.
     */
    it('returns the API response', async () => {
      const { service } = setup();
      service.add(vm({ type: VmType.Proxmox }));
      expect(
        await firstValueFrom(service.powerAction('vm-1', PowerAction.PowerOn)),
      ).toBe('proxmox on');
    });

    const unsupported: Array<[string, Partial<Vm> | null]> = [
      ['an Unknown-type Vm', { type: VmType.Unknown }],
      ['an Azure Vm', { type: VmType.Azure }],
      ['a Vm missing from the store', null],
    ];

    /**
     * Verifies: power actions error out for Vm types the console can't drive, and for Vms it hasn't loaded.
     * Interacts with: real VmQuery lookup; no generated service is called.
     * Data: the Vm described in the test name.
     */
    it.each(unsupported)('errors for %s', async (_label, overrides) => {
      const { service, apiProxmox, apiVsphere } = setup();
      if (overrides) service.add(vm(overrides));

      await expect(
        firstValueFrom(service.powerAction('vm-1', PowerAction.Reboot)),
      ).rejects.toThrow(
        'Power operations are not supported for this virtual machine.',
      );
      for (const fn of [
        ...Object.values(apiProxmox),
        ...Object.values(apiVsphere),
      ]) {
        expect(fn).not.toHaveBeenCalled();
      }
    });
  });

  describe('keyboard and clipboard', () => {
    /**
     * Verifies: Ctrl-Alt-Del is forwarded to noVNC for a Proxmox Vm.
     * Interacts with: real VmQuery lookup; app ProxmoxService.sendCtrlAltDel spy.
     * Data: Proxmox Vm 'vm-1'.
     */
    it('sends Ctrl-Alt-Del for a Proxmox Vm', () => {
      const { service, proxmoxService } = setup();
      service.add(vm({ type: VmType.Proxmox }));
      service.sendCtrlAltDel('vm-1');
      expect(proxmoxService.sendCtrlAltDel).toHaveBeenCalledOnce();
    });

    /**
     * Verifies: Ctrl-Alt-Del is a no-op for a vSphere Vm, whose options bar drives WMKS directly.
     * Interacts with: real VmQuery lookup; app ProxmoxService.sendCtrlAltDel spy.
     * Data: vSphere Vm 'vm-1'.
     */
    it('ignores Ctrl-Alt-Del for a vSphere Vm', () => {
      const { service, proxmoxService } = setup();
      service.add(vm({ type: VmType.Vsphere }));
      service.sendCtrlAltDel('vm-1');
      expect(proxmoxService.sendCtrlAltDel).not.toHaveBeenCalled();
    });

    /**
     * Verifies: the local clipboard text is read and pasted into a Proxmox Vm.
     * Interacts with: a stubbed navigator.clipboard.readText; app ProxmoxService.sendClipboardText spy.
     * Data: Proxmox Vm; clipboard holding 'hello'.
     */
    it('pastes the local clipboard into a Proxmox Vm', async () => {
      const { service, proxmoxService } = setup();
      const { readText } = stubClipboard('hello');
      service.add(vm({ type: VmType.Proxmox }));

      await service.sendClipboardText('vm-1');

      expect(readText).toHaveBeenCalledOnce();
      expect(proxmoxService.sendClipboardText).toHaveBeenCalledWith('hello');
    });

    /**
     * Verifies: clipboard paste is a no-op for a vSphere Vm, though the clipboard is still read.
     * Interacts with: a stubbed navigator.clipboard.readText; app ProxmoxService.sendClipboardText spy.
     * Data: vSphere Vm; clipboard holding 'hello'.
     */
    it('does not paste into a vSphere Vm', async () => {
      const { service, proxmoxService } = setup();
      const { readText } = stubClipboard('hello');
      service.add(vm({ type: VmType.Vsphere }));

      await service.sendClipboardText('vm-1');

      expect(readText).toHaveBeenCalledOnce();
      expect(proxmoxService.sendClipboardText).not.toHaveBeenCalled();
    });
  });

  describe('setReadOnly()', () => {
    /**
     * Verifies: the read-only toggle writes readOnly into the current URL's query params, merged with the others.
     * Interacts with: Router.navigate spy (UserPermissionsService.readOnly$ reads the param back).
     * Data: setReadOnly with the value under test.
     */
    it.each([true, false])(
      'navigates in place with readOnly=%s merged into the query params',
      (value) => {
        const { service, router } = setup();
        service.setReadOnly(value);
        expect(router.navigate).toHaveBeenCalledWith([], {
          queryParams: { readOnly: value },
          queryParamsHandling: 'merge',
        });
      },
    );
  });
});
