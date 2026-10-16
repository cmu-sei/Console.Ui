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
   * Verifies: the dialog shows a labelled mat-progress-spinner inside the progress content and a single Close action in the dialog actions region that is in the tab order and marked cdkFocusInitial (jsdom does not run the focus trap, so focus itself is not asserted).
   * Interacts with: the rendered crucible-dialog content and custom actions.
   * Data: default render.
   */
  it('renders centered progress with one keyboard-reachable close action', async () => {
    await renderProgressDialog();

    const spinner = screen.getByRole('progressbar', { name: 'Uploading file' });
    expect(spinner.tagName).toBe('MAT-PROGRESS-SPINNER');
    expect(spinner.closest('.progress-content')).not.toBeNull();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('Close');
    expect(buttons[0].closest('mat-dialog-actions')).not.toBeNull();
    expect(buttons[0]).toBeEnabled();
    expect(buttons[0].tabIndex).toBe(0);
    expect(buttons[0]).not.toHaveAttribute('tabindex', '-1');
    expect(buttons[0]).toHaveAttribute('cdkFocusInitial');
  });

  /**
   * Verifies: Close dismisses the dialog exactly once, even while the upload is running, with the empty-string result a bare mat-dialog-close attribute binds.
   * Interacts with: user-event click; MatDialogRef.close spy (via mat-dialog-close).
   * Data: default render; the template's Close button carries mat-dialog-close with no value.
   */
  it('closes from the explicit action while loading', async () => {
    const { close } = await renderProgressDialog();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }));
    expect(close).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledWith('');
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
