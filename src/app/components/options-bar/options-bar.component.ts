// Copyright 2023 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  Input,
  OnDestroy,
  OnInit,
  Pipe,
  PipeTransform,
  signal,
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { ComnSettingsService } from '@cmusei/crucible-common';
import { Observable, of, Subject } from 'rxjs';
import {
  catchError,
  filter,
  map,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs/operators';
import {
  AppViewPermission,
  VsphereVirtualMachine,
} from '../../generated/vm-api';
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
import { AsyncPipe, NgIf } from '@angular/common';
import { MatTooltip } from '@angular/material/tooltip';
import { MatIcon } from '@angular/material/icon';
import { MatMenuTrigger, MatMenu, MatMenuItem } from '@angular/material/menu';
import { MatIconButton, MatButton } from '@angular/material/button';
import {
  MatSlideToggleChange,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { MatLabel } from '@angular/material/form-field';
import { VmService } from '../../state/vm/vm.service';
import { UserPermissionsService } from '../../services/user-permissions/user-permissions.service';

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
    MatSlideToggleModule,
    MatLabel,
    NgIf,
  ],
})
export class OptionsBarComponent implements OnInit, OnDestroy {
  @Input() vm: VsphereVirtualMachine;
  @Input() vmId: string;
  @Input() readOnly: boolean;
  @Input() allowReadOnlyToggle: boolean;

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

  private copyTryCount: number;
  private destroy$ = new Subject();

  canDownloadVmFiles$ = this.userPermissionsService.can(
    null,
    AppViewPermission.DownloadVmFiles,
  );
  canUploadVmFiles$ = this.userPermissionsService.can(
    null,
    AppViewPermission.UploadVmFiles,
  );
  canRevertSnapshots$ = this.userPermissionsService.can(
    null,
    AppViewPermission.RevertVms,
  );

  private refreshNetworks = signal(0); // remove after refactoring to signals everywhere

  availableNetworksSorted = computed(() => {
    this.refreshNetworks();

    const all = this.vsphereService.model.networkCards.availableNetworks;
    const current = this.vsphereService.model.networkCards.currentNetworks;

    return Object.entries(current).map(([key, selected]) => ({
      key,
      sorted: [selected, ...all.filter((n) => n !== selected)],
    }));
  });

  constructor(
    public vsphereService: VsphereService,
    public settingsService: ComnSettingsService,
    private dialogService: DialogService,
    private notificationService: NotificationService,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar,
    private signalrService: SignalRService,
    private vmService: VmService,
    private userPermissionsService: UserPermissionsService,
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
    this.notificationService.connectToProgressHub(this.vmId);

    this.inFrame = this.inIframe();

    this.vsphereService.vmClipBoard
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (data !== '') {
          this.clipBoardText = data;
          this.writeToClipboard(this.clipBoardText);
          this.copyTryCount = 0;
        }
      });

    this.vsphereService.vmResolution
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
    if (this.vsphereService.wmks.isFullScreen()) {
      // console.log('browser is fullscreen');
    } else if (this.vsphereService.wmks.canFullScreen()) {
      // console.log('attempting fullscreen');
      this.vsphereService.wmks.enterFullScreen();
    } else {
      console.log('cannot do fullscreen');
    }
  }

  changeNic(adapter, nic) {
    this.vsphereService
      .changeNic(this.vmId, adapter, nic)
      .subscribe((model: VmModel) => {
        this.vsphereService.model = model;
        this.refreshNetworks.update((v) => v + 1);
      });
  }

  cad() {
    console.log('sending CAD');
    this.vsphereService.wmks.sendCAD();
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
    this.vsphereService.disconnect();
  }

  reconnect() {
    console.log('reconnect requested');
    this.disconnect();
    this.connect();
  }

  connect() {
    console.log('connect requested');
    this.vsphereService.connect(this.vmId, this.readOnly);
  }

  poweron() {
    console.log('poweron requested');
    this.vsphereService.powerOn(this.vmId);
  }

  poweroff() {
    console.log('poweroff requested');
    this.vsphereService.powerOff(this.vmId);
  }

  reboot() {
    console.log('reboot requested');
    this.vsphereService.reBoot(this.vmId);
  }

  shutdownOS() {
    console.log('shutdown OS requested');
    this.vsphereService.shutdownOS(this.vmId);
  }

  revert() {
    console.log('revert requested');
    this.dialogService
      .confirm({
        title: 'Revert Vm',
        message: 'Are you sure you want to revert this Vm?',
      })
      .pipe(
        filter((confirmed) => confirmed === true),
        // Switch to the revert service call
        switchMap(() => this.vsphereService.revert(this.vmId)),
        tap(() => this.dialogService.message('Revert Vm', 'Revert Successful')),
        catchError((error) => {
          this.dialogService.message('Revert Vm', 'Revert Failed');
          return of(error);
        }),
      )
      .subscribe();
  }

  enableFileUpload(title) {
    this.vsphereService.uploadConfig.username = '';
    this.vsphereService.uploadConfig.password = '';
    this.vsphereService.uploadConfig.filepath = '';
    if (
      this.vsphereService.model.vmToolsStatus !==
        VirtualMachineToolsStatus.toolsOk &&
      this.vsphereService.model.vmToolsStatus !==
        VirtualMachineToolsStatus.toolsOld
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
      this.vsphereService.uploadConfig.username = enteredInfo['username'];
      this.vsphereService.uploadConfig.password = enteredInfo['password'];
      this.vsphereService.uploadConfig.filepath = enteredInfo['filepath'];
      if (
        !this.vsphereService.uploadConfig.filepath.endsWith('\\') &&
        !this.vsphereService.uploadConfig.filepath.endsWith('/')
      ) {
        if (this.vsphereService.uploadConfig.filepath.includes('\\')) {
          this.vsphereService.uploadConfig.filepath += '\\';
        } else if (this.vsphereService.uploadConfig.filepath.includes('/')) {
          this.vsphereService.uploadConfig.filepath += '/';
        } else {
          this.enableFileUpload('The file path must be an absolute path.');
          return;
        }
      }
      this.vsphereService.verifyCredentials(this.vmId).subscribe(
        () => {
          this.uploadEnabled = true;
          this.dialogService.message('Credentials Verified', '');
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
    this.vsphereService.sendFileToVm(this.vmId, fileSelector.files).subscribe(
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

  downloadFileFromVm() {
    this.dialogService
      .getFileUploadInfo('Download File Settings', {
        data: { showCredentials: false },
      })
      .subscribe((enteredInfo) => {
        const filePath = enteredInfo['filepath'];
        this.vsphereService.getVmFileUrl(this.vmId, filePath).subscribe((x) => {
          const link = document.createElement('a');
          link.href = x.url;
          link.download = x.fileName;
          link.click();
        });
      });
  }

  startIsoMount() {
    // refresh the iso list
    this.retrievingIsos = true;
    this.vsphereService.getIsos(this.vmId).subscribe(
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
      this.vsphereService
        .mountIso(this.vmId, result.path + result.filename)
        .subscribe(
          // refresh the vm model
          (model: VmModel) => {
            this.vsphereService.model = model;
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
      this.vsphereService.wmks.sendInputString(line);
      this.vsphereService.wmks.sendInputString('\n');
      await new Promise((r) => setTimeout(r, timeout));
    }
  }

  copyVmClipboard() {
    this.copyTryCount++;
    console.log('Trying to copy.  Count:  ', this.copyTryCount);
    this.vsphereService.wmks.grab();
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
    this.vsphereService
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

  toggleReadOnly(event: MatSlideToggleChange) {
    this.vmService.setReadOnly(event.checked);
  }
}
