// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom, of } from 'rxjs';
import { FileUploadInfoDialogComponent } from '../../components/shared/file-upload-info-dialog/file-upload-info-dialog.component';
import { FileUploadProgressDialogComponent } from '../../components/shared/file-upload-progress-dialog/file-upload-progress-dialog.component';
import { MountIsoDialogComponent } from '../../components/shared/mount-iso-dialog/mount-iso-dialog.component';
import { SendTextDialogComponent } from '../../components/shared/send-text-dialog/send-text-dialog.component';
import { SnapshotDialogComponent } from '../../components/shared/snapshot-dialog/snapshot-dialog.component';
import { VmSnapshot } from '../../generated/vm-api';
import { IsoResult } from '../../models/vm/iso-result';
import { DialogService } from './dialog.service';

// The opened dialog's componentInstance is where DialogService writes its inputs.
type OpenedRef = Pick<MatDialogRef<unknown>, 'afterClosed' | 'componentInstance'>;

function setup(result: unknown = undefined) {
  const ref: OpenedRef = {
    afterClosed: () => of(result),
    componentInstance: {},
  };
  const dialog = {
    open: vi.fn(() => ref as MatDialogRef<unknown>),
  } satisfies Pick<MatDialog, 'open'>;

  TestBed.configureTestingModule({
    providers: [DialogService, { provide: MatDialog, useValue: dialog }],
  });

  return { service: TestBed.inject(DialogService), dialog, ref };
}

describe('DialogService', () => {
  /**
   * Verifies: sendText() opens the send-text dialog at the structured width, sets its title, and returns its result.
   * Interacts with: MatDialog.open stub returning a ref whose afterClosed emits the result.
   * Data: title 'Enter Text'; dialog closes with { textToSend: 'ls', timeout: '60' }.
   */
  it('opens send text at the structured-dialog width', async () => {
    const result = { textToSend: 'ls', timeout: '60' };
    const { service, dialog, ref } = setup(result);

    expect(await firstValueFrom(service.sendText('Enter Text'))).toEqual(result);

    expect(dialog.open).toHaveBeenCalledWith(SendTextDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
    });
    expect((ref.componentInstance as SendTextDialogComponent).title).toBe(
      'Enter Text',
    );
  });

  /**
   * Verifies: getFileUploadInfo() passes {} when no data is given, uses the compact width, and sets the title.
   * Interacts with: MatDialog.open stub.
   * Data: title 'Upload Settings', no data argument.
   */
  it('normalizes absent file-info data and uses the compact width', () => {
    const { service, dialog, ref } = setup();

    service.getFileUploadInfo('Upload Settings').subscribe();

    expect(dialog.open).toHaveBeenCalledWith(FileUploadInfoDialogComponent, {
      data: {},
      width: '480px',
      maxWidth: '90vw',
    });
    expect((ref.componentInstance as FileUploadInfoDialogComponent).title).toBe(
      'Upload Settings',
    );
  });

  /**
   * Verifies: getFileUploadInfo() forwards caller data such as hiding the credential fields.
   * Interacts with: MatDialog.open stub.
   * Data: { showCredentials: false }.
   */
  it('forwards file-info data', () => {
    const { service, dialog } = setup();
    service
      .getFileUploadInfo('Download File Settings', { showCredentials: false })
      .subscribe();
    expect(dialog.open).toHaveBeenCalledWith(
      FileUploadInfoDialogComponent,
      expect.objectContaining({ data: { showCredentials: false } }),
    );
  });

  /**
   * Verifies: the ISO picker opens at the structured width without a fixed height and receives the ISO list.
   * Interacts with: MatDialog.open stub; the ref's componentInstance.
   * Data: an empty IsoResult[] (identity is what's asserted).
   */
  it('opens ISO selection responsively without a fixed height', () => {
    const { service, dialog, ref } = setup();
    const isoResults = [] as IsoResult[];

    service.mountIso(isoResults).subscribe();

    expect(dialog.open).toHaveBeenCalledWith(MountIsoDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
    });
    expect((ref.componentInstance as MountIsoDialogComponent).isoResult).toBe(
      isoResults,
    );
  });

  /**
   * Verifies: the snapshot picker opens at the structured width without a fixed height and receives the snapshot list.
   * Interacts with: MatDialog.open stub; the ref's componentInstance.
   * Data: an empty VmSnapshot[] (identity is what's asserted).
   */
  it('opens snapshot selection responsively without a fixed height', () => {
    const { service, dialog, ref } = setup();
    const snapshots = [] as VmSnapshot[];

    service.selectSnapshot(snapshots).subscribe();

    expect(dialog.open).toHaveBeenCalledWith(SnapshotDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
    });
    expect((ref.componentInstance as SnapshotDialogComponent).snapshots).toBe(
      snapshots,
    );
  });

  /**
   * Verifies: uploadProgress() opens the progress dialog and returns its ref for the caller to close.
   * Interacts with: MatDialog.open stub.
   * Data: none.
   */
  it('returns only the upload progress dialog reference', () => {
    const { service, dialog, ref } = setup();

    const result = service.uploadProgress();

    expect(dialog.open).toHaveBeenCalledWith(FileUploadProgressDialogComponent, {
      width: '480px',
      maxWidth: '90vw',
    });
    expect(result).toBe(ref);
  });
});
