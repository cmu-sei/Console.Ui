// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Component, HostListener } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { VmService } from '../../services/vm/vm.service';
import { ComnAuthService, Theme } from '@cmusei/crucible-common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-console',
  templateUrl: './console.component.html',
  styleUrls: ['./console.component.scss'],
})
export class ConsoleComponent {
  noVmConsoleApi = true;
  unsubscribe$: Subject<null> = new Subject<null>();

  constructor(
    private activatedRoute: ActivatedRoute,
    public vmService: VmService,
    private authService: ComnAuthService
  ) {
    this.activatedRoute.params.subscribe(
      (res) => {
        this.vmService.model.id = res.id;
        },
      (error) => {
        console.log(error.message);
      }
    );
    this.activatedRoute.queryParamMap.pipe(takeUntil(this.unsubscribe$)).subscribe(params => {
      const selectedTheme = params.get('theme');
      const theme = selectedTheme === Theme.DARK ? Theme.DARK : Theme.LIGHT;
      this.authService.setUserTheme(theme);
    });
  }

  @HostListener('window:resize', ['$event'])
  onResize(event) {
    // this will re-center the console
    if (this.vmService.wmks) {
      this.vmService.wmks.updateScreen();
    }
  }
}
