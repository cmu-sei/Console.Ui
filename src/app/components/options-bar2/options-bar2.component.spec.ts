// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { MatSlideToggleHarness } from '@angular/material/slide-toggle/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { fireEvent, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { BehaviorSubject, NEVER, Observable, of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { getDefaultNormalizer } from '@testing-library/angular';
import { SignalRService } from '../../services/signalr/signalr.service';
import { NotificationService } from '../../services/notification/notification.service';
import { NotificationData } from '../../models/notification/notification-model';
import {
  ComnAuthQuery,
  ComnAuthService,
  CrucibleDialogService,
  Theme,
} from '@cmusei/crucible-common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AppSystemPermission,
  AppViewPermission,
  ProxmoxService as ApiProxmoxService,
  ProxmoxVirtualMachine,
  Vm,
  VmType,
  VsphereService as ApiVsphereService,
  VsphereVirtualMachine,
} from '../../generated/vm-api';
import { DialogService } from '../../services/dialog/dialog.service';
import { ProxmoxService } from '../../services/proxmox/proxmox.service';
import { PowerAction, VmService } from '../../state/vm/vm.service';
import { VsphereService } from '../../state/vsphere/vsphere.service';
import {
  GUEST_AGENT_TOOLTIP,
  OptionsBar2Component,
  fileNameOf,
  formatConnectedUsers,
  toDirectory,
} from './options-bar2.component';
import { FileUploadProgressDialogComponent } from '../shared/file-upload-progress-dialog/file-upload-progress-dialog.component';
import { renderComponent } from '../../test-utils/render-component';
import { ApiStub } from '../../test-utils/api-stub';
import {
  PermissionGrants,
  permissionDataProviders,
} from '../../test-utils/mock-permission-data.service';
import { dialogRefStub, dismissedDialogRefStub } from '../../test-utils/dialog-refs';
import { stubClipboard } from '../../test-utils/clipboard';
import { fileList } from '../../test-utils/file-list';
import { MatTooltipHarness } from '@angular/material/tooltip/testing';
import {
  captureUnhandledRxErrors,
  flush,
} from '../../test-utils/unhandled-rx-errors';

const PROXMOX_VM: Vm = { id: 'vm-1', name: 'Alpha', type: VmType.Proxmox };

function networkVm(
  overrides: Partial<ProxmoxVirtualMachine> = {},
): ProxmoxVirtualMachine {
  return {
    id: 'vm-1',
    canAccessNicConfiguration: true,
    canMountIso: false,
    networkCards: {
      availableNetworks: { vmbr0: 'Lab', vmbr1: 'Internet', vmbr9: 'Locked' },
      currentNetworks: { net0: 'vmbr0' },
      readOnlyNetworks: ['vmbr9'],
    },
    ...overrides,
  };
}

async function renderOptionsBar2(
  overrides: {
    vm?: Vm;
    readOnly?: boolean;
    allowReadOnlyToggle?: boolean;
    networkVm?: Observable<ProxmoxVirtualMachine>;
    // 'dismissed': the confirm dialog closes without an answer (Esc, backdrop).
    confirmation?: boolean | 'dismissed';
    // When given, the real UserPermissionsService is primed with these grants.
    grants?: PermissionGrants;
  } = {},
) {
  const vm = overrides.vm ?? PROXMOX_VM;
  // The real VmService routes power actions to the generated API for the Vm's
  // provider; only those endpoints are stubbed.
  const apiProxmox = {
    powerOnProxmoxVirtualMachine: vi.fn(() => of('submitted')),
    powerOffProxmoxVirtualMachine: vi.fn(() => of('submitted')),
    rebootProxmoxVirtualMachine: vi.fn(() => of('submitted')),
    shutdownProxmoxVirtualMachine: vi.fn(() => of('submitted')),
  } satisfies ApiStub<ApiProxmoxService>;
  const apiVsphere = {
    powerOnVsphereVirtualMachine: vi.fn(() => of('submitted')),
  } satisfies ApiStub<ApiVsphereService>;
  const proxmox = {
    getVm: vi.fn<ProxmoxService['getVm']>(() => overrides.networkVm ?? of(networkVm())),
    changeNic: vi.fn<ProxmoxService['changeNic']>(() =>
      of(networkVm({ networkCards: { ...networkVm().networkCards, currentNetworks: { net0: 'vmbr1' } } })),
    ),
    getIsos: vi.fn<ProxmoxService['getIsos']>(() => of([])),
    mountIso: vi.fn<ProxmoxService['mountIso']>(() => of(networkVm())),
    sendCtrlAltDel: vi.fn<ProxmoxService['sendCtrlAltDel']>(),
    sendClipboardText: vi.fn<ProxmoxService['sendClipboardText']>(),
    sendText: vi.fn<ProxmoxService['sendText']>(() => true),
    getSnapshots: vi.fn<ProxmoxService['getSnapshots']>(() =>
      of([
        { id: 'clean', name: 'clean', isCurrent: true, depth: 0 },
        { id: 'later', name: 'later', isCurrent: false, depth: 1 },
      ]),
    ),
    revertToCurrentSnapshot: vi.fn<ProxmoxService['revertToCurrentSnapshot']>(() => of('ok')),
    revertToSnapshot: vi.fn<ProxmoxService['revertToSnapshot']>(() => of('ok')),
    uploadFiles: vi.fn<ProxmoxService['uploadFiles']>(() => of('uploaded')),
    downloadFile: vi.fn<ProxmoxService['downloadFile']>(() => of(new Blob(['127.0.0.1 localhost']))),
    fullscreen: vi.fn<ProxmoxService['fullscreen']>(() => true),
    reconnect: vi.fn<ProxmoxService['reconnect']>(),
    getGuestClipboard: vi.fn<ProxmoxService['getGuestClipboard']>(() => 'guest text'),
  } satisfies Pick<
    ProxmoxService,
    | 'getVm'
    | 'changeNic'
    | 'getIsos'
    | 'mountIso'
    | 'sendCtrlAltDel'
    | 'sendClipboardText'
    | 'sendText'
    | 'getSnapshots'
    | 'revertToCurrentSnapshot'
    | 'revertToSnapshot'
    | 'uploadFiles'
    | 'downloadFile'
    | 'fullscreen'
    | 'reconnect'
    | 'getGuestClipboard'
  >;
  const vsphere = {
    getVm: vi.fn<VsphereService['getVm']>(() => of(networkVm() as VsphereVirtualMachine)),
    changeNic: vi.fn(() => of({})),
  } satisfies Pick<VsphereService, 'getVm' | 'changeNic'>;
  const progress = dialogRefStub<FileUploadProgressDialogComponent, void>();
  const dialogs = {
    mountIso: vi.fn<DialogService['mountIso']>(() => of(undefined)),
    sendText: vi.fn<DialogService['sendText']>(() => of(undefined)),
    selectSnapshot: vi.fn<DialogService['selectSnapshot']>(() => of(undefined)),
    getFileUploadInfo: vi.fn<DialogService['getFileUploadInfo']>(() => of(undefined)),
    uploadProgress: vi.fn<DialogService['uploadProgress']>(() => progress.dialogRef),
  } satisfies Pick<
    DialogService,
    'mountIso' | 'sendText' | 'selectSnapshot' | 'getFileUploadInfo' | 'uploadProgress'
  >;
  const confirm = vi.fn<CrucibleDialogService['confirm']>(() =>
    overrides.confirmation === 'dismissed'
      ? dismissedDialogRefStub<unknown, boolean>().dialogRef
      : dialogRefStub<unknown, boolean>(overrides.confirmation).dialogRef,
  );
  const crucibleDialog = { confirm } satisfies Pick<CrucibleDialogService, 'confirm'>;
  const auth = { setUserTheme: vi.fn() } satisfies Pick<ComnAuthService, 'setUserTheme'>;
  const snackBar = { open: vi.fn() } satisfies Pick<MatSnackBar, 'open'>;
  const currentVmUsers$ = new BehaviorSubject<string[]>([]);
  const signalr = { currentVmUsers$ } satisfies Pick<SignalRService, 'currentVmUsers$'>;
  const tasksInProgress = new BehaviorSubject<NotificationData[]>([]);
  const notifications = {
    tasksInProgress,
    // The hub connection is not under test; a never-settling promise keeps it inert.
    connectToProgressHub: vi.fn(() => new Promise<void>(() => undefined)),
  } satisfies Pick<NotificationService, 'tasksInProgress' | 'connectToProgressHub'>;

  const rendered = await renderComponent(OptionsBar2Component, {
    inputs: {
      vm,
      readOnly: overrides.readOnly ?? false,
      allowReadOnlyToggle: overrides.allowReadOnlyToggle ?? false,
    },
    providers: [
      VmService,
      { provide: ApiProxmoxService, useValue: apiProxmox },
      { provide: ApiVsphereService, useValue: apiVsphere },
      { provide: ProxmoxService, useValue: proxmox },
      { provide: VsphereService, useValue: vsphere },
      { provide: DialogService, useValue: dialogs },
      { provide: CrucibleDialogService, useValue: crucibleDialog },
      { provide: ComnAuthService, useValue: auth },
      {
        provide: ComnAuthQuery,
        useValue: { userTheme$: of(Theme.LIGHT) } satisfies Pick<ComnAuthQuery, 'userTheme$'>,
      },
      { provide: MatSnackBar, useValue: snackBar },
      { provide: SignalRService, useValue: signalr },
      { provide: NotificationService, useValue: notifications },
      ...(overrides.grants ? permissionDataProviders(overrides.grants) : []),
    ],
  });
  await rendered.fixture.whenStable();
  // The console page stores the Vm before this bar renders; VmService reads it
  // from the real Vm store to pick the provider.
  rendered.fixture.debugElement.injector.get(VmService).add(vm);

  return {
    ...rendered,
    apiProxmox,
    apiVsphere,
    proxmox,
    vsphere,
    dialogs,
    progress,
    confirm,
    auth,
    snackBar,
    currentVmUsers$,
    notifications,
    tasksInProgress,
  };
}

