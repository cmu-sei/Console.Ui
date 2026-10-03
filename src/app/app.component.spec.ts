// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi, beforeEach, onTestFinished } from 'vitest';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';
import { BehaviorSubject, Subject } from 'rxjs';
import { RouterQuery } from '@datorama/akita-ng-router-store';
import {
  ComnAuthQuery,
  ComnAuthService,
  ComnHeaderBarModule,
  ComnSettingsService,
  Theme,
} from '@cmusei/crucible-common';
import { AppComponent } from './app.component';
import { renderComponent } from './test-utils/render-component';
import {
  captureUnhandledRxErrors,
  flush,
} from './test-utils/unhandled-rx-errors';

@Component({ selector: 'comn-header-bar', template: '' })
class HeaderBarStubComponent {}

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
  const routerQuery: Pick<RouterQuery, 'selectQueryParams'> = {
    selectQueryParams: (() => themeParam$.asObservable()) as RouterQuery['selectQueryParams'],
  };

  const rendered = await renderComponent(AppComponent, {
    childStubs: [{ replace: ComnHeaderBarModule, with: HeaderBarStubComponent }],
    providers: [
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
          settings: overrides.settings ?? {
            AppTopBarHexColor: '#3B62A5',
            AppTopBarHexTextColor: '#FFFFFF',
          },
        } satisfies Pick<ComnSettingsService, 'settings'>,
      },
    ],
  });
  const router = rendered.fixture.debugElement.injector.get(Router);
  vi.spyOn(router, 'navigate').mockImplementation(navigate);

  const registered = new Set(addSvgIcon.mock.calls.map(([name]) => name));

  return { ...rendered, theme$, themeParam$, auth, navigate, registered };
}

describe('AppComponent', () => {
  beforeEach(() => {
    document.body.classList.remove('darkMode');
    document.documentElement.style.removeProperty('--mat-sys-primary');
  });

  /**
   * Verifies: the user's theme toggles the darkMode body class.
   * Interacts with: ComnAuthQuery.userTheme$; document.body.classList.
   * Data: light, then dark, then light.
   */
  it('applies the user theme to the page', async () => {
    const { theme$ } = await renderApp();
    expect(document.body).not.toHaveClass('darkMode');

    theme$.next(Theme.DARK);
    expect(document.body).toHaveClass('darkMode');

    theme$.next(Theme.LIGHT);
    expect(document.body).not.toHaveClass('darkMode');
  });

  /**
   * Verifies: the top bar colours come from settings, with the Crucible red as fallback.
   * Interacts with: ComnSettingsService.settings; the --mat-sys-primary custom property.
   * Data: AppTopBarHexColor '#3B62A5'.
   */
  it('sets the primary colour from settings', async () => {
    await renderApp();
    expect(document.documentElement.style.getPropertyValue('--mat-sys-primary')).toBe('#3B62A5');
  });

  /**
   * Verifies: without a configured colour the Crucible red is used.
   * Interacts with: ComnSettingsService.settings; --mat-sys-primary.
   * Data: empty settings.
   */
  it('falls back to the default primary colour', async () => {
    await renderApp({ settings: {} });
    expect(document.documentElement.style.getPropertyValue('--mat-sys-primary')).toBe('#C41230');
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
   * Verifies: the console's SVG icons are registered at startup, except the lock icon, which is registered under a misspelled name.
   * Interacts with: the real MatIconRegistry.addSvgIcon (spied).
   * Data: the icon names the templates request (svgIcon="..." across src/app).
   */
  it('registers every icon the templates use except the lock icon', async () => {
    const { registered } = await renderApp();
    const used = [
      'gear',
      'ic_clear_black_24px',
      'ic_clipboard_copy',
      'ic_clipboard_paste',
      'ic_error_outline_black_48px',
      'ic_power_settings_new_black_48px',
      'keyboard',
    ];
    expect([...registered]).toEqual(expect.arrayContaining(used));
    expect(registered.has('ic_lock_outline_black_48px')).toBe(false);
    expect(registered.has('ic_lock_outine_black_48px')).toBe(true);
  });

  /**
   * Verifies: a favicon that cannot be fetched for recolouring leaves an unhandled rejection (current behavior).
   * Interacts with: a <link rel="icon"> in the document; global fetch (spied, rejecting); captureUnhandledRxErrors.
   * Data: AppTopBarHexColor '#3B62A5'; fetch rejects with 'offline'.
   * Why: the chain is built in the constructor inside the Angular zone, which reports the rejection on NgZone.onError; the ComponentFixture rethrows that from an rxjs subscriber, so it surfaces through rxjs's unhandled-error hook.
   */
  it('lets a failed favicon fetch escape unhandled', async () => {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = 'https://console.test/favicon.svg';
    document.head.appendChild(link);
    onTestFinished(() => link.remove());
    const offline = new TypeError('offline');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(offline);
    const errors = captureUnhandledRxErrors();

    await renderApp();
    await flush();

    expect(errors).toEqual([offline]);
    expect(link.href).toBe('https://console.test/favicon.svg');
  });
});
