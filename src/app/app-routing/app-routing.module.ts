// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ComnAuthGuardService } from '@cmusei/crucible-common';
import { ConsolePageComponent } from '../components/console-page/console-page.component';
import { PageNotFoundComponent } from '../components/page-not-found/page-not-found.component';
import { UserFollowPageComponent } from '../components/user-follow-page/user-follow-page.component';

const routes: Routes = [
  {
    path: 'vm/:id/console',
    component: ConsolePageComponent,
    canActivate: [ComnAuthGuardService],
  },
  {
    path: 'user/:userId/view/:viewId/console',
    component: UserFollowPageComponent,
    canActivate: [ComnAuthGuardService],
  },
  {
    path: '**',
    component: PageNotFoundComponent,
  },
];

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forRoot(routes, {}),
  ],
  declarations: [],
})
export class AppRoutingModule {}
