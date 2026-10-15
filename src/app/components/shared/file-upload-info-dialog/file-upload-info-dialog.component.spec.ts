// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect } from 'vitest';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import {
  FileUploadInfoDialogComponent,
  FileUploadInfoDialogData,
} from './file-upload-info-dialog.component';
import { renderComponent } from '../../../test-utils/render-component';
import { dialogRefStub } from '../../../test-utils/dialog-refs';

async function renderInfoDialog(data: FileUploadInfoDialogData = {}) {
  const { dialogRef, close } = dialogRefStub<FileUploadInfoDialogComponent>();
  const rendered = await renderComponent(FileUploadInfoDialogComponent, {
    providers: [
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: MAT_DIALOG_DATA, useValue: data },
    ],
  });
  rendered.fixture.componentInstance.title = 'VM Send File Settings';
  rendered.fixture.detectChanges();
  return { ...rendered, close, user: userEvent.setup() };
}

describe('FileUploadInfoDialogComponent', () => {
  /**
   * Verifies: by default the dialog asks for the path and the guest credentials under the caller's title.
   * Interacts with: MAT_DIALOG_DATA ({}); the rendered form fields.
   * Data: no showCredentials flag.
   */
  it('asks for the path and credentials by default', async () => {
    await renderInfoDialog();
    expect(screen.getByRole('heading', { name: 'VM Send File Settings' })).toBeInTheDocument();
    expect(screen.getByLabelText('File Path')).toBeInTheDocument();
    expect(screen.getByLabelText('VM Username')).toBeInTheDocument();
    expect(screen.getByLabelText('VM Password')).toHaveAttribute('type', 'password');
  });

  /**
   * Verifies: the download variant asks for the path only.
   * Interacts with: MAT_DIALOG_DATA showCredentials false.
   * Data: { showCredentials: false }.
   */
  it('hides the credentials when showCredentials is false', async () => {
    await renderInfoDialog({ showCredentials: false });
    expect(screen.getByLabelText('File Path')).toBeInTheDocument();
    expect(screen.queryByLabelText('VM Username')).not.toBeInTheDocument();
  });

  /**
   * Verifies: Done closes with everything that was entered.
   * Interacts with: user-event typing and the Done button; MatDialogRef.close spy.
   * Data: path '/tmp/', user 'root', password 'pw'.
   */
  it('closes with the entered values', async () => {
    const { user, close } = await renderInfoDialog();

    await user.type(screen.getByLabelText('File Path'), '/tmp/');
    await user.type(screen.getByLabelText('VM Username'), 'root');
    await user.type(screen.getByLabelText('VM Password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(close).toHaveBeenCalledExactlyOnceWith({
      filepath: '/tmp/',
      username: 'root',
      password: 'pw',
    });
  });

  /**
   * Verifies: Cancel closes without a result.
   * Interacts with: the Cancel button; MatDialogRef.close spy.
   * Data: nothing entered.
   */
  it('closes without a result on Cancel', async () => {
    const { user, close } = await renderInfoDialog();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalledExactlyOnceWith();
  });
});
