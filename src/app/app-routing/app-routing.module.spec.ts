// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Route, Router } from '@angular/router';
import { ComnAuthGuardService } from '@cmusei/crucible-common';
import { ConsolePageComponent } from '../components/console-page/console-page.component';
import { PageNotFoundComponent } from '../components/page-not-found/page-not-found.component';
import { UserFollowPageComponent } from '../components/user-follow-page/user-follow-page.component';
import { routes } from './app-routing.module';

// No RouterOutlet is rendered, so a successful navigation resolves the route
// (guards, lazy component) without constructing the page component.
function setup(allowed: boolean) {
  const guard = {
    canActivate: vi.fn(() => Promise.resolve(allowed)),
  } satisfies Pick<ComnAuthGuardService, 'canActivate'>;
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      { provide: ComnAuthGuardService, useValue: guard },
    ],
  });
  return { router: TestBed.inject(Router), guard };
}

function route(path: string): Route {
  const found = routes.find((r) => r.path === path);
  if (!found) throw new Error(`No route '${path}'`);
  return found;
}

describe('app routes', () => {
  const consoleRoutes: Array<[string, string, Type<unknown>]> = [
    ['vm/:id/console', '/vm/vm-1/console', ConsolePageComponent],
    [
      'user/:userId/view/:viewId/console',
      '/user/u1/view/view-1/console',
      UserFollowPageComponent,
    ],
  ];

  describe.each(consoleRoutes)('%s', (path, url, component) => {
    /**
     * Verifies: the console route lazily loads its page component.
     * Interacts with: the route's loadComponent.
     * Data: the route under test.
     */
    it('loads its page component', async () => {
      expect(await route(path).loadComponent?.()).toBe(component);
    });

    /**
     * Verifies: a signed-out user is held at the auth guard and the console route is not entered.
     * Interacts with: Router; ComnAuthGuardService.canActivate stub (false).
     * Data: the route's example URL.
     */
    it('blocks navigation when the auth guard denies it', async () => {
      const { router, guard } = setup(false);

      expect(await router.navigateByUrl(url)).toBe(false);
      expect(guard.canActivate).toHaveBeenCalledOnce();
      expect(router.url).toBe('/');
    });

    /**
     * Verifies: a signed-in user reaches the console route.
     * Interacts with: Router; ComnAuthGuardService.canActivate stub (true).
     * Data: the route's example URL.
     */
    it('navigates when the auth guard allows it', async () => {
      const { router, guard } = setup(true);

      expect(await router.navigateByUrl(url)).toBe(true);
      expect(guard.canActivate).toHaveBeenCalledOnce();
      expect(router.url).toBe(url);
    });
  });

  /**
   * Verifies: any other URL shows the not-found page without asking the auth guard.
   * Interacts with: Router; the '**' route's loadComponent; ComnAuthGuardService.canActivate stub.
   * Data: '/nowhere', with the guard set to deny.
   */
  it('sends unknown URLs to the not-found page without the auth guard', async () => {
    const { router, guard } = setup(false);

    expect(await router.navigateByUrl('/nowhere')).toBe(true);
    expect(guard.canActivate).not.toHaveBeenCalled();
    expect(await route('**').loadComponent?.()).toBe(PageNotFoundComponent);
  });
});
