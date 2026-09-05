import { Routes } from '@angular/router';

import { AuthComponent } from './ui/auth/auth.component';

export const authRoutes: Routes = [{ path: 'login', title: 'Login', component: AuthComponent }];
