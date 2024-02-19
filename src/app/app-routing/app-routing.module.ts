// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Routes } from '@angular/router';
import { ComnAuthGuardService } from '@cmusei/crucible-common';

export const routes: Routes = [
  {
    path: 'vm/:id/console',
    loadComponent: () =>
      import('../components/console-page/console-page.component').then(
        (mod) => mod.ConsolePageComponent,
      ),
    canActivate: [ComnAuthGuardService],
  },
  {
    path: 'user/:userId/view/:viewId/console',
    loadComponent: () =>
      import('../components/user-follow-page/user-follow-page.component').then(
        (mod) => mod.UserFollowPageComponent,
      ),
    canActivate: [ComnAuthGuardService],
  },
  {
    path: '**',
    loadComponent: () =>
      import('../components/page-not-found/page-not-found.component').then(
        (mod) => mod.PageNotFoundComponent,
      ),
  },
];
