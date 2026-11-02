// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi, onTestFinished } from 'vitest';
import RFB from '@novnc/novnc/lib/rfb.js';
import { NoVNCService } from './novnc.service';

type RfbStub = Pick<
  RFB,
  | 'viewOnly'
  | 'background'
  | 'disconnect'
  | 'sendCtrlAltDel'
  | 'clipboardPasteFrom'
  | 'addEventListener'
  | 'sendKey'
  | 'scaleViewport'
  | 'resizeSession'
> & {
  _supportsSetDesktopSize: boolean;
  _handleExtendedDesktopSize: () => boolean;
};

function rfbStub(): RfbStub {
  return {
    viewOnly: false,
    background: '',
    disconnect: vi.fn(),
    sendCtrlAltDel: vi.fn(),
    clipboardPasteFrom: vi.fn(),
    addEventListener: vi.fn(),
    sendKey: vi.fn(),
    scaleViewport: true,
    resizeSession: false,
    _supportsSetDesktopSize: false,
    // As in noVNC: an ExtendedDesktopSize rect from the server marks it as able to resize.
    _handleExtendedDesktopSize(this: RfbStub) {
      this._supportsSetDesktopSize = true;
      return true;
    },
  };
}

// RFB can't be constructed under jsdom (it needs a 2D canvas context and
// ResizeObserver, and opens a WebSocket), so startClient() is not exercised.
// The client is seeded through the private field instead; that is the only
// seam the service offers.
function withClient() {
  const service = new NoVNCService();
  const rfb = rfbStub();
  (service as unknown as { rfb: RfbStub }).rfb = rfb;
  return { service, rfb };
}

