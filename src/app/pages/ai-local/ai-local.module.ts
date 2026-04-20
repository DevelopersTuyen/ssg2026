import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AiLocalPageRoutingModule } from './ai-local-routing.module';

import { AiLocalPage } from './ai-local.page';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, AiLocalPageRoutingModule],
  declarations: [AiLocalPage],
})
export class AiLocalPageModule {}
