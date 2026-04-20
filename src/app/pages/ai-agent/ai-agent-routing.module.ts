import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AiAgentPage } from './ai-agent.page';

const routes: Routes = [
  {
    path: '',
    component: AiAgentPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AiAgentPageRoutingModule {}
