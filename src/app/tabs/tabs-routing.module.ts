import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';
import { authGuard } from '../core/guards/auth.guard';

const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    canActivate: [authGuard],
    children: [
      
      {
        path: 'dashboard',
        loadChildren: () => import('../pages/dashboard/dashboard.module').then(m => m.DashboardPageModule)
      },
      {
        path: 'market-watch',
        loadChildren: () => import('../pages/market-watch/market-watch.module').then(m => m.MarketWatchPageModule)
      },
      // {
      //   path: 'market-analysis',
      //   loadChildren: () => import('../pages/market-analysis/market-analysis.module').then(m => m.MarketAnalysisPageModule)
      // },
      // {
      //   path: 'watchlist',
      //   loadChildren: () => import('../pages/watchlist/watchlist.module').then(m => m.WatchlistPageModule)
      // },
      {
        path: 'market-alerts',
        loadChildren: () => import('../pages/market-alerts/market-alerts.module').then(m => m.MarketAlertsPageModule)
      },
      // {
      //   path: 'stocks-az',
      //   loadChildren: () => import('../pages/stocks-az/stocks-az.module').then(m => m.StocksAzPageModule)
      // },
      {
        path: 'market-settings',
        loadChildren: () => import('../pages/market-settings/market-settings.module').then(m => m.MarketSettingsPageModule)
      },
      {
        path: 'ai-agent',
        loadChildren: () => import('../pages/ai-agent/ai-agent.module').then(m => m.AiAgentPageModule)
      },
      {
        path: 'role-permissions',
        loadChildren: () => import('../pages/role-permissions/role-permissions.module').then( m => m.RolePermissionsPageModule)
      },
      {
        path: '',
        redirectTo: '/tabs/dashboard',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
})
export class TabsPageRoutingModule { }
