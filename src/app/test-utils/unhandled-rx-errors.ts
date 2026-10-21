// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { onTestFinished, vi } from 'vitest';
import { config } from 'rxjs';

/**
 * Collects errors that reach a subscription with no error callback. rxjs
 * rethrows those from a setTimeout, which Vitest reports as an unhandled error
 * and fails the run; routing them here lets a test pin that the error escapes
 * (the "subscribe() with no error callback" pattern; CONVENTIONS.md says when
 * that is a defect). Await `flush()` before asserting on the returned array.
 *
 * It records a rejection inside Angular's zone too: a promise a lifecycle
 * hook, a template event handler or an operator such as `tap` drops (a hub call
 * that rejects). zone.js hands that rejection to NgZone.onError, which the
 * ComponentFixture rethrows from an rxjs subscriber, so rxjs reports it here;
 * the TestBed's ErrorHandler never sees it, whatever `rethrowApplicationErrors`
 * says. That is how a test makes that very call reject and pins that the
 * rejection escapes (the proof `check-repo.js scan` runs for a dropped promise):
 * `const errors = captureUnhandledRxErrors();`, render with the call rejecting,
 * `await flush()`, `expect(errors).toEqual([failure])`.
 */
export function captureUnhandledRxErrors(): unknown[] {
  const errors: unknown[] = [];
  const previous = config.onUnhandledError;
  config.onUnhandledError = (err) => errors.push(err);
  onTestFinished(() => {
    config.onUnhandledError = previous;
  });
  return errors;
}

/**
 * Collects promise rejections that nothing handled outside Angular's zone (a
 * service called from the test body, a hub invoke that rejects there). zone.js
 * keeps them from Node's 'unhandledRejection' event: once the microtask queue
 * drains, it logs each one as `console.error(reason)`, the reason alone with
 * no prefix. A rejection inside Angular's zone (a lifecycle hook, a template
 * event handler) never reaches this helper: the ComponentFixture rethrows it
 * through rxjs, so `captureUnhandledRxErrors()` above records it; unrecorded,
 * Vitest reports it as a run-level "Uncaught Exception" (see test-setup.ts).
 * This spies on `console.error` (which opts the
 * test out of the guard in test-setup.ts) and returns a live array of every
 * argument logged. Await `flush()`, then assert on the whole array, so an
 * unrelated error still fails the test: `expect(rejections).toEqual([error])`.
 * Pair it with `rejectInvokes()` (fake-hub-connection.ts) for hub calls; a
 * rejection that comes from a `vi.fn` counts as handled.
 */
export function captureUnhandledRejections(): unknown[] {
  const rejections: unknown[] = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    rejections.push(...args);
  });
  return rejections;
}

/** Lets queued microtasks and one macrotask run (promise chains, rxjs rethrows). */
export const flush = () => new Promise<void>((r) => setTimeout(r));
