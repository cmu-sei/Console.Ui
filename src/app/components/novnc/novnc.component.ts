/*
Copyright 2021 Carnegie Mellon University. All Rights Reserved. 
 Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
*/

import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NoVNCService } from '../../services/novnc/novnc.service';
import { AsyncPipe } from '@angular/common';
import { ComnAuthQuery } from '@cmusei/crucible-common';

@Component({
    selector: 'app-novnc',
    templateUrl: './novnc.component.html',
    styleUrls: ['./novnc.component.scss'],
    imports: [AsyncPipe]
})
export class NovncComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() ticket: string;
  @Input() url: string;
  @Input() readOnly = false;

  @Output() reconnect = new EventEmitter<number>();

  private isConnectedSubject = new BehaviorSubject(false);
  public isConnected$ = this.isConnectedSubject.asObservable();
  private set isConnected(val: boolean) {
    this.isConnectedSubject.next(val);
  }

  private failedConnectionAttempts = 0;
  private backgroundColor: string;
  private unsubscribe$ = new Subject();
  private viewInitialized = false;
  private destroyed = false;

  @ViewChild('screen') screen: ElementRef;

  constructor(
    private novncService: NoVNCService,
    private authQuery: ComnAuthQuery,
  ) {}

  ngAfterViewInit() {
    this.viewInitialized = true;

    this.backgroundColor = getComputedStyle(
      this.screen.nativeElement,
    ).backgroundColor;

    // The parent may render this component with a url and ticket already set, so the first
    // ngOnChanges runs before the #screen element exists. Connect here instead.
    if (this.url && this.ticket) {
      this.startClient(this.url, this.ticket);
    }

    // Listen for theme changes and update noVNC background
    this.authQuery.userTheme$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(() => {
        this.backgroundColor = getComputedStyle(
          this.screen.nativeElement,
        ).backgroundColor;
        this.novncService.updateBackground(this.backgroundColor);
      });
  }

  ngOnDestroy() {
    this.unsubscribe$.next(null);
    this.unsubscribe$.complete();

    // A parent may swap this component out for a placeholder while it is still connected, so
    // close the RFB session rather than leaving an orphaned websocket behind.
    this.destroyed = true;
    this.novncService.disconnect();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      this.viewInitialized &&
      this.url &&
      this.ticket &&
      (changes['url'] || changes['ticket'])
    ) {
      this.startClient(this.url, this.ticket);
    }

    if (changes['readOnly']) {
      this.novncService.setViewOnly(this.readOnly);
    }
  }

  startClient(url: string, ticket: string) {
    this.novncService.startClient(
      url,
      ticket,
      'screen',
      this.readOnly,
      this.backgroundColor,
    );

    this.novncService.setConnectListener(this.connected.bind(this));
    this.novncService.setDisconnectListener(this.disconnected.bind(this));
    this.novncService.setSecurityFailureListener(
      this.securityFailure.bind(this),
    );
    this.novncService.setClipboardListener(this.clipboardEvent.bind(this));
  }

  connected(e) {
    this.isConnected = true;
    this.failedConnectionAttempts = 0;
  }

  // This function is called when we are disconnected
  disconnected(e) {
    this.isConnected = false;

    if (this.destroyed) {
      // We closed the session ourselves on teardown. Asking the parent to reconnect a console
      // it has already replaced would restart its retry cycle for no reason.
      return;
    }

    this.failedConnectionAttempts++;
    this.reconnect.emit(this.failedConnectionAttempts);

    if (e.detail.clean) {
      console.log('Disconnected');
    } else {
      console.log('Something went wrong, connection is closed');
      console.log(e);
    }
  }

  securityFailure(e) {
    console.log(e);
  }

  async clipboardEvent(e) {
    console.log(e);
    await navigator.clipboard.writeText(e.detail.text);
  }
}
