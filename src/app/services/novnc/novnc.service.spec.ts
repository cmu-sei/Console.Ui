// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi, onTestFinished } from 'vitest';
import RFB from '@novnc/novnc/lib/rfb.js';
import { NoVNCService, RESIZE_VERIFY_TIMEOUT_MS } from './novnc.service';

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
  _requestRemoteResize: () => void;
  _screenSize: () => { w: number; h: number };
  _fbWidth: number;
  _fbHeight: number;
  _FBU: { x: number; y: number };
  _resize: (width: number, height: number) => void;
  _rfbConnectionState: string;
  // The console's size, which _screenSize reports (noVNC measures its screen element).
  screen: { w: number; h: number };
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
    // Sending SetDesktopSize is not under test; the service only listens for it.
    _requestRemoteResize: () => undefined,
    _screenSize(this: RfbStub) {
      return this.screen;
    },
    // A guest at 1024x768 in a console of the same size, so nothing needs resizing by default.
    _fbWidth: 1024,
    _fbHeight: 768,
    _FBU: { x: 0, y: 0 },
    // As in noVNC: the server reported a new framebuffer size.
    _resize(this: RfbStub, width: number, height: number) {
      this._fbWidth = width;
      this._fbHeight = height;
    },
    _rfbConnectionState: 'connected',
    screen: { w: 1024, h: 768 },
  };
}

