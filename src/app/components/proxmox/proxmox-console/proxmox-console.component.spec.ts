/*
Copyright 2021 Carnegie Mellon University. All Rights Reserved. 
 Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
*/

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProxmoxConsoleComponent } from './proxmox-console.component';

describe('ProxmoxConsoleComponent', () => {
  let component: ProxmoxConsoleComponent;
  let fixture: ComponentFixture<ProxmoxConsoleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProxmoxConsoleComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ProxmoxConsoleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
