// Copyright 2024 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { renderComponent } from 'src/app/test-utils/render-component';

async function renderConfirmDialog(overrides: Record<string, any> = {}) {
  const dialogData = {
    title: overrides.title ?? 'Confirm Action',
    message: overrides.message ?? 'Are you sure?',
    buttonTrueText: overrides.buttonTrueText ?? 'Confirm',
    buttonFalseText: overrides.buttonFalseText ?? 'Cancel',
  };

  const closeSpy = { close: vi.fn() };

  const result = await renderComponent(ConfirmDialogComponent, {
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: dialogData },
      { provide: MatDialogRef, useValue: closeSpy },
    ],
  });

  return { ...result, closeSpy };
}

describe('ConfirmDialogComponent', () => {
  it('should create', async () => {
    const { fixture } = await renderConfirmDialog();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display the title and message', async () => {
    await renderConfirmDialog({
      title: 'Delete Item',
      message: 'This cannot be undone.',
    });

    expect(screen.getByText('Delete Item')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('should display custom button text', async () => {
    await renderConfirmDialog({
      buttonTrueText: 'Yes, delete',
      buttonFalseText: 'No, keep',
    });

    expect(screen.getByText('Yes, delete')).toBeInTheDocument();
    expect(screen.getByText('No, keep')).toBeInTheDocument();
  });

  it('should close with true when confirm is clicked', async () => {
    const user = userEvent.setup();
    const { closeSpy } = await renderConfirmDialog();

    await user.click(screen.getByText('Confirm'));
    expect(closeSpy.close).toHaveBeenCalledWith(true);
  });

  it('should close with false when cancel is clicked', async () => {
    const user = userEvent.setup();
    const { closeSpy } = await renderConfirmDialog();

    await user.click(screen.getByText('Cancel'));
    expect(closeSpy.close).toHaveBeenCalledWith(false);
  });

  it('should use default button text when not provided', async () => {
    await renderConfirmDialog({
      title: 'Test',
      message: 'Test message',
    });

    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });
});
