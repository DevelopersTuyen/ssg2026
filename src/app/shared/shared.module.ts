import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TranslatePipe } from '../core/i18n/translate.pipe';
import { PageLoadIndicatorComponent } from './components/page-load-indicator/page-load-indicator.component';

@NgModule({
  declarations: [TranslatePipe, PageLoadIndicatorComponent],
  imports: [CommonModule],
  exports: [TranslatePipe, PageLoadIndicatorComponent],
})
export class SharedModule {}
