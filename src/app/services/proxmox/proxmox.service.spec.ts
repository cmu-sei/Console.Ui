// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of, throwError } from 'rxjs';
import { fileList } from '../../test-utils/file-list';
import {
  ProxmoxService as ApiProxmoxService,
  ProxmoxVirtualMachine,
} from '../../generated/vm-api';
import { NoVNCService } from '../novnc/novnc.service';
import {
  filesOverUploadLimit,
  PROXMOX_UPLOAD_LIMIT_BYTES,
  ProxmoxService,
  toVmSnapshots,
  uploadLimitMessage,
} from './proxmox.service';
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
    uploadFileToProxmoxVirtualMachine: vi.fn(() => of('uploaded')),
    downloadFileFromProxmoxVirtualMachine: vi.fn(() => of(new Blob(['data']))),
  } satisfies ApiStub<ApiProxmoxService>;
  const novnc = {
    sendCtrlAltDel: vi.fn(),
    sendClipboardText: vi.fn(),
    sendText: vi.fn(async () => true),
    enterFullscreen: vi.fn(() => true),
    requestReconnect: vi.fn(),
    getGuestClipboard: vi.fn(() => 'copied'),
  } satisfies Pick<
    NoVNCService,
    | 'sendCtrlAltDel'
    | 'sendClipboardText'
    | 'sendText'
    | 'enterFullscreen'
    | 'requestReconnect'
    | 'getGuestClipboard'
  >;
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
   * Verifies: the upload limit picks out files over 46080 bytes, and the message names them in the API's words, with sizes in KB rounded so one byte over never reads as the limit.
   * Interacts with: filesOverUploadLimit and uploadLimitMessage.
   * Data: files of 46080, 46081 and 100000 bytes.
   */
  it('names the files over the upload limit as the API does', () => {
    const atLimit = new File([new Uint8Array(46080)], 'max.bin');
    const over = new File([new Uint8Array(46081)], 'over.bin');
    const big = new File([new Uint8Array(100000)], 'big.iso');

    expect(PROXMOX_UPLOAD_LIMIT_BYTES).toBe(46080);
    expect(filesOverUploadLimit([atLimit, over, big])).toEqual([over, big]);
    expect(uploadLimitMessage([over])).toBe(
      'over.bin is 45.01 KB, which exceeds the 45 KB limit for uploading a file to a Proxmox virtual machine.',
    );
    expect(uploadLimitMessage([over, big])).toBe(
      'over.bin, big.iso exceed the 45 KB limit for uploading a file to a Proxmox virtual machine.',
    );
  });

  /**
   * Verifies: typed text goes to the noVNC client, and its connected/not-connected answer is passed back.
   * Interacts with: NoVNCService stub.
   * Data: text 'hello'; the client answering true, then false.
   */
  it('types text through noVNC', async () => {
    const { service, novnc } = setup();
    await expect(service.sendText('hello')).resolves.toBe(true);
    expect(novnc.sendText).toHaveBeenCalledWith('hello');
    novnc.sendText.mockResolvedValue(false);
    await expect(service.sendText('hello')).resolves.toBe(false);
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

  describe('file transfer', () => {
    /**
     * Verifies: uploadFiles() sends the directory and every picked file to the generated client.
     * Interacts with: generated uploadFileToProxmoxVirtualMachine stub.
     * Data: two files into '/tmp/'.
     */
    it('uploads the files into the directory', () => {
      const { service, api } = setup();
      const a = new File(['a'], 'a.txt');
      const b = new File(['b'], 'b.bin');
      service.uploadFiles('vm-1', '/tmp/', fileList(a, b));
      expect(api.uploadFileToProxmoxVirtualMachine).toHaveBeenCalledWith('vm-1', '/tmp/', [a, b]);
    });

    /**
     * Verifies: downloadFile() returns the guest file's blob.
     * Interacts with: generated downloadFileFromProxmoxVirtualMachine stub.
     * Data: '/etc/hosts'.
     */
    it('downloads a file as a blob', async () => {
      const { service, api } = setup();
      const blob = await firstValueFrom(service.downloadFile('vm-1', '/etc/hosts'));
      expect(await blob.text()).toBe('data');
      expect(api.downloadFileFromProxmoxVirtualMachine).toHaveBeenCalledWith('vm-1', '/etc/hosts');
    });

    /**
     * Verifies: a failed download's Blob body is parsed back into ProblemDetails, so its title can be shown; a body that isn't JSON leaves the error as it was.
     * Interacts with: generated downloadFileFromProxmoxVirtualMachine stub rejecting with an HttpErrorResponse.
     * Data: a 400 whose Blob body is {"title":"No such file"}, then one whose body is 'oops'.
     */
    it('parses a failed download body', async () => {
      const { service, api } = setup();
      api.downloadFileFromProxmoxVirtualMachine.mockReturnValueOnce(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: new Blob([JSON.stringify({ title: 'No such file' })]),
            }),
        ),
      );
      const parsed = await firstValueFrom(service.downloadFile('vm-1', '/x')).catch((e) => e);
      expect(parsed).toBeInstanceOf(HttpErrorResponse);
      expect(parsed.status).toBe(400);
      expect(parsed.error).toEqual({ title: 'No such file' });

      const raw = new HttpErrorResponse({ status: 500, error: new Blob(['oops']) });
      api.downloadFileFromProxmoxVirtualMachine.mockReturnValueOnce(throwError(() => raw));
      expect(await firstValueFrom(service.downloadFile('vm-1', '/x')).catch((e) => e)).toBe(raw);
    });
  });

  /**
   * Verifies: fullscreen, reconnect and the guest clipboard are all handled by noVNC.
   * Interacts with: NoVNCService stub.
   */
  it('passes console controls to noVNC', () => {
    const { service, novnc } = setup();
    expect(service.fullscreen()).toBe(true);
    service.reconnect();
    expect(service.getGuestClipboard()).toBe('copied');
    expect(novnc.enterFullscreen).toHaveBeenCalledOnce();
    expect(novnc.requestReconnect).toHaveBeenCalledOnce();
  });
});
