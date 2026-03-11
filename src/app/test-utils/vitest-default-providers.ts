// Copyright 2024 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Provider } from '@angular/core';
import { of, BehaviorSubject } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from '@angular/material/bottom-sheet';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';

// Akita Stores
import { UserStore } from '../state/user/user.store';
import { VmStore as VmEntityStore } from '../state/vm/vm.store';
import { VmStore as VsphereEntityStore } from '../state/vsphere/vsphere.store';

// Akita Queries
import { UserQuery } from '../state/user/user.query';
import { VmQuery } from '../state/vm/vm.query';
import { VsphereQuery } from '../state/vsphere/vsphere.query';

// Application Services
import { UserService } from '../state/user/user.service';
import { VmService } from '../state/vm/vm.service';
import { VsphereService } from '../state/vsphere/vsphere.service';
import { SignalRService } from '../services/signalr/signalr.service';
import { DialogService } from '../services/dialog/dialog.service';
import { ErrorService } from '../services/error/error.service';
import { SystemMessageService } from '../services/system-message/system-message.service';
import { NotificationService } from '../services/notification/notification.service';
import { ProxmoxService } from '../services/proxmox/proxmox.service';
import { NoVNCService } from '../services/novnc/novnc.service';
import { UserPermissionsService } from '../services/user-permissions/user-permissions.service';

// Generated API Services
import {
  CallbacksService,
  FileService,
  HealthService,
  ProxmoxService as ApiProxmoxService,
  VmUsageLoggingSessionService,
  VmsService,
  VsphereService as ApiVsphereService,
  BASE_PATH,
} from '../generated/vm-api';

// Common library
import { ComnSettingsService, ComnAuthService } from '@cmusei/crucible-common';

function getProvideToken(provider: any): any {
  if (typeof provider === 'function') return provider;
  return provider?.provide;
}

