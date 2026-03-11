// Copyright 2022 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/angular';
import { MatDialogRef, MatDialog } from '@angular/material/dialog';
import { SnapshotDialogComponent } from './snapshot-dialog.component';
import { renderComponent } from 'src/app/test-utils/render-component';
import { MatListModule } from '@angular/material/list';

const mockSnapshots = [
  { id: 's1', name: 'Snapshot 1', createTime: new Date(), isCurrent: true, description: 'First snapshot' },
  { id: 's2', name: 'Snapshot 2', createTime: new Date(), isCurrent: false, description: '' },
];

async function renderSnapshot(snapshots = mockSnapshots) {
  const closeSpy = vi.fn();
  const result = await renderComponent(SnapshotDialogComponent, {
    imports: [MatListModule],
    providers: [
      { provide: MatDialogRef, useValue: { close: closeSpy, disableClose: false } },
      { provide: MatDialog, useValue: { open: vi.fn() } },
    ],
    componentProperties: {
      snapshots: snapshots as any,
    },
  });

  return { ...result, closeSpy };
}

describe('SnapshotDialogComponent', () => {
  it('should create', async () => {
    const { fixture } = await renderSnapshot();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display Snapshots title', async () => {
    await renderSnapshot();
    expect(screen.getByText('Snapshots')).toBeInTheDocument();
  });

  it('should display snapshot names', async () => {
    await renderSnapshot();
    expect(screen.getByText('Snapshot 1')).toBeInTheDocument();
    expect(screen.getByText('Snapshot 2')).toBeInTheDocument();
  });

  it('should show current indicator for current snapshot', async () => {
    await renderSnapshot();
    expect(screen.getByText('(current)')).toBeInTheDocument();
  });

  it('should show Cancel and Revert buttons', async () => {
    await renderSnapshot();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Revert')).toBeInTheDocument();
  });

  it('should disable Revert button when no snapshot selected', async () => {
    const { container } = await renderSnapshot();
    const revertButton = screen.getByText('Revert').closest('button') as HTMLButtonElement;
    expect(revertButton.disabled).toBe(true);
  });

  it('should select snapshot when selectThisSnapshot called', async () => {
    const { fixture } = await renderSnapshot();
    const component = fixture.componentInstance;
    component.selectThisSnapshot(mockSnapshots[0] as any);
    expect(component.selectedSnapshot).toBe(mockSnapshots[0]);
  });
});
