import { ChangeDetectionStrategy, Component } from '@angular/core';

import { LegalDocComponent, LegalSection } from '../legal-doc/legal-doc.component';

const SECTIONS: readonly LegalSection[] = [
  { titleKey: 'LEGAL.REFUNDS.S1T', bodyKey: 'LEGAL.REFUNDS.S1B' },
  { titleKey: 'LEGAL.REFUNDS.S2T', bodyKey: 'LEGAL.REFUNDS.S2B' },
  { titleKey: 'LEGAL.REFUNDS.S3T', bodyKey: 'LEGAL.REFUNDS.S3B' },
  { titleKey: 'LEGAL.REFUNDS.S4T', bodyKey: 'LEGAL.REFUNDS.S4B' },
  { titleKey: 'LEGAL.REFUNDS.S5T', bodyKey: 'LEGAL.REFUNDS.S5B' },
  { titleKey: 'LEGAL.REFUNDS.S6T', bodyKey: 'LEGAL.REFUNDS.S6B' },
];

@Component({
  selector: 'app-refunds',
  imports: [LegalDocComponent],
  template: `<legal-doc
    titleKey="LEGAL.REFUNDS.TITLE"
    updatedKey="LEGAL.UPDATED"
    [sections]="sections"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RefundsComponent {
  protected readonly sections = SECTIONS;
}
