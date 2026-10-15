// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { EnvironmentProviders, Provider, Type } from '@angular/core';
import { render, RenderComponentOptions } from '@testing-library/angular';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter, RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIconTestingModule } from '@angular/material/icon/testing';
import { getDefaultProviders } from './default-test-providers';

/**
 * Swaps a child component for a stub when the component under test is
 * standalone. (NgModule components swap children through `declarations`
 * instead.) Each entry removes `replace` from the component's own `imports`
 * and adds `with` in its place.
 */
export interface ChildStub {
  replace: Type<unknown>;
  with: Type<unknown>;
}

/**
 * Renders a component with the app's default providers, the modules every
 * Crucible component needs, and an empty router. Pass `declarations` (NgModule
 * apps) or `childStubs` (standalone apps) to replace child components.
 */
export async function renderComponent<T>(
  component: Type<T>,
  options?: Partial<RenderComponentOptions<T>> & { childStubs?: ChildStub[] },
) {
  const { childStubs = [], configureTestBed, ...renderOptions } = options ?? {};
  const providers: (Provider | EnvironmentProviders)[] = [
    provideRouter([]),
    ...getDefaultProviders(renderOptions.providers),
  ];
  return render(component, {
    ...renderOptions,
    imports: [
      NoopAnimationsModule,
      RouterModule,
      FormsModule,
      ReactiveFormsModule,
      MatIconTestingModule,
      ...(renderOptions.imports ?? []),
    ],
    providers,
    configureTestBed: (testBed) => {
      if (childStubs.length) {
        testBed.overrideComponent(component, {
          remove: { imports: childStubs.map((s) => s.replace) },
          add: { imports: childStubs.map((s) => s.with) },
        });
      }
      configureTestBed?.(testBed);
    },
  });
}
