import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, forkJoin, interval, startWith } from 'rxjs';
import {
  AiAgentOverviewResponse,
  AiForecastCard,
  ExchangeTab,
  FinancialOverviewResponse,
  LiveHourlyTradingItem,
  LiveIndexCardItem,
  LiveIndexSeriesItem,
  LiveStockItem,
  MarketAlertItem,
  MarketAlertsOverviewResponse,
  LiveSymbolHourlyItem,
  LiveSymbolQuote,
  MarketApiService,
  NewsItem,
  SymbolSearchItem,
  WatchlistItem,
} from 'src/app/core/services/market-api.service';

declare const ApexCharts: any;

interface IndexCardVm {
  symbol: string;
  exchange: string;
  displayName: string;
  valueText: string;
  changeText: string;
  percentText: string;
  highText: string;
  lowText: string;
  volumeText: string;
  valueTradeText: string;
  updatedText: string;
  up: boolean;
}

interface StockVm {
  rank: number;
  symbol: string;
  name?: string | null;
  exchange: string;
  priceText: string;
  changeText: string;
  percentText: string;
  volumeText: string;
  valueTradeText: string;
  up: boolean;
  raw: LiveStockItem;
}

interface WatchlistVm {
  id: number;
  symbol: string;
  exchange: string;
  note: string;
  priceText: string;
  changeText: string;
  percentText: string;
  up: boolean;
  sparkId: string;
  sparkData: number[];
}

interface ForecastVm {
  title: string;
  summary: string;
  confidence: number;
  direction: 'up' | 'down' | 'neutral';
}

interface AlertVm {
  code: string;
  text: string;
  type: 'success' | 'warning' | 'danger' | 'info';
}

interface CommandMetricVm {
  label: string;
  value: string;
  helper: string;
  tone: 'default' | 'up' | 'down' | 'warning';
}

interface CommandSignalVm {
  label: string;
  value: string;
  helper: string;
  tone: 'default' | 'up' | 'down' | 'warning';
}

interface CommandInsightVm {
  title: string;
  text: string;
  tone: 'default' | 'up' | 'warning';
}

interface SnapshotCardVm {
  label: string;
  value: string;
  helper: string;
  tone: 'default' | 'up' | 'down' | 'warning';
}

type CommandScope = 'ALL' | ExchangeTab;

interface CommandSnapshotVm {
  exchange: ExchangeTab;
  stocks: StockVm[];
  hourlyTrading: LiveHourlyTradingItem[];
  aiOverview: AiAgentOverviewResponse | null;
  alertsOverview: MarketAlertsOverviewResponse | null;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false,
})
export class DashboardPage implements OnInit, AfterViewInit, OnDestroy {
  readonly newsPageSize = 5;

  selectedExchange: ExchangeTab = 'HSX';
  selectedCommandScope: CommandScope = 'ALL';
  selectedMetric: 'volume' | 'tradingValue' = 'volume';
  selectedSymbol = '';
  symbolModalOpen = false;
  financialModalOpen = false;

  indexCards: IndexCardVm[] = [];
  marketRows: IndexCardVm[] = [];
  stocks: StockVm[] = [];
  gainerStocks: StockVm[] = [];
  loserStocks: StockVm[] = [];
  marketUniverse: StockVm[] = [];
  watchlistRows: WatchlistVm[] = [];
  hourlyTrading: LiveHourlyTradingItem[] = [];
  marketIndexSeries: LiveIndexSeriesItem[] = [];
  selectedQuote: LiveSymbolQuote | null = null;
  selectedHourly: LiveSymbolHourlyItem[] = [];
  financialOverview: FinancialOverviewResponse | null = null;
  news: NewsItem[] = [];
  aiOverview: AiAgentOverviewResponse | null = null;
  alertsOverview: MarketAlertsOverviewResponse | null = null;

  aiForecast: ForecastVm[] = [];
  alerts: AlertVm[] = [];

  searchKeyword = '';
  searchResults: SymbolSearchItem[] = [];
  watchlistNote = '';
  currentNewsPage = 1;

  totalWatchlist = 0;
  exchangeStockTotal = 0;
  totalUp = 0;
  totalDown = 0;
  totalNeutral = 0;

  lastUpdated = '--';
  loading = false;
  symbolLoading = false;
  financialLoading = false;

  private exchangeInitialized = false;
  private pollSub?: Subscription;
  private boardSub?: Subscription;
  private commandSub?: Subscription;
  private symbolSub?: Subscription;
  private searchSub?: Subscription;
  private renderTimer: any;

  private marketChart: any;
  private symbolChart: any;
  private watchDonut: any;
  private sparkCharts: any[] = [];
  private commandSnapshots: Partial<Record<ExchangeTab, CommandSnapshotVm>> = {};

  constructor(private api: MarketApiService) {}

  ngOnInit(): void {
    this.bootstrap();
  }

  ngAfterViewInit(): void {
    this.scheduleRender();
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.boardSub?.unsubscribe();
    this.commandSub?.unsubscribe();
    this.symbolSub?.unsubscribe();
    this.searchSub?.unsubscribe();

    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
    }

