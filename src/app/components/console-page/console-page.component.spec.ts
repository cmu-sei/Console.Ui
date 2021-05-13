/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ConsolePageComponent } from './console-page.component';

describe('ConsolePageComponent', () => {
  let component: ConsolePageComponent;
  let fixture: ComponentFixture<ConsolePageComponent>;

  beforeEach(
    waitForAsync(() => {
      TestBed.configureTestingModule({
        declarations: [ConsolePageComponent],
      }).compileComponents();
    })
  );

  beforeEach(() => {
    fixture = TestBed.createComponent(ConsolePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
