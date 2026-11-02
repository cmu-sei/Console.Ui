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

// The noVNC internals used to learn whether the server accepts SetDesktopSize. Not public API, so
// both are read defensively and may be missing in another noVNC version.
interface RfbResizeInternals {
  // Set once the server has sent an ExtendedDesktopSize rect (lib/rfb.js, _handleExtendedDesktopSize).
  _supportsSetDesktopSize?: boolean;
  _handleExtendedDesktopSize?: (...args: unknown[]) => boolean;
}

@Injectable({
  providedIn: 'root',
})
export class NoVNCService {
  private rfb: RFB;
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
    this.resizeSupportedSignal.set(false);
    this.applyResolution();
    this.trackResizeSupport();
    this.trackGuestClipboard();
  }

  // noVNC raises no event when it learns the server can resize: it just sets _supportsSetDesktopSize
  // on the first ExtendedDesktopSize rect, which arrives after 'connect'. Wrapping that handler on
  // this client is the earliest hook; 'connect' is checked as well in case the handler is renamed.
  private trackResizeSupport() {
    const rfb = this.rfb as unknown as RfbResizeInternals;
    const handler = rfb._handleExtendedDesktopSize;
    if (typeof handler === 'function') {
      rfb._handleExtendedDesktopSize = (...args: unknown[]) => {
        const handled = handler.apply(rfb, args);
        this.refreshResizeSupport();
        return handled;
      };
    }
    this.rfb.addEventListener('connect', () => this.refreshResizeSupport());
  }

  // Re-reads whether the server can resize, and applies the chosen mode if that changed.
  public refreshResizeSupport() {
    const supported =
      !!this.rfb &&
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

  public isConnected(): boolean {
    return !!this.rfb;
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
    this.resizeSupportedSignal.set(false);
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
   */
  public sendText(text: string): boolean {
    if (!this.rfb) {
      return false;
    }

    for (const keysym of NoVNCService.keysymsFor(text)) {
      this.rfb.sendKey(keysym, null);
    }

    return true;
  }

  /**
   * The X11 keysyms that type `text`. Iterates code points rather than UTF-16 units so characters
   * outside the BMP are not split, and uses noVNC's own Unicode-to-keysym table: Latin-1 maps
   * one-to-one, the legacy keysym ranges (Latin-2 through Greek, Cyrillic, ...) come from its
   * table, and anything else falls back to the Unicode keysym range (0x01000000 + code point).
   */
  public static keysymsFor(text: string): number[] {
    const result: number[] = [];
    const normalized = text.replace(/\r\n?/g, '\n');

    for (const character of normalized) {
      if (character === '\n') {
        result.push(KeyTable.XK_Return);
        continue;
      }
      if (character === '\t') {
        result.push(KeyTable.XK_Tab);
        continue;
      }

      const codePoint = character.codePointAt(0);
      // C0 controls, DEL and C1 controls have no printable keysym.
      if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) {
        continue;
      }

      result.push(keysyms.lookup(codePoint));
    }

    return result;
  }

  public updateBackground(backgroundColor: string) {
    if (this.rfb) {
      this.rfb.background = backgroundColor;
    }
  }
}
