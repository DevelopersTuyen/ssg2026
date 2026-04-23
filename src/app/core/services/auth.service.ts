import { Injectable } from '@angular/core';
import { Observable, map, of, tap } from 'rxjs';

import {
  AuthSession,
  AuthUserProfile,
  MarketApiService,
  MarketSettingsData,
} from './market-api.service';
import { AppI18nService } from '../i18n/app-i18n.service';
import { ThemeService } from './theme.service';

const AUTH_STORAGE_KEY = 'market_watch_auth_session';
const SETTINGS_STORAGE_KEY = 'market_watch_settings_cache';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private session: AuthSession | null = this.readStoredSession();
  private settings: MarketSettingsData | null = this.readStoredSettings();

  constructor(
    private api: MarketApiService,
    private i18n: AppI18nService,
    private theme: ThemeService
  ) {
    if (this.settings?.language) {
      this.i18n.setLanguage(this.settings.language);
    }
    this.theme.applyTheme(this.settings?.theme || 'light');
  }

  get token(): string | null {
    return this.session?.access_token || null;
  }

  get profile(): AuthUserProfile | null {
    return this.session?.profile || null;
  }

  get preferences(): MarketSettingsData | null {
    return this.settings;
  }

  get preferredPage(): string {
    const raw =
      this.settings?.startupPage ||
      this.settings?.defaultLandingPage ||
      'dashboard';

    const allowedPages = new Set([
      'dashboard',
      'market-watch',
      'market-alerts',
      'ai-agent',
      'strategy-hub',
      'market-settings',
      'role-permissions',
    ]);

    return allowedPages.has(raw) ? raw : 'dashboard';
  }

  isAuthenticated(): boolean {
    if (!this.session?.access_token || !this.session?.expires_at) {
      return false;
    }
    return new Date(this.session.expires_at).getTime() > Date.now();
  }

  login(
    companyCode: string,
    username: string,
    password: string,
    persist = true
  ): Observable<AuthSession | null> {
    return this.api
      .login({
        company_code: companyCode.trim().toUpperCase(),
        username: username.trim().toLowerCase(),
        password,
      })
      .pipe(
        map((res) => res.data || null),
        tap((session) => {
          if (session) {
            this.setSession(session, persist);
          }
        })
      );
  }

  refreshProfile(): Observable<AuthUserProfile | null> {
    if (!this.isAuthenticated()) {
      this.clearSession();
      return of(null);
    }

    return this.api.getCurrentUser().pipe(
      map((res) => res.data || null),
      tap((profile) => {
        if (!profile || !this.session) {
          this.clearSession();
          return;
        }

        this.setSession({
          ...this.session,
          profile,
        });
      })
    );
  }

  refreshSettings(): Observable<MarketSettingsData | null> {
    if (!this.isAuthenticated()) {
      this.clearSession();
      return of(null);
    }

    return this.api.getMySettings().pipe(
      map((res) => res.data || null),
      tap((settings) => {
        if (settings) {
          this.cacheSettings(settings);
        }
      })
    );
  }

  cacheSettings(settings: MarketSettingsData | null): void {
    this.settings = settings;
    this.i18n.setLanguage(settings?.language);
    this.theme.applyTheme(settings?.theme || 'light');

    if (!settings) {
      localStorage.removeItem(SETTINGS_STORAGE_KEY);
      sessionStorage.removeItem(SETTINGS_STORAGE_KEY);
      return;
    }

    const serialized = JSON.stringify(settings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, serialized);
    sessionStorage.setItem(SETTINGS_STORAGE_KEY, serialized);
  }

  resolvePreferredUrl(): string {
    return `/tabs/${this.preferredPage}`;
  }

  logout(): void {
    this.clearSession();
  }

  private setSession(session: AuthSession, persist = true): void {
    this.session = session;
    const storage = persist ? localStorage : sessionStorage;
    const otherStorage = persist ? sessionStorage : localStorage;
    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    otherStorage.removeItem(AUTH_STORAGE_KEY);
  }

  private clearSession(): void {
    this.session = null;
    this.settings = null;
    this.theme.applyTheme('light');
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    sessionStorage.removeItem(SETTINGS_STORAGE_KEY);
  }

  private readStoredSession(): AuthSession | null {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as AuthSession;
      if (!parsed?.access_token || !parsed?.expires_at) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private readStoredSettings(): MarketSettingsData | null {
    const raw =
      localStorage.getItem(SETTINGS_STORAGE_KEY) ||
      sessionStorage.getItem(SETTINGS_STORAGE_KEY);

    if (!raw) return null;

    try {
      return JSON.parse(raw) as MarketSettingsData;
    } catch {
      return null;
    }
  }
}
