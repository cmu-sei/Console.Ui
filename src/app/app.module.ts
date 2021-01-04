// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { HttpClientModule } from '@angular/common/http';
import { ErrorHandler, NgModule } from '@angular/core';
import { FlexLayoutModule } from '@angular/flex-layout';
import { FormsModule } from '@angular/forms';
import { HttpModule } from '@angular/http';
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
import { VmService } from './services/vm/vm.service';

export const settings: ComnSettingsConfig = {
  url: 'assets/config/settings.json',
  envUrl: 'assets/config/settings.env.json',
};

@NgModule({
  exports: [
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
  ],
})
export class AngularMaterialModule {}

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
  ],
  imports: [
    BrowserModule,
    HttpModule,
    HttpClientModule,
    RouterModule,
    FormsModule,
    AngularMaterialModule,
    FlexLayoutModule,
    BrowserAnimationsModule,
    ComnSettingsModule.forRoot(),
    ComnAuthModule.forRoot(),
    AkitaNgDevtools.forRoot(),
    // App routing order matters; We must import the AppRoutingModule last in order to maintain the wildcard PageNotFoundComponent.
    AppRoutingModule,
  ],
  providers: [
    VmService,

    SystemMessageService,
    DialogService,
    NotificationService,
    {
      provide: ErrorHandler,
      useClass: ErrorService,
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
  return settingsSvc.settings.ApiUrl.replace('/api', '');
}
