// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/angular';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SendTextDialogComponent } from './send-text-dialog.component';
import { renderComponent } from 'src/app/test-utils/render-component';
import { ComnSettingsService } from '@cmusei/crucible-common';

async function renderSendText(overrides: Record<string, any> = {}) {
  const closeSpy = vi.fn();
  const result = await renderComponent(SendTextDialogComponent, {
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: {} },
      {
        provide: MatDialogRef,
        useValue: { close: closeSpy, disableClose: false },
      },
      {
        provide: ComnSettingsService,
        useValue: {
          settings: {
            PasteSpeeds: [
              { name: 'Slow', value: '500' },
              { name: 'Fast', value: '100' },
            ],
          },
        },
      },
    ],
    componentProperties: {
      title: overrides.title ?? 'Send Text',
    },
  });

  return { ...result, closeSpy };
}

describe('SendTextDialogComponent', () => {
  it('should create', async () => {
    const { fixture } = await renderSendText();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display dialog title', async () => {
    await renderSendText({ title: 'Paste to VM' });
    expect(screen.getByText('Paste to VM')).toBeInTheDocument();
  });

  it('should show Send button', async () => {
    await renderSendText();
    expect(screen.getByText('Send')).toBeInTheDocument();
  });

  it('should show Cancel button', async () => {
    await renderSendText();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should close dialog with text data when send called', async () => {
    const { fixture, closeSpy } = await renderSendText();
    fixture.componentInstance.textToSend = 'Hello World';
    fixture.componentInstance.send();
    expect(closeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ textToSend: 'Hello World' }),
    );
  });
});
