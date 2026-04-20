import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MarketAlertsPageRoutingModule } from './market-alerts-routing.module';

import { MarketAlertsPage } from './market-alerts.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MarketAlertsPageRoutingModule
  ],
  declarations: [MarketAlertsPage]
})
export class MarketAlertsPageModule {}
