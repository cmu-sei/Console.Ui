// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { FileUploadInfoDialogComponent } from '../../components/shared/file-upload-info-dialog/file-upload-info-dialog.component';
import { FileUploadProgressDialogComponent } from '../../components/shared/file-upload-progress-dialog/file-upload-progress-dialog.component';
import { MountIsoDialogComponent } from '../../components/shared/mount-iso-dialog/mount-iso-dialog.component';
import { SendTextDialogComponent } from '../../components/shared/send-text-dialog/send-text-dialog.component';
import { SnapshotDialogComponent } from '../../components/shared/snapshot-dialog/snapshot-dialog.component';
import { VmSnapshot } from '../../generated/vm-api';
import { IsoResult } from '../../models/vm/iso-result';
import { DialogService } from './dialog.service';

describe('DialogService', () => {
  let service: DialogService;
  let dialog: jasmine.SpyObj<MatDialog>;
  let dialogRef: jasmine.SpyObj<MatDialogRef<unknown>>;

  beforeEach(() => {
    dialogRef = jasmine.createSpyObj<MatDialogRef<unknown>>(
      'MatDialogRef',
      ['afterClosed', 'close'],
      { componentInstance: {} },
    );
    dialogRef.afterClosed.and.returnValue(of(undefined));
    dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    dialog.open.and.returnValue(dialogRef);

    TestBed.configureTestingModule({
      providers: [DialogService, { provide: MatDialog, useValue: dialog }],
    });
    service = TestBed.inject(DialogService);
  });

  it('opens send text at the structured-dialog width', () => {
    service.sendText('Enter Text').subscribe();

    expect(dialog.open).toHaveBeenCalledWith(SendTextDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
    });
    expect((dialogRef.componentInstance as SendTextDialogComponent).title).toBe(
      'Enter Text',
    );
  });

  it('normalizes absent file-info data and uses the compact width', () => {
    service.getFileUploadInfo('Upload Settings').subscribe();

    expect(dialog.open).toHaveBeenCalledWith(FileUploadInfoDialogComponent, {
      data: {},
      width: '480px',
      maxWidth: '90vw',
    });
    expect(
      (dialogRef.componentInstance as FileUploadInfoDialogComponent).title,
    ).toBe('Upload Settings');
  });

  it('opens ISO and snapshot selection responsively without fixed heights', () => {
    const isoResults = [] as IsoResult[];
    const snapshots = [] as VmSnapshot[];

    service.mountIso(isoResults).subscribe();
    expect(dialog.open).toHaveBeenCalledWith(MountIsoDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
    });
    expect(
      (dialogRef.componentInstance as MountIsoDialogComponent).isoResult,
    ).toBe(isoResults);

    service.selectSnapshot(snapshots).subscribe();
    expect(dialog.open).toHaveBeenCalledWith(SnapshotDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
    });
    expect(
      (dialogRef.componentInstance as SnapshotDialogComponent).snapshots,
    ).toBe(snapshots);
  });

  it('returns only the upload progress dialog reference', () => {
    const result = service.uploadProgress();

    expect(dialog.open).toHaveBeenCalledWith(
      FileUploadProgressDialogComponent,
      {
        width: '480px',
        maxWidth: '90vw',
      },
    );
    expect(result).toBe(dialogRef);
  });
});
