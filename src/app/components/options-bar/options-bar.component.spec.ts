// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import {
  MatMenuHarness,
  MatMenuItemHarness,
} from '@angular/material/menu/testing';
import { MatSlideToggleHarness } from '@angular/material/slide-toggle/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { fireEvent, getDefaultNormalizer, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { BehaviorSubject, of, throwError } from 'rxjs';
import {
  ComnAuthQuery,
  ComnAuthService,
  CrucibleDialogService,
  Theme,
} from '@cmusei/crucible-common';
import {
  AppSystemPermission,
  AppTeamPermission,
  AppViewPermission,
  VsphereVirtualMachine,
} from '../../generated/vm-api';
import { VirtualMachineToolsStatus } from '../../models/vm/vm-model';
import { NotificationData } from '../../models/notification/notification-model';
import { DialogService } from '../../services/dialog/dialog.service';
import { NotificationService } from '../../services/notification/notification.service';
import { SignalRService } from '../../services/signalr/signalr.service';
import { VsphereService } from '../../state/vsphere/vsphere.service';
import { KeysPipe, OptionsBarComponent } from './options-bar.component';
import { renderComponent } from '../../test-utils/render-component';
import {
  PermissionGrants,
  permissionDataProviders,
} from '../../test-utils/mock-permission-data.service';
import { FakeWmksClient } from '../../test-utils/fake-wmks';
import { stubClipboard } from '../../test-utils/clipboard';
import {
  dialogRefStub,
  dismissedDialogRefStub,
} from '../../test-utils/dialog-refs';
import {
  captureUnhandledRxErrors,
  flush,
} from '../../test-utils/unhandled-rx-errors';
import { FileUploadProgressDialogComponent } from '../shared/file-upload-progress-dialog/file-upload-progress-dialog.component';

type VsphereStub = Pick<
  VsphereService,
  | 'model'
  | 'wmks'
  | 'vmClipBoard'
  | 'vmResolution'
  | 'uploadConfig'
  | 'changeNic'
  | 'connect'
  | 'disconnect'
  | 'powerOn'
  | 'powerOff'
  | 'reBoot'
  | 'shutdownOS'
  | 'getSnapshots'
  | 'revertToSnapshot'
  | 'verifyCredentials'
  | 'sendFileToVm'
  | 'getVmFileUrl'
  | 'getIsos'
  | 'mountIso'
  | 'setResolution'
>;

function model(
  overrides: Partial<VsphereVirtualMachine> = {},
): VsphereVirtualMachine {
  return {
    id: 'vm-1',
    name: 'Alpha',
    isOwner: false,
    hasSnapshot: true,
    vmToolsStatus: VirtualMachineToolsStatus.toolsOk,
    canAccessNicConfiguration: true,
    networkCards: {
      availableNetworks: { allowed: 'Allowed Network', other: 'Other Network' },
      currentNetworks: { adapter1: 'allowed' },
      readOnlyNetworks: [],
    },
    ...overrides,
  };
}

/** Every view permission except the named ones: the near miss for a denied case. */
function viewPermissionsExcept(
  ...excluded: AppViewPermission[]
): AppViewPermission[] {
  return Object.values(AppViewPermission).filter((p) => !excluded.includes(p));
}

async function renderOptionsBar(
  overrides: {
    readOnly?: boolean;
    allowReadOnlyToggle?: boolean;
    grants?: PermissionGrants;
    model?: VsphereVirtualMachine;
    // 'dismissed': the confirm dialog closes without an answer (Esc, backdrop).
    confirmation?: boolean | 'dismissed';
    // Replaces the inert connectToProgressHub stub.
    progressHub?: NotificationService['connectToProgressHub'];
  } = {},
) {
  const wmks = new FakeWmksClient();
  const vsphere: VsphereStub = {
    model: overrides.model ?? model(),
    wmks,
    vmClipBoard: new BehaviorSubject(''),
    vmResolution: new BehaviorSubject({ width: 1280, height: 720 }),
    uploadConfig: { username: '', password: '', filepath: '' },
    changeNic: vi.fn(() => of(model())),
    connect: vi.fn(() => Promise.resolve()),
    disconnect: vi.fn(),
    powerOn: vi.fn(),
    powerOff: vi.fn(),
    reBoot: vi.fn(),
    shutdownOS: vi.fn(),
    getSnapshots: vi.fn(() => of([{ id: 's1', name: 'Clean' }])),
    revertToSnapshot: vi.fn(() => of(undefined)),
    verifyCredentials: vi.fn(() => of(undefined)),
    sendFileToVm: vi.fn(() => of({})),
    getVmFileUrl: vi.fn(() => of({ url: 'https://files.test/x', fileName: 'x.txt' })),
    getIsos: vi.fn(() => of([])),
    mountIso: vi.fn(() => of(model({ name: 'Mounted' }))),
    setResolution: vi.fn(() => of(undefined)),
  };
  const progress = dialogRefStub<FileUploadProgressDialogComponent, void>();
  // Every dialog closes without a result unless a test says otherwise.
  const dialogs = {
    sendText: vi.fn<DialogService['sendText']>(() => of(undefined)),
    getFileUploadInfo: vi.fn<DialogService['getFileUploadInfo']>(() => of(undefined)),
    mountIso: vi.fn<DialogService['mountIso']>(() => of(undefined)),
    selectSnapshot: vi.fn<DialogService['selectSnapshot']>(() => of(undefined)),
    uploadProgress: vi.fn<DialogService['uploadProgress']>(
      () => progress.dialogRef,
    ),
  } satisfies Pick<
    DialogService,
    'sendText' | 'getFileUploadInfo' | 'mountIso' | 'selectSnapshot' | 'uploadProgress'
  >;
  const confirm = vi.fn<CrucibleDialogService['confirm']>(() =>
    overrides.confirmation === 'dismissed'
      ? dismissedDialogRefStub<unknown, boolean>().dialogRef
      : dialogRefStub<unknown, boolean>(overrides.confirmation).dialogRef,
  );
  const crucibleDialog = { confirm } satisfies Pick<CrucibleDialogService, 'confirm'>;
  const tasksInProgress = new BehaviorSubject<NotificationData[]>([]);
  const notifications = {
    tasksInProgress,
    // The hub connection is not under test; a never-settling promise keeps it inert.
    connectToProgressHub:
      overrides.progressHub ?? vi.fn(() => new Promise<void>(() => undefined)),
  } satisfies Pick<NotificationService, 'tasksInProgress' | 'connectToProgressHub'>;
  const currentVmUsers$ = new BehaviorSubject<string[]>([]);
  const signalr = { currentVmUsers$ } satisfies Pick<SignalRService, 'currentVmUsers$'>;
  const auth = { setUserTheme: vi.fn() } satisfies Pick<ComnAuthService, 'setUserTheme'>;
  const snackBar = { open: vi.fn() } satisfies Pick<MatSnackBar, 'open'>;

  const rendered = await renderComponent(OptionsBarComponent, {
    inputs: {
      vm: overrides.model ?? model(),
      vmId: 'vm-1',
      readOnly: overrides.readOnly ?? false,
      allowReadOnlyToggle: overrides.allowReadOnlyToggle ?? false,
    },
    providers: [
      { provide: VsphereService, useValue: vsphere },
      { provide: DialogService, useValue: dialogs },
      { provide: CrucibleDialogService, useValue: crucibleDialog },
      { provide: NotificationService, useValue: notifications },
      { provide: SignalRService, useValue: signalr },
      { provide: ComnAuthService, useValue: auth },
      {
        provide: ComnAuthQuery,
        useValue: { userTheme$: of(Theme.LIGHT) } satisfies Pick<ComnAuthQuery, 'userTheme$'>,
      },
      { provide: MatSnackBar, useValue: snackBar },
      ...permissionDataProviders(overrides.grants ?? {}),
    ],
  });

  return {
    ...rendered,
    vsphere,
    wmks,
    dialogs,
    progress,
    confirm,
    tasksInProgress,
    currentVmUsers$,
    notifications,
    auth,
    snackBar,
    component: rendered.fixture.componentInstance,
  };
}

