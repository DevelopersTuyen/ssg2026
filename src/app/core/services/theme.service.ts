import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, OnDestroy } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'auto' | string | null | undefined;

@Injectable({
  providedIn: 'root',
})
export class ThemeService implements OnDestroy {
  private mediaQuery: MediaQueryList | null = null;
  private mediaListener?: (event: MediaQueryListEvent) => void;
  private currentPreference: 'light' | 'dark' | 'auto' = 'light';

  constructor(@Inject(DOCUMENT) private document: Document) {
    if (typeof window !== 'undefined' && 'matchMedia' in window) {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.mediaListener = () => {
        if (this.currentPreference === 'auto') {
          this.applyResolvedTheme();
        }
      };

      if ('addEventListener' in this.mediaQuery) {
        this.mediaQuery.addEventListener('change', this.mediaListener);
      } else {
        (this.mediaQuery as MediaQueryList & {
          addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
        }).addListener?.(this.mediaListener);
      }
    }
  }

  ngOnDestroy(): void {
    if (!this.mediaQuery || !this.mediaListener) {
      return;
    }

    if ('removeEventListener' in this.mediaQuery) {
      this.mediaQuery.removeEventListener('change', this.mediaListener);
    } else {
      (this.mediaQuery as MediaQueryList & {
        removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
      }).removeListener?.(this.mediaListener);
    }
  }

  applyTheme(preference: ThemePreference): void {
    this.currentPreference = this.normalizePreference(preference);
    this.applyResolvedTheme();
  }

  getResolvedMode(preference: ThemePreference = this.currentPreference): 'light' | 'dark' {
    const normalized = this.normalizePreference(preference);
    if (normalized === 'dark') {
      return 'dark';
    }
    if (normalized === 'auto' && this.mediaQuery?.matches) {
      return 'dark';
    }
    return 'light';
  }

  private normalizePreference(preference: ThemePreference): 'light' | 'dark' | 'auto' {
    if (preference === 'dark' || preference === 'auto') {
      return preference;
    }
    return 'light';
  }

  private applyResolvedTheme(): void {
    const resolvedDark =
      this.currentPreference === 'dark' ||
      (this.currentPreference === 'auto' && !!this.mediaQuery?.matches);

    const html = this.document.documentElement;
    const body = this.document.body;

    html.classList.toggle('ion-palette-dark', resolvedDark);
    body.classList.toggle('ion-palette-dark', resolvedDark);

    html.setAttribute('data-theme-preference', this.currentPreference);
    html.setAttribute('data-theme-mode', resolvedDark ? 'dark' : 'light');
    body.setAttribute('data-theme-mode', resolvedDark ? 'dark' : 'light');
    html.style.colorScheme = resolvedDark ? 'dark' : 'light';
    body.style.colorScheme = resolvedDark ? 'dark' : 'light';
  }
}