export function getDefaultProviders(overrides?: Provider[]): Provider[] {
  const defaults: Provider[] = [
    // Akita Stores
    { provide: UserStore, useValue: {} },
    { provide: VmEntityStore, useValue: {} },
    { provide: VsphereEntityStore, useValue: {} },

    // Akita Queries
    {
      provide: UserQuery,
      useValue: {
        selectAll: () => of([]),
        select: () => of(null),
        selectEntity: () => of(null),
        selectActive: () => of(null),
        selectLoading: () => of(false),
        getAll: () => [],
        getEntity: () => null,
      },
    },
    {
      provide: VmQuery,
      useValue: {
        selectAll: () => of([]),
        select: () => of(null),
        selectEntity: () => of(null),
        selectActive: () => of(null),
        selectLoading: () => of(false),
        getAll: () => [],
        getEntity: () => null,
      },
    },
    {
      provide: VsphereQuery,
      useValue: {
        selectAll: () => of([]),
        select: () => of(null),
        selectEntity: () => of(null),
        selectActive: () => of(null),
        selectLoading: () => of(false),
        getAll: () => [],
        getEntity: () => null,
      },
    },

    // Application Services
    {
      provide: UserService,
      useValue: {
        add: () => {},
        update: () => {},
        remove: () => {},
        setActive: () => {},
      },
    },
    {
      provide: VmService,
      useValue: {
        get: () => of({}),
        add: () => {},
        update: () => {},
        remove: () => {},
        sendCtrlAltDel: () => {},
        sendClipboardText: () => Promise.resolve(),
        setReadOnly: () => {},
      },
    },
    {
      provide: VsphereService,
      useValue: {
        model: {
          name: '',
          id: '',
          state: '',
          vmToolsStatus: '',
          isOwner: false,
          hasSnapshot: false,
          networkCards: null,
          canAccessNicConfiguration: false,
        },
        wmks: null,
        showLoading: false,
        showPower: false,
        showPoweringOff: false,
        showError: false,
        showLock: false,
        uploadConfig: { username: '', password: '', filepath: '' },
        vmClipBoard: new BehaviorSubject<string>(''),
        vmResolution: new BehaviorSubject({ width: 1024, height: 768 }),
        connectionStatus$: of({ connected: false }),
        connected$: of(false),
        disconnected$: of(true),
        settingsService: { settings: { VmResolutionOptions: [] } },
        connect: () => Promise.resolve(),
        disconnect: () => {},
        powerOn: () => {},
        powerOff: () => {},
        reBoot: () => {},
        shutdownOS: () => {},
        changeNic: () => of({}),
        getSnapshots: () => of([]),
        revertToSnapshot: () => of({}),
        getIsos: () => of([]),
        mountIso: () => of({}),
        setResolution: () => of({}),
        verifyCredentials: () => of({}),
        sendFileToVm: () => of({}),
        getVmFileUrl: () => of({}),
        getVm: () => of({}),
        setReadOnly: () => {},
      },
    },
    {
      provide: SignalRService,
      useValue: {
        startConnection: () => Promise.resolve(),
        joinUser: () => Promise.resolve({}),
        leaveUser: () => {},
        joinVm: () => {},
        leaveVm: () => {},
        setActiveVirtualMachine: () => {},
        unsetActiveVirtualMachine: () => {},
        currentVmUsers$: new BehaviorSubject<string[]>([]),
      },
    },
    {
      provide: DialogService,
      useValue: {
        message: () => of(true),
        sendText: () => of({}),
        getFileUploadInfo: () => of({}),
        mountIso: () => of(null),
        selectSnapshot: () => of(null),
        closeAll: () => {},
        confirm: () => of(true),
      },
    },
    { provide: ErrorService, useValue: { handleError: () => {} } },
    {
      provide: SystemMessageService,
      useValue: { displayMessage: () => {} },
    },
    {
      provide: NotificationService,
      useValue: {
        tasksInProgress: new BehaviorSubject([]),
        connectToProgressHub: () => Promise.resolve(),
      },
    },
    { provide: ProxmoxService, useValue: { sendCtrlAltDel: () => {}, sendClipboardText: () => {} } },
    { provide: NoVNCService, useValue: {} },
    {
      provide: UserPermissionsService,
      useValue: {
        permissions$: of({ teamPermissions: [], viewPermissions: [] }),
        readOnlyToggleable$: of(true),
        readOnly$: of(false),
        load: () => of({ teamPermissions: [], viewPermissions: [] }),
        can: () => of(false),
      },
    },

    // Generated API Services
    { provide: CallbacksService, useValue: {} },
    { provide: FileService, useValue: {} },
    { provide: HealthService, useValue: {} },
    { provide: ApiProxmoxService, useValue: {} },
    { provide: VmUsageLoggingSessionService, useValue: {} },
    { provide: VmsService, useValue: { getVmPermissions: () => of({ teamPermissions: [], viewPermissions: [] }) } },
    { provide: ApiVsphereService, useValue: {} },

    // BASE_PATH injection token
    { provide: BASE_PATH, useValue: 'http://localhost:4302' },

    // Common library services
    {
      provide: ComnSettingsService,
      useValue: {
        settings: {
          ApiUrl: '',
          AppTopBarText: 'VM Console',
          AppTopBarHexColor: '#0F1D47',
          AppTopBarHexTextColor: '#FFFFFF',
          VmResolutionOptions: [],
          WMKS: { RetryConnectionInterval: 5000 },
        },
      },
    },
    {
      provide: ComnAuthService,
      useValue: {
        isAuthenticated$: of(true),
        user$: of({}),
        logout: () => {},
        getAuthorizationToken: () => '',
      },
    },

    // Dialog/BottomSheet tokens
    { provide: MAT_DIALOG_DATA, useValue: {} },
    { provide: MatDialogRef, useValue: { close: () => {} } },
    { provide: MAT_BOTTOM_SHEET_DATA, useValue: {} },
    { provide: MatBottomSheetRef, useValue: { dismiss: () => {} } },

    // MatSnackBar
    { provide: MatSnackBar, useValue: { open: () => {} } },

    // Router
    {
      provide: ActivatedRoute,
      useValue: {
        params: of({}),
        paramMap: of({ get: () => null, has: () => false }),
        queryParams: of({}),
        queryParamMap: of({ get: () => null, has: () => false }),
        snapshot: {
          params: {},
          paramMap: { get: () => null, has: () => false },
          queryParams: {},
        },
      },
    },
  ];

  if (!overrides?.length) return defaults;

  const overrideTokens = new Set(overrides.map(getProvideToken));
  const filtered = defaults.filter(
    (p) => !overrideTokens.has(getProvideToken(p))
  );
  return [...filtered, ...overrides];
}
