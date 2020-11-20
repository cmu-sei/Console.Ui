/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { UserFollowPageComponent } from './user-follow-page.component';

describe('UserFollowPageComponent', () => {
  let component: UserFollowPageComponent;
  let fixture: ComponentFixture<UserFollowPageComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ UserFollowPageComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(UserFollowPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
