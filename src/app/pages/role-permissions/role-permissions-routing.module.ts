import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { RolePermissionsPage } from './role-permissions.page';

const routes: Routes = [
  {
    path: '',
    component: RolePermissionsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class RolePermissionsPageRoutingModule {}
