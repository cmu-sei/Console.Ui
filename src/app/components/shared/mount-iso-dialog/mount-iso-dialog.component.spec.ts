// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect } from 'vitest';
import { MatDialogRef } from '@angular/material/dialog';
import { screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { IsoResult } from '../../../models/vm/iso-result';
import { MountIsoDialogComponent } from './mount-iso-dialog.component';
import { renderComponent } from '../../../test-utils/render-component';
import { dialogRefStub } from '../../../test-utils/dialog-refs';

function isoResults(): IsoResult[] {
  return [
    {
      viewId: 'view-1',
      viewName: 'Exercise',
      isos: [
        { filename: 'tools.iso', mountValue: '[ds] view/tools.iso' },
        { filename: 'ubuntu.iso', mountValue: '[ds] view/ubuntu.iso' },
      ],
      teamIsoResults: [
        {
          teamId: 'team-1',
          teamName: 'Blue',
          isos: [{ filename: 'blue-tools.iso', mountValue: '[ds] blue/blue-tools.iso' }],
          hide: true,
          display: [],
        },
      ],
      hide: true,
      display: [],
    },
  ];
}

async function renderMountIso() {
  const { dialogRef, close } = dialogRefStub<MountIsoDialogComponent>();
  const rendered = await renderComponent(MountIsoDialogComponent, {
    inputs: { isoResult: isoResults() },
    providers: [{ provide: MatDialogRef, useValue: dialogRef }],
  });
  return { ...rendered, close, user: userEvent.setup() };
}

const filenames = () => screen.getAllByRole('option').map((o) => o.textContent?.trim());

describe('MountIsoDialogComponent', () => {
  /**
   * Verifies: view and team ISO groups render expanded with their counts, whatever hide state the caller passed.
   * Interacts with: the isoResult input setter.
   * Data: view 'Exercise' with two ISOs; team 'Blue' with one; both passed in hidden.
   */
  it('lists view and team ISOs expanded', async () => {
    await renderMountIso();
    expect(screen.getByRole('button', { name: /Exercise Files \(2\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Blue Files \(1\)/ })).toBeInTheDocument();
    expect(filenames()).toEqual(['tools.iso', 'ubuntu.iso', 'blue-tools.iso']);
  });

  /**
   * Verifies: searching filters every group by filename, case-insensitively, after the debounce.
   * Interacts with: user-event typing into Search; the 200ms debounced filter.
   * Data: search 'TOOLS'.
   */
  it('filters ISOs by the search text', async () => {
    const { user } = await renderMountIso();
    await user.type(screen.getByLabelText('Search'), 'TOOLS');
    await waitFor(() => expect(filenames()).toEqual(['tools.iso', 'blue-tools.iso']));
  });

  /**
   * Verifies: clicking a group header collapses that group.
   * Interacts with: user-event click on the team group button.
   * Data: team 'Blue'.
   */
  it('collapses a group from its header', async () => {
    const { user } = await renderMountIso();
    await user.click(screen.getByRole('button', { name: /Blue Files/ }));
    expect(filenames()).toEqual(['tools.iso', 'ubuntu.iso']);
  });

  /**
   * Verifies: Mount stays disabled until an ISO is picked, then closes with that ISO.
   * Interacts with: user-event clicks on an option and Mount; MatDialogRef.close spy.
   * Data: 'blue-tools.iso' picked.
   */
  it('mounts the picked ISO', async () => {
    const { user, close } = await renderMountIso();
    const mount = screen.getByRole('button', { name: 'Mount' });
    expect(mount).toBeDisabled();

    await user.click(screen.getByRole('option', { name: 'blue-tools.iso' }));
    await user.click(mount);

    expect(close).toHaveBeenCalledExactlyOnceWith({
      filename: 'blue-tools.iso',
      mountValue: '[ds] blue/blue-tools.iso',
    });
  });
});
