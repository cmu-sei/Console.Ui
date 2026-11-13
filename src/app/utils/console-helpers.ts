// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

/**
 * Whether the console is embedded in another page (a Player view) rather than opened in its own tab.
 * A cross-origin parent makes reading window.top throw, which is itself the answer.
 */
export function inIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

const MAX_CONNECTED_USERS_SHOWN = 2;

/** "Connected: alice, bob" or "Connected: alice, bob and 3 others", or '' when nobody else is. */
export function formatConnectedUsers(
  users: string[] | null | undefined,
): string {
  if (!users?.length) {
    return '';
  }
  const shown = users.slice(0, MAX_CONNECTED_USERS_SHOWN).join(', ');
  const rest = users.length - MAX_CONNECTED_USERS_SHOWN;
  return rest > 0
    ? `Connected: ${shown} and ${rest} ${rest === 1 ? 'other' : 'others'}`
    : `Connected: ${shown}`;
}
