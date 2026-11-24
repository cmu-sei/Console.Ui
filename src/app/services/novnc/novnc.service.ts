/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import { Injectable, computed, signal } from '@angular/core';
import { Subject } from 'rxjs';
import RFB, { RfbEventMap } from '@novnc/novnc/lib/rfb.js';

// X11 keysyms for the keys sendText presses. Defined here rather than imported from noVNC's
// lib/input modules, which are private and blocked by noVNC 1.7's package exports.
const XK_TAB = 0xff09;
const XK_RETURN = 0xff0d;
const XK_SHIFT_L = 0xffe1;
// X11's Unicode keysym range: 0x01000000 | code point stands for that character.
const UNICODE_KEYSYM = 0x0100_0000;

/**
 * How long QEMU's VNC server takes to hand one key event to the guest, with a margin: its
 * key-delay-ms, 10 ms by default, which PVE does not change. Events that arrive faster wait in a
 * queue capped at 1024 entries, three per event, and the ones past the cap are dropped.
 */
export const KEY_EVENT_MS = 12;

/**
 * The most key events sendText sends before waiting for QEMU to type them: a press and release per
 * character, two more for Shift. Well under the roughly 340 events QEMU's queue holds, so a long
 * paste is neither cut short nor left with Shift held because its release was dropped.
 */
export const KEY_BATCH_EVENTS = 64;

/**
 * How the guest display is fitted to the console window. 'scale' scales the guest's own resolution
 * to fit; 'match' asks the guest to change its resolution to the window (SetDesktopSize), which
 * only works where the guest's display adapter can resize.
 */
export type ResolutionMode = 'scale' | 'match';

/**
 * What became of text sent to the guest: all of it sent, or none or only part of it because the
 * console wasn't connected (or was replaced by a reconnect), or was read-only.
 */
export type InputResult = 'sent' | 'not-connected' | 'read-only';

@Injectable({
  providedIn: 'root',
})
export class NoVNCService {
  private rfb: RFB;

  // Set by the current client's 'connect' and 'disconnect' events. noVNC's sendKey silently drops keys
  // unless the session is connected, so sendText checks the first. An unexpected drop leaves the client
  // in place while NovncComponent asks for a new console, so its presence alone does not say the session
  // is live.
  private clientConnected = false;
  private clientDisconnected = false;
  private screen: HTMLElement | null = null;
  private guestClipboard: string | null = null;
  private fullscreen = false;

  private readonly resolutionModeSignal = signal<ResolutionMode>('scale');
  // The user's choice, kept for the life of the page; reconnects and read-only switches reapply it.
  public readonly resolutionMode = this.resolutionModeSignal.asReadonly();

  private readonly resizeSupportedSignal = signal(false);
  // Whether the Vm's display adapter can change resolution, as vm.api reads it from the Vm's config
  // (canResizeDisplay). noVNC has no public way to tell whether a guest follows a resize request, so
  // the console does not try to detect it.
  public readonly resizeSupported = this.resizeSupportedSignal.asReadonly();

  private readonly viewOnlySignal = signal(false);

  // The mode actually applied: 'match' needs a display that can resize and a console that is not
  // view-only (noVNC never sends a resize from a view-only client).
  public readonly activeResolution = computed<ResolutionMode>(() =>
    this.resolutionModeSignal() === 'match' &&
    this.resizeSupportedSignal() &&
    !this.viewOnlySignal()
      ? 'match'
      : 'scale',
  );

  // Overridable so tests need not wait QEMU's pace.
  public keyEventMs = KEY_EVENT_MS;
  public keyBatchEvents = KEY_BATCH_EVENTS;
  // The text being typed, so a second sendText waits for the first rather than mixing its keys in.
  private typing: Promise<unknown> = Promise.resolve();

  private reconnectRequestsSubject = new Subject<void>();
  // NovncComponent owns the connection lifecycle, so a user's Reconnect is handed to it.
  public readonly reconnectRequests$ =
    this.reconnectRequestsSubject.asObservable();

