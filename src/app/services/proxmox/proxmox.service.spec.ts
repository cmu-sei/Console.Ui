// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import {
  ProxmoxService as ApiProxmoxService,
  ProxmoxVirtualMachine,
} from '../../generated/vm-api';
import { NoVNCService } from '../novnc/novnc.service';
import { ProxmoxService, toVmSnapshots } from './proxmox.service';
import { ApiStub } from '../../test-utils/api-stub';

const VM: ProxmoxVirtualMachine = { id: 'vm-1', name: 'Alpha' };

function setup() {
  const api = {
    getProxmoxVirtualMachine: vi.fn(() => of(VM)),
    changeProxmoxVirtualMachineNetwork: vi.fn(() => of(VM)),
    getProxmoxVirtualMachineIsos: vi.fn(() => of([])),
    mountProxmoxVirtualMachineIso: vi.fn(() => of(VM)),
    getProxmoxVirtualMachineSnapshots: vi.fn(() =>
      of([
        { name: 'clean', snapTime: 1000 },
        { name: 'current', parent: 'clean' },
      ]),
    ),
    revertProxmoxVirtualMachine: vi.fn(() => of('reverted')),
    revertProxmoxVirtualMachineSnapshot: vi.fn(() => of('reverted')),
  } satisfies ApiStub<ApiProxmoxService>;
  const novnc = {
    sendCtrlAltDel: vi.fn(),
    sendClipboardText: vi.fn(),
    sendText: vi.fn(() => true),
  } satisfies Pick<NoVNCService, 'sendCtrlAltDel' | 'sendClipboardText' | 'sendText'>;
  TestBed.configureTestingModule({
    providers: [
      { provide: NoVNCService, useValue: novnc },
      { provide: ApiProxmoxService, useValue: api },
    ],
  });
  return { service: TestBed.inject(ProxmoxService), api, novnc };
}

