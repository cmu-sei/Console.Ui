/*
Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
*/

import {
  Component,
  ChangeDetectionStrategy,
  Input,
  computed,
  linkedSignal,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ProxmoxVirtualMachine,
  Vm,
  VmType,
  VsphereVirtualMachine,
} from '../../generated/vm-api';
import { PowerAction, VmService } from '../../state/vm/vm.service';
import {
  ComnAuthQuery,
  ComnAuthService,
  CrucibleDialogService,
  Theme,
} from '@cmusei/crucible-common';
import { catchError, filter, startWith, switchMap, take } from 'rxjs/operators';
import { MatIcon } from '@angular/material/icon';
import { MatMenuTrigger, MatMenu, MatMenuItem } from '@angular/material/menu';
import { MatIconButton } from '@angular/material/button';
import {
  MatSlideToggleChange,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { MatLabel } from '@angular/material/form-field';
import { AsyncPipe } from '@angular/common';
import { MatTooltip } from '@angular/material/tooltip';
import { ProxmoxService } from '../../services/proxmox/proxmox.service';
import { DialogService } from '../../services/dialog/dialog.service';
import { IsoFile, IsoResult } from '../../models/vm/iso-result';
import { VsphereService } from '../../state/vsphere/vsphere.service';
import { EMPTY, Observable, of } from 'rxjs';

type NetworkVirtualMachine = ProxmoxVirtualMachine | VsphereVirtualMachine;

@Component({
  selector: 'app-options-bar2',
  templateUrl: './options-bar2.component.html',
  styleUrls: ['./options-bar2.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIconButton,
    MatMenuTrigger,
    MatIcon,
    MatMenu,
    MatMenuItem,
    MatSlideToggleModule,
    MatLabel,
    AsyncPipe,
    MatTooltip,
  ],
})
export class OptionsBar2Component {
  // Generic Options Bar - Will eventually replace OptionsBarComponent

  private readonly vmState = signal<Vm | null>(null);
  private readonly loadedNetworkVmState = toSignal(
    toObservable(this.vmState).pipe(
      switchMap((vm) => {
        if (!vm?.id) {
          return of(null);
        }

        return this.getNetworkVm(vm, vm.id).pipe(
          startWith(null),
          catchError(() => of(null)),
        );
      }),
    ),
    { initialValue: null },
  );
  private readonly networkVmState = linkedSignal(() =>
    this.loadedNetworkVmState(),
  );
  public readonly networkSearch = signal<Record<string, string>>({});

  @Input()
  set vm(value: Vm | null | undefined) {
    this.vmState.set(value ?? null);
  }

  get vm(): Vm | null {
    return this.vmState();
  }

  @Input() readOnly = false;

  constructor(
    private vmService: VmService,
    private authService: ComnAuthService,
    private authQuery: ComnAuthQuery,
    private crucibleDialogService: CrucibleDialogService,
    private snackBar: MatSnackBar,
    private proxmoxService: ProxmoxService,
    private vsphereService: VsphereService,
    private dialogService: DialogService,
  ) {}

  theme$ = this.authQuery.userTheme$;

  public readonly networkCards = computed(
    () => this.networkVmState()?.networkCards,
  );

  public readonly canAccessNicConfiguration = computed(
    () => this.networkVmState()?.canAccessNicConfiguration === true,
  );

  // Set by the API only where the Vm can actually take an ISO: a QEMU guest on an install that has
  // Proxmox ISO storage configured. Absent on a vSphere response, which keeps its Mount ISO control
  // in the original options bar.
  public readonly canMountIso = computed(
    () =>
      (this.networkVmState() as ProxmoxVirtualMachine)?.canMountIso === true,
  );

  public readonly retrievingIsos = signal(false);

  public readonly networkMenuItems = computed(() => {
    const cards = this.networkCards();
    if (!cards?.currentNetworks || !cards.availableNetworks) {
      return [];
    }

    const readOnly = new Set(cards.readOnlyNetworks || []);
    const networks = Object.entries(cards.availableNetworks).map(
      ([ref, name]) => ({
        ref,
        name: name || ref,
        readOnly: readOnly.has(ref),
      }),
    );

    return Object.entries(cards.currentNetworks).map(([key, currentRef]) => {
      const current = networks.find((network) => network.ref === currentRef);
      const others = networks.filter(
        (network) => network.ref !== currentRef && !network.readOnly,
      );
      const ordered = current ? [current, ...others] : others;
      const search = (this.networkSearch()[key] || '').trim().toLowerCase();

      return {
        key,
        currentRef,
        networks: search
          ? ordered.filter((network) =>
              network.name.toLowerCase().includes(search),
            )
          : ordered,
      };
    });
  });

  public changeNic(adapter: string, network: string) {
    const cards = this.networkCards();
    const currentRef = cards?.currentNetworks?.[adapter];
    const readOnly = new Set(cards?.readOnlyNetworks || []);

    const vm = this.vmState();
    if (!cards || !vm?.id || network === currentRef) {
      return;
    }

    const performChange = () => {
      this.changeNetwork(vm, vm.id, adapter, network)
        .pipe(take(1))
        .subscribe((model) => {
          if (this.vmState()?.id === vm.id) {
            this.networkVmState.set(model);
          }
        });
    };

    if (currentRef && readOnly.has(currentRef)) {
      const currentName = cards.availableNetworks?.[currentRef] || currentRef;

      this.crucibleDialogService
        .confirm({
          title: 'Confirm Network Change',
          message: `You are currently on "${currentName}", which is not in your allowed network list. If you switch away, you will not be able to switch back. Do you want to continue?`,
          confirmText: 'Confirm',
          cancelText: 'Cancel',
        })
        .afterClosed()
        .pipe(
          take(1),
          filter((confirmed) => confirmed === true),
        )
        .subscribe(() => performChange());
    } else {
      performChange();
    }
  }

  private getNetworkVm(vm: Vm, id: string): Observable<NetworkVirtualMachine> {
    if (vm.type === VmType.Proxmox) {
      return this.proxmoxService.getVm(id);
    }

    if (vm.type === VmType.Vsphere) {
      return this.vsphereService.getVm(id);
    }

    return EMPTY;
  }

  private changeNetwork(
    vm: Vm,
    id: string,
    adapter: string,
    network: string,
  ): Observable<NetworkVirtualMachine> {
    if (vm.type === VmType.Proxmox) {
      return this.proxmoxService.changeNic(id, adapter, network);
    }

    if (vm.type === VmType.Vsphere) {
      return this.vsphereService.changeNic(id, adapter, network);
    }

    return EMPTY;
  }

  public setNetworkSearch(adapter: string, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.networkSearch.update((search) => ({
      ...search,
      [adapter]: value,
    }));
  }

  public clearNetworkSearch(adapter: string) {
    this.networkSearch.update((search) => ({
      ...search,
      [adapter]: '',
    }));
  }

  // Fetch the mountable ISOs for this Vm, let the user pick one, then mount it. The listing is
  // deliberately re-fetched on every open rather than cached: the volume ids it returns are what the
  // mount call is validated against, and another team member may have uploaded or deleted a file
  // since the console was opened.
  public startIsoMount() {
    const vm = this.vmState();
    if (!vm?.id || this.retrievingIsos()) {
      return;
    }

    this.retrievingIsos.set(true);

    this.proxmoxService
      .getIsos(vm.id)
      .pipe(take(1))
      .subscribe({
        next: (isoResults) => {
          this.retrievingIsos.set(false);
          this.pickAndMountIso(vm.id, isoResults);
        },
        error: (error) => {
          this.retrievingIsos.set(false);
          this.showMessage(`Could not load ISOs: ${error.message}`, 10000);
        },
      });
  }

  private pickAndMountIso(id: string, isoResults: IsoResult[]) {
    this.dialogService
      .mountIso(isoResults)
      .pipe(
        take(1),
        filter((iso): iso is IsoFile => !!iso?.mountValue),
      )
      .subscribe((iso) => {
        this.proxmoxService
          .mountIso(id, iso.mountValue)
          .pipe(take(1))
          .subscribe({
            next: (model) => {
              // Guard against the console having switched Vms while the mount was in flight.
              if (this.vmState()?.id === id) {
                this.networkVmState.set(model);
              }
              this.showMessage(`Mounted ${iso.filename}`);
            },
            error: (error) =>
              this.showMessage(`Mount failed: ${error.message}`, 10000),
          });
      });
  }

  public ctrlAltDel() {
    this.vmService.sendCtrlAltDel(this.vm.id);
  }

  public sendClipboardText() {
    this.vmService.sendClipboardText(this.vm.id);
  }

  public powerOn() {
    this.submitPowerAction(PowerAction.PowerOn);
  }

  public powerOff() {
    this.confirmPowerAction(
      PowerAction.PowerOff,
      `Power off "${this.vm?.name}"? The guest OS will not be shut down cleanly.`,
    );
  }

  public reboot() {
    this.confirmPowerAction(PowerAction.Reboot, `Reboot "${this.vm?.name}"?`);
  }

  public shutdown() {
    this.confirmPowerAction(
      PowerAction.Shutdown,
      `Shut down the guest OS on "${this.vm?.name}"?`,
    );
  }

  private confirmPowerAction(action: PowerAction, message: string) {
    this.crucibleDialogService
      .confirm({
        title: `Confirm ${action}`,
        message,
        confirmText: 'Confirm',
        cancelText: 'Cancel',
      })
      .afterClosed()
      .pipe(
        take(1),
        filter((confirmed) => confirmed === true),
      )
      .subscribe(() => this.submitPowerAction(action));
  }

  private submitPowerAction(action: PowerAction) {
    // The console does not receive VmUpdated events, so a snackbar is the only feedback available.
    // Any non-error response means the operation was submitted; the API does not report completion.
    this.vmService
      .powerAction(this.vm.id, action)
      .pipe(take(1))
      .subscribe({
        next: () => this.showMessage(`${action} submitted`),
        error: (error) =>
          this.showMessage(`${action} failed: ${error.message}`, 10000),
      });
  }

  private showMessage(message: string, duration = 5000) {
    this.snackBar.open(message, 'Close', {
      duration,
      verticalPosition: 'top',
    });
  }

  toggleTheme(event: MatSlideToggleChange) {
    const theme = event.checked ? Theme.DARK : Theme.LIGHT;
    this.authService.setUserTheme(theme);
  }
}
