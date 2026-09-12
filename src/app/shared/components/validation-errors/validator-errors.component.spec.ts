import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { provideTranslateService } from '@ngx-translate/core';
import { ValidatorErrors } from './validator-errors.component';

describe('ValidatorErrors', () => {
  let component: ValidatorErrors;
  let fixture: ComponentFixture<ValidatorErrors>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ValidatorErrors, ReactiveFormsModule],
      providers: [provideTranslateService()],
    }).compileComponents();

    fixture = TestBed.createComponent(ValidatorErrors);
    component = fixture.componentInstance;
  });

  function setInput(name: string, value: unknown): void {
    fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  }

  describe('should create', () => {
    it('should create component instance', () => {
      expect(component).toBeTruthy();
    });
  });

  describe('errorKey', () => {
    it('should return null when control is null', () => {
      setInput('control', null);
      expect(component.errorKey()).toBeNull();
    });

    it('should return null when control has no errors', () => {
      const control = new FormControl('test');
      control.markAsTouched();
      setInput('control', control);
      expect(component.errorKey()).toBeNull();
    });

    it('should return null when control is untouched', () => {
      const control = new FormControl('', { validators: Validators.required });
      setInput('control', control);
      expect(component.errorKey()).toBeNull();
    });

    it('should return first error key when control has errors and is touched', () => {
      const control = new FormControl('');
      control.setErrors({ required: true });
      control.markAsTouched();
      setInput('control', control);
      expect(component.errorKey()).toBe('required');
    });

    it('should return first error when multiple errors exist', () => {
      const control = new FormControl('');
      control.setErrors({ required: true, minlength: { requiredLength: 3 } });
      control.markAsTouched();
      setInput('control', control);
      expect(component.errorKey()).toBe('required');
    });

    it('should return error after markAsTouched is called', () => {
      const control = new FormControl('', { validators: Validators.required });
      setInput('control', control);
      expect(component.errorKey()).toBeNull();

      control.markAsTouched();
      fixture.detectChanges();
      expect(component.errorKey()).toBe('required');
    });
  });

  describe('errorParams', () => {
    it('should return control name when no specific params', () => {
      setInput('label', 'Email');
      const control = new FormControl('');
      control.setErrors({ required: true });
      control.markAsTouched();
      setInput('control', control);
      expect(component.errorParams()).toEqual({ control: 'Email' });
    });

    it('should include min value for min error', () => {
      setInput('label', 'Age');
      const control = new FormControl('');
      control.setErrors({ min: { min: 18 } });
      control.markAsTouched();
      setInput('control', control);
      expect(component.errorParams()).toEqual({ control: 'Age', value: 18 });
    });

    it('should include max value for max error', () => {
      setInput('label', 'Age');
      const control = new FormControl('');
      control.setErrors({ max: { max: 100 } });
      control.markAsTouched();
      setInput('control', control);
      expect(component.errorParams()).toEqual({ control: 'Age', value: 100 });
    });

    it('should include requiredLength for maxlength error', () => {
      setInput('label', 'Username');
      const control = new FormControl('');
      control.setErrors({ maxlength: { requiredLength: 50 } });
      control.markAsTouched();
      setInput('control', control);
      expect(component.errorParams()).toEqual({ control: 'Username', value: 50 });
    });

    it('should include requiredLength for minlength error', () => {
      setInput('label', 'Username');
      const control = new FormControl('');
      control.setErrors({ minlength: { requiredLength: 3 } });
      control.markAsTouched();
      setInput('control', control);
      expect(component.errorParams()).toEqual({ control: 'Username', value: 3 });
    });

    it('should return empty control when control is null', () => {
      setInput('control', null);
      setInput('label', 'Test');
      expect(component.errorParams()).toEqual({ control: 'Test' });
    });
  });

  describe('error rendering', () => {
    it('should not render error when control is null', () => {
      setInput('control', null);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.text-red-500')).toBeNull();
    });

    it('should not render error when control has no errors', () => {
      const control = new FormControl('test');
      control.markAsTouched();
      setInput('control', control);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.text-red-500')).toBeNull();
    });

    it('should not render error when control is untouched', () => {
      const control = new FormControl('', { validators: Validators.required });
      setInput('control', control);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.text-red-500')).toBeNull();
    });

    it('should render required error when control has required error and is touched', () => {
      const control = new FormControl('');
      control.setErrors({ required: true });
      control.markAsTouched();
      setInput('control', control);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.text-red-500')).toBeTruthy();
    });

    it('should render maxlength error when control has maxlength error', () => {
      const control = new FormControl('');
      control.setErrors({ maxlength: { requiredLength: 10 } });
      control.markAsTouched();
      setInput('control', control);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.text-red-500')).toBeTruthy();
    });

    it('should render minlength error when control has minlength error', () => {
      const control = new FormControl('');
      control.setErrors({ minlength: { requiredLength: 3 } });
      control.markAsTouched();
      setInput('control', control);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.text-red-500')).toBeTruthy();
    });

    it('should render pattern error when control has pattern error', () => {
      const control = new FormControl('');
      control.setErrors({ pattern: true });
      control.markAsTouched();
      setInput('control', control);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.text-red-500')).toBeTruthy();
    });

    it('should render email error when control has email error', () => {
      const control = new FormControl('');
      control.setErrors({ email: true });
      control.markAsTouched();
      setInput('control', control);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.text-red-500')).toBeTruthy();
    });

    it('should render min error when control has min error', () => {
      const control = new FormControl('');
      control.setErrors({ min: { min: 18 } });
      control.markAsTouched();
      setInput('control', control);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.text-red-500')).toBeTruthy();
    });

    it('should render max error when control has max error', () => {
      const control = new FormControl('');
      control.setErrors({ max: { max: 100 } });
      control.markAsTouched();
      setInput('control', control);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.text-red-500')).toBeTruthy();
    });

    it('should render unique error when control has unique error', () => {
      const control = new FormControl('');
      control.setErrors({ unique: true });
      control.markAsTouched();
      setInput('control', control);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.text-red-500')).toBeTruthy();
    });
  });

  describe('custom error messages', () => {
    it('should render custom required message when provided', () => {
      const control = new FormControl('');
      control.setErrors({ required: true });
      control.markAsTouched();
      setInput('control', control);
      setInput('required', 'Custom required message');
      setInput('label', 'Field');
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Custom required message');
    });

    it('should render custom maxlength message when provided', () => {
      const control = new FormControl('');
      control.setErrors({ maxlength: { requiredLength: 10 } });
      control.markAsTouched();
      setInput('control', control);
      setInput('maxlength', 'Custom maxlength message');
      setInput('label', 'Field');
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Custom maxlength message');
    });

    it('should render custom minlength message when provided', () => {
      const control = new FormControl('');
      control.setErrors({ minlength: { requiredLength: 3 } });
      control.markAsTouched();
      setInput('control', control);
      setInput('minlength', 'Custom minlength message');
      setInput('label', 'Field');
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Custom minlength message');
    });

    it('should render custom pattern message when provided', () => {
      const control = new FormControl('');
      control.setErrors({ pattern: true });
      control.markAsTouched();
      setInput('control', control);
      setInput('pattern', 'Custom pattern message');
      setInput('label', 'Field');
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Custom pattern message');
    });

    it('should render custom email message when provided', () => {
      const control = new FormControl('');
      control.setErrors({ email: true });
      control.markAsTouched();
      setInput('control', control);
      setInput('email', 'Custom email message');
      setInput('label', 'Field');
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Custom email message');
    });

    it('should render custom min message when provided', () => {
      const control = new FormControl('');
      control.setErrors({ min: { min: 18 } });
      control.markAsTouched();
      setInput('control', control);
      setInput('min', 'Custom min message');
      setInput('label', 'Field');
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Custom min message');
    });

    it('should render custom max message when provided', () => {
      const control = new FormControl('');
      control.setErrors({ max: { max: 100 } });
      control.markAsTouched();
      setInput('control', control);
      setInput('max', 'Custom max message');
      setInput('label', 'Field');
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Custom max message');
    });

    it('should render custom unique message when provided', () => {
      const control = new FormControl('');
      control.setErrors({ unique: true });
      control.markAsTouched();
      setInput('control', control);
      setInput('unique', 'Custom unique message');
      setInput('label', 'Field');
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Custom unique message');
    });
  });

  describe('omitErrors', () => {
    it('should not render required error when it is in omitErrors list', () => {
      const control = new FormControl('');
      control.setErrors({ required: true });
      control.markAsTouched();
      setInput('control', control);
      setInput('omitErrors', ['required']);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.text-red-500')).toBeNull();
    });

    it('should not render maxlength error when it is in omitErrors list', () => {
      const control = new FormControl('');
      control.setErrors({ maxlength: { requiredLength: 10 } });
      control.markAsTouched();
      setInput('control', control);
      setInput('omitErrors', ['maxlength']);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.text-red-500')).toBeNull();
    });
  });

  describe('custom errors', () => {
    it('should render custom error when customErrorType matches', () => {
      const control = new FormControl('');
      control.setErrors({ custom: true });
      control.markAsTouched();
      setInput('control', control);
      setInput('customErrorType', 'custom');
      setInput('customErrorMessage', 'Custom error message');
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Custom error message');
    });

    it('should render custom errors from array', () => {
      const control = new FormControl('');
      control.setErrors({ customError: true });
      control.markAsTouched();
      setInput('control', control);
      setInput('customErrors', [{ type: 'customError', message: 'Array custom error' }]);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Array custom error');
    });

    it('should not render custom error when type does not match', () => {
      const control = new FormControl('');
      control.setErrors({ otherError: true });
      control.markAsTouched();
      setInput('control', control);
      setInput('customErrorType', 'custom');
      setInput('customErrorMessage', 'Custom error message');
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).not.toContain('Custom error message');
    });
  });

  describe('errorsDefault', () => {
    it('should contain all standard error types', () => {
      expect(component.errorsDefault).toContain('required');
      expect(component.errorsDefault).toContain('maxlength');
      expect(component.errorsDefault).toContain('minlength');
      expect(component.errorsDefault).toContain('pattern');
      expect(component.errorsDefault).toContain('email');
      expect(component.errorsDefault).toContain('min');
      expect(component.errorsDefault).toContain('max');
      expect(component.errorsDefault).toContain('unique');
    });
  });
});
