import { ChangeDetectionStrategy, Component } from '@angular/core';

import { LegalDocComponent, LegalSection } from '../legal-doc/legal-doc.component';

const SECTIONS: readonly LegalSection[] = [
  { titleKey: 'LEGAL.PRIVACY.S1T', bodyKey: 'LEGAL.PRIVACY.S1B' },
  { titleKey: 'LEGAL.PRIVACY.S2T', bodyKey: 'LEGAL.PRIVACY.S2B' },
  { titleKey: 'LEGAL.PRIVACY.S3T', bodyKey: 'LEGAL.PRIVACY.S3B' },
  { titleKey: 'LEGAL.PRIVACY.S4T', bodyKey: 'LEGAL.PRIVACY.S4B' },
  { titleKey: 'LEGAL.PRIVACY.S5T', bodyKey: 'LEGAL.PRIVACY.S5B' },
  { titleKey: 'LEGAL.PRIVACY.S6T', bodyKey: 'LEGAL.PRIVACY.S6B' },
  { titleKey: 'LEGAL.PRIVACY.S7T', bodyKey: 'LEGAL.PRIVACY.S7B' },
  { titleKey: 'LEGAL.PRIVACY.S8T', bodyKey: 'LEGAL.PRIVACY.S8B' },
  { titleKey: 'LEGAL.PRIVACY.S9T', bodyKey: 'LEGAL.PRIVACY.S9B' },
];

@Component({
  selector: 'app-privacy',
  imports: [LegalDocComponent],
  template: `<legal-doc
    titleKey="LEGAL.PRIVACY.TITLE"
    updatedKey="LEGAL.UPDATED"
    [sections]="sections"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyComponent {
  protected readonly sections = SECTIONS;
}
