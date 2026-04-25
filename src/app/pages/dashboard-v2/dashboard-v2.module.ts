import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { SharedModule } from 'src/app/shared/shared.module';

import { DashboardV2PageRoutingModule } from './dashboard-v2-routing.module';
import { DashboardV2Page } from './dashboard-v2.page';

@NgModule({
  imports: [CommonModule, IonicModule, SharedModule, DashboardV2PageRoutingModule],
  declarations: [DashboardV2Page],
})
export class DashboardV2PageModule {}
