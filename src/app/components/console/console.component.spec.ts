// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DeferBlockBehavior } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { Vm, VmsService, VmType, VsphereVirtualMachine } from '../../generated/vm-api';
import { VmService } from '../../state/vm/vm.service';
import { VmStore as VsphereStore } from '../../state/vsphere/vsphere.store';
import { ConsoleComponent } from './console.component';
import { OptionsBarComponent } from '../options-bar/options-bar.component';
import { OptionsBar2Component } from '../options-bar2/options-bar2.component';
import { ProxmoxConsoleComponent } from '../proxmox/proxmox-console/proxmox-console.component';
import { WmksComponent } from '../wmks/wmks.component';
import { renderComponent } from '../../test-utils/render-component';
import { ApiStub } from '../../test-utils/api-stub';

@Component({ selector: 'app-options-bar', template: '' })
class OptionsBarStubComponent {
  @Input() readOnly: boolean;
  @Input() allowReadOnlyToggle: boolean;
  @Input() vm: VsphereVirtualMachine;
  @Input() vmId: string;
}

@Component({ selector: 'app-wmks', template: '' })
class WmksStubComponent {
  @Input() readOnly: boolean;
  @Input() vmId: string;
}

@Component({ selector: 'app-options-bar2', template: '' })
class OptionsBar2StubComponent {
  @Input() vm: Vm;
  @Input() readOnly: boolean;
}

@Component({ selector: 'app-proxmox-console', template: '' })
class ProxmoxConsoleStubComponent {
  @Input() vm: Vm;
  @Input() readOnly: boolean;
  @Output() reconnect = new EventEmitter<number>();
}

async function renderConsole(
  overrides: { type?: VmType; readOnly?: boolean; allowReadOnlyToggle?: boolean } = {},
) {
  const vm: Vm = { id: 'vm-1', name: 'Alpha', type: overrides.type ?? VmType.Vsphere };
  // The real VmService runs; only the generated API is stubbed.
  const vmsService = { getVm: vi.fn(() => of(vm)) } satisfies ApiStub<VmsService>;

  const rendered = await renderComponent(ConsoleComponent, {
    childStubs: [
      { replace: OptionsBarComponent, with: OptionsBarStubComponent },
      { replace: WmksComponent, with: WmksStubComponent },
      { replace: OptionsBar2Component, with: OptionsBar2StubComponent },
      { replace: ProxmoxConsoleComponent, with: ProxmoxConsoleStubComponent },
    ],
    deferBlockBehavior: DeferBlockBehavior.Playthrough,
    inputs: {
      vmId: 'vm-1',
      readOnly: overrides.readOnly ?? false,
      allowReadOnlyToggle: overrides.allowReadOnlyToggle ?? false,
    },
    providers: [VmService, { provide: VmsService, useValue: vmsService }],
  });
  await rendered.fixture.whenStable();
  rendered.fixture.detectChanges();

  const child = <T>(type: new (...args: never[]) => T): T | undefined =>
    rendered.fixture.debugElement.query(By.directive(type))?.componentInstance as T | undefined;

  return { ...rendered, vm, vmsService, child };
}

describe('ConsoleComponent', () => {
  /**
   * Verifies: a vSphere Vm gets the WMKS console and the vSphere options bar, each receiving the page's readOnly and allowReadOnlyToggle values as given.
   * Interacts with: real VmService (VmsService.getVm stub); @defer blocks; the vSphere child stubs' inputs.
   * Data: vSphere Vm; the readOnly / allowReadOnlyToggle pair under test.
   */
  it.each([
    [true, false],
    [false, true],
  ])(
    'renders the WMKS console for a vSphere Vm with readOnly %s and allowReadOnlyToggle %s',
    async (readOnly, allowReadOnlyToggle) => {
      const { child } = await renderConsole({
        type: VmType.Vsphere,
        readOnly,
        allowReadOnlyToggle,
      });

      const bar = child(OptionsBarStubComponent);
      expect(bar?.readOnly).toBe(readOnly);
      expect(bar?.allowReadOnlyToggle).toBe(allowReadOnlyToggle);
      expect(bar?.vmId).toBe('vm-1');
      expect(child(WmksStubComponent)?.readOnly).toBe(readOnly);
      expect(child(WmksStubComponent)?.vmId).toBe('vm-1');
      expect(child(ProxmoxConsoleStubComponent)).toBeUndefined();
      expect(child(OptionsBar2StubComponent)).toBeUndefined();
    },
  );

  /**
   * Verifies: a Proxmox Vm gets the noVNC console and the generic options bar, both receiving the page's readOnly value as given.
   * Interacts with: real VmService; @defer blocks; the Proxmox child stubs' inputs.
   * Data: Proxmox Vm; the readOnly value under test.
   */
  it.each([true, false])('renders the noVNC console for a Proxmox Vm with readOnly %s', async (readOnly) => {
    const { child, vm } = await renderConsole({ type: VmType.Proxmox, readOnly });

    expect(child(ProxmoxConsoleStubComponent)?.vm).toEqual(vm);
    expect(child(ProxmoxConsoleStubComponent)?.readOnly).toBe(readOnly);
    expect(child(OptionsBar2StubComponent)?.vm).toEqual(vm);
    expect(child(OptionsBar2StubComponent)?.readOnly).toBe(readOnly);
    expect(child(WmksStubComponent)).toBeUndefined();
  });

  /**
   * Verifies: a Vm of Unknown type falls back to the vSphere console.
   * Interacts with: @defer `when` conditions.
   * Data: Unknown-type Vm.
   */
  it('treats an Unknown-type Vm as vSphere', async () => {
    const { child } = await renderConsole({ type: VmType.Unknown });
    expect(child(WmksStubComponent)).toBeDefined();
    expect(child(ProxmoxConsoleStubComponent)).toBeUndefined();
  });

  /**
   * Verifies: the vSphere options bar receives the vSphere entity from the real vSphere store.
   * Interacts with: real vSphere store and VsphereQuery; OptionsBarStubComponent.vm.
   * Data: vSphere entity 'vm-1' named 'Stored' added after render.
   */
  it('feeds the options bar from the vSphere store', async () => {
    const { fixture, child } = await renderConsole();
    fixture.debugElement.injector.get(VsphereStore).upsert('vm-1', { name: 'Stored' });
    fixture.detectChanges();
    expect(child(OptionsBarStubComponent)?.vm).toEqual({ id: 'vm-1', name: 'Stored' });
  });
});
