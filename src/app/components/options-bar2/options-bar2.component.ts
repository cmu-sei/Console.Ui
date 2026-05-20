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
import { Vm, VmType } from '../../generated/vm-api';
import { VmService } from '../../state/vm/vm.service';
import { ComnAuthQuery, ComnAuthService, Theme } from '@cmusei/crucible-common';
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

  public get clipboardEnabled(): boolean {
    if (this.vm) {
      return !this.readOnly && this.vm.type == VmType.Vsphere;
    } else {
      return false;
    }
  }

  constructor(
    private vmService: VmService,
    private authService: ComnAuthService,
    private authQuery: ComnAuthQuery,
  ) {}

  theme$ = this.authQuery.userTheme$;

  ngOnInit(): void {}

  public ctrlAltDel() {
    this.vmService.sendCtrlAltDel(this.vm.id);
  }

  public sendClipboardText() {
    this.vmService.sendClipboardText(this.vm.id);
  }

  toggleTheme(event: MatSlideToggleChange) {
    const theme = event.checked ? Theme.DARK : Theme.LIGHT;
    this.authService.setUserTheme(theme);
  }
}