async function openMainMenu(fixture: ComponentFixture<OptionsBarComponent>) {
  const menu = await TestbedHarnessEnvironment.loader(fixture).getHarness(
    MatMenuHarness,
  );
  await menu.open();
  return menu;
}

async function mainMenuItems(fixture: ComponentFixture<OptionsBarComponent>) {
  const menu = await openMainMenu(fixture);
  const items = await menu.getItems();
  return Promise.all(items.map((item) => item.getText()));
}

async function submenuItems(
  fixture: ComponentFixture<OptionsBarComponent>,
  label: string,
) {
  const menu = await openMainMenu(fixture);
  const [item] = await menu.getItems({ text: label });
  const submenu = await item.getSubmenu();
  await submenu!.open();
  const items = await submenu!.getItems();
  return Promise.all(items.map((i) => i.getText()));
}

type MenuText = string | RegExp;

/** Opens the gear menu and clicks through submenu labels to the item, as a user does. */
async function clickMenu(
  fixture: ComponentFixture<OptionsBarComponent>,
  first: MenuText,
  ...rest: MenuText[]
) {
  const menu = await openMainMenu(fixture);
  await menu.clickItem({ text: first }, ...rest.map((text) => ({ text })));
}

/** Opens the gear menu and each named submenu in turn; returns the last one. */
async function openSubmenu(
  fixture: ComponentFixture<OptionsBarComponent>,
  ...path: MenuText[]
): Promise<MatMenuHarness> {
  let menu = await openMainMenu(fixture);
  for (const text of path) {
    const [item] = await menu.getItems({ text });
    menu = (await item.getSubmenu())!;
    await menu.open();
  }
  return menu;
}

/** The menu item at the end of `path` (submenu labels, then the item). */
async function findMenuItem(
  fixture: ComponentFixture<OptionsBarComponent>,
  ...path: MenuText[]
): Promise<MatMenuItemHarness> {
  const label = path.pop()!;
  const menu = await openSubmenu(fixture, ...path);
  const [item] = await menu.getItems({ text: label });
  return item;
}

async function itemTexts(menu: MatMenuHarness) {
  const items = await menu.getItems();
  return Promise.all(items.map((item) => item.getText()));
}

/** The hidden file input in the gear menu; present while the menu is open. */
async function openFileInput(fixture: ComponentFixture<OptionsBarComponent>) {
  await openMainMenu(fixture);
  return document.getElementById('fileInput') as HTMLInputElement;
}

const CREDENTIALS = { username: 'admin', password: 'pw', filepath: '/tmp/' };