  constructor() {
    document.addEventListener('fullscreenchange', () =>
      this.onFullscreenChange(),
    );
  }

  startClient(
    url: string,
    ticket: string,
    elementId: string,
    readOnly: boolean,
    backgroundColor: string,
  ) {
    this.screen = document.getElementById(elementId);
    this.guestClipboard = null;

    // Creating a new RFB object will start a new connection
    this.rfb = new RFB(this.screen, url, {
      credentials: {
        password: ticket,
      },
    });

    this.rfb.background = backgroundColor;
    this.configureClient(readOnly);
  }

  // Everything startClient sets up on a new client after constructing it.
  private configureClient(readOnly: boolean) {
    this.rfb.viewOnly = readOnly;
    this.viewOnlySignal.set(readOnly);
    this.applyResolution();
    this.trackGuestClipboard();
    this.trackConnection();
  }

  // Whether the Vm's display can resize, from vm.api. Applies the chosen mode if that changed.
  public setResizeSupported(supported: boolean) {
    if (supported !== this.resizeSupportedSignal()) {
      this.resizeSupportedSignal.set(supported);
      this.applyResolution();
    }
  }

  public setResolutionMode(mode: ResolutionMode) {
    this.resolutionModeSignal.set(mode);
    this.applyResolution();
  }

  // noVNC's own UI treats scaling and remote resizing as one either/or setting: when the guest
  // matches the window there is nothing to scale. Scaling is turned off first so the resize
  // request (sent as soon as resizeSession is set) measures the unscaled screen. A request made
  // before the server is ready is sent by noVNC once it is.
  private applyResolution() {
    if (!this.rfb) {
      return;
    }
    if (this.activeResolution() === 'match') {
      this.rfb.scaleViewport = false;
      this.rfb.resizeSession = true;
    } else {
      this.rfb.resizeSession = false;
      this.rfb.scaleViewport = true;
    }
  }

  private trackGuestClipboard() {
    this.rfb.addEventListener('clipboard', (e) => {
      this.guestClipboard = e.detail.text;
    });
  }

  /**
   * Whether there is a client whose session has not closed: true while connecting or connected, false
   * once it has dropped. A user's Reconnect relies on this. Disconnecting a client that has already
   * dropped fires no 'disconnect' event, so nothing would ever ask for a new console.
   */
  public isConnected(): boolean {
    return !!this.rfb && !this.clientDisconnected;
  }

  private trackConnection() {
    this.clientConnected = false;
    this.clientDisconnected = false;
    const rfb = this.rfb;
    // A replaced client's late events say nothing about the current one.
    this.rfb.addEventListener('connect', () => {
      if (this.rfb === rfb) {
        this.clientConnected = true;
      }
    });
    this.rfb.addEventListener('disconnect', () => {
      if (this.rfb === rfb) {
        this.clientConnected = false;
        this.clientDisconnected = true;
      }
    });
  }

  public requestReconnect() {
    this.reconnectRequestsSubject.next();
  }

  /**
   * The text the guest last put on its clipboard during this connection, or null if it sent none.
   * noVNC only hears about guest copies as they happen, so this is what Copy can hand over.
   */
  public getGuestClipboard(): string | null {
    return this.guestClipboard;
  }

  // Shows the console screen fullscreen. False when there is no screen or the browser refuses.
  public enterFullscreen(): boolean {
    if (document.fullscreenElement) {
      return true;
    }
    if (!this.screen?.requestFullscreen) {
      return false;
    }
    this.screen.requestFullscreen().catch(() => undefined);
    return true;
  }

  // noVNC can be left with the fullscreen scale after leaving fullscreen, which puts the pointer
  // somewhere other than where the user clicks. Recomputing the scale on exit avoids that. When the
  // guest matches the window there is no scale to fix, and noVNC's own resize observer asks the
  // guest for the new size.
  private onFullscreenChange() {
    const isFullscreen =
      !!this.screen && document.fullscreenElement === this.screen;
    if (
      this.fullscreen &&
      !isFullscreen &&
      this.rfb &&
      this.activeResolution() === 'scale'
    ) {
      this.rfb.scaleViewport = false;
      this.rfb.scaleViewport = true;
    }
    this.fullscreen = isFullscreen;
  }

