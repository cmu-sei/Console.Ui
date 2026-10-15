// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

/**
 * openapi-generator's typescript-angular methods carry three overloads, one per
 * `observe` mode ('body' | 'response' | 'events'), declared in that order. App
 * code almost always calls the 'body' overload. A plain `Pick<XService, 'getX'>`
 * rejects a `vi.fn(() => of([...]))` stub, because the stub cannot also satisfy
 * the other overloads. These types pick one signature each.
 */
export type BodyOverload<F> = F extends {
  (...args: infer A): infer R;
  (...args: infer _A2): unknown;
  (...args: infer _A3): unknown;
}
  ? (...args: A) => R
  : F;

/**
 * The 'response' signature, for calls that pass `observe: 'response'` to read
 * headers (file downloads). Non-overloaded members resolve to `never`, so the
 * union in `ApiStub` leaves them unchanged.
 */
export type ResponseOverload<F> = F extends {
  (...args: infer _A1): unknown;
  (...args: infer A): infer R;
  (...args: infer _A3): unknown;
}
  ? (...args: A) => R
  : never;

/**
 * The 'events' signature, for calls that pass `observe: 'events'` to track
 * upload progress (`Observable<HttpEvent<T>>`).
 */
export type EventsOverload<F> = F extends {
  (...args: infer _A1): unknown;
  (...args: infer _A2): unknown;
  (...args: infer A): infer R;
}
  ? (...args: A) => R
  : never;

/** Any one of the three signatures of a generated method. */
type BodyOrResponse<F> = BodyOverload<F> | ResponseOverload<F>;
type AnyOverload<F> = BodyOrResponse<F> | EventsOverload<F>;

/**
 * Shape check for a generated API service stub. Use it with `satisfies`, so the
 * literal keeps its `Mock` types for assertions:
 *
 * ```ts
 * const runsApi = {
 *   getRuns: vi.fn(() => of<Run[]>([])),
 * } satisfies ApiStub<RunsService>;
 * TestBed.configureTestingModule({ providers: [{ provide: RunsService, useValue: runsApi }] });
 * ```
 *
 * A misspelled member, a wrong argument type, or a wrong body type fails to
 * compile. A member may instead match the 'response' or 'events' overload for
 * code that calls it that way. Return a fresh object per call
 * (`vi.fn(() => of(structuredClone(x)))`) when the service mutates responses:
 * Akita deep-freezes stored entities in dev mode, and a frozen fixture reused
 * across calls throws.
 *
 * The check only holds for members written with a literal key. A computed key
 * (`{ [endpoint]: fn }`) widens the literal to an index signature and nothing
 * is checked; table-driven tests use `endpointStub` instead. A member whose
 * generated type is wrong (the API sends something the OpenAPI document does
 * not describe) goes next to the checked block, typed to what the API really
 * sends, under a plain comment that names the API endpoint; record the defect
 * in agent-docs/ui-test-bugs/<app>.md:
 * `{ ...({ ... } satisfies ApiStub<XService>), wrongMember: vi.fn(...) }`.
 */
export type ApiStub<T> = { [K in keyof T]?: AnyOverload<T[K]> };

/**
 * A stub with one endpoint, for table-driven tests whose rows name the
 * endpoint (`it.each([['load()', 'getCards', ...], ...])`). The service class
 * fixes the type, so a name the service lacks, or a `fn` that matches none of
 * the endpoint's signatures, fails to compile:
 *
 * ```ts
 * type ListEndpoint = keyof Pick<CardService, 'getCards' | 'getExhibitCards'>;
 * const api = endpointStub(CardService, endpoint, vi.fn(() => of<Card[]>([])));
 * ```
 */
export function endpointStub<S, K extends keyof S>(
  service: abstract new (...args: never[]) => S,
  endpoint: K,
  fn: NonNullable<ApiStub<S>[K]>,
): ApiStub<S> {
  const stub: ApiStub<S> = {};
  stub[endpoint] = fn;
  return stub;
}
