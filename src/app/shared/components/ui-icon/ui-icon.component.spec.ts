import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiIcon } from './ui-icon.component';

describe('UiIcon', () => {
  let fixture: ComponentFixture<UiIcon>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [UiIcon] }).compileComponents();
    fixture = TestBed.createComponent(UiIcon);
  });

  it('should render the subset icon hidden from assistive tech', () => {
    fixture.componentRef.setInput('name', 'md-delete');
    fixture.detectChanges();
    const icon = fixture.nativeElement.querySelector('i');
    expect(icon?.className).toContain('md-delete');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });
});
