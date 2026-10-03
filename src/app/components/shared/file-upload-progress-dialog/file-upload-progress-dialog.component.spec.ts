// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect } from 'vitest';
import { MatDialogRef } from '@angular/material/dialog';
import { screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { FileUploadProgressDialogComponent } from './file-upload-progress-dialog.component';
import { renderComponent } from '../../../test-utils/render-component';
import { dialogRefStub } from '../../../test-utils/dialog-refs';

// crucible-dialog listens to keydownEvents() for Escape; the stub's keydown
// subject feeds it. afterClosed() stays silent: nothing here waits on it.
async function renderProgressDialog() {
  const { dialogRef, close, keydown } =
    dialogRefStub<FileUploadProgressDialogComponent>();
  const rendered = await renderComponent(FileUploadProgressDialogComponent, {
    providers: [{ provide: MatDialogRef, useValue: dialogRef }],
  });
  return { ...rendered, dialogRef, close, keydown };
}

describe('FileUploadProgressDialogComponent', () => {
  /**
   * Verifies: the dialog shows a labelled progress spinner and a single Close action marked cdkFocusInitial (jsdom does not run the focus trap, so focus itself is not asserted).
   * Interacts with: the rendered crucible-dialog content and custom actions.
   * Data: default render.
   */
  it('renders centered progress with one keyboard-reachable close action', async () => {
    await renderProgressDialog();

    expect(screen.getByRole('progressbar', { name: 'Uploading file' })).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('Close');
    expect(buttons[0]).toBeEnabled();
    expect(buttons[0]).toHaveAttribute('cdkFocusInitial');
  });

  /**
   * Verifies: Close dismisses the dialog with no result, even while the upload is running.
   * Interacts with: user-event click; MatDialogRef.close spy (via mat-dialog-close).
   * Data: default render.
   */
  it('closes from the explicit action while loading', async () => {
    const { close } = await renderProgressDialog();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }));
    expect(close).toHaveBeenCalledOnce();
    expect(close.mock.calls[0][0]).toBeFalsy();
  });

  /**
   * Verifies: Escape and backdrop clicks can't dismiss the dialog while loading.
   * Interacts with: dialogRefStub's keydown subject (keydownEvents()); disableClose; MatDialogRef.close spy.
   * Data: an Escape keydown.
   */
  it('does not dismiss on Escape while loading', async () => {
    const { dialogRef, close, keydown } = await renderProgressDialog();
    keydown.next(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dialogRef.disableClose).toBe(true);
    expect(close).not.toHaveBeenCalled();
  });
});
