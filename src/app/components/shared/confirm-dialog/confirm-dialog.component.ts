import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  buttonTrueText?: string;
  buttonFalseText?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  public title: string;
  public message: string;
  public buttonFalseText: string;
  public buttonTrueText: string;
  public removeArtifacts: boolean = true;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData,
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
  ) {
    this.dialogRef.disableClose = true;
    this.buttonFalseText = data.buttonFalseText ?? 'Cancel';
    this.buttonTrueText = data.buttonTrueText ?? 'Confirm';
    this.title = data.title;
    this.message = data.message;
  }

  confirm(): void {
    this.dialogRef.close(true);
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
