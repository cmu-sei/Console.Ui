// Copyright 2022 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatListOption, MatSelectionList } from '@angular/material/list';
import { MatTooltip } from '@angular/material/tooltip';
import {
  CRUCIBLE_DIALOG_IMPORTS,
  CrucibleDialogService,
} from '@cmusei/crucible-common';
import { take } from 'rxjs/operators';
import { VmSnapshot } from '../../../generated/vm-api';

@Component({
  selector: 'snapshot-dialog',
  templateUrl: './snapshot-dialog.component.html',
  styleUrls: ['./snapshot-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ...CRUCIBLE_DIALOG_IMPORTS,
    MatSelectionList,
    MatListOption,
    DatePipe,
    MatTooltip,
  ],
})
export class SnapshotDialogComponent {
  @Input() snapshots: VmSnapshot[] = [];

  public selectedSnapshot?: VmSnapshot;

  constructor(
    private dialogRef: MatDialogRef<SnapshotDialogComponent, VmSnapshot>,
    private dialogService: CrucibleDialogService,
  ) {}

  selectThisSnapshot(snapshot: VmSnapshot) {
    this.selectedSnapshot =
      this.selectedSnapshot === snapshot ? undefined : snapshot;
  }

  done() {
    const selectedSnapshot = this.selectedSnapshot;
    if (!selectedSnapshot) {
      return;
    }

    this.dialogService
      .confirm({
        title: 'Revert VM',
        message: `Are you sure you want to revert to snapshot "${selectedSnapshot.name}"?`,
        confirmText: 'Revert',
        cancelText: 'Cancel',
      })
      .afterClosed()
      .pipe(take(1))
      .subscribe((confirmed) => {
        if (confirmed === true) {
          this.dialogRef.close(selectedSnapshot);
        }
      });
  }
}
