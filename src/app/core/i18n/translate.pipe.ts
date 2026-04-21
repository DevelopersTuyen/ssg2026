import { ChangeDetectorRef, Pipe, PipeTransform } from '@angular/core';

import { AppI18nService } from './app-i18n.service';

@Pipe({
  name: 'translate',
  standalone: false,
  pure: false,
})
export class TranslatePipe implements PipeTransform {
  private lastLanguage = '';

  constructor(
    private i18n: AppI18nService,
    private cdr: ChangeDetectorRef
  ) {}

  transform(key: string): string {
    if (this.lastLanguage !== this.i18n.currentLanguage) {
      this.lastLanguage = this.i18n.currentLanguage;
      this.cdr.markForCheck();
    }
    return this.i18n.translate(key);
  }
}
