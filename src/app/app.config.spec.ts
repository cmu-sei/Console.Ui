// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ApplicationRef,
  NgZone,
  ɵNoopNgZone as NoopNgZone,
} from '@angular/core';
import {
  HttpBackend,
  HttpErrorResponse,
  HttpEvent,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { createApplication } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { appConfig } from './app.config';
import { routes } from './app-routing/app-routing.module';

/**
 * Serves the app's own src/assets/config/*.json files, so the settings app
 * initializer completes as it does in a browser. Any other request fails.
 */
class AssetsBackend implements HttpBackend {
  handle(req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    const path = `src/${req.url.replace(/^\//, '')}`;
    if (req.url.startsWith('assets/config/') && existsSync(path)) {
      const body = JSON.parse(readFileSync(path, 'utf8'));
      return of(new HttpResponse({ status: 200, url: req.url, body }));
    }
    return throwError(
      () => new HttpErrorResponse({ status: 404, url: req.url }),
    );
  }
}

/**
 * The app's own providers, not provideX() bundles: { provide } entries and
 * plain service classes.
 */
function ownProviders(): { token: unknown; isClass: boolean }[] {
  type Own = { token: unknown; isClass: boolean };
  return appConfig.providers.flatMap((p: unknown): Own[] =>
    typeof p === 'function'
      ? [{ token: p, isClass: true }]
      : p && typeof p === 'object' && 'provide' in p
        ? [{ token: (p as { provide: unknown }).provide, isClass: false }]
        : [],
  );
}

/** Dependency injection errors: a missing provider (NG0201) or a cycle (NG0200). */
const DI_ERROR = /NG020[01]|No provider/;

describe('appConfig', () => {
  let app: ApplicationRef | undefined;

  async function bootstrapProviders(): Promise<ApplicationRef> {
    app = await createApplication({
      providers: [
        ...appConfig.providers,
        { provide: HttpBackend, useClass: AssetsBackend },
      ],
    });
    return app;
  }

  afterEach(() => app?.destroy());

  /**
   * Verifies: the root providers that main.ts bootstraps with start a real application root in dev mode: the app initializers (settings) finish, the router has the app's routes, each { provide } entry is created without error, and each service class has its dependencies. This catches NG0800 (a standalone component inside importProvidersFrom), a missing provideRouter(), and missing or circular dependencies. The build and the other specs never load main.ts, so nothing else does.
   * Interacts with: the real appConfig providers via createApplication(); an HttpBackend that serves src/assets/config. No component is bootstrapped.
   * Data: the app's checked-in settings files.
   */
  it('starts an application root with the app routes and providers', async () => {
    const root = (await bootstrapProviders()).injector;

    expect(root.get(Router).config).toEqual(expect.arrayContaining(routes));
    const failures = ownProviders().flatMap(({ token, isClass }) => {
      try {
        root.get(token as never);
        return [];
      } catch (e) {
        const message = String((e as Error)?.message ?? e);
        // A service class may need state that only exists later, such as the
        // active route's params. Only DI errors count for those.
        return isClass && !DI_ERROR.test(message) ? [] : [message];
      }
    });
    expect(failures).toEqual([]);
  });

  /**
   * Verifies: the app runs with zone-based change detection, as it did before the standalone migration. In Angular 21 bootstrapApplication is zoneless unless provideZoneChangeDetection() is in the root providers, and TestBed is zoneless too, so the other specs cannot notice.
   * Interacts with: the real appConfig providers via createApplication(); NgZone.
   * Data: the app's checked-in settings files.
   */
  it('uses zone-based change detection', async () => {
    const root = (await bootstrapProviders()).injector;

    expect(root.get(NgZone)).not.toBeInstanceOf(NoopNgZone);
  });
});
