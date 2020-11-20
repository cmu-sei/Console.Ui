/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

export * from './file.service';
import { FileService } from './file.service';
export * from './vms.service';
import { VmsService } from './vms.service';
export * from './vsphere.service';
import { VsphereService } from './vsphere.service';
export const APIS = [FileService, VmsService, VsphereService];
