// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Injectable } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import {
  FileUploadInfoDialogComponent,
  FileUploadInfoDialogData,
  FileUploadInfoDialogResult,
} from '../../components/shared/file-upload-info-dialog/file-upload-info-dialog.component';
import { FileUploadProgressDialogComponent } from '../../components/shared/file-upload-progress-dialog/file-upload-progress-dialog.component';
import { MountIsoDialogComponent } from '../../components/shared/mount-iso-dialog/mount-iso-dialog.component';
import {
  SendTextDialogComponent,
  SendTextDialogResult,
} from '../../components/shared/send-text-dialog/send-text-dialog.component';
import { SnapshotDialogComponent } from '../../components/shared/snapshot-dialog/snapshot-dialog.component';
import { VmSnapshot } from '../../generated/vm-api';
import { IsoFile, IsoResult } from '../../models/vm/iso-result';

@Injectable()
export class DialogService {
  constructor(private dialog: MatDialog) {}

  public sendText(title: string): Observable<SendTextDialogResult | undefined> {
    const dialogRef = this.dialog.open<
      SendTextDialogComponent,
      void,
      SendTextDialogResult
    >(SendTextDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
    });
    dialogRef.componentInstance.title = title;

    return dialogRef.afterClosed();
  }

  public getFileUploadInfo(
    title: string,
    data?: FileUploadInfoDialogData,
  ): Observable<FileUploadInfoDialogResult | undefined> {
    const dialogRef = this.dialog.open<
      FileUploadInfoDialogComponent,
      FileUploadInfoDialogData,
      FileUploadInfoDialogResult
    >(FileUploadInfoDialogComponent, {
      data: data ?? {},
      width: '480px',
      maxWidth: '90vw',
    });
    dialogRef.componentInstance.title = title;

    return dialogRef.afterClosed();
  }

  public mountIso(isoResult: IsoResult[]): Observable<IsoFile | undefined> {
    const dialogRef = this.dialog.open<MountIsoDialogComponent, void, IsoFile>(
      MountIsoDialogComponent,
      {
        width: '600px',
        maxWidth: '90vw',
      },
    );
    dialogRef.componentInstance.isoResult = isoResult;

    return dialogRef.afterClosed();
  }

  public selectSnapshot(
    snapshots: VmSnapshot[],
  ): Observable<VmSnapshot | undefined> {
    const dialogRef = this.dialog.open<
      SnapshotDialogComponent,
      void,
      VmSnapshot
    >(SnapshotDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
    });
    dialogRef.componentInstance.snapshots = snapshots;

    return dialogRef.afterClosed();
  }

  public uploadProgress(): MatDialogRef<
    FileUploadProgressDialogComponent,
    void
  > {
    return this.dialog.open(FileUploadProgressDialogComponent, {
      width: '480px',
      maxWidth: '90vw',
    });
  }
}
