// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

// Types for noVNC's RFB client, which ships as plain JavaScript. Only the public API the console
// uses is declared (https://github.com/novnc/noVNC/blob/master/docs/API.md), so a use of anything
// else, including noVNC's private members, fails to compile.
declare module '@novnc/novnc/lib/rfb.js' {
  export interface RfbCredentials {
    username?: string;
    password?: string;
    target?: string;
  }

  export interface RfbOptions {
    shared?: boolean;
    credentials?: RfbCredentials;
    repeaterID?: string;
    wsProtocols?: string[];
  }

  // The events the console listens for, with the detail noVNC sends on each.
  export interface RfbEventMap {
    connect: CustomEvent<Record<string, never>>;
    disconnect: CustomEvent<{ clean: boolean }>;
    securityfailure: CustomEvent<{ status: number; reason?: string }>;
    clipboard: CustomEvent<{ text: string }>;
  }

  export default class RFB {
    constructor(
      target: HTMLElement,
      urlOrChannel: string | WebSocket,
      options?: RfbOptions,
    );

    background: string;
    viewOnly: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;

    addEventListener<K extends keyof RfbEventMap>(
      type: K,
      listener: (event: RfbEventMap[K]) => void,
    ): void;

    disconnect(): void;
    sendCtrlAltDel(): void;
    // Presses and releases the key, or only presses or releases it when `down` is given.
    sendKey(keysym: number, code: string | null, down?: boolean): void;
    clipboardPasteFrom(text: string): void;
  }
}
