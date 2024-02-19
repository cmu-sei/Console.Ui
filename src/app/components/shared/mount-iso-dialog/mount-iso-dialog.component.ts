// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import {
  MatDialogRef,
  MatDialogTitle,
  MatDialogActions,
} from '@angular/material/dialog';
import {
  Component,
  ChangeDetectionStrategy,
  Input,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
} from '@angular/core';
import { IsoResult, IsoFile } from '../../../models/vm/iso-result';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil, distinctUntilChanged } from 'rxjs/operators';
import { MatDivider } from '@angular/material/divider';
import { MatButton } from '@angular/material/button';
import { MatSelectionList, MatListOption } from '@angular/material/list';
import { MatInput } from '@angular/material/input';
import { MatFormField, MatLabel } from '@angular/material/form-field';

@Component({
  selector: 'mount-iso-dialog',
  templateUrl: './mount-iso-dialog.component.html',
  styleUrls: ['./mount-iso-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    MatDialogTitle,
    MatFormField,
    MatLabel,
    MatInput,
    MatSelectionList,
    MatButton,
    MatListOption,
    MatDivider,
    MatDialogActions,
  ],
})
export class MountIsoDialogComponent implements OnInit, OnDestroy {
  public data: any;
  public isoResults: IsoResult[];

  @Input()
  set isoResult(val: IsoResult[]) {
    this.isoResults = val;
    this.isoResults.forEach((x) => {
      x.display = this.applyFilter(x.isos);
      x.hide = false;

      x.teamIsoResults.forEach((y) => {
        y.display = this.applyFilter(y.isos);
        y.hide = false;
      });
    });
  }

  public selectedIso: IsoFile;

  private filterValue = '';
  private searchSubject$ = new Subject<string>();
  private unsubscribe$ = new Subject();

  constructor(
    private dialogRef: MatDialogRef<MountIsoDialogComponent>,
    private changeDetectorRef: ChangeDetectorRef,
  ) {
    this.dialogRef.disableClose = true;
  }

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

    this.isoResults.forEach((x) => {
      if (!x.hide) {
        x.display = this.applyFilter(x.isos);
      }

      x.teamIsoResults.forEach((y) => {
        if (!y.hide) {
          y.display = this.applyFilter(y.isos);
        }
      });
    });

    this.changeDetectorRef.markForCheck();
  }

  applyFilter(isos: IsoFile[]): IsoFile[] {
    return isos.filter((x) =>
      x.filename.toLowerCase().includes(this.filterValue),
    );
  }

  close() {
    this.dialogRef.close();
  }

  done() {
    this.dialogRef.close(this.selectedIso);
  }

  ngOnDestroy() {
    this.unsubscribe$.next(null);
    this.unsubscribe$.complete();
  }
}
