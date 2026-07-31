/*
Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
*/

import {
  Component,
  ChangeDetectionStrategy,
  Input,
  ChangeDetectorRef,
  computed,
  signal,
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  NicOptions,
  ProxmoxVirtualMachine,
  Vm,
} from '../../generated/vm-api';
import { PowerAction, VmService } from '../../state/vm/vm.service';
import {
  ComnAuthQuery,
  ComnAuthService,
  CrucibleDialogService,
  Theme,
} from '@cmusei/crucible-common';
import { filter, take } from 'rxjs/operators';
import { MatIcon } from '@angular/material/icon';
import { MatMenuTrigger, MatMenu, MatMenuItem } from '@angular/material/menu';
import { MatIconButton } from '@angular/material/button';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatLabel } from '@angular/material/form-field';
import { AsyncPipe } from '@angular/common';
import { MatTooltip } from '@angular/material/tooltip';
import { ProxmoxService } from '../../services/proxmox/proxmox.service';

@Component({
    selector: 'app-options-bar2',
    templateUrl: './options-bar2.component.html',
    styleUrls: ['./options-bar2.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIconButton, MatMenuTrigger, MatIcon, MatMenu, MatMenuItem, MatSlideToggleModule, MatLabel, AsyncPipe, MatTooltip]
})
export class OptionsBar2Component {
  // Generic Options Bar - Will eventually replace OptionsBarComponent

  private readonly vmState = signal<Vm | null>(null);
  private readonly proxmoxVmState = signal<ProxmoxVirtualMachine | null>(null);

  @Input()
  set vm(value: Vm | null | undefined) {
    this.vmState.set(value ?? null);
  }

  @Input()
  set proxmoxVm(value: ProxmoxVirtualMachine | null | undefined) {
    this.proxmoxVmState.set(value ?? null);
  }

  get vm(): Vm | null {
    return this.vmState();
  }

  @Input() readOnly = false;

  constructor(
    private vmService: VmService,
    private authService: ComnAuthService,
    private authQuery: ComnAuthQuery,
    private crucibleDialogService: CrucibleDialogService,
    private snackBar: MatSnackBar,
    private proxmoxService: ProxmoxService,
    private changeDetectorRef: ChangeDetectorRef,
  ) {}

  theme$ = this.authQuery.userTheme$;

  public get networkCards(): NicOptions | undefined {
    return this.proxmoxVmState()?.networkCards;
  }

  public get canAccessNicConfiguration(): boolean {
    return this.proxmoxVmState()?.canAccessNicConfiguration === true;
  }

  public readonly networkMenuItems = computed(() => {
    const cards = this.networkCards;
    if (!cards?.currentNetworks || !cards.availableNetworks) {
      return [];
    }

    const readOnly = new Set(cards.readOnlyNetworks || []);
    const networks = Object.entries(cards.availableNetworks).map(([ref, name]) => ({
      ref,
      name: name || ref,
      readOnly: readOnly.has(ref),
    }));

    return Object.entries(cards.currentNetworks).map(([key, currentRef]) => {
      const current = networks.find((network) => network.ref === currentRef);
      const others = networks.filter(
        (network) => network.ref !== currentRef && !network.readOnly,
      );

      return {
        key,
        currentRef,
        networks: current ? [current, ...others] : others,
      };
    });
  });

  public changeNic(adapter: string, network: string) {
    const cards = this.networkCards;
    const currentRef = cards?.currentNetworks?.[adapter];
    const readOnly = new Set(cards?.readOnlyNetworks || []);

    if (!cards || network === currentRef) {
      return;
    }

    const vm = this.vm;
    if (!vm) {
      return;
    }

    const performChange = () => {
      this.proxmoxService
        .changeNic(vm.id, adapter, network)
        .pipe(take(1))
        .subscribe({
          next: (model) => {
            this.proxmoxVm = model;
            this.changeDetectorRef.markForCheck();
          },
        });
    };

    if (readOnly.has(currentRef)) {
      const currentName = cards.availableNetworks?.[currentRef] || currentRef;

      this.crucibleDialogService
        .confirm({
          title: 'Confirm Network Change',
          message: `You are currently on "${currentName}", which is not in your allowed network list. If you switch away, you will not be able to switch back. Do you want to continue?`,
          confirmText: 'Confirm',
          cancelText: 'Cancel',
        })
        .afterClosed()
        .pipe(
          take(1),
          filter((confirmed) => confirmed === true),
        )
        .subscribe(() => performChange());
    } else {
      performChange();
    }
  }

  public ctrlAltDel() {
    this.vmService.sendCtrlAltDel(this.vm.id);
  }

  public sendClipboardText() {
    this.vmService.sendClipboardText(this.vm.id);
  }

  public powerOn() {
    this.submitPowerAction(PowerAction.PowerOn);
  }

  public powerOff() {
    this.confirmPowerAction(
      PowerAction.PowerOff,
      `Power off "${this.vm?.name}"? The guest OS will not be shut down cleanly.`,
    );
  }

  public reboot() {
    this.confirmPowerAction(PowerAction.Reboot, `Reboot "${this.vm?.name}"?`);
  }

  public shutdown() {
    this.confirmPowerAction(
      PowerAction.Shutdown,
      `Shut down the guest OS on "${this.vm?.name}"?`,
    );
  }

  private confirmPowerAction(action: PowerAction, message: string) {
    this.crucibleDialogService
      .confirm({
        title: `Confirm ${action}`,
        message,
        confirmText: 'Confirm',
        cancelText: 'Cancel',
      })
      .afterClosed()
      .pipe(
        take(1),
        filter((confirmed) => confirmed === true),
      )
      .subscribe(() => this.submitPowerAction(action));
  }

  private submitPowerAction(action: PowerAction) {
    // The console does not receive VmUpdated events, so a snackbar is the only feedback available.
    // Any non-error response means the operation was submitted; the API does not report completion.
    this.vmService
      .powerAction(this.vm.id, action)
      .pipe(take(1))
      .subscribe({
        next: () => this.showMessage(`${action} submitted`),
        error: (error) =>
          this.showMessage(`${action} failed: ${error.message}`, 10000),
      });
  }

  private showMessage(message: string, duration = 5000) {
    this.snackBar.open(message, 'Close', {
      duration,
      verticalPosition: 'top',
    });
  }

  toggleTheme(event: MatSlideToggleChange) {
    const theme = event.checked ? Theme.DARK : Theme.LIGHT;
    this.authService.setUserTheme(theme);
  }
}
