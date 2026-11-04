/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import { Injectable, computed, signal } from '@angular/core';
import { Subject } from 'rxjs';
import RFB from '@novnc/novnc/lib/rfb.js';
import KeyTable from '@novnc/novnc/lib/input/keysym.js';
import keysyms from '@novnc/novnc/lib/input/keysymdef.js';

/**
 * How the guest display is fitted to the console window. 'scale' scales the guest's own resolution
 * to fit; 'match' asks the guest to change its resolution to the window (SetDesktopSize), which
 * only works where the VNC server supports it and the guest's display adapter can resize.
 */
export type ResolutionMode = 'scale' | 'match';

/**
 * How long a resize request has to change the guest's framebuffer before the console concludes the
 * guest can't resize and goes back to scaling. QEMU accepts SetDesktopSize whatever the display
 * adapter, so a std VGA guest only shows it by never changing size.
 */
export const RESIZE_VERIFY_TIMEOUT_MS = 3000;

// ExtendedDesktopSize status codes (RFB 7.8.2), the rect's y when its x is 1 (this client asked):
// 1 prohibited, 2 out of resources, 3 invalid layout. QEMU answers every request with 4, "request
// forwarded" to the display adapter, which says nothing about whether the guest will follow.
const RESIZE_REJECTED_STATUSES = new Set([1, 2, 3]);

// The noVNC internals used to learn whether the server accepts SetDesktopSize and whether the guest
// followed a request. Not public API, so all are read defensively and may be missing in another
// noVNC version.
interface RfbResizeInternals {
  // Set once the server has sent an ExtendedDesktopSize rect (lib/rfb.js, _handleExtendedDesktopSize).
  _supportsSetDesktopSize?: boolean;
  _handleExtendedDesktopSize?: (...args: unknown[]) => boolean;
  // Sends SetDesktopSize for _screenSize(), floored, when resizeSession is on (lib/rfb.js).
  _requestRemoteResize?: (...args: unknown[]) => unknown;
  _screenSize?: () => { w: number; h: number };
  // The guest framebuffer size, updated by _resize when the server reports a new size.
  _fbWidth?: number;
  _fbHeight?: number;
  // The rect being handled; for ExtendedDesktopSize x is the reason and y the status.
  _FBU?: { x?: number; y?: number };
}

interface Size {
  w: number;
  h: number;
}

@Injectable({
  providedIn: 'root',
})
export class NoVNCService {
  private rfb: RFB;

  // Set once the current client reports its connection closed, however it closed. An unexpected drop
  // leaves the client in place while NovncComponent asks for a new console, so its presence alone
  // does not say the session is live.
  private clientDisconnected = false;
  private screen: HTMLElement | null = null;
  private guestClipboard: string | null = null;
  private fullscreen = false;

  private readonly resolutionModeSignal = signal<ResolutionMode>('scale');
  // The user's choice, kept for the life of the page; reconnects and read-only switches reapply it.
  public readonly resolutionMode = this.resolutionModeSignal.asReadonly();

  private readonly resizeSupportedSignal = signal(false);
  // Whether the connected server accepts resize requests. Unknown, so false, until it says so after
  // connecting; reset for each new connection.
  public readonly resizeSupported = this.resizeSupportedSignal.asReadonly();

  private readonly viewOnlySignal = signal(false);

  // The mode actually applied: 'match' needs a server that can resize and a console that is not
  // view-only (noVNC never sends a resize from a view-only client).
  public readonly activeResolution = computed<ResolutionMode>(() =>
    this.resolutionModeSignal() === 'match' &&
    this.resizeSupportedSignal() &&
    !this.viewOnlySignal()
      ? 'match'
      : 'scale',
  );

  // Set for the connection when the guest showed it can't resize: it rejected a request, or a
  // request left its framebuffer unchanged. Overrides what the server advertised.
  private resizeRejected = false;
  private resizeCheck: ReturnType<typeof setTimeout> | null = null;
  // Overridable so tests need not wait the real timeout.
  public resizeVerifyTimeoutMs = RESIZE_VERIFY_TIMEOUT_MS;

