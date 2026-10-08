// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, Input } from '@angular/core';
import { By } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { screen } from '@testing-library/angular';
import { Observable, of, Subject, throwError } from 'rxjs';
import { RouterQuery } from '@datorama/akita-ng-router-store';
import {
  AppSystemPermission,
  AppTeamPermission,
  AppViewPermission,
  Vm,
  VmPermissionResult,
  VmsService,
  VmType,
} from '../../generated/vm-api';
import { SignalRService } from '../../services/signalr/signalr.service';
import { UserPermissionsService } from '../../services/user-permissions/user-permissions.service';
import { VmService } from '../../state/vm/vm.service';
import { ConsolePageComponent } from './console-page.component';
import { ConsoleComponent } from '../console/console.component';
import { renderComponent } from '../../test-utils/render-component';
import { ApiStub } from '../../test-utils/api-stub';
import {
  captureUnhandledRxErrors,
  flush,
} from '../../test-utils/unhandled-rx-errors';
import { activatedRouteStub } from '../../test-utils/activated-route';
import { permissionResult } from '../../test-utils/mock-permission-data.service';

@Component({ selector: 'app-console', template: '' })
class ConsoleStubComponent {
  @Input() readOnly: boolean;
  @Input() allowReadOnlyToggle: boolean;
  @Input() vmId: string;
}

type SignalRStub = Pick<
  SignalRService,
  | 'startConnection'
  | 'joinVm'
  | 'leaveVm'
  | 'setActiveVirtualMachine'
  | 'unsetActiveVirtualMachine'
>;

async function renderConsolePage(
  overrides: {
    vm?: Observable<Vm>;
    permissions?: Observable<VmPermissionResult>;
    readOnlyParam?: string;
    startConnection?: SignalRService['startConnection'];
  } = {},
) {
  // The real VmService and UserPermissionsService run; only the API is stubbed.
  const vmsService = {
    getVm: vi.fn(
      () => overrides.vm ?? of({ id: 'vm-1', name: 'Alpha', type: VmType.Vsphere }),
    ),
    getVmPermissions: vi.fn(() => overrides.permissions ?? of(permissionResult())),
  } satisfies ApiStub<VmsService>;
  const signalr: SignalRStub = {
    startConnection: overrides.startConnection ?? vi.fn(() => Promise.resolve()),
    joinVm: vi.fn(),
    leaveVm: vi.fn(),
    setActiveVirtualMachine: vi.fn(),
    unsetActiveVirtualMachine: vi.fn(),
  };
  const routerQuery: Pick<RouterQuery, 'getParams' | 'selectParams'> = {
    getParams: (() => 'vm-1') as RouterQuery['getParams'],
    selectParams: (() => of('vm-1')) as RouterQuery['selectParams'],
  };
  const query = overrides.readOnlyParam
    ? { readOnly: overrides.readOnlyParam }
    : {};

  const rendered = await renderComponent(ConsolePageComponent, {
    childStubs: [{ replace: ConsoleComponent, with: ConsoleStubComponent }],
    providers: [
      VmService,
      UserPermissionsService,
      { provide: VmsService, useValue: vmsService },
      { provide: SignalRService, useValue: signalr },
      { provide: RouterQuery, useValue: routerQuery },
      { provide: ActivatedRoute, useValue: activatedRouteStub(query).route },
    ],
  });

  const consoleStub = () =>
    rendered.fixture.debugElement.query(By.directive(ConsoleStubComponent))
      ?.componentInstance as ConsoleStubComponent | undefined;

  return { ...rendered, vmsService, signalr, consoleStub };
}

