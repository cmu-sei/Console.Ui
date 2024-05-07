/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { BehaviorSubject, interval, Observable } from 'rxjs';
import { filter, map, startWith, take, takeWhile, tap } from 'rxjs/operators';
import {
  BASE_PATH,
  ChangeVsphereVirtualMachineNetwork,
  MountVsphereIso,
  SetVsphereVirtualMachineResolution,
  ValidateVsphereVirtualMachineCredentials,
  VsphereService as ApiVsphereService,
  VsphereVirtualMachine,
} from '../../generated/vm-api';
import { IsoResult } from '../../models/vm/iso-result';
import {
  VirtualMachineToolsStatus,
  VmResolution,
} from '../../models/vm/vm-model';
import { VmStore } from './vsphere.store';
import { ComnSettingsService } from '@cmusei/crucible-common';
import { VmService } from '../vm/vm.service';

declare var WMKS: any; // needed to check values

@Injectable({ providedIn: 'root' })
export class VsphereService {
  public wmks;
  public model = {} as VsphereVirtualMachine;
  public showLoading = true;
  public showPower = false;
  public showPoweringOff = false;
  public showError = false;
  public showLock = false;
  public uploadConfig: any = {
    username: '',
    password: '',
    filepath: '',
  };

  public vmClipBoard = new BehaviorSubject<string>('');
  public vmResolution = new BehaviorSubject<VmResolution>({
    width: 1024,
    height: 768,
  });

  private connectedSubject = new BehaviorSubject<boolean>(false);

  public connectionStatus$ = this.connectedSubject.asObservable().pipe(
    map((x) => {
      return { connected: x };
    }),
  );
  public connected$ = this.connectedSubject.asObservable().pipe(
    filter((x) => x),
    map(() => true),
  );
  public disconnected$ = this.connectedSubject.asObservable().pipe(
    filter((x) => !x),
    map(() => true),
  );

  private apiUrl: string;
  private readOnlyObserver: MutationObserver;
  private pointerEvents;
  private tabIndex;

  constructor(
    private http: HttpClient,
    private vsphereService: ApiVsphereService,
    private vmStore: VmStore,
    public settingsService: ComnSettingsService,
    private vmService: VmService,
    @Inject(BASE_PATH) basePath: string,
  ) {
    this.apiUrl = basePath;

    this.vmService.readOnly$
      .pipe(
        tap((readOnly) => {
          this.setReadOnly(readOnly);
        }),
      )
      .subscribe();
  }

  add(vm: VsphereVirtualMachine) {
    this.vmStore.add(vm);
  }

  update(id, vm: Partial<VsphereVirtualMachine>) {
    this.vmStore.update(id, vm);
  }

  remove(id: string) {
    this.vmStore.remove(id);
  }

  setActive(id: string) {
    this.vmStore.setActive(id);
  }

  public getVm(id: string): Observable<VsphereVirtualMachine> {
    return this.vsphereService
      .getVsphereVirtualMachine(id)
      .pipe(tap((vm) => this.vmStore.upsert(id, vm)));
  }

  public sendPowerOn(id: string) {
    return this.vsphereService.powerOnVsphereVirtualMachine(id);
  }

  public sendPowerOff(id: string) {
    return this.vsphereService.powerOffVsphereVirtualMachine(id);
  }

  public sendReboot(id: string) {
    return this.vsphereService.rebootVsphereVirtualMachine(id);
  }

  public sendShutdownOS(id: string) {
    return this.vsphereService.shutdownVsphereVirtualMachine(id);
  }

  public checkForVmTools(id: string) {
    return this.vsphereService
      .getVsphereVirtualMachineToolsStatus(id)
      .pipe(tap((x) => this.vmStore.update(id, { vmToolsStatus: x })));
  }

  public verifyCredentials(id: string) {
    const data: ValidateVsphereVirtualMachineCredentials = {
      username: this.uploadConfig.username,
      password: this.uploadConfig.password,
      filePath: this.uploadConfig.filepath,
    };

    return this.vsphereService.validateVsphereVirtualMachineCredentials(
      id,
      data,
    );
  }

