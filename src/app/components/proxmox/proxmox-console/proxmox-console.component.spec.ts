import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProxmoxConsoleComponent } from './proxmox-console.component';

describe('ProxmoxConsoleComponent', () => {
  let component: ProxmoxConsoleComponent;
  let fixture: ComponentFixture<ProxmoxConsoleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ProxmoxConsoleComponent ]
    })
    .compileComponents();
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