  public disconnect() {
    if (this.rfb) {
      this.rfb.disconnect();
      this.rfb = null;
    }
    this.guestClipboard = null;
  }

  public setViewOnly(viewOnly: boolean) {
    this.viewOnlySignal.set(viewOnly);
    if (this.rfb) {
      this.rfb.viewOnly = viewOnly;
      this.applyResolution();
    }
  }

  public setConnectListener(func: (event: RfbEventMap['connect']) => void) {
    this.rfb.addEventListener('connect', func);
  }

  public setDisconnectListener(
    func: (event: RfbEventMap['disconnect']) => void,
  ) {
    this.rfb.addEventListener('disconnect', func);
  }

  public setSecurityFailureListener(
    func: (event: RfbEventMap['securityfailure']) => void,
  ) {
    this.rfb.addEventListener('securityfailure', func);
  }

  public setClipboardListener(func: (event: RfbEventMap['clipboard']) => void) {
    this.rfb.addEventListener('clipboard', func);
  }

  public sendCtrlAltDel() {
    this.rfb.sendCtrlAltDel();
  }

  /**
   * Puts text on the guest's clipboard (a VNC ClientCutText), for the guest to paste itself. Only
   * reaches the guest where QEMU's VNC clipboard is on (clipboard=vnc) and spice-vdagent runs in the
   * guest. False, sending nothing, when the console is not connected.
   */
  public sendClipboardText(text: string): InputResult {
    const blocked = this.inputBlocked(this.rfb);
    if (blocked) {
      return blocked;
    }
    this.rfb.clipboardPasteFrom(text);
    // QEMU doesn't echo a client's own clipboard update back to it, so without this a Copy straight
    // after would return what the guest last copied, not what is now on its clipboard.
    this.guestClipboard = text;
    return 'sent';
  }

  /**
   * Types text into the guest as key presses, one keysym per character. A line break (\n, \r\n
   * or \r) is sent as Enter and a tab as Tab; other control characters are dropped. Resolves 'sent'
   * once all of it has been typed. It resolves 'not-connected' or 'read-only', with the rest unsent,
   * when the console isn't connected or is read-only, or stops being so partway through. The text is
   * tied to the client present when it is submitted: if that client drops or a reconnect replaces it,
   * the rest is dropped too, rather than typed into a session that never saw the start of it.
   *
   * Keys are sent in batches of {@link keyBatchEvents} events, each followed by a wait long enough
   * for QEMU to type them ({@link KEY_EVENT_MS} per event). `lineDelayMs` adds a pause after each
   * Enter, the Send Text dialog's paste speed. A second call waits for the first to finish.
   *
   * The guest maps keysyms through its own keyboard layout, so characters its layout cannot
   * produce are lost there, the same caveat as WMKS sendInputString.
   *
   * The guest is assumed to use a US keyboard layout. On another layout some characters type
   * differently; a real clipboard (vncClipboardEnabled) avoids that where the guest has one.
   *
   * Characters typed with Shift on a US layout are sent with Shift held. QEMU's VNC server turns a
   * keysym into the key that produces it and does not press Shift itself, so a bare '!' arrives as
   * '1' and '"' as an apostrophe. Capitals survive without Shift only through QEMU's caps-lock sync,
   * which toggles the guest's Caps Lock to match.
   */
  public sendText(text: string, lineDelayMs = 0): Promise<InputResult> {
    // The client at submission, not when the queue reaches this text: queued text belongs to the
    // session it was typed for, and must not go to a reconnect's or another Vm's.
    const rfb = this.rfb;
    const typed = this.typing.then(() => this.typeText(rfb, text, lineDelayMs));
    this.typing = typed.catch(() => undefined);
    return typed;
  }

