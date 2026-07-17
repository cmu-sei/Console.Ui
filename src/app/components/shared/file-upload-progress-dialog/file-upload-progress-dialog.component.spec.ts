// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Subject } from 'rxjs';
import { FileUploadProgressDialogComponent } from './file-upload-progress-dialog.component';

describe('FileUploadProgressDialogComponent', () => {
  let fixture: ComponentFixture<FileUploadProgressDialogComponent>;
  let keydownEvents: Subject<KeyboardEvent>;
  let dialogRef: jasmine.SpyObj<MatDialogRef<unknown>>;

  beforeEach(async () => {
    keydownEvents = new Subject<KeyboardEvent>();
    dialogRef = jasmine.createSpyObj<MatDialogRef<unknown>>(
      'MatDialogRef',
      ['close', 'keydownEvents'],
      { disableClose: false },
    );
    dialogRef.keydownEvents.and.returnValue(keydownEvents);

    await TestBed.configureTestingModule({
      imports: [FileUploadProgressDialogComponent, NoopAnimationsModule],
      providers: [{ provide: MatDialogRef, useValue: dialogRef }],
    }).compileComponents();

    fixture = TestBed.createComponent(FileUploadProgressDialogComponent);
    await fixture.whenStable();
  });

  it('renders centered progress with one keyboard-reachable close action', () => {
    expect(
      fixture.nativeElement.querySelector('.progress-content'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('mat-progress-spinner'),
    ).toBeTruthy();
    const actions = fixture.nativeElement.querySelectorAll(
      'mat-dialog-actions button',
    );
    expect(actions.length).toBe(1);
    expect(actions[0].textContent.trim()).toBe('Close');
    expect(actions[0].disabled).toBeFalse();
    expect(actions[0].tabIndex).toBe(0);
    expect(actions[0].hasAttribute('cdkFocusInitial')).toBeTrue();
  });

  it('closes from the explicit action while loading', () => {
    const closeButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      'mat-dialog-actions button',
    );

    closeButton.click();

    expect(dialogRef.close).toHaveBeenCalledOnceWith(undefined);
  });

  it('does not dismiss on Escape while loading', () => {
    keydownEvents.next(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(dialogRef.disableClose).toBeTrue();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
});
