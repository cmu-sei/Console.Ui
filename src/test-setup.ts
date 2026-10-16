// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';

// TestBed rethrows application errors (`rethrowApplicationErrors` defaults to
// true), so an unhandled rejection or a throw inside a subscribe that runs in
// Angular's zone (a lifecycle hook, a template event handler) surfaces as a
// Vitest "Uncaught Exception": it fails the run, while the test itself still
// shows as passed. This guard covers what that path misses: a direct
// `console.error` from app code or from Angular's runtime checks, and a promise
// rejection outside Angular's zone (a service called from the test body), which
// zone.js logs as `console.error(reason)`. Every `console.error` during a test
// therefore fails that test, with the messages attached.
//
// The check runs from a `beforeEach` teardown, not an `afterEach`. Vitest stops
// at the first `afterEach` that throws, and the builder registers Angular's
// TestBed cleanup as an `afterEach` that runs after this file's hooks. A guard
// that threw from `afterEach` would skip that cleanup, and every later test in
// the worker would fail with "test module has already been instantiated".
// Teardowns run after all `afterEach` hooks. A test that already failed is
// skipped, so its own rejection is not reported twice.
//
// A test that expects an error to be logged opts out by installing its own
// implementation: `vi.spyOn(console, 'error').mockImplementation(() => {})`.
// `restoreMocks: true` in vitest.config.ts restores the spy before each test.
beforeEach((context) => {
  const consoleErrors: unknown[][] = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args);
  });
  return () => {
    if (!consoleErrors.length || context.task.result?.state === 'fail') {
      return;
    }
    const lines = consoleErrors.map((args) => args.map(String).join(' '));
    throw new Error(
      `console.error was called ${consoleErrors.length} time(s) during this test:\n${lines.join('\n')}`,
    );
  };
});
