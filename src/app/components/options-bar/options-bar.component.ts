// Copyright 2023 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  Input,
  OnDestroy,
  OnInit,
  Pipe,
  PipeTransform,
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { ComnAuthService, ComnSettingsService } from '@cmusei/crucible-common';
import { Observable, Subject } from 'rxjs';
import { take, takeUntil } from 'rxjs/operators';
import { VsphereVirtualMachine } from '../../generated/vm-api';
import { NotificationData } from '../../models/notification/notification-model';
import { IsoResult } from '../../models/vm/iso-result';
import {
  VirtualMachineToolsStatus,
  VmModel,
  VmResolution,
} from '../../models/vm/vm-model';
import { DialogService } from '../../services/dialog/dialog.service';
import { NotificationService } from '../../services/notification/notification.service';
import { SignalRService } from '../../services/signalr/signalr.service';
import { VsphereService } from '../../state/vsphere/vsphere.service';
import { AsyncPipe } from '@angular/common';
import { MatTooltip } from '@angular/material/tooltip';
import { MatIcon } from '@angular/material/icon';
import { MatMenuTrigger, MatMenu, MatMenuItem } from '@angular/material/menu';
import { MatIconButton, MatButton } from '@angular/material/button';

declare var WMKS: any; // needed to check values
const MAX_COPY_RETRIES = 1;

@Pipe({
  name: 'keys',
  standalone: true,
})
export class KeysPipe implements PipeTransform {
  transform(value, args: string[]): any {
    const keys = [];
    for (const key of Object.keys(value)) {
      keys.push({ key: key, value: value[key] });
    }
    return keys;
  }
}
@Component({
  selector: 'app-options-bar',
  templateUrl: './options-bar.component.html',
  styleUrls: ['./options-bar.component.scss'],
  standalone: true,
  imports: [
    MatIconButton,
    MatMenuTrigger,
    MatIcon,
    MatMenu,
    MatMenuItem,
    MatTooltip,
    MatButton,
    AsyncPipe,
    KeysPipe,
  ],
})
export class OptionsBarComponent implements OnInit, OnDestroy {
  @Input() vm: VsphereVirtualMachine;
  @Input() vmId: string;
  @Input() readOnly: boolean;

  opened = false;

  // we could check permissions in api and set this value
  powerOptions = true;
  uploadEnabled = false;
  uploading = false;
  retrievingIsos = false;
  publicIsos: any;
  teamIsos: any;
  tasksInProgress: NotificationData[] = [];
  inFrame: boolean;
  clipBoardText: string;
  virtualMachineToolsStatus: any;
  currentVmContainerResolution: VmResolution;
  vmResolutionsOptions: VmResolution[];
  showConnectedUsers = false;
  currentVmUsers$: Observable<string[]>;
  private isDark = false;
  private copyTryCount: number;
  private destroy$ = new Subject();

  constructor(
    public vmService: VsphereService,
    public settingsService: ComnSettingsService,
    private dialogService: DialogService,
    private notificationService: NotificationService,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar,
    private authService: ComnAuthService,
    private signalrService: SignalRService,
  ) {}

