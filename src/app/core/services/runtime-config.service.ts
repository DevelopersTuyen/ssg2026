import { Injectable } from '@angular/core';

import { environment } from 'src/environments/environment';

interface AppRuntimeConfig {
  apiBaseUrl?: string;
}

@Injectable({
  providedIn: 'root',
})
export class RuntimeConfigService {
  private config: AppRuntimeConfig = {};

  async load(): Promise<void> {
    const globalConfig = (globalThis as { __APP_CONFIG__?: AppRuntimeConfig }).__APP_CONFIG__;
    if (globalConfig) {
      this.config = globalConfig;
      return;
    }

    try {
      const response = await fetch('assets/app-config.json', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as AppRuntimeConfig;
      this.config = payload ?? {};
    } catch {
      // Use the build-time environment as a safe fallback.
    }
  }

  get apiBaseUrl(): string {
    return this.normalizeBaseUrl(this.config.apiBaseUrl || environment.apiBaseUrl);
  }

  private normalizeBaseUrl(value: string): string {
    return (value || '').trim().replace(/\/+$/, '');
  }
}
