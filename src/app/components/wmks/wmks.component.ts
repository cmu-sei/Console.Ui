// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
} from '@angular/core';
import { interval } from 'rxjs';
import { startWith, takeWhile } from 'rxjs/operators';
import { VmResolution } from '../../models/vm/vm-model';
import { VmService } from '../../services/vm/vm.service';

declare var WMKS: any; // needed to check values

@Component({
  selector: 'app-wmks',
  templateUrl: './wmks.component.html',
  styleUrls: ['./wmks.component.scss'],
})
export class WmksComponent implements OnInit {
  @ViewChild('wmksContainer') wmksContainer: ElementRef;

  public progressMessage = 'Loading ...';
  public isDone = false;

  constructor(public vmService: VmService) {}

  ngOnInit() {
    // This interval will fire every 5 seconds
    interval(5000)
      .pipe(
        startWith(0),
        takeWhile(() => !this.isDone)
      )
      .subscribe(() => this.checkConnected());
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
      this.vmService.connect(this.vmService.model.id);
      console.log('The vm state is ' + this.vmService.model.state);
    } else {
      console.log('Connected');
      this.progressMessage = 'Loading ...';
      const state = this.vmService.wmks.getConnectionState();

      if (state === WMKS.CONST.ConnectionState.DISCONNECTED) {
        this.vmService.connect(this.vmService.model.id);
      }
      this.isDone = true;
      this.onResize();
    }
  }

  @HostListener('window:resize')
  onResize() {
    const vmContainerRes = {
      width: this.wmksContainer.nativeElement.offsetWidth,
      height: this.wmksContainer.nativeElement.offsetHeight,
    } as VmResolution;

    this.vmService.vmResolution.next(vmContainerRes);
  }
}
