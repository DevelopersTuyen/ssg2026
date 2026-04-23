import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MarketWatchPageRoutingModule } from './market-watch-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { MarketWatchPage } from './market-watch.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    MarketWatchPageRoutingModule
  ],
  declarations: [MarketWatchPage]
})
export class MarketWatchPageModule {}
