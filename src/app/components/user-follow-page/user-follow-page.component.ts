/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  OnDestroy,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterQuery } from '@datorama/akita-ng-router-store';
import { Observable, Subject } from 'rxjs';
import { debounceTime, map, takeUntil } from 'rxjs/operators';
import { SignalRService } from '../../services/signalr/signalr.service';
import { UserQuery } from '../../state/user/user.query';
import { VsphereQuery } from '../../state/vsphere/vsphere.query';
import { AsyncPipe } from '@angular/common';
import { ConsoleComponent } from '../console/console.component';
import { VmUser } from '../../generated/vm-api';

@Component({
  selector: 'app-user-follow-page',
  templateUrl: './user-follow-page.component.html',
  styleUrls: ['./user-follow-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [ConsoleComponent, AsyncPipe],
})
export class UserFollowPageComponent implements OnInit, OnDestroy {
  vmId$: Observable<string>;
  isActive$ = this.vmQuery.selectActiveId().pipe(
    map((x) => x != null),
    debounceTime(100),
  );
  user$ = this.userQuery.selectActive();

  vmUser: VmUser = {};

  unsubscribe$ = new Subject();

  constructor(
    private routerQuery: RouterQuery,
    private signalrRService: SignalRService,
    private vmQuery: VsphereQuery,
    private userQuery: UserQuery,
    private titleService: Title,
  ) {
    titleService.setTitle('Following...');
  }

  ngOnInit() {
    const userId = this.routerQuery.getParams('userId');
    const viewId = this.routerQuery.getParams('viewId');

    this.signalrRService.startConnection().then(() => {
      this.signalrRService.joinUser(userId, viewId).then((vmUser: VmUser) => {
        this.vmUser = vmUser;
      });
    });

    this.userQuery
      .selectEntityNotNull(userId)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe((user) => {
        this.titleService.setTitle(`${user.name} - Following`);
      });

    this.vmId$ = this.vmQuery.selectActiveId().pipe(
      map((x) => {
        if (x == null) {
          return this.vmUser?.lastVmId;
        } else {
          this.vmUser.lastVmId = x;
          return x;
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.leaveUser();

    this.unsubscribe$.next(null);
    this.unsubscribe$.complete();
  }

  leaveUser() {
    const userId = this.routerQuery.getParams('userId');
    const viewId = this.routerQuery.getParams('viewId');

    this.signalrRService.startConnection().then(() => {
      this.signalrRService.leaveUser(userId, viewId);
    });
  }
}
