import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  ExchangeTab,
  MarketAlertItem,
  MarketAlertNewsItem,
  MarketAlertsOverviewResponse,
  MarketAlertSummaryCard,
  MarketApiService,
} from 'src/app/core/services/market-api.service';

type AlertTab = 'notifications' | 'settings';
type AlertScope = 'all' | 'market' | 'watchlist' | 'news';

interface AlertTabItem {
  key: AlertTab;
  label: string;
}

interface AlertScopeItem {
  key: AlertScope;
  label: string;
  count?: number;
}

@Component({
  selector: 'app-market-alerts',
  templateUrl: './market-alerts.page.html',
  styleUrls: ['./market-alerts.page.scss'],
  standalone: false,
})
export class MarketAlertsPage implements OnInit, OnDestroy {
  selectedTab: AlertTab = 'notifications';
  selectedScope: AlertScope = 'all';
  exchange: ExchangeTab = 'HSX';
  keyword = '';
  minConfidence = 60;
  watchlistOnly = false;
  showNewsRail = true;
  loading = false;
  error = '';
  autoRefresh = false;

  data: MarketAlertsOverviewResponse | null = null;

  readonly tabs: AlertTabItem[] = [
    { key: 'notifications', label: 'Canh bao AI' },
    { key: 'settings', label: 'Bo loc hien thi' },
  ];

  readonly exchanges: ExchangeTab[] = ['HSX', 'HNX', 'UPCOM'];

  private refreshHandle: ReturnType<typeof window.setInterval> | null = null;

  constructor(private api: MarketApiService) {}

  ngOnInit(): void {
    this.loadOverview();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }

  get summaryCards(): MarketAlertSummaryCard[] {
    return this.data?.summary_cards || [];
  }

  get newsItems(): MarketAlertNewsItem[] {
    if (!this.showNewsRail) {
      return [];
    }
    return this.data?.news_items || [];
  }

  get scopeTabs(): AlertScopeItem[] {
    const alerts = this.data?.alerts || [];
    return [
      { key: 'all', label: 'Tat ca', count: alerts.length },
      { key: 'market', label: 'Thi truong', count: alerts.filter((item) => item.scope === 'market').length },
      { key: 'watchlist', label: 'Watchlist', count: alerts.filter((item) => item.watchlist).length },
      { key: 'news', label: 'Tin CafeF', count: alerts.filter((item) => item.scope === 'news').length },
    ];
  }

  get filteredAlerts(): MarketAlertItem[] {
    const keyword = this.keyword.trim().toLowerCase();
    return (this.data?.alerts || []).filter((item) => {
      if (this.selectedScope !== 'all') {
        if (this.selectedScope === 'watchlist' && !item.watchlist) {
          return false;
        }
        if (this.selectedScope !== 'watchlist' && item.scope !== this.selectedScope) {
          return false;
        }
      }

      if (this.watchlistOnly && !item.watchlist) {
        return false;
      }

      if ((item.confidence || 0) < this.minConfidence) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const haystack = [
        item.symbol,
        item.title,
        item.message,
        item.prediction,
        item.source,
        ...(item.tags || []),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }

  get featuredAlerts(): MarketAlertItem[] {
    return this.filteredAlerts.slice(0, 3);
  }

  selectTab(tab: AlertTab): void {
    this.selectedTab = tab;
  }

  selectScope(scope: AlertScope): void {
    this.selectedScope = scope;
  }

  setExchange(exchange: ExchangeTab): void {
    if (this.exchange === exchange) {
      return;
    }
    this.exchange = exchange;
    this.loadOverview();
  }

  loadOverview(force = false): void {
    if (this.loading && !force) {
      return;
    }

    this.loading = true;
    this.error = '';

    this.api.getMarketAlertsOverview(this.exchange).subscribe({
      next: (response) => {
        this.data = response.data;
        if (!response.data) {
          this.error = 'Backend market-alerts chua tra du lieu.';
        }
        this.loading = false;
      },
      error: () => {
        this.error = 'Khong the tai du lieu canh bao.';
        this.loading = false;
      },
    });
  }

  refresh(): void {
    this.loadOverview(true);
  }

  applyAutoRefresh(): void {
    if (this.autoRefresh) {
      this.stopAutoRefresh();
      this.refreshHandle = window.setInterval(() => this.loadOverview(true), 60000);
      return;
    }
    this.stopAutoRefresh();
  }

  clearFilters(): void {
    this.keyword = '';
    this.selectedScope = 'all';
    this.minConfidence = 60;
    this.watchlistOnly = false;
  }

  trackAlert(_: number, item: MarketAlertItem): string {
    return item.id;
  }

  trackNews(_: number, item: MarketAlertNewsItem): string {
    return `${item.url}-${item.published_at}`;
  }

  formatNumber(value: number | null | undefined, digits = 2): string {
    if (value === null || value === undefined) {
      return '--';
    }
    return new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }

  formatCompact(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return '--';
    }
    const absValue = Math.abs(value);
    if (absValue >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(2)}B`;
    }
    if (absValue >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`;
    }
    if (absValue >= 1_000) {
      return `${(value / 1_000).toFixed(1)}K`;
    }
    return this.formatNumber(value, 0);
  }

  formatPercent(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return '--';
    }
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${this.formatNumber(value, 2)}%`;
  }

  formatGeneratedAt(value: string | null | undefined): string {
    if (!value) {
      return '--';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    }).format(date);
  }

  private stopAutoRefresh(): void {
    if (this.refreshHandle) {
      window.clearInterval(this.refreshHandle);
      this.refreshHandle = null;
    }
  }
}
