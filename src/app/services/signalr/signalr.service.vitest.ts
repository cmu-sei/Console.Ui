// Copyright 2023 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { getDefaultProviders } from 'src/app/test-utils/vitest-default-providers';
import { SignalRService } from './signalr.service';

describe('SignalRService', () => {
  it('should be created from default providers', () => {
    TestBed.configureTestingModule({
      providers: [...getDefaultProviders()],
    });
    const service = TestBed.inject(SignalRService);
    expect(service).toBeTruthy();
  });

  it('should have startConnection method', () => {
    TestBed.configureTestingModule({
      providers: [...getDefaultProviders()],
    });
    const service = TestBed.inject(SignalRService);
    expect(typeof service.startConnection).toBe('function');
  });

  it('should have joinVm method', () => {
    TestBed.configureTestingModule({
      providers: [...getDefaultProviders()],
    });
    const service = TestBed.inject(SignalRService);
    expect(typeof service.joinVm).toBe('function');
  });

  it('should have setActiveVirtualMachine method', () => {
    TestBed.configureTestingModule({
      providers: [...getDefaultProviders()],
    });
    const service = TestBed.inject(SignalRService);
    expect(typeof service.setActiveVirtualMachine).toBe('function');
  });

  it('should have currentVmUsers$ BehaviorSubject', () => {
    TestBed.configureTestingModule({
      providers: [...getDefaultProviders()],
    });
    const service = TestBed.inject(SignalRService);
    expect(service.currentVmUsers$).toBeTruthy();
  });
});
