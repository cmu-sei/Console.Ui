// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

export enum VirtualMachineToolsStatus {
  toolsNotInstalled = 'toolsNotInstalled',
  toolsNotRunning = 'toolsNotRunning',
  toolsOld = 'toolsOld',
  toolsOk = 'toolsOk',
}

export interface VmResolution {
  width: number;
  height: number;
}

export class VmModel {
  name: string;
  url: string;
  id: string;
  ticket: string;
  state: string;
  isOwner: boolean;
  networkCards: any;
  canAccessNicConfiguration: boolean;
  vmToolsStatus: VirtualMachineToolsStatus;

  constructor() {
    this.id = null;
    this.name = null;
    this.url = null;
    this.ticket = null;
    this.state = null;
    this.isOwner = false;
    this.canAccessNicConfiguration = false;
    this.networkCards = { currentNetworks: {}, availableNetworks: {} };
    this.vmToolsStatus = VirtualMachineToolsStatus.toolsNotRunning;
  }
}
