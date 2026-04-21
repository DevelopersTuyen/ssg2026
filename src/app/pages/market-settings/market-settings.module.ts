import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MarketSettingsPageRoutingModule } from './market-settings-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { MarketSettingsPage } from './market-settings.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    MarketSettingsPageRoutingModule
  ],
  declarations: [MarketSettingsPage]
})
export class MarketSettingsPageModule {}
