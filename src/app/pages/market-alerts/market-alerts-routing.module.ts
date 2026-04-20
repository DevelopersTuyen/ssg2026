import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MarketAlertsPage } from './market-alerts.page';

const routes: Routes = [
  {
    path: '',
    component: MarketAlertsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MarketAlertsPageRoutingModule {}
