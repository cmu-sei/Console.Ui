// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { vi } from 'vitest';
import * as signalR from '@microsoft/signalr';
import { EMPTY, Observable } from 'rxjs';

type HubInvoke = (method: string, ...args: unknown[]) => Promise<unknown>;
type HubSend = (method: string, ...args: unknown[]) => Promise<void>;
type HubStream = (method: string, ...args: unknown[]) => Observable<unknown>;

/**
 * Stands in for a SignalR HubConnection: records `on()` handlers so a test can
 * push hub events with `trigger()`, and never opens a socket. `start()` moves
 * to Connected, `stop()` back to Disconnected, as the real connection does.
 *
 * `invoke`, `send` and `stream` are `vi.fn`s typed off the real signatures.
 * Stub hub method results keyed on the method name, because services often
 * invoke the same method more than once, and in an order the test should not
 * depend on:
 *
 * ```ts
 * hub.invoke.mockImplementation((method) =>
 *   Promise.resolve(method === 'GetVms' ? vms : undefined),
 * );
 * ```
 *
 * A `vi.fn` attaches its own handler to every promise it returns (to fill
 * `mock.settledResults`), so a rejection it returns counts as handled. That is
 * fine when the service chains on the promise (the derived promise still
 * rejects unhandled), but it hides a service that drops the promise without a
 * `.catch`. To pin that, use `rejectInvokes(hub, error)` below. A failing
 * `start()` needs no such care, since services chain on it: make it reject
 * from `onBuild` with `c.start.mockImplementation(() => Promise.reject(err))`.
 */
export class FakeHubConnection {
  handlers: Record<string, (...data: unknown[]) => void> = {};
  reconnectedCallbacks: Array<() => void> = [];
  reconnectingCallbacks: Array<() => void> = [];
  closeCallbacks: Array<(error?: Error) => void> = [];
  state: signalR.HubConnectionState = signalR.HubConnectionState.Disconnected;
  baseUrl = '';
  serverTimeoutInMilliseconds = 30000;
  keepAliveIntervalInMilliseconds = 15000;
  // Typed to resolve to `unknown`, so a test can stub a hub method's result.
  invoke = vi.fn<HubInvoke>(() => Promise.resolve());
  send = vi.fn<HubSend>(() => Promise.resolve());
  stream = vi.fn<HubStream>(() => EMPTY);
  start = vi.fn(() => {
    this.state = signalR.HubConnectionState.Connected;
    return Promise.resolve();
  });
  stop = vi.fn(() => {
    this.state = signalR.HubConnectionState.Disconnected;
    return Promise.resolve();
  });

  on(event: string, cb: (...data: unknown[]) => void) {
    this.handlers[event] = cb;
  }
  off(event: string) {
    delete this.handlers[event];
  }
  onreconnected(cb: () => void) {
    this.reconnectedCallbacks.push(cb);
  }
  onreconnecting(cb: () => void) {
    this.reconnectingCallbacks.push(cb);
  }
  onclose(cb: (error?: Error) => void) {
    this.closeCallbacks.push(cb);
  }

  /** Simulates the hub pushing an event to this connection. */
  trigger(event: string, ...data: unknown[]) {
    const handler = this.handlers[event];
    if (!handler) {
      throw new Error(`No handler registered for hub event '${event}'`);
    }
    return handler(...data);
  }
  /** Simulates an automatic reconnect completing. */
  reconnect() {
    this.state = signalR.HubConnectionState.Connected;
    this.reconnectedCallbacks.forEach((cb) => cb());
  }
}

/**
 * Replaces `hub.invoke` with a plain function that rejects, so a service that
 * drops the promise without a `.catch` leaves an unhandled rejection the test
 * can read with `captureUnhandledRejections()` (unhandled-rx-errors.ts).
 * `reason` is the rejection, or a function of the method name that returns
 * one (`(method) => new Error(`${method} failed`)`). Pass `methods` to reject
 * only those; the rest resolve. Returns `[method, ...args]` per call, because
 * `hub.invoke` is no longer a mock afterwards.
 */
export function rejectInvokes(
  hub: FakeHubConnection,
  reason: unknown,
  methods?: readonly string[],
): Array<[string, ...unknown[]]> {
  const calls: Array<[string, ...unknown[]]> = [];
  const invoke: HubInvoke = (method, ...args) => {
    calls.push([method, ...args]);
    if (methods && !methods.includes(method)) {
      return Promise.resolve();
    }
    return Promise.reject(
      typeof reason === 'function' ? reason(method) : reason,
    );
  };
  Object.defineProperty(hub, 'invoke', { value: invoke, writable: true });
  return calls;
}

export interface MockHubConnectionBuilderOptions {
  /**
   * Runs on each connection right after `build()`, before the service can call
   * `start()`. Use it to make `start()` reject or stay pending, or to stub
   * `stream()`, for services that start the connection synchronously.
   * `index` counts builds from 0, so `index === 0` affects only the first
   * connection. Specs never spy on `HubConnectionBuilder.prototype`
   * themselves; `connections.length` is the build count.
   */
  onBuild?: (connection: FakeHubConnection, index: number) => void;
}

/**
 * Spies on the HubConnectionBuilder chain so `build()` returns a
 * FakeHubConnection. Call it in `beforeEach`; `restoreMocks` in
 * vitest.config.ts undoes the spies after every test.
 */
export function mockHubConnectionBuilder(
  options: MockHubConnectionBuilderOptions = {},
) {
  const connections: FakeHubConnection[] = [];
  const proto = signalR.HubConnectionBuilder.prototype;
  const withUrl = vi.spyOn(proto, 'withUrl').mockReturnThis();
  const withAutomaticReconnect = vi
    .spyOn(proto, 'withAutomaticReconnect')
    .mockReturnThis();
  vi.spyOn(proto, 'withStatefulReconnect').mockReturnThis();
  vi.spyOn(proto, 'configureLogging').mockReturnThis();
  vi.spyOn(proto, 'build').mockImplementation(() => {
    const connection = new FakeHubConnection();
    connections.push(connection);
    options.onBuild?.(connection, connections.length - 1);
    return connection as unknown as signalR.HubConnection;
  });
  // withAutomaticReconnect is overloaded, so the spy is typed off its
  // zero-argument form; read the policy argument back with its real type.
  const retryPolicy = () => {
    const calls = withAutomaticReconnect.mock.calls as unknown[][];
    return calls[calls.length - 1]?.[0] as signalR.IRetryPolicy | undefined;
  };
  return { connections, withUrl, retryPolicy };
}
