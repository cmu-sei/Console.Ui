// Copyright 2022 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { MatDialogRef } from '@angular/material/dialog';
import { CrucibleDialogService } from '@cmusei/crucible-common';
import { of } from 'rxjs';
import { VmSnapshot } from '../../../generated/vm-api';
import { SnapshotDialogComponent } from './snapshot-dialog.component';

describe('SnapshotDialogComponent', () => {
  const snapshot = {
    id: 'snapshot-1',
    name: 'Before Update',
  } as VmSnapshot;

  function createComponent(confirmation: boolean | undefined) {
    const dialogRef = jasmine.createSpyObj<
      MatDialogRef<SnapshotDialogComponent, VmSnapshot>
    >('MatDialogRef', ['close']);
    const dialogService = jasmine.createSpyObj<CrucibleDialogService>(
      'CrucibleDialogService',
      ['confirm'],
    );
    dialogService.confirm.and.returnValue({
      afterClosed: () => of(confirmation),
    } as any);

    const component = new SnapshotDialogComponent(dialogRef, dialogService);
    component.selectedSnapshot = snapshot;

    return { component, dialogRef, dialogService };
  }

  it('closes the parent with the selected snapshot after confirmation', () => {
    const { component, dialogRef, dialogService } = createComponent(true);

    component.done();

    expect(dialogService.confirm).toHaveBeenCalledWith({
      title: 'Revert VM',
      message: 'Are you sure you want to revert to snapshot "Before Update"?',
      confirmText: 'Revert',
      cancelText: 'Cancel',
    });
    expect(dialogRef.close).toHaveBeenCalledOnceWith(snapshot);
  });

  for (const confirmation of [false, undefined]) {
    it(`keeps the parent open when confirmation is ${confirmation}`, () => {
      const { component, dialogRef } = createComponent(confirmation);

      component.done();

      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  }
});
