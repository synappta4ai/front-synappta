import { ChangeDetectionStrategy, Component } from '@angular/core';

import { LegalDocComponent, LegalSection } from '../legal-doc/legal-doc.component';

const SECTIONS: readonly LegalSection[] = [
  { titleKey: 'LEGAL.COOKIES.S1T', bodyKey: 'LEGAL.COOKIES.S1B' },
  { titleKey: 'LEGAL.COOKIES.S2T', bodyKey: 'LEGAL.COOKIES.S2B' },
  { titleKey: 'LEGAL.COOKIES.S3T', bodyKey: 'LEGAL.COOKIES.S3B' },
  { titleKey: 'LEGAL.COOKIES.S4T', bodyKey: 'LEGAL.COOKIES.S4B' },
  { titleKey: 'LEGAL.COOKIES.S5T', bodyKey: 'LEGAL.COOKIES.S5B' },
  { titleKey: 'LEGAL.COOKIES.S6T', bodyKey: 'LEGAL.COOKIES.S6B' },
];

@Component({
  selector: 'app-cookies',
  imports: [LegalDocComponent],
  template: `<legal-doc
    titleKey="LEGAL.COOKIES.TITLE"
    updatedKey="LEGAL.UPDATED"
    [sections]="sections"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CookiesComponent {
  protected readonly sections = SECTIONS;
}
