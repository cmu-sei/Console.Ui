// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/angular';
import { BehaviorSubject } from 'rxjs';
import { ComnAuthQuery, Theme } from '@cmusei/crucible-common';
import { NoVNCService } from '../../services/novnc/novnc.service';
import { NovncComponent } from './novnc.component';
import { renderComponent } from '../../test-utils/render-component';
import { stubClipboard } from '../../test-utils/clipboard';
import {
  captureUnhandledRejections,
  flush,
} from '../../test-utils/unhandled-rx-errors';

type NoVncStub = Pick<
  NoVNCService,
  | 'startClient'
  | 'disconnect'
  | 'setViewOnly'
  | 'setConnectListener'
  | 'setDisconnectListener'
  | 'setSecurityFailureListener'
  | 'setClipboardListener'
  | 'updateBackground'
>;

type Listener = (e: unknown) => unknown;

async function renderNovnc(
  inputs: { url?: string; ticket?: string; readOnly?: boolean } = {},
) {
  const novnc: NoVncStub = {
    startClient: vi.fn(),
    disconnect: vi.fn(),
    setViewOnly: vi.fn(),
    setConnectListener: vi.fn(),
    setDisconnectListener: vi.fn(),
    setSecurityFailureListener: vi.fn(),
    setClipboardListener: vi.fn(),
    updateBackground: vi.fn(),
  };
  const theme$ = new BehaviorSubject<Theme>(Theme.LIGHT);
  const reconnect = vi.fn();

  const rendered = await renderComponent(NovncComponent, {
    inputs,
    on: { reconnect },
    providers: [
      { provide: NoVNCService, useValue: novnc },
      {
        provide: ComnAuthQuery,
        useValue: { userTheme$: theme$ } satisfies Pick<ComnAuthQuery, 'userTheme$'>,
      },
    ],
  });

  // The listeners the component registered with the noVNC client, by event.
  const listener = (name: keyof NoVncStub): Listener =>
    vi.mocked(novnc[name]).mock.lastCall![0] as Listener;

  return { ...rendered, novnc, theme$, reconnect, listener };
}

