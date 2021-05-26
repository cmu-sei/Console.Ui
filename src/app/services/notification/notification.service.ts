// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Inject, Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject } from 'rxjs';
import { BASE_PATH } from '../../generated/vm-api';
import { NotificationData } from '../../models/notification/notification-model';

@Injectable()
export class NotificationService {
  private apiUrl: string;
  public progressConnection: signalR.HubConnection;
  public tasksInProgress = new BehaviorSubject<Array<NotificationData>>(
    new Array<NotificationData>()
  );

  constructor(@Inject(BASE_PATH) basePath: string) {
    this.apiUrl = basePath;
  }

  connectToProgressHub(vmString: string, userToken: string) {
    console.log('Starting connection to ProgressHub');
    this.progressConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${this.apiUrl}/hubs/progress?access_token=${userToken}`)
      .withAutomaticReconnect(new RetryPolicy(60, 0, 5))
      .build();

    this.progressConnection.on('Progress', (data: [NotificationData]) => {
      this.tasksInProgress.next(data);
    });

    this.progressConnection.on('Complete', (data: [NotificationData]) => {
      this.tasksInProgress.next(data);
    });

    this.progressConnection
      .start()
      .then(() => {
        this.progressConnection.invoke('Join', vmString);
        console.log('Progress connection started');
      })
      .catch(() => {
        console.log(
          'Error while establishing Progress connection with the VM Console API.'
        );
        throw new Error(
          'Error while establishing Progress connection with the VM Console API.'
        );
      });
  }
}

class RetryPolicy {
  constructor(
    private maxSeconds: number,
    private minJitterSeconds: number,
    private maxJitterSeconds: number
  ) {}

  nextRetryDelayInMilliseconds(
    retryContext: signalR.RetryContext
  ): number | null {
    let nextRetrySeconds = Math.pow(2, retryContext.previousRetryCount + 1);

    if (nextRetrySeconds > this.maxSeconds) {
      nextRetrySeconds = this.maxSeconds;
    }

    nextRetrySeconds +=
      Math.floor(
        Math.random() * (this.maxJitterSeconds - this.minJitterSeconds + 1)
      ) + this.minJitterSeconds; // Add Jitter

    return nextRetrySeconds * 1000;
  }
}
