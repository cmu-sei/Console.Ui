// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/angular';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MessageDialogComponent } from './message-dialog.component';
import { renderComponent } from 'src/app/test-utils/render-component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

async function renderMessage(overrides: Record<string, any> = {}) {
  const closeSpy = vi.fn();
  const data = overrides.data ?? {};
  const result = await renderComponent(MessageDialogComponent, {
    imports: [MatProgressSpinnerModule],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      {
        provide: MatDialogRef,
        useValue: { close: closeSpy, disableClose: false },
      },
    ],
    componentProperties: {
      title: overrides.title ?? 'Info',
      message: overrides.message ?? 'Something happened.',
    },
  });

  return { ...result, closeSpy };
}

describe('MessageDialogComponent', () => {
  it('should create', async () => {
    const { fixture } = await renderMessage();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display dialog title', async () => {
    await renderMessage({ title: 'Connection Lost' });
    expect(screen.getByText('Connection Lost')).toBeInTheDocument();
  });

  it('should display dialog message', async () => {
    await renderMessage({ message: 'Please try again.' });
    expect(screen.getByText('Please try again.')).toBeInTheDocument();
  });

  it('should show Ok button', async () => {
    await renderMessage();
    expect(screen.getByText('Ok')).toBeInTheDocument();
  });

  it('should close dialog when Ok clicked', async () => {
    const { fixture, closeSpy } = await renderMessage();
    fixture.componentInstance.onClick(false);
    expect(closeSpy).toHaveBeenCalled();
  });
});
