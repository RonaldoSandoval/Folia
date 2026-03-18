import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppSidebar } from './app-sidebar';

describe('AppSidebar', () => {
  let component: AppSidebar;
  let fixture: ComponentFixture<AppSidebar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppSidebar]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppSidebar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
