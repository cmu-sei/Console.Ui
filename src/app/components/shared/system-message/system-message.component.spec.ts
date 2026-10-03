// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect } from 'vitest';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { SystemMessageComponent } from './system-message.component';
import { renderComponent } from '../../../test-utils/render-component';
import { bottomSheetRefStub } from '../../../test-utils/dialog-refs';

async function renderSystemMessage() {
  const { sheetRef, dismiss } = bottomSheetRefStub<SystemMessageComponent>();
  await renderComponent(SystemMessageComponent, {
    providers: [
      { provide: MatBottomSheetRef, useValue: sheetRef },
      {
        provide: MAT_BOTTOM_SHEET_DATA,
        useValue: { title: 'VM API Error', message: 'The VM Console API could not be reached.' },
      },
    ],
  });
  return { dismiss };
}

describe('SystemMessageComponent', () => {
  /**
   * Verifies: the sheet shows the title and message it was opened with, and its close button dismisses it.
   * Interacts with: MAT_BOTTOM_SHEET_DATA; user-event click; MatBottomSheetRef.dismiss spy.
   * Data: title 'VM API Error', message 'The VM Console API could not be reached.'.
   */
  it('shows the message and dismisses on close', async () => {
    const { dismiss } = await renderSystemMessage();

    expect(screen.getByRole('heading', { name: 'VM API Error' })).toBeInTheDocument();
    expect(screen.getByText('The VM Console API could not be reached.')).toBeInTheDocument();

    // The close button is the sheet's only button; its missing name is pinned below.
    await userEvent.setup().click(screen.getByRole('button'));
    expect(dismiss).toHaveBeenCalledOnce();
  });

  /**
   * Verifies: the icon-only close button has no accessible name.
   * Interacts with: the rendered close button and its mat-icon.
   * Data: default message.
   */
  it('leaves the close button without an accessible name', async () => {
    await renderSystemMessage();

    expect(screen.getByRole('button')).toHaveAccessibleName('');
  });
});
