// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

// APP-SPECIFIC. console.ui's permission service is UserPermissionsService. It
// reads the caller's grants for one Vm from `VmsService.getVmPermissions`
// (system, team and view tiers in a single result) and the `readOnly` query
// param from ActivatedRoute. `permissionDataProviders(grants)` provides the
// REAL service over a stubbed endpoint, so the gate logic under test is the
// production code, not a re-implementation that can drift from it.

import { inject, Provider } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { vi } from 'vitest';
import { of } from 'rxjs';
import {
  AppSystemPermission,
  AppTeamPermission,
  AppViewPermission,
  VmPermissionResult,
  VmsService,
} from '../generated/vm-api';
import { UserPermissionsService } from '../services/user-permissions/user-permissions.service';
import { ApiStub } from './api-stub';

export interface PermissionGrants {
  system?: AppSystemPermission[];
  team?: AppTeamPermission[];
  view?: AppViewPermission[];
}

/** The Vm id the providers prime UserPermissionsService with. */
export const PERMISSION_TEST_VM_ID = 'vm-1';

export function permissionResult(
  grants: PermissionGrants = {},
): VmPermissionResult {
  return {
    systemPermissions: [...(grants.system ?? [])],
    teamPermissions: [...(grants.team ?? [])],
    viewPermissions: [...(grants.view ?? [])],
  };
}

export function permissionApiStubs(grants: PermissionGrants = {}) {
  return {
    vms: {
      getVmPermissions: vi.fn(() => of(permissionResult(grants))),
    } satisfies ApiStub<VmsService>,
  };
}

export function permissionDataProviders(
  grants: PermissionGrants = {},
): Provider[] {
  const stubs = permissionApiStubs(grants);
  return [
    { provide: VmsService, useValue: stubs.vms },
    {
      provide: UserPermissionsService,
      // inject() resolves the stub above (or a test's own VmsService and
      // ActivatedRoute overrides) with the real types, so no casts are needed.
      useFactory: () => {
        const service = new UserPermissionsService(
          inject(VmsService),
          inject(ActivatedRoute),
        );
        service.load(PERMISSION_TEST_VM_ID).subscribe();
        return service;
      },
    },
  ];
}