describe('OptionsBarComponent', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  describe('read-only toggle gate', () => {
    /**
     * Verifies: the Read Only switch is withheld when the page does not allow toggling.
     * Interacts with: the allowReadOnlyToggle input; the gear menu (MatMenuHarness).
     * Data: allowReadOnlyToggle false; readOnly true.
     */
    it('hides the Read Only switch without allowReadOnlyToggle', async () => {
      const { fixture } = await renderOptionsBar({
        allowReadOnlyToggle: false,
        readOnly: true,
      });
      expect(await mainMenuItems(fixture)).not.toContain('Read Only');
    });

    /**
     * Verifies: the Read Only switch is offered when the page allows toggling.
     * Interacts with: the allowReadOnlyToggle input; the gear menu (MatMenuHarness).
     * Data: allowReadOnlyToggle true.
     */
    it('shows the Read Only switch with allowReadOnlyToggle', async () => {
      const { fixture } = await renderOptionsBar({ allowReadOnlyToggle: true });
      expect(await mainMenuItems(fixture)).toContain('Read Only');
    });

    /**
     * Verifies: the switch reflects the current read-only state and flipping it navigates to readOnly=false in the URL.
     * Interacts with: MatSlideToggleHarness (in the menu overlay); real VmService.setReadOnly; the real Router from renderComponent.
     * Data: allowReadOnlyToggle true; readOnly true, switched off.
     */
    it('flips read-only through VmService.setReadOnly', async () => {
      const { fixture } = await renderOptionsBar({
        allowReadOnlyToggle: true,
        readOnly: true,
      });
      await openMainMenu(fixture);
      const toggle = await TestbedHarnessEnvironment.documentRootLoader(
        fixture,
      ).getHarness(MatSlideToggleHarness.with({ label: 'Read Only' }));
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
      await renderOptionsBar({ readOnly });
      expect(screen.getByText(label, { exact: true })).toBeInTheDocument();
    });
  });

  describe('read-only lockout', () => {
    /**
     * Verifies: read-only leaves only the view controls (fullscreen, reconnect, theme) in the menu.
     * Interacts with: the readOnly input; the gear menu.
     * Data: readOnly true; every view permission granted.
     */
    it('removes every control from the menu when read-only', async () => {
      const { fixture } = await renderOptionsBar({
        readOnly: true,
        grants: { view: Object.values(AppViewPermission) },
      });
      expect(await mainMenuItems(fixture)).toEqual([
        'Fullscreen',
        'Reconnect',
        'Dark Theme',
      ]);
    });

    /**
     * Verifies: read-only hides the Copy / Paste / Ctrl-Alt-Del bar and the connected-users list.
     * Interacts with: the readOnly input; SignalRService.currentVmUsers$.
     * Data: readOnly true; one connected user.
     */
    it('hides the clipboard bar and connected users when read-only', async () => {
      const { fixture, currentVmUsers$ } = await renderOptionsBar({ readOnly: true });
      currentVmUsers$.next(['alice']);
      fixture.detectChanges();

      expect(
        screen.queryByRole('button', { name: /Ctrl-Alt-Del/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Connected:/)).not.toBeInTheDocument();
    });

    /**
     * Verifies: an interactive console offers the control menus and the clipboard bar.
     * Interacts with: the readOnly input; the gear menu.
     * Data: readOnly false; non-owner Vm; no view permissions.
     */
    it('offers the control menus when interactive', async () => {
      const { fixture } = await renderOptionsBar({ readOnly: false });

      expect(await mainMenuItems(fixture)).toEqual([
        'Fullscreen',
        'Reconnect',
        'Dark Theme',
        'Resolution',
        'Power',
        'Files',
        'Keyboard',
        'Network Cards',
        'Clipboard',
      ]);
      expect(screen.getByRole('button', { name: /Ctrl-Alt-Del/ })).toBeInTheDocument();
    });

    /**
     * Verifies: the Resolution menu is withheld from the Vm's owner, whose console resizes the guest itself.
     * Interacts with: VsphereService.model.isOwner; the gear menu.
     * Data: isOwner true.
     */
    it('hides Resolution from the Vm owner', async () => {
      const { fixture } = await renderOptionsBar({ model: model({ isOwner: true }) });
      expect(await mainMenuItems(fixture)).not.toContain('Resolution');
    });
  });

  describe('view permission gates', () => {
    /**
     * Verifies: Snapshots is withheld without the RevertVms view permission, however many other view permissions the user holds.
     * Interacts with: real UserPermissionsService.can() over a stubbed getVmPermissions; the gear menu.
     * Data: every view permission except RevertVms.
     */
    it('hides Snapshots without RevertVms', async () => {
      const { fixture } = await renderOptionsBar({
        grants: { view: viewPermissionsExcept(AppViewPermission.RevertVms) },
      });
      expect(await mainMenuItems(fixture)).not.toContain('Snapshots');
    });

    /**
     * Verifies: Snapshots appears with the RevertVms view permission.
     * Interacts with: real UserPermissionsService.can() over a stubbed getVmPermissions; the gear menu.
     * Data: view RevertVms.
     */
    it('shows Snapshots with RevertVms', async () => {
      const { fixture } = await renderOptionsBar({
        grants: { view: [AppViewPermission.RevertVms] },
      });
      expect(await mainMenuItems(fixture)).toContain('Snapshots');
    });

    /**
     * Verifies: system and team permissions don't unlock the view-level Snapshots item.
     * Interacts with: real UserPermissionsService.can() (team/view only) over a stubbed getVmPermissions; the gear menu.
     * Data: system ControlVms and ManageViews, team ControlTeamVms and ManageTeam.
     */
    it('does not show Snapshots for system or team permissions alone', async () => {
      const { fixture } = await renderOptionsBar({
        grants: {
          system: [AppSystemPermission.ControlVms, AppSystemPermission.ManageViews],
          team: [AppTeamPermission.ControlTeamVms, AppTeamPermission.ManageTeam],
        },
      });
      expect(await mainMenuItems(fixture)).not.toContain('Snapshots');
    });

    /**
     * Verifies: the Files submenu offers credentials, upload and download only to holders of the matching view permission.
     * Interacts with: real UserPermissionsService.can() over a stubbed getVmPermissions; the Files submenu (MatMenuHarness).
     * Data: the grants named in the test; the denied row holds every view permission but the two file permissions, plus the team ISO permissions.
     */
    it.each<[string, PermissionGrants, string[]]>([
      [
        'every permission but the file ones',
        {
          view: viewPermissionsExcept(
            AppViewPermission.UploadVmFiles,
            AppViewPermission.DownloadVmFiles,
          ),
          team: [AppTeamPermission.UploadTeamIsos, AppTeamPermission.ControlTeamVms],
        },
        ['Mount ISO'],
      ],
      [
        'UploadVmFiles',
        { view: [AppViewPermission.UploadVmFiles] },
        ['Enter VM Credentials', 'Send File To VM', 'Mount ISO'],
      ],
      [
        'DownloadVmFiles',
        { view: [AppViewPermission.DownloadVmFiles] },
        ['Enter VM Credentials', 'Download File From VM', 'Mount ISO'],
      ],
      [
        'both file permissions',
        { view: [AppViewPermission.UploadVmFiles, AppViewPermission.DownloadVmFiles] },
        ['Enter VM Credentials', 'Send File To VM', 'Download File From VM', 'Mount ISO'],
      ],
    ])('offers the right Files items with %s', async (_label, grants, expected) => {
      const { fixture } = await renderOptionsBar({ grants });
      expect(await submenuItems(fixture, 'Files')).toEqual(expected);
    });
  });

  describe('actions', () => {
    /**
     * Verifies: each Power submenu item dispatches its command to VsphereService with the Vm id.
     * Interacts with: the Power submenu (MatMenuHarness clickItem); VsphereService power spies.
     * Data: Vm 'vm-1' with VMware Tools running; the item under test.
     */
    it.each<[string, 'powerOn' | 'powerOff' | 'reBoot' | 'shutdownOS']>([
      ['Power On', 'powerOn'],
      ['Power Off', 'powerOff'],
      ['Reboot', 'reBoot'],
      ['Shutdown OS', 'shutdownOS'],
    ])('sends %s for the Vm', async (item, method) => {
      const { fixture, vsphere } = await renderOptionsBar();
      await clickMenu(fixture, 'Power', item);
      expect(vsphere[method]).toHaveBeenCalledWith('vm-1');
    });

    /**
     * Verifies: Reconnect disconnects and reconnects with the current read-only state.
     * Interacts with: the gear menu; VsphereService.disconnect/connect spies.
     * Data: readOnly false.
     */
    it('reconnects the console', async () => {
      const { fixture, vsphere } = await renderOptionsBar();
      const menu = await openMainMenu(fixture);
      await menu.clickItem({ text: 'Reconnect' });
      expect(vsphere.disconnect).toHaveBeenCalled();
      expect(vsphere.connect).toHaveBeenCalledWith('vm-1', false);
    });

    /**
     * Verifies: the Ctrl-Alt-Del button sends the key combination through WMKS.
     * Interacts with: user-event click; the fake WMKS client's sendCAD.
     * Data: interactive console.
     */
    it('sends Ctrl-Alt-Del from the toolbar', async () => {
      const user = userEvent.setup();
      const { wmks } = await renderOptionsBar();
      await user.click(screen.getByRole('button', { name: /Ctrl-Alt-Del/ }));
      expect(wmks.sendCAD).toHaveBeenCalledOnce();
    });

    /**
     * Verifies: the Dark Theme switch sets the user's theme both ways.
     * Interacts with: MatSlideToggleHarness in the menu overlay; ComnAuthService.setUserTheme spy.
     * Data: light theme initially; toggled on, then off.
     */
    it('switches the theme', async () => {
      const { fixture, auth } = await renderOptionsBar();
      await openMainMenu(fixture);
      const toggle = await TestbedHarnessEnvironment.documentRootLoader(
        fixture,
      ).getHarness(MatSlideToggleHarness.with({ label: 'Dark Theme' }));

      await toggle.toggle();
      await toggle.toggle();

      expect(auth.setUserTheme.mock.calls).toEqual([[Theme.DARK], [Theme.LIGHT]]);
    });

    /**
     * Verifies: the progress hub is joined for this Vm and in-flight tasks are listed until they succeed.
     * Interacts with: NotificationService.connectToProgressHub spy and tasksInProgress subject.
     * Data: one running task at 40%, then the same task succeeded.
     */
    it('lists in-progress tasks from the progress hub', async () => {
      const { fixture, notifications, tasksInProgress } = await renderOptionsBar();
      expect(notifications.connectToProgressHub).toHaveBeenCalledWith('vm-1');

      const running: NotificationData = {
        taskId: 't1',
        taskName: 'Upload',
        taskType: 'File',
        broadcastTime: '',
        progress: '40',
        state: 'running',
      };
      tasksInProgress.next([running]);
      fixture.detectChanges();
      expect(screen.getByText('Upload ... 40%')).toBeInTheDocument();

      tasksInProgress.next([{ ...running, state: 'success' }]);
      fixture.detectChanges();
      expect(screen.queryByText(/Upload \.\.\./)).not.toBeInTheDocument();
    });

    /**
     * Verifies: a progress hub that fails to connect adds no unhandled rejection of its own, although the bar drops the returned promise.
     * Interacts with: NotificationService.connectToProgressHub (a plain function returning a rejected promise with a handler already chained, as the service's connectionPromise has); captureUnhandledRxErrors.
     * Data: connectToProgressHub rejects with 'hub down'.
     * Why: the service chains .then(...).catch(...) on connectionPromise before returning it (notification.service.ts:60-71), so a caller that drops it leaves nothing unhandled; the stub mirrors that, and is a plain function because a vi.fn would mark its rejection handled regardless.
     */
    it('adds no unhandled rejection when the progress hub fails to connect', async () => {
      const errors = captureUnhandledRxErrors();
      const failure = new Error('hub down');
      const progressHub = () => {
        const connection = Promise.reject(failure);
        connection.then(() => undefined).catch(() => undefined);
        return connection;
      };

      await renderOptionsBar({ progressHub });
      await flush();

      // The service's own rethrow on a failed start is pinned in
      // notification.service.spec.ts ('lets the rethrow in
      // connectToProgressHub() escape as an unhandled rejection').
      expect(errors).toEqual([]);
    });
  });

  describe('network change confirmation', () => {
    const restricted = model({
      networkCards: {
        availableNetworks: {
          restricted: 'Restricted Network',
          allowed: 'Allowed Network',
        },
        currentNetworks: { adapter1: 'restricted' },
        readOnlyNetworks: ['restricted'],
      },
    });

    /**
     * Verifies: leaving a network outside the user's allowed list asks for confirmation, then changes the adapter.
     * Interacts with: the Network Cards > adapter1 submenu (MatMenuHarness clickItem); CrucibleDialogService.confirm stub (confirmed); VsphereService.changeNic spy.
     * Data: adapter1 on read-only 'restricted'; target 'Allowed Network'.
     */
    it('changes a restricted network only after explicit confirmation', async () => {
      const { fixture, confirm, vsphere } = await renderOptionsBar({
        model: restricted,
        confirmation: true,
      });

      await clickMenu(fixture, 'Network Cards', 'adapter1', /Allowed Network/);

      expect(confirm).toHaveBeenCalledWith({
        title: 'Confirm Network Change',
        message:
          'You are currently on "Restricted Network", which is not in your allowed network list. If you switch away, you will not be able to switch back. Do you want to continue?',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
      });
      expect(vsphere.changeNic).toHaveBeenCalledWith('vm-1', 'adapter1', 'allowed');
    });

    /**
     * Verifies: cancelling or dismissing the confirmation leaves the restricted network in place.
     * Interacts with: the Network Cards > adapter1 submenu; CrucibleDialogService.confirm stub; VsphereService.changeNic spy.
     * Data: confirmation answered false, or dismissed without an answer.
     */
    it.each([false, 'dismissed'] as const)(
      'does not change a restricted network when confirmation is %s',
      async (confirmation) => {
        const { fixture, vsphere } = await renderOptionsBar({
          model: restricted,
          confirmation,
        });
        await clickMenu(fixture, 'Network Cards', 'adapter1', /Allowed Network/);
        expect(vsphere.changeNic).not.toHaveBeenCalled();
      },
    );

    /**
     * Verifies: moving between allowed networks needs no confirmation and stores the returned model.
     * Interacts with: the Network Cards > adapter1 submenu; CrucibleDialogService.confirm stub; VsphereService.changeNic spy and model.
     * Data: adapter1 on 'allowed'; target 'Other Network'; API returns a model named 'Changed'.
     */
    it('changes an unrestricted network straight away', async () => {
      const { fixture, confirm, vsphere } = await renderOptionsBar();
      vsphere.changeNic = vi.fn(() => of(model({ name: 'Changed' })));

      await clickMenu(fixture, 'Network Cards', 'adapter1', /Other Network/);

      expect(confirm).not.toHaveBeenCalled();
      expect(vsphere.changeNic).toHaveBeenCalledWith('vm-1', 'adapter1', 'other');
      expect(vsphere.model.name).toBe('Changed');
    });

    /**
     * Verifies: the adapter submenu lists the current network first and drops other restricted networks; the search box filters it and closing the submenu clears the search.
     * Interacts with: the Network Cards > adapter1 submenu (MatMenuHarness); user-event typing in the search input.
     * Data: current 'Bravo Net', restricted 'Hidden Net'; search 'char'.
     */
    it('orders and filters the adapter networks', async () => {
      const user = userEvent.setup();
      const { fixture } = await renderOptionsBar({
        model: model({
          networkCards: {
            availableNetworks: {
              a: 'Alpha Net',
              b: 'Bravo Net',
              c: 'Charlie Net',
              x: 'Hidden Net',
            },
            currentNetworks: { adapter1: 'b' },
            readOnlyNetworks: ['x'],
          },
        }),
      });

      const adapter = await openSubmenu(fixture, 'Network Cards', 'adapter1');
      expect(await itemTexts(adapter)).toEqual([
        '✔ Bravo Net',
        'Alpha Net',
        'Charlie Net',
      ]);

      await user.type(screen.getByPlaceholderText('Search networks...'), 'char');
      expect(await itemTexts(adapter)).toEqual(['Charlie Net']);

      await adapter.close();
      const reopened = await openSubmenu(fixture, 'Network Cards', 'adapter1');
      expect(await itemTexts(reopened)).toHaveLength(3);
    });
  });

  describe('snapshots', () => {
    const revertVms: PermissionGrants = { view: [AppViewPermission.RevertVms] };

    /**
     * Verifies: choosing a snapshot from the Snapshots item reverts to it and reports success.
     * Interacts with: the gear menu Snapshots item (MatMenuHarness clickItem); VsphereService.getSnapshots/revertToSnapshot; DialogService.selectSnapshot; CrucibleDialogService.confirm (message).
     * Data: view RevertVms; snapshot 's1' chosen.
     */
    it('reverts to the chosen snapshot and reports success', async () => {
      const { fixture, vsphere, dialogs, confirm } = await renderOptionsBar({
        grants: revertVms,
      });
      dialogs.selectSnapshot.mockReturnValue(of({ id: 's1', name: 'Clean' }));

      await clickMenu(fixture, 'Snapshots');

      expect(dialogs.selectSnapshot).toHaveBeenCalledWith([{ id: 's1', name: 'Clean' }]);
      expect(vsphere.revertToSnapshot).toHaveBeenCalledWith('vm-1', 's1');
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Revert VM', message: 'Revert Successful' }),
      );
    });

    /**
     * Verifies: the Snapshots item is disabled for a Vm without snapshots.
     * Interacts with: VsphereService.model.hasSnapshot; the gear menu Snapshots item (MatMenuItemHarness.isDisabled).
     * Data: view RevertVms; hasSnapshot false.
     */
    it('disables Snapshots when the Vm has none', async () => {
      const { fixture } = await renderOptionsBar({
        grants: revertVms,
        model: model({ hasSnapshot: false }),
      });
      expect(await (await findMenuItem(fixture, 'Snapshots')).isDisabled()).toBe(true);
    });

    /**
     * Verifies: dismissing the picker reverts nothing.
     * Interacts with: the Snapshots item; DialogService.selectSnapshot (undefined); VsphereService.revertToSnapshot spy.
     * Data: view RevertVms; picker closed without a choice.
     */
    it('does nothing when no snapshot is chosen', async () => {
      const { fixture, vsphere, confirm } = await renderOptionsBar({
        grants: revertVms,
      });
      await clickMenu(fixture, 'Snapshots');
      expect(vsphere.revertToSnapshot).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
    });

    /**
     * Verifies: a failed revert is reported to the user.
     * Interacts with: the Snapshots item; VsphereService.revertToSnapshot rejecting; CrucibleDialogService.confirm (message).
     * Data: view RevertVms; snapshot 's1' chosen; API error.
     */
    it('reports a failed revert', async () => {
      const { fixture, vsphere, dialogs, confirm } = await renderOptionsBar({
        grants: revertVms,
      });
      dialogs.selectSnapshot.mockReturnValue(of({ id: 's1' }));
      vsphere.revertToSnapshot = vi.fn(() => throwError(() => new Error('nope')));

      await clickMenu(fixture, 'Snapshots');

      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Revert VM', message: 'Revert Failed' }),
      );
    });
  });

  describe('file transfer', () => {
    const fileGrants: PermissionGrants = {
      view: [AppViewPermission.UploadVmFiles, AppViewPermission.DownloadVmFiles],
    };

    /** Enters credentials through Files > Enter VM Credentials. */
    async function enterCredentials(
      ctx: Awaited<ReturnType<typeof renderOptionsBar>>,
      info = CREDENTIALS,
    ) {
      ctx.dialogs.getFileUploadInfo.mockReturnValueOnce(of(info));
      await clickMenu(ctx.fixture, 'Files', 'Enter VM Credentials');
    }

    /**
     * Verifies: Enter VM Credentials is disabled while VMware Tools is not running.
     * Interacts with: VsphereService.model.vmToolsStatus; the Files submenu item (MatMenuItemHarness.isDisabled).
     * Data: file permissions; tools not running.
     */
    it('disables Enter VM Credentials without running VMware Tools', async () => {
      const { fixture } = await renderOptionsBar({
        grants: fileGrants,
        model: model({ vmToolsStatus: VirtualMachineToolsStatus.toolsNotRunning }),
      });
      const item = await findMenuItem(fixture, 'Files', 'Enter VM Credentials');
      expect(await item.isDisabled()).toBe(true);
    });

    /**
     * Verifies: before the Tools status is known the item is enabled, but the action refuses without opening the credentials dialog.
     * Interacts with: Files > Enter VM Credentials; CrucibleDialogService.confirm (message); DialogService.getFileUploadInfo.
     * Data: file permissions; vmToolsStatus not reported yet.
     */
    it('requires VMware Tools before asking for credentials', async () => {
      const { fixture, dialogs, confirm } = await renderOptionsBar({
        grants: fileGrants,
        model: model({ vmToolsStatus: undefined }),
      });

      await clickMenu(fixture, 'Files', 'Enter VM Credentials');

      expect(dialogs.getFileUploadInfo).not.toHaveBeenCalled();
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Action requires VMware Tools to be running!' }),
      );
      const send = await findMenuItem(fixture, 'Files', 'Send File To VM');
      expect(await send.isDisabled()).toBe(true);
    });

    /**
     * Verifies: entered credentials are stored with the path's own trailing separator added, verified, and Send File To VM is enabled.
     * Interacts with: Files > Enter VM Credentials; DialogService.getFileUploadInfo; VsphereService.uploadConfig and verifyCredentials; the Send File To VM item.
     * Data: the path under test (Windows or POSIX).
     */
    it.each([
      ['C:\\Temp', 'C:\\Temp\\'],
      ['/tmp', '/tmp/'],
    ])('normalizes %s to %s and enables upload once credentials verify', async (entered, stored) => {
      const ctx = await renderOptionsBar({ grants: fileGrants });
      const { fixture, vsphere } = ctx;
      const send = () => findMenuItem(fixture, 'Files', 'Send File To VM');
      expect(await (await send()).isDisabled()).toBe(true);

      await enterCredentials(ctx, { username: 'admin', password: 'pw', filepath: entered });

      expect(vsphere.uploadConfig.filepath).toBe(stored);
      expect(vsphere.verifyCredentials).toHaveBeenCalledWith('vm-1');
      expect(await (await send()).isDisabled()).toBe(false);
    });

    /**
     * Verifies: a relative path re-opens the dialog with an explanation, without verifying.
     * Interacts with: Files > Enter VM Credentials; DialogService.getFileUploadInfo (called again with a new title); VsphereService.verifyCredentials.
     * Data: path 'temp', then the user cancels.
     */
    it('asks again for a relative path', async () => {
      const ctx = await renderOptionsBar({ grants: fileGrants });

      await enterCredentials(ctx, { username: 'admin', password: 'pw', filepath: 'temp' });

      expect(ctx.dialogs.getFileUploadInfo).toHaveBeenLastCalledWith(
        'The file path must be an absolute path.',
      );
      expect(ctx.vsphere.verifyCredentials).not.toHaveBeenCalled();
    });

    /**
     * Verifies: rejected credentials re-prompt with a reason that depends on the API's error title.
     * Interacts with: Files > Enter VM Credentials; VsphereService.verifyCredentials rejecting; DialogService.getFileUploadInfo.
     * Data: an error body whose title is the one under test.
     */
    it.each([
      ['Invalid credentials', 'Bad Credentials.  Please try again.'],
      ['Bad parameter', 'The entered path was not valid.'],
      ['Boom', 'Unhandled error. Please try again.'],
    ])('re-prompts for the error %j with %j', async (title, prompt) => {
      const ctx = await renderOptionsBar({ grants: fileGrants });
      ctx.vsphere.verifyCredentials = vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 400, error: { title } })),
      );

      await enterCredentials(ctx);

      expect(ctx.dialogs.getFileUploadInfo).toHaveBeenLastCalledWith(prompt);
      const send = await findMenuItem(ctx.fixture, 'Files', 'Send File To VM');
      expect(await send.isDisabled()).toBe(true);
    });

    /**
     * Verifies: a credential check that fails with an empty error body crashes the error callback, so the user is never re-prompted.
     * Interacts with: Files > Enter VM Credentials; VsphereService.verifyCredentials rejecting; DialogService.getFileUploadInfo; rxjs unhandled-error hook.
     * Data: HttpErrorResponse 401 with error null (an empty body, as JwtBearer sends).
     */
    it('throws instead of re-prompting when the credential check fails with no body', async () => {
      const errors = captureUnhandledRxErrors();
      const ctx = await renderOptionsBar({ grants: fileGrants });
      ctx.vsphere.verifyCredentials = vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 401, error: null })),
      );

      await enterCredentials(ctx);
      await flush();

      expect(errors).toEqual([expect.any(TypeError)]);
      expect(ctx.dialogs.getFileUploadInfo).toHaveBeenCalledOnce();
      const send = await findMenuItem(ctx.fixture, 'Files', 'Send File To VM');
      expect(await send.isDisabled()).toBe(true);
    });

    /**
     * Verifies: Send File To VM opens the hidden file picker once credentials have been verified.
     * Interacts with: Files > Enter VM Credentials, then Files > Send File To VM; HTMLInputElement.click spy on #fileInput.
     * Data: file permissions; credentials verify.
     */
    it('opens the file picker from Send File To VM', async () => {
      const ctx = await renderOptionsBar({ grants: fileGrants });
      await enterCredentials(ctx);
      const click = vi
        .spyOn(HTMLInputElement.prototype, 'click')
        .mockImplementation(() => undefined);

      await clickMenu(ctx.fixture, 'Files', 'Send File To VM');

      expect(click).toHaveBeenCalledOnce();
      expect((click.mock.contexts[0] as HTMLInputElement).id).toBe('fileInput');
    });

    /**
     * Verifies: choosing files uploads them, shows progress, reports success, and always closes the progress dialog and resets the input.
     * Interacts with: user-event upload on #fileInput (its change binding); DialogService.uploadProgress ref; VsphereService.sendFileToVm; CrucibleDialogService.confirm (message).
     * Data: one selected file 'a.txt'.
     */
    it('uploads the selected files and cleans up', async () => {
      const user = userEvent.setup();
      const { fixture, vsphere, confirm, progress, component } = await renderOptionsBar({
        grants: fileGrants,
      });
      const input = await openFileInput(fixture);
      const file = new File(['a'], 'a.txt');

      await user.upload(input, file);

      expect(vsphere.sendFileToVm).toHaveBeenCalledOnce();
      const [vmId, sent] = vi.mocked(vsphere.sendFileToVm).mock.calls[0];
      expect(vmId).toBe('vm-1');
      expect(sent).toHaveLength(1);
      expect(sent.item(0)).toBe(file);
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'File Uploaded Successfully' }),
      );
      expect(progress.close).toHaveBeenCalled();
      expect(input.value).toBe('');
      expect(component.uploading).toBe(false);
    });

    /**
     * Verifies: a failed upload with an empty error body shows no message, though the progress dialog still closes.
     * Interacts with: user-event upload on #fileInput; VsphereService.sendFileToVm rejecting; CrucibleDialogService.confirm; rxjs unhandled-error hook.
     * Data: HttpErrorResponse 401 with error null.
     */
    it('shows no message when an upload fails with no error body', async () => {
      const errors = captureUnhandledRxErrors();
      const user = userEvent.setup();
      const { fixture, vsphere, confirm, progress, component } = await renderOptionsBar({
        grants: fileGrants,
      });
      vsphere.sendFileToVm = vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 401, error: null })),
      );
      const input = await openFileInput(fixture);

      await user.upload(input, new File(['a'], 'a.txt'));
      await flush();

      // uploadFileToVm's error callback (options-bar.component.ts:474) reads error.error.title
      // without a null check, so the empty body throws a TypeError before any message is shown.
      expect(errors).toEqual([expect.any(TypeError)]);
      expect(confirm).not.toHaveBeenCalled();
      expect(progress.close).toHaveBeenCalled();
      expect(component.uploading).toBe(false);
    });

    /**
     * Verifies: a change event with no file chosen uploads nothing.
     * Interacts with: the #fileInput change binding; DialogService.uploadProgress; VsphereService.sendFileToVm.
     * Data: file input with no value.
     */
    it('ignores an empty file selection', async () => {
      const { fixture, dialogs, vsphere } = await renderOptionsBar({ grants: fileGrants });
      const input = await openFileInput(fixture);

      fireEvent.change(input);

      expect(dialogs.uploadProgress).not.toHaveBeenCalled();
      expect(vsphere.sendFileToVm).not.toHaveBeenCalled();
    });

    /**
     * Verifies: after credentials verify, Download File From VM asks for the path only and then follows the returned link.
     * Interacts with: Files > Enter VM Credentials, then Files > Download File From VM; DialogService.getFileUploadInfo; VsphereService.getVmFileUrl; HTMLAnchorElement.click spy.
     * Data: path '/var/log/syslog'; API returns url 'https://files.test/x' named 'x.txt'.
     */
    it('downloads a file through a generated link', async () => {
      const ctx = await renderOptionsBar({ grants: fileGrants });
      const { fixture, dialogs, vsphere } = ctx;
      await enterCredentials(ctx);
      dialogs.getFileUploadInfo.mockReturnValue(
        of({ username: '', password: '', filepath: '/var/log/syslog' }),
      );
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);

      await clickMenu(fixture, 'Files', 'Download File From VM');

      expect(dialogs.getFileUploadInfo).toHaveBeenLastCalledWith('Download File Settings', {
        showCredentials: false,
      });
      expect(vsphere.getVmFileUrl).toHaveBeenCalledWith('vm-1', '/var/log/syslog');
      const link = click.mock.contexts[0] as HTMLAnchorElement;
      expect(link.href).toBe('https://files.test/x');
      expect(link.download).toBe('x.txt');
    });
  });

  describe('ISOs', () => {
    /**
     * Verifies: Mount ISO lists the Vm's ISOs, mounts the chosen one by its mount value, stores the returned model, and re-enables the item.
     * Interacts with: Files > Mount ISO (MatMenuHarness clickItem); VsphereService.getIsos/mountIso and model; DialogService.mountIso.
     * Data: chosen ISO with mountValue '[ds] tools.iso'.
     */
    it('mounts the chosen ISO', async () => {
      const { fixture, dialogs, vsphere } = await renderOptionsBar();
      dialogs.mountIso.mockReturnValue(
        of({ filename: 'tools.iso', mountValue: '[ds] tools.iso' }),
      );

      await clickMenu(fixture, 'Files', 'Mount ISO');

      expect(vsphere.getIsos).toHaveBeenCalledWith('vm-1');
      expect(vsphere.mountIso).toHaveBeenCalledWith('vm-1', '[ds] tools.iso');
      expect(vsphere.model.name).toBe('Mounted');
      const item = await findMenuItem(fixture, 'Files', 'Mount ISO');
      expect(await item.isDisabled()).toBe(false);
    });

    /**
     * Verifies: a failed ISO listing re-enables Mount ISO and mounts nothing.
     * Interacts with: Files > Mount ISO; VsphereService.getIsos rejecting; DialogService.mountIso.
     * Data: API error.
     */
    it('recovers from a failed ISO listing', async () => {
      const { fixture, dialogs, vsphere } = await renderOptionsBar();
      vsphere.getIsos = vi.fn(() => throwError(() => new Error('nope')));

      await clickMenu(fixture, 'Files', 'Mount ISO');

      expect(dialogs.mountIso).not.toHaveBeenCalled();
      const item = await findMenuItem(fixture, 'Files', 'Mount ISO');
      expect(await item.isDisabled()).toBe(false);
    });
  });

  describe('errors left to ErrorService', () => {
    type Bar = Awaited<ReturnType<typeof renderOptionsBar>>;

    /**
     * Verifies: an API failure in a subscribe() with no error callback escapes to the app's global ErrorHandler and changes nothing in the bar.
     * Interacts with: the gear menu item named in the row; the VsphereService method rejecting; rxjs unhandled-error hook.
     * Data: file permissions; the failing call in the row rejects with 'nope'.
     */
    it.each<[string, (bar: Bar, failure: Error) => Promise<void>]>([
      [
        'changeNic()',
        async ({ fixture, vsphere }, failure) => {
          vsphere.changeNic = vi.fn(() => throwError(() => failure));
          await clickMenu(fixture, 'Network Cards', 'adapter1', /Other Network/);
        },
      ],
      [
        'getVmFileUrl()',
        async ({ fixture, dialogs, vsphere }, failure) => {
          dialogs.getFileUploadInfo.mockReturnValueOnce(of(CREDENTIALS));
          await clickMenu(fixture, 'Files', 'Enter VM Credentials');
          dialogs.getFileUploadInfo.mockReturnValue(
            of({ username: '', password: '', filepath: '/var/log/syslog' }),
          );
          vsphere.getVmFileUrl = vi.fn(() => throwError(() => failure));
          await clickMenu(fixture, 'Files', 'Download File From VM');
        },
      ],
      [
        'mountIso()',
        async ({ fixture, dialogs, vsphere }, failure) => {
          dialogs.mountIso.mockReturnValue(
            of({ filename: 'tools.iso', mountValue: '[ds] tools.iso' }),
          );
          vsphere.mountIso = vi.fn(() => throwError(() => failure));
          await clickMenu(fixture, 'Files', 'Mount ISO');
        },
      ],
      [
        'setResolution()',
        async ({ fixture, vsphere }, failure) => {
          vsphere.setResolution = vi.fn(() => throwError(() => failure));
          await clickMenu(fixture, 'Resolution', '1024x768');
        },
      ],
    ])('leaves a failed %s to ErrorService', async (_call, act) => {
      const errors = captureUnhandledRxErrors();
      const failure = new Error('nope');
      const bar = await renderOptionsBar({
        grants: {
          view: [AppViewPermission.UploadVmFiles, AppViewPermission.DownloadVmFiles],
        },
      });

      await act(bar, failure);
      await flush();

      // Not a defect: these subscribes have no error callback, so the error
      // reaches ErrorService (the global ErrorHandler, main.ts:81), which
      // shows it; no loading flag is left set (CONVENTIONS.md section 3).
      expect(errors).toEqual([failure]);
      expect(bar.vsphere.model.name).toBe('Alpha');
    });
  });

  describe('clipboard', () => {
    /**
     * Verifies: the toolbar Paste button types each line of the local clipboard into the guest followed by a newline.
     * Interacts with: user-event click on Paste; stubbed navigator.clipboard.readText; the fake WMKS client's sendInputString.
     * Data: clipboard 'one\ntwo'; the default 50ms between lines.
     */
    it('types the clipboard into the guest line by line', async () => {
      const user = userEvent.setup();
      const { wmks } = await renderOptionsBar();
      stubClipboard('one\ntwo');

      await user.click(screen.getByRole('button', { name: /^Paste/ }));

      await vi.waitFor(() =>
        expect(wmks.sendInputString.mock.calls).toEqual([['one'], ['\n'], ['two'], ['\n']]),
      );
    });

    /**
     * Verifies: text from Keyboard > Send Text is typed with no delay between lines when no paste speed was chosen.
     * Interacts with: the Keyboard submenu (MatMenuHarness); DialogService.sendText (returns timeout null, as SendTextDialogComponent does); the fake WMKS client's sendInputString.
     * Data: 'one\ntwo'; timeout null.
     * Why: fake timers, installed after the menu opens, show the second line goes out at 0ms rather than after the 50ms default.
     */
    it('types Send Text lines back to back when no paste speed was chosen', async () => {
      // The null timeout is pinned in send-text-dialog.component.spec.ts ('sends the typed text
      // with a null timeout when no speed was picked'); this shows its effect here: paste()'s
      // '50' default applies only to undefined, and parseInt(null) is NaN.
      const { fixture, dialogs, wmks } = await renderOptionsBar();
      dialogs.sendText.mockReturnValue(
        of({ textToSend: 'one\ntwo', timeout: null as unknown as string }),
      );
      await openSubmenu(fixture, 'Keyboard');
      vi.useFakeTimers();
      try {
        fireEvent.click(screen.getByRole('menuitem', { name: 'Send Text' }));
        expect(wmks.sendInputString.mock.calls).toEqual([['one'], ['\n']]);

        await vi.advanceTimersByTimeAsync(0);
        expect(wmks.sendInputString.mock.calls).toEqual([['one'], ['\n'], ['two'], ['\n']]);
      } finally {
        vi.useRealTimers();
      }
    });

    /**
     * Verifies: when the clipboard can't be read the toolbar Paste button opens the Send Text dialog instead.
     * Interacts with: user-event click on Paste; stubbed navigator.clipboard.readText rejecting; DialogService.sendText.
     * Data: clipboard permission denied.
     */
    it('falls back to the Send Text dialog when the clipboard is unavailable', async () => {
      const user = userEvent.setup();
      const { dialogs } = await renderOptionsBar();
      const { readText } = stubClipboard();
      readText.mockRejectedValue(new Error('denied'));

      await user.click(screen.getByRole('button', { name: /^Paste/ }));

      await vi.waitFor(() =>
        expect(dialogs.sendText).toHaveBeenCalledWith('Enter Text to Send'),
      );
    });

    /**
     * Verifies: guest clipboard copies are written locally only after the user pressed Copy.
     * Interacts with: the toolbar Copy button; VsphereService.vmClipBoard; stubbed navigator.clipboard.writeText; MatSnackBar.open spy.
     * Data: an unsolicited copy, then a copy after Copy was pressed.
     * Why: fake timers run the component's 2 second copy-retry timer without waiting for it.
     */
    it('writes guest copies to the local clipboard only when requested', async () => {
      const { vsphere, snackBar, wmks } = await renderOptionsBar();
      const { writeText } = stubClipboard();

      vsphere.vmClipBoard.next('unsolicited');
      await Promise.resolve();
      expect(writeText).not.toHaveBeenCalled();

      vi.useFakeTimers();
      try {
        fireEvent.click(screen.getByRole('button', { name: /^Copy/ }));
        expect(wmks.grab).toHaveBeenCalledOnce();
        vsphere.vmClipBoard.next('requested');
        await vi.runOnlyPendingTimersAsync();
      } finally {
        vi.useRealTimers();
      }

      expect(writeText).toHaveBeenCalledWith('requested');
      expect(snackBar.open).toHaveBeenCalledWith(
        'Copied Virtual Machine Clipboard',
        'Ok',
        expect.anything(),
      );
    });
  });

  describe('connected users', () => {
    /**
     * Verifies: the connected-users label lists up to two names, and its tooltip lists one name per line.
     * Interacts with: SignalRService.currentVmUsers$; the rendered label and its title attribute.
     * Data: the users under test.
     */
    it.each<[string[], string, string]>([
      [['alice'], 'Connected: alice', 'alice'],
      [['alice', 'bob'], 'Connected: alice, bob', 'alice\nbob'],
    ])('labels %j as %j', async (users, label, tooltip) => {
      const { fixture, currentVmUsers$ } = await renderOptionsBar();
      currentVmUsers$.next(users);
      fixture.detectChanges();

      expect(screen.getByText(label)).toBeInTheDocument();
      // The tooltip separates names with newlines, which the default normalizer would collapse.
      const keepNewlines = getDefaultNormalizer({ collapseWhitespace: false });
      expect(screen.getByTitle(tooltip, { normalizer: keepNewlines })).toHaveTextContent(label);
    });

    /**
     * Verifies: with nobody else connected the label is empty.
     * Interacts with: SignalRService.currentVmUsers$; the rendered label.
     * Data: no users.
     */
    it('shows no connected-users label when nobody is connected', async () => {
      const { fixture, currentVmUsers$ } = await renderOptionsBar();
      currentVmUsers$.next([]);
      fixture.detectChanges();

      expect(screen.queryByText(/Connected:/)).not.toBeInTheDocument();
    });

    /**
     * Verifies: with more than two users the summary is garbled.
     * Interacts with: formatConnectedUser().
     * Data: four users.
     */
    it('garbles the summary for more than two users', async () => {
      const { component } = await renderOptionsBar();
      expect(component.formatConnectedUser(['alice', 'bob', 'carol', 'dave'])).toBe(
        'Connected: alice, bob,  and 2others.',
      );
    });
  });
});

describe('KeysPipe', () => {
  /**
   * Verifies: the keys pipe turns an object into key/value pairs in insertion order.
   * Interacts with: KeysPipe.transform.
   * Data: { a: 1, b: 'two' }.
   */
  it('lists an object as key/value pairs', () => {
    expect(new KeysPipe().transform({ a: 1, b: 'two' }, [])).toEqual([
      { key: 'a', value: 1 },
      { key: 'b', value: 'two' },
    ]);
  });
});
