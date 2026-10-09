// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi, beforeEach, onTestFinished } from 'vitest';
import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';
import { BehaviorSubject, Subject } from 'rxjs';
import { RouterQuery } from '@datorama/akita-ng-router-store';
import {
  ComnAuthQuery,
  ComnAuthService,
  ComnHeaderBarModule,
  ComnSettingsService,
  CrucibleThemeService,
  Theme,
  provideCrucibleTheme,
} from '@cmusei/crucible-common';
import { AppComponent } from './app.component';
import { renderComponent } from './test-utils/render-component';

@Component({ selector: 'comn-header-bar', template: '' })
class HeaderBarStubComponent {}

const THEME_PROPERTIES = [
  '--crucible-topbar-background',
  '--crucible-topbar-text',
  '--mat-sys-primary',
  '--mat-sys-on-primary',
];

const COLOR_SETTINGS = {
  AppTopBarHexColor: '#112233',
  AppTopBarHexTextColor: '#EEEEEE',
  AppLightModePrimaryHexColor: '#AB1234',
  AppLightModePrimaryHexTextColor: '#FFFFFF',
  AppDarkModePrimaryHexColor: '#CD5678',
  AppDarkModePrimaryHexTextColor: '#000000',
};

function bodyStyle(prop: string): string {
  return document.body.style.getPropertyValue(prop).trim().toUpperCase();
}

async function renderApp(
  overrides: { theme?: Theme; settings?: Record<string, string> } = {},
) {
  const theme$ = new BehaviorSubject<Theme>(overrides.theme ?? Theme.LIGHT);
  const themeParam$ = new Subject<string | null>();
  const auth = { setUserTheme: vi.fn() } satisfies Pick<ComnAuthService, 'setUserTheme'>;
  const navigate = vi.fn(() => Promise.resolve(true));
  // renderComponent installs MatIconTestingModule's fake registry; this spec
  // provides the real MatIconRegistry instead and records what it registers.
  // AppComponent's own template renders no mat-icon, so nothing is fetched.
  const addSvgIcon = vi.spyOn(MatIconRegistry.prototype, 'addSvgIcon');
  const applyTheme = vi.spyOn(CrucibleThemeService.prototype, 'applyTheme');
  const routerQuery: Pick<RouterQuery, 'selectQueryParams'> = {
    selectQueryParams: (() => themeParam$.asObservable()) as RouterQuery['selectQueryParams'],
  };

  const rendered = await renderComponent(AppComponent, {
    childStubs: [{ replace: ComnHeaderBarModule, with: HeaderBarStubComponent }],
    providers: [
      // CrucibleFaviconService loads the favicon SVG through HttpBackend.
      provideHttpClient(),
      provideHttpClientTesting(),
      provideCrucibleTheme({ brand: { color: '#3B62A5', text: '#FFFFFF' } }),
      MatIconRegistry,
      {
        provide: ComnAuthQuery,
        useValue: { userTheme$: theme$ } satisfies Pick<ComnAuthQuery, 'userTheme$'>,
      },
      { provide: ComnAuthService, useValue: auth },
      { provide: RouterQuery, useValue: routerQuery },
      {
        provide: ComnSettingsService,
        useValue: {
          settings: overrides.settings ?? {},
        } satisfies Pick<ComnSettingsService, 'settings'>,
      },
    ],
  });
  const injector = rendered.fixture.debugElement.injector;
  const router = injector.get(Router);
  vi.spyOn(router, 'navigate').mockImplementation(navigate);
  const http = injector.get(HttpTestingController);

  const registered = new Set(addSvgIcon.mock.calls.map(([name]) => name));

  return { ...rendered, theme$, themeParam$, auth, navigate, registered, applyTheme, http };
}

