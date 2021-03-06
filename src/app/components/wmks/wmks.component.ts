// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import {
  Component,
  ElementRef,
  HostListener,
  Input,
  ViewChild,
} from '@angular/core';
import { interval, Subscription } from 'rxjs';
import { startWith, takeWhile } from 'rxjs/operators';
import { VmResolution } from '../../models/vm/vm-model';
import { VmService } from '../../state/vm/vm.service';

declare var WMKS: any; // needed to check values

@Component({
  selector: 'app-wmks',
  templateUrl: './wmks.component.html',
  styleUrls: ['./wmks.component.scss'],
})
export class WmksComponent {
  @Input() readOnly: boolean;

  @Input() set vmId(value: string) {
    this.setVmId(value);
  }

  get vmId(): string {
    return this._vmId;
  }

  _vmId: string;

  connectTimerSubscription: Subscription;

  @ViewChild('wmksContainer') wmksContainer: ElementRef;

  public progressMessage = 'Loading ...';
  public isDone = false;
  public showWmks = true;

  constructor(public vmService: VmService) {}

  private setVmId(value: string) {
    if (this.connectTimerSubscription != null) {
      this.connectTimerSubscription.unsubscribe();
    }

    if (this.vmService.wmks != null) {
      this.vmService.wmks.unregister();
      this.vmService.wmks.disconnect();
      this.vmService.wmks = null;
    }

    // destroy and re-create the wmksContainer
    this.showWmks = false;
    this.showWmks = true;

    this._vmId = value;
    this.isDone = false;

    this.connect();
  }

  private connect() {
    // This interval will fire every 5 seconds
    const connectTimer$ = interval(5000).pipe(
      startWith(0),
      takeWhile(() => !this.isDone)
    );

    this.connectTimerSubscription = connectTimer$.subscribe(() => {
      if (this.readOnly != null) {
        this.checkConnected();
      }
    });
  }

  private checkConnected() {
    this.progressMessage = this.progressMessage + '...';
    if (!this.vmService.wmks) {
      if (this.vmService.model.state === '0') {
        this.progressMessage = 'The VM Console API is currently not reachable.';
        this.isDone = true;
      } else if (this.progressMessage.startsWith('The VM API')) {
        this.progressMessage = 'Loading ...';
      }
      this.vmService.connect(this.vmId, this.readOnly);
      console.log('The vm state is ' + this.vmService.model.state);
    } else {
      console.log('Connected');
      this.progressMessage = 'Loading ...';
      const state = this.vmService.wmks.getConnectionState();
      console.log('state=' + state);

      if (state === WMKS.CONST.ConnectionState.DISCONNECTED) {
        this.vmService.connect(this.vmId, this.readOnly);
      }

      this.isDone = true;
      this.onResize();
    }
  }

  @HostListener('window:resize')
  onResize() {
    if (this.wmksContainer != null) {
      const vmContainerRes = {
        width: this.wmksContainer.nativeElement.offsetWidth,
        height: this.wmksContainer.nativeElement.offsetHeight,
      } as VmResolution;

      this.vmService.vmResolution.next(vmContainerRes);

      if (this.vmService.wmks) {
        this.vmService.wmks.updateScreen();
      }
    }
  }
}