  private resizeFallbackSubject = new Subject<void>();
  // Fires once each time Match Window Size falls back to scaling because the guest didn't resize.
  public readonly resizeFallback$ = this.resizeFallbackSubject.asObservable();

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
    this.resetResizeVerdict();
    this.applyResolution();
    this.trackResizeSupport();
    this.trackGuestClipboard();
    this.trackConnectionLoss();
  }

  // noVNC raises no event when it learns the server can resize: it just sets _supportsSetDesktopSize
  // on the first ExtendedDesktopSize rect, which arrives after 'connect'. Wrapping that handler on
  // this client is the earliest hook; 'connect' is checked as well in case the handler is renamed.
  // The same rect carries the server's answer to this client's resize requests, so a rejection is
  // picked up there too.
  private trackResizeSupport() {
    const rfb = this.rfb as unknown as RfbResizeInternals;
    const handler = rfb._handleExtendedDesktopSize;
    if (typeof handler === 'function') {
      rfb._handleExtendedDesktopSize = (...args: unknown[]) => {
        const handled = handler.apply(rfb, args);
        if (handled && this.rfb === (rfb as unknown as RFB)) {
          const update = rfb._FBU;
          if (update?.x === 1 && RESIZE_REJECTED_STATUSES.has(update.y ?? 0)) {
            this.fallBackToScaling();
          }
        }
        this.refreshResizeSupport();
        return handled;
      };
    }
    // Every resize request goes through here: the resizeSession setter, and noVNC's debounced
    // window-resize handler.
    const request = rfb._requestRemoteResize;
    if (typeof request === 'function') {
      rfb._requestRemoteResize = (...args: unknown[]) => {
        const result = request.apply(rfb, args);
        if (this.rfb === (rfb as unknown as RFB)) {
          this.verifyResize();
        }
        return result;
      };
    }
    this.rfb.addEventListener('connect', () => this.refreshResizeSupport());
  }

  private framebufferSize(): Size | null {
    const rfb = this.rfb as unknown as RfbResizeInternals;
    const w = rfb?._fbWidth;
    const h = rfb?._fbHeight;
    return typeof w === 'number' && typeof h === 'number' ? { w, h } : null;
  }

  // The size noVNC asks for: its screen element's size, floored as _requestRemoteResize sends it.
  private requestedSize(): Size | null {
    const rfb = this.rfb as unknown as RfbResizeInternals;
    if (typeof rfb?._screenSize !== 'function') {
      return null;
    }
    const size = rfb._screenSize();
    return { w: Math.floor(size.w), h: Math.floor(size.h) };
  }

  // A server can advertise resize while the guest can't follow (QEMU with std VGA), and nothing
  // reports that: the framebuffer just stays the size it was. So after each request under Match
  // Window Size, a framebuffer that hasn't changed within the timeout means the guest can't resize.
  // A request for the size the guest already has changes nothing and proves nothing.
  private verifyResize() {
    this.cancelResizeCheck();
    if (this.activeResolution() !== 'match') {
      return;
    }
    const before = this.framebufferSize();
    const requested = this.requestedSize();
    if (
      !before ||
      !requested ||
      (requested.w === before.w && requested.h === before.h)
    ) {
      return;
    }
    this.resizeCheck = setTimeout(() => {
      this.resizeCheck = null;
      const now = this.framebufferSize();
      if (now && now.w === before.w && now.h === before.h) {
        this.fallBackToScaling();
      }
    }, this.resizeVerifyTimeoutMs);
  }

  private cancelResizeCheck() {
    if (this.resizeCheck !== null) {
      clearTimeout(this.resizeCheck);
      this.resizeCheck = null;
    }
  }

  // Marks resize unsupported for this connection, scales instead, and says so once. The user's
  // choice is kept, so a new connection tries it again.
  private fallBackToScaling() {
    this.cancelResizeCheck();
    if (this.resizeRejected) {
      return;
    }
    const wasMatching = this.activeResolution() === 'match';
    this.resizeRejected = true;
    this.resizeSupportedSignal.set(false);
    this.applyResolution();
    if (wasMatching) {
      this.resizeFallbackSubject.next();
    }
  }

  private resetResizeVerdict() {
    this.cancelResizeCheck();
    this.resizeRejected = false;
    this.resizeSupportedSignal.set(false);
  }

  // Re-reads whether the server can resize, and applies the chosen mode if that changed.
  public refreshResizeSupport() {
    const supported =
      !!this.rfb &&
      !this.resizeRejected &&
      (this.rfb as unknown as RfbResizeInternals)._supportsSetDesktopSize ===
        true;
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
  // request (sent as soon as resizeSession is set) measures the unscaled screen.
  private applyResolution() {
    if (!this.rfb) {
      return;
    }
    if (this.activeResolution() === 'match') {
      this.rfb.scaleViewport = false;
      this.rfb.resizeSession = true;
      // noVNC sends the request from the resizeSession setter, which verifyResize also hears
      // through the _requestRemoteResize wrapper; checking here as well covers a noVNC without it.
      this.verifyResize();
    } else {
      this.cancelResizeCheck();
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

  private trackConnectionLoss() {
    this.clientDisconnected = false;
    const rfb = this.rfb;
    this.rfb.addEventListener('disconnect', () => {
      // A replaced client's late event says nothing about the current one.
      if (this.rfb === rfb) {
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
    this.resetResizeVerdict();
  }

  public setViewOnly(viewOnly: boolean) {
    this.viewOnlySignal.set(viewOnly);
    if (this.rfb) {
      this.rfb.viewOnly = viewOnly;
      this.applyResolution();
    }
  }

  public setConnectListener(func: Function) {
    this.rfb.addEventListener('connect', func);
  }

  public setDisconnectListener(func: Function) {
    this.rfb.addEventListener('disconnect', func);
  }

  public setSecurityFailureListener(func: Function) {
    this.rfb.addEventListener('securityfailure', func);
  }

  public setClipboardListener(func: Function) {
    this.rfb.addEventListener('clipboard', func);
  }

  public sendCtrlAltDel() {
    this.rfb.sendCtrlAltDel();
  }

  public sendClipboardText(text: string) {
    this.rfb.clipboardPasteFrom(text);
  }

  /**
   * Types text into the guest as key presses, one keysym per character. A line break (\n, \r\n
   * or \r) is sent as Enter and a tab as Tab; other control characters are dropped. Returns false,
   * sending nothing, when there is no connected client.
   *
   * The guest maps keysyms through its own keyboard layout, so characters its layout cannot
   * produce are lost there, the same caveat as WMKS sendInputString.
   *
   * Characters typed with Shift on a US layout are sent with Shift held. QEMU's VNC server turns a
   * keysym into the key that produces it and does not press Shift itself, so a bare '!' arrives as
   * '1' and '"' as an apostrophe. Capitals survive without Shift only through QEMU's caps-lock sync,
   * which toggles the guest's Caps Lock to match.
   */
  public sendText(text: string): boolean {
    if (!this.rfb) {
      return false;
    }

    for (const { keysym, shift } of NoVNCService.keyPressesFor(text)) {
      if (shift) {
        this.rfb.sendKey(KeyTable.XK_Shift_L, null, true);
      }
      this.rfb.sendKey(keysym, null);
      if (shift) {
        this.rfb.sendKey(KeyTable.XK_Shift_L, null, false);
      }
    }

    return true;
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
   * outside the BMP are not split, and uses noVNC's own Unicode-to-keysym table: Latin-1 maps
   * one-to-one, the legacy keysym ranges (Latin-2 through Greek, Cyrillic, ...) come from its
   * table, and anything else falls back to the Unicode keysym range (0x01000000 + code point).
   */
  public static keysymsFor(text: string): number[] {
    return NoVNCService.keyPressesFor(text).map((press) => press.keysym);
  }

  /** The keysym for one code point, or null for a control character that has none. */
  private static keysymFor(character: string): number | null {
    if (character === '\n') {
      return KeyTable.XK_Return;
    }
    if (character === '\t') {
      return KeyTable.XK_Tab;
    }

    const codePoint = character.codePointAt(0);
    // C0 controls, DEL and C1 controls have no printable keysym.
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) {
      return null;
    }

    return keysyms.lookup(codePoint);
  }

  public updateBackground(backgroundColor: string) {
    if (this.rfb) {
      this.rfb.background = backgroundColor;
    }
  }
}