type Fixture = ComponentFixture<OptionsBar2Component>;
type ProxmoxPowerMethod =
  | 'powerOffProxmoxVirtualMachine'
  | 'rebootProxmoxVirtualMachine'
  | 'shutdownProxmoxVirtualMachine';
type MenuText = string | RegExp;

async function menu(fixture: Fixture) {
  const harness = await TestbedHarnessEnvironment.loader(fixture).getHarness(
    MatMenuHarness,
  );
  await harness.open();
  return harness;
}

async function itemTexts(harness: MatMenuHarness) {
  const items = await harness.getItems();
  return Promise.all(items.map((item) => item.getText()));
}

async function menuTexts(fixture: Fixture) {
  return itemTexts(await menu(fixture));
}

/** Opens the gear menu and clicks through submenu labels to the item, as a user does. */
async function clickMenu(fixture: Fixture, first: MenuText, ...rest: MenuText[]) {
  const harness = await menu(fixture);
  await harness.clickItem({ text: first }, ...rest.map((text) => ({ text })));
}

/** Opens the gear menu and each named submenu in turn; returns the last one. */
async function openSubmenu(fixture: Fixture, ...path: MenuText[]) {
  let harness = await menu(fixture);
  for (const text of path) {
    const [item] = await harness.getItems({ text });
    harness = (await item.getSubmenu())!;
    await harness.open();
  }
  return harness;
}

/** The menu item at the end of `path` (submenu labels, then the item). */
async function findMenuItem(fixture: Fixture, ...path: MenuText[]) {
  const label = path.pop()!;
  const [item] = await (await openSubmenu(fixture, ...path)).getItems({ text: label });
  return item;
}

