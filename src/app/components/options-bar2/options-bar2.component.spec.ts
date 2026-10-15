// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { MatSlideToggleHarness } from '@angular/material/slide-toggle/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, Observable, of, throwError } from 'rxjs';
import {
  ComnAuthQuery,
  ComnAuthService,
  CrucibleDialogService,
  Theme,
} from '@cmusei/crucible-common';
import {
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
import { OptionsBar2Component } from './options-bar2.component';
import { renderComponent } from '../../test-utils/render-component';
import { ApiStub } from '../../test-utils/api-stub';
import { dialogRefStub, dismissedDialogRefStub } from '../../test-utils/dialog-refs';
import { stubClipboard } from '../../test-utils/clipboard';
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
  } satisfies Pick<
    ProxmoxService,
    'getVm' | 'changeNic' | 'getIsos' | 'mountIso' | 'sendCtrlAltDel' | 'sendClipboardText'
  >;
  const vsphere = {
    getVm: vi.fn<VsphereService['getVm']>(() => of(networkVm() as VsphereVirtualMachine)),
    changeNic: vi.fn(() => of({})),
  } satisfies Pick<VsphereService, 'getVm' | 'changeNic'>;
  const dialogs = {
    mountIso: vi.fn<DialogService['mountIso']>(() => of(undefined)),
  } satisfies Pick<DialogService, 'mountIso'>;
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
        'Network Cards',
        'Mount ISO',
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
      // ErrorHandler, main.ts:81), which shows it; no loading flag is left set.
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

      await clickMenu(fixture, 'Mount ISO');

      expect(proxmox.getIsos).toHaveBeenCalledWith('vm-1');
      expect(proxmox.mountIso).toHaveBeenCalledWith('vm-1', 'local:iso/tools.iso');
      expect(snackBar.open).toHaveBeenCalledWith('Mounted tools.iso', 'Close', {
        duration: 5000,
        verticalPosition: 'top',
      });
      expect(await (await findMenuItem(fixture, 'Mount ISO')).isDisabled()).toBe(false);
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

      await clickMenu(fixture, 'Mount ISO');

      const item = await findMenuItem(fixture, 'Loading ISOs...');
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

      await clickMenu(fixture, 'Mount ISO');

      expect(snackBar.open).toHaveBeenLastCalledWith(
        'Could not load ISOs: denied',
        'Close',
        expect.objectContaining({ duration: 10000 }),
      );
      expect(await (await findMenuItem(fixture, 'Mount ISO')).isDisabled()).toBe(false);
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

      await clickMenu(fixture, 'Mount ISO');

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
      await clickMenu(fixture, 'Mount ISO');
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
});
