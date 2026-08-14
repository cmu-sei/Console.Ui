/*
Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
*/

import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  Input,
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Vm } from '../../generated/vm-api';
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

@Component({
    selector: 'app-options-bar2',
    templateUrl: './options-bar2.component.html',
    styleUrls: ['./options-bar2.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIconButton, MatMenuTrigger, MatIcon, MatMenu, MatMenuItem, MatSlideToggleModule, MatLabel, AsyncPipe]
})
export class OptionsBar2Component implements OnInit {
  // Generic Options Bar - Will eventually replace OptionsBarComponent

  @Input() vm: Vm;
  @Input() readOnly = false;

  constructor(
    private vmService: VmService,
    private authService: ComnAuthService,
    private authQuery: ComnAuthQuery,
    private crucibleDialogService: CrucibleDialogService,
    private snackBar: MatSnackBar,
  ) {}

  theme$ = this.authQuery.userTheme$;

  ngOnInit(): void {}

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
