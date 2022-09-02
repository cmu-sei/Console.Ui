import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { delay } from 'rxjs/operators';
import { ProxmoxConsole, ProxmoxService, Vm } from '../../../generated/vm-api';

@Component({
  selector: 'app-proxmox-console',
  templateUrl: './proxmox-console.component.html',
  styleUrls: ['./proxmox-console.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProxmoxConsoleComponent {
  @Input() readOnly = false;

  @Input() set vm(value: Vm) {
    this._vm = value;
    this.getConsole();
  }

  private _vm: Vm;

  proxmoxConsole$: Observable<ProxmoxConsole>;

  constructor(private proxmoxService: ProxmoxService) {}

  getConsole(attempts: number = 0) {
    if (this._vm != null) {
      this.proxmoxConsole$ = this.proxmoxService
        .getProxmoxConsole(this._vm.id)
        .pipe(delay(this.getDelay(attempts)));
    }
  }

  private getDelay(attempts: number): number {
    const maxSeconds = 10;

    let nextRetrySeconds = Math.pow(2, attempts + 1);

    if (nextRetrySeconds > maxSeconds) {
      nextRetrySeconds = maxSeconds;
    }

    return nextRetrySeconds * 1000;
  }
}
