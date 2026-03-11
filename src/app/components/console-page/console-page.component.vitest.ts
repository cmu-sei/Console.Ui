// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { of } from 'rxjs';
import { ConsolePageComponent } from './console-page.component';
import { renderComponent } from 'src/app/test-utils/render-component';
import { RouterQuery } from '@datorama/akita-ng-router-store';
import { SignalRService } from '../../services/signalr/signalr.service';
import { VmQuery } from '../../state/vm/vm.query';
import { UserPermissionsService } from '../../services/user-permissions/user-permissions.service';
import { BehaviorSubject } from 'rxjs';

async function renderConsolePage() {
  return renderComponent(ConsolePageComponent, {
    providers: [
      {
        provide: RouterQuery,
        useValue: {
          selectParams: () => of('vm-1'),
          getParams: () => 'vm-1',
        },
      },
      {
        provide: SignalRService,
        useValue: {
          startConnection: () => Promise.resolve(),
          joinVm: vi.fn(),
          leaveVm: vi.fn(),
          setActiveVirtualMachine: vi.fn(),
          unsetActiveVirtualMachine: vi.fn(),
          currentVmUsers$: new BehaviorSubject<string[]>([]),
        },
      },
      {
        provide: VmQuery,
        useValue: {
          selectEntityNotNull: () => of({ id: 'vm-1', name: 'Test VM' }),
          selectAll: () => of([]),
          select: () => of(null),
        },
      },
      {
        provide: UserPermissionsService,
        useValue: {
          permissions$: of({ teamPermissions: [], viewPermissions: [] }),
          readOnlyToggleable$: of(true),
          readOnly$: of(false),
          load: () => of({ teamPermissions: [], viewPermissions: [] }),
          can: () => of(false),
        },
      },
    ],
  });
}

describe('ConsolePageComponent', () => {
  it('should create', async () => {
    const { fixture } = await renderConsolePage();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should set vmId from route params', async () => {
    const { fixture } = await renderConsolePage();
    expect(fixture.componentInstance.vmId).toBe('vm-1');
  });

  it('should have readOnly$ observable', async () => {
    const { fixture } = await renderConsolePage();
    expect(fixture.componentInstance.readOnly$).toBeTruthy();
  });
});
