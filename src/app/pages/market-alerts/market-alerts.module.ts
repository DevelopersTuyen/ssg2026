import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MarketAlertsPageRoutingModule } from './market-alerts-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { MarketAlertsPage } from './market-alerts.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    MarketAlertsPageRoutingModule
  ],
  declarations: [MarketAlertsPage]
})
export class MarketAlertsPageModule {}