    this.destroyCharts();
  }

  get watchlistPreview(): WatchlistVm[] {
    return this.watchlistRows.slice(0, 6);
  }

  get moversPreview(): StockVm[] {
    return this.stocks.slice(0, 6);
  }

  get topGainersPreview(): StockVm[] {
    return this.gainerStocks.slice(0, 5);
  }

  get topLosersPreview(): StockVm[] {
    return this.loserStocks.slice(0, 5);
  }

  get selectedExchangeCard(): IndexCardVm | null {
    return (
      this.indexCards.find((item) => item.exchange === this.selectedExchange) ||
      this.indexCards[0] ||
      null
    );
  }

  get breadthSource(): StockVm[] {
    return this.marketUniverse.length ? this.marketUniverse : this.stocks;
  }

  get breadthUpCount(): number {
    return this.breadthSource.filter((item) => Number(item.raw.changePercent || 0) > 0).length;
  }

  get breadthDownCount(): number {
    return this.breadthSource.filter((item) => Number(item.raw.changePercent || 0) < 0).length;
  }

  get breadthNeutralCount(): number {
    return Math.max(0, this.breadthSource.length - this.breadthUpCount - this.breadthDownCount);
  }

  get breadthUpPercent(): number {
    const total = this.breadthSource.length || 1;
    return Number(((this.breadthUpCount / total) * 100).toFixed(1));
  }

  get breadthDownPercent(): number {
    const total = this.breadthSource.length || 1;
    return Number(((this.breadthDownCount / total) * 100).toFixed(1));
  }

  get breadthNeutralPercent(): number {
    return Math.max(0, Number((100 - this.breadthUpPercent - this.breadthDownPercent).toFixed(1)));
  }

  get hottestWatchlist(): WatchlistVm | null {
    return (
      [...this.watchlistRows].sort((a, b) => {
        const aPct = Math.abs(this.parsePercent(a.percentText));
        const bPct = Math.abs(this.parsePercent(b.percentText));
        return bPct - aPct;
      })[0] || null
    );
  }

  get marketSnapshotCards(): SnapshotCardVm[] {
    const selectedIndex = this.selectedExchangeCard;
    const totalTradingValue = this.hourlyTrading.reduce((sum, item) => sum + Number(item.tradingValue || 0), 0);
    const totalVolume = this.hourlyTrading.reduce((sum, item) => sum + Number(item.volume || 0), 0);
    const strongestGainer = this.topGainersPreview[0];
    const strongestLoser = this.topLosersPreview[0];

    return [
      {
        label: 'Chi so trung tam',
        value: selectedIndex?.valueText || '--',
        helper: selectedIndex ? `${selectedIndex.symbol} ${selectedIndex.changeText} / ${selectedIndex.percentText}` : 'Chua co du lieu index',
        tone: selectedIndex ? (selectedIndex.up ? 'up' : 'down') : 'default',
      },
      {
        label: 'Do rong san',
        value: `${this.breadthUpCount}/${this.breadthDownCount}`,
        helper: `${this.breadthNeutralCount} ma trung tinh trong mau quet`,
        tone:
          this.breadthUpCount > this.breadthDownCount
            ? 'up'
            : this.breadthDownCount > this.breadthUpCount
            ? 'down'
            : 'default',
      },
      {
        label: 'Tong gia tri',
        value: totalTradingValue ? this.formatMoney(totalTradingValue) : '--',
        helper: totalVolume ? `${this.formatAxisNumber(totalVolume)} khoi luong cong don` : 'Chua co du lieu dong tien',
        tone: totalTradingValue ? 'up' : 'default',
      },
      {
        label: 'Universe san',
        value: this.exchangeStockTotal ? `${this.exchangeStockTotal} ma` : '--',
        helper: `${this.marketUniverse.length || this.stocks.length} ma dang hien thi trong dashboard`,
        tone: this.exchangeStockTotal ? 'default' : 'warning',
      },
      {
        label: 'Dan dau tang',
        value: strongestGainer?.symbol || '--',
        helper: strongestGainer ? `${strongestGainer.changeText} / ${strongestGainer.percentText}` : 'Chua co ma tang manh',
        tone: strongestGainer ? 'up' : 'default',
      },
      {
        label: 'Dan dau giam',
        value: strongestLoser?.symbol || '--',
        helper: strongestLoser ? `${strongestLoser.changeText} / ${strongestLoser.percentText}` : 'Chua co ma giam manh',
        tone: strongestLoser ? 'down' : 'default',
      },
      {
        label: 'Watchlist noi bat',
        value: this.hottestWatchlist?.symbol || '--',
        helper: this.hottestWatchlist
          ? `${this.hottestWatchlist.changeText} / ${this.hottestWatchlist.percentText}`
          : 'Chua co ma watchlist bien dong',
        tone: this.hottestWatchlist ? (this.hottestWatchlist.up ? 'up' : 'warning') : 'default',
      },
      {
        label: 'Tin dong bo',
        value: `${this.news.length} tin`,
        helper: this.news[0]?.title || 'Chua co tin CafeF moi',
        tone: this.news.length ? 'default' : 'warning',
      },
    ];
  }

  get selectedSymbolDisplay(): string {
    return this.selectedSymbol || '--';
  }

  get commandScopes(): CommandScope[] {
    return ['ALL', 'HSX', 'HNX', 'UPCOM'];
  }

  get commandScopeLabel(): string {
    return this.selectedCommandScope === 'ALL' ? 'Tong quan 3 san' : this.selectedCommandScope;
  }

  get commandScopeSnapshots(): CommandSnapshotVm[] {
    const exchanges: ExchangeTab[] =
      this.selectedCommandScope === 'ALL' ? ['HSX', 'HNX', 'UPCOM'] : [this.selectedCommandScope];

    return exchanges
      .map((exchange) => this.commandSnapshots[exchange])
      .filter((item): item is CommandSnapshotVm => Boolean(item));
  }

  get commandScopeAiOverviews(): AiAgentOverviewResponse[] {
    return this.commandScopeSnapshots
      .map((item) => item.aiOverview)
      .filter((item): item is AiAgentOverviewResponse => Boolean(item));
  }

  get commandScopeAlertsOverviews(): MarketAlertsOverviewResponse[] {
    return this.commandScopeSnapshots
      .map((item) => item.alertsOverview)
      .filter((item): item is MarketAlertsOverviewResponse => Boolean(item));
  }

  get commandStocks(): StockVm[] {
    const merged = new Map<string, StockVm>();

    this.commandScopeSnapshots.forEach((snapshot) => {
      snapshot.stocks.forEach((item) => {
        if (!merged.has(item.symbol)) {
          merged.set(item.symbol, item);
        }
      });
    });

    return Array.from(merged.values());
  }

  get commandHourlyTrading(): LiveHourlyTradingItem[] {
    const items: LiveHourlyTradingItem[] = [];

    this.commandScopeSnapshots.forEach((snapshot) => {
      snapshot.hourlyTrading.forEach((item) => items.push(item));
    });

    return items;
  }

  get commandBreadthUpCount(): number {
    return this.commandStocks.filter((item) => Number(item.raw.changePercent || 0) > 0).length;
  }

  get commandBreadthDownCount(): number {
    return this.commandStocks.filter((item) => Number(item.raw.changePercent || 0) < 0).length;
  }

  get commandBreadthNeutralCount(): number {
    return Math.max(0, this.commandStocks.length - this.commandBreadthUpCount - this.commandBreadthDownCount);
  }

  get totalNewsPages(): number {
    return Math.max(1, Math.ceil(this.news.length / this.newsPageSize));
  }

  get pagedNews(): NewsItem[] {
    const start = (this.currentNewsPage - 1) * this.newsPageSize;
    return this.news.slice(start, start + this.newsPageSize);
  }

  get aiProviderText(): string {
    if (!this.commandScopeAiOverviews.length) return 'Chua ket noi';

    const providers = new Set(
      this.commandScopeAiOverviews.map((item) => {
        const provider = item.provider || 'fallback';
        return item.used_fallback ? `${provider} / fallback` : provider;
      })
    );

    return Array.from(providers).join(' + ');
  }

  get commandMetrics(): CommandMetricVm[] {
    const totalAlerts = this.commandScopeAlertsOverviews.reduce((sum, item) => sum + Number(item.alert_count || 0), 0);
    const watchlistAlerts = this.commandScopeAlertsOverviews.reduce(
      (sum, item) => sum + Number(item.watchlist_alert_count || 0),
      0
    );
    const watchlistCount = this.watchlistRows.length;
    const topNews = this.news[0]?.title || 'Chua co tin noi bat';
    const positive = this.commandBreadthUpCount;
    const negative = this.commandBreadthDownCount;
    const neutral = this.commandBreadthNeutralCount;
    const totalTradingValue = this.commandHourlyTrading.reduce((sum, item) => sum + Number(item.tradingValue || 0), 0);
    const leadMover = [...this.commandStocks].sort(
      (a, b) => Math.abs(Number(b.raw.changePercent || 0)) - Math.abs(Number(a.raw.changePercent || 0))
    )[0];
    const hotWatchlist = this.watchlistRows.filter(
      (item) => Math.abs(this.parsePercent(item.percentText)) >= 2
    ).length;

    return [
      {
        label: 'AI alerts',
        value: `${totalAlerts}`,
        helper: `${watchlistAlerts} lien quan watchlist`,
        tone: totalAlerts >= 8 ? 'warning' : 'default',
      },
      {
        label: 'Watchlist focus',
        value: `${watchlistCount} ma`,
        helper: this.watchlistRows[0]?.symbol ? `Dang uu tien ${this.watchlistRows[0].symbol}` : 'Chua co ma uu tien',
        tone: watchlistCount ? 'up' : 'default',
      },
      {
        label: 'News pulse',
        value: this.news.length ? 'CafeF live' : 'No feed',
        helper: topNews,
        tone: this.news.length ? 'up' : 'default',
      },
      {
        label: 'AI provider',
        value:
          this.selectedCommandScope === 'ALL'
            ? `${this.commandScopeSnapshots.length}/3 exchanges`
            : this.commandScopeAiOverviews[0]?.model || 'fallback',
        helper: this.aiProviderText,
        tone: this.commandScopeAiOverviews.some((item) => item.used_fallback) ? 'warning' : 'up',
      },
      {
        label: 'Market breadth',
        value: `${positive}/${negative}`,
        helper: `${neutral} ma dung gia`,
        tone: positive > negative ? 'up' : negative > positive ? 'down' : 'default',
      },
      {
        label: 'Flow pulse',
        value: totalTradingValue ? this.formatMoney(totalTradingValue) : '--',
        helper: this.commandHourlyTrading.length ? `${this.commandHourlyTrading.length} moc du lieu command center` : 'Chua co du lieu dong tien',
        tone: totalTradingValue ? 'up' : 'default',
      },
      {
        label: 'Lead mover',
        value: leadMover?.symbol || '--',
        helper: leadMover ? `${leadMover.changeText} / ${leadMover.percentText}` : 'Chua co ma noi bat',
        tone: leadMover ? (leadMover.up ? 'up' : 'down') : 'default',
      },
      {
        label: 'Watchlist heat',
        value: `${hotWatchlist}`,
        helper: 'Ma watchlist bien dong tu 2% tro len',
        tone: hotWatchlist >= 3 ? 'warning' : hotWatchlist > 0 ? 'up' : 'default',
      },
    ];
  }

  get commandSignals(): CommandSignalVm[] {
    const positive = this.commandBreadthUpCount;
    const negative = this.commandBreadthDownCount;
    const totalVolume = this.commandHourlyTrading.reduce((sum, item) => sum + Number(item.volume || 0), 0);
    const strongestWatch = [...this.watchlistRows].sort((a, b) => {
      const aPct = Math.abs(this.parsePercent(a.percentText));
      const bPct = Math.abs(this.parsePercent(b.percentText));
      return bPct - aPct;
    })[0];

    return [
      {
        label: 'Do rong san',
        value: `${positive} tang / ${negative} giam`,
        helper:
          this.selectedCommandScope === 'ALL'
            ? `${this.commandStocks.length} ma tong hop trong AI command center`
            : this.exchangeStockTotal
            ? `${this.exchangeStockTotal} ma trong universe san`
            : 'Chua co snapshot thi truong',
        tone: positive > negative ? 'up' : negative > positive ? 'down' : 'default',
      },
      {
        label: 'Dong tien trong phien',
        value: totalVolume ? this.formatAxisNumber(totalVolume) : '--',
        helper: this.hourlyTrading.length ? 'Tong khoi luong cong don theo gio' : 'Chua co du lieu giao dich',
        tone: totalVolume ? 'up' : 'default',
      },
      {
        label: 'Watchlist can chu y',
        value: strongestWatch?.symbol || '--',
        helper: strongestWatch
          ? `${strongestWatch.changeText} / ${strongestWatch.percentText}`
          : 'Chua co ma watchlist noi bat',
        tone: strongestWatch ? (strongestWatch.up ? 'up' : 'warning') : 'default',
      },
    ];
  }

  get commandInsights(): CommandInsightVm[] {
    const items: CommandInsightVm[] = [];

    if (this.selectedCommandScope === 'ALL') {
      this.commandScopeAlertsOverviews.forEach((overview) => {
        if (overview.headline && items.length < 3) {
          items.push({
            title: `${overview.exchange} headline`,
            text: overview.headline,
            tone: 'up',
          });
        }
      });

      this.commandScopeAlertsOverviews.forEach((overview) => {
        if (overview.watchlist_headline && items.length < 3) {
          items.push({
            title: `${overview.exchange} watchlist`,
            text: overview.watchlist_headline,
            tone: 'warning',
          });
        }
      });
    } else {
      const scopedAlert = this.commandScopeAlertsOverviews[0];
      const scopedAi = this.commandScopeAiOverviews[0];

      if (scopedAlert?.headline) {
        items.push({
          title: 'Market headline',
          text: scopedAlert.headline,
          tone: 'up',
        });
      }

      if (scopedAlert?.watchlist_headline) {
        items.push({
          title: 'Watchlist lens',
          text: scopedAlert.watchlist_headline,
          tone: 'warning',
        });
      }

      if (scopedAi?.assistant_greeting) {
        items.push({
          title: 'AI note',
          text: scopedAi.assistant_greeting,
          tone: 'default',
        });
      }
    }

    if (!items.length && this.news[0]?.title) {
      items.push({
        title: 'CafeF pulse',
        text: this.news[0].title,
        tone: 'default',
      });
    }

    return items.slice(0, 3);
  }

  get commandFocusSymbols(): string[] {
    const focusSet = new Set<string>();

    this.commandScopeAlertsOverviews.forEach((overview) => {
      (overview.watchlist_symbols || []).forEach((symbol) => {
        if (symbol) focusSet.add(symbol);
      });
    });

    const focus = Array.from(focusSet);
    if (focus.length) {
      return focus.slice(0, 6);
    }

    return this.watchlistRows.slice(0, 6).map((item) => item.symbol);
  }

  get quickPromptPreview(): string[] {
    const promptSet = new Set<string>();

    this.commandScopeAiOverviews.forEach((overview) => {
      (overview.quick_prompts || []).forEach((prompt) => {
        if (prompt) promptSet.add(prompt);
      });
    });

    return Array.from(promptSet).slice(0, 4);
  }

  get selectedPriceText(): string {
    return this.formatPrice(this.selectedQuote?.price);
  }

  get selectedChangeText(): string {
    return this.formatSignedPrice(this.selectedQuote?.changeValue);
  }

  get selectedPercentText(): string {
    return this.formatPercent(this.selectedQuote?.changePercent);
  }

  get selectedVolumeText(): string {
    return this.formatNumber(this.selectedQuote?.volume);
  }

  get selectedTradingValueText(): string {
    return this.formatMoney(this.selectedQuote?.tradingValue);
  }

  get selectedQuoteUp(): boolean {
    return Number(this.selectedQuote?.changeValue || 0) >= 0;
  }

  get financialHighlights() {
    return this.financialOverview?.highlights || [];
  }

  get financialSections() {
    return this.financialOverview?.sections || [];
  }

  changeExchange(exchange: ExchangeTab): void {
    if (this.selectedExchange === exchange) return;
    this.selectedExchange = exchange;
    this.loadDashboard(true);
  }

  changeMetric(metric: 'volume' | 'tradingValue'): void {
    if (this.selectedMetric === metric) return;
    this.selectedMetric = metric;
    this.scheduleRender();
  }

  changeCommandScope(scope: CommandScope): void {
    if (this.selectedCommandScope === scope) return;
    this.selectedCommandScope = scope;
  }

  selectSymbol(symbol: string): void {
    if (!symbol) return;
    this.symbolModalOpen = true;

    if (this.selectedSymbol === symbol) {
      this.scheduleRender();
      return;
    }

    this.selectedSymbol = symbol;
    this.financialModalOpen = false;
    this.financialOverview = null;
    this.loadSelectedSymbol();
  }

  closeSymbolModal(): void {
    this.symbolModalOpen = false;
  }

  openFinancialModal(): void {
    if (!this.selectedSymbol) return;
    this.financialModalOpen = true;
    if (this.financialOverview?.symbol === this.selectedSymbol) {
      return;
    }
    this.loadFinancialOverview();
  }

  closeFinancialModal(): void {
    this.financialModalOpen = false;
  }

  onSearchKeywordChange(value: string): void {
    this.searchKeyword = (value || '').toUpperCase();

    if (!this.searchKeyword.trim()) {
      this.searchResults = [];
      return;
    }

    this.searchSub?.unsubscribe();
    this.searchSub = this.api.searchSymbols(this.searchKeyword, 10).subscribe((res) => {
      this.searchResults = res.data || [];
    });
  }

  chooseSearchResult(item: SymbolSearchItem): void {
    this.searchKeyword = item.symbol;
    this.searchResults = [];
  }

  addWatchlist(): void {
    const symbol = (this.searchKeyword || '').trim().toUpperCase();
    if (!symbol) return;

    this.api.addWatchlistItem({
      symbol,
      note: this.watchlistNote?.trim() || null,
      is_active: true,
    }).subscribe(() => {
      this.searchKeyword = '';
      this.watchlistNote = '';
      this.searchResults = [];
      this.loadDashboard(false);
    });
  }

  removeWatchlist(symbol: string): void {
    this.api.deleteWatchlistItem(symbol).subscribe(() => {
      this.loadDashboard(false);
    });
  }

  goToNewsPage(page: number): void {
    const nextPage = Math.min(this.totalNewsPages, Math.max(1, page));
    this.currentNewsPage = nextPage;
  }

  trackByNews(_: number, item: NewsItem): string {
    return item.id;
  }

  trackByWatch(_: number, item: WatchlistVm): string {
    return item.symbol;
  }

  trackByMover(_: number, item: StockVm): string {
    return item.symbol;
  }

  trackByAlert(_: number, item: AlertVm): string {
    return `${item.code}-${item.text}`;
  }

  private bootstrap(): void {
    this.api.listWatchlist().subscribe((watchlistRes) => {
      const watchlist = (watchlistRes.data || []).filter((x) => x.is_active !== false);

      if (!this.exchangeInitialized) {
        this.selectedExchange = this.detectDefaultExchange(watchlist);
        this.exchangeInitialized = true;
      }

      this.loadDashboard(true);

      this.pollSub?.unsubscribe();
      this.pollSub = interval(30000)
        .pipe(startWith(30000))
        .subscribe(() => this.loadDashboard(false));
    });
  }

  private detectDefaultExchange(items: WatchlistItem[]): ExchangeTab {
    const counts: Record<ExchangeTab, number> = {
      HSX: 0,
      HNX: 0,
      UPCOM: 0,
    };

    items.forEach((item) => {
      const ex = (item.exchange || '').toUpperCase() as ExchangeTab;
      if (ex === 'HSX' || ex === 'HNX' || ex === 'UPCOM') {
        counts[ex] += 1;
      }
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const best = sorted[0]?.[0] as ExchangeTab | undefined;
    return best || 'HSX';
  }

  private loadDashboard(resetSelectedSymbol: boolean): void {
    this.loading = true;
    this.boardSub?.unsubscribe();

    this.boardSub = forkJoin({
      indexCards: this.api.getLiveIndexCards(),
      hourlyTrading: this.api.getHourlyTrading(this.selectedExchange),
      indexSeries: this.api.getLiveIndexSeries(this.selectedExchange),
      stocks: this.api.getAllStocks(this.selectedExchange, 'actives', 1, 5000),
      gainers: this.api.getAllStocks(this.selectedExchange, 'gainers', 1, 8),
      losers: this.api.getAllStocks(this.selectedExchange, 'losers', 1, 8),
      watchlist: this.api.listWatchlist(),
      news: this.api.getNews(20),
      aiOverview: this.api.getAiAgentOverview(this.selectedExchange),
      alertsOverview: this.api.getMarketAlertsOverview(this.selectedExchange),
    }).subscribe({
      next: ({ indexCards, hourlyTrading, indexSeries, stocks, gainers, losers, watchlist, news, aiOverview, alertsOverview }) => {
        const indexItems = indexCards.items || [];
        const activeItems = stocks.items || [];
        const gainerItems = gainers.items || [];
        const loserItems = losers.items || [];
        const watchlistItems = (watchlist.data || []).filter((x) => x.is_active !== false);

        this.indexCards = indexItems.map((x) => this.toIndexCardVm(x));
        this.marketRows = this.indexCards;
        this.marketIndexSeries = (indexSeries.items || []).sort(
          (a, b) => new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime()
        );
        this.hourlyTrading = this.resolveMarketHourlySeries(hourlyTrading.items || [], this.marketIndexSeries);
        this.stocks = activeItems.map((x) => this.toStockVm(x));
        this.gainerStocks = gainerItems.map((x) => this.toStockVm(x));
        this.loserStocks = loserItems.map((x) => this.toStockVm(x));
        this.marketUniverse = this.mergeDistinctStocks(activeItems, gainerItems, loserItems).map((x) => this.toStockVm(x));
        this.exchangeStockTotal = stocks.total || this.marketUniverse.length || this.stocks.length;
        this.news = news || [];
        this.currentNewsPage = 1;
        this.aiOverview = aiOverview.data || null;
        this.alertsOverview = alertsOverview.data || null;
        this.lastUpdated = this.resolveLastUpdated(indexCards.capturedAt || stocks.capturedAt);
        this.commandSnapshots[this.selectedExchange] = {
          exchange: this.selectedExchange,
          stocks: this.marketUniverse,
          hourlyTrading: this.hourlyTrading,
          aiOverview: this.aiOverview,
          alertsOverview: this.alertsOverview,
        };

        this.buildWatchlistRows(watchlistItems, this.marketUniverse);

        const selectedFromWatchlist = watchlistItems.find(
          (x) => (x.exchange || '').toUpperCase() === this.selectedExchange
        )?.symbol;

        if (resetSelectedSymbol || !this.selectedSymbol) {
          this.selectedSymbol = this.resolvePreferredSelectedSymbol(selectedFromWatchlist);
        }

        this.aiForecast = this.buildForecast(
          this.aiOverview?.forecast_cards || [],
          indexItems,
          this.hourlyTrading,
          this.marketUniverse.map((item) => item.raw)
        );
        this.alerts = this.buildAlerts(
          this.alertsOverview?.alerts || [],
          this.marketUniverse.map((item) => item.raw),
          this.watchlistRows,
          this.news
        );

        if (this.selectedSymbol) {
          this.loadSelectedSymbol();
        } else {
          this.selectedQuote = null;
          this.selectedHourly = [];
        }

        this.loading = false;
        this.loadCommandSnapshots();
        this.scheduleRender();
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  private buildWatchlistRows(items: WatchlistItem[], stockPool: StockVm[]): void {
    const rows = items.map((item, idx) => {
      const stock = stockPool.find((x) => x.symbol === item.symbol) || this.stocks.find((x) => x.symbol === item.symbol);
      const changeValue = stock?.raw.changeValue ?? null;
      const changePercent = stock?.raw.changePercent ?? null;
      const price = stock?.raw.price ?? item.latest_price ?? null;

      return {
        id: item.id,
        symbol: item.symbol,
        exchange: item.exchange || 'N/A',
        note: item.note || '',
        priceText: this.formatPrice(price),
        changeText: this.formatSignedPrice(changeValue),
        percentText: this.formatPercent(changePercent),
        up: Number(changeValue || 0) > 0,
        sparkId: `dashboard-spark-${idx}`,
        sparkData: this.makeFallbackSpark(price, changePercent),
      } as WatchlistVm;
    });

    this.watchlistRows = rows;
    this.totalWatchlist = rows.length;
    this.totalUp = rows.filter((x) => Number(x.changeText.replace(/[+,]/g, '').replace('--', '0')) > 0).length;
    this.totalDown = rows.filter((x) => Number(x.changeText.replace(/[+,]/g, '').replace('--', '0')) < 0).length;
    this.totalNeutral = Math.max(0, this.totalWatchlist - this.totalUp - this.totalDown);
  }

  private resolveMarketHourlySeries(
    hourlyItems: LiveHourlyTradingItem[],
    indexSeries: LiveIndexSeriesItem[]
  ): LiveHourlyTradingItem[] {
    const sortedHourly = [...hourlyItems].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    if (sortedHourly.length) {
      return sortedHourly;
    }

    return indexSeries
      .filter((item) => item.time)
      .map((item) => ({
        time: item.time as string,
        volume: item.volume,
        tradingValue: item.value,
        pointCount: null,
        symbolCount: null,
      }));
  }

  private hasStockData(item?: StockVm | null): boolean {
    if (!item) return false;
    return (
      item.raw.price !== null ||
      item.raw.volume !== null ||
      item.raw.tradingValue !== null ||
      item.raw.changePercent !== null
    );
  }

  private resolvePreferredSelectedSymbol(preferredSymbol?: string | null): string {
    const preferred = preferredSymbol?.toUpperCase();
    const universeBySymbol = new Map(this.marketUniverse.map((item) => [item.symbol.toUpperCase(), item]));

    if (preferred && this.hasStockData(universeBySymbol.get(preferred))) {
      return preferred;
    }

    const candidates = [
      ...this.marketUniverse,
      ...this.stocks,
      ...this.gainerStocks,
      ...this.loserStocks,
    ];

    const firstWithData = candidates.find((item) => this.hasStockData(item));
    if (firstWithData) {
      return firstWithData.symbol;
    }

    return preferred || this.watchlistRows[0]?.symbol || this.stocks[0]?.symbol || this.topGainersPreview[0]?.symbol || '';
  }

  private buildFallbackQuote(symbol: string): LiveSymbolQuote | null {
    const stock =
      this.marketUniverse.find((item) => item.symbol === symbol) ||
      this.stocks.find((item) => item.symbol === symbol) ||
      this.gainerStocks.find((item) => item.symbol === symbol) ||
      this.loserStocks.find((item) => item.symbol === symbol);

    if (!stock || !this.hasStockData(stock)) {
      return null;
    }

    return {
      price: stock.raw.price ?? null,
      referencePrice: null,
      changeValue: stock.raw.changeValue ?? null,
      changePercent: stock.raw.changePercent ?? null,
      volume: stock.raw.volume ?? null,
      tradingValue: stock.raw.tradingValue ?? null,
      quoteTime: stock.raw.pointTime ?? stock.raw.capturedAt ?? null,
      capturedAt: stock.raw.capturedAt ?? null,
    };
  }

  private loadSelectedSymbol(): void {
    if (!this.selectedSymbol) return;

    this.symbolLoading = true;
    this.symbolSub?.unsubscribe();

    this.symbolSub = forkJoin({
      quote: this.api.getSymbolQuote(this.selectedSymbol),
      hourly: this.api.getSymbolHourly(this.selectedSymbol),
    }).subscribe({
      next: ({ quote, hourly }) => {
        this.selectedQuote = quote.quote || this.buildFallbackQuote(this.selectedSymbol);
        this.selectedHourly = (hourly.items || []).sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );
        this.symbolLoading = false;
        this.scheduleRender();
      },
      error: () => {
        this.symbolLoading = false;
      },
    });
  }

  private loadFinancialOverview(): void {
    if (!this.selectedSymbol) return;

    this.financialLoading = true;
    this.api.getSymbolFinancials(this.selectedSymbol, 18).subscribe({
      next: (data) => {
        this.financialOverview = data;
        this.financialLoading = false;
      },
      error: () => {
        this.financialOverview = null;
        this.financialLoading = false;
      },
    });
  }

  private buildForecast(
    aiCards: AiForecastCard[],
    indices: LiveIndexCardItem[],
    hourly: LiveHourlyTradingItem[],
    stocks: LiveStockItem[]
  ): ForecastVm[] {
    if (aiCards.length) {
      return aiCards.slice(0, 3).map((item) => ({
        title: item.title,
        summary: item.summary,
        confidence: item.confidence,
        direction: item.direction,
      }));
    }

    const selectedIndex = indices.find((x) => x.exchange === this.selectedExchange);
    const positive = stocks.filter((x) => Number(x.changePercent || 0) > 0).length;
    const negative = stocks.filter((x) => Number(x.changePercent || 0) < 0).length;
    const totalVolume = hourly.reduce((sum, x) => sum + Number(x.volume || 0), 0);
    const totalStocks = stocks.length;
    const breadthText = `${positive} tăng / ${negative} giảm`;

    return [
      {
        title: 'Xu hướng chỉ số',
        summary: selectedIndex
          ? `${selectedIndex.symbol} đang ở ${this.formatPrice(selectedIndex.close)}, biến động ${this.formatPercent(
              selectedIndex.change_percent
            )}.`
          : 'Chưa đủ dữ liệu chỉ số để đánh giá.',
        confidence: selectedIndex ? 72 : 40,
        direction:
          Number(selectedIndex?.change_percent || 0) > 0
            ? 'up'
            : Number(selectedIndex?.change_percent || 0) < 0
            ? 'down'
            : 'neutral',
      },
      {
        title: 'Độ rộng thị trường',
        summary:
          totalStocks > 0
            ? `Sàn ${this.selectedExchange} hiện có ${totalStocks} mã, độ rộng đang là ${breadthText}.`
            : 'Chưa có dữ liệu cổ phiếu để tính độ rộng.',
        confidence: totalStocks > 0 ? 68 : 35,
        direction: positive > negative ? 'up' : negative > positive ? 'down' : 'neutral',
      },
      {
        title: 'Dòng tiền trong ngày',
        summary:
          hourly.length > 0
            ? `Khối lượng cộng dồn đạt ${this.formatAxisNumber(totalVolume)}. Theo dõi thêm watchlist để tìm tín hiệu sớm.`
            : 'Chưa có đủ dữ liệu giao dịch theo giờ.',
        confidence: hourly.length > 0 ? 66 : 32,
        direction: 'neutral',
      },
    ];
  }

  private buildAlerts(
    aiAlerts: MarketAlertItem[],
    stocks: LiveStockItem[],
    watchlistRows: WatchlistVm[],
    news: NewsItem[]
  ): AlertVm[] {
    if (aiAlerts.length) {
      return aiAlerts.slice(0, 8).map((item) => ({
        code: item.symbol,
        text: `${item.title}: ${item.prediction}`,
        type:
          item.severity === 'critical'
            ? 'danger'
            : item.severity === 'warning'
            ? 'warning'
            : 'info',
      }));
    }

    const strongMovers = stocks
      .filter((x) => Math.abs(Number(x.changePercent || 0)) >= 3)
      .slice(0, 4)
      .map((x) => ({
        code: x.symbol,
        text: `Biến động mạnh ${this.formatPercent(x.changePercent)} trong phiên.`,
        type: Math.abs(Number(x.changePercent || 0)) >= 5 ? 'danger' : 'warning',
      } as AlertVm));

    const watchAlerts = watchlistRows.slice(0, 3).map((x) => ({
      code: x.symbol,
      text: `Đang nằm trong watchlist và được ưu tiên theo dõi.`,
      type: 'info' as const,
    }));

    const newsAlerts = news.slice(0, 2).map((x) => ({
      code: 'NEWS',
      text: x.title,
      type: 'success' as const,
    }));

    return [...strongMovers, ...watchAlerts, ...newsAlerts];
  }

  private toIndexCardVm(item: LiveIndexCardItem): IndexCardVm {
    const up = Number(item.change_value || 0) >= 0;
    return {
      symbol: item.symbol,
      exchange: item.exchange,
      displayName: item.symbol,
      valueText: this.formatPrice(item.close),
      changeText: this.formatSignedPrice(item.change_value),
      percentText: this.formatPercent(item.change_percent),
      highText: this.formatPrice(item.high),
      lowText: this.formatPrice(item.low),
      volumeText: this.formatNumber(item.volume),
      valueTradeText: this.formatMoney(item.trading_value),
      updatedText: this.resolveLastUpdated(item.updated_at),
      up,
    };
  }

  private toStockVm(item: LiveStockItem): StockVm {
    const up = Number(item.changeValue || 0) >= 0;
    return {
      rank: item.rank,
      symbol: item.symbol,
      name: item.name,
      exchange: item.exchange,
      priceText: this.formatPrice(item.price),
      changeText: this.formatSignedPrice(item.changeValue),
      percentText: this.formatPercent(item.changePercent),
      volumeText: this.formatNumber(item.volume),
      valueTradeText: this.formatMoney(item.tradingValue),
      up,
      raw: item,
    };
  }

  private mergeDistinctStocks(...groups: LiveStockItem[][]): LiveStockItem[] {
    const merged = new Map<string, LiveStockItem>();

    groups.forEach((group) => {
      group.forEach((item: LiveStockItem) => {
        if (!item?.symbol) return;
        const key = item.symbol.toUpperCase();
        if (!merged.has(key)) {
          merged.set(key, { ...item, symbol: key });
        }
      });
    });

    return Array.from(merged.values());
  }

  private scheduleRender(): void {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => {
      this.renderMarketChart();
      this.renderSymbolChart();
      this.renderWatchDonut();
      this.renderSparks();
    }, 80);
  }

  private destroyCharts(): void {
    try {
      this.marketChart?.destroy();
    } catch {}
    try {
      this.symbolChart?.destroy();
    } catch {}
    try {
      this.watchDonut?.destroy();
    } catch {}

    this.sparkCharts.forEach((x) => {
      try {
        x.destroy();
      } catch {}
    });
    this.sparkCharts = [];
  }

  private renderMarketChart(): void {
    const el = document.getElementById('dashboard-market-chart');
    if (!el || typeof ApexCharts === 'undefined') return;

    try {
      this.marketChart?.destroy();
    } catch {}

    const points = this.hourlyTrading.map((x) => ({
      x: new Date(x.time).getTime(),
      y:
        this.selectedMetric === 'volume'
          ? Number(x.volume || 0)
          : Number(x.tradingValue || 0),
    }));

    this.marketChart = new ApexCharts(el, {
      chart: {
        type: 'line',
        height: 300,
        toolbar: { show: false },
        animations: { enabled: false },
        fontFamily: 'inherit',
      },
      series: [
        {
          name: this.selectedMetric === 'volume' ? 'Khoi luong' : 'Gia tri giao dich',
          data: points,
        },
      ],
      stroke: {
        curve: 'smooth',
        width: 3,
      },
      markers: {
        size: 3,
        hover: { size: 5 },
      },
      colors: ['#2563eb'],
      dataLabels: { enabled: false },
      xaxis: {
        type: 'datetime',
        labels: {
          datetimeUTC: false,
          formatter: (_: string, timestamp?: number) => this.formatTime(timestamp || 0),
        },
      },
      yaxis: {
        labels: {
          formatter: (value: number) =>
            this.selectedMetric === 'volume'
              ? this.formatAxisNumber(value)
              : this.formatMoney(value),
        },
      },
      tooltip: {
        x: {
          formatter: (value: number) => this.formatTimeHms(value),
        },
        y: {
          formatter: (value: number) =>
            this.selectedMetric === 'volume'
              ? this.formatAxisNumber(value)
              : this.formatMoney(value),
        },
      },
      grid: {
        borderColor: '#edf1f7',
        strokeDashArray: 4,
      },
    });

    this.marketChart.render();
  }

  private renderSymbolChart(): void {
    const el = document.getElementById('dashboard-symbol-chart');
    if (!el || typeof ApexCharts === 'undefined' || !this.selectedHourly.length) return;

    try {
      this.symbolChart?.destroy();
    } catch {}

    const closeSeries = this.selectedHourly.map((x) => ({
      x: new Date(x.time).getTime(),
      y: Number(x.close || 0),
    }));

    this.symbolChart = new ApexCharts(el, {
      chart: {
        type: 'area',
        height: 360,
        toolbar: { show: false },
        animations: { enabled: false },
        fontFamily: 'inherit',
      },
      series: [
        {
          name: 'Gia',
          data: closeSeries,
        },
      ],
      stroke: {
        width: 3,
        curve: 'smooth',
      },
      colors: ['#16a34a'],
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.28,
          opacityTo: 0.03,
          stops: [0, 95, 100],
        },
      },
      markers: {
        size: 0,
        hover: { size: 5 },
      },
      dataLabels: { enabled: false },
      xaxis: {
        type: 'datetime',
        labels: {
          datetimeUTC: false,
          formatter: (_: string, timestamp?: number) => this.formatTime(timestamp || 0),
        },
      },
      yaxis: {
        labels: {
          formatter: (value: number) => this.formatPrice(value),
        },
      },
      tooltip: {
        shared: false,
        intersect: true,
        x: {
          formatter: (value: number) => this.formatTimeHms(value),
        },
        y: {
          formatter: (value: number) => this.formatPrice(value),
        },
      },
      grid: {
        borderColor: '#edf1f7',
        strokeDashArray: 4,
      },
    });

    this.symbolChart.render();
  }

  private renderWatchDonut(): void {
    const el = document.getElementById('dashboard-watch-donut');
    if (!el || typeof ApexCharts === 'undefined') return;

    try {
      this.watchDonut?.destroy();
    } catch {}

    const hasData = this.totalWatchlist > 0;
    const series = hasData ? [this.totalUp, this.totalDown, this.totalNeutral] : [1, 0, 0];

    this.watchDonut = new ApexCharts(el, {
      chart: {
        type: 'donut',
        height: 240,
        toolbar: { show: false },
      },
      labels: ['Tăng', 'Giảm', 'Không đổi'],
      series,
      colors: ['#00c853', '#ef4444', '#f59e0b'],
      dataLabels: { enabled: false },
      legend: {
        position: 'bottom',
        fontSize: '12px',
      },
      plotOptions: {
        pie: {
          donut: {
            size: '68%',
            labels: {
              show: true,
              total: {
                show: true,
                label: 'Watchlist',
                formatter: () => `${this.totalWatchlist}`,
              },
            },
          },
        },
      },
    });

    this.watchDonut.render();
  }

  private renderSparks(): void {
    if (typeof ApexCharts === 'undefined') return;

    this.sparkCharts.forEach((x) => {
      try {
        x.destroy();
      } catch {}
    });
    this.sparkCharts = [];

    this.watchlistPreview.forEach((item) => {
      const el = document.getElementById(item.sparkId);
      if (!el) return;

      const chart = new ApexCharts(el, {
        chart: {
          type: 'line',
          height: 34,
          sparkline: { enabled: true },
          animations: { enabled: false },
        },
        series: [{ data: item.sparkData }],
        stroke: {
          curve: 'smooth',
          width: 2,
        },
        colors: [item.up ? '#2563eb' : '#ef4444'],
        tooltip: { enabled: false },
      });

      chart.render();
      this.sparkCharts.push(chart);
    });
  }

  private makeFallbackSpark(price: number | null | undefined, pct: number | null | undefined): number[] {
    const p = Number(price || 0);
    const r = Number(pct || 0) / 100;
    if (!p) return [0, 0, 0, 0, 0, 0];
    return [
      p * (1 - r * 1.1),
      p * (1 - r * 0.8),
      p * (1 - r * 0.4),
      p * (1 - r * 0.2),
      p * (1 - r * 0.05),
      p,
    ].map((x) => Number(x.toFixed(2)));
  }

  private resolveLastUpdated(value: string | null | undefined): string {
    if (!value) return '--';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '--';
    const hh = `${d.getHours()}`.padStart(2, '0');
    const mm = `${d.getMinutes()}`.padStart(2, '0');
    const ss = `${d.getSeconds()}`.padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  private formatTime(value: number): string {
    const d = new Date(value);
    const hh = `${d.getHours()}`.padStart(2, '0');
    const mm = `${d.getMinutes()}`.padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private formatTimeHms(value: number): string {
    const d = new Date(value);
    const hh = `${d.getHours()}`.padStart(2, '0');
    const mm = `${d.getMinutes()}`.padStart(2, '0');
    const ss = `${d.getSeconds()}`.padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  private formatPrice(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    return Number(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private formatSignedPrice(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    const num = Number(value);
    const abs = Math.abs(num).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${num >= 0 ? '+' : '-'}${abs}`;
  }

  private formatPercent(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    const num = Number(value);
    return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
  }

  private formatNumber(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    return Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  private formatMoney(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    const num = Number(value);
    if (Math.abs(num) >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
    if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  private formatAxisNumber(value: number): string {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
    return `${Math.round(value)}`;
  }

  private parsePercent(value: string): number {
    if (!value || value === '--') return 0;
    const normalized = value.replace('%', '').replace('+', '').replace(/,/g, '').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private loadCommandSnapshots(): void {
    this.commandSub?.unsubscribe();
    this.commandSub = forkJoin({
      hsxStocks: this.api.getAllStocks('HSX', 'actives', 1, 120),
      hnxStocks: this.api.getAllStocks('HNX', 'actives', 1, 120),
      upcomStocks: this.api.getAllStocks('UPCOM', 'actives', 1, 120),
      hsxHourly: this.api.getHourlyTrading('HSX'),
      hnxHourly: this.api.getHourlyTrading('HNX'),
      upcomHourly: this.api.getHourlyTrading('UPCOM'),
      hsxAi: this.api.getAiAgentOverview('HSX'),
      hnxAi: this.api.getAiAgentOverview('HNX'),
      upcomAi: this.api.getAiAgentOverview('UPCOM'),
      hsxAlerts: this.api.getMarketAlertsOverview('HSX'),
      hnxAlerts: this.api.getMarketAlertsOverview('HNX'),
      upcomAlerts: this.api.getMarketAlertsOverview('UPCOM'),
    }).subscribe((result) => {
      this.commandSnapshots.HSX = {
        exchange: 'HSX',
        stocks: (result.hsxStocks.items || []).map((item) => this.toStockVm(item)),
        hourlyTrading: result.hsxHourly.items || [],
        aiOverview: result.hsxAi.data || null,
        alertsOverview: result.hsxAlerts.data || null,
      };
      this.commandSnapshots.HNX = {
        exchange: 'HNX',
        stocks: (result.hnxStocks.items || []).map((item) => this.toStockVm(item)),
        hourlyTrading: result.hnxHourly.items || [],
        aiOverview: result.hnxAi.data || null,
        alertsOverview: result.hnxAlerts.data || null,
      };
      this.commandSnapshots.UPCOM = {
        exchange: 'UPCOM',
        stocks: (result.upcomStocks.items || []).map((item) => this.toStockVm(item)),
        hourlyTrading: result.upcomHourly.items || [],
        aiOverview: result.upcomAi.data || null,
        alertsOverview: result.upcomAlerts.data || null,
      };
    });
  }
}
