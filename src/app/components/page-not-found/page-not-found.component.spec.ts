// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/angular';
import { PageNotFoundComponent } from './page-not-found.component';
import { renderComponent } from '../../test-utils/render-component';

describe('PageNotFoundComponent', () => {
  /**
   * Verifies: unknown routes show the not-found message.
   * Interacts with: the component template.
   * Data: default render.
   */
  it('explains that the Vm was not found', async () => {
    await renderComponent(PageNotFoundComponent);
    expect(screen.getByRole('heading', { name: 'VM Not Found' })).toBeInTheDocument();
    expect(screen.getByText(/no longer exists or you do not have permission/)).toBeInTheDocument();
  });
});
