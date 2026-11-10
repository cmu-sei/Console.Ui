/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { from, Observable, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import {
  ChangeProxmoxVirtualMachineNetwork,
  MountProxmoxVirtualMachineIso,
  ProxmoxService as ApiProxmoxService,
  ProxmoxSnapshot,
  ProxmoxVirtualMachine,
  VmSnapshot,
} from '../../generated/vm-api';
import { IsoResult } from '../../models/vm/iso-result';
import { NoVNCService, ResolutionMode } from '../novnc/novnc.service';

/**
 * The largest file vm.api uploads to a Proxmox guest: PVE's agent/file-write takes at most 61440
 * characters of base64, which is 46080 bytes (45 KB). The API refuses a larger file, but only after
 * receiving all of it, so the console checks first. A deployment can configure a lower limit, which
 * only the API knows; the API's refusal still covers that.
 */
export const PROXMOX_UPLOAD_LIMIT_BYTES = 46080;

/** The files `uploadFiles` would send that are over {@link PROXMOX_UPLOAD_LIMIT_BYTES}. */
export function filesOverUploadLimit(files: FileList | File[]): File[] {
  return Array.from(files).filter((f) => f.size > PROXMOX_UPLOAD_LIMIT_BYTES);
}

/**
 * Says which files are too large, in the API's own words. Sizes are KB to two places, rounded so
 * that a file one byte over the limit never reads as equal to it.
 */
export function uploadLimitMessage(tooLarge: File[]): string {
  const kilobytes = (bytes: number, roundUp: boolean) => {
    const hundredths = (bytes * 100) / 1024;
    return String(
      (roundUp ? Math.ceil(hundredths) : Math.floor(hundredths)) / 100,
    );
  };
  const limit = `${kilobytes(PROXMOX_UPLOAD_LIMIT_BYTES, false)} KB limit for uploading a file to a Proxmox virtual machine`;
  if (tooLarge.length === 1) {
    const [file] = tooLarge;
    return `${file.name} is ${kilobytes(file.size, true)} KB, which exceeds the ${limit}.`;
  }
  return `${tooLarge.map((f) => f.name).join(', ')} exceed the ${limit}.`;
}

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

  // Writes the files into `directory` (which must end in a path separator) through the QEMU guest
  // agent. The API caps the size per file and answers 400 with the reason in the ProblemDetails title.
  public uploadFiles(
    id: string,
    directory: string,
    files: FileList,
  ): Observable<string> {
    return this.apiProxmoxService.uploadFileToProxmoxVirtualMachine(
      id,
      directory,
      Array.from(files),
    );
  }

  // Reads a file from the guest through the QEMU guest agent. A failed request's body arrives as a
  // Blob too, since the request asks for one; it is parsed back into the ProblemDetails object so
  // callers can read the reason the same way as for any other endpoint.
  public downloadFile(id: string, path: string): Observable<Blob> {
    return this.apiProxmoxService
      .downloadFileFromProxmoxVirtualMachine(id, path)
      .pipe(
        catchError((error) =>
          from(parseBlobError(error)).pipe(
            switchMap((parsed) => throwError(() => parsed)),
          ),
        ),
      );
  }

  public fullscreen(): boolean {
    return this.novncService.enterFullscreen();
  }

  public reconnect() {
    this.novncService.requestReconnect();
  }

  // The resolution mode in effect on the console, and whether the server can resize the guest.
  public readonly activeResolution = this.novncService.activeResolution;
  public readonly resizeSupported = this.novncService.resizeSupported;
  // Fires when Match Window Size fell back to scaling because the guest didn't resize.
  public readonly resizeFallback$ = this.novncService.resizeFallback$;

  public setResolutionMode(mode: ResolutionMode) {
    this.novncService.setResolutionMode(mode);
  }

  public refreshResizeSupport() {
    this.novncService.refreshResizeSupport();
  }

  public getGuestClipboard(): string | null {
    return this.novncService.getGuestClipboard();
  }

  public sendCtrlAltDel() {
    this.novncService.sendCtrlAltDel();
  }

  public sendClipboardText(text: string) {
    this.novncService.sendClipboardText(text);
  }

  // Types the text into the guest as key presses. False when the console is not connected.
  public sendText(text: string): Promise<boolean> {
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

async function parseBlobError(error: unknown): Promise<unknown> {
  if (!(error instanceof HttpErrorResponse) || !(error.error instanceof Blob)) {
    return error;
  }

  let body: unknown;
  try {
    const text = await error.error.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    return error;
  }

  return new HttpErrorResponse({
    error: body,
    headers: error.headers,
    status: error.status,
    statusText: error.statusText,
    url: error.url ?? undefined,
  });
}
