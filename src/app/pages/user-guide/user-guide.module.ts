import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

import { UserGuidePageRoutingModule } from './user-guide-routing.module';
import { SharedModule } from '../../shared/shared.module';
import { UserGuidePage } from './user-guide.page';

@NgModule({
  imports: [CommonModule, IonicModule, SharedModule, UserGuidePageRoutingModule],
  declarations: [UserGuidePage],
})
export class UserGuidePageModule {}
