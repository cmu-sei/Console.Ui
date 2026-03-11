// Copyright 2023 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/angular';
import { BehaviorSubject, of } from 'rxjs';
import { OptionsBarComponent } from './options-bar.component';
import { renderComponent } from 'src/app/test-utils/render-component';
import { VsphereService } from '../../state/vsphere/vsphere.service';
import { UserPermissionsService } from '../../services/user-permissions/user-permissions.service';
import { SignalRService } from '../../services/signalr/signalr.service';
import { MatListModule } from '@angular/material/list';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';

async function renderOptionsBar(overrides: Record<string, any> = {}) {
  return renderComponent(OptionsBarComponent, {
    imports: [MatListModule, MatTabsModule, MatProgressBarModule, MatToolbarModule],
    componentProperties: {
      vm: {
        id: 'vm-1',
        name: 'Test VM',
        state: 'on',
        vmToolsStatus: 'toolsOk',
        isOwner: false,
        hasSnapshot: true,
      } as any,
      vmId: 'vm-1',
      readOnly: overrides.readOnly ?? false,
      allowReadOnlyToggle: true,
    },
    providers: [
      {
        provide: VsphereService,
        useValue: {
          model: {
            name: 'Test VM',
            id: 'vm-1',
            state: 'on',
            vmToolsStatus: 'toolsOk',
            isOwner: false,
            hasSnapshot: true,
            networkCards: null,
            canAccessNicConfiguration: false,
          },
          wmks: null,
          showLoading: false,
          showPower: false,
          showPoweringOff: false,
          showError: false,
          showLock: false,
          uploadConfig: { username: '', password: '', filepath: '' },
          vmClipBoard: new BehaviorSubject<string>(''),
          vmResolution: new BehaviorSubject({ width: 1024, height: 768 }),
          connectionStatus$: of({ connected: false }),
          connected$: of(false),
          disconnected$: of(true),
          settingsService: { settings: { VmResolutionOptions: [] } },
          connect: vi.fn().mockResolvedValue(undefined),
          disconnect: vi.fn(),
          powerOn: vi.fn(),
          powerOff: vi.fn(),
          reBoot: vi.fn(),
          shutdownOS: vi.fn(),
          changeNic: vi.fn(() => of({})),
          getSnapshots: vi.fn(() => of([])),
          revertToSnapshot: vi.fn(() => of({})),
          getIsos: vi.fn(() => of([])),
          mountIso: vi.fn(() => of({})),
          setResolution: vi.fn(() => of({})),
          verifyCredentials: vi.fn(() => of({})),
          sendFileToVm: vi.fn(() => of({})),
          getVmFileUrl: vi.fn(() => of({})),
          getVm: vi.fn(() => of({})),
          setReadOnly: vi.fn(),
        },
      },
      {
        provide: UserPermissionsService,
        useValue: {
          permissions$: of({ teamPermissions: [], viewPermissions: [] }),
          readOnlyToggleable$: of(true),
          readOnly$: of(false),
          load: () => of({ teamPermissions: [], viewPermissions: [] }),
          can: () => of(true),
        },
      },
      {
        provide: SignalRService,
        useValue: {
          startConnection: () => Promise.resolve(),
          joinUser: () => Promise.resolve({}),
          leaveUser: () => {},
          joinVm: () => {},
          leaveVm: () => {},
          setActiveVirtualMachine: () => {},
          unsetActiveVirtualMachine: () => {},
          currentVmUsers$: new BehaviorSubject<string[]>([]),
        },
      },
    ],
  });
}

describe('OptionsBarComponent', () => {
  it('should create', async () => {
    const { fixture } = await renderOptionsBar();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display VM name', async () => {
    await renderOptionsBar();
    expect(screen.getByText(/Test VM/)).toBeInTheDocument();
  });

  it('should show Read Only indicator when readOnly is true', async () => {
    await renderOptionsBar({ readOnly: true });
    expect(screen.getByText(/\(Read Only\)/)).toBeInTheDocument();
  });

  it('should not show Read Only indicator when readOnly is false', async () => {
    await renderOptionsBar({ readOnly: false });
    expect(screen.queryByText(/\(Read Only\)/)).toBeNull();
  });

  it('should have a gear menu button', async () => {
    const { container } = await renderOptionsBar();
    const gearButtons = container.querySelectorAll('button[mat-icon-button]');
    expect(gearButtons.length).toBeGreaterThan(0);
  });
});
