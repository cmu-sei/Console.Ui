// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { onTestFinished } from 'vitest';
import { Observable } from 'rxjs';

/**
 * Subscribes and records every emission (deep-cloned, so later store updates
 * cannot rewrite earlier entries). Unsubscribes when the test finishes.
 * Akita queries emit synchronously on subscribe, so `seen[0]` is the current
 * value and later entries follow each store update.
 */
export function recordEmissions<T>(source: Observable<T>): T[] {
  const seen: T[] = [];
  const subscription = source.subscribe((value) =>
    seen.push(structuredClone(value)),
  );
  onTestFinished(() => subscription.unsubscribe());
  return seen;
}
