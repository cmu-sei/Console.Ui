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
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SignalRService } from '../../services/signalr/signalr.service';
import { UserQuery } from '../../state/user/user.query';
import { VmQuery } from '../../state/vm/vm.query';

@Component({
  selector: 'app-user-follow-page',
  templateUrl: './user-follow-page.component.html',
  styleUrls: ['./user-follow-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserFollowPageComponent implements OnInit, OnDestroy {
  vmId$ = this.vmQuery.selectActiveId();
  user$ = this.userQuery.selectActive();

  unsubscribe$ = new Subject();

  constructor(
    private routerQuery: RouterQuery,
    private signalrRService: SignalRService,
    private vmQuery: VmQuery,
    private userQuery: UserQuery,
    private titleService: Title
  ) {
    titleService.setTitle('Following...');
  }

  ngOnInit() {
    const userId = this.routerQuery.getParams('userId');
    const viewId = this.routerQuery.getParams('viewId');

    this.signalrRService.startConnection().then(() => {
      this.signalrRService.joinUser(userId, viewId);
    });

    this.userQuery
      .selectEntityNotNull(userId)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe((user) => {
        this.titleService.setTitle(`${user.name} - Following`);
      });
  }

  ngOnDestroy(): void {
    this.leaveUser();

    this.unsubscribe$.next();
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
