// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
import {
  AppSystemPermission,
  AppTeamPermission,
  AppViewPermission,
  VmPermissionResult,
  VmsService,
} from '../../generated/vm-api';
import { UserPermissionsService } from './user-permissions.service';
import { recordEmissions } from '../../test-utils/record-emissions';
import { ApiStub } from '../../test-utils/api-stub';
import { activatedRouteStub } from '../../test-utils/activated-route';

function permissions(
  overrides: Partial<VmPermissionResult> = {},
): VmPermissionResult {
  return {
    systemPermissions: [],
    teamPermissions: [],
    viewPermissions: [],
    ...overrides,
  };
}

/** Every value of a generated permission enum except one: the near miss for a denied case. */
function allExcept<T extends string>(values: Record<string, T>, excluded: T): T[] {
  return Object.values(values).filter((p) => p !== excluded);
}

function setup(
  options: {
    result?: VmPermissionResult;
    readOnlyParam?: string | null;
  } = {},
) {
  const result = options.result ?? permissions();
  const readOnly = (value: string | null | undefined) =>
    value != null ? { readOnly: value } : {};
  const route = activatedRouteStub(readOnly(options.readOnlyParam));
  const vmsService = {
    getVmPermissions: vi.fn(() => of(result)),
  } satisfies ApiStub<VmsService>;

  TestBed.configureTestingModule({
    providers: [
      { provide: VmsService, useValue: vmsService },
      { provide: ActivatedRoute, useValue: route.route },
    ],
  });

  return {
    service: TestBed.inject(UserPermissionsService),
    vmsService,
    setReadOnlyParam: (value: string | null) =>
      route.setQueryParams(readOnly(value)),
  };
}

