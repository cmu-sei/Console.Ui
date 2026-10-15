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
import { ProxmoxService } from './proxmox.service';
import { ApiStub } from '../../test-utils/api-stub';

const VM: ProxmoxVirtualMachine = { id: 'vm-1', name: 'Alpha' };

function setup() {
  const api = {
    getProxmoxVirtualMachine: vi.fn(() => of(VM)),
    changeProxmoxVirtualMachineNetwork: vi.fn(() => of(VM)),
    getProxmoxVirtualMachineIsos: vi.fn(() => of([])),
    mountProxmoxVirtualMachineIso: vi.fn(() => of(VM)),
  } satisfies ApiStub<ApiProxmoxService>;
  const novnc = {
    sendCtrlAltDel: vi.fn(),
    sendClipboardText: vi.fn(),
  } satisfies Pick<NoVNCService, 'sendCtrlAltDel' | 'sendClipboardText'>;
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
});
