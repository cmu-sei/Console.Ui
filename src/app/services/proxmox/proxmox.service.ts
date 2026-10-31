/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ChangeProxmoxVirtualMachineNetwork,
  MountProxmoxVirtualMachineIso,
  ProxmoxService as ApiProxmoxService,
  ProxmoxSnapshot,
  ProxmoxVirtualMachine,
  VmSnapshot,
} from '../../generated/vm-api';
import { IsoResult } from '../../models/vm/iso-result';
import { NoVNCService } from '../novnc/novnc.service';

@Injectable({
  providedIn: 'root',
})
export class ProxmoxService {
  private novncService = inject(NoVNCService);
  private apiProxmoxService = inject(ApiProxmoxService);

  public getVm(id: string): Observable<ProxmoxVirtualMachine> {
    return this.apiProxmoxService.getProxmoxVirtualMachine(id);
  }

  public changeNic(
    id: string,
    adapter: string,
    network: string,
  ): Observable<ProxmoxVirtualMachine> {
    const data: ChangeProxmoxVirtualMachineNetwork = { adapter, network };
    return this.apiProxmoxService.changeProxmoxVirtualMachineNetwork(id, data);
  }

  // Cast to the hand-written IsoResult for the same reason VsphereService.getIsos does: the mount
  // dialog decorates each result with its own `hide`/`display` fields, which the generated model
  // does not carry.
  public getIsos(id: string): Observable<IsoResult[]> {
    return this.apiProxmoxService.getProxmoxVirtualMachineIsos(
      id,
    ) as unknown as Observable<IsoResult[]>;
  }

  // `iso` is the mountValue from getIsos - a Proxmox volume id. The API only accepts values it just
  // handed out for this Vm, so it must be passed through unmodified.
  public mountIso(id: string, iso: string): Observable<ProxmoxVirtualMachine> {
    const data: MountProxmoxVirtualMachineIso = { iso };
    return this.apiProxmoxService.mountProxmoxVirtualMachineIso(id, data);
  }

  /**
   * The Vm's snapshots as the shared snapshot dialog shows them: in tree order, each with its depth,
   * and the one the Vm is running from marked current. `currentSnapshot` (from the Vm model) is only
   * a fallback; Proxmox's own listing carries a synthetic "current" entry whose parent names it.
   */
  public getSnapshots(
    id: string,
    currentSnapshot?: string | null,
  ): Observable<VmSnapshot[]> {
    return this.apiProxmoxService
      .getProxmoxVirtualMachineSnapshots(id)
      .pipe(map((snapshots) => toVmSnapshots(snapshots, currentSnapshot)));
  }

  // Reverts to the snapshot the Vm is currently running from.
  public revertToCurrentSnapshot(id: string): Observable<string> {
    return this.apiProxmoxService.revertProxmoxVirtualMachine(id);
  }

  public revertToSnapshot(id: string, name: string): Observable<string> {
    return this.apiProxmoxService.revertProxmoxVirtualMachineSnapshot(id, name);
  }

  public sendCtrlAltDel() {
    this.novncService.sendCtrlAltDel();
  }

  public sendClipboardText(text: string) {
    this.novncService.sendClipboardText(text);
  }

  // Types the text into the guest as key presses. False when the console is not connected.
  public sendText(text: string): boolean {
    return this.novncService.sendText(text);
  }
}

// The name Proxmox gives the "you are here" pseudo-snapshot in a snapshot listing.
const CURRENT_STATE_ENTRY = 'current';

export function toVmSnapshots(
  snapshots: ProxmoxSnapshot[],
  currentSnapshot?: string | null,
): VmSnapshot[] {
  const currentState = snapshots.find((s) => s.name === CURRENT_STATE_ENTRY);
  const real = snapshots.filter(
    (s) => s.name && s.name !== CURRENT_STATE_ENTRY,
  );
  const current = currentState ? currentState.parent : currentSnapshot;
  const names = new Set(real.map((s) => s.name));

  const children = new Map<string | null, ProxmoxSnapshot[]>();
  for (const snapshot of real) {
    const parent =
      snapshot.parent && names.has(snapshot.parent) ? snapshot.parent : null;
    children.set(parent, [...(children.get(parent) ?? []), snapshot]);
  }

  const result: VmSnapshot[] = [];
  const visit = (parent: string | null, depth: number) => {
    const siblings = [...(children.get(parent) ?? [])].sort(
      (a, b) => (a.snapTime ?? 0) - (b.snapTime ?? 0),
    );
    for (const snapshot of siblings) {
      result.push({
        id: snapshot.name,
        name: snapshot.name,
        description: snapshot.description,
        createTime:
          snapshot.snapTime != null
            ? new Date(snapshot.snapTime * 1000).toISOString()
            : undefined,
        isCurrent: !!current && snapshot.name === current,
        depth,
      });
      visit(snapshot.name, depth + 1);
    }
  };
  visit(null, 0);

  return result;
}
