// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Mock, vi } from 'vitest';
import { EMPTY, Observable, of, Subject } from 'rxjs';
import { MatDialogRef } from '@angular/material/dialog';
import { MatBottomSheetRef } from '@angular/material/bottom-sheet';

// The refs are typed off the real classes, so the stand-ins track the members a
// dialog host actually touches and a vi.fn() close spy stays assignable.
type DialogRefStub<T, R> = Pick<
  MatDialogRef<T, R>,
  'close' | 'disableClose' | 'keydownEvents' | 'afterClosed'
>;

export interface DialogRefStubResult<T, R> {
  dialogRef: MatDialogRef<T, R>;
  close: Mock;
  /** Feeds `keydownEvents()`: `keydown.next(new KeyboardEvent(...))`. */
  keydown: Subject<KeyboardEvent>;
}

function buildDialogRef<T, R>(
  afterClosed: Observable<R | undefined>,
): DialogRefStubResult<T, R> {
  const close = vi.fn();
  const keydown = new Subject<KeyboardEvent>();
  const stub: DialogRefStub<T, R> = {
    close,
    disableClose: false,
    keydownEvents: () => keydown.asObservable(),
    afterClosed: () => afterClosed,
  };
  return { dialogRef: stub as MatDialogRef<T, R>, close, keydown };
}

/**
 * A MatDialogRef stand-in. Pass `afterClosedResult` to simulate the dialog
 * closing with a value (a confirm dialog answering `true`); leave it out for a
 * dialog whose `afterClosed()` should stay silent (it completes without
 * emitting). For a dialog the user dismissed, use `dismissedDialogRefStub()`.
 */
export function dialogRefStub<T, R = unknown>(
  afterClosedResult?: R,
): DialogRefStubResult<T, R> {
  return buildDialogRef<T, R>(
    afterClosedResult === undefined ? EMPTY : of(afterClosedResult),
  );
}

/**
 * A MatDialogRef whose dialog was dismissed (Escape, a backdrop click, or
 * `close()` with no result): `afterClosed()` emits `undefined`, then
 * completes, as the real ref does.
 */
export function dismissedDialogRefStub<T, R = unknown>() {
  return buildDialogRef<T, R>(of(undefined));
}

export function bottomSheetRefStub<T>(): {
  sheetRef: MatBottomSheetRef<T>;
  dismiss: Mock;
} {
  const dismiss = vi.fn();
  const stub: Pick<MatBottomSheetRef<T>, 'dismiss'> = { dismiss };
  return { sheetRef: stub as MatBottomSheetRef<T>, dismiss };
}