describe('AppComponent', () => {
  beforeEach(() => {
    document.body.classList.remove('darkMode');
    for (const el of [document.documentElement, document.body]) {
      for (const prop of THEME_PROPERTIES) {
        el.style.removeProperty(prop);
      }
    }
  });

  /**
   * Verifies: every emitted user theme is handed to the shared theme service, which toggles the darkMode body class.
   * Interacts with: ComnAuthQuery.userTheme$; CrucibleThemeService.applyTheme (spied, real implementation); document.body.classList.
   * Data: light, then dark, then light.
   */
  it('applies the user theme through CrucibleThemeService', async () => {
    const { theme$, applyTheme } = await renderApp();
    expect(applyTheme).toHaveBeenLastCalledWith(Theme.LIGHT);
    expect(document.body).not.toHaveClass('darkMode');

    theme$.next(Theme.DARK);
    expect(applyTheme).toHaveBeenLastCalledWith(Theme.DARK);
    expect(document.body).toHaveClass('darkMode');

    theme$.next(Theme.LIGHT);
    expect(document.body).not.toHaveClass('darkMode');
  });

  /**
   * Verifies: in light mode the top bar and the primary colour come from their own settings pairs.
   * Interacts with: ComnSettingsService.settings; the --crucible-topbar-* and --mat-sys-* custom properties on body.
   * Data: COLOR_SETTINGS (top bar #112233/#EEEEEE, light primary #AB1234/#FFFFFF).
   */
  it('applies independent top-bar and primary pairs in light mode', async () => {
    await renderApp({ settings: COLOR_SETTINGS });
    expect(document.body).not.toHaveClass('darkMode');
    expect(bodyStyle('--crucible-topbar-background')).toBe('#112233');
    expect(bodyStyle('--crucible-topbar-text')).toBe('#EEEEEE');
    expect(bodyStyle('--mat-sys-primary')).toBe('#AB1234');
    expect(bodyStyle('--mat-sys-on-primary')).toBe('#FFFFFF');
  });

  /**
   * Verifies: in dark mode the primary pair switches to the dark settings while the top bar keeps its colours.
   * Interacts with: ComnSettingsService.settings; the --crucible-topbar-* and --mat-sys-* custom properties on body.
   * Data: COLOR_SETTINGS (dark primary #CD5678/#000000); initial theme dark.
   */
  it('switches primary in dark mode while the top bar stays the same', async () => {
    await renderApp({ theme: Theme.DARK, settings: COLOR_SETTINGS });
    expect(document.body).toHaveClass('darkMode');
    expect(bodyStyle('--crucible-topbar-background')).toBe('#112233');
    expect(bodyStyle('--crucible-topbar-text')).toBe('#EEEEEE');
    expect(bodyStyle('--mat-sys-primary')).toBe('#CD5678');
    expect(bodyStyle('--mat-sys-on-primary')).toBe('#000000');
  });

  /**
   * Verifies: without configured colours the top bar and primary fall back to the Player brand colour.
   * Interacts with: provideCrucibleTheme brand; the --crucible-topbar-* and --mat-sys-* custom properties on html and body.
   * Data: empty settings; brand #3B62A5/#FFFFFF.
   */
  it('falls back to the Player brand colour', async () => {
    await renderApp();
    expect(bodyStyle('--crucible-topbar-background')).toBe('#3B62A5');
    expect(bodyStyle('--crucible-topbar-text')).toBe('#FFFFFF');
    expect(bodyStyle('--mat-sys-primary')).toBe('#3B62A5');
    expect(
      document.documentElement.style.getPropertyValue('--crucible-topbar-background').toUpperCase(),
    ).toBe('#3B62A5');
  });

  /**
   * Verifies: the favicon is recoloured to the top bar colour.
   * Interacts with: a <link rel="icon"> in the document; CrucibleFaviconService over HttpTestingController.
   * Data: AppTopBarHexColor '#112233'; a favicon SVG with a .cls-1 fill rule.
   */
  it('recolours the favicon to the top bar colour', async () => {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = 'https://console.test/favicon.svg';
    document.head.appendChild(link);
    onTestFinished(() => link.remove());

    const { http } = await renderApp({ settings: COLOR_SETTINGS });
    http
      .expectOne('https://console.test/favicon.svg')
      .flush('<svg><style>.cls-1{fill:#000;}</style></svg>');

    expect(link.href.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(link.href)).toContain('.cls-1{fill:#112233;}');
    http.verify();
  });

  /**
   * Verifies: a ?theme= query param (as Player passes into embedded apps) sets the user's theme, dark only for 'dark-theme'.
   * Interacts with: RouterQuery.selectQueryParams('theme'); ComnAuthService.setUserTheme.
   * Data: params 'dark-theme', 'anything', then null.
   */
  it('takes the theme from the query string', async () => {
    const { themeParam$, auth } = await renderApp();

    themeParam$.next('dark-theme');
    themeParam$.next('anything');
    themeParam$.next(null);

    expect(auth.setUserTheme.mock.calls).toEqual([[Theme.DARK], [Theme.LIGHT]]);
  });

  /**
   * Verifies: when the user changes theme in the console, the theme query param is updated to match.
   * Interacts with: ComnAuthQuery.userTheme$; Router.navigate spy.
   * Data: ?theme=light-theme, then the user picks dark.
   */
  it('writes a changed theme back to the query string', async () => {
    const { themeParam$, theme$, navigate } = await renderApp();
    themeParam$.next('light-theme');

    theme$.next(Theme.DARK);

    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { theme: Theme.DARK },
      queryParamsHandling: 'merge',
    });
  });

  /**
   * Verifies: the header bar is shown when the console is not embedded in a frame.
   * Interacts with: the hideTopbar flag (window.self === window.top under jsdom).
   * Data: default render.
   */
  it('shows the header bar outside an iframe', async () => {
    const { container } = await renderApp();
    expect(container.querySelector('comn-header-bar')).toBeInTheDocument();
  });

  /**
   * Verifies: every SVG icon the templates request is registered at startup, including the lock icon under the name the wmks template uses.
   * Interacts with: the real MatIconRegistry.addSvgIcon (spied).
   * Data: the icon names the templates request (svgIcon="..." across src/app).
   */
  it('registers every icon the templates use', async () => {
    const { registered } = await renderApp();
    const used = [
      'gear',
      'ic_clear_black_24px',
      'ic_clipboard_copy',
      'ic_clipboard_paste',
      'ic_error_outline_black_48px',
      'ic_lock_outline_black_48px',
      'ic_power_settings_new_black_48px',
      'keyboard',
    ];
    expect([...registered]).toEqual(expect.arrayContaining(used));
    expect(registered.has('ic_lock_outine_black_48px')).toBe(false);
  });

  /**
   * Verifies: the lock icon resolves to its SVG asset, so the wmks lock overlay is not blank.
   * Interacts with: the real MatIconRegistry.getNamedSvgIcon; HttpTestingController.
   * Data: icon 'ic_lock_outline_black_48px'.
   */
  it('loads the lock icon from its asset path', async () => {
    const { fixture, http } = await renderApp();
    const registry = fixture.debugElement.injector.get(MatIconRegistry);

    registry.getNamedSvgIcon('ic_lock_outline_black_48px').subscribe();

    http.expectOne('assets/svg-icons/ic_lock_outline_black_48px.svg');
  });
});
