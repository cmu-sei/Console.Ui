// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { SystemMessageComponent } from '../../components/shared/system-message/system-message.component';
import { SystemMessageService } from './system-message.service';

describe('SystemMessageService', () => {
  /**
   * Verifies: displayMessage() opens the system-message bottom sheet with the title and message as its data.
   * Interacts with: MatBottomSheet.open spy.
   * Data: title 'VM API Error', message 'Unreachable'.
   */
  it('opens the message sheet with the title and message', () => {
    const sheet = { open: vi.fn() } satisfies Pick<MatBottomSheet, 'open'>;
    TestBed.configureTestingModule({
      providers: [SystemMessageService, { provide: MatBottomSheet, useValue: sheet }],
    });
    const service = TestBed.inject(SystemMessageService);

    service.displayMessage('VM API Error', 'Unreachable');

    expect(sheet.open).toHaveBeenCalledWith(SystemMessageComponent, {
      data: { title: 'VM API Error', message: 'Unreachable' },
    });
  });
});