// RFB can't be constructed under jsdom (it needs a 2D canvas context and
// ResizeObserver, and opens a WebSocket), so startClient() is not exercised.
// The client is seeded through the private field instead; that is the only
// seam the service offers.
function withClient() {
  const service = new NoVNCService();
  // Typing is paced to QEMU; not waited out except where the pacing is under test.
  service.keyEventMs = 0;
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
    const SHIFT = 0xffe1;

    /**
     * Verifies: sendText() presses one keysym per character, with Enter for a newline, holds Shift around the characters a US layout types with it, and reports it was sent.
     * Interacts with: the seeded RFB client's sendKey (keysym, null code; press and release, or an explicit Shift down/up).
     * Data: 'Hi!\n'.
     * Why: QEMU's VNC server types the unshifted key for a bare shifted keysym, so without Shift '!' arrives as '1'. Confirmed on a live QEMU guest.
     */
    it('types each character as a key press, holding Shift where the character needs it', async () => {
      const { service, rfb } = withClient();
      await expect(service.sendText('Hi!\n')).resolves.toBe(true);
      expect(vi.mocked(rfb.sendKey).mock.calls).toEqual([
        [SHIFT, null, true],
        [0x48, null],
        [SHIFT, null, false],
        [0x69, null],
        [SHIFT, null, true],
        [0x21, null],
        [SHIFT, null, false],
        [ENTER, null],
      ]);
    });

    /**
     * Verifies: exactly the capitals and US-layout shifted symbols are flagged for Shift; digits, unshifted punctuation, whitespace and non-ASCII letters are not.
     * Interacts with: NoVNCService.keyPressesFor.
     * Data: every printable ASCII character plus a Latin-1 capital.
     */
    it('flags the characters a US layout types with Shift', () => {
      const shifted = NoVNCService.keyPressesFor('aZ1!2@3#4$5%6^7&8*9(0)-_=+[{]}\\|;:\'",<.>/?`~ \tÉ')
        .filter((press) => press.shift)
        .map((press) => String.fromCodePoint(press.keysym))
        .join('');
      expect(shifted).toBe('Z!@#$%^&*()_+{}|:"<>?~');
    });

    /**
     * Verifies: without a client nothing is typed and sendText() says so.
     * Interacts with: NoVNCService with no RFB client.
     * Data: 'hello'.
     */
    it('types nothing without a client', async () => {
      await expect(new NoVNCService().sendText('hello')).resolves.toBe(false);
    });

    /**
     * Verifies: a client that is not connected - still connecting, or dropped - types nothing and sendText() says so.
     * Interacts with: noVNC's _rfbConnectionState, which sendKey checks before sending.
     * Data: 'hello' with the state 'connecting', then 'disconnected'.
     * Why: noVNC's sendKey silently drops keys unless connected, so text typed during a reconnect used to vanish while reporting success.
     */
    it.each(['connecting', 'disconnected'])('types nothing while the client is %s', async (state) => {
      const { service, rfb } = withClient();
      rfb._rfbConnectionState = state;
      await expect(service.sendText('hello')).resolves.toBe(false);
      expect(rfb.sendKey).not.toHaveBeenCalled();
    });

    describe('pacing', () => {
      function useFakeTimers() {
        vi.useFakeTimers();
        onTestFinished(() => {
          vi.useRealTimers();
        });
      }

      const keysyms = (rfb: RfbStub) =>
        vi.mocked(rfb.sendKey).mock.calls.map(([keysym]) => keysym);

      /**
       * Verifies: keys go out in batches of keyBatchEvents events, each followed by a wait of keyEventMs per event; Shift stays in the same batch as its key; sendText() resolves once the last batch has been waited out.
       * Interacts with: keyBatchEvents and keyEventMs; the seeded client's sendKey; fake timers.
       * Data: 'abC' with batches of 4 events at 10 ms each: 'a' and 'b' (2 events each), then 'C' (4, with Shift).
       * Why: QEMU types a key event every 10 ms and drops events past a 1024-entry queue (3 entries each), so an unpaced paste lost its tail and could leave Shift held.
       */
      it('sends keys in batches QEMU can take, waiting between them', async () => {
        useFakeTimers();
        const { service, rfb } = withClient();
        service.keyEventMs = 10;
        service.keyBatchEvents = 4;
        let done = false;
        const typed = service.sendText('abC').then((sent) => {
          done = true;
          return sent;
        });

        await vi.advanceTimersByTimeAsync(0);
        expect(keysyms(rfb)).toEqual([0x61, 0x62]);

        await vi.advanceTimersByTimeAsync(39);
        expect(keysyms(rfb)).toEqual([0x61, 0x62]);
        await vi.advanceTimersByTimeAsync(1);
        expect(keysyms(rfb)).toEqual([0x61, 0x62, SHIFT, 0x43, SHIFT]);

        await vi.advanceTimersByTimeAsync(39);
        expect(done).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await expect(typed).resolves.toBe(true);
      });

      /**
       * Verifies: a connection that drops between batches stops the typing, and sendText() resolves false.
       * Interacts with: _rfbConnectionState; keyBatchEvents.
       * Data: 'abcd' in batches of 4 events; the client drops after 'a' and 'b'.
       */
      it('stops when the connection drops partway through', async () => {
        useFakeTimers();
        const { service, rfb } = withClient();
        service.keyEventMs = 10;
        service.keyBatchEvents = 4;
        const typed = service.sendText('abcd');
        await vi.advanceTimersByTimeAsync(0);

        rfb._rfbConnectionState = 'disconnected';
        await vi.advanceTimersByTimeAsync(100);

        await expect(typed).resolves.toBe(false);
        expect(keysyms(rfb)).toEqual([0x61, 0x62]);
      });

      /**
       * Verifies: a client replaced by a reconnect between batches gets none of the rest.
       * Interacts with: the private rfb field a reconnect replaces; keyBatchEvents.
       * Data: 'abcd' in batches of 4 events; a new client after 'a' and 'b'.
       */
      it('stops when the client is replaced partway through', async () => {
        useFakeTimers();
        const { service, rfb } = withClient();
        service.keyEventMs = 10;
        service.keyBatchEvents = 4;
        const typed = service.sendText('abcd');
        await vi.advanceTimersByTimeAsync(0);

        const next = rfbStub();
        (service as unknown as { rfb: RfbStub }).rfb = next;
        await vi.advanceTimersByTimeAsync(100);

        await expect(typed).resolves.toBe(false);
        expect(next.sendKey).not.toHaveBeenCalled();
      });

      /**
       * Verifies: a second sendText() waits for the first to finish, so the two texts' keys don't interleave.
       * Interacts with: sendText's queue; keyBatchEvents.
       * Data: 'ab' then 'cd', sent together, in batches of 2 events (one character).
       */
      it('types one text after another', async () => {
        useFakeTimers();
        const { service, rfb } = withClient();
        service.keyBatchEvents = 2;
        const first = service.sendText('ab');
        const second = service.sendText('cd');

        await vi.advanceTimersByTimeAsync(100);

        await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
        expect(keysyms(rfb)).toEqual([0x61, 0x62, 0x63, 0x64]);
      });
    });

    /**
     * Verifies: characters map to X11 keysyms: ASCII and Latin-1 one-to-one, everything beyond Latin-1 to the Unicode keysym range; line breaks and tabs become Enter and Tab; other control characters are dropped.
     * Interacts with: NoVNCService.keysymsFor.
     * Data: the text under test.
     * Why: console-forge sends charCodeAt() as the keysym, which is only right for Latin-1; these pin the cases where that differs.
     */
    it.each<[string, string, number[]]>([
      ['ASCII', 'a Z~', [0x61, 0x20, 0x5a, 0x7e]],
      ['Latin-1', 'é£ÿ', [0xe9, 0xa3, 0xff]],
      ['Latin-2 (Unicode keysym)', 'ł', [0x0100_0000 | 0x142]],
      ['Greek (Unicode keysym)', 'α', [0x0100_0000 | 0x3b1]],
      ['Euro sign (Unicode keysym)', '€', [0x0100_0000 | 0x20ac]],
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
     * Verifies: isConnected() turns false when the client reports its session closed, even though the client stays in place, so a user's Reconnect asks for a new console instead of disconnecting a dead one.
     * Interacts with: the seeded client's 'disconnect' listener (as startClient registers it).
     * Why: noVNC's disconnect() on an already-closed client fires no 'disconnect' event, so Reconnect after a network drop used to do nothing.
     */
    it('stops reporting a connection once the client has dropped', () => {
      const { service, rfb } = withClient();
      (service as unknown as { trackConnectionLoss(): void }).trackConnectionLoss();
      const [[event, onDisconnect]] = vi.mocked(rfb.addEventListener).mock.calls as unknown as [
        [string, () => void],
      ];
      expect(event).toBe('disconnect');
      expect(service.isConnected()).toBe(true);

      onDisconnect();

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

    describe('when the guest does not follow', () => {
      function useFakeTimers() {
        vi.useFakeTimers();
        onTestFinished(() => {
          vi.useRealTimers();
        });
      }

      // A connection whose server offers resize, in a console bigger than the guest's 1024x768.
      function matchingClient() {
        const service = new NoVNCService();
        const notices = vi.fn();
        service.resizeFallback$.subscribe(notices);
        const rfb = connectClient(service);
        serverOffersResize(rfb);
        rfb.screen = { w: 1280.6, h: 800.2 };
        return { service, rfb, notices };
      }

      /**
       * Verifies: a Match Window Size request that leaves the framebuffer unchanged for the timeout falls back to Scale to Fit, marks resize unsupported for the connection, and announces it once; the user's choice is kept.
       * Interacts with: setResolutionMode; the stub's _fbWidth/_fbHeight and _screenSize; resizeFallback$; fake timers.
       * Data: guest stays 1024x768 in a 1280x800 console; RESIZE_VERIFY_TIMEOUT_MS.
       * Why: QEMU with std VGA advertises ExtendedDesktopSize and ignores the request, so only the outcome shows it.
       */
      it('falls back to scaling when the framebuffer does not change', () => {
        useFakeTimers();
        const { service, rfb, notices } = matchingClient();
        expect(RESIZE_VERIFY_TIMEOUT_MS).toBe(3000);
        service.setResolutionMode('match');
        expect(rfb.resizeSession).toBe(true);

        vi.advanceTimersByTime(RESIZE_VERIFY_TIMEOUT_MS - 1);
        expect(service.activeResolution()).toBe('match');
        expect(notices).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(service.activeResolution()).toBe('scale');
        expect(service.resizeSupported()).toBe(false);
        expect(service.resolutionMode()).toBe('match');
        expect(rfb.scaleViewport).toBe(true);
        expect(rfb.resizeSession).toBe(false);
        expect(notices).toHaveBeenCalledOnce();
      });

      /**
       * Verifies: once fallen back, the verdict sticks for the connection: a re-check, another request or more time neither re-enables Match Window Size nor repeats the notice.
       * Interacts with: refreshResizeSupport; the wrapped _requestRemoteResize; resizeFallback$.
       * Data: the fallback above, then a re-check, a request and another timeout.
       */
      it('announces the fallback once per connection', () => {
        useFakeTimers();
        const { service, rfb, notices } = matchingClient();
        service.setResolutionMode('match');
        vi.advanceTimersByTime(RESIZE_VERIFY_TIMEOUT_MS);

        service.refreshResizeSupport();
        rfb._requestRemoteResize();
        service.setResolutionMode('match');
        vi.advanceTimersByTime(RESIZE_VERIFY_TIMEOUT_MS);
        expect(service.resizeSupported()).toBe(false);
        expect(rfb.resizeSession).toBe(false);
        expect(notices).toHaveBeenCalledOnce();
      });

      /**
       * Verifies: a guest whose framebuffer changes after the request stays on Match Window Size.
       * Interacts with: setResolutionMode; the stub's framebuffer size; fake timers.
       * Data: guest resizes from 1024x768 to 1280x800 before the timeout.
       */
      it('keeps matching when the framebuffer changes', () => {
        useFakeTimers();
        const { service, rfb, notices } = matchingClient();
        service.setResolutionMode('match');
        vi.advanceTimersByTime(500);
        rfb._fbWidth = 1280;
        rfb._fbHeight = 800;

        vi.advanceTimersByTime(RESIZE_VERIFY_TIMEOUT_MS);
        expect(service.activeResolution()).toBe('match');
        expect(service.resizeSupported()).toBe(true);
        expect(rfb.resizeSession).toBe(true);
        expect(notices).not.toHaveBeenCalled();
      });

      /**
       * Verifies: a request for the size the guest already has is not taken as a failure.
       * Interacts with: setResolutionMode; _screenSize floored as noVNC sends it; fake timers.
       * Data: guest 1024x768 in a 1024.4x768.9 console.
       */
      it('does not fail a request for the current size', () => {
        useFakeTimers();
        const { service, rfb, notices } = matchingClient();
        rfb.screen = { w: 1024.4, h: 768.9 };
        service.setResolutionMode('match');

        vi.advanceTimersByTime(RESIZE_VERIFY_TIMEOUT_MS * 2);
        expect(service.activeResolution()).toBe('match');
        expect(notices).not.toHaveBeenCalled();
      });

      /**
       * Verifies: a window resize while matched is checked too, through the wrapped _requestRemoteResize, until the guest has taken a requested size; the timeout is overridable.
       * Interacts with: the wrapped _requestRemoteResize (noVNC's debounced resize handler calls it); resizeVerifyTimeoutMs.
       * Data: resizeVerifyTimeoutMs 100; Match Window Size, then a window resize to 1600x900 that the guest ignores.
       */
      it('checks a window resize while matched', () => {
        useFakeTimers();
        const { service, rfb, notices } = matchingClient();
        service.resizeVerifyTimeoutMs = 100;
        rfb.screen = { w: 1024, h: 768 };
        service.setResolutionMode('match');

        rfb.screen = { w: 1600, h: 900 };
        rfb._requestRemoteResize();
        vi.advanceTimersByTime(99);
        expect(service.activeResolution()).toBe('match');
        vi.advanceTimersByTime(1);
        expect(service.activeResolution()).toBe('scale');
        expect(notices).toHaveBeenCalledOnce();
      });

      /**
       * Verifies: once the guest has taken a size it was asked for, a later request it doesn't follow leaves Match Window Size on.
       * Interacts with: the wrapped _requestRemoteResize; the stub's framebuffer size; resizeVerifyTimeoutMs.
       * Data: resizeVerifyTimeoutMs 100; guest follows to 1280x800, then ignores 1600x900 (above its largest mode, say).
       * Why: one ignored request used to turn Match Window Size off for the rest of the connection, even on a virtio-gpu guest that had just resized.
       */
      it('keeps matching a guest that has resized when it ignores a later size', () => {
        useFakeTimers();
        const { service, rfb, notices } = matchingClient();
        service.resizeVerifyTimeoutMs = 100;
        service.setResolutionMode('match');
        rfb._fbWidth = 1280;
        rfb._fbHeight = 800;
        vi.advanceTimersByTime(100);
        expect(service.activeResolution()).toBe('match');

        rfb.screen = { w: 1600, h: 900 };
        rfb._requestRemoteResize();
        vi.advanceTimersByTime(RESIZE_VERIFY_TIMEOUT_MS);
        expect(service.activeResolution()).toBe('match');
        expect(rfb.resizeSession).toBe(true);
        expect(notices).not.toHaveBeenCalled();
      });

      /**
       * Verifies: a guest that takes the requested size after the timeout has fallen back is matched again.
       * Interacts with: the wrapped _resize (noVNC applies a server's new framebuffer size through it); fake timers.
       * Data: guest stays 1024x768 past the timeout, then reports 1280x800.
       * Why: a slow guest, such as Windows, can take longer than the timeout to change resolution.
       */
      it('matches again when a slow guest takes the size after the timeout', () => {
        useFakeTimers();
        const { service, rfb } = matchingClient();
        service.setResolutionMode('match');
        vi.advanceTimersByTime(RESIZE_VERIFY_TIMEOUT_MS);
        expect(service.activeResolution()).toBe('scale');

        rfb._resize(1280, 800);
        expect(service.resizeSupported()).toBe(true);
        expect(service.activeResolution()).toBe('match');
        expect(rfb.scaleViewport).toBe(false);
        expect(rfb.resizeSession).toBe(true);
      });

      /**
       * Verifies: after the timeout's fallback, a size change that isn't the requested size does not bring Match Window Size back.
       * Interacts with: the wrapped _resize; fake timers.
       * Data: guest stays 1024x768 past the timeout, then reports 800x600.
       * Why: a guest changing mode on its own, as one does while booting, says nothing about whether it can follow a request.
       */
      it('does not match again on a size the guest was not asked for', () => {
        useFakeTimers();
        const { service, rfb } = matchingClient();
        service.setResolutionMode('match');
        vi.advanceTimersByTime(RESIZE_VERIFY_TIMEOUT_MS);

        rfb._resize(800, 600);
        expect(service.resizeSupported()).toBe(false);
        expect(service.activeResolution()).toBe('scale');
      });

      /**
       * Verifies: a fallback from a rejecting ExtendedDesktopSize status stays for the connection, even if the guest later reports the requested size.
       * Interacts with: the wrapped _handleExtendedDesktopSize and _resize.
       * Data: status 1 after Match Window Size, then the guest reports 1280x800.
       */
      it('does not match again after a rejecting status', () => {
        const { service, rfb } = matchingClient();
        service.setResolutionMode('match');
        rfb._FBU = { x: 1, y: 1 };
        serverOffersResize(rfb);

        rfb._resize(1280, 800);
        expect(service.resizeSupported()).toBe(false);
        expect(service.activeResolution()).toBe('scale');
      });

      /**
       * Verifies: an ExtendedDesktopSize reply to this client's request with a rejecting status (1 prohibited, 2 out of resources, 3 invalid layout) falls back at once, without waiting for the timeout.
       * Interacts with: the wrapped _handleExtendedDesktopSize reading _FBU (x = 1, this client asked; y = status).
       * Data: status 1, 2 and 3 after Match Window Size.
       */
      it.each([1, 2, 3])('treats ExtendedDesktopSize status %i as unsupported', (status) => {
        const { service, rfb, notices } = matchingClient();
        service.setResolutionMode('match');
        rfb._FBU = { x: 1, y: status };
        serverOffersResize(rfb);
        expect(service.resizeSupported()).toBe(false);
        expect(service.activeResolution()).toBe('scale');
        expect(rfb.resizeSession).toBe(false);
        expect(notices).toHaveBeenCalledOnce();
      });

      /**
       * Verifies: status 4 ("request forwarded"), and replies the client didn't ask for, are not rejections.
       * Interacts with: the wrapped _handleExtendedDesktopSize reading _FBU.
       * Data: x 1 / y 4, and x 2 (another client's request) / y 1.
       * Why: QEMU answers every SetDesktopSize it passes to the display adapter with status 4, including on guests that do resize.
       */
      it.each([
        [1, 4],
        [2, 1],
      ])('does not treat reason %i status %i as unsupported', (x, y) => {
        const { service, rfb, notices } = matchingClient();
        service.setResolutionMode('match');
        rfb._FBU = { x, y };
        serverOffersResize(rfb);
        expect(service.activeResolution()).toBe('match');
        expect(notices).not.toHaveBeenCalled();
      });

      /**
       * Verifies: a new connection forgets the previous one's verdict: support comes back once the new server offers it and the kept choice is re-applied; a check pending from the old connection does not fire against the new one.
       * Interacts with: disconnect(); configureClient on a second client; fake timers.
       * Data: fallback on the first connection; a pending check on a second, then a third connection.
       */
      it('resets the verdict on reconnect', () => {
        useFakeTimers();
        const { service, rfb, notices } = matchingClient();
        service.setResolutionMode('match');
        vi.advanceTimersByTime(RESIZE_VERIFY_TIMEOUT_MS);
        expect(rfb.resizeSession).toBe(false);

        service.disconnect();
        const next = connectClient(service);
        serverOffersResize(next);
        expect(service.resizeSupported()).toBe(true);
        expect(next.scaleViewport).toBe(false);
        expect(next.resizeSession).toBe(true);

        next.screen = { w: 1280, h: 800 };
        next._requestRemoteResize();
        service.disconnect();
        const third = connectClient(service);
        serverOffersResize(third);
        vi.advanceTimersByTime(RESIZE_VERIFY_TIMEOUT_MS);
        expect(service.activeResolution()).toBe('match');
        expect(notices).toHaveBeenCalledOnce();
      });
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
