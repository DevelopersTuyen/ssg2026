import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AiAgentPageRoutingModule } from './ai-agent-routing.module';

import { AiAgentPage } from './ai-agent.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AiAgentPageRoutingModule
  ],
  declarations: [AiAgentPage]
})
export class AiAgentPageModule {}
