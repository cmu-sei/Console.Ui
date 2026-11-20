// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { inIframe } from './console-helpers';

describe('inIframe', () => {
  afterEach(() => vi.restoreAllMocks());

  /**
   * Verifies: a console in its own tab is not framed.
   * Interacts with: window.top (the test page is its own top).
   */
  it('is false at the top level', () => {
    expect(inIframe()).toBe(false);
  });

  /**
   * Verifies: a parent the console cannot read counts as framed.
   * Interacts with: window.top, made to throw as a cross-origin parent does.
   * Why: a Player view on another origin makes reading window.top throw instead of returning a window.
   */
  it('is true when the parent cannot be read', () => {
    vi.spyOn(window, 'top', 'get').mockImplementation(() => {
      throw new DOMException('Blocked a frame', 'SecurityError');
    });
    expect(inIframe()).toBe(true);
  });
});
