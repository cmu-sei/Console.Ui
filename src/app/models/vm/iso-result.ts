// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

export interface IsoResult {
  viewId: string;
  viewName: string;
  isos: IsoFile[];
  teamIsoResults: TeamIsoResult[];
  hide: boolean;
  display: IsoFile[];
}

export interface TeamIsoResult {
  teamId: string;
  teamName: string;
  isos: IsoFile[];
  hide: boolean;
  display: IsoFile[];
}

export interface IsoFile {
  // The hypervisor folder this file sits in. vSphere only - Proxmox ISO storage is flat, so a
  // Proxmox row leaves it unset. Superseded by mountValue; kept for older callers.
  path?: string;
  filename: string;
  // The exact token this file's hypervisor wants in its mount call, computed by the API so the
  // client never assembles one. Always prefer it over path + filename.
  mountValue?: string;
  // Hypervisors that are missing this file. Only ever populated on the management listing in vm.ui,
  // never on the per-Vm listing a mount picker uses, but declared here since it's the same shape.
  missingProviders?: string[];
}
