// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Injectable } from '@angular/core';
import { HubConnection, HubConnectionBuilder } from '@aspnet/signalr';
import { ComnSettingsService } from '@cmusei/crucible-common';
import { BehaviorSubject } from 'rxjs';
import { NotificationData } from '../../models/notification/notification-model';

@Injectable()
export class NotificationService {
  public progressConnection: HubConnection;
  public tasksInProgress = new BehaviorSubject<Array<NotificationData>>(
    new Array<NotificationData>()
  );

  constructor(private settings: ComnSettingsService) {}

  connectToProgressHub(vmString: string, userToken: string) {
    console.log('Starting connection to ProgressHub');
    this.progressConnection = new HubConnectionBuilder()
      .withUrl(
        `${this.settings.settings.ConsoleApiUrl.replace(
          '/api/',
          '/hubs/'
        )}progress?access_token=${userToken}`
      )
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
