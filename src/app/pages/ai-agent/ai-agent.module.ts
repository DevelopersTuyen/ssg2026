import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AiAgentPageRoutingModule } from './ai-agent-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { AiAgentPage } from './ai-agent.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    AiAgentPageRoutingModule
  ],
  declarations: [AiAgentPage]
})
export class AiAgentPageModule {}
