/**
 * Copyright 2023 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import { Inject, Injectable } from '@angular/core';
import { ComnAuthService } from '@cmusei/crucible-common';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Observable } from 'rxjs';
import { BASE_PATH } from '../../generated/vm-api';
import { UserQuery } from '../../state/user/user.query';
import { UserService } from '../../state/user/user.service';
import { VsphereService } from '../../state/vsphere/vsphere.service';

@Injectable({
  providedIn: 'root',
})
export class SignalRService {
  public currentVmUsers$: BehaviorSubject<string[]>;
  private hubConnection: signalR.HubConnection;
  private connectionPromise: Promise<void>;

  private userId: string;
  private viewId: string;
  private activeVmId: string;

  private apiUrl: string;

  constructor(
    private authService: ComnAuthService,
    private vmService: VsphereService,
    private userService: UserService,
    private userQuery: UserQuery,
    @Inject(BASE_PATH) basePath: string,
  ) {
    this.apiUrl = basePath;

    this.authService.user$.subscribe(() => {
      this.reconnect();
    });

    this.currentVmUsers$ = new BehaviorSubject<string[]>([]);
  }

  public startConnection(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${this.apiUrl}/hubs/vm`, {
        accessTokenFactory: () => {
          return this.authService.getAuthorizationToken();
        },
      })
      .withAutomaticReconnect(new RetryPolicy(60, 0, 5))
      .build();

    this.hubConnection.onreconnected(() => {
      this.joinGroups();
    });

    this.addHandlers();
    this.connectionPromise = this.hubConnection.start();
    this.connectionPromise.then(() => this.joinGroups());

    return this.connectionPromise;
  }

  private reconnect() {
    if (this.hubConnection != null) {
      this.hubConnection.stop().then(() => {
        this.connectionPromise = this.hubConnection.start();
        this.connectionPromise.then(() => this.joinGroups());
      });
    }
  }

  private joinGroups() {
    if (this.userId && this.viewId) {
      this.joinUser(this.userId, this.viewId);
    }

    if (this.activeVmId) {
      this.setActiveVirtualMachine(this.activeVmId);
    }
  }

  public joinUser(userId: string, viewId: string) {
    this.userId = userId;
    this.viewId = viewId;

    this.startConnection().then(() => {
      this.hubConnection.invoke('JoinUser', userId, viewId).then((vmUser) => {
        const user = { id: vmUser.userId, name: vmUser.username };
        this.userService.add(user);
        this.userService.setActive(user.id);
        this.vmService.setActive(vmUser.activeVmId);
      });
    });
  }

  public leaveUser(userId: string, viewId: string) {
    this.startConnection().then(() => {
      this.hubConnection.invoke('LeaveUser', userId, viewId);
    });
  }

  public setActiveVirtualMachine(vmId: string) {
    this.activeVmId = vmId;
    this.startConnection().then(() => {
      this.hubConnection.invoke('SetActiveVirtualMachine', vmId);
    });
  }

  public unsetActiveVirtualMachine() {
    this.activeVmId = null;
    this.startConnection().then(() => {
      this.hubConnection.invoke('UnsetActiveVirtualMachine');
    });
  }

  private addHandlers() {
    this.addUserHandlers();
    this.addCurrentUsersHandlers();
  }

  private addUserHandlers() {
    this.hubConnection.on('ActiveVirtualMachine', (vmId: string) => {
      this.vmService.setActive(vmId);
    });
  }

  private addCurrentUsersHandlers() {
    this.hubConnection.on(
      'CurrentVirtualMachineUsers',
      (vmId: string, users: string[]) => {
        this.currentVmUsers$.next(users);
      },
    );
  }
}

class RetryPolicy {
  constructor(
    private maxSeconds: number,
    private minJitterSeconds: number,
    private maxJitterSeconds: number,
  ) {}

  nextRetryDelayInMilliseconds(
    retryContext: signalR.RetryContext,
  ): number | null {
    let nextRetrySeconds = Math.pow(2, retryContext.previousRetryCount + 1);

    if (nextRetrySeconds > this.maxSeconds) {
      nextRetrySeconds = this.maxSeconds;
    }

    nextRetrySeconds +=
      Math.floor(
        Math.random() * (this.maxJitterSeconds - this.minJitterSeconds + 1),
      ) + this.minJitterSeconds; // Add Jitter

    return nextRetrySeconds * 1000;
  }
}
