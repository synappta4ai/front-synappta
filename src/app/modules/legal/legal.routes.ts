import { Routes } from '@angular/router';

export const legalRoutes: Routes = [
  {
    path: 'terminos',
    title: 'LEGAL.TERMS.TITLE',
    loadComponent: () => import('./ui/terms/terms.component').then((m) => m.TermsComponent),
  },
  {
    path: 'privacidad',
    title: 'LEGAL.PRIVACY.TITLE',
    loadComponent: () => import('./ui/privacy/privacy.component').then((m) => m.PrivacyComponent),
  },
  {
    path: 'cookies',
    title: 'LEGAL.COOKIES.TITLE',
    loadComponent: () => import('./ui/cookies/cookies.component').then((m) => m.CookiesComponent),
  },
  {
    path: 'reembolsos',
    title: 'LEGAL.REFUNDS.TITLE',
    loadComponent: () => import('./ui/refunds/refunds.component').then((m) => m.RefundsComponent),
  },
];
