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
import { NEVER, Observable, of, throwError } from 'rxjs';
import {
  ComnAuthQuery,
  ComnAuthService,
  CrucibleDialogService,
  Theme,
} from '@cmusei/crucible-common';
import { HttpErrorResponse } from '@angular/common/http';
import {
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

  const rendered = await renderComponent(OptionsBar2Component, {
    inputs: { vm, readOnly: overrides.readOnly ?? false },
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
     * Verifies: a read-only Proxmox console offers only the theme switch.
     * Interacts with: the readOnly input; the gear menu (MatMenuHarness).
     * Data: readOnly true; a Vm that could mount ISOs and change networks.
     */
    it('offers only the theme when read-only', async () => {
      const { fixture } = await renderOptionsBar2({
        readOnly: true,
        networkVm: of(networkVm({ canMountIso: true })),
      });
      expect(await menuTexts(fixture)).toEqual(['Dark Theme']);
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
        'Keyboard',
        'Power',
        'Files',
        'Network Cards',
        'Dark Theme',
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
      expect(await menuTexts(fixture)).toEqual(['Keyboard', 'Power', 'Dark Theme']);
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
      expect(await menuTexts(fixture)).toEqual(['Keyboard', 'Power', 'Dark Theme']);
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

    const confirmed: Array<[PowerAction, ProxmoxPowerMethod, string]> = [
      [PowerAction.PowerOff, 'powerOffProxmoxVirtualMachine', 'Power off "Alpha"? The guest OS will not be shut down cleanly.'],
      [PowerAction.Reboot, 'rebootProxmoxVirtualMachine', 'Reboot "Alpha"?'],
      [PowerAction.Shutdown, 'shutdownProxmoxVirtualMachine', 'Shut down the guest OS on "Alpha"?'],
    ];

    /**
     * Verifies: disruptive power actions ask first, and run only once confirmed.
     * Interacts with: the Power submenu item named for the action; CrucibleDialogService.confirm stub; real VmService over the generated ProxmoxService.
     * Data: the action under test, confirmed.
     */
    it.each(confirmed)('confirms %s before sending it', async (action, endpoint, message) => {
      const ctx = await renderOptionsBar2({ confirmation: true });
      await clickMenu(ctx.fixture, 'Power', action);
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
     * Verifies: Snapshots is offered only with the RevertVms view permission, as in the vSphere bar.
     * Interacts with: the real UserPermissionsService over a stubbed getVmPermissions; the gear menu.
     * Data: no grants, then RevertVms.
     */
    it.each<[PermissionGrants, boolean]>([
      [{}, false],
      [{ view: [AppViewPermission.ControlViewVms] }, false],
      [canRevert, true],
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
});
