/*
Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
*/

import {
  Component,
  ChangeDetectionStrategy,
  Input,
  OnInit,
  computed,
  linkedSignal,
  signal,
  inject,
  input,
} from '@angular/core';
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AppSystemPermission,
  AppViewPermission,
  ProxmoxVirtualMachine,
  Vm,
  VmSnapshot,
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
import {
  catchError,
  filter,
  finalize,
  map,
  startWith,
  switchMap,
  take,
} from 'rxjs/operators';
import { MatIcon } from '@angular/material/icon';
import { MatMenuTrigger, MatMenu, MatMenuItem } from '@angular/material/menu';
import { MatButton, MatIconButton } from '@angular/material/button';
import {
  MatSlideToggleChange,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { MatLabel } from '@angular/material/form-field';
import { AsyncPipe } from '@angular/common';
import { MatTooltip } from '@angular/material/tooltip';
import {
  filesOverUploadLimit,
  ProxmoxService,
  uploadLimitMessage,
} from '../../services/proxmox/proxmox.service';
import { DialogService } from '../../services/dialog/dialog.service';
import { IsoFile, IsoResult } from '../../models/vm/iso-result';
import { VsphereService } from '../../state/vsphere/vsphere.service';
import { UserPermissionsService } from '../../services/user-permissions/user-permissions.service';
import { formatConnectedUsers, inIframe } from '../../utils/console-helpers';
import { SignalRService } from '../../services/signalr/signalr.service';
import { NotificationService } from '../../services/notification/notification.service';
import { NotificationData } from '../../models/notification/notification-model';
import { EMPTY, Observable, of } from 'rxjs';

type NetworkVirtualMachine = ProxmoxVirtualMachine | VsphereVirtualMachine;

// Tooltip on the controls that only work while the QEMU guest agent answers in the guest.
export const GUEST_AGENT_TOOLTIP = 'Requires the QEMU guest agent';

// Tooltip on Copy where the Vm's vga config lacks clipboard=vnc, so the guest's clipboard never
// reaches noVNC.
export const VNC_CLIPBOARD_TOOLTIP =
  'Copy from the VM needs the VNC clipboard (clipboard=vnc) enabled on this VM';

// Tooltip on Match Window Size where the server never offered to resize the guest display (QEMU's
// default std VGA, for one; virtio-gpu with a guest driver can).
export const RESIZE_UNSUPPORTED_TOOLTIP =
  "This VM's display adapter can't change resolution from the console";

// Tooltip on Match Window Size on a read-only console, whose viewer must not resize the guest for
// whoever is driving it.
export const RESIZE_READ_ONLY_TOOLTIP =
  "A read-only console can't change this VM's resolution";

// Shown once when Match Window Size was chosen but the guest kept its resolution, so the console
// went back to scaling.
export const RESIZE_FALLBACK_MESSAGE =
  "This VM didn't change resolution, so the console is scaling to fit instead.";

// Shown when Copy is enabled but nothing has come over the VNC clipboard yet: the guest side of that
// is spice-vdagent, which the Vm's config cannot tell us about.
export const COPY_FROM_VM_FAILED_MESSAGE =
  'Copy from VM failed!  Nothing has come from the guest clipboard; the guest also needs spice-vdagent running.';

@Component({
  selector: 'app-options-bar2',
  templateUrl: './options-bar2.component.html',
  styleUrls: ['./options-bar2.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIconButton,
    MatButton,
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
export class OptionsBar2Component implements OnInit {
  private vmService = inject(VmService);
  private authService = inject(ComnAuthService);
  private authQuery = inject(ComnAuthQuery);
  private crucibleDialogService = inject(CrucibleDialogService);
  private snackBar = inject(MatSnackBar);
  private proxmoxService = inject(ProxmoxService);
  private vsphereService = inject(VsphereService);
  private dialogService = inject(DialogService);
  private userPermissionsService = inject(UserPermissionsService);
  private signalrService = inject(SignalRService);
  private notificationService = inject(NotificationService);

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

  // Task progress vm.api broadcasts on the progress hub for this Vm (power, revert, ...). As in the
  // vSphere bar, an empty broadcast leaves the last list in place. Only unfinished tasks are shown:
  // the Proxmox poller rebroadcasts PVE's recent tasks, finished ones included, with PVE's own
  // status ("OK", or the failure text) as the state, never vSphere's "success".
  private static readonly unfinishedStates = new Set(['running', 'queued']);
  private readonly tasks = signal<NotificationData[]>([]);
  public readonly tasksInProgress = computed(() =>
    this.tasks().filter((task) =>
      OptionsBar2Component.unfinishedStates.has(task.state),
    ),
  );

  constructor() {
    this.notificationService.tasksInProgress
      .pipe(takeUntilDestroyed())
      .subscribe((data) => {
        if (data?.length) {
          this.tasks.set(data);
        }
      });
    this.proxmoxService.resizeFallback$
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.showMessage(RESIZE_FALLBACK_MESSAGE, 10000));
  }

  ngOnInit() {
    const id = this.vmState()?.id;
    if (id) {
      // A failed connection is logged by the service, which has already handled the rejection.
      this.notificationService.connectToProgressHub(id);
    }
  }

  get vm(): Vm | null {
    return this.vmState();
  }

  readonly readOnly = input(false);
  // Set by the console page from the user's Vm control permissions (UserPermissionsService).
  readonly allowReadOnlyToggle = input(false);

  // Everyone with this Vm's console open, from the Vm presence hub the console page joins.
  private readonly currentVmUsers = toSignal(
    this.signalrService.currentVmUsers$,
    { initialValue: [] as string[] },
  );

  public readonly showConnectedUsers = computed(
    () => !this.readOnly() && (this.currentVmUsers()?.length ?? 0) > 0,
  );

  public readonly connectedUsersLabel = computed(() =>
    formatConnectedUsers(this.currentVmUsers()),
  );

  public readonly connectedUsersTooltip = computed(() =>
    (this.currentVmUsers() ?? []).join('\n'),
  );

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

  private readonly proxmoxVm = computed(
    () => this.networkVmState() as ProxmoxVirtualMachine | null,
  );

  // Same gate as the vSphere bar's Snapshots item.
  canRevertSnapshots$ = this.userPermissionsService.can(
    null,
    AppViewPermission.RevertVms,
    AppSystemPermission.RevertVms,
  );

  public readonly hasSnapshot = computed(
    () => this.proxmoxVm()?.hasSnapshot === true,
  );

  public readonly guestAgentTooltip = GUEST_AGENT_TOOLTIP;

  public readonly guestAgentRunning = computed(
    () => this.proxmoxVm()?.guestAgentRunning === true,
  );

  /**
   * Asks again whether the guest agent is running, when Files is opened while it was not. The answer
   * is otherwise read only when the Vm loads or changes, and an agent starting in the guest changes
   * nothing on the Vm while its addresses stay the same, so a console opened during boot kept Send and
   * Download File disabled after the agent came up.
   */
  public refreshGuestAgentState() {
    const vm = this.vmState();
    if (
      vm?.type !== VmType.Proxmox ||
      !this.proxmoxVm() ||
      this.guestAgentRunning()
    ) {
      return;
    }

    this.proxmoxService
      .getVm(vm.id)
      .pipe(
        take(1),
        catchError(() => EMPTY),
      )
      .subscribe((model) => {
        // The Vm may have changed while the request was out.
        if (this.vmState()?.id === vm.id) {
          this.networkVmState.set(model);
        }
      });
  }

  public readonly vncClipboardTooltip = VNC_CLIPBOARD_TOOLTIP;

  public readonly activeResolution = this.proxmoxService.activeResolution;

  // Why Match Window Size is unavailable, or '' when it can be chosen.
  public readonly matchWindowSizeTooltip = computed(() => {
    if (!this.proxmoxService.resizeSupported()) {
      return RESIZE_UNSUPPORTED_TOOLTIP;
    }
    return this.readOnly() ? RESIZE_READ_ONLY_TOOLTIP : '';
  });

  public scaleToFit() {
    this.proxmoxService.setResolutionMode('scale');
  }

  public matchWindowSize() {
    this.proxmoxService.setResolutionMode('match');
  }

  // Support is normally picked up as the server reports it; checking again on open covers a noVNC
  // whose internals no longer give that hook.
  public refreshResizeSupport() {
    this.proxmoxService.refreshResizeSupport();
  }

  // Copy can only return what QEMU passes out over VNC, which it does only with clipboard=vnc.
  public readonly vncClipboardEnabled = computed(
    () => this.proxmoxVm()?.vncClipboardEnabled === true,
  );

  // Same gates as the vSphere bar's Files items.
  public readonly canUploadVmFiles = toSignal(
    this.userPermissionsService.can(
      null,
      AppViewPermission.UploadVmFiles,
      AppSystemPermission.UploadVmFiles,
    ),
    { initialValue: false },
  );
  public readonly canDownloadVmFiles = toSignal(
    this.userPermissionsService.can(
      null,
      AppViewPermission.DownloadVmFiles,
      AppSystemPermission.DownloadVmFiles,
    ),
    { initialValue: false },
  );

  public readonly showFilesMenu = computed(
    () =>
      this.canUploadVmFiles() ||
      this.canDownloadVmFiles() ||
      this.canMountIso(),
  );

  public readonly uploading = signal(false);

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
          this.showMessage(failureMessage('Could not load ISOs', error), 10000);
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
              this.showMessage(failureMessage('Mount failed', error), 10000),
          });
      });
  }

  // Lists the Vm's snapshots in the same dialog the vSphere bar uses, which asks for confirmation
  // before closing. The snapshot the Vm is running from is reverted through actions/revert; any
  // other is reverted by name.
  public selectAndRevertSnapshot() {
    const vm = this.vmState();
    if (!vm?.id) {
      return;
    }

    this.proxmoxService
      .getSnapshots(vm.id, this.proxmoxVm()?.currentSnapshot)
      .pipe(
        take(1),
        switchMap((snapshots) => this.dialogService.selectSnapshot(snapshots)),
        filter((selected): selected is VmSnapshot => !!selected),
        switchMap((selected) =>
          selected.isCurrent
            ? this.proxmoxService.revertToCurrentSnapshot(vm.id)
            : this.proxmoxService.revertToSnapshot(vm.id, selected.name),
        ),
      )
      .subscribe({
        next: () => this.showMessage('Revert Successful'),
        error: (error) =>
          this.showMessage(failureMessage('Revert Failed', error), 10000),
      });
  }

  // Runs after the user picked files from Send File To VM: asks where to put them, then uploads.
  // The picker comes first so it opens straight from the menu click; browsers refuse to open a file
  // picker that isn't a direct response to a user gesture.
  public uploadFileToVm(fileSelector: HTMLInputElement) {
    const vm = this.vmState();
    const files = fileSelector.files;
    if (!vm?.id || !files?.length) {
      fileSelector.value = '';
      return;
    }

    // Before the upload rather than after it: the API only refuses a file once it has all of it.
    const tooLarge = filesOverUploadLimit(files);
    if (tooLarge.length) {
      fileSelector.value = '';
      this.showMessage(
        `Error Uploading File: ${uploadLimitMessage(tooLarge)}`,
        10000,
      );
      return;
    }

    this.askForDirectory('VM Send File Settings')
      .pipe(take(1))
      .subscribe((directory) => {
        if (!directory) {
          fileSelector.value = '';
          return;
        }

        const progressRef = this.dialogService.uploadProgress();
        this.uploading.set(true);
        this.proxmoxService
          .uploadFiles(vm.id, directory, files)
          .pipe(
            take(1),
            finalize(() => {
              progressRef.close();
              fileSelector.value = '';
              this.uploading.set(false);
            }),
          )
          .subscribe({
            next: () => this.showMessage('File Uploaded Successfully'),
            error: (error) =>
              this.showMessage(
                failureMessage('Error Uploading File', error),
                10000,
              ),
          });
      });
  }

  public downloadFileFromVm() {
    const vm = this.vmState();
    if (!vm?.id) {
      return;
    }

    this.dialogService
      .getFileUploadInfo('Download File Settings', { showCredentials: false })
      .pipe(
        take(1),
        filter((entered) => !!entered?.filepath),
        switchMap((entered) =>
          this.proxmoxService
            .downloadFile(vm.id, entered.filepath)
            .pipe(map((blob) => ({ blob, path: entered.filepath }))),
        ),
      )
      .subscribe({
        next: ({ blob, path }) => saveBlob(blob, fileNameOf(path)),
        error: (error) =>
          this.showMessage(
            failureMessage('Error Downloading File', error),
            10000,
          ),
      });
  }

  // The API appends the uploaded file's name to this path, so it must be an absolute directory
  // ending in a separator. Adds the separator the path already uses, and asks again for a path
  // with none, as the vSphere bar does.
  private askForDirectory(title: string): Observable<string | undefined> {
    return this.dialogService
      .getFileUploadInfo(title, { showCredentials: false })
      .pipe(
        take(1),
        switchMap((entered) => {
          const path = entered?.filepath?.trim();
          if (!path) {
            return of(undefined);
          }
          const directory = toDirectory(path);
          return directory
            ? of(directory)
            : this.askForDirectory('The file path must be an absolute path.');
        }),
      );
  }

  // In an iframe (Player's view), Open In New Tab is offered as in the vSphere bar.
  public readonly inFrame = inIframe();

  public fullscreen() {
    if (!this.proxmoxService.fullscreen()) {
      this.showMessage('Fullscreen is not available');
    }
  }

  public openInTab() {
    window.open(window.location.href);
  }

  public reconnect() {
    this.proxmoxService.reconnect();
  }

  // Hands the text the guest last copied to the local clipboard. noVNC is only told about guest
  // copies as they happen (and Proxmox only sends them with a VNC clipboard set up on the Vm), so
  // there is nothing to fetch on demand the way WMKS grab() does.
  public async copyVmClipboard() {
    const text = this.proxmoxService.getGuestClipboard();
    if (!text) {
      this.snackBar.open(COPY_FROM_VM_FAILED_MESSAGE, 'Close', {
        duration: 10000,
        verticalPosition: 'top',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      this.snackBar.open('Copied Virtual Machine Clipboard', 'Ok', {
        duration: 2000,
        verticalPosition: 'top',
      });
    } catch {
      this.crucibleDialogService.confirm({
        title: 'Select text and press Ctrl+C to copy to your local clipboard:',
        message: text,
        confirmText: 'OK',
        cancelText: '',
      });
    }
  }

  public ctrlAltDel() {
    this.vmService.sendCtrlAltDel(this.vm.id);
  }

  public sendClipboardText() {
    this.vmService.sendClipboardText(this.vm.id);
  }

  public sendInputString() {
    this.dialogService
      .sendText('Enter Text to Send')
      .pipe(take(1))
      .subscribe((enteredText) => {
        if (enteredText?.textToSend) {
          this.paste(enteredText.textToSend, enteredText.timeout);
        }
      });
  }

  // Types the local clipboard into the guest. When the browser won't hand the clipboard over
  // (permission refused, or no Clipboard API), falls back to the Send Text dialog, as the vSphere
  // bar does.
  public async pasteFromClipboard() {
    let clip: string;
    try {
      clip = await navigator.clipboard.readText();
    } catch {
      this.sendInputString();
      return;
    }
    await this.paste(clip);
  }

  // Same pacing as the vSphere bar: each line is typed and followed by Enter, then a pause of
  // `timeoutStr` ms (the Send Text dialog's paste speed) before the next line. sendText itself
  // paces the keys within a line to what QEMU can take.
  public async paste(text: string, timeoutStr: string = '50') {
    const timeout = parseInt(timeoutStr);
    for (const line of text.split('\n')) {
      if (!(await this.proxmoxService.sendText(line + '\n'))) {
        this.showMessage(
          'Send Text failed: the console is not connected',
          10000,
        );
        return;
      }
      await new Promise((r) => setTimeout(r, timeout));
    }
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
          this.showMessage(failureMessage(`${action} failed`, error), 10000),
      });
  }

  private showMessage(message: string, duration = 5000) {
    this.snackBar.open(message, 'Close', {
      duration,
      verticalPosition: 'top',
    });
  }

  // Navigates to ?readOnly=..., which the console page turns back into the readOnly input.
  toggleReadOnly(event: MatSlideToggleChange) {
    this.vmService.setReadOnly(event.checked);
  }

  toggleTheme(event: MatSlideToggleChange) {
    const theme = event.checked ? Theme.DARK : Theme.LIGHT;
    this.authService.setUserTheme(theme);
  }
}

// vm.api reports a failure as ProblemDetails with the reason in `title`; fall back to the HTTP
// client's own message when there is no body.
export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return error.error?.title || error.message;
  }
  return (error as Error)?.message ?? String(error);
}

// The console's own context, then the reason. vm.api already names the operation in a Proxmox
// failure ("Power On failed: VM 100 already running"), so such a reason is shown on its own rather
// than as "Power On failed: Power On failed: ...".
export function failureMessage(context: string, error: unknown): string {
  const reason = apiErrorMessage(error);
  return /^[a-z][a-z ]* failed: /i.test(reason)
    ? reason
    : `${context}: ${reason}`;
}

// `path` with a trailing separator, or null when it has none to go by (a bare name).
export function toDirectory(path: string): string | null {
  if (path.endsWith('/') || path.endsWith('\\')) {
    return path;
  }
  if (path.includes('\\')) {
    return path + '\\';
  }
  if (path.includes('/')) {
    return path + '/';
  }
  return null;
}

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || 'download';
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoke on the next task: the click has started the download by then.
  setTimeout(() => URL.revokeObjectURL(url));
}
