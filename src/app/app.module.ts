// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { HttpClientModule } from '@angular/common/http';
import { ErrorHandler, NgModule } from '@angular/core';
import { FlexLayoutModule } from '@angular/flex-layout';
import { FormsModule } from '@angular/forms';
import { MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import {
  ComnAuthModule,
  ComnSettingsConfig,
  ComnSettingsModule,
  ComnSettingsService,
} from '@cmusei/crucible-common';
import { AkitaNgDevtools } from '@datorama/akita-ngdevtools';
import { AppRoutingModule } from './app-routing/app-routing.module';
import { AppComponent } from './app.component';
import { ConsoleComponent } from './components/console/console.component';
import {
  KeysPipe,
  OptionsBarComponent,
} from './components/options-bar/options-bar.component';
import { PageNotFoundComponent } from './components/page-not-found/page-not-found.component';
import { FileUploadInfoDialogComponent } from './components/shared/file-upload-info-dialog/file-upload-info-dialog.component';
import { MessageDialogComponent } from './components/shared/message-dialog/message-dialog.component';
import { MountIsoDialogComponent } from './components/shared/mount-iso-dialog/mount-iso-dialog.component';
import { SendTextDialogComponent } from './components/shared/send-text-dialog/send-text-dialog.component';
import { SystemMessageComponent } from './components/shared/system-message/system-message.component';
import { WmksComponent } from './components/wmks/wmks.component';
import { DialogService } from './services/dialog/dialog.service';
import { ErrorService } from './services/error/error.service';
import { NotificationService } from './services/notification/notification.service';
import { SystemMessageService } from './services/system-message/system-message.service';
import { VsphereService } from './state/vsphere/vsphere.service';
import { ConsolePageComponent } from './components/console-page/console-page.component';
import { UserFollowPageComponent } from './components/user-follow-page/user-follow-page.component';
import { AkitaNgRouterStoreModule } from '@datorama/akita-ng-router-store';
import { environment } from '../environments/environment';
import { BASE_PATH } from './generated/vm-api';
import { NovncComponent } from './components/novnc/novnc.component';
import { ProxmoxConsoleComponent } from './components/proxmox/proxmox-console/proxmox-console.component';
import { OptionsBar2Component } from './components/options-bar2/options-bar2.component';

export const settings: ComnSettingsConfig = {
  url: 'assets/config/settings.json',
  envUrl: 'assets/config/settings.env.json',
};

const materialModules = [
  MatButtonModule,
  MatListModule,
  MatInputModule,
  MatProgressSpinnerModule,
  MatIconModule,
  MatMenuModule,
  MatBottomSheetModule,
  MatDialogModule,
  MatSnackBarModule,
  MatTooltipModule,
];

@NgModule({
  declarations: [
    AppComponent,
    OptionsBarComponent,
    WmksComponent,
    PageNotFoundComponent,
    ConsoleComponent,
    MessageDialogComponent,
    SendTextDialogComponent,
    FileUploadInfoDialogComponent,
    MountIsoDialogComponent,
    KeysPipe,
    SystemMessageComponent,
    ConsolePageComponent,
    UserFollowPageComponent,
    NovncComponent,
    ProxmoxConsoleComponent,
    OptionsBar2Component,
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    RouterModule,
    FormsModule,
    materialModules,
    FlexLayoutModule,
    BrowserAnimationsModule,
    ComnSettingsModule.forRoot(),
    ComnAuthModule.forRoot(),
    environment.production ? [] : AkitaNgDevtools.forRoot(),
    AkitaNgRouterStoreModule,
    // App routing order matters; We must import the AppRoutingModule last in order to maintain the wildcard PageNotFoundComponent.
    AppRoutingModule,
  ],
  providers: [
    VsphereService,
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
  ],
  bootstrap: [AppComponent],
  entryComponents: [
    MessageDialogComponent,
    SendTextDialogComponent,
    FileUploadInfoDialogComponent,
    MountIsoDialogComponent,
    SystemMessageComponent,
  ],
})
export class AppModule {}

export function getBasePath(settingsSvc: ComnSettingsService) {
  let url: string = settingsSvc.settings.ConsoleApiUrl;

  if (url.endsWith('/')) {
    url = url.slice(0, url.length - 1);
  }

  return url.replace('/api', '');
}
