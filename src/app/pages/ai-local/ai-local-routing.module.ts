import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AiLocalPage } from './ai-local.page';

const routes: Routes = [
  {
    path: '',
    component: AiLocalPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AiLocalPageRoutingModule {}
