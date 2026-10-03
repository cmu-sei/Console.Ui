// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { BehaviorSubject } from 'rxjs';
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  convertToParamMap,
  Params,
} from '@angular/router';

/**
 * An ActivatedRoute the test can drive. Data services in several apps derive
 * their filter and sort streams from `queryParamMap`, and some read
 * `snapshot.queryParamMap` at construction; push new values with
 * `setQueryParams` / `setParams`. Typed off the real class, so it tracks the
 * members read. `snapshot` reflects the current values.
 */
type ActivatedRouteStub = Pick<
  ActivatedRoute,
  'queryParamMap' | 'paramMap' | 'queryParams' | 'params' | 'snapshot'
>;

export function activatedRouteStub(
  initialQueryParams: Params = {},
  initialParams: Params = {},
): {
  route: ActivatedRoute;
  setQueryParams: (params: Params) => void;
  setParams: (params: Params) => void;
} {
  const queryParams = new BehaviorSubject<Params>(initialQueryParams);
  const params = new BehaviorSubject<Params>(initialParams);
  const queryParamMap = new BehaviorSubject(
    convertToParamMap(initialQueryParams),
  );
  const paramMap = new BehaviorSubject(convertToParamMap(initialParams));
  const stub: ActivatedRouteStub = {
    queryParams: queryParams.asObservable(),
    params: params.asObservable(),
    queryParamMap: queryParamMap.asObservable(),
    paramMap: paramMap.asObservable(),
    get snapshot() {
      return {
        params: params.value,
        paramMap: paramMap.value,
        queryParams: queryParams.value,
        queryParamMap: queryParamMap.value,
      } as ActivatedRouteSnapshot;
    },
  };
  return {
    route: stub as ActivatedRoute,
    setQueryParams: (next) => {
      queryParams.next(next);
      queryParamMap.next(convertToParamMap(next));
    },
    setParams: (next) => {
      params.next(next);
      paramMap.next(convertToParamMap(next));
    },
  };
}
