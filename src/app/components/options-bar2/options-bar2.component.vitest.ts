// Copyright 2022 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/angular';
import { OptionsBar2Component } from './options-bar2.component';
import { renderComponent } from 'src/app/test-utils/render-component';
import { VmService } from '../../state/vm/vm.service';

async function renderOptionsBar2(overrides: Record<string, any> = {}) {
  return renderComponent(OptionsBar2Component, {
    providers: [
      {
        provide: VmService,
        useValue: {
          sendCtrlAltDel: vi.fn(),
          sendClipboardText: vi.fn(),
        },
      },
    ],
    componentProperties: {
      vm: {
        id: 'vm-1',
        name: 'Test VM',
        type: 'Vsphere',
      } as any,
      readOnly: overrides.readOnly ?? false,
    },
  });
}

describe('OptionsBar2Component', () => {
  it('should create', async () => {
    const { fixture } = await renderOptionsBar2();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display VM name', async () => {
    await renderOptionsBar2();
    expect(screen.getByText('Test VM')).toBeInTheDocument();
  });

  it('should have a gear menu button', async () => {
    const { container } = await renderOptionsBar2();
    const buttons = container.querySelectorAll('button[mat-icon-button]');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should have clipboardEnabled based on vm type and readOnly', async () => {
    const { fixture } = await renderOptionsBar2();
    expect(fixture.componentInstance.clipboardEnabled).toBe(true);
  });

  it('should disable clipboard when readOnly is true', async () => {
    const { fixture } = await renderOptionsBar2({ readOnly: true });
    expect(fixture.componentInstance.clipboardEnabled).toBe(false);
  });
});
