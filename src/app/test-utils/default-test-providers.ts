// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { EMPTY, of } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import {
  ComnAuthQuery,
  ComnAuthService,
  ComnSettingsService,
  CrucibleDialogService,
} from '@cmusei/crucible-common';
import { AnyProvider, mergeProviders, unstubbed } from './unstubbed';

// 1. App services that components inject (SignalR, error, dialog, system
//    message, xAPI, ...). Stores, queries and data services stay REAL: they are
//    the state under test. Do not list them here.
import { DialogService } from '../services/dialog/dialog.service';
import { ErrorService } from '../services/error/error.service';
import { NotificationService } from '../services/notification/notification.service';
import { NoVNCService } from '../services/novnc/novnc.service';
import { ProxmoxService } from '../services/proxmox/proxmox.service';
import { SignalRService } from '../services/signalr/signalr.service';
import { SystemMessageService } from '../services/system-message/system-message.service';

// 2. Every generated API service that src/app/generated/vm-api/api.ts exports.
import {
  CallbacksService,
  FileService,
  HealthService,
  NetworksService,
  ProxmoxService as ApiProxmoxService,
  VmUsageLoggingSessionService,
  VmsService,
  VsphereService as ApiVsphereService,
} from '../generated/vm-api';

// 3. RouterQuery, only if the app uses @datorama/akita-ng-router-store.
import { RouterQuery } from '@datorama/akita-ng-router-store';

// 4. The generated client's BASE_PATH token: the real data and hub services
//    read the vm-api base path from it.
import { BASE_PATH } from '../generated/vm-api';
export const TEST_BASE_PATH = 'https://vm-api.test';

// 5. Common-library services components inject: CrucibleDialogService, as an
//    `unstubbed(...)` placeholder under "Common library" below.

export function getDefaultProviders(
  overrides?: readonly AnyProvider[],
): AnyProvider[] {
  const defaults: AnyProvider[] = [
    // App services
    unstubbed(DialogService),
    { provide: ErrorService, useValue: { handleError: () => {} } },
    unstubbed(NotificationService),
    unstubbed(NoVNCService),
    // The app's ProxmoxService wraps the generated ProxmoxService.
    unstubbed(ProxmoxService, 'ProxmoxService (services/proxmox)'),
    unstubbed(SignalRService),
    unstubbed(SystemMessageService),

    // Generated API services: one `unstubbed(...)` per service. A test that
    // needs an endpoint passes `{ provide: XService, useValue: xApi }` built
    // with `satisfies ApiStub<XService>`.
    unstubbed(CallbacksService),
    unstubbed(FileService),
    unstubbed(HealthService),
    unstubbed(NetworksService),
    unstubbed(ApiProxmoxService, 'ProxmoxService (generated vm-api)'),
    unstubbed(VmUsageLoggingSessionService),
    unstubbed(VmsService),
    // The app's state/vsphere VsphereService wraps this one.
    unstubbed(ApiVsphereService, 'VsphereService (generated vm-api)'),

    // Akita router: no route params or query params by default. console.ui
    // also reads selectParams, getParams and getQueryParams.
    {
      provide: RouterQuery,
      useValue: {
        select: () => of(null),
        selectParams: () => of(null),
        selectQueryParams: () => of(null),
        getParams: () => null,
        getQueryParams: () => null,
      },
    },

    // Generated client base path
    { provide: BASE_PATH, useValue: TEST_BASE_PATH },

    // Common library
    {
      provide: ComnSettingsService,
      useValue: {
        settings: {
          // 6. The keys this app reads from settings.json, with neutral values.
          ApiUrl: '',
          ConsoleApiUrl: TEST_BASE_PATH,
          AppTopBarText: '',
          AppTopBarHexColor: '#000000',
          AppTopBarHexTextColor: '#FFFFFF',
          VmResolutionOptions: [{ width: 1024, height: 768 }],
          PasteSpeeds: [{ name: 'Normal', value: 60 }],
          WMKS: { RetryConnectionInterval: 0 },
        },
      },
    },
    {
      provide: ComnAuthService,
      useValue: {
        isAuthenticated$: of(true),
        // Use `of({ profile: { sub: '' } })` if the app reads user.profile.
        user$: of({}),
        logout: () => {},
      },
    },
    {
      provide: ComnAuthQuery,
      useValue: {
        userTheme$: of('light-theme'),
        isLoggedIn$: of(true),
      },
    },
    unstubbed(CrucibleDialogService),

    // Dialog tokens
    { provide: MAT_DIALOG_DATA, useValue: {} },
    {
      provide: MatDialogRef,
      useValue: {
        close: () => {},
        beforeClosed: () => EMPTY,
        afterClosed: () => EMPTY,
        keydownEvents: () => EMPTY,
      },
    },

    // Router
    {
      provide: ActivatedRoute,
      useValue: {
        params: of({}),
        paramMap: of(convertToParamMap({})),
        queryParams: of({}),
        queryParamMap: of(convertToParamMap({})),
        snapshot: {
          params: {},
          paramMap: convertToParamMap({}),
          queryParams: {},
          queryParamMap: convertToParamMap({}),
        },
      },
    },
  ];

  return mergeProviders(defaults, overrides);
}
