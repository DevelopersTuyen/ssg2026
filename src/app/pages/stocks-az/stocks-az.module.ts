import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { StocksAzPageRoutingModule } from './stocks-az-routing.module';

import { StocksAzPage } from './stocks-az.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    StocksAzPageRoutingModule
  ],
  declarations: [StocksAzPage]
})
export class StocksAzPageModule {}