describe('NoVNCService', () => {
  /**
   * Verifies: read-only changes, background updates and disconnects are no-ops before a client exists.
   * Interacts with: NoVNCService with no RFB client.
   * Data: a fresh service.
   */
  it('ignores read-only, background and disconnect calls without a client', () => {
    const service = new NoVNCService();
    expect(() => {
      service.setViewOnly(true);
      service.updateBackground('rgb(0, 0, 0)');
      service.disconnect();
    }).not.toThrow();
  });

  /**
   * Verifies: setViewOnly() is how read-only reaches a Proxmox console: it flips the client's viewOnly flag both ways.
   * Interacts with: the seeded RFB client's viewOnly property.
   * Data: setViewOnly(true) then setViewOnly(false).
   */
  it('passes read-only through to the client as viewOnly', () => {
    const { service, rfb } = withClient();
    service.setViewOnly(true);
    expect(rfb.viewOnly).toBe(true);
    service.setViewOnly(false);
    expect(rfb.viewOnly).toBe(false);
  });

  /**
   * Verifies: disconnect() closes the client and forgets it, so a second disconnect does nothing.
   * Interacts with: the seeded RFB client's disconnect().
   * Data: two disconnect() calls.
   */
  it('disconnects once and drops the client', () => {
    const { service, rfb } = withClient();
    service.disconnect();
    service.disconnect();
    expect(rfb.disconnect).toHaveBeenCalledOnce();
  });

  /**
   * Verifies: Ctrl-Alt-Del is forwarded to the client.
   * Interacts with: the seeded RFB client's sendCtrlAltDel.
   * Data: none.
   */
  it('forwards Ctrl-Alt-Del', () => {
    const { service, rfb } = withClient();
    service.sendCtrlAltDel();
    expect(rfb.sendCtrlAltDel).toHaveBeenCalledOnce();
  });

  /**
   * Verifies: pasted text is forwarded to the client's clipboard.
   * Interacts with: the seeded RFB client's clipboardPasteFrom.
   * Data: pasted text 'hello'.
   */
  it('forwards clipboard paste', () => {
    const { service, rfb } = withClient();
    service.sendClipboardText('hello');
    expect(rfb.clipboardPasteFrom).toHaveBeenCalledWith('hello');
  });

  /**
   * Verifies: a theme's background colour is applied to the client.
   * Interacts with: the seeded RFB client's background property.
   * Data: background 'rgb(1, 2, 3)'.
   */
  it('forwards background changes', () => {
    const { service, rfb } = withClient();
    service.updateBackground('rgb(1, 2, 3)');
    expect(rfb.background).toBe('rgb(1, 2, 3)');
  });

  /**
   * Verifies: each listener setter registers its handler for the matching RFB event.
   * Interacts with: the seeded RFB client's addEventListener.
   * Data: one handler per event.
   */
  it('registers connect, disconnect, security-failure and clipboard listeners', () => {
    const { service, rfb } = withClient();
    const handler = () => undefined;
    service.setConnectListener(handler);
    service.setDisconnectListener(handler);
    service.setSecurityFailureListener(handler);
    service.setClipboardListener(handler);
    expect(vi.mocked(rfb.addEventListener).mock.calls.map(([event]) => event)).toEqual([
      'connect',
      'disconnect',
      'securityfailure',
      'clipboard',
    ]);
  });

  describe('typing text', () => {
    const ENTER = 0xff0d;
    const TAB = 0xff09;

    /**
     * Verifies: sendText() presses one keysym per character, with Enter for a newline, and reports it was sent.
     * Interacts with: the seeded RFB client's sendKey (keysym, null code, press and release).
     * Data: 'Hi!\n'.
     */
    it('types each character as a key press', () => {
      const { service, rfb } = withClient();
      expect(service.sendText('Hi!\n')).toBe(true);
      expect(vi.mocked(rfb.sendKey).mock.calls).toEqual([
        [0x48, null],
        [0x69, null],
        [0x21, null],
        [ENTER, null],
      ]);
    });

    /**
     * Verifies: without a client nothing is typed and sendText() says so.
     * Interacts with: NoVNCService with no RFB client.
     * Data: 'hello'.
     */
    it('types nothing without a client', () => {
      expect(new NoVNCService().sendText('hello')).toBe(false);
    });

    /**
     * Verifies: characters map to X11 keysyms: ASCII and Latin-1 one-to-one, legacy ranges from noVNC's table, everything else to the Unicode keysym range; line breaks and tabs become Enter and Tab; other control characters are dropped.
     * Interacts with: NoVNCService.keysymsFor (noVNC's keysymdef lookup).
     * Data: the text under test.
     * Why: console-forge sends charCodeAt() as the keysym, which is only right for Latin-1; these pin the cases where that differs.
     */
    it.each<[string, string, number[]]>([
      ['ASCII', 'a Z~', [0x61, 0x20, 0x5a, 0x7e]],
      ['Latin-1', 'é£ÿ', [0xe9, 0xa3, 0xff]],
      ['Latin-2 (keysym table)', 'ł', [0x1b3]],
      ['Greek (keysym table)', 'α', [0x7e1]],
      ['Euro sign (keysym table)', '€', [0x20ac]],
      ['astral plane (Unicode keysym)', '😀', [0x0100_0000 + 0x1f600]],
      ['LF, CRLF and CR', 'a\nb\r\nc\rd', [0x61, ENTER, 0x62, ENTER, 0x63, ENTER, 0x64]],
      ['tab', '\t', [TAB]],
      ['other controls dropped', '\u0000\u001b\u007f\u0085x', [0x78]],
    ])('maps %s', (_case, text, expected) => {
      expect(NoVNCService.keysymsFor(text)).toEqual(expected);
    });
  });

  describe('console controls', () => {
    function seedScreen(service: NoVNCService) {
      const screen = document.createElement('div');
      const requestFullscreen = vi.fn(() => Promise.resolve());
      screen.requestFullscreen = requestFullscreen;
      (service as unknown as { screen: HTMLElement }).screen = screen;
      return { screen, requestFullscreen };
    }

    function setFullscreenElement(element: Element | null) {
      Object.defineProperty(document, 'fullscreenElement', {
        value: element,
        configurable: true,
      });
      onTestFinished(() => {
        Reflect.deleteProperty(document, 'fullscreenElement');
      });
    }

    /**
     * Verifies: enterFullscreen() makes the console screen fullscreen, and reports false when there is no screen yet.
     * Interacts with: the seeded screen element's requestFullscreen.
     * Data: a fresh service, then one with a screen.
     */
    it('makes the screen fullscreen', () => {
      expect(new NoVNCService().enterFullscreen()).toBe(false);
      const { service } = withClient();
      const { requestFullscreen } = seedScreen(service);
      expect(service.enterFullscreen()).toBe(true);
      expect(requestFullscreen).toHaveBeenCalledOnce();
    });

    /**
     * Verifies: leaving fullscreen recomputes the client's scale (toggling scaleViewport), and entering it does not.
     * Interacts with: document fullscreenchange events; the seeded client's scaleViewport setter.
     * Why: noVNC can keep the fullscreen scale after exit, which offsets the pointer.
     */
    it('rescales after leaving fullscreen', () => {
      const { service, rfb } = withClient();
      const { screen } = seedScreen(service);
      const writes: boolean[] = [];
      Object.defineProperty(rfb, 'scaleViewport', {
        get: () => true,
        set: (value: boolean) => writes.push(value),
      });

      setFullscreenElement(screen);
      document.dispatchEvent(new Event('fullscreenchange'));
      expect(writes).toEqual([]);

      setFullscreenElement(null);
      document.dispatchEvent(new Event('fullscreenchange'));
      expect(writes).toEqual([false, true]);
    });

    /**
     * Verifies: leaving fullscreen while the guest matches the window leaves scaling off and the resize session on.
     * Interacts with: document fullscreenchange events; the seeded client's scaleViewport and resizeSession.
     * Data: server offers resize; Match Window Size chosen; fullscreen entered and left.
     * Why: the scale fix-up toggles scaleViewport, which would switch scaling back on under Match Window Size.
     */
    it('keeps Match Window Size after leaving fullscreen', () => {
      const { service, rfb } = withClient();
      const { screen } = seedScreen(service);
      rfb._handleExtendedDesktopSize();
      service.refreshResizeSupport();
      service.setResolutionMode('match');

      setFullscreenElement(screen);
      document.dispatchEvent(new Event('fullscreenchange'));
      setFullscreenElement(null);
      document.dispatchEvent(new Event('fullscreenchange'));

      expect(rfb.scaleViewport).toBe(false);
      expect(rfb.resizeSession).toBe(true);
    });

    /**
     * Verifies: requestReconnect() is announced to subscribers (NovncComponent), and isConnected() follows the client.
     * Interacts with: reconnectRequests$; the seeded client.
     */
    it('announces reconnect requests and reports the connection', () => {
      const { service } = withClient();
      const requests = vi.fn();
      service.reconnectRequests$.subscribe(requests);
      service.requestReconnect();
      expect(requests).toHaveBeenCalledOnce();
      expect(service.isConnected()).toBe(true);
      service.disconnect();
      expect(service.isConnected()).toBe(false);
    });

    /**
     * Verifies: the guest's last clipboard text is kept for Copy, and forgotten on disconnect.
     * Interacts with: the seeded client's 'clipboard' listener (as startClient registers it).
     * Data: guest copies 'first' then 'second'.
     */
    it('keeps the last guest clipboard text until disconnect', () => {
      const { service, rfb } = withClient();
      expect(service.getGuestClipboard()).toBeNull();
      (service as unknown as { trackGuestClipboard(): void }).trackGuestClipboard();
      const [[event, onClipboard]] = vi.mocked(rfb.addEventListener).mock.calls as unknown as [
        [string, (e: { detail: { text: string } }) => void],
      ];
      expect(event).toBe('clipboard');
      onClipboard({ detail: { text: 'first' } });
      onClipboard({ detail: { text: 'second' } });
      expect(service.getGuestClipboard()).toBe('second');
      service.disconnect();
      expect(service.getGuestClipboard()).toBeNull();
    });
  });

  describe('resolution', () => {
    type Internals = {
      rfb: RfbStub | null;
      configureClient(readOnly: boolean): void;
    };

    // What startClient does after constructing RFB, against a stub client.
    function connectClient(service: NoVNCService, readOnly = false) {
      const rfb = rfbStub();
      const internals = service as unknown as Internals;
      internals.rfb = rfb;
      internals.configureClient(readOnly);
      return rfb;
    }

    // The server's ExtendedDesktopSize rect, as noVNC's message loop dispatches it.
    function serverOffersResize(rfb: RfbStub) {
      rfb._handleExtendedDesktopSize();
    }

    /**
     * Verifies: a new client scales to fit, with no resize support until the server offers it.
     * Interacts with: configureClient (startClient's setup); the stub client's scaleViewport and resizeSession.
     * Data: a fresh connection.
     */
    it('scales to fit by default', () => {
      const service = new NoVNCService();
      const rfb = connectClient(service);
      expect(rfb.scaleViewport).toBe(true);
      expect(rfb.resizeSession).toBe(false);
      expect(service.resizeSupported()).toBe(false);
      expect(service.activeResolution()).toBe('scale');
    });

    /**
     * Verifies: support is picked up from noVNC's ExtendedDesktopSize handling (wrapped on the instance), and Match Window Size then turns scaling off and resizeSession on; Scale to Fit reverses it.
     * Interacts with: the wrapped _handleExtendedDesktopSize; _supportsSetDesktopSize; setResolutionMode.
     * Data: server offers resize; 'match' then 'scale'.
     */
    it('matches the window once the server can resize', () => {
      const service = new NoVNCService();
      const rfb = connectClient(service);
      serverOffersResize(rfb);
      expect(service.resizeSupported()).toBe(true);

      service.setResolutionMode('match');
      expect(service.activeResolution()).toBe('match');
      expect(rfb.scaleViewport).toBe(false);
      expect(rfb.resizeSession).toBe(true);

      service.setResolutionMode('scale');
      expect(rfb.scaleViewport).toBe(true);
      expect(rfb.resizeSession).toBe(false);
    });

    /**
     * Verifies: Match Window Size chosen before support is known keeps scaling, and is applied as soon as the server offers resize.
     * Interacts with: setResolutionMode; the wrapped ExtendedDesktopSize handler.
     * Data: 'match' chosen, then server offers resize.
     */
    it('applies a match chosen before the server offered resize', () => {
      const service = new NoVNCService();
      const rfb = connectClient(service);
      service.setResolutionMode('match');
      expect(service.resolutionMode()).toBe('match');
      expect(service.activeResolution()).toBe('scale');
      expect(rfb.scaleViewport).toBe(true);

      serverOffersResize(rfb);
      expect(rfb.scaleViewport).toBe(false);
      expect(rfb.resizeSession).toBe(true);
    });

    /**
     * Verifies: a server that never offers resize leaves the console scaling, even after the connect event or a manual re-check.
     * Interacts with: the 'connect' listener configureClient registers; refreshResizeSupport.
     * Data: 'match' chosen; connect fires with _supportsSetDesktopSize false.
     */
    it('keeps scaling when the server cannot resize', () => {
      const service = new NoVNCService();
      const rfb = connectClient(service);
      service.setResolutionMode('match');
      const connect = vi
        .mocked(rfb.addEventListener)
        .mock.calls.find(([event]) => event === 'connect')![1] as () => void;
      connect();
      service.refreshResizeSupport();
      expect(service.resizeSupported()).toBe(false);
      expect(rfb.scaleViewport).toBe(true);
      expect(rfb.resizeSession).toBe(false);
    });

    /**
     * Verifies: a reconnect resets support for the new server, keeps the user's choice, and re-applies it once the new connection offers resize.
     * Interacts with: disconnect(); configureClient on a second client.
     * Data: match on the first connection; a second connection that offers resize.
     */
    it('keeps the choice across a reconnect', () => {
      const service = new NoVNCService();
      serverOffersResize(connectClient(service));
      service.setResolutionMode('match');

      service.disconnect();
      expect(service.resizeSupported()).toBe(false);

      const next = connectClient(service);
      expect(next.scaleViewport).toBe(true);
      serverOffersResize(next);
      expect(service.resolutionMode()).toBe('match');
      expect(next.scaleViewport).toBe(false);
      expect(next.resizeSession).toBe(true);
    });

    /**
     * Verifies: a view-only console never resizes the guest: it scales while read-only, both from the start and when switched, and the choice returns when read-only is lifted.
     * Interacts with: configureClient(readOnly); setViewOnly.
     * Data: read-only connection with match chosen; then read-only off and on again.
     */
    it('scales while read-only', () => {
      const service = new NoVNCService();
      const rfb = connectClient(service, true);
      serverOffersResize(rfb);
      service.setResolutionMode('match');
      expect(service.activeResolution()).toBe('scale');
      expect(rfb.resizeSession).toBe(false);

      service.setViewOnly(false);
      expect(rfb.resizeSession).toBe(true);
      expect(rfb.scaleViewport).toBe(false);

      service.setViewOnly(true);
      expect(rfb.resizeSession).toBe(false);
      expect(rfb.scaleViewport).toBe(true);
    });

    /**
     * Verifies: support detection tolerates a noVNC without the internals it reads: no hook, no flag, nothing thrown.
     * Interacts with: configureClient and refreshResizeSupport against a client missing _handleExtendedDesktopSize and _supportsSetDesktopSize.
     * Data: a stub with both removed.
     */
    it('tolerates a noVNC without the resize internals', () => {
      const service = new NoVNCService();
      const rfb = rfbStub() as Partial<RfbStub>;
      delete rfb._handleExtendedDesktopSize;
      delete rfb._supportsSetDesktopSize;
      const internals = service as unknown as Internals;
      internals.rfb = rfb as RfbStub;
      expect(() => {
        internals.configureClient(false);
        service.refreshResizeSupport();
      }).not.toThrow();
      expect(service.resizeSupported()).toBe(false);
    });
  });
});
