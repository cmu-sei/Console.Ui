import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { NoVNCService } from '../../services/novnc/novnc.service';

@Component({
  selector: 'app-novnc',
  templateUrl: './novnc.component.html',
  styleUrls: ['./novnc.component.scss'],
})
export class NovncComponent implements OnChanges, AfterViewInit {
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

  @ViewChild('screen') screen: ElementRef;

  constructor(private novncService: NoVNCService) {}

  ngAfterViewInit() {
    this.backgroundColor = getComputedStyle(
      this.screen.nativeElement
    ).backgroundColor;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.url && this.ticket && (changes['url'] || changes['ticket'])) {
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
      this.backgroundColor
    );

    this.novncService.setConnectListener(this.connected.bind(this));
    this.novncService.setDisconnectListener(this.disconnected.bind(this));
    this.novncService.setSecurityFailureListener(
      this.securityFailure.bind(this)
    );
  }

  connected(e) {
    this.isConnected = true;
    this.failedConnectionAttempts = 0;
  }

  // This function is called when we are disconnected
  disconnected(e) {
    this.isConnected = false;
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
}