  public sendFileToVm(id: string, files: FileList) {
    const formData: FormData = new FormData();
    formData.append('username', this.uploadConfig.username);
    formData.append('password', this.uploadConfig.password);
    formData.append('filepath', this.uploadConfig.filepath);
    for (let i = 0; i < files.length; i++) {
      formData.append(files[i].name, files[i]);
    }
    console.log('sending ' + files.length.toString() + ' files to the api');
    return this.http.post(
      `${this.apiUrl}/api/vms/vsphere/${id}/actions/upload-file`,
      formData,
    );
  }

  public changeNic(id: string, adapter: string, nic: string) {
    const data: ChangeVsphereVirtualMachineNetwork = {
      adapter: adapter,
      network: nic,
    };
    return this.vsphereService.changeVsphereVirtualMachineNetwork(id, data);
  }

  public async connect(id: string, readOnly: boolean) {
    console.log('Attempting to connect to vm');

    this.getVm(id)
      .pipe(take(1))
      .subscribe(
        (model) => {
          this.model = model;

          // console.log('got vm model');
          if (model.state === 'error') {
            console.log('could not get power state');
            this.showError = true;
            this.showPower = false;
            this.showPoweringOff = false;
            this.showLoading = false;
            return;
          } else if (model.state === 'off') {
            this.showError = false;
            this.showPower = true;
            this.showPoweringOff = false;
            this.showLoading = false;
            // console.log('vm is off');
            return;
          } else if (model.state === '') {
            this.showError = false;
            this.showPower = false;
            this.showPoweringOff = false;
            this.showLoading = true;
            // console.log('vm is off');
            return;
          } else if (model.state === 'on') {
            this.showError = false;
            this.showPower = false;
            this.showPoweringOff = false;
            this.showLoading = true;
            // console.log('vm is on');
          }

          if (this.model.ticket) {
            this.CreateWmks();
            this.setReadOnly(readOnly);
            const state = this.wmks.getConnectionState();
            if (state === WMKS.CONST.ConnectionState.DISCONNECTED) {
              // console.log('connecting to ' + this.model.ticket);
              this.wmks.connect(this.model.ticket);
            }
            // ticket is one time use so unset it
            this.model.ticket = null;
            this.showLoading = false;
          }
        },
        (error) => {
          this.model.name = 'Virtual Machine';
          this.model.id = id; // make sure that we dont lose the id
          this.model.state = error.message;
        },
      );
  }

  public setReadOnly(value: boolean) {
    const elem = document.getElementById('mainCanvas');

    if (elem && value) {
      this.pointerEvents = elem.style.pointerEvents;
      this.tabIndex = elem.tabIndex;

      elem.style.pointerEvents = 'none';
      elem.tabIndex = -1;

      this.readOnlyObserver = new MutationObserver((mutations) => {
        mutations.forEach((m) => {
          if (
            m.attributeName === 'style' &&
            elem.style.pointerEvents !== 'none'
          ) {
            elem.style.pointerEvents = 'none';
          } else if (m.attributeName === 'tabindex' && elem.tabIndex !== -1) {
            elem.tabIndex = -1;
          }
        });
      });

      this.readOnlyObserver.observe(elem, {
        attributes: true,
        attributeFilter: ['style', 'tabindex'],
      });
    } else if (this.readOnlyObserver) {
      this.readOnlyObserver.disconnect();
      elem.style.pointerEvents = this.pointerEvents;
      elem.tabIndex = this.tabIndex;
    }
  }