describe('ProxmoxService', () => {
  /**
   * Verifies: getVm() passes the Vm id to the generated client and returns its result.
   * Interacts with: generated getProxmoxVirtualMachine stub.
   * Data: Vm 'vm-1'.
   */
  it('reads the Vm', async () => {
    const { service, api } = setup();
    expect(await firstValueFrom(service.getVm('vm-1'))).toEqual(VM);
    expect(api.getProxmoxVirtualMachine).toHaveBeenCalledWith('vm-1');
  });

  /**
   * Verifies: getIsos() passes the Vm id to the generated client and returns its result.
   * Interacts with: generated getProxmoxVirtualMachineIsos stub.
   * Data: Vm 'vm-1'; an empty ISO list.
   */
  it('reads the mountable ISOs', async () => {
    const { service, api } = setup();
    expect(await firstValueFrom(service.getIsos('vm-1'))).toEqual([]);
    expect(api.getProxmoxVirtualMachineIsos).toHaveBeenCalledWith('vm-1');
  });

  /**
   * Verifies: changeNic() sends the adapter and network the API expects.
   * Interacts with: generated changeProxmoxVirtualMachineNetwork stub.
   * Data: adapter 'net0' moved to 'vmbr1'.
   */
  it('changes a network adapter', () => {
    const { service, api } = setup();
    service.changeNic('vm-1', 'net0', 'vmbr1');
    expect(api.changeProxmoxVirtualMachineNetwork).toHaveBeenCalledWith('vm-1', {
      adapter: 'net0',
      network: 'vmbr1',
    });
  });

  /**
   * Verifies: mountIso() passes the API-issued volume id through unmodified.
   * Interacts with: generated mountProxmoxVirtualMachineIso stub.
   * Data: volume id 'local:iso/tools.iso'.
   */
  it('mounts the ISO volume id as given', () => {
    const { service, api } = setup();
    service.mountIso('vm-1', 'local:iso/tools.iso');
    expect(api.mountProxmoxVirtualMachineIso).toHaveBeenCalledWith('vm-1', {
      iso: 'local:iso/tools.iso',
    });
  });

  /**
   * Verifies: Ctrl-Alt-Del goes to the noVNC client, not the API.
   * Interacts with: NoVNCService stub.
   * Data: none.
   */
  it('sends Ctrl-Alt-Del through noVNC', () => {
    const { service, novnc } = setup();
    service.sendCtrlAltDel();
    expect(novnc.sendCtrlAltDel).toHaveBeenCalledOnce();
  });

  /**
   * Verifies: clipboard text goes to the noVNC client, not the API.
   * Interacts with: NoVNCService stub.
   * Data: pasted text 'hello'.
   */
  it('sends clipboard text through noVNC', () => {
    const { service, novnc } = setup();
    service.sendClipboardText('hello');
    expect(novnc.sendClipboardText).toHaveBeenCalledWith('hello');
  });

  /**
   * Verifies: typed text goes to the noVNC client, and its connected/not-connected answer is passed back.
   * Interacts with: NoVNCService stub.
   * Data: text 'hello'; the client answering true, then false.
   */
  it('types text through noVNC', () => {
    const { service, novnc } = setup();
    expect(service.sendText('hello')).toBe(true);
    expect(novnc.sendText).toHaveBeenCalledWith('hello');
    novnc.sendText.mockReturnValue(false);
    expect(service.sendText('hello')).toBe(false);
  });

  describe('snapshots', () => {
    /**
     * Verifies: getSnapshots() reads the Vm's snapshots and returns them in the shared dialog's shape.
     * Interacts with: generated getProxmoxVirtualMachineSnapshots stub.
     * Data: one snapshot 'clean' at snaptime 1000, and Proxmox's synthetic 'current' entry under it.
     */
    it('lists snapshots for the snapshot dialog', async () => {
      const { service, api } = setup();
      expect(await firstValueFrom(service.getSnapshots('vm-1'))).toEqual([
        {
          id: 'clean',
          name: 'clean',
          description: undefined,
          createTime: '1970-01-01T00:16:40.000Z',
          isCurrent: true,
          depth: 0,
        },
      ]);
      expect(api.getProxmoxVirtualMachineSnapshots).toHaveBeenCalledWith('vm-1');
    });

    /**
     * Verifies: reverting to the current snapshot uses actions/revert; any other snapshot reverts by name.
     * Interacts with: generated revertProxmoxVirtualMachine and revertProxmoxVirtualMachineSnapshot stubs.
     * Data: Vm 'vm-1'; snapshot 'before-lab'.
     */
    it('reverts to the current snapshot or a named one', () => {
      const { service, api } = setup();
      service.revertToCurrentSnapshot('vm-1');
      service.revertToSnapshot('vm-1', 'before-lab');
      expect(api.revertProxmoxVirtualMachine).toHaveBeenCalledWith('vm-1');
      expect(api.revertProxmoxVirtualMachineSnapshot).toHaveBeenCalledWith(
        'vm-1',
        'before-lab',
      );
    });
  });

  describe('toVmSnapshots', () => {
    /**
     * Verifies: snapshots come out in tree order with their depth, siblings oldest first, and the synthetic 'current' entry is dropped.
     * Interacts with: toVmSnapshots.
     * Data: root 'base' with children 'b' (newer) and 'a' (older); 'a' has child 'a1'; 'current' under 'a1'.
     */
    it('orders snapshots as a tree', () => {
      const result = toVmSnapshots([
        { name: 'b', parent: 'base', snapTime: 30 },
        { name: 'current', parent: 'a1' },
        { name: 'a1', parent: 'a', snapTime: 25 },
        { name: 'base', snapTime: 10 },
        { name: 'a', parent: 'base', snapTime: 20 },
      ]);
      expect(result.map((s) => [s.name, s.depth, s.isCurrent])).toEqual([
        ['base', 0, false],
        ['a', 1, false],
        ['a1', 2, true],
        ['b', 1, false],
      ]);
    });

    /**
     * Verifies: without Proxmox's 'current' entry the Vm model's currentSnapshot marks the current one, and a snapshot whose parent is missing is listed at the root.
     * Interacts with: toVmSnapshots.
     * Data: 'orphan' whose parent 'gone' is not listed; currentSnapshot 'orphan'.
     */
    it('falls back to the model for the current snapshot', () => {
      const result = toVmSnapshots([{ name: 'orphan', parent: 'gone' }], 'orphan');
      expect(result).toEqual([
        expect.objectContaining({ name: 'orphan', depth: 0, isCurrent: true }),
      ]);
      expect(result[0].createTime).toBeUndefined();
    });

    /**
     * Verifies: a Vm running from no snapshot marks none current.
     * Interacts with: toVmSnapshots.
     * Data: 'clean', and a 'current' entry with no parent.
     */
    it('marks nothing current when the Vm is not on a snapshot', () => {
      const result = toVmSnapshots([{ name: 'clean' }, { name: 'current' }]);
      expect(result.map((s) => s.isCurrent)).toEqual([false]);
    });
  });
});
