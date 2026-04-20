import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MarketWatchPageRoutingModule } from './market-watch-routing.module';

import { MarketWatchPage } from './market-watch.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MarketWatchPageRoutingModule
  ],
  declarations: [MarketWatchPage]
})
export class MarketWatchPageModule {}
