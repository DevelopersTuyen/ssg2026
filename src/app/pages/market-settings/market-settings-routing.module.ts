import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MarketSettingsPage } from './market-settings.page';

const routes: Routes = [
  {
    path: '',
    component: MarketSettingsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MarketSettingsPageRoutingModule {}
