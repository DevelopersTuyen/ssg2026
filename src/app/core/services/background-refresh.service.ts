import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Subscription, interval } from 'rxjs';
import { MarketApiService, MarketSyncStatusData } from './market-api.service';
import { AuthService } from './auth.service';

export type BackgroundRefreshDomain =
  | 'quotes'
  | 'intraday'
  | 'indexDaily'
  | 'financial'
  | 'seedSymbols'
  | 'news';

@Injectable({
  providedIn: 'root',
})
export class BackgroundRefreshService implements OnDestroy {
  private pollSub?: Subscription;
  private started = false;
  private lastFingerprint = '';
  private checking = false;
  private readonly changesSubject = new Subject<BackgroundRefreshDomain[]>();

  readonly changes$ = this.changesSubject.asObservable();

  constructor(private api: MarketApiService, private auth: AuthService) {}

  init(): void {
    if (this.started) return;
    this.started = true;
    this.pollSub = interval(30000).subscribe(() => this.checkForChanges());
    if (this.auth.isAuthenticated()) {
      this.api.prewarmCoreCaches('HSX');
    }
    this.checkForChanges();
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  private checkForChanges(): void {
    if (!this.auth.isAuthenticated()) {
      this.lastFingerprint = '';
      return;
    }

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }

    if (this.checking) {
      return;
    }

    this.checking = true;

    this.api.getSyncStatus().subscribe((response) => {
      this.checking = false;
      const data = response.data;
      if (!data) return;

      const currentFingerprint = this.buildFingerprint(data);
      if (!currentFingerprint) return;

      if (!this.lastFingerprint) {
        this.lastFingerprint = currentFingerprint;
        return;
      }

      if (currentFingerprint === this.lastFingerprint) {
        return;
      }

      const changedDomains = this.detectChangedDomains(this.lastFingerprint, currentFingerprint);
      this.lastFingerprint = currentFingerprint;
      if (changedDomains.length) {
        this.api.invalidateDomainCaches(changedDomains);
        if (this.auth.isAuthenticated()) {
          this.api.prewarmCoreCaches('HSX');
        }
        this.changesSubject.next(changedDomains);
      }
    }, () => {
      this.checking = false;
    });
  }

  private buildFingerprint(data: MarketSyncStatusData): string {
    const parts = [
      `quotes:${data.quotes?.finishedAt || ''}`,
      `intraday:${data.intraday?.finishedAt || ''}`,
      `indexDaily:${data.indexDaily?.finishedAt || ''}`,
      `financial:${data.financial?.finishedAt || ''}`,
      `seedSymbols:${data.seedSymbols?.finishedAt || ''}`,
      `news:${data.news?.finishedAt || ''}`,
    ];
    return parts.join('|');
  }

  private detectChangedDomains(
    previousFingerprint: string,
    nextFingerprint: string
  ): BackgroundRefreshDomain[] {
    const previousMap = this.parseFingerprint(previousFingerprint);
    const nextMap = this.parseFingerprint(nextFingerprint);
    const domains: BackgroundRefreshDomain[] = [];

    (Object.keys(nextMap) as BackgroundRefreshDomain[]).forEach((domain) => {
      if (previousMap[domain] !== nextMap[domain]) {
        domains.push(domain);
      }
    });

    return domains;
  }

  private parseFingerprint(fingerprint: string): Record<BackgroundRefreshDomain, string> {
    const result = {
      quotes: '',
      intraday: '',
      indexDaily: '',
      financial: '',
      seedSymbols: '',
      news: '',
    } as Record<BackgroundRefreshDomain, string>;

    fingerprint.split('|').forEach((part) => {
      const separatorIndex = part.indexOf(':');
      const key = separatorIndex >= 0 ? part.slice(0, separatorIndex) : part;
      const value = separatorIndex >= 0 ? part.slice(separatorIndex + 1) : '';
      if (key in result) {
        result[key as BackgroundRefreshDomain] = value || '';
      }
    });

    return result;
  }
}
