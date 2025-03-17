// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import {
  AppTeamPermission,
  AppViewPermission,
  VmPermissionResult,
  VmsService,
} from '../../generated/vm-api';
import { ActivatedRoute, ParamMap } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class UserPermissionsService {
  private permissionsSubject = new BehaviorSubject<VmPermissionResult>({
    teamPermissions: [],
    viewPermissions: [],
  });
  public permissions$ = this.permissionsSubject.asObservable();

  constructor(
    private vmApi: VmsService,
    private route: ActivatedRoute,
  ) {}

  private readOnlyToggleableSubject = new BehaviorSubject(false);
  readOnlyToggleable$ = this.readOnlyToggleableSubject.asObservable();

  readOnly$ = combineLatest([
    this.readOnlyToggleable$,
    this.route.queryParamMap.pipe(
      map((params: ParamMap) => params.get('readOnly')),
    ),
  ]).pipe(
    map(([readOnlyToggleable, readOnlyQueryParam]) => {
      if (!readOnlyToggleable) {
        return true;
      } else if (readOnlyQueryParam != null) {
        return readOnlyQueryParam.toLocaleLowerCase() === 'true';
      } else {
        return false;
      }
    }),
  );

  load(vmId: string): Observable<VmPermissionResult> {
    return this.vmApi.getVmPermissions(vmId).pipe(
      tap((x) => this.permissionsSubject.next(x)),
      tap((x) => {
        if (
          !x.teamPermissions.includes(AppTeamPermission.EditTeam) &&
          !x.viewPermissions.includes(AppViewPermission.EditView)
        ) {
          this.readOnlyToggleableSubject.next(false);
        } else {
          this.readOnlyToggleableSubject.next(true);
        }
      }),
    );
  }

  can(teamPermission?: AppTeamPermission, viewPermission?: AppViewPermission) {
    return this.permissions$.pipe(
      map((x) => {
        return (
          x.teamPermissions.includes(teamPermission) ||
          x.viewPermissions.includes(viewPermission)
        );
      }),
    );
  }
}
