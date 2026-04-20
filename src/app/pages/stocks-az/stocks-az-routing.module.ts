import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { StocksAzPage } from './stocks-az.page';

const routes: Routes = [
  {
    path: '',
    component: StocksAzPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class StocksAzPageRoutingModule {}
