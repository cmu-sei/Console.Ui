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
>;

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

// Raises one of noVNC's public events on the stub, calling every listener the service registered.
function fire(rfb: RfbStub, event: string) {
  for (const [type, listener] of vi.mocked(rfb.addEventListener).mock.calls) {
    if (type === event) {
      (listener as () => void)();
    }
  }
}

// A seeded client whose session is up: the service tracks it the way configureClient does, and noVNC
// has fired 'connect'.
function connectedClient() {
  const { service, rfb } = withClient();
  (service as unknown as { trackConnection(): void }).trackConnection();
  fire(rfb, 'connect');
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
      const { service, rfb } = connectedClient();
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
     * Verifies: a client whose session is not up - still connecting, or dropped - types nothing and sendText() says so.
     * Interacts with: noVNC's public 'connect' and 'disconnect' events.
     * Data: 'hello' before 'connect', and after 'connect' then 'disconnect'.
     * Why: noVNC's sendKey silently drops keys unless connected, so text typed during a reconnect used to vanish while reporting success.
     */
    it.each([
      ['connecting', [] as string[]],
      ['dropped', ['connect', 'disconnect']],
    ])('types nothing while the client is %s', async (_state, events) => {
      const { service, rfb } = withClient();
      (service as unknown as { trackConnection(): void }).trackConnection();
      events.forEach((event) => fire(rfb, event));
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
        const { service, rfb } = connectedClient();
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
       * Interacts with: noVNC's public 'disconnect' event; keyBatchEvents.
       * Data: 'abcd' in batches of 4 events; the client drops after 'a' and 'b'.
       */
      it('stops when the connection drops partway through', async () => {
        useFakeTimers();
        const { service, rfb } = connectedClient();
        service.keyEventMs = 10;
        service.keyBatchEvents = 4;
        const typed = service.sendText('abcd');
        await vi.advanceTimersByTimeAsync(0);

        fire(rfb, 'disconnect');
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
        const { service, rfb } = connectedClient();
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
        const { service, rfb } = connectedClient();
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
     * Data: a display that can resize; Match Window Size chosen; fullscreen entered and left.
     * Why: the scale fix-up toggles scaleViewport, which would switch scaling back on under Match Window Size.
     */
    it('keeps Match Window Size after leaving fullscreen', () => {
      const { service, rfb } = withClient();
      const { screen } = seedScreen(service);
      service.setResizeSupported(true);
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
      (service as unknown as { trackConnection(): void }).trackConnection();
      expect(service.isConnected()).toBe(true);

      fire(rfb, 'disconnect');

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

    /**
     * Verifies: a new client scales to fit, and Match Window Size isn't available until the Vm's display is known to resize.
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
     * Verifies: where the Vm's display can resize, Match Window Size turns scaling off and noVNC's resizeSession on; Scale to Fit reverses it.
     * Interacts with: setResizeSupported (from vm.api's canResizeDisplay); setResolutionMode; the public scaleViewport and resizeSession.
     * Data: a resizable display; 'match' then 'scale'.
     */
    it('matches the window where the display can resize', () => {
      const service = new NoVNCService();
      const rfb = connectClient(service);
      service.setResizeSupported(true);

      service.setResolutionMode('match');
      expect(service.activeResolution()).toBe('match');
      expect(rfb.scaleViewport).toBe(false);
      expect(rfb.resizeSession).toBe(true);

      service.setResolutionMode('scale');
      expect(rfb.scaleViewport).toBe(true);
      expect(rfb.resizeSession).toBe(false);
    });

    /**
     * Verifies: Match Window Size chosen before the Vm has loaded keeps scaling, and is applied once the display is known to resize.
     * Interacts with: setResolutionMode; setResizeSupported.
     * Data: 'match' chosen, then a resizable display reported.
     */
    it('applies a match chosen before the display was known to resize', () => {
      const service = new NoVNCService();
      const rfb = connectClient(service);
      service.setResolutionMode('match');
      expect(service.resolutionMode()).toBe('match');
      expect(service.activeResolution()).toBe('scale');
      expect(rfb.scaleViewport).toBe(true);

      service.setResizeSupported(true);
      expect(rfb.scaleViewport).toBe(false);
      expect(rfb.resizeSession).toBe(true);
    });

    /**
     * Verifies: a display that can't resize keeps the console scaling whatever is chosen, and one that stops being reported as resizable goes back to scaling.
     * Interacts with: setResizeSupported; setResolutionMode.
     * Data: 'match' with no resizable display; then resizable, then not.
     * Why: QEMU passes SetDesktopSize only to virtio-gpu, so on std VGA, qxl and the rest the guest never follows and the screen would be clipped instead of scaled.
     */
    it('scales where the display cannot resize', () => {
      const service = new NoVNCService();
      const rfb = connectClient(service);
      service.setResolutionMode('match');
      expect(rfb.scaleViewport).toBe(true);
      expect(rfb.resizeSession).toBe(false);

      service.setResizeSupported(true);
      service.setResizeSupported(false);
      expect(service.activeResolution()).toBe('scale');
      expect(rfb.scaleViewport).toBe(true);
      expect(rfb.resizeSession).toBe(false);
    });

    /**
     * Verifies: a reconnect keeps the user's choice and the display's support, so the new connection matches the window at once.
     * Interacts with: disconnect(); configureClient on a second client.
     * Data: match on the first connection; a second connection.
     * Why: whether the display can resize is the Vm's config, not something a connection learns.
     */
    it('keeps the choice across a reconnect', () => {
      const service = new NoVNCService();
      connectClient(service);
      service.setResizeSupported(true);
      service.setResolutionMode('match');

      service.disconnect();
      const next = connectClient(service);
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
      service.setResizeSupported(true);
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
  });

  /**
   * Verifies: the service uses only noVNC's public API: setting up a client, the resolution controls, read-only, typing and disconnecting never read or write an underscore member of the RFB client.
   * Interacts with: a stub client behind a Proxy that throws on any property starting with '_'.
   * Data: a connection taken through configureClient, connect, Match Window Size, read-only, Send Text and disconnect.
   * Why: noVNC's private members change between releases without notice; review asked for the console not to depend on them.
   */
  it('touches no noVNC internals', async () => {
    const service = new NoVNCService();
    service.keyEventMs = 0;
    const stub = rfbStub();
    const guard = (property: string | symbol) => {
      if (typeof property === 'string' && property.startsWith('_')) {
        throw new Error(`noVNC internal used: ${property}`);
      }
    };
    const rfb = new Proxy(stub, {
      get(target, property, receiver) {
        guard(property);
        return Reflect.get(target, property, receiver);
      },
      set(target, property, value, receiver) {
        guard(property);
        return Reflect.set(target, property, value, receiver);
      },
    });
    const internals = service as unknown as {
      rfb: RfbStub | null;
      configureClient(readOnly: boolean): void;
    };
    internals.rfb = rfb;

    internals.configureClient(false);
    fire(stub, 'connect');
    service.setResizeSupported(true);
    service.setResolutionMode('match');
    service.setViewOnly(true);
    service.setViewOnly(false);
    await expect(service.sendText('Hi')).resolves.toBe(true);
    service.disconnect();

    expect(stub.disconnect).toHaveBeenCalledOnce();
  });
});