  private async typeText(
    rfb: RFB | null,
    text: string,
    lineDelayMs: number,
  ): Promise<InputResult> {
    const before = this.inputBlocked(rfb);
    if (before) {
      return before;
    }

    let batch = 0;
    // Waits for QEMU to type what has been sent, plus `extraMs`, and says whether the text can go on:
    // the session may have dropped, been replaced by a reconnect, or turned read-only meanwhile.
    const drain = async (extraMs = 0): Promise<InputResult | null> => {
      await this.waitForKeys(batch);
      batch = 0;
      if (extraMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, extraMs));
      }
      return this.inputBlocked(rfb);
    };

    for (const { keysym, shift } of NoVNCService.keyPressesFor(text)) {
      // A press and release, and Shift's around them; kept in one batch so Shift is never left held
      // across a wait.
      const events = shift ? 4 : 2;
      if (batch > 0 && batch + events > this.keyBatchEvents) {
        const blocked = await drain();
        if (blocked) {
          return blocked;
        }
      }

      if (shift) {
        rfb.sendKey(XK_SHIFT_L, null, true);
      }
      rfb.sendKey(keysym, null);
      if (shift) {
        rfb.sendKey(XK_SHIFT_L, null, false);
      }
      batch += events;

      // The Send Text dialog's paste speed: a pause after each line, for a guest that needs time to
      // act on one before the next arrives.
      if (keysym === XK_RETURN && lineDelayMs > 0) {
        const blocked = await drain(lineDelayMs);
        if (blocked) {
          return blocked;
        }
      }
    }

    // The last batch too, so text sent straight after this does not pile onto keys QEMU is still
    // typing.
    if (batch > 0) {
      await this.waitForKeys(batch);
    }
    return 'sent';
  }

  // Why keys and clipboard text sent to this client wouldn't reach the guest, or null when they
  // would: it must be the current client, its 'connect' event must have fired with no 'disconnect'
  // since, and the console must not be read-only, since noVNC drops input from a view-only client.
  private inputBlocked(rfb: RFB | null): Exclude<InputResult, 'sent'> | null {
    if (
      !rfb ||
      rfb !== this.rfb ||
      !this.clientConnected ||
      this.clientDisconnected
    ) {
      return 'not-connected';
    }
    return this.viewOnlySignal() ? 'read-only' : null;
  }

  private waitForKeys(events: number): Promise<void> {
    return new Promise((resolve) =>
      setTimeout(resolve, events * this.keyEventMs),
    );
  }

  /** The characters a US layout types with Shift held: the capitals and the shifted symbols. */
  private static readonly shiftedCharacters = new Set(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ~!@#$%^&*()_+{}|:"<>?',
  );

  /** The keysyms that type `text`, as {@link keysymsFor}, each with whether Shift is held for it. */
  public static keyPressesFor(
    text: string,
  ): { keysym: number; shift: boolean }[] {
    const result: { keysym: number; shift: boolean }[] = [];

    for (const character of text.replace(/\r\n?/g, '\n')) {
      const keysym = NoVNCService.keysymFor(character);
      if (keysym !== null) {
        result.push({
          keysym,
          shift: NoVNCService.shiftedCharacters.has(character),
        });
      }
    }

    return result;
  }

  /**
   * The X11 keysyms that type `text`. Iterates code points rather than UTF-16 units so characters
   * outside the BMP are not split. Latin-1 keysyms are the code points themselves; anything beyond
   * Latin-1 uses X11's Unicode keysym range (0x01000000 | code point), so no lookup table is needed.
   */
  public static keysymsFor(text: string): number[] {
    return NoVNCService.keyPressesFor(text).map((press) => press.keysym);
  }

  /** The keysym for one code point, or null for a control character that has none. */
  private static keysymFor(character: string): number | null {
    if (character === '\n') {
      return XK_RETURN;
    }
    if (character === '\t') {
      return XK_TAB;
    }

    const codePoint = character.codePointAt(0);
    // C0 controls, DEL and C1 controls have no printable keysym.
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) {
      return null;
    }

    return codePoint <= 0xff ? codePoint : UNICODE_KEYSYM | codePoint;
  }

  public updateBackground(backgroundColor: string) {
    if (this.rfb) {
      this.rfb.background = backgroundColor;
    }
  }
}
