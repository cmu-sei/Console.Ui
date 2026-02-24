/*
Copyright 2021 Carnegie Mellon University. All Rights Reserved. 
 Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
*/

import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { delay } from 'rxjs/operators';
import { ProxmoxConsole, ProxmoxService, Vm } from '../../../generated/vm-api';
import { AsyncPipe } from '@angular/common';
import { NovncComponent } from '../../novnc/novnc.component';

@Component({
    selector: 'app-proxmox-console',
    templateUrl: './proxmox-console.component.html',
    styleUrls: ['./proxmox-console.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NovncComponent, AsyncPipe]
})
export class ProxmoxConsoleComponent {
  @Input() readOnly = false;

  @Input() set vm(value: Vm) {
    this._vm = value;
    this.getConsole();
  }

  private _vm: Vm;

  proxmoxConsole$: Observable<ProxmoxConsole>;

  constructor(private proxmoxService: ProxmoxService) {}

  getConsole(attempts: number = 0) {
    if (this._vm != null) {
      this.proxmoxConsole$ = this.proxmoxService
        .getProxmoxConsole(this._vm.id)
        .pipe(delay(this.getDelay(attempts)));
    }
  }

  private getDelay(attempts: number): number {
    const maxSeconds = 10;

    let nextRetrySeconds = Math.pow(2, attempts + 1);

    if (nextRetrySeconds > maxSeconds) {
      nextRetrySeconds = maxSeconds;
    }

    return nextRetrySeconds * 1000;
  }
}
