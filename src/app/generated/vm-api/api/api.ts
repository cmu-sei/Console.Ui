/*
Copyright 2021 Carnegie Mellon University. All Rights Reserved. 
 Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
*/

export * from './callbacks.service';
import { CallbacksService } from './callbacks.service';
export * from './file.service';
import { FileService } from './file.service';
export * from './health.service';
import { HealthService } from './health.service';
export * from './proxmox.service';
import { ProxmoxService } from './proxmox.service';
export * from './vmUsageLoggingSession.service';
import { VmUsageLoggingSessionService } from './vmUsageLoggingSession.service';
export * from './vms.service';
import { VmsService } from './vms.service';
export * from './vsphere.service';
import { VsphereService } from './vsphere.service';
export const APIS = [CallbacksService, FileService, HealthService, ProxmoxService, VmUsageLoggingSessionService, VmsService, VsphereService];
