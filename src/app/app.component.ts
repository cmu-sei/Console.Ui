// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
import { Component, OnDestroy } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { ComnAuthQuery, ComnAuthService, ComnSettingsService, Theme } from '@cmusei/crucible-common';
import { RouterQuery } from '@datorama/akita-ng-router-store';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RouterOutlet } from '@angular/router';
import { DynamicThemeService } from './services/dynamic-theme.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    imports: [RouterOutlet]
})
export class AppComponent implements OnDestroy {
  theme$: Observable<Theme> = this.authQuery.userTheme$;
  unsubscribe$ = new Subject();

  constructor(
    private iconRegistry: MatIconRegistry,
    private sanitizer: DomSanitizer,
    private authQuery: ComnAuthQuery,
    private routerQuery: RouterQuery,
    private authService: ComnAuthService,
    private settingsService: ComnSettingsService,
    private themeService: DynamicThemeService,
  ) {
    this.addIcons();

    this.theme$.pipe(takeUntil(this.unsubscribe$)).subscribe((theme) => {
      this.setTheme(theme);
    });

    this.routerQuery
      .selectQueryParams('theme')
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe((theme) => {
        this.authService.setUserTheme(theme);
      });
  }

  setTheme(theme: Theme) {
    const hexColor =
      this.settingsService.settings.AppPrimaryThemeColor || '#BB0000';

    switch (theme) {
      case Theme.LIGHT:
        document.body.classList.toggle('darkMode', false);
        this.themeService.applyLightTheme(hexColor);
        break;
      case Theme.DARK:
        document.body.classList.toggle('darkMode', true);
        this.themeService.applyDarkTheme(hexColor);
        break;
    }
  }

  addIcons() {
    this.iconRegistry.addSvgIcon(
      'ic_error_outline_black_48px',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/svg-icons/ic_error_outline_black_48px.svg',
      ),
    );
    this.iconRegistry.addSvgIcon(
      'ic_lock_outine_black_48px',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/svg-icons/ic_lock_outine_black_48px.svg',
      ),
    );
    this.iconRegistry.addSvgIcon(
      'ic_power_settings_new_black_48px',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/svg-icons/ic_power_settings_new_black_48px.svg',
      ),
    );
    this.iconRegistry.addSvgIcon(
      'gear',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/svg-icons/gear.svg',
      ),
    );
    this.iconRegistry.addSvgIcon(
      'ic_clear_black_24px',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/svg-icons/ic_clear_black_24px.svg',
      ),
    );
    this.iconRegistry.addSvgIcon(
      'ic_clipboard_copy',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/svg-icons/ic_clipboard_copy.svg',
      ),
    );
    this.iconRegistry.addSvgIcon(
      'ic_clipboard_paste',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/svg-icons/ic_clipboard_paste.svg',
      ),
    );
    this.iconRegistry.addSvgIcon(
      'keyboard',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/svg-icons/keyboard.svg',
      ),
    );
  }

  ngOnDestroy() {
    this.unsubscribe$.next(null);
    this.unsubscribe$.complete();
  }
}
