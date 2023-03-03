/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  HostListener,
  OnDestroy,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ComnAuthService } from '@cmusei/crucible-common';
import { RouterQuery } from '@datorama/akita-ng-router-store';
import { Observable, Subject } from 'rxjs';
import { map, take, takeUntil } from 'rxjs/operators';
import { SignalRService } from '../../services/signalr/signalr.service';
import { VmQuery } from '../../state/vm/vm.query';
import { VmService } from '../../state/vm/vm.service';

@Component({
  selector: 'app-console-page',
  templateUrl: './console-page.component.html',
  styleUrls: ['./console-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsolePageComponent implements OnInit, OnDestroy {
  readOnly$: Observable<boolean>;
  vmId$: Observable<string> = this.routerQuery.selectParams('id');
  vmId: string;

  unsubscribe$ = new Subject();

  constructor(
    private routerQuery: RouterQuery,
    private signalrRService: SignalRService,
    private vmQuery: VmQuery,
    private titleService: Title,
    private vmService: VmService,
    private authService: ComnAuthService,
  ) {}

  ngOnInit() {
    this.vmId = this.routerQuery.getParams('id');

    this.signalrRService.startConnection().then(() => {
      if (document.hasFocus()) {
        this.signalrRService.setActiveVirtualMachine(this.vmId);
      }
    });

    this.vmQuery
      .selectEntityNotNull(this.vmId)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe((vm) => {
        this.titleService.setTitle(vm.name);
      });

    this.readOnly$ = this.vmService.getVmPermissions(this.vmId).pipe(
      map((p) => {
        return p.includes('ReadOnly');
      })
    );
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next(null);
    this.unsubscribe$.complete();
  }

  @HostListener('window:focus', ['$event'])
  onFocus(): void {
    console.log('setting active vmId=' + this.vmId);
    this.signalrRService.setActiveVirtualMachine(this.vmId);
  }

  @HostListener('window:blur', ['$event'])
  onBlur(): void {
    this.signalrRService.unsetActiveVirtualMachine();
  }
}
