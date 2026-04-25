import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';
import { authGuard, permissionGuard } from '../core/guards/auth.guard';

const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard-v2',
        canActivate: [permissionGuard],
        data: { permission: 'dashboard.view' },
        loadChildren: () => import('../pages/dashboard-v2/dashboard-v2.module').then(m => m.DashboardV2PageModule)
      },
      {
        path: 'dashboard',
        redirectTo: 'dashboard-v2',
        pathMatch: 'full'
      },
      {
        path: 'market-watch',
        canActivate: [permissionGuard],
        data: { permission: 'market-watch.view' },
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
        canActivate: [permissionGuard],
        data: { permission: 'market-alerts.view' },
        loadChildren: () => import('../pages/market-alerts/market-alerts.module').then(m => m.MarketAlertsPageModule)
      },
      // {
      //   path: 'stocks-az',
      //   loadChildren: () => import('../pages/stocks-az/stocks-az.module').then(m => m.StocksAzPageModule)
      // },
      {
        path: 'market-settings',
        canActivate: [permissionGuard],
        data: { permission: 'market-settings.view' },
        loadChildren: () => import('../pages/market-settings/market-settings.module').then(m => m.MarketSettingsPageModule)
      },
      {
        path: 'ai-agent',
        canActivate: [permissionGuard],
        data: { permission: 'ai-agent.view' },
        loadChildren: () => import('../pages/ai-agent/ai-agent.module').then(m => m.AiAgentPageModule)
      },
      {
        path: 'ai-local',
        canActivate: [permissionGuard],
        data: { permission: 'ai-local.view' },
        loadChildren: () => import('../pages/ai-local/ai-local.module').then(m => m.AiLocalPageModule)
      },
      {
        path: 'strategy-hub',
        canActivate: [permissionGuard],
        data: { permission: 'strategy-hub.view' },
        loadChildren: () => import('../pages/strategy-hub/strategy-hub.module').then(m => m.StrategyHubPageModule)
      },
      {
        path: 'role-permissions',
        canActivate: [permissionGuard],
        data: { permission: 'role-permissions.view' },
        loadChildren: () => import('../pages/role-permissions/role-permissions.module').then( m => m.RolePermissionsPageModule)
      },
      {
        path: 'user-guide',
        loadChildren: () => import('../pages/user-guide/user-guide.module').then(m => m.UserGuidePageModule)
      },
      {
        path: '',
        redirectTo: '/tabs/dashboard-v2',
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