describe('ConsolePageComponent', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  describe('read-only gate', () => {
    /**
     * Verifies: the console is held back until the Vm permissions have loaded, then rendered.
     * Interacts with: real UserPermissionsService over a VmsService.getVmPermissions Subject; the app-console stub.
     * Data: permissions Subject that emits after the first render.
     */
    it('waits for permissions before rendering the console', async () => {
      const permissions$ = new Subject<VmPermissionResult>();
      const { fixture, consoleStub } = await renderConsolePage({
        permissions: permissions$,
      });
      expect(consoleStub()).toBeUndefined();

      permissions$.next(permissionResult());
      fixture.detectChanges();

      expect(consoleStub()).toBeDefined();
    });

    /**
     * Verifies: a user who can view and manage but not control the Vm gets a read-only console with no toggle.
     * Interacts with: real UserPermissionsService gate; the inputs that reach the app-console stub.
     * Data: the view and manage permissions next to each control permission (system ViewVms and ManageViews, team ViewTeamVms and ManageTeam, view ViewViewVms and ManageView); no readOnly query param.
     */
    it('renders read-only without the toggle for a user who cannot control the Vm', async () => {
      const { consoleStub } = await renderConsolePage({
        permissions: of(
          permissionResult({
            system: [AppSystemPermission.ViewVms, AppSystemPermission.ManageViews],
            team: [AppTeamPermission.ViewTeamVms, AppTeamPermission.ManageTeam],
            view: [AppViewPermission.ViewViewVms, AppViewPermission.ManageView],
          }),
        ),
      });
      expect(consoleStub()?.readOnly).toBe(true);
      expect(consoleStub()?.allowReadOnlyToggle).toBe(false);
      expect(consoleStub()?.vmId).toBe('vm-1');
    });

    /**
     * Verifies: a user whose only grant is the view-scoped ControlViewVms gets an interactive console and the toggle.
     * Interacts with: real UserPermissionsService gate (view tier); app-console stub inputs.
     * Data: view ControlViewVms alone, no system or team permissions; no readOnly query param.
     */
    it('renders interactive with the toggle for a view Vm controller', async () => {
      const { consoleStub } = await renderConsolePage({
        permissions: of(permissionResult({ view: [AppViewPermission.ControlViewVms] })),
      });
      expect(consoleStub()?.readOnly).toBe(false);
      expect(consoleStub()?.allowReadOnlyToggle).toBe(true);
      expect(consoleStub()?.vmId).toBe('vm-1');
    });

    /**
     * Verifies: a user with ControlTeamVms gets an interactive console and the toggle.
     * Interacts with: real UserPermissionsService gate; app-console stub inputs.
     * Data: team ControlTeamVms; no readOnly query param.
     */
    it('renders interactive with the toggle for a team Vm controller', async () => {
      const { consoleStub } = await renderConsolePage({
        permissions: of(
          permissionResult({ team: [AppTeamPermission.ControlTeamVms] }),
        ),
      });
      expect(consoleStub()?.readOnly).toBe(false);
      expect(consoleStub()?.allowReadOnlyToggle).toBe(true);
    });

    /**
     * Verifies: a controller who chose read-only (readOnly=true in the URL) keeps the toggle but starts read-only.
     * Interacts with: real UserPermissionsService gate reading ActivatedRoute.queryParamMap; app-console stub inputs.
     * Data: system ControlVms; ?readOnly=true.
     */
    it('honours readOnly=true for a user who can toggle', async () => {
      const { consoleStub } = await renderConsolePage({
        readOnlyParam: 'true',
        permissions: of(
          permissionResult({ system: [AppSystemPermission.ControlVms] }),
        ),
      });
      expect(consoleStub()?.readOnly).toBe(true);
      expect(consoleStub()?.allowReadOnlyToggle).toBe(true);
    });
  });

  describe('missing Vm', () => {
    /**
     * Verifies: a Vm the user can't see, or that no longer exists, shows the not-found message and starts nothing else.
     * Interacts with: VmsService.getVm stub rejecting; VmsService.getVmPermissions; SignalRService stub.
     * Data: getVm fails with the status under test.
     */
    it.each([403, 404])('shows "VM Not Found" on a %i', async (status) => {
      const { vmsService, signalr, consoleStub } = await renderConsolePage({
        vm: throwError(() => ({ status })),
      });

      expect(
        screen.getByRole('heading', { name: 'VM Not Found' }),
      ).toBeInTheDocument();
      expect(consoleStub()).toBeUndefined();
      expect(vmsService.getVmPermissions).not.toHaveBeenCalled();
      expect(signalr.startConnection).not.toHaveBeenCalled();
    });

    /**
     * Verifies: any other failure loading the Vm leaves the page empty, with neither the console nor a message.
     * Interacts with: VmsService.getVm stub rejecting with a 500.
     * Data: getVm fails with status 500.
     */
    it('renders nothing when loading the Vm fails for another reason', async () => {
      const { fixture, consoleStub } = await renderConsolePage({
        vm: throwError(() => ({ status: 500 })),
      });
      expect(consoleStub()).toBeUndefined();
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
      expect(fixture.nativeElement.textContent.trim()).toBe('');
    });

    /**
     * Verifies: a failed permissions request escapes as an unhandled error and leaves the page blank, with no presence join.
     * Interacts with: real UserPermissionsService over a VmsService.getVmPermissions stub that errors; SignalRService stub; rxjs unhandled-error hook.
     * Data: getVm succeeds; getVmPermissions fails with a 500.
     */
    it('leaves the page blank and the error unhandled when permissions fail to load', async () => {
      const errors = captureUnhandledRxErrors();
      const failure = new HttpErrorResponse({ status: 500 });
      const { fixture, signalr, consoleStub } = await renderConsolePage({
        permissions: throwError(() => failure),
      });
      await flush();

      expect(errors).toEqual([failure]);
      expect(consoleStub()).toBeUndefined();
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
      expect(fixture.nativeElement.textContent.trim()).toBe('');
      expect(signalr.startConnection).not.toHaveBeenCalled();
    });
  });

  describe('presence and title', () => {
    /**
     * Verifies: once permissions load the page joins the Vm's SignalR group and, if the window has focus, marks it active.
     * Interacts with: SignalRService stub; document.hasFocus spy.
     * Data: Vm 'vm-1'; window focused.
     */
    it('joins the Vm group and marks it active when focused', async () => {
      vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      const { signalr } = await renderConsolePage();
      await flush();

      expect(signalr.joinVm).toHaveBeenCalledWith('vm-1');
      expect(signalr.setActiveVirtualMachine).toHaveBeenCalledWith('vm-1');
    });

    /**
     * Verifies: an unfocused window joins the group without claiming the Vm as active.
     * Interacts with: SignalRService stub; document.hasFocus spy.
     * Data: window not focused.
     */
    it('does not mark the Vm active when the window is not focused', async () => {
      vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      const { signalr } = await renderConsolePage();
      await flush();

      expect(signalr.joinVm).toHaveBeenCalledWith('vm-1');
      expect(signalr.setActiveVirtualMachine).not.toHaveBeenCalled();
    });

    /**
     * Verifies: the browser tab title follows the Vm's name in the real Vm store.
     * Interacts with: real VmService/VmStore/VmQuery; Angular Title (document.title).
     * Data: Vm 'Alpha', then renamed to 'Beta' in the store.
     */
    it('titles the tab with the Vm name and follows renames', async () => {
      const { fixture } = await renderConsolePage();
      expect(document.title).toBe('Alpha');

      fixture.debugElement.injector.get(VmService).update('vm-1', { name: 'Beta' });

      expect(document.title).toBe('Beta');
    });

    /**
     * Verifies: window focus and blur set and unset the active Vm.
     * Interacts with: the component's window:focus / window:blur host listeners; SignalRService stub.
     * Data: focus then blur events on window.
     */
    it('sets the active Vm on focus and clears it on blur', async () => {
      const { signalr } = await renderConsolePage();
      vi.mocked(signalr.setActiveVirtualMachine).mockClear();

      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('blur'));

      expect(signalr.setActiveVirtualMachine).toHaveBeenCalledWith('vm-1');
      expect(signalr.unsetActiveVirtualMachine).toHaveBeenCalledOnce();
    });

    /**
     * Verifies: leaving the page leaves the Vm's SignalR group.
     * Interacts with: ComponentFixture.destroy; SignalRService.leaveVm stub.
     * Data: Vm 'vm-1'.
     */
    it('leaves the Vm group on destroy', async () => {
      const { fixture, signalr } = await renderConsolePage();
      fixture.destroy();
      expect(signalr.leaveVm).toHaveBeenCalledWith('vm-1');
    });

    /**
     * Verifies: a hub that fails to start leaves an unhandled rejection and no presence join (current behavior).
     * Interacts with: SignalRService.startConnection (a plain function returning a rejected promise); captureUnhandledRxErrors.
     * Data: startConnection rejects with 'hub down'.
     * Why: a vi.fn marks the rejections it returns as handled, so this stub is a plain function. The rejection happens inside the Angular zone, and the ComponentFixture rethrows NgZone.onError from an rxjs subscriber, so it surfaces through rxjs's unhandled-error hook.
     */
    it('lets a failed hub start escape unhandled', async () => {
      const errors = captureUnhandledRxErrors();
      const failure = new Error('hub down');
      const { signalr } = await renderConsolePage({
        startConnection: () => Promise.reject(failure),
      });
      await flush();

      expect(errors).toEqual([failure]);
      expect(signalr.joinVm).not.toHaveBeenCalled();
    });
  });
});
