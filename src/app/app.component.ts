// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
import { OverlayContainer } from '@angular/cdk/overlay';
import { Component, HostBinding, OnDestroy } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { ComnAuthQuery, ComnAuthService, Theme } from '@cmusei/crucible-common';
import { RouterQuery } from '@datorama/akita-ng-router-store';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnDestroy {
  title = 'VM Console';
  @HostBinding('class') componentCssClass: string;
  theme$: Observable<Theme> = this.authQuery.userTheme$;
  unsubscribe$ = new Subject();

  constructor(
    private iconRegistry: MatIconRegistry,
    private sanitizer: DomSanitizer,
    private overlayContainer: OverlayContainer,
    private authQuery: ComnAuthQuery,
    private routerQuery: RouterQuery,
    private authService: ComnAuthService
  ) {
    this.addIcons();

    this.theme$.pipe(takeUntil(this.unsubscribe$)).subscribe((theme) => {
      this.setTheme(theme);
    });

    this.routerQuery
      .selectQueryParams('theme')
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe((theme) => {
        const t = theme === Theme.DARK ? Theme.DARK : Theme.LIGHT;
        this.authService.setUserTheme(theme);
      });
  }

  setTheme(theme: Theme) {
    const classList = this.overlayContainer.getContainerElement().classList;
    switch (theme) {
      case Theme.LIGHT:
        this.componentCssClass = theme;
        classList.add(theme);
        classList.remove(Theme.DARK);
        break;
      case Theme.DARK:
        this.componentCssClass = theme;
        classList.add(theme);
        classList.remove(Theme.LIGHT);
    }
  }

  addIcons() {
    this.iconRegistry.addSvgIcon(
      'ic_error_outline_black_48px',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/svg-icons/ic_error_outline_black_48px.svg'
      )
    );
    this.iconRegistry.addSvgIcon(
      'ic_lock_outine_black_48px',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/svg-icons/ic_lock_outine_black_48px.svg'
      )
    );
    this.iconRegistry.addSvgIcon(
      'ic_power_settings_new_black_48px',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/svg-icons/ic_power_settings_new_black_48px.svg'
      )
    );
    this.iconRegistry.addSvgIcon(
      'gear',
      this.sanitizer.bypassSecurityTrustResourceUrl('assets/svg-icons/gear.svg')
    );
    this.iconRegistry.addSvgIcon(
      'ic_clear_black_24px',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/svg-icons/ic_clear_black_24px.svg'
      )
    );
    this.iconRegistry.addSvgIcon(
      'ic_clipboard_copy',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/svg-icons/ic_clipboard_copy.svg'
      )
    );
    this.iconRegistry.addSvgIcon(
      'ic_clipboard_paste',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/svg-icons/ic_clipboard_paste.svg'
      )
    );
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }
}
