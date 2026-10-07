export const CONTACT_EMAIL = 'ledzerrodriguez@gmail.com';

export interface SocialLink {
  label: string;
  href: string;
}

/** Enlaces del footer. Reemplazar los '#' por las URLs reales. */
export const CONTACT_SOCIALS: readonly SocialLink[] = [
  { label: 'Instagram', href: '#' },
  { label: 'Vimeo', href: '#' },
  { label: 'YouTube', href: '#' },
];