  ngOnInit() {
    this.vmResolutionsOptions = [
      { width: 1600, height: 1200 } as VmResolution,
      { width: 1024, height: 768 } as VmResolution,
      { width: 800, height: 600 } as VmResolution,
    ];

    this.currentVmUsers$ = this.signalrService.currentVmUsers$.asObservable();
    this.virtualMachineToolsStatus = VirtualMachineToolsStatus;
    this.clipBoardText = '';
    this.copyTryCount = 0;
    this.showConnectedUsers = true;

    this.notificationService.tasksInProgress.subscribe((data) => {
      if (!!data && data.length > 0) {
        this.tasksInProgress = <Array<NotificationData>>data;
      }
    });
    this.notificationService.connectToProgressHub(
      this.vmId,
      this.authService.getAuthorizationToken(),
    );

    this.inFrame = this.inIframe();

    this.vmService.vmClipBoard
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (data !== '') {
          this.clipBoardText = data;
          this.writeToClipboard(this.clipBoardText);
          this.copyTryCount = 0;
        }
      });

    this.vmService.vmResolution
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => (this.currentVmContainerResolution = res));
  }

  ngOnDestroy() {
    this.destroy$.next(null);
    this.destroy$.complete();
  }

  inIframe() {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  }

  openInTab() {
    window.open(window.location.href);
  }

  fullscreen() {
    if (this.vmService.wmks.isFullScreen()) {
      // console.log('browser is fullscreen');
    } else if (this.vmService.wmks.canFullScreen()) {
      // console.log('attempting fullscreen');
      this.vmService.wmks.enterFullScreen();
    } else {
      console.log('cannot do fullscreen');
    }
  }

  changeNic(adapter, nic) {
    this.vmService
      .changeNic(this.vmId, adapter, nic)
      .subscribe((model: VmModel) => {
        this.vmService.model = model;
      });
  }

  cad() {
    console.log('sending CAD');
    this.vmService.wmks.sendCAD();
  }

  enableCopyPaste() {
    const data = 'enable copy paste at ' + Date.now().toString();
    const event = (e: ClipboardEvent) => {
      e.clipboardData.setData('text/plain', data);
      e.preventDefault();
      document.removeEventListener('copy', event);
    };
    document.addEventListener('copy', event);
    document.execCommand('copy');
    console.log('enabled copy paste');
  }

  sendInputString() {
    this.dialogService
      .sendText('Enter Text to Send')
      .subscribe((enteredText: any) => {
        if (enteredText.textToSend) {
          this.paste(enteredText.textToSend, enteredText.timeout);
        }
      });
  }

  disconnect() {
    console.log('disconnect requested');
    this.vmService.wmks.disconnect();
  }

  reconnect() {
    console.log('reconnect requested');
    this.disconnect();
    this.connect();
  }

  connect() {
    console.log('connect requested');
    this.vmService.connect(this.vmId, this.readOnly);
  }

  poweron() {
    console.log('poweron requested');
    this.vmService.powerOn(this.vmId);
  }

  poweroff() {
    console.log('poweroff requested');
    this.vmService.powerOff(this.vmId);
  }

  reboot() {
    console.log('reboot requested');
    this.vmService.reBoot(this.vmId);
  }

  shutdownOS() {
    console.log('shutdown OS requested');
    this.vmService.shutdownOS(this.vmId);
  }

  enableFileUpload(title) {
    this.vmService.uploadConfig.username = '';
    this.vmService.uploadConfig.password = '';
    this.vmService.uploadConfig.filepath = '';
    if (
      this.vmService.model.vmToolsStatus !==
        VirtualMachineToolsStatus.toolsOk &&
      this.vmService.model.vmToolsStatus !== VirtualMachineToolsStatus.toolsOld
    ) {
      this.dialogService.message(
        'Alert!',
        'Action requires VMware Tools to be running!',
      );
      this.uploadEnabled = false;
      return;
    }
    // get new credentials and upload path
    this.dialogService.getFileUploadInfo(title).subscribe((enteredInfo) => {
      if (!enteredInfo['username']) {
        return;
      }
      this.vmService.uploadConfig.username = enteredInfo['username'];
      this.vmService.uploadConfig.password = enteredInfo['password'];
      this.vmService.uploadConfig.filepath = enteredInfo['filepath'];
      if (
        !this.vmService.uploadConfig.filepath.endsWith('\\') &&
        !this.vmService.uploadConfig.filepath.endsWith('/')
      ) {
        if (this.vmService.uploadConfig.filepath.includes('\\')) {
          this.vmService.uploadConfig.filepath += '\\';
        } else if (this.vmService.uploadConfig.filepath.includes('/')) {
          this.vmService.uploadConfig.filepath += '/';
        } else {
          this.enableFileUpload('The file path must be an absolute path.');
          return;
        }
      }
      this.vmService.verifyCredentials(this.vmId).subscribe(
        (response) => {
          this.uploadEnabled = true;
        },
        (error: HttpErrorResponse) => {
          // error.error.title contains the relevant message
          this.uploadEnabled = false;
          if (error.error.title.includes('credentials')) {
            this.enableFileUpload('Bad Credentials.  Please try again.');
          } else if (error.error.title.includes('parameter')) {
            this.enableFileUpload('The entered path was not valid.');
          } else {
            this.enableFileUpload('Unhandled error. Please try again.');
          }
        },
      );
    });
  }

  uploadFileToVm(fileSelector) {
    if (fileSelector.value === '') {
      console.log('file selector did not have a value');
      return;
    }
    this.dialogService.message('File Upload in Progress', '', {
      showSpinnner: true,
    });

    this.uploading = true;
    this.vmService.sendFileToVm(this.vmId, fileSelector.files).subscribe(
      (response) => {
        this.dialogService.closeAll();
        this.dialogService.message('File Uploaded Successfully', '');

        fileSelector.value = '';
        this.uploading = false;
        console.log(response);
      },
      (error: HttpErrorResponse) => {
        this.dialogService.closeAll();
        this.dialogService.message(
          'Error Uploading File',
          'Error: ' + error.error.title,
        );

        fileSelector.value = '';
        this.uploading = false;
        console.log(error);
      },
    );
  }

  startIsoMount() {
    // refresh the iso list
    this.retrievingIsos = true;
    this.vmService.getIsos(this.vmId).subscribe(
      (isoResult) => {
        this.retrievingIsos = false;
        this.mountIso(isoResult);
      },
      (error) => {
        console.log(error);
        this.publicIsos = [];
        this.teamIsos = [];
        this.retrievingIsos = false;
      },
    );
  }

  mountIso(isoResult: IsoResult[]) {
    // select the iso
    const configData = {
      width: '600px',
      height: '500px',
    };
    this.dialogService.mountIso(isoResult, configData).subscribe((result) => {
      if (!result) {
        return;
      }
      // mount the iso
      this.vmService
        .mountIso(this.vmId, result.path + result.filename)
        .subscribe(
          // refresh the vm model
          (model: VmModel) => {
            this.vmService.model = model;
          },
        );
    });
  }

  splitIsoList(isoList: any) {
    const viewId = this.route.snapshot.queryParams['viewId'];
    this.teamIsos = [];
    this.publicIsos = [];
    isoList.forEach((isoName) => {
      const start = isoName.lastIndexOf('/') + 1;
      const filename = isoName.substring(start);
      const isoObject = {
        filename: filename,
        path: isoName,
      };
      if (isoName.indexOf('/' + viewId + '/' + viewId + '/') > -1) {
        this.publicIsos.push(isoObject);
      } else {
        this.teamIsos.push(isoObject);
      }
    });
  }

  async writeToClipboard(clipText: string) {
    // If the copyTryCount is 0 then the user did not try to copy from the VM, therefore ignore the broadcast
    if (this.copyTryCount > 0) {
      try {
        await navigator.clipboard.writeText(clipText);
        this.snackBar.open('Copied Virtual Machine Clipboard', 'Ok', {
          duration: 2000,
          verticalPosition: 'top',
        });
      } catch (err) {
        this.dialogService.message(
          'Select text and press Ctrl+C to copy to your local clipboard:',
          clipText,
        );
        console.log('Problem', err);
      }
    }
  }

  async pasteFromClipboard() {
    try {
      const clip = await navigator.clipboard.readText();
      await this.paste(clip);
    } catch (err) {
      // If an error occur trying to read the local clipboard, simply open the input menu.
      this.sendInputString();
    }
  }

  async paste(text: string, timeoutStr: string = '50') {
    const timeout = parseInt(timeoutStr);
    for (const line of text.split('\n')) {
      this.vmService.wmks.sendInputString(line);
      this.vmService.wmks.sendInputString('\n');
      await new Promise((r) => setTimeout(r, timeout));
    }
  }

  copyVmClipboard() {
    this.copyTryCount++;
    console.log('Trying to copy.  Count:  ', this.copyTryCount);
    this.vmService.wmks.grab();
    setTimeout(() => {
      if (this.copyTryCount > MAX_COPY_RETRIES) {
        this.snackBar.open(
          'Copy from VM failed!  Contact an Administrator to verify the Virtual machine is configured properly.',
          'Close',
          {
            duration: 10000,
            verticalPosition: 'top',
          },
        );
        this.copyTryCount = 0;
      } else if (
        this.copyTryCount > 0 &&
        this.copyTryCount <= MAX_COPY_RETRIES
      ) {
        console.log('Retry of copy');
        this.copyVmClipboard();
      }
    }, 2000);
  }

  setResolution(vmResolution: VmResolution) {
    console.log('Setting Resolution:  ', vmResolution);
    this.vmService
      .setResolution(this.vmId, vmResolution)
      .pipe(take(1))
      .subscribe();
  }

  formatConnectedUser(users: string[] = null): string {
    const MAX_USERS = 2;
    let output = '';
    let count = 0;
    if (users && users.length > 0) {
      for (const u of users) {
        if (count >= MAX_USERS) {
          output +=
            ' and ' + (users.length - MAX_USERS).toString() + 'others...';
          break;
        }
        output += u + ', ';
        count++;
      }

      output = output.slice(0, -2); // trim last comma
    }
    if (count > 0) {
      output = 'Connected: ' + output;
    }
    return output;
  }

  formatConnectedUserToolTip(users: string[] = null): string {
    return users.toString().replace(/,/g, '\n');
  }
}
