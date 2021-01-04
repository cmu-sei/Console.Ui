// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Observable } from 'rxjs';
import { MatDialogRef, MatDialog } from '@angular/material/dialog';
import { Injectable } from '@angular/core';
import { MessageDialogComponent } from '../../components/shared/message-dialog/message-dialog.component';
import { SendTextDialogComponent } from '../../components/shared/send-text-dialog/send-text-dialog.component';
import { FileUploadInfoDialogComponent } from '../../components/shared/file-upload-info-dialog/file-upload-info-dialog.component';
import { MountIsoDialogComponent } from '../../components/shared/mount-iso-dialog/mount-iso-dialog.component';
import { IsoResult, IsoFile } from '../../models/vm/iso-result';

@Injectable()
export class DialogService {
  constructor(private dialog: MatDialog) {}

  public message(
    title: string,
    message: string,
    data?: any
  ): Observable<boolean> {
    let dialogRef: MatDialogRef<MessageDialogComponent>;
    dialogRef = this.dialog.open(MessageDialogComponent, { data: data || {} });
    dialogRef.componentInstance.title = title;
    dialogRef.componentInstance.message = message;

    return dialogRef.afterClosed();
  }

  public sendText(title: string, configData?: any): Observable<boolean> {
    let dialogRef: MatDialogRef<SendTextDialogComponent>;
    dialogRef = this.dialog.open(SendTextDialogComponent, configData || {});
    dialogRef.componentInstance.title = title;

    return dialogRef.afterClosed();
  }

  public getFileUploadInfo(
    title: string,
    configData?: any
  ): Observable<boolean> {
    let dialogRef: MatDialogRef<FileUploadInfoDialogComponent>;
    dialogRef = this.dialog.open(
      FileUploadInfoDialogComponent,
      configData || {}
    );
    dialogRef.componentInstance.title = title;

    return dialogRef.afterClosed();
  }

  public mountIso(
    isoResult: IsoResult[],
    configData?: any
  ): Observable<IsoFile> {
    let dialogRef: MatDialogRef<MountIsoDialogComponent>;
    dialogRef = this.dialog.open(MountIsoDialogComponent, configData || {});
    dialogRef.componentInstance.isoResult = isoResult;

    return dialogRef.afterClosed();
  }
}
