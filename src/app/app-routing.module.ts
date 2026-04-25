import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { loginRedirectGuard } from './core/guards/auth.guard';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./tabs/tabs.module').then(m => m.TabsPageModule)
  },
  {
    path: 'dashboard',
    redirectTo: 'tabs/dashboard-v2',
    pathMatch: 'full'
  },
  {
    path: 'login',
    canActivate: [loginRedirectGuard],
    loadChildren: () => import('./pages/login/login.module').then( m => m.LoginPageModule)
  }
  
  
  
];
@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
