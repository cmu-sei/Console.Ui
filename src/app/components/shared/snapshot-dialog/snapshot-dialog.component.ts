// Copyright 2022 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import {
  MatDialog,
  MatDialogRef,
  MatDialogTitle,
  MatDialogActions,
} from '@angular/material/dialog';
import {
  Component,
  ChangeDetectionStrategy,
  Input,
} from '@angular/core';
import { VmSnapshot } from '../../../generated/vm-api';
import { MatButton } from '@angular/material/button';
import { MatSelectionList, MatListOption } from '@angular/material/list';
import { DatePipe } from '@angular/common';
import { MatTooltip } from '@angular/material/tooltip';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../confirm-dialog/confirm-dialog.component';


@Component({
    selector: 'snapshot-dialog',
    templateUrl: './snapshot-dialog.component.html',
    styleUrls: ['./snapshot-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatDialogTitle,
        MatSelectionList,
        MatListOption,
        MatButton,
        MatDialogActions,
        DatePipe,
        MatTooltip,
    ]
})
export class SnapshotDialogComponent {
  @Input() snapshots: VmSnapshot[] = [];

  public selectedSnapshot: VmSnapshot;

  constructor(
    private dialogRef: MatDialogRef<SnapshotDialogComponent>,
    private dialog: MatDialog,
  ) {
    this.dialogRef.disableClose = true;
  }

  selectThisSnapshot(snapshot: VmSnapshot) {
    this.selectedSnapshot = this.selectedSnapshot === snapshot ? null : snapshot;
  }

  close() {
    this.dialogRef.close();
  }

  done() {
    const confirmRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Revert Vm',
        message: `Are you sure you want to revert to snapshot "${this.selectedSnapshot.name}"?`,
      } as ConfirmDialogData,
    });

    confirmRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.dialogRef.close(this.selectedSnapshot);
      }
    });
  }
}
