// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { TestBed, inject } from '@angular/core/testing';

import { VmService } from './vm.service';

describe('VmService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [VmService]
    });
  });

  it('should be created', inject([VmService], (service: VmService) => {
    expect(service).toBeTruthy();
  }));
});

