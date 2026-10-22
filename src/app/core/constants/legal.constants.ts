/** Versión vigente de los documentos legales (LEGAL.* en i18n). */
export const LEGAL_DOC_VERSION = '2026-10';

export type LegalDocType = 'terms' | 'privacy';

export const LEGAL_DOCS: readonly LegalDocType[] = ['terms', 'privacy'];

export type ConsentMethod = 'first-login' | 'admin-assisted' | 'register';
