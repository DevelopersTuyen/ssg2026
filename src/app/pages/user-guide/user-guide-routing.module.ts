import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UserGuidePage } from './user-guide.page';

const routes: Routes = [
  {
    path: '',
    component: UserGuidePage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UserGuidePageRoutingModule {}
