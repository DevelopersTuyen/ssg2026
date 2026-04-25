import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { DashboardV2Page } from './dashboard-v2.page';

const routes: Routes = [
  {
    path: '',
    component: DashboardV2Page,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DashboardV2PageRoutingModule {}