  public CreateWmks() {
    this.wmks = WMKS.createWMKS('wmksContainer', {
      changeResolution: this.model.isOwner,
      rescale: true,
      position: WMKS.CONST.Position.CENTER,
      retryConnectionInterval:
        this.settingsService.settings.WMKS.RetryConnectionInterval,
    });

    this.wmks.register(
      WMKS.CONST.Events.CONNECTION_STATE_CHANGE,
      (event: any, data: any) => {
        console.log('Connection State:  ' + data.state);
        if (data.state === WMKS.CONST.ConnectionState.CONNECTED) {
          // console.log('connection state change : connected');
          this.showLoading = false;
          this.showPower = false;
          this.showPoweringOff = false;
          this.showError = false;
          this.showLock = false;
          this.model.vmToolsStatus = VirtualMachineToolsStatus.toolsNotRunning;
          this.connectedSubject.next(true);

          interval(10000)
            .pipe(
              startWith(0),
              takeWhile(
                () =>
                  this.model.vmToolsStatus ===
                  VirtualMachineToolsStatus.toolsNotRunning,
              ),
            )
            .subscribe(() => {
              this.checkForVmTools(this.model.id)
                .pipe(take(1))
                .subscribe((val) => {
                  this.model.vmToolsStatus = val as VirtualMachineToolsStatus;
                });
            });
        } else if (data.state === WMKS.CONST.ConnectionState.CONNECTING) {
          // console.log('connection state change : connecting');
          this.showLoading = true;
          this.showPower = false;
          this.showPoweringOff = false;
          this.showError = false;
          this.showLock = false;
        } else if (data.state === WMKS.CONST.ConnectionState.DISCONNECTED) {
          this.disconnect();
          this.showPoweringOff = false;
          this.showError = false;
          this.showLock = false;
          this.connectedSubject.next(false);
          console.log('disconnect complete');
        }
      },
    );

    // Register the COPY event from the VM.
    this.wmks.register(WMKS.CONST.Events.COPY, (event: any, data: string) => {
      if (data) {
        this.vmClipBoard.next(data);
      }
    });
  }

  public powerOn(id: string) {
    this.sendPowerOn(id).subscribe(
      (response) => {
        // console.log(response);
        if (response === 'poweron submitted') {
          console.log('poweron submitted');
        } else if (response === 'already on') {
          console.log('already powered on');
        } else if (response === 'poweron error') {
          console.log('poweron error received');
        }
      },
      () => {
        console.log('error sending poweron console API');
      },
    );
  }

  public powerOff(id: string) {
    this.sendPowerOff(id).subscribe(
      (response) => {
        if (response === 'poweroff submitted') {
          this.showPoweringOff = true;
        } else if (response === 'already off') {
        } else if (response === 'poweroff error') {
          console.log('poweroff error received');
        }
      },
      () => {
        console.log('error sending poweroff to console API');
      },
    );
  }

  public reBoot(id: string) {
    // console.log('reboot requested');
    this.sendReboot(id).subscribe(
      () => {
        // console.log(response);
      },
      () => {
        console.log('error sending reboot to console API');
        this.model.ticket = null;
      },
    );
  }

  public shutdownOS(id: string) {
    this.sendShutdownOS(id).subscribe(
      (response) => {
        console.log(response);
      },
      () => {
        console.log('error sending reboot to console API');
        this.model.ticket = null;
      },
    );
  }

  public getUploadConfig(): Observable<any> {
    return this.uploadConfig.asObservable();
  }

  public getIsos(id: string): Observable<IsoResult[]> {
    return this.vsphereService.getVsphereVirtualMachineIsos(id) as Observable<
      IsoResult[]
    >;
  }

  public mountIso(id: string, iso: string) {
    const data: MountVsphereIso = { iso: iso };
    return this.vsphereService.mountVsphereVirtualMachineIso(id, data);
  }

  public setResolution(id: string, resolution: VmResolution) {
    const data: SetVsphereVirtualMachineResolution = {
      height: resolution.height,
      width: resolution.width,
    };
    return this.vsphereService.setVsphereVirtualMachineResolution(id, data);
  }

  public disconnect() {
    if (this.wmks != null) {
      this.wmks.unregister();
      this.wmks.disconnect();
      this.wmks.destroy();
      this.wmks = null;
    }

    this.connectedSubject.next(false);
  }
}
