/**
 * Copyright 2026 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

export type WmksLockKeyPatchResult = 'applied' | 'not-needed' | 'failed';

/** The SDK version whose `KeyboardManager2.sendVScanKey` swallows lock-key presses. */
const wmksLockKeyDefectVersion = '2.2.0';

/**
 * Works around a defect in VMWare HTML Console SDK 2.2.0 which prevents the guest OS from ever seeing
 * Caps Lock / Num Lock / Scroll Lock keypresses.
 *
 * In 2.2.0, `KeyboardManager2.sendVScanKey` only forwards a real keystroke (`_vncDecoder.onKeyVScan`) for
 * keys which are NOT lock keys. For lock keys it instead sends an `onKeyboardLedStatsChanged` state
 * declaration, so the guest never receives the keypress: its Num Lock stays latched on and its Caps Lock
 * latched off while every other key works normally.
 *
 * @param client A connected client returned by `WMKS.createWMKS`.
 * @returns "applied" if the patch is in place (whether this call installed it or a previous one did),
 * "not-needed" on an SDK version which reports itself as free of the defect, and "failed" if the SDK
 * internals the patch needs couldn't be resolved — in which case lock keys keep the unpatched behavior.
 */
export function patchWmksLockKeys(client: WmksClient): WmksLockKeyPatchResult {
  const lib = (window as Window & { WMKS?: WmksLib }).WMKS;

  if (!lib) {
    return 'failed';
  }

  // the patch replaces sendVScanKey outright, so never let it clobber a build which already behaves. A build
  // reporting no version at all still gets patched: 2.2.0 does report one, so the unknown case is likelier
  // to be a repackaged 2.2.0 than a fixed release.
  if (lib.version && lib.version !== wmksLockKeyDefectVersion) {
    return 'not-needed';
  }

  const ledKeys = lib.CONST?.KB2?.LedKeys;
  const modifierKeys = lib.CONST?.KB2?.ModifierKeys;
  const keyboardManager = client?.wmksData?._keyboardManager;

  if (!keyboardManager || !ledKeys || !modifierKeys) {
    return 'failed';
  }

  if (keyboardManager.__lockKeyPatchApplied) {
    return 'applied';
  }

  // the internals this patch rewrites aren't present on this build
  if (
    typeof keyboardManager.sendVScanKey !== 'function' ||
    typeof keyboardManager._onLedKeyChanged !== 'function'
  ) {
    return 'failed';
  }

  keyboardManager.sendVScanKey = function (
    vScanCode: number,
    isDown: boolean,
  ): void {
    // `this` matters here: the SDK's implementation is a closure over the manager instance, and callers
    // invoke it as a method, so preserve that rather than capturing `keyboardManager`.
    const manager = this as WmksKeyboardManager;

    manager._vncDecoder.onKeyVScan(vScanCode, isDown);

    if (modifierKeys.indexOf(vScanCode) !== -1) {
      manager._serverModifierStatus[vScanCode] = isDown;
    }

    // every lock-key keydown, including OS auto-repeats: on ChromeOS the SDK sends Num Lock down with no
    // matching up, so suppressing repeats would latch after the first press and drop every later one.
    if (ledKeys.indexOf(vScanCode) !== -1 && isDown) {
      manager._onLedKeyChanged(vScanCode);
    }
  };

  keyboardManager.__lockKeyPatchApplied = true;
  return 'applied';
}

/**
 * The undocumented slice of a WMKS client this patch needs: the jQuery widget instance behind it, which
 * holds the keyboard manager. Absent until the client has connected.
 */
export interface WmksClient {
  wmksData?: {
    _keyboardManager?: WmksKeyboardManager;
  };
}

/**
 * Undocumented internals of the SDK's `KeyboardManager2`, declared only to support
 * {@link patchWmksLockKeys}. Do not depend on these anywhere else.
 */
export interface WmksKeyboardManager {
  __lockKeyPatchApplied?: boolean;
  _onLedKeyChanged(vScanCode: number): void;
  _serverModifierStatus: Record<number, boolean>;
  _vncDecoder: { onKeyVScan(vScanCode: number, isDown: boolean): void };
  sendVScanKey(vScanCode: number, isDown: boolean): void;
}

/**
 * The subset of the global `WMKS` object this patch needs. `KB2` is absent on SDK builds which don't ship
 * the vscan keyboard manager.
 */
interface WmksLib {
  version?: string;
  CONST?: {
    KB2?: {
      LedKeys?: number[];
      ModifierKeys?: number[];
    };
  };
}
