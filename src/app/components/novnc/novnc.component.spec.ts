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
