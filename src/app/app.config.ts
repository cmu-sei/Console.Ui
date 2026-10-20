// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import {
  ApplicationConfig,
  ErrorHandler,
  importProvidersFrom,
  provideZoneChangeDetection,
} from '@angular/core';
import { environment } from '../environments/environment';
import { AkitaNgRouterStoreModule } from '@datorama/akita-ng-router-store';
import { AkitaNgDevtools } from '@datorama/akita-ngdevtools';
import {
  withInterceptorsFromDi,
  provideHttpClient,
} from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  MAT_TOOLTIP_DEFAULT_OPTIONS,
  MatTooltipDefaultOptions,
} from '@angular/material/tooltip';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import {
  ComnSettingsService,
  ComnSettingsModule,
  ComnAuthModule,
  provideCrucibleTheme,
} from '@cmusei/crucible-common';
import { BASE_PATH } from './generated/vm-api';
import { ErrorService } from './services/error/error.service';
import { NotificationService } from './services/notification/notification.service';
import { DialogService } from './services/dialog/dialog.service';
import { SystemMessageService } from './services/system-message/system-message.service';
import { provideRouter } from '@angular/router';
import { routes } from './app-routing/app-routing.module';

/** Custom options the configure the tooltip's default show/hide delays. */
export const myCustomTooltipDefaults: MatTooltipDefaultOptions = {
  showDelay: 1000,
  hideDelay: 1000,
  touchendHideDelay: 1000,
};

export function getBasePath(settingsSvc: ComnSettingsService) {
  let url: string = settingsSvc.settings.ConsoleApiUrl;

  if (url.endsWith('/')) {
    url = url.slice(0, url.length - 1);
  }

  return url.replace('/api', '');
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection(),
    importProvidersFrom(
      ComnSettingsModule.forRoot(),
      ComnAuthModule.forRoot(),
      environment.production ? [] : AkitaNgDevtools.forRoot(),
      AkitaNgRouterStoreModule,
    ),
    SystemMessageService,
    DialogService,
    NotificationService,
    {
      provide: ErrorHandler,
      useClass: ErrorService,
    },
    {
      provide: BASE_PATH,
      useFactory: getBasePath,
      deps: [ComnSettingsService],
    },
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'outline' },
    },
    {
      provide: MAT_TOOLTIP_DEFAULT_OPTIONS,
      useValue: myCustomTooltipDefaults,
    },
    provideAnimationsAsync(),
    provideHttpClient(withInterceptorsFromDi()),
    provideRouter(routes),
    provideCrucibleTheme({ brand: { color: '#3B62A5', text: '#FFFFFF' } }),
  ],
};
