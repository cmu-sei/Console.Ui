// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';
import { MatDivider } from '@angular/material/divider';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatListOption, MatSelectionList } from '@angular/material/list';
import { CRUCIBLE_DIALOG_IMPORTS } from '@cmusei/crucible-common';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { IsoFile, IsoResult } from '../../../models/vm/iso-result';

@Component({
  selector: 'mount-iso-dialog',
  templateUrl: './mount-iso-dialog.component.html',
  styleUrls: ['./mount-iso-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ...CRUCIBLE_DIALOG_IMPORTS,
    A11yModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatSelectionList,
    MatButton,
    MatListOption,
    MatDivider,
  ],
})
export class MountIsoDialogComponent implements OnInit, OnDestroy {
  public isoResults: IsoResult[] = [];

  @Input()
  set isoResult(val: IsoResult[]) {
    this.isoResults = val;
    this.isoResults.forEach((result) => {
      result.display = this.applyFilter(result.isos);
      result.hide = false;

      result.teamIsoResults.forEach((teamResult) => {
        teamResult.display = this.applyFilter(teamResult.isos);
        teamResult.hide = false;
      });
    });
  }

  public selectedIso?: IsoFile;

  private filterValue = '';
  private searchSubject$ = new Subject<string>();
  private unsubscribe$ = new Subject<void>();

  constructor(
    private dialogRef: MatDialogRef<MountIsoDialogComponent, IsoFile>,
    private changeDetectorRef: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.searchSubject$
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        takeUntil(this.unsubscribe$),
      )
      .subscribe((searchTextValue) => {
        this.setFilter(searchTextValue);
      });
  }

  onSearch(searchTextValue: string) {
    this.searchSubject$.next(searchTextValue);
  }

  selectThisIso(iso: IsoFile) {
    this.selectedIso = iso;
  }

  setFilter(filterValue: string) {
    this.filterValue = filterValue.trim().toLowerCase();

    this.isoResults.forEach((result) => {
      if (!result.hide) {
        result.display = this.applyFilter(result.isos);
      }

      result.teamIsoResults.forEach((teamResult) => {
        if (!teamResult.hide) {
          teamResult.display = this.applyFilter(teamResult.isos);
        }
      });
    });

    this.changeDetectorRef.markForCheck();
  }

  applyFilter(isos: IsoFile[]): IsoFile[] {
    return isos.filter((iso) =>
      iso.filename.toLowerCase().includes(this.filterValue),
    );
  }

  done() {
    if (this.selectedIso) {
      this.dialogRef.close(this.selectedIso);
    }
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }
}
