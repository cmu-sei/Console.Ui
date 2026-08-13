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
  filename: string;
  // The exact token this file's hypervisor wants in its mount call, computed by the API so the
  // client never assembles one. Always present: this is the per-Vm listing, whose whole purpose is
  // to be mountable.
  mountValue: string;
}
