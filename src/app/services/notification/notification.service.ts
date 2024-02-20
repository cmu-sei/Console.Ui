// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Inject, Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject } from 'rxjs';
import { BASE_PATH } from '../../generated/vm-api';
import { NotificationData } from '../../models/notification/notification-model';
import { ComnAuthService } from '@cmusei/crucible-common';

@Injectable()
export class NotificationService {
  private hubConnection: signalR.HubConnection;
  private connectionPromise: Promise<void>;

  private vmId: string;
  private apiUrl: string;

  public tasksInProgress = new BehaviorSubject<Array<NotificationData>>(
    new Array<NotificationData>(),
  );

  constructor(
    private authService: ComnAuthService,
    @Inject(BASE_PATH) basePath: string,
  ) {
    this.apiUrl = basePath;

    this.authService.user$.subscribe(() => {
      this.reconnect();
    });
  }

  connectToProgressHub(vmId: string) {
    this.vmId = vmId;

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    console.log('Starting connection to ProgressHub');
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${this.apiUrl}/hubs/progress`, {
        accessTokenFactory: () => {
          return this.authService.getAuthorizationToken();
        },
      })
      .withAutomaticReconnect(new RetryPolicy(60, 0, 5))
      .build();

    this.hubConnection.on('Progress', (data: [NotificationData]) => {
      this.tasksInProgress.next(data);
    });

    this.hubConnection.on('Complete', (data: [NotificationData]) => {
      this.tasksInProgress.next(data);
    });

    this.connectionPromise = this.hubConnection.start();
    this.connectionPromise
      .then(() => {
        this.joinGroups();
      })
      .catch(() => {
        console.log(
          'Error while establishing Progress connection with the VM Console API.',
        );
        throw new Error(
          'Error while establishing Progress connection with the VM Console API.',
        );
      });

    return this.connectionPromise;
  }

  private joinGroups() {
    if (this.vmId) {
      this.hubConnection.invoke('Join', this.vmId);
      console.log('Progress connection started');
    }
  }

  private reconnect() {
    if (this.hubConnection != null) {
      this.hubConnection.stop().then(() => {
        this.connectionPromise = this.hubConnection.start();
        this.connectionPromise.then(() => this.joinGroups());
      });
    }
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
