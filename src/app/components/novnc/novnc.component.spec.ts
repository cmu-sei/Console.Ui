/*
Copyright 2021 Carnegie Mellon University. All Rights Reserved. 
 Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
*/

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NovncComponent } from './novnc.component';

describe('NovncComponent', () => {
  let component: NovncComponent;
  let fixture: ComponentFixture<NovncComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ NovncComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(NovncComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
