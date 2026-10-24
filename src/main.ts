// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { enableProdMode } from '@angular/core';
import { enableAkitaProdMode } from '@datorama/akita';
import { environment } from './environments/environment';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { bootstrapApplication } from '@angular/platform-browser';
import { ComnSettingsConfig } from '@cmusei/crucible-common';

export const settings: ComnSettingsConfig = {
  url: 'assets/config/settings.json',
  sharedUrl: 'assets/config/settings.shared.json',
  envUrl: 'assets/config/settings.env.json',
};

if (environment.production) {
  enableProdMode();
  enableAkitaProdMode();
}

bootstrapApplication(AppComponent, appConfig).catch((err) => console.log(err));
