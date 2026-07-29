/*
Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
*/

import {
  Component,
  ChangeDetectionStrategy,
  Input,
  OnDestroy,
} from '@angular/core';
import { BehaviorSubject, Subscription, of, timer } from 'rxjs';
import { catchError, exhaustMap, map, takeWhile } from 'rxjs/operators';
import { PowerState, ProxmoxService, Vm } from '../../../generated/vm-api';
import { NovncComponent } from '../../novnc/novnc.component';
import { AsyncPipe } from '@angular/common';
import { MatIcon } from '@angular/material/icon';

/**
 * What to show for the current console request. Mirrors the showPower / showError flags
 * VsphereService drives the wmks console with.
 */
export interface ProxmoxConsoleState {
  url?: string;
  ticket?: string;
  showPower: boolean;
  showError: boolean;
}

@Component({
    selector: 'app-proxmox-console',
    templateUrl: './proxmox-console.component.html',
    styleUrls: ['./proxmox-console.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NovncComponent, MatIcon, AsyncPipe]
})
export class ProxmoxConsoleComponent implements OnDestroy {
  // A Vm that is not running has no console, and console.ui is not subscribed to VmUpdated
  // events, so polling is the only way to notice it come back up. Matches the 5 second
  // connectTimer WmksComponent uses.
  private static readonly pollMilliseconds = 5000;

  @Input() readOnly = false;

  @Input() set vm(value: Vm) {
    this._vm = value;
    this.getConsole();
  }

  private _vm: Vm;
  private pollSubscription: Subscription;

  private consoleStateSubject = new BehaviorSubject<ProxmoxConsoleState>(null);
  public consoleState$ = this.consoleStateSubject.asObservable();

  constructor(private proxmoxService: ProxmoxService) {}

  ngOnDestroy() {
    this.pollSubscription?.unsubscribe();
  }

  /**
   * Requests a console, retrying until one is available. Polling stops as soon as a ticket is
   * obtained - noVNC owns the connection from that point, and reports a failure through its
   * reconnect output, which starts the polling again.
   */
  getConsole(attempts: number = 0) {
    this.pollSubscription?.unsubscribe();

    if (this._vm == null) {
      return;
    }

    this.pollSubscription = timer(
      this.getDelay(attempts),
      ProxmoxConsoleComponent.pollMilliseconds,
    )
      .pipe(
        // Skip a tick rather than piling up requests if one is still in flight.
        exhaustMap(() =>
          this.proxmoxService.getProxmoxConsole(this._vm.id).pipe(
            map(
              (proxmoxConsole): ProxmoxConsoleState => ({
                url: proxmoxConsole.url,
                ticket: proxmoxConsole.ticket,
                showPower:
                  proxmoxConsole.powerState === PowerState.Off ||
                  proxmoxConsole.powerState === PowerState.Suspended,
                showError: false,
              }),
            ),
            catchError(() =>
              of<ProxmoxConsoleState>({ showPower: false, showError: true }),
            ),
          ),
        ),
        // Inclusive, so the state carrying the ticket is still emitted before completing.
        takeWhile((state) => !state.ticket, true),
      )
      .subscribe((state) => this.consoleStateSubject.next(state));
  }

  private getDelay(attempts: number): number {
    if (attempts === 0) {
      return 0;
    }

    const maxSeconds = 10;

    let nextRetrySeconds = Math.pow(2, attempts + 1);

    if (nextRetrySeconds > maxSeconds) {
      nextRetrySeconds = maxSeconds;
    }

    return nextRetrySeconds * 1000;
  }
}
