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
  path: string;
  filename: string;
}
