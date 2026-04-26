import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TranslatePipe } from '../core/i18n/translate.pipe';
import { PageLoadIndicatorComponent } from './components/page-load-indicator/page-load-indicator.component';
import { SymbolDetailModalComponent } from './components/symbol-detail-modal/symbol-detail-modal.component';

@NgModule({
  declarations: [TranslatePipe, PageLoadIndicatorComponent, SymbolDetailModalComponent],
  imports: [CommonModule],
  exports: [TranslatePipe, PageLoadIndicatorComponent, SymbolDetailModalComponent],
})
export class SharedModule {}