describe('OptionsBar2Component', () => {
  describe('read-only lockout', () => {
    /**
     * Verifies: a read-only Proxmox console offers only the viewing controls and the theme switch, as the vSphere bar does.
     * Interacts with: the readOnly input; the gear menu (MatMenuHarness).
     * Data: readOnly true; a Vm that could mount ISOs and change networks.
     */
    it('offers only the theme when read-only', async () => {
      const { fixture } = await renderOptionsBar2({
        readOnly: true,
        networkVm: of(networkVm({ canMountIso: true })),
      });
      expect(await menuTexts(fixture)).toEqual(['Fullscreen', 'Reconnect', 'Dark Theme']);
    });

    /**
     * Verifies: an interactive console offers keyboard, power, networks and ISO mounting where the Vm allows them.
     * Interacts with: the readOnly input; ProxmoxService.getVm (network/ISO capabilities); the gear menu.
     * Data: readOnly false; canAccessNicConfiguration and canMountIso true.
     */
    it('offers keyboard, power, network and ISO controls when interactive', async () => {
      const { fixture } = await renderOptionsBar2({
        networkVm: of(networkVm({ canMountIso: true })),
      });
      expect(await menuTexts(fixture)).toEqual([
        'Fullscreen',
        'Reconnect',
        'Dark Theme',
        'Power',
        'Files',
        'Keyboard',
        'Network Cards',
        'Clipboard',
      ]);
    });

    /**
     * Verifies: network and ISO controls stay hidden when the API says the user can't use them.
     * Interacts with: ProxmoxService.getVm capabilities; the gear menu.
     * Data: canAccessNicConfiguration false; canMountIso false.
     */
    it('hides network and ISO controls the Vm does not allow', async () => {
      const { fixture } = await renderOptionsBar2({
        networkVm: of(networkVm({ canAccessNicConfiguration: false })),
      });
      expect(await menuTexts(fixture)).toEqual([
        'Fullscreen',
        'Reconnect',
        'Dark Theme',
        'Power',
        'Keyboard',
        'Clipboard',
      ]);
    });
  });

  describe('network Vm lookup', () => {
    /**
     * Verifies: a Proxmox Vm's network details come from the Proxmox service.
     * Interacts with: ProxmoxService.getVm and VsphereService.getVm spies.
     * Data: Proxmox Vm 'vm-1'.
     */
    it('reads a Proxmox Vm from the Proxmox service', async () => {
      const { proxmox, vsphere } = await renderOptionsBar2();
      expect(proxmox.getVm).toHaveBeenCalledWith('vm-1');
      expect(vsphere.getVm).not.toHaveBeenCalled();
    });

    /**
     * Verifies: a vSphere Vm's network details come from the vSphere service.
     * Interacts with: ProxmoxService.getVm and VsphereService.getVm spies.
     * Data: vSphere Vm 'vm-2'.
     */
    it('reads a vSphere Vm from the vSphere service', async () => {
      const { proxmox, vsphere } = await renderOptionsBar2({
        vm: { id: 'vm-2', type: VmType.Vsphere },
      });
      expect(vsphere.getVm).toHaveBeenCalledWith('vm-2');
      expect(proxmox.getVm).not.toHaveBeenCalled();
    });

    /**
     * Verifies: a Vm of another type has no network details and no network menu.
     * Interacts with: ProxmoxService/VsphereService.getVm spies; the gear menu.
     * Data: Unknown-type Vm 'vm-3'.
     */
    it('looks up nothing for other Vm types', async () => {
      const { fixture, proxmox, vsphere } = await renderOptionsBar2({
        vm: { id: 'vm-3', type: VmType.Unknown },
      });
      expect(proxmox.getVm).not.toHaveBeenCalled();
      expect(vsphere.getVm).not.toHaveBeenCalled();
      expect(await menuTexts(fixture)).not.toContain('Network Cards');
    });

    /**
     * Verifies: a failed lookup hides the network controls instead of erroring.
     * Interacts with: ProxmoxService.getVm rejecting; the gear menu.
     * Data: API error.
     */
    it('treats a failed lookup as no network access', async () => {
      const { fixture } = await renderOptionsBar2({
        networkVm: throwError(() => new Error('nope')),
      });
      expect(await menuTexts(fixture)).toEqual([
        'Fullscreen',
        'Reconnect',
        'Dark Theme',
        'Power',
        'Keyboard',
        'Clipboard',
      ]);
    });
  });

  describe('networks', () => {
    /**
     * Verifies: each adapter lists its current network first (disabled), omits other read-only networks, filters by the search text, and clears the search when closed.
     * Interacts with: the Network Cards > net0 submenu (MatMenuHarness); user-event typing in the search box.
     * Data: net0 on 'vmbr0' (Lab); 'vmbr9' read-only; search 'inter'.
     */
    it('orders, restricts and filters adapter networks', async () => {
      const user = userEvent.setup();
      const { fixture } = await renderOptionsBar2();

      const adapter = await openSubmenu(fixture, 'Network Cards', 'net0');
      expect(await itemTexts(adapter)).toEqual(['✔ Lab', 'Internet']);
      const [current] = await adapter.getItems({ text: /Lab/ });
      expect(await current.isDisabled()).toBe(true);

      await user.type(screen.getByRole('searchbox', { name: 'Search networks' }), 'inter');
      expect(await itemTexts(adapter)).toEqual(['Internet']);

      await adapter.close();
      const reopened = await openSubmenu(fixture, 'Network Cards', 'net0');
      expect(await itemTexts(reopened)).toEqual(['✔ Lab', 'Internet']);
    });

    /**
     * Verifies: choosing another allowed network changes it straight away and shows the new current network.
     * Interacts with: the Network Cards > net0 submenu; ProxmoxService.changeNic; CrucibleDialogService.confirm.
     * Data: net0 from 'vmbr0' (Lab) to 'vmbr1' (Internet).
     */
    it('changes an adapter network and reflects the result', async () => {
      const { fixture, proxmox, confirm } = await renderOptionsBar2();

      await clickMenu(fixture, 'Network Cards', 'net0', /Internet/);

      expect(confirm).not.toHaveBeenCalled();
      expect(proxmox.changeNic).toHaveBeenCalledWith('vm-1', 'net0', 'vmbr1');
      const adapter = await openSubmenu(fixture, 'Network Cards', 'net0');
      expect(await itemTexts(adapter)).toEqual(['✔ Internet', 'Lab']);
    });

    /**
     * Verifies: leaving a network outside the allowed list needs explicit confirmation.
     * Interacts with: the Network Cards > net0 submenu; CrucibleDialogService.confirm stub; ProxmoxService.changeNic.
     * Data: net0 on read-only 'vmbr9' (Locked); confirmation answered true, false, or dismissed.
     */
    it.each<[boolean | 'dismissed', number]>([
      [true, 1],
      [false, 0],
      ['dismissed', 0],
    ])(
      'changes a restricted network only when confirmation is true (%s: %i changes)',
      async (confirmation, changes) => {
        const { fixture, proxmox, confirm } = await renderOptionsBar2({
          confirmation,
          networkVm: of(
            networkVm({
              networkCards: {
                availableNetworks: { vmbr0: 'Lab', vmbr9: 'Locked' },
                currentNetworks: { net0: 'vmbr9' },
                readOnlyNetworks: ['vmbr9'],
              },
            }),
          ),
        });

        await clickMenu(fixture, 'Network Cards', 'net0', /Lab/);

        expect(confirm).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Confirm Network Change',
            message: expect.stringContaining('"Locked"'),
          }),
        );
        expect(proxmox.changeNic).toHaveBeenCalledTimes(changes);
      },
    );

    /**
     * Verifies: a failed network change escapes to the app's global ErrorHandler and leaves the current network shown.
     * Interacts with: the Network Cards > net0 submenu; ProxmoxService.changeNic rejecting; rxjs unhandled-error hook.
     * Data: net0 from 'vmbr0' (Lab) to 'vmbr1' (Internet); the change fails with 'nope'.
     */
    it('leaves a failed network change to ErrorService', async () => {
      const errors = captureUnhandledRxErrors();
      const failure = new Error('nope');
      const { fixture, proxmox } = await renderOptionsBar2();
      proxmox.changeNic.mockReturnValue(throwError(() => failure));

      await clickMenu(fixture, 'Network Cards', 'net0', /Internet/);
      await flush();

      // Not a defect: performChange()'s subscribe (options-bar2.component.ts:179)
      // has no error callback, so the error reaches ErrorService (the global
      // ErrorHandler, app.config.ts), which shows it; no loading flag is left set.
      expect(errors).toEqual([failure]);
      const adapter = await openSubmenu(fixture, 'Network Cards', 'net0');
      expect(await itemTexts(adapter)).toEqual(['✔ Lab', 'Internet']);
    });
  });

  describe('ISO mount', () => {
    const isoVm = () => of(networkVm({ canMountIso: true }));

    /**
     * Verifies: Mount ISO lists the Vm's ISOs, mounts the chosen volume id, and confirms in a snackbar.
     * Interacts with: the Mount ISO menu item; ProxmoxService.getIsos/mountIso; DialogService.mountIso; MatSnackBar.open.
     * Data: chosen ISO 'tools.iso' with mountValue 'local:iso/tools.iso'.
     */
    it('mounts the chosen ISO', async () => {
      const { fixture, proxmox, dialogs, snackBar } = await renderOptionsBar2({
        networkVm: isoVm(),
      });
      dialogs.mountIso.mockReturnValue(
        of({ filename: 'tools.iso', mountValue: 'local:iso/tools.iso' }),
      );
      // The refreshed model the mount returns still allows mounting.
      proxmox.mountIso.mockReturnValue(of(networkVm({ canMountIso: true })));

      await clickMenu(fixture, 'Files', 'Mount ISO');

      expect(proxmox.getIsos).toHaveBeenCalledWith('vm-1');
      expect(proxmox.mountIso).toHaveBeenCalledWith('vm-1', 'local:iso/tools.iso');
      expect(snackBar.open).toHaveBeenCalledWith('Mounted tools.iso', 'Close', {
        duration: 5000,
        verticalPosition: 'top',
      });
      expect(await (await findMenuItem(fixture, 'Files', 'Mount ISO')).isDisabled()).toBe(false);
    });

    /**
     * Verifies: while ISOs are loading the item reads "Loading ISOs..." and is disabled, so it cannot be clicked twice.
     * Interacts with: the Mount ISO menu item; ProxmoxService.getIsos (never completes).
     * Data: one click while the listing is in flight.
     */
    it('disables Mount ISO while ISOs load', async () => {
      const { fixture, proxmox } = await renderOptionsBar2({ networkVm: isoVm() });
      // NEVER keeps the first listing in flight.
      proxmox.getIsos.mockReturnValue(NEVER);

      await clickMenu(fixture, 'Files', 'Mount ISO');

      const item = await findMenuItem(fixture, 'Files', 'Loading ISOs...');
      expect(await item.isDisabled()).toBe(true);
      expect(proxmox.getIsos).toHaveBeenCalledOnce();
    });

    /**
     * Verifies: a failed ISO listing is reported in a snackbar and Mount ISO is offered again.
     * Interacts with: the Mount ISO menu item; ProxmoxService.getIsos rejecting; MatSnackBar.open.
     * Data: listing error 'denied'.
     */
    it('reports a failed ISO listing', async () => {
      const { fixture, proxmox, snackBar } = await renderOptionsBar2({
        networkVm: isoVm(),
      });
      proxmox.getIsos.mockReturnValueOnce(throwError(() => new Error('denied')));

      await clickMenu(fixture, 'Files', 'Mount ISO');

      expect(snackBar.open).toHaveBeenLastCalledWith(
        'Could not load ISOs: denied',
        'Close',
        expect.objectContaining({ duration: 10000 }),
      );
      expect(await (await findMenuItem(fixture, 'Files', 'Mount ISO')).isDisabled()).toBe(false);
    });

    /**
     * Verifies: a failed mount is reported in a snackbar.
     * Interacts with: the Mount ISO menu item; DialogService.mountIso; ProxmoxService.mountIso rejecting; MatSnackBar.open.
     * Data: 'a.iso' chosen; mount error 'busy'.
     */
    it('reports a failed mount', async () => {
      const { fixture, proxmox, dialogs, snackBar } = await renderOptionsBar2({
        networkVm: isoVm(),
      });
      dialogs.mountIso.mockReturnValue(of({ filename: 'a.iso', mountValue: 'local:iso/a.iso' }));
      proxmox.mountIso.mockReturnValue(throwError(() => new Error('busy')));

      await clickMenu(fixture, 'Files', 'Mount ISO');

      expect(snackBar.open).toHaveBeenLastCalledWith(
        'Mount failed: busy',
        'Close',
        expect.objectContaining({ duration: 10000 }),
      );
    });

    /**
     * Verifies: closing the picker without a choice mounts nothing.
     * Interacts with: the Mount ISO menu item; DialogService.mountIso (undefined); ProxmoxService.mountIso.
     * Data: picker dismissed.
     */
    it('mounts nothing when the picker is dismissed', async () => {
      const { fixture, proxmox } = await renderOptionsBar2({ networkVm: isoVm() });
      await clickMenu(fixture, 'Files', 'Mount ISO');
      expect(proxmox.mountIso).not.toHaveBeenCalled();
    });
  });

  describe('power', () => {
    /**
     * Verifies: Power On is sent to the Proxmox endpoint without confirmation and acknowledged.
     * Interacts with: Power > Power On (MatMenuHarness clickItem); real VmService over the generated ProxmoxService; MatSnackBar.open; CrucibleDialogService.confirm.
     * Data: Proxmox Vm 'vm-1'.
     */
    it('powers on without confirmation', async () => {
      const { fixture, apiProxmox, snackBar, confirm } = await renderOptionsBar2();
      await clickMenu(fixture, 'Power', 'Power On');
      expect(confirm).not.toHaveBeenCalled();
      expect(apiProxmox.powerOnProxmoxVirtualMachine).toHaveBeenCalledWith('vm-1');
      expect(snackBar.open).toHaveBeenCalledWith('Power On submitted', 'Close', expect.anything());
    });

    /**
     * Verifies: a vSphere Vm's power action goes to the vSphere endpoint.
     * Interacts with: Power > Power On; real VmService over the generated VsphereService.
     * Data: vSphere Vm 'vm-2'.
     */
    it('powers on a vSphere Vm through the vSphere API', async () => {
      const { fixture, apiVsphere, apiProxmox } = await renderOptionsBar2({
        vm: { id: 'vm-2', name: 'Bravo', type: VmType.Vsphere },
      });
      await clickMenu(fixture, 'Power', 'Power On');
      expect(apiVsphere.powerOnVsphereVirtualMachine).toHaveBeenCalledWith('vm-2');
      expect(apiProxmox.powerOnProxmoxVirtualMachine).not.toHaveBeenCalled();
    });

    const confirmed: Array<[PowerAction, ProxmoxPowerMethod, string, string]> = [
      [PowerAction.PowerOff, 'powerOffProxmoxVirtualMachine', 'Power off "Alpha"? The guest OS will not be shut down cleanly.', 'Power Off'],
      [PowerAction.Reboot, 'rebootProxmoxVirtualMachine', 'Reboot "Alpha"?', 'Reboot'],
      [PowerAction.Shutdown, 'shutdownProxmoxVirtualMachine', 'Shut down the guest OS on "Alpha"?', 'Shutdown OS'],
    ];

    /**
     * Verifies: disruptive power actions ask first, and run only once confirmed.
     * Interacts with: the Power submenu item for the action; CrucibleDialogService.confirm stub; real VmService over the generated ProxmoxService.
     * Data: the action under test, confirmed.
     */
    it.each(confirmed)('confirms %s before sending it', async (action, endpoint, message, label) => {
      const ctx = await renderOptionsBar2({
        confirmation: true,
        networkVm: of(networkVm({ guestAgentRunning: true })),
      });
      await clickMenu(ctx.fixture, 'Power', label);
      expect(ctx.confirm).toHaveBeenCalledWith({
        title: `Confirm ${action}`,
        message,
        confirmText: 'Confirm',
        cancelText: 'Cancel',
      });
      expect(ctx.apiProxmox[endpoint]).toHaveBeenCalledWith('vm-1');
    });

    /**
     * Verifies: a cancelled or dismissed confirmation sends nothing.
     * Interacts with: Power > Reboot; CrucibleDialogService.confirm stub; the generated ProxmoxService reboot endpoint.
     * Data: Reboot answered false, or dismissed.
     */
    it.each([false, 'dismissed'] as const)(
      'sends nothing when the confirmation is %s',
      async (confirmation) => {
        const { fixture, apiProxmox } = await renderOptionsBar2({ confirmation });
        await clickMenu(fixture, 'Power', 'Reboot');
        expect(apiProxmox.rebootProxmoxVirtualMachine).not.toHaveBeenCalled();
      },
    );

    /**
     * Verifies: a rejected power action is reported with the API's message.
     * Interacts with: Power > Power On; the generated ProxmoxService rejecting; MatSnackBar.open.
     * Data: Power On error 'not allowed'.
     */
    it('reports a failed power action', async () => {
      const { fixture, apiProxmox, snackBar } = await renderOptionsBar2();
      apiProxmox.powerOnProxmoxVirtualMachine.mockReturnValue(
        throwError(() => new Error('not allowed')),
      );
      await clickMenu(fixture, 'Power', 'Power On');
      expect(snackBar.open).toHaveBeenCalledWith(
        'Power On failed: not allowed',
        'Close',
        expect.objectContaining({ duration: 10000 }),
      );
    });

    /**
     * Verifies: an HTTP failure of a power action shows vm.api's ProblemDetails title, not the HTTP client's "Http failure response for ..." text.
     * Interacts with: Power > Reboot; the generated ProxmoxService rejecting with an HttpErrorResponse; MatSnackBar.open.
     * Data: a 400 whose title is Proxmox's reboot timeout with the Power Off hint.
     */
    it('reports a failed power action with the API reason', async () => {
      const { fixture, apiProxmox, snackBar } = await renderOptionsBar2({ confirmation: true });
      const title =
        'Reboot failed: VM quit/powerdown failed - got timeout. The guest did not respond to the request; use Power Off instead.';
      apiProxmox.rebootProxmoxVirtualMachine.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              statusText: 'Bad Request',
              url: 'http://vm-api.test/api/vms/proxmox/vm-1/actions/reboot',
              error: { title, status: 400 },
            }),
        ),
      );
      await clickMenu(fixture, 'Power', 'Reboot');
      expect(snackBar.open).toHaveBeenCalledWith(
        `Reboot failed: ${title}`,
        'Close',
        expect.objectContaining({ duration: 10000 }),
      );
    });

    /**
     * Verifies: power on a Vm of an unsupported type is refused with an explanation.
     * Interacts with: Power > Power On; real VmService's provider switch; MatSnackBar.open.
     * Data: Unknown-type Vm 'vm-3'.
     */
    it('explains that other Vm types have no power controls', async () => {
      const { fixture, snackBar } = await renderOptionsBar2({
        vm: { id: 'vm-3', name: 'Other', type: VmType.Unknown },
      });
      await clickMenu(fixture, 'Power', 'Power On');
      expect(snackBar.open).toHaveBeenCalledWith(
        'Power On failed: Power operations are not supported for this virtual machine.',
        'Close',
        expect.objectContaining({ duration: 10000 }),
      );
    });
  });

  describe('keyboard and theme', () => {
    /**
     * Verifies: Keyboard > Send Ctrl-Alt-Del sends the key combination to this Proxmox Vm.
     * Interacts with: MatMenuHarness clickItem; real VmService; the app ProxmoxService.sendCtrlAltDel.
     * Data: Proxmox Vm 'vm-1'.
     */
    it('sends Ctrl-Alt-Del from the Keyboard menu', async () => {
      const { fixture, proxmox } = await renderOptionsBar2();

      await clickMenu(fixture, 'Keyboard', 'Send Ctrl-Alt-Del');

      expect(proxmox.sendCtrlAltDel).toHaveBeenCalledOnce();
    });

    /**
     * Verifies: Keyboard > Paste to Clipboard types the local clipboard into this Proxmox Vm.
     * Interacts with: MatMenuHarness clickItem; real VmService; the app ProxmoxService.sendClipboardText; stubbed navigator.clipboard.
     * Data: Proxmox Vm 'vm-1'; clipboard 'hello'.
     */
    it('pastes the local clipboard from the Keyboard menu', async () => {
      const { fixture, proxmox } = await renderOptionsBar2();
      stubClipboard('hello');

      await clickMenu(fixture, 'Keyboard', 'Paste to Clipboard');

      await vi.waitFor(() => expect(proxmox.sendClipboardText).toHaveBeenCalledWith('hello'));
    });

    /**
     * Verifies: a clipboard the browser refuses to read leaves an unhandled rejection and sends nothing (current behavior).
     * Interacts with: Keyboard > Paste to Clipboard; real VmService.sendClipboardText; stubbed navigator.clipboard.readText rejecting; captureUnhandledRxErrors.
     * Data: readText rejects with 'denied'.
     * Why: the rejection happens inside the Angular zone, and the ComponentFixture rethrows NgZone.onError from an rxjs subscriber, so it surfaces through rxjs's unhandled-error hook.
     */
    it('lets a refused clipboard read escape unhandled', async () => {
      const errors = captureUnhandledRxErrors();
      const denied = new Error('denied');
      const { fixture, proxmox } = await renderOptionsBar2();
      const { readText } = stubClipboard();
      readText.mockRejectedValue(denied);

      await clickMenu(fixture, 'Keyboard', 'Paste to Clipboard');
      await flush();

      expect(errors).toEqual([denied]);
      expect(proxmox.sendClipboardText).not.toHaveBeenCalled();
    });

    /**
     * Verifies: the Dark Theme switch sets the user's theme.
     * Interacts with: MatSlideToggleHarness in the menu overlay; ComnAuthService.setUserTheme.
     * Data: light theme, switched on.
     */
    it('switches to the dark theme', async () => {
      const { fixture, auth } = await renderOptionsBar2();
      await menu(fixture);
      const toggle = await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(
        MatSlideToggleHarness.with({ label: 'Dark Theme' }),
      );
      await toggle.toggle();
      expect(auth.setUserTheme).toHaveBeenCalledWith(Theme.DARK);
    });

    /**
     * Verifies: the bar shows the Vm's name.
     * Interacts with: the vm input.
     * Data: Vm 'Alpha'.
     */
    it('shows the Vm name', async () => {
      await renderOptionsBar2();
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
  });

  describe('send text', () => {
    /**
     * Verifies: the Keyboard menu offers Send Text next to the existing items.
     * Interacts with: the Keyboard submenu (MatMenuHarness).
     * Data: interactive console.
     */
    it('offers Send Text in the Keyboard menu', async () => {
      const { fixture } = await renderOptionsBar2();
      expect(await itemTexts(await openSubmenu(fixture, 'Keyboard'))).toEqual([
        'Send Ctrl-Alt-Del',
        'Send Text',
        'Paste to Clipboard',
      ]);
    });

    /**
     * Verifies: Keyboard > Send Text types each line of the dialog's text into the guest, followed by Enter, as the vSphere bar does.
     * Interacts with: the Keyboard submenu; DialogService.sendText; the app ProxmoxService.sendText.
     * Data: 'one\ntwo' at paste speed '0'.
     */
    it('types Send Text line by line', async () => {
      const { fixture, dialogs, proxmox } = await renderOptionsBar2();
      dialogs.sendText.mockReturnValue(of({ textToSend: 'one\ntwo', timeout: '0' }));

      await clickMenu(fixture, 'Keyboard', 'Send Text');

      expect(dialogs.sendText).toHaveBeenCalledWith('Enter Text to Send');
      await vi.waitFor(() =>
        expect(proxmox.sendText.mock.calls).toEqual([['one\n'], ['two\n']]),
      );
    });

    /**
     * Verifies: lines are paced by the paste speed chosen in the dialog.
     * Interacts with: the Keyboard submenu; DialogService.sendText; ProxmoxService.sendText.
     * Data: 'one\ntwo' at paste speed '200'.
     * Why: fake timers, installed after the menu opens, show the second line waits for the delay.
     */
    it('waits the paste speed between lines', async () => {
      const { fixture, dialogs, proxmox } = await renderOptionsBar2();
      dialogs.sendText.mockReturnValue(of({ textToSend: 'one\ntwo', timeout: '200' }));
      await openSubmenu(fixture, 'Keyboard');
      vi.useFakeTimers();
      try {
        fireEvent.click(screen.getByRole('menuitem', { name: 'Send Text' }));
        expect(proxmox.sendText.mock.calls).toEqual([['one\n']]);
        await vi.advanceTimersByTimeAsync(199);
        expect(proxmox.sendText).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1);
        expect(proxmox.sendText.mock.calls).toEqual([['one\n'], ['two\n']]);
      } finally {
        vi.useRealTimers();
      }
    });

    /**
     * Verifies: a cancelled or empty Send Text dialog types nothing.
     * Interacts with: the Keyboard submenu; DialogService.sendText; ProxmoxService.sendText.
     * Data: dialog closed without a result, and with empty text.
     */
    it.each([undefined, { textToSend: '', timeout: '50' }])(
      'types nothing for dialog result %j',
      async (result) => {
        const { fixture, dialogs, proxmox } = await renderOptionsBar2();
        dialogs.sendText.mockReturnValue(of(result));
        await clickMenu(fixture, 'Keyboard', 'Send Text');
        expect(proxmox.sendText).not.toHaveBeenCalled();
      },
    );

    /**
     * Verifies: with no connected console the first line is refused, the rest are skipped, and the user is told.
     * Interacts with: the Keyboard submenu; ProxmoxService.sendText returning false; MatSnackBar.open.
     * Data: 'one\ntwo'.
     */
    it('reports a console that is not connected', async () => {
      const { fixture, dialogs, proxmox, snackBar } = await renderOptionsBar2();
      dialogs.sendText.mockReturnValue(of({ textToSend: 'one\ntwo', timeout: '0' }));
      proxmox.sendText.mockReturnValue(false);

      await clickMenu(fixture, 'Keyboard', 'Send Text');

      await vi.waitFor(() =>
        expect(snackBar.open).toHaveBeenCalledWith(
          'Send Text failed: the console is not connected',
          'Close',
          expect.objectContaining({ duration: 10000 }),
        ),
      );
      expect(proxmox.sendText).toHaveBeenCalledOnce();
    });

    /**
     * Verifies: the toolbar Paste button types the local clipboard into the guest.
     * Interacts with: user-event click on Paste; stubbed navigator.clipboard.readText; ProxmoxService.sendText.
     * Data: clipboard 'ls -la'.
     */
    it('types the clipboard from the toolbar Paste button', async () => {
      const user = userEvent.setup();
      const { proxmox } = await renderOptionsBar2();
      stubClipboard('ls -la');

      await user.click(screen.getByRole('button', { name: /^Paste/ }));

      await vi.waitFor(() => expect(proxmox.sendText).toHaveBeenCalledWith('ls -la\n'));
    });

    /**
     * Verifies: when the clipboard can't be read the toolbar Paste button opens the Send Text dialog instead.
     * Interacts with: user-event click on Paste; stubbed navigator.clipboard.readText rejecting; DialogService.sendText.
     * Data: clipboard permission denied.
     */
    it('falls back to the Send Text dialog when the clipboard is unavailable', async () => {
      const user = userEvent.setup();
      const { dialogs, proxmox } = await renderOptionsBar2();
      const { readText } = stubClipboard();
      readText.mockRejectedValue(new Error('denied'));

      await user.click(screen.getByRole('button', { name: /^Paste/ }));

      await vi.waitFor(() => expect(dialogs.sendText).toHaveBeenCalledWith('Enter Text to Send'));
      expect(proxmox.sendText).not.toHaveBeenCalled();
    });

    /**
     * Verifies: a read-only console has no toolbar Paste button.
     * Interacts with: the readOnly input; the rendered toolbar.
     * Data: readOnly true.
     */
    it('hides the toolbar when read-only', async () => {
      await renderOptionsBar2({ readOnly: true });
      expect(screen.queryByRole('button', { name: /^Paste/ })).not.toBeInTheDocument();
    });
  });

  describe('snapshots', () => {
    const canRevert: PermissionGrants = { view: [AppViewPermission.RevertVms] };

    /**
     * Verifies: Snapshots is offered with the RevertVms view or system permission, as in the vSphere bar and as vm.api authorizes.
     * Interacts with: the real UserPermissionsService over a stubbed getVmPermissions; the gear menu.
     * Data: no grants, then RevertVms at view and at system level.
     */
    it.each<[PermissionGrants, boolean]>([
      [{}, false],
      [{ view: [AppViewPermission.ControlViewVms] }, false],
      [canRevert, true],
      [{ system: [AppSystemPermission.RevertVms] }, true],
    ])('with grants %j shows Snapshots: %s', async (grants, shown) => {
      const { fixture } = await renderOptionsBar2({
        grants,
        networkVm: of(networkVm({ hasSnapshot: true })),
      });
      expect((await menuTexts(fixture)).includes('Snapshots')).toBe(shown);
    });

    /**
     * Verifies: Snapshots is disabled when the Vm has no snapshot.
     * Interacts with: ProxmoxService.getVm (hasSnapshot); the gear menu.
     * Data: RevertVms; hasSnapshot false, then true.
     */
    it.each([false, true])('is enabled only with a snapshot (hasSnapshot %s)', async (hasSnapshot) => {
      const { fixture } = await renderOptionsBar2({
        grants: canRevert,
        networkVm: of(networkVm({ hasSnapshot })),
      });
      expect(await (await findMenuItem(fixture, 'Snapshots')).isDisabled()).toBe(!hasSnapshot);
    });

    /**
     * Verifies: choosing the current snapshot reverts through actions/revert, and success is reported.
     * Interacts with: the Snapshots item; ProxmoxService.getSnapshots/revertToCurrentSnapshot; DialogService.selectSnapshot; MatSnackBar.open.
     * Data: currentSnapshot 'clean' on the model; 'clean' (current) chosen.
     */
    it('reverts to the current snapshot', async () => {
      const { fixture, proxmox, dialogs, snackBar } = await renderOptionsBar2({
        grants: canRevert,
        networkVm: of(networkVm({ hasSnapshot: true, currentSnapshot: 'clean' })),
      });
      dialogs.selectSnapshot.mockImplementation((snapshots) => of(snapshots[0]));

      await clickMenu(fixture, 'Snapshots');

      expect(proxmox.getSnapshots).toHaveBeenCalledWith('vm-1', 'clean');
      expect(proxmox.revertToCurrentSnapshot).toHaveBeenCalledWith('vm-1');
      expect(proxmox.revertToSnapshot).not.toHaveBeenCalled();
      expect(snackBar.open).toHaveBeenCalledWith('Revert Successful', 'Close', expect.anything());
    });

    /**
     * Verifies: choosing another snapshot reverts to it by name.
     * Interacts with: the Snapshots item; DialogService.selectSnapshot; ProxmoxService.revertToSnapshot.
     * Data: 'later' (not current) chosen.
     */
    it('reverts to another snapshot by name', async () => {
      const { fixture, proxmox, dialogs } = await renderOptionsBar2({
        grants: canRevert,
        networkVm: of(networkVm({ hasSnapshot: true })),
      });
      dialogs.selectSnapshot.mockImplementation((snapshots) => of(snapshots[1]));

      await clickMenu(fixture, 'Snapshots');

      expect(proxmox.revertToSnapshot).toHaveBeenCalledWith('vm-1', 'later');
      expect(proxmox.revertToCurrentSnapshot).not.toHaveBeenCalled();
    });

    /**
     * Verifies: closing the snapshot dialog without a choice (or declining its confirmation) reverts nothing.
     * Interacts with: the Snapshots item; DialogService.selectSnapshot (undefined).
     * Data: dialog dismissed.
     */
    it('reverts nothing when no snapshot is chosen', async () => {
      const { fixture, proxmox, snackBar } = await renderOptionsBar2({
        grants: canRevert,
        networkVm: of(networkVm({ hasSnapshot: true })),
      });
      await clickMenu(fixture, 'Snapshots');
      expect(proxmox.revertToCurrentSnapshot).not.toHaveBeenCalled();
      expect(proxmox.revertToSnapshot).not.toHaveBeenCalled();
      expect(snackBar.open).not.toHaveBeenCalled();
    });

    /**
     * Verifies: a failed revert is reported with the API's ProblemDetails title.
     * Interacts with: the Snapshots item; ProxmoxService.revertToCurrentSnapshot rejecting with an HttpErrorResponse; MatSnackBar.open.
     * Data: 400 with title 'Vm is locked'.
     */
    it('reports a failed revert', async () => {
      const { fixture, proxmox, dialogs, snackBar } = await renderOptionsBar2({
        grants: canRevert,
        networkVm: of(networkVm({ hasSnapshot: true })),
      });
      dialogs.selectSnapshot.mockImplementation((snapshots) => of(snapshots[0]));
      proxmox.revertToCurrentSnapshot.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 400, error: { title: 'Vm is locked' } }),
        ),
      );

      await clickMenu(fixture, 'Snapshots');

      expect(snackBar.open).toHaveBeenCalledWith(
        'Revert Failed: Vm is locked',
        'Close',
        expect.objectContaining({ duration: 10000 }),
      );
    });
  });

  describe('files', () => {
    const canTransfer: PermissionGrants = {
      view: [AppViewPermission.UploadVmFiles, AppViewPermission.DownloadVmFiles],
    };
    const agentVm = (guestAgentRunning = true) =>
      of(networkVm({ guestAgentRunning, canMountIso: true }));

    function fileInput(fixture: Fixture): HTMLInputElement {
      return fixture.nativeElement.querySelector('input[type="file"]');
    }

    function pickFiles(fixture: Fixture, ...files: File[]) {
      const input = fileInput(fixture);
      Object.defineProperty(input, 'files', { value: fileList(...files), configurable: true });
      fireEvent.change(input);
    }

    /**
     * Verifies: Files holds Send File To VM, Download File From VM and Mount ISO, each behind its own gate, as in the vSphere bar (no Enter VM Credentials: the guest agent needs none).
     * Interacts with: the real UserPermissionsService over a stubbed getVmPermissions; ProxmoxService.getVm (canMountIso); the Files submenu.
     * Data: the grants and canMountIso under test.
     */
    it.each<[string, PermissionGrants, boolean, string[] | null]>([
      ['no grants, no ISO storage', {}, false, null],
      ['ISO storage only', {}, true, ['Mount ISO']],
      ['upload only', { view: [AppViewPermission.UploadVmFiles] }, false, ['Send File To VM']],
      ['download only', { view: [AppViewPermission.DownloadVmFiles] }, false, ['Download File From VM']],
      [
        'system upload and download',
        { system: [AppSystemPermission.UploadVmFiles, AppSystemPermission.DownloadVmFiles] },
        false,
        ['Send File To VM', 'Download File From VM'],
      ],
      ['everything', canTransfer, true, ['Send File To VM', 'Download File From VM', 'Mount ISO']],
    ])('with %s lists %j', async (_case, grants, canMountIso, items) => {
      const { fixture } = await renderOptionsBar2({
        grants,
        networkVm: of(networkVm({ guestAgentRunning: true, canMountIso })),
      });
      if (items === null) {
        expect(await menuTexts(fixture)).not.toContain('Files');
      } else {
        expect(await itemTexts(await openSubmenu(fixture, 'Files'))).toEqual(items);
      }
    });

    /**
     * Verifies: without a running guest agent the transfer items are disabled and explain why, while Mount ISO (no agent needed) stays enabled.
     * Interacts with: ProxmoxService.getVm (guestAgentRunning); the Files submenu; MatTooltipHarness.
     * Data: transfer grants; guestAgentRunning false, then true.
     */
    it.each([false, true])('gates transfers on the guest agent (running %s)', async (running) => {
      const { fixture } = await renderOptionsBar2({ grants: canTransfer, networkVm: agentVm(running) });
      const files = await openSubmenu(fixture, 'Files');
      const [send] = await files.getItems({ text: 'Send File To VM' });
      const [download] = await files.getItems({ text: 'Download File From VM' });
      const [iso] = await files.getItems({ text: 'Mount ISO' });
      expect(await send.isDisabled()).toBe(!running);
      expect(await download.isDisabled()).toBe(!running);
      expect(await iso.isDisabled()).toBe(false);

      const tooltips = await TestbedHarnessEnvironment.documentRootLoader(fixture).getAllHarnesses(
        MatTooltipHarness,
      );
      await tooltips[0].show();
      if (running) {
        expect(await tooltips[0].isOpen()).toBe(false);
      } else {
        expect(await tooltips[0].getTooltipText()).toBe(GUEST_AGENT_TOOLTIP);
      }
    });

    /**
     * Verifies: Send File To VM opens the file picker straight from the menu click.
     * Interacts with: the Files submenu; the hidden file input's click().
     * Data: transfer grants; agent running.
     */
    it('opens the file picker from Send File To VM', async () => {
      const { fixture } = await renderOptionsBar2({ grants: canTransfer, networkVm: agentVm() });
      const click = vi.spyOn(fileInput(fixture), 'click').mockImplementation(() => undefined);
      await clickMenu(fixture, 'Files', 'Send File To VM');
      expect(click).toHaveBeenCalledOnce();
    });

    /**
     * Verifies: picked files are uploaded into the directory the user names (a separator added), with the progress dialog shown, then closed, and success reported.
     * Interacts with: the file input's change event; DialogService.getFileUploadInfo/uploadProgress; ProxmoxService.uploadFiles; MatSnackBar.open.
     * Data: 'notes.txt' into '/home/user'.
     */
    it('uploads the picked files into the named directory', async () => {
      const { fixture, dialogs, proxmox, progress, snackBar } = await renderOptionsBar2({
        grants: canTransfer,
        networkVm: agentVm(),
      });
      dialogs.getFileUploadInfo.mockReturnValue(
        of({ filepath: '/home/user', username: '', password: '' }),
      );
      const file = new File(['hi'], 'notes.txt');

      pickFiles(fixture, file);

      expect(dialogs.getFileUploadInfo).toHaveBeenCalledWith('VM Send File Settings', {
        showCredentials: false,
      });
      expect(proxmox.uploadFiles).toHaveBeenCalledWith('vm-1', '/home/user/', expect.anything());
      expect(Array.from(proxmox.uploadFiles.mock.calls[0][2])).toEqual([file]);
      expect(progress.close).toHaveBeenCalledOnce();
      expect(snackBar.open).toHaveBeenCalledWith('File Uploaded Successfully', 'Close', expect.anything());
    });

    /**
     * Verifies: a path with no separator is asked for again, as the vSphere bar does.
     * Interacts with: the file input's change event; DialogService.getFileUploadInfo; ProxmoxService.uploadFiles.
     * Data: 'notes' first, then 'C:\\Users\\me'.
     */
    it('asks again for a relative path', async () => {
      const { fixture, dialogs, proxmox } = await renderOptionsBar2({
        grants: canTransfer,
        networkVm: agentVm(),
      });
      dialogs.getFileUploadInfo
        .mockReturnValueOnce(of({ filepath: 'notes', username: '', password: '' }))
        .mockReturnValueOnce(of({ filepath: 'C:\\Users\\me', username: '', password: '' }));

      pickFiles(fixture, new File(['hi'], 'notes.txt'));

      expect(dialogs.getFileUploadInfo).toHaveBeenLastCalledWith(
        'The file path must be an absolute path.',
        { showCredentials: false },
      );
      expect(proxmox.uploadFiles).toHaveBeenCalledWith('vm-1', 'C:\\Users\\me\\', expect.anything());
    });

    /**
     * Verifies: closing the path dialog uploads nothing and clears the selection.
     * Interacts with: the file input; DialogService.getFileUploadInfo (undefined); ProxmoxService.uploadFiles.
     * Data: dialog dismissed.
     */
    it('uploads nothing when the path dialog is closed', async () => {
      const { fixture, proxmox, dialogs } = await renderOptionsBar2({
        grants: canTransfer,
        networkVm: agentVm(),
      });
      pickFiles(fixture, new File(['hi'], 'notes.txt'));
      expect(dialogs.getFileUploadInfo).toHaveBeenCalledOnce();
      expect(proxmox.uploadFiles).not.toHaveBeenCalled();
    });

    /**
     * Verifies: the API's 400 reason (such as the guest agent's size cap) is shown to the user and the progress dialog closes.
     * Interacts with: ProxmoxService.uploadFiles rejecting with an HttpErrorResponse; MatSnackBar.open.
     * Data: 400 titled with the size cap message.
     */
    it("shows the API's reason for a refused upload", async () => {
      const { fixture, dialogs, proxmox, progress, snackBar } = await renderOptionsBar2({
        grants: canTransfer,
        networkVm: agentVm(),
      });
      dialogs.getFileUploadInfo.mockReturnValue(of({ filepath: '/tmp/', username: '', password: '' }));
      proxmox.uploadFiles.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 400, error: { title: 'File exceeds 61440-byte limit' } }),
        ),
      );

      pickFiles(fixture, new File(['big'], 'big.bin'));

      expect(snackBar.open).toHaveBeenCalledWith(
        'Error Uploading File: File exceeds 61440-byte limit',
        'Close',
        expect.objectContaining({ duration: 10000 }),
      );
      expect(progress.close).toHaveBeenCalledOnce();
    });

    /**
     * Verifies: Download File From VM asks for the guest path and saves the returned blob under the file's own name.
     * Interacts with: the Files submenu; DialogService.getFileUploadInfo; ProxmoxService.downloadFile; URL.createObjectURL and an anchor click (jsdom has neither download nor object URLs).
     * Data: '/etc/hosts'.
     */
    it('saves a downloaded file', async () => {
      const { fixture, dialogs, proxmox } = await renderOptionsBar2({
        grants: canTransfer,
        networkVm: agentVm(),
      });
      dialogs.getFileUploadInfo.mockReturnValue(of({ filepath: '/etc/hosts', username: '', password: '' }));
      const createObjectURL = vi.fn(() => 'blob:hosts');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
      const saved: HTMLAnchorElement[] = [];
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(function (this: HTMLAnchorElement) {
          saved.push(this);
        });
      try {
        await clickMenu(fixture, 'Files', 'Download File From VM');

        expect(dialogs.getFileUploadInfo).toHaveBeenCalledWith('Download File Settings', {
          showCredentials: false,
        });
        expect(proxmox.downloadFile).toHaveBeenCalledWith('vm-1', '/etc/hosts');
        expect(saved.map((a) => [a.href, a.download])).toEqual([['blob:hosts', 'hosts']]);
        await vi.waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:hosts'));
      } finally {
        click.mockRestore();
        vi.unstubAllGlobals();
      }
    });

    /**
     * Verifies: a failed download is reported with the API's reason.
     * Interacts with: the Files submenu; ProxmoxService.downloadFile rejecting; MatSnackBar.open.
     * Data: 400 titled 'No such file'.
     */
    it('reports a failed download', async () => {
      const { fixture, dialogs, proxmox, snackBar } = await renderOptionsBar2({
        grants: canTransfer,
        networkVm: agentVm(),
      });
      dialogs.getFileUploadInfo.mockReturnValue(of({ filepath: '/nope', username: '', password: '' }));
      proxmox.downloadFile.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 400, error: { title: 'No such file' } })),
      );

      await clickMenu(fixture, 'Files', 'Download File From VM');

      expect(snackBar.open).toHaveBeenCalledWith(
        'Error Downloading File: No such file',
        'Close',
        expect.objectContaining({ duration: 10000 }),
      );
    });

    /**
     * Verifies: toDirectory() keeps a trailing separator, adds the one the path uses, and rejects a bare name; fileNameOf() takes the last segment of either style.
     * Interacts with: toDirectory, fileNameOf.
     * Data: Linux and Windows paths.
     */
    it('normalizes paths', () => {
      expect(toDirectory('/tmp/')).toBe('/tmp/');
      expect(toDirectory('/tmp')).toBe('/tmp/');
      expect(toDirectory('C:\\temp')).toBe('C:\\temp\\');
      expect(toDirectory('temp')).toBeNull();
      expect(fileNameOf('/var/log/syslog')).toBe('syslog');
      expect(fileNameOf('C:\\a\\b.txt')).toBe('b.txt');
      expect(fileNameOf('/var/log/')).toBe('download');
    });
  });

  describe('console controls', () => {
    /**
     * Verifies: Fullscreen asks noVNC for fullscreen, and says so when the browser can't.
     * Interacts with: the Fullscreen item; ProxmoxService.fullscreen; MatSnackBar.open.
     * Data: fullscreen available, then not.
     */
    it('goes fullscreen', async () => {
      const { fixture, proxmox, snackBar } = await renderOptionsBar2();
      await clickMenu(fixture, 'Fullscreen');
      expect(proxmox.fullscreen).toHaveBeenCalledOnce();
      expect(snackBar.open).not.toHaveBeenCalled();

      proxmox.fullscreen.mockReturnValue(false);
      await clickMenu(fixture, 'Fullscreen');
      expect(snackBar.open).toHaveBeenCalledWith('Fullscreen is not available', 'Close', expect.anything());
    });

    /**
     * Verifies: Reconnect asks noVNC for a fresh connection, read-only or not.
     * Interacts with: the Reconnect item; ProxmoxService.reconnect.
     * Data: readOnly true.
     */
    it('reconnects', async () => {
      const { fixture, proxmox } = await renderOptionsBar2({ readOnly: true });
      await clickMenu(fixture, 'Reconnect');
      expect(proxmox.reconnect).toHaveBeenCalledOnce();
    });

    /**
     * Verifies: inside an iframe Open In New Tab is offered and opens the current address.
     * Interacts with: window.top (replaced so the bar sees itself framed); window.open spy; the gear menu.
     * Data: a framed console.
     */
    it('offers Open In New Tab when framed', async () => {
      Object.defineProperty(window, 'top', { value: {}, configurable: true });
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      try {
        const { fixture } = await renderOptionsBar2();
        await clickMenu(fixture, 'Open In New Tab');
        expect(open).toHaveBeenCalledWith(window.location.href);
      } finally {
        open.mockRestore();
        Reflect.deleteProperty(window, 'top');
      }
    });

    /**
     * Verifies: the toolbar Copy button and Clipboard > Copy put the guest's last copied text on the local clipboard.
     * Interacts with: user-event click on Copy; the Clipboard submenu; ProxmoxService.getGuestClipboard; stubbed navigator.clipboard.writeText; MatSnackBar.open.
     * Data: guest clipboard 'guest text'.
     */
    it('copies the guest clipboard', async () => {
      const user = userEvent.setup();
      const { fixture, snackBar } = await renderOptionsBar2();
      const { writeText } = stubClipboard();

      await user.click(screen.getByRole('button', { name: /^Copy/ }));
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('guest text'));
      expect(snackBar.open).toHaveBeenCalledWith('Copied Virtual Machine Clipboard', 'Ok', expect.anything());

      await clickMenu(fixture, 'Clipboard', 'Copy');
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    });

    /**
     * Verifies: with nothing copied in the guest, Copy reports the vSphere bar's failure message.
     * Interacts with: the toolbar Copy button; ProxmoxService.getGuestClipboard (null); MatSnackBar.open.
     */
    it('reports a guest that sent no clipboard', async () => {
      const user = userEvent.setup();
      const { proxmox, snackBar } = await renderOptionsBar2();
      const { writeText } = stubClipboard();
      proxmox.getGuestClipboard.mockReturnValue(null);

      await user.click(screen.getByRole('button', { name: /^Copy/ }));

      expect(snackBar.open).toHaveBeenCalledWith(
        'Copy from VM failed!  Contact an Administrator to verify the Virtual machine is configured properly.',
        'Close',
        expect.objectContaining({ duration: 10000 }),
      );
      expect(writeText).not.toHaveBeenCalled();
    });

    /**
     * Verifies: when the browser refuses the clipboard write, the text is shown for a manual Ctrl+C.
     * Interacts with: the toolbar Copy button; stubbed writeText rejecting; CrucibleDialogService.confirm.
     */
    it('shows the text when the local clipboard refuses it', async () => {
      const user = userEvent.setup();
      const { confirm } = await renderOptionsBar2();
      stubClipboard().writeText.mockRejectedValue(new Error('denied'));

      await user.click(screen.getByRole('button', { name: /^Copy/ }));

      await vi.waitFor(() =>
        expect(confirm).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Select text and press Ctrl+C to copy to your local clipboard:',
            message: 'guest text',
          }),
        ),
      );
    });

    /**
     * Verifies: Clipboard > Paste types the local clipboard, like the toolbar Paste button.
     * Interacts with: the Clipboard submenu; stubbed readText; ProxmoxService.sendText.
     * Data: clipboard 'pwd'.
     */
    it('pastes from the Clipboard menu', async () => {
      const { fixture, proxmox } = await renderOptionsBar2();
      stubClipboard('pwd');
      await clickMenu(fixture, 'Clipboard', 'Paste');
      await vi.waitFor(() => expect(proxmox.sendText).toHaveBeenCalledWith('pwd\n'));
    });

    /**
     * Verifies: the toolbar Ctrl-Alt-Del button sends the key combination.
     * Interacts with: user-event click; real VmService; ProxmoxService.sendCtrlAltDel.
     */
    it('sends Ctrl-Alt-Del from the toolbar', async () => {
      const user = userEvent.setup();
      const { proxmox } = await renderOptionsBar2();
      await user.click(screen.getByRole('button', { name: /^Ctrl-Alt-Del/ }));
      expect(proxmox.sendCtrlAltDel).toHaveBeenCalledOnce();
    });
  });

  describe('read-only', () => {
    /**
     * Verifies: the Read Only switch is offered exactly when the page allows toggling (the user holds a Vm control permission).
     * Interacts with: the allowReadOnlyToggle input; the gear menu.
     * Data: allowReadOnlyToggle false, then true.
     */
    it.each([false, true])('offers Read Only when allowReadOnlyToggle is %s', async (allowReadOnlyToggle) => {
      const { fixture } = await renderOptionsBar2({ allowReadOnlyToggle, readOnly: true });
      expect((await menuTexts(fixture)).includes('Read Only')).toBe(allowReadOnlyToggle);
    });

    /**
     * Verifies: the switch shows the current state and flipping it navigates to readOnly=false, which the page turns into the readOnly input (and noVNC viewOnly).
     * Interacts with: MatSlideToggleHarness in the menu overlay; real VmService.setReadOnly; the real Router.
     * Data: allowReadOnlyToggle true; readOnly true, switched off.
     */
    it('flips read-only through VmService.setReadOnly', async () => {
      const { fixture } = await renderOptionsBar2({ allowReadOnlyToggle: true, readOnly: true });
      await menu(fixture);
      const toggle = await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(
        MatSlideToggleHarness.with({ label: 'Read Only' }),
      );
      expect(await toggle.isChecked()).toBe(true);

      await toggle.toggle();
      await fixture.whenStable();

      expect(fixture.debugElement.injector.get(Router).url).toBe('/?readOnly=false');
    });

    /**
     * Verifies: the Vm name is labelled "(Read Only)" exactly when read-only.
     * Interacts with: the readOnly input; the rendered Vm name.
     * Data: Vm 'Alpha'; the readOnly value under test.
     */
    it.each<[boolean, string]>([
      [true, 'Alpha (Read Only)'],
      [false, 'Alpha'],
    ])('labels the Vm when readOnly is %s as %j', async (readOnly, label) => {
      await renderOptionsBar2({ readOnly });
      expect(screen.getByText(label, { exact: true })).toBeInTheDocument();
    });
  });

  describe('connected users', () => {
    /**
     * Verifies: the connected-users label lists the users, with one name per line in its tooltip.
     * Interacts with: SignalRService.currentVmUsers$; the rendered label and its title attribute.
     * Data: alice and bob.
     */
    it('lists the connected users', async () => {
      const { fixture, currentVmUsers$ } = await renderOptionsBar2();
      currentVmUsers$.next(['alice', 'bob']);
      fixture.detectChanges();

      expect(screen.getByText('Connected: alice, bob')).toBeInTheDocument();
      const keepNewlines = getDefaultNormalizer({ collapseWhitespace: false });
      expect(screen.getByTitle('alice\nbob', { normalizer: keepNewlines })).toHaveTextContent(
        'Connected: alice, bob',
      );
    });

    /**
     * Verifies: nobody connected, or a read-only console, shows no label, as in the vSphere bar.
     * Interacts with: SignalRService.currentVmUsers$; the readOnly input.
     * Data: no users; then alice on a read-only console.
     */
    it.each<[string, string[], boolean]>([
      ['nobody connected', [], false],
      ['a read-only console', ['alice'], true],
    ])('shows no label for %s', async (_case, users, readOnly) => {
      const { fixture, currentVmUsers$ } = await renderOptionsBar2({ readOnly });
      currentVmUsers$.next(users);
      fixture.detectChanges();
      expect(screen.queryByText(/Connected:/)).not.toBeInTheDocument();
    });

    /**
     * Verifies: past two users the label counts the rest.
     * Interacts with: formatConnectedUsers.
     * Data: none, one, three and four users.
     */
    it.each<[string[], string]>([
      [[], ''],
      [['alice'], 'Connected: alice'],
      [['a', 'b', 'c'], 'Connected: a, b and 1 other'],
      [['a', 'b', 'c', 'd'], 'Connected: a, b and 2 others'],
    ])('formats %j as %j', (users, label) => {
      expect(formatConnectedUsers(users)).toBe(label);
    });
  });

  describe('task progress', () => {
    const running: NotificationData = {
      taskId: 't1',
      taskName: 'Revert',
      taskType: 'Snapshot',
      broadcastTime: '',
      progress: '40',
      state: 'running',
    };

    /**
     * Verifies: the bar joins the progress hub for this Vm and lists in-flight tasks until they succeed, as the vSphere bar does.
     * Interacts with: NotificationService.connectToProgressHub spy and tasksInProgress subject.
     * Data: one running task at 40%, then the same task succeeded.
     */
    it('lists in-progress tasks from the progress hub', async () => {
      const { fixture, notifications, tasksInProgress } = await renderOptionsBar2();
      expect(notifications.connectToProgressHub).toHaveBeenCalledWith('vm-1');

      tasksInProgress.next([running]);
      fixture.detectChanges();
      expect(screen.getByText('Revert ... 40%')).toBeInTheDocument();

      tasksInProgress.next([{ ...running, state: 'success' }]);
      fixture.detectChanges();
      expect(screen.queryByText(/Revert \.\.\./)).not.toBeInTheDocument();
    });

    /**
     * Verifies: an empty broadcast leaves the last list showing (the vSphere bar's behavior).
     * Interacts with: NotificationService.tasksInProgress.
     * Data: a running task, then an empty list.
     */
    it('keeps the last list on an empty broadcast', async () => {
      const { fixture, tasksInProgress } = await renderOptionsBar2();
      tasksInProgress.next([running]);
      tasksInProgress.next([]);
      fixture.detectChanges();
      expect(screen.getByText('Revert ... 40%')).toBeInTheDocument();
    });
  });

  describe('Proxmox task states', () => {
    const proxmoxTask = (state: string): NotificationData => ({
      taskId: `t-${state}`,
      taskName: 'VM 100 Rollback',
      taskType: 'qmrollback',
      broadcastTime: '',
      progress: '',
      state,
    });

    /**
     * Verifies: finished Proxmox tasks, which the poller rebroadcasts with PVE's own status as the state, are not listed; a running one is, without a percentage PVE never reports.
     * Interacts with: NotificationService.tasksInProgress.
     * Data: tasks in state "OK", a PVE failure string, and "running", all with empty progress.
     */
    it('lists only unfinished tasks and omits an empty percentage', async () => {
      const { fixture, tasksInProgress } = await renderOptionsBar2();
      tasksInProgress.next([proxmoxTask('OK'), proxmoxTask('start failed: QEMU exited with code 1')]);
      fixture.detectChanges();
      expect(screen.queryByText(/VM 100 Rollback/)).not.toBeInTheDocument();

      tasksInProgress.next([proxmoxTask('running')]);
      fixture.detectChanges();
      const heading = screen.getByRole('heading', { name: /VM 100 Rollback/ });
      expect(heading.textContent?.replace(/\s+/g, ' ').trim()).toBe('VM 100 Rollback ...');
    });
  });

  describe('Shutdown OS', () => {
    /**
     * Verifies: Shutdown OS stays enabled whatever the guest agent reports, because PVE falls back to an ACPI shutdown when the VM has no agent configured.
     * Interacts with: ProxmoxService.getVm (guestAgentRunning); the Power submenu.
     * Data: guestAgentRunning false, true, and absent (an API without the field).
     */
    it.each<[boolean | undefined]>([[false], [true], [undefined]])(
      'is enabled with guestAgentRunning %s',
      async (guestAgentRunning) => {
        const { fixture } = await renderOptionsBar2({
          networkVm: of(networkVm({ guestAgentRunning })),
        });
        const power = await openSubmenu(fixture, 'Power');
        const items = await power.getItems();
        const states = await Promise.all(
          items.map(async (item) => [await item.getText(), await item.isDisabled()]),
        );
        expect(states).toEqual([
          ['Power On', false],
          ['Power Off', false],
          ['Reboot', false],
          ['Shutdown OS', false],
        ]);
      },
    );
  });
});
