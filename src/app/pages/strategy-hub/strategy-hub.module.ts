import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { SharedModule } from '../../shared/shared.module';

import { StrategyHubPageRoutingModule } from './strategy-hub-routing.module';
import { StrategyHubPage } from './strategy-hub.page';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, SharedModule, StrategyHubPageRoutingModule],
  declarations: [StrategyHubPage],
})
export class StrategyHubPageModule {}
