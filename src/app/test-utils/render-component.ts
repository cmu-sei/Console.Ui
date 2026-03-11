// Copyright 2024 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { CUSTOM_ELEMENTS_SCHEMA, Type } from '@angular/core';
import { render, RenderComponentOptions } from '@testing-library/angular';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIconTestingModule } from '@angular/material/icon/testing';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { getDefaultProviders } from './vitest-default-providers';

export async function renderComponent<T>(
  component: Type<T>,
  options?: Partial<RenderComponentOptions<T>>
) {
  const providers = getDefaultProviders(options?.providers as any);
  return render(component, {
    ...options,
    imports: [
      NoopAnimationsModule,
      RouterTestingModule,
      FormsModule,
      ReactiveFormsModule,
      MatIconTestingModule,
      MatTooltipModule,
      MatFormFieldModule,
      MatInputModule,
      MatSlideToggleModule,
      MatMenuModule,
      MatButtonModule,
      MatDialogModule,
      ...(options?.imports ?? []),
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA, ...(options?.schemas ?? [])],
    providers,
  });
}
