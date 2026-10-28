import { ChangeDetectionStrategy, Component } from '@angular/core';

import { LegalDocComponent, LegalSection } from '../legal-doc/legal-doc.component';

const SECTIONS: readonly LegalSection[] = [
  { titleKey: 'LEGAL.TERMS.S1T', bodyKey: 'LEGAL.TERMS.S1B' },
  { titleKey: 'LEGAL.TERMS.S2T', bodyKey: 'LEGAL.TERMS.S2B' },
  { titleKey: 'LEGAL.TERMS.S3T', bodyKey: 'LEGAL.TERMS.S3B' },
  { titleKey: 'LEGAL.TERMS.S4T', bodyKey: 'LEGAL.TERMS.S4B' },
  { titleKey: 'LEGAL.TERMS.S5T', bodyKey: 'LEGAL.TERMS.S5B' },
  { titleKey: 'LEGAL.TERMS.S6T', bodyKey: 'LEGAL.TERMS.S6B' },
  { titleKey: 'LEGAL.TERMS.S7T', bodyKey: 'LEGAL.TERMS.S7B' },
  { titleKey: 'LEGAL.TERMS.S8T', bodyKey: 'LEGAL.TERMS.S8B' },
];

@Component({
  selector: 'app-terms',
  imports: [LegalDocComponent],
  template: `<legal-doc
    titleKey="LEGAL.TERMS.TITLE"
    updatedKey="LEGAL.UPDATED"
    [sections]="sections"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsComponent {
  protected readonly sections = SECTIONS;
}
