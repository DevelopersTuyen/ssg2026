import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { RolePermissionsPageRoutingModule } from './role-permissions-routing.module';

import { RolePermissionsPage } from './role-permissions.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RolePermissionsPageRoutingModule
  ],
  declarations: [RolePermissionsPage]
})
export class RolePermissionsPageModule {}
