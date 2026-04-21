import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { StrategyHubPage } from './strategy-hub.page';

const routes: Routes = [
  {
    path: '',
    component: StrategyHubPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class StrategyHubPageRoutingModule {}
