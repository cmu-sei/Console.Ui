// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { onTestFinished, vi } from 'vitest';

// The vendored VMware WebMKS SDK is a global script in angular.json. The
// unit-test builder doesn't load build `scripts`, so `WMKS` is undefined in
// tests; this installs a minimal stand-in with the constants the app reads.
export const WMKS_CONST = {
  ConnectionState: {
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
  },
  Events: {
    CONNECTION_STATE_CHANGE: 'connectionstatechange',
    COPY: 'copy',
  },
  Position: { CENTER: 1 },
} as const;

type WmksHandler = (event: unknown, data: unknown) => void;

export class FakeWmksClient {
  handlers: Record<string, WmksHandler> = {};
  connectionState: string = WMKS_CONST.ConnectionState.DISCONNECTED;

  register = vi.fn((event: string, handler: WmksHandler) => {
    this.handlers[event] = handler;
  });
  getConnectionState = vi.fn(() => this.connectionState);
  connect = vi.fn();
  disconnect = vi.fn();
  unregister = vi.fn();
  destroy = vi.fn();
  updateScreen = vi.fn();
  sendCAD = vi.fn();
  sendInputString = vi.fn();
  grab = vi.fn();
  isFullScreen = vi.fn(() => false);
  canFullScreen = vi.fn(() => true);
  enterFullScreen = vi.fn();

  /** Simulate the SDK firing a registered event. */
  emit(event: string, data: unknown) {
    this.handlers[event]?.({}, data);
  }
  /** Simulate a CONNECTION_STATE_CHANGE to `state`. */
  changeState(state: string) {
    this.connectionState = state;
    this.emit(WMKS_CONST.Events.CONNECTION_STATE_CHANGE, { state });
  }
}

export interface FakeWmksLib {
  CONST: typeof WMKS_CONST;
  createWMKS: ReturnType<typeof vi.fn>;
  clients: FakeWmksClient[];
}

/** Install a global `WMKS` for the current test; removed when it finishes. */
export function installFakeWmks(): FakeWmksLib {
  const clients: FakeWmksClient[] = [];
  const lib: FakeWmksLib = {
    CONST: WMKS_CONST,
    clients,
    createWMKS: vi.fn((_containerId: string, _options: unknown) => {
      const client = new FakeWmksClient();
      clients.push(client);
      return client;
    }),
  };
  vi.stubGlobal('WMKS', lib);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  return lib;
}
