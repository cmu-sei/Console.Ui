// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { MatDialogRef } from '@angular/material/dialog';
import { screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { CrucibleDialogService } from '@cmusei/crucible-common';
import { VmSnapshot } from '../../../generated/vm-api';
import { SnapshotDialogComponent } from './snapshot-dialog.component';
import { renderComponent } from '../../../test-utils/render-component';
import {
  dialogRefStub,
  dismissedDialogRefStub,
} from '../../../test-utils/dialog-refs';

const SNAPSHOTS: VmSnapshot[] = [
  { id: 'snapshot-1', name: 'Before Update', createTime: '2026-01-01T00:00:00Z', depth: 0 },
  {
    id: 'snapshot-2',
    name: 'After Update',
    createTime: '2026-01-02T00:00:00Z',
    depth: 1,
    isCurrent: true,
    description: 'Patched',
  },
];

// 'dismissed': the confirm dialog closes without an answer (Esc, backdrop).
async function renderSnapshotDialog(confirmation: boolean | 'dismissed') {
  const { dialogRef, close } = dialogRefStub<SnapshotDialogComponent>();
  const confirm = vi.fn<CrucibleDialogService['confirm']>(() =>
    confirmation === 'dismissed'
      ? dismissedDialogRefStub<unknown, boolean>().dialogRef
      : dialogRefStub<unknown, boolean>(confirmation).dialogRef,
  );
  const crucibleDialog = { confirm } satisfies Pick<CrucibleDialogService, 'confirm'>;
  const rendered = await renderComponent(SnapshotDialogComponent, {
    inputs: { snapshots: SNAPSHOTS },
    providers: [
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: CrucibleDialogService, useValue: crucibleDialog },
    ],
  });
  return { ...rendered, close, confirm, user: userEvent.setup() };
}

describe('SnapshotDialogComponent', () => {
  /**
   * Verifies: each snapshot is listed, with the current one marked and its description shown.
   * Interacts with: the snapshots input; the rendered selection list.
   * Data: two snapshots, the second current with description 'Patched'.
   */
  it('lists the snapshots and marks the current one', async () => {
    await renderSnapshotDialog(true);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Before Update');
    expect(options[1]).toHaveTextContent('After Update (current)');
    expect(options[1]).toHaveTextContent('Patched');
  });

  /**
   * Verifies: Revert is disabled until a snapshot is chosen, and choosing it again clears the choice.
   * Interacts with: user-event clicks on the list options; the Revert button.
   * Data: 'Before Update' clicked twice.
   */
  it('enables Revert only while a snapshot is selected', async () => {
    const { user } = await renderSnapshotDialog(true);
    const revert = screen.getByRole('button', { name: 'Revert' });
    expect(revert).toBeDisabled();

    await user.click(screen.getByRole('option', { name: /Before Update/ }));
    expect(revert).toBeEnabled();

    await user.click(screen.getByRole('option', { name: /Before Update/ }));
    expect(revert).toBeDisabled();
  });

  /**
   * Verifies: reverting asks for confirmation and then closes with the chosen snapshot.
   * Interacts with: CrucibleDialogService.confirm stub (confirmed); MatDialogRef.close spy.
   * Data: 'Before Update' chosen.
   */
  it('closes the parent with the selected snapshot after confirmation', async () => {
    const { user, close, confirm } = await renderSnapshotDialog(true);

    await user.click(screen.getByRole('option', { name: /Before Update/ }));
    await user.click(screen.getByRole('button', { name: 'Revert' }));

    expect(confirm).toHaveBeenCalledWith({
      title: 'Revert VM',
      message: 'Are you sure you want to revert to snapshot "Before Update"?',
      confirmText: 'Revert',
      cancelText: 'Cancel',
    });
    expect(close).toHaveBeenCalledExactlyOnceWith(SNAPSHOTS[0]);
  });

  /**
   * Verifies: declining or dismissing the confirmation keeps the picker open.
   * Interacts with: user-event clicks on a snapshot and Revert; CrucibleDialogService.confirm stub; MatDialogRef.close spy.
   * Data: confirmation answered false, or dismissed.
   */
  it.each([false, 'dismissed'] as const)(
    'keeps the parent open when confirmation is %s',
    async (confirmation) => {
      const { user, close, confirm } = await renderSnapshotDialog(confirmation);

      await user.click(screen.getByRole('option', { name: /Before Update/ }));
      await user.click(screen.getByRole('button', { name: 'Revert' }));

      expect(confirm).toHaveBeenCalledOnce();
      expect(close).not.toHaveBeenCalled();
    },
  );
});