describe('NovncComponent', () => {
  /**
   * Verifies: with a url and ticket already bound, the client starts after the view exists, read-only state included.
   * Interacts with: NoVNCService.startClient and listener setters.
   * Data: url 'wss://pve/ws', ticket 't-1', readOnly true.
   */
  it('starts the client once the screen exists', async () => {
    const { novnc } = await renderNovnc({ url: 'wss://pve/ws', ticket: 't-1', readOnly: true });

    expect(novnc.startClient).toHaveBeenCalledWith(
      'wss://pve/ws',
      't-1',
      'screen',
      true,
      expect.any(String),
    );
    expect(novnc.setConnectListener).toHaveBeenCalled();
    expect(novnc.setDisconnectListener).toHaveBeenCalled();
    expect(novnc.setSecurityFailureListener).toHaveBeenCalled();
    expect(novnc.setClipboardListener).toHaveBeenCalled();
  });

  /**
   * Verifies: without a ticket nothing connects.
   * Interacts with: NoVNCService.startClient.
   * Data: url only.
   */
  it('does not connect without a ticket', async () => {
    const { novnc } = await renderNovnc({ url: 'wss://pve/ws' });
    expect(novnc.startClient).not.toHaveBeenCalled();
  });

  /**
   * Verifies: read-only changes are applied to the live noVNC session.
   * Interacts with: the readOnly input via rerender; NoVNCService.setViewOnly.
   * Data: readOnly true, then false.
   */
  it('passes read-only changes to noVNC', async () => {
    const { novnc, rerender } = await renderNovnc({
      url: 'wss://pve/ws',
      ticket: 't-1',
      readOnly: true,
    });
    expect(novnc.setViewOnly).toHaveBeenLastCalledWith(true);

    await rerender({ inputs: { readOnly: false }, partialUpdate: true });

    expect(novnc.setViewOnly).toHaveBeenLastCalledWith(false);
  });

  /**
   * Verifies: a new ticket after the view exists starts a fresh client.
   * Interacts with: the ticket input via rerender; NoVNCService.startClient.
   * Data: ticket 't-1' then 't-2'.
   */
  it('restarts the client when the ticket changes', async () => {
    const { novnc, rerender } = await renderNovnc({ url: 'wss://pve/ws', ticket: 't-1' });

    await rerender({ inputs: { ticket: 't-2' }, partialUpdate: true });

    expect(vi.mocked(novnc.startClient).mock.calls.map((c) => c[1])).toEqual(['t-1', 't-2']);
  });

  /**
   * Verifies: "Connecting..." shows until the client connects.
   * Interacts with: the connect listener the component registered; isConnected$.
   * Data: one connect event.
   */
  it('shows Connecting... until connected', async () => {
    const { fixture, listener } = await renderNovnc({ url: 'wss://pve/ws', ticket: 't-1' });
    expect(screen.getByRole('heading', { name: 'Connecting...' })).toBeInTheDocument();

    listener('setConnectListener')({});
    fixture.detectChanges();

    expect(screen.queryByRole('heading', { name: 'Connecting...' })).not.toBeInTheDocument();
  });

  /**
   * Verifies: each unexpected disconnect asks the parent to reconnect with a running failure count, reset by a successful connect.
   * Interacts with: the disconnect/connect listeners; the reconnect output.
   * Data: two disconnects, a connect, then another disconnect.
   */
  it('asks the parent to reconnect with the failure count', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { listener, reconnect } = await renderNovnc({ url: 'wss://pve/ws', ticket: 't-1' });
    const disconnected = listener('setDisconnectListener');
    const connected = listener('setConnectListener');

    disconnected({ detail: { clean: true } });
    disconnected({ detail: { clean: false } });
    connected({});
    disconnected({ detail: { clean: true } });

    expect(reconnect.mock.calls).toEqual([[1], [2], [1]]);
  });

  /**
   * Verifies: tearing the component down closes the session, and the resulting disconnect doesn't ask for a reconnect.
   * Interacts with: ComponentFixture.destroy; NoVNCService.disconnect; the disconnect listener; the reconnect output.
   * Data: a connected client, then destroy.
   */
  it('disconnects on destroy without requesting a reconnect', async () => {
    const { fixture, novnc, listener, reconnect } = await renderNovnc({
      url: 'wss://pve/ws',
      ticket: 't-1',
    });
    const disconnected = listener('setDisconnectListener');

    fixture.destroy();
    disconnected({ detail: { clean: true } });

    expect(novnc.disconnect).toHaveBeenCalled();
    expect(reconnect).not.toHaveBeenCalled();
  });

  /**
   * Verifies: a theme change re-reads the screen background and hands it to noVNC.
   * Interacts with: ComnAuthQuery.userTheme$; NoVNCService.updateBackground.
   * Data: theme switched to dark.
   */
  it('updates the noVNC background when the theme changes', async () => {
    const { novnc, theme$ } = await renderNovnc({ url: 'wss://pve/ws', ticket: 't-1' });
    vi.mocked(novnc.updateBackground).mockClear();

    theme$.next(Theme.DARK);

    expect(novnc.updateBackground).toHaveBeenCalledOnce();
  });

  /**
   * Verifies: text the guest puts on its clipboard is copied to the local clipboard.
   * Interacts with: the clipboard listener; a stubbed navigator.clipboard.writeText.
   * Data: clipboard event carrying 'secret'.
   */
  it('copies guest clipboard text locally', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { writeText } = stubClipboard();
    const { listener } = await renderNovnc({ url: 'wss://pve/ws', ticket: 't-1' });

    await listener('setClipboardListener')({ detail: { text: 'secret' } });

    expect(writeText).toHaveBeenCalledWith('secret');
  });

  /**
   * Verifies: a local clipboard write the browser refuses leaves an unhandled rejection (current behavior).
   * Interacts with: the clipboard listener, invoked without awaiting as noVNC's event dispatch does; stubbed navigator.clipboard.writeText rejecting; captureUnhandledRejections.
   * Data: clipboard event carrying 'secret'; writeText rejects with 'denied'.
   */
  it('lets a refused clipboard write escape unhandled', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { writeText } = stubClipboard();
    const denied = new Error('denied');
    writeText.mockRejectedValue(denied);
    const { listener } = await renderNovnc({ url: 'wss://pve/ws', ticket: 't-1' });
    const rejections = captureUnhandledRejections();

    void listener('setClipboardListener')({ detail: { text: 'secret' } });
    await flush();

    expect(rejections).toEqual([denied]);
  });
});
