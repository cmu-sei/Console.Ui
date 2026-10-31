// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
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
});