describe('UserPermissionsService', () => {
  describe('load()', () => {
    /**
     * Verifies: load() requests the Vm's permissions and republishes the result on permissions$.
     * Interacts with: VmsService.getVmPermissions stub; permissions$.
     * Data: vm 'vm-1' with one team and one view permission.
     */
    it('fetches the Vm permissions and publishes them on permissions$', async () => {
      const result = permissions({
        teamPermissions: [AppTeamPermission.ViewTeamVms],
        viewPermissions: [AppViewPermission.DownloadVmFiles],
      });
      const { service, vmsService } = setup({ result });

      await firstValueFrom(service.load('vm-1'));

      expect(vmsService.getVmPermissions).toHaveBeenCalledWith('vm-1');
      expect(await firstValueFrom(service.permissions$)).toEqual(result);
    });

    /**
     * Verifies: permissions$ starts with empty system/team/view lists before anything is loaded.
     * Interacts with: permissions$ BehaviorSubject seed.
     * Data: no load() call.
     */
    it('starts permissions$ with empty grant lists', async () => {
      const { service } = setup();
      expect(await firstValueFrom(service.permissions$)).toEqual(permissions());
    });

    /**
     * Verifies: an API failure propagates to the caller and leaves permissions$ and readOnlyToggleable$ untouched.
     * Interacts with: VmsService.getVmPermissions stub rejecting; permissions$; readOnlyToggleable$.
     * Data: a 403-like error from the API.
     */
    it('propagates an API error without publishing permissions', async () => {
      const { service, vmsService } = setup();
      vmsService.getVmPermissions.mockReturnValue(
        throwError(() => new Error('Forbidden')),
      );
      const toggleable = recordEmissions(service.readOnlyToggleable$);

      await expect(firstValueFrom(service.load('vm-1'))).rejects.toThrow(
        'Forbidden',
      );

      expect(await firstValueFrom(service.permissions$)).toEqual(permissions());
      expect(toggleable).toEqual([]);
    });

    /**
     * Verifies: load() relies on all three lists being present: a result without systemPermissions makes it throw.
     * Interacts with: VmsService.getVmPermissions stub; the ControlVms check in load().
     * Data: a VmPermissionResult with team and view lists only. vm.api always sends all three (GetVmPermissions.cs:60-65), so this pins the contract the UI assumes, not a defect.
     */
    it('throws when the response has no systemPermissions list', async () => {
      // The generated VmPermissionResult types the lists as optional, but load()
      // reads x.systemPermissions.includes(...) unguarded; this test fails first
      // if vm.api ever stops sending one.
      const { service } = setup({
        result: {
          teamPermissions: [AppTeamPermission.ControlTeamVms],
          viewPermissions: [],
        },
      });

      await expect(firstValueFrom(service.load('vm-1'))).rejects.toThrow(
        TypeError,
      );
    });
  });

  describe('readOnlyToggleable$ (the read-only toggle gate)', () => {
    /**
     * Verifies: the toggle gate stays closed until load() has resolved, so the console page keeps waiting.
     * Interacts with: readOnlyToggleable$ and readOnly$ (ReplaySubject with no seed).
     * Data: no load() call.
     */
    it('emits nothing before permissions are loaded', () => {
      const { service } = setup();
      expect(recordEmissions(service.readOnlyToggleable$)).toEqual([]);
      expect(recordEmissions(service.readOnly$)).toEqual([]);
    });

    const allowed: Array<[string, Partial<VmPermissionResult>]> = [
      [
        'system ControlVms',
        { systemPermissions: [AppSystemPermission.ControlVms] },
      ],
      [
        'team ControlTeamVms',
        { teamPermissions: [AppTeamPermission.ControlTeamVms] },
      ],
      [
        'view ControlViewVms',
        { viewPermissions: [AppViewPermission.ControlViewVms] },
      ],
    ];

    /**
     * Verifies: each of the three Vm control permissions on its own lets the user leave read-only.
     * Interacts with: load(); readOnlyToggleable$.
     * Data: a VmPermissionResult holding only the named control permission.
     */
    it.each(allowed)('allows the toggle with %s', async (_label, grant) => {
      const { service } = setup({ result: permissions(grant) });
      await firstValueFrom(service.load('vm-1'));
      expect(await firstValueFrom(service.readOnlyToggleable$)).toBe(true);
    });

    const denied: Array<[string, Partial<VmPermissionResult>]> = [
      [
        'every system permission but ControlVms',
        { systemPermissions: allExcept(AppSystemPermission, AppSystemPermission.ControlVms) },
      ],
      [
        'every team permission but ControlTeamVms',
        { teamPermissions: allExcept(AppTeamPermission, AppTeamPermission.ControlTeamVms) },
      ],
      [
        'every view permission but ControlViewVms',
        { viewPermissions: allExcept(AppViewPermission, AppViewPermission.ControlViewVms) },
      ],
      [
        'the view and manage permissions of every tier',
        {
          systemPermissions: [
            AppSystemPermission.ViewViews,
            AppSystemPermission.ManageViews,
            AppSystemPermission.ViewVms,
          ],
          teamPermissions: [
            AppTeamPermission.ViewTeam,
            AppTeamPermission.ManageTeam,
            AppTeamPermission.ViewTeamVms,
          ],
          viewPermissions: [
            AppViewPermission.ViewView,
            AppViewPermission.ManageView,
            AppViewPermission.ViewViewVms,
          ],
        },
      ],
    ];

    /**
     * Verifies: every permission short of a Vm control permission keeps the toggle closed.
     * Interacts with: load(); readOnlyToggleable$.
     * Data: the near miss named in the row.
     * Why: #744 replaced the EditTeam/EditView gate; the last row pins that ManageTeam, ManageView and the ViewVms family no longer grant control.
     */
    it.each(denied)('denies the toggle with %s', async (_label, grant) => {
      const { service } = setup({ result: permissions(grant) });
      await firstValueFrom(service.load('vm-1'));
      expect(await firstValueFrom(service.readOnlyToggleable$)).toBe(false);
    });

    /**
     * Verifies: the removed EditTeam/EditView values no longer open the toggle if an old API still sends them.
     * Interacts with: load(); readOnlyToggleable$.
     * Data: raw 'EditTeam' / 'EditView' strings cast into the team/view lists.
     */
    it('ignores the removed EditTeam and EditView permissions', async () => {
      const { service } = setup({
        result: permissions({
          teamPermissions: ['EditTeam' as AppTeamPermission],
          viewPermissions: ['EditView' as AppViewPermission],
        }),
      });
      await firstValueFrom(service.load('vm-1'));
      expect(await firstValueFrom(service.readOnlyToggleable$)).toBe(false);
    });

    /**
     * Verifies: reloading with fewer permissions closes a previously open toggle.
     * Interacts with: VmsService.getVmPermissions stub (two results); readOnlyToggleable$ emissions.
     * Data: first load grants ControlTeamVms, second load only ViewTeamVms.
     */
    it('re-evaluates the gate on every load', async () => {
      const { service, vmsService } = setup({
        result: permissions({
          teamPermissions: [AppTeamPermission.ControlTeamVms],
        }),
      });
      const seen = recordEmissions(service.readOnlyToggleable$);

      await firstValueFrom(service.load('vm-1'));
      vmsService.getVmPermissions.mockReturnValue(
        of(permissions({ teamPermissions: [AppTeamPermission.ViewTeamVms] })),
      );
      await firstValueFrom(service.load('vm-1'));

      expect(seen).toEqual([true, false]);
    });
  });

  describe('readOnly$', () => {
    /**
     * Verifies: a user who can't toggle is forced read-only even when the URL asks for read-write.
     * Interacts with: load(); readOnly$ combining the gate and the readOnly query param.
     * Data: view ViewViewVms and team ViewTeamVms, but no control permission; readOnly=false in the query string.
     */
    it('is forced to true without the toggle permission, whatever the query param says', async () => {
      const { service } = setup({
        readOnlyParam: 'false',
        result: permissions({
          teamPermissions: [AppTeamPermission.ViewTeamVms],
          viewPermissions: [AppViewPermission.ViewViewVms],
        }),
      });
      await firstValueFrom(service.load('vm-1'));
      expect(await firstValueFrom(service.readOnly$)).toBe(true);
    });

    /**
     * Verifies: a user who can toggle starts read-write when no readOnly param is present.
     * Interacts with: load(); readOnly$.
     * Data: system ControlVms; no query param.
     */
    it('defaults to false for a user who can toggle', async () => {
      const { service } = setup({
        result: permissions({
          systemPermissions: [AppSystemPermission.ControlVms],
        }),
      });
      await firstValueFrom(service.load('vm-1'));
      expect(await firstValueFrom(service.readOnly$)).toBe(false);
    });

    const params: Array<[string, boolean]> = [
      ['true', true],
      ['TRUE', true],
      ['True', true],
      ['false', false],
      ['yes', false],
      ['', false],
    ];

    /**
     * Verifies: for a user who can toggle, only a case-insensitive 'true' readOnly param selects read-only.
     * Interacts with: load(); readOnly$ reading ActivatedRoute.queryParamMap.
     * Data: view ControlViewVms; the readOnly query param under test.
     */
    it.each(params)(
      'maps readOnly=%j to %s for a user who can toggle',
      async (param, expected) => {
        const { service } = setup({
          readOnlyParam: param,
          result: permissions({
            viewPermissions: [AppViewPermission.ControlViewVms],
          }),
        });
        await firstValueFrom(service.load('vm-1'));
        expect(await firstValueFrom(service.readOnly$)).toBe(expected);
      },
    );

    /**
     * Verifies: readOnly$ follows the query param as the toggle navigates, for a user who can toggle.
     * Interacts with: load(); readOnly$; the ActivatedRoute queryParamMap subject.
     * Data: team ControlTeamVms; param goes none → 'true' → 'false'.
     */
    it('follows readOnly query param changes', async () => {
      const { service, setReadOnlyParam } = setup({
        result: permissions({
          teamPermissions: [AppTeamPermission.ControlTeamVms],
        }),
      });
      await firstValueFrom(service.load('vm-1'));
      const seen = recordEmissions(service.readOnly$);

      setReadOnlyParam('true');
      setReadOnlyParam('false');

      expect(seen).toEqual([false, true, false]);
    });
  });

  describe('can()', () => {
    /**
     * Verifies: can() grants on a matching team permission.
     * Interacts with: load(); can().
     * Data: team UploadTeamIsos; asked for UploadTeamIsos with no view permission.
     */
    it('grants on a matching team permission', async () => {
      const { service } = setup({
        result: permissions({
          teamPermissions: [AppTeamPermission.UploadTeamIsos],
        }),
      });
      await firstValueFrom(service.load('vm-1'));
      expect(
        await firstValueFrom(service.can(AppTeamPermission.UploadTeamIsos)),
      ).toBe(true);
    });

    /**
     * Verifies: can() grants on a matching view permission when no team permission is asked for.
     * Interacts with: load(); can(null, viewPermission) as OptionsBarComponent calls it.
     * Data: view DownloadVmFiles.
     */
    it('grants on a matching view permission', async () => {
      const { service } = setup({
        result: permissions({
          viewPermissions: [AppViewPermission.DownloadVmFiles],
        }),
      });
      await firstValueFrom(service.load('vm-1'));
      expect(
        await firstValueFrom(
          service.can(null, AppViewPermission.DownloadVmFiles),
        ),
      ).toBe(true);
    });

    /**
     * Verifies: can() denies when neither the team nor the view permission is held.
     * Interacts with: load(); can().
     * Data: view UploadVmFiles held; asked for RevertVms.
     */
    it('denies when neither permission is held', async () => {
      const { service } = setup({
        result: permissions({
          viewPermissions: [AppViewPermission.UploadVmFiles],
        }),
      });
      await firstValueFrom(service.load('vm-1'));
      expect(
        await firstValueFrom(service.can(null, AppViewPermission.RevertVms)),
      ).toBe(false);
    });

    /**
     * Verifies: can() consults only team and view grants; a system permission alone never satisfies it.
     * Interacts with: load(); can().
     * Data: every system permission granted; asked for view DownloadVmFiles.
     * Why: vm.api has no system-level equivalent of the per-view file and snapshot permissions, so this pins the current scope rather than a bug.
     */
    it('ignores system permissions', async () => {
      const { service } = setup({
        result: permissions({
          systemPermissions: Object.values(AppSystemPermission),
        }),
      });
      await firstValueFrom(service.load('vm-1'));
      expect(
        await firstValueFrom(
          service.can(null, AppViewPermission.DownloadVmFiles),
        ),
      ).toBe(false);
    });

    /**
     * Verifies: can() re-emits when permissions are reloaded.
     * Interacts with: VmsService.getVmPermissions stub (two results); can() emissions.
     * Data: empty initial state, then a load granting view RevertVms.
     */
    it('updates when permissions load', async () => {
      const { service } = setup({
        result: permissions({ viewPermissions: [AppViewPermission.RevertVms] }),
      });
      const seen = recordEmissions(
        service.can(null, AppViewPermission.RevertVms),
      );
      await firstValueFrom(service.load('vm-1'));
      expect(seen).toEqual([false, true]);
    });
  });
});
