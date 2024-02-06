/*
Copyright 2021 Carnegie Mellon University. All Rights Reserved. 
 Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
*/

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OptionsBar2Component } from './options-bar2.component';

describe('OptionsBar2Component', () => {
  let component: OptionsBar2Component;
  let fixture: ComponentFixture<OptionsBar2Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OptionsBar2Component],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(OptionsBar2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
