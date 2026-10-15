// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { EnvironmentProviders, Provider, ProviderToken } from '@angular/core';

export type AnyProvider = Provider | EnvironmentProviders;

const PLACEHOLDER_PASSTHROUGH = new Set<string>(['ngOnDestroy', 'then']);
const PLACEHOLDER_DI_PROBED = new Set<string>(['name']);

/**
 * A provider whose value throws, naming the member, the first time the code
 * under test touches it. It lets unrelated tests construct a component without
 * stubbing every dependency, while never silently returning `undefined`.
 *
 * `label` disambiguates the message when two classes share a name (for example
 * an app `FileService` and a generated `FileService`).
 */
export function unstubbed(
  token: ProviderToken<unknown>,
  label?: string,
): Provider {
  const tokenName = ('name' in token ? token.name : String(token)).replace(
    /^_+/,
    '',
  );
  const name = label ?? tokenName;
  const fail = (prop: string) =>
    new Error(
      `${name}.${prop} was used by the code under test, but ${name} has no stub here. ` +
        `It is only a placeholder so unrelated tests can construct their component. ` +
        `Pass an explicit stub for this test: { provide: ${tokenName}, useValue: { ${prop}: ... } }`,
    );
  const value = new Proxy(
    {},
    {
      get(target, prop) {
        if (
          typeof prop === 'symbol' ||
          prop in target ||
          PLACEHOLDER_PASSTHROUGH.has(prop)
        ) {
          return Reflect.get(target, prop);
        }
        if (PLACEHOLDER_DI_PROBED.has(prop)) {
          return () => {
            throw fail(prop);
          };
        }
        throw fail(prop);
      },
    },
  );
  return { provide: token, useValue: value };
}

export function getProvideToken(
  provider: AnyProvider,
): ProviderToken<unknown> | null {
  if (typeof provider === 'function') return provider as ProviderToken<unknown>;
  const withProvide = provider as { provide?: ProviderToken<unknown> };
  return withProvide.provide ?? null;
}

/** Later entries win: an override replaces the default with the same token. */
export function mergeProviders(
  defaults: readonly AnyProvider[],
  overrides?: readonly AnyProvider[],
): AnyProvider[] {
  if (!overrides?.length) return [...defaults];
  const overrideTokens = new Set(overrides.map(getProvideToken));
  const filtered = defaults.filter(
    (p) => !overrideTokens.has(getProvideToken(p)),
  );
  return [...filtered, ...overrides];
}
