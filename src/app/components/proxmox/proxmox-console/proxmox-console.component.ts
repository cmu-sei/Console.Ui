/*
Copyright 2021 Carnegie Mellon University. All Rights Reserved. 
 Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
*/

import { Component, ChangeDetectionStrategy, Input, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { delay, takeUntil } from 'rxjs/operators';
import { ProxmoxConsole, ProxmoxService, Vm } from '../../../generated/vm-api';
import { AsyncPipe } from '@angular/common';
import { NovncComponent } from '../../novnc/novnc.component';
import { MatIcon } from '@angular/material/icon';

@Component({
    selector: 'app-proxmox-console',
    templateUrl: './proxmox-console.component.html',
    styleUrls: ['./proxmox-console.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NovncComponent, AsyncPipe, MatIcon]
})
export class ProxmoxConsoleComponent implements OnDestroy {
  @Input() readOnly = false;

  @Input() set vm$(value: Observable<Vm>) {
    console.log('vm$ input received:', value);
    if (value) {
      value.pipe(takeUntil(this.destroy$)).subscribe(vm => {
        console.log('VM updated via observable:', vm);
        this._vm = vm;
        // Only try to get console if VM is running
        if (this._vm?.powerState !== 'Off' && this._vm?.powerState !== 'Unknown') {
          console.log('Getting console for running VM');
          this.getConsole();
        } else {
          console.log('VM is powered off or unknown, not getting console');
        }
      });
    }
  }

  public _vm: Vm;

  proxmoxConsole$: Observable<ProxmoxConsole>;

  private destroy$ = new Subject<void>();

  constructor(private proxmoxService: ProxmoxService) {}

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getConsole(attempts: number = 0) {
    if (this._vm != null && this._vm.powerState !== 'Off' && this._vm.powerState !== 'Unknown') {
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
