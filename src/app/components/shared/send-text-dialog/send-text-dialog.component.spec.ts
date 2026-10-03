// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect } from 'vitest';
import { MatDialogRef } from '@angular/material/dialog';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ComnSettingsService } from '@cmusei/crucible-common';
import { SendTextDialogComponent } from './send-text-dialog.component';
import { renderComponent } from '../../../test-utils/render-component';
import { dialogRefStub } from '../../../test-utils/dialog-refs';

async function renderSendText() {
  const { dialogRef, close } = dialogRefStub<SendTextDialogComponent>();
  const rendered = await renderComponent(SendTextDialogComponent, {
    providers: [
      { provide: MatDialogRef, useValue: dialogRef },
      {
        provide: ComnSettingsService,
        useValue: {
          settings: {
            PasteSpeeds: [
              { name: 'Fast', value: '30' },
              { name: 'Slow', value: '100' },
            ],
          },
        },
      },
    ],
  });
  rendered.fixture.componentInstance.title = 'Enter Text to Send';
  rendered.fixture.detectChanges();
  return { ...rendered, close, user: userEvent.setup() };
}

describe('SendTextDialogComponent', () => {
  /**
   * Verifies: Send closes with the typed text, and with a null timeout when no paste speed was chosen.
   * Interacts with: user-event typing into the textarea; the Send button; MatDialogRef.close spy.
   * Data: text 'ls -la'; no paste speed picked.
   */
  it('sends the typed text with a null timeout when no speed was picked', async () => {
    const { user, close } = await renderSendText();
    expect(screen.getByRole('heading', { name: 'Enter Text to Send' })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Text to send' }), 'ls -la');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(close).toHaveBeenCalledExactlyOnceWith({ textToSend: 'ls -la', timeout: null });
  });

  /**
   * Verifies: a paste speed picked from the settings menu is returned as the timeout.
   * Interacts with: MatMenuHarness (gear → Paste Speed → Slow); the Send button; MatDialogRef.close spy.
   * Data: PasteSpeeds Fast=30, Slow=100; text 'echo hi'.
   */
  it('returns the chosen paste speed', async () => {
    const { fixture, user, close } = await renderSendText();
    const menu = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatMenuHarness);
    await menu.open();
    await menu.clickItem({ text: /Paste Speed/ }, { text: 'Slow' });

    await user.type(screen.getByRole('textbox', { name: 'Text to send' }), 'echo hi');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(close).toHaveBeenCalledExactlyOnceWith({ textToSend: 'echo hi', timeout: '100' });
  });
});
