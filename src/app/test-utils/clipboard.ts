// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Mock, onTestFinished, vi } from 'vitest';

// jsdom implements no Clipboard API, so navigator.clipboard is undefined. This
// installs one for the current test and removes it when the test finishes.
export function stubClipboard(text = ''): {
  readText: Mock<() => Promise<string>>;
  writeText: Mock<(value: string) => Promise<void>>;
} {
  const readText = vi.fn(() => Promise.resolve(text));
  const writeText = vi.fn((_value: string) => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', {
    value: { readText, writeText },
    configurable: true,
  });
  onTestFinished(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });
  return { readText, writeText };
}
