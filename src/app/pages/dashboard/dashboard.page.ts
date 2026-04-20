import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, forkJoin, interval, startWith } from 'rxjs';
import {
  AiAgentOverviewResponse,
  AiForecastCard,
  ExchangeTab,
  LiveHourlyTradingItem,
  LiveIndexCardItem,
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

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false,
})
export class DashboardPage implements OnInit, AfterViewInit, OnDestroy {
  readonly newsPageSize = 5;

  selectedExchange: ExchangeTab = 'HSX';
  selectedMetric: 'volume' | 'tradingValue' = 'volume';
  selectedSymbol = '';

  indexCards: IndexCardVm[] = [];
  marketRows: IndexCardVm[] = [];
  stocks: StockVm[] = [];
  watchlistRows: WatchlistVm[] = [];
  hourlyTrading: LiveHourlyTradingItem[] = [];
  selectedQuote: LiveSymbolQuote | null = null;
  selectedHourly: LiveSymbolHourlyItem[] = [];
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
  totalUp = 0;
  totalDown = 0;
  totalNeutral = 0;

  lastUpdated = '--';
  loading = false;
  symbolLoading = false;

  private exchangeInitialized = false;
  private pollSub?: Subscription;
  private boardSub?: Subscription;
  private symbolSub?: Subscription;
  private searchSub?: Subscription;
  private renderTimer: any;

  private marketChart: any;
  private symbolChart: any;
  private watchDonut: any;
  private sparkCharts: any[] = [];

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

  get selectedSymbolDisplay(): string {
    return this.selectedSymbol || '--';
  }

  get totalNewsPages(): number {
    return Math.max(1, Math.ceil(this.news.length / this.newsPageSize));
  }

  get pagedNews(): NewsItem[] {
    const start = (this.currentNewsPage - 1) * this.newsPageSize;
    return this.news.slice(start, start + this.newsPageSize);
  }

  get aiProviderText(): string {
    if (!this.aiOverview) return 'Chua ket noi';
    const provider = this.aiOverview.provider || 'fallback';
    return this.aiOverview.used_fallback ? `${provider} / fallback` : provider;
  }

  get commandMetrics(): CommandMetricVm[] {
    const totalAlerts = this.alertsOverview?.alert_count || 0;
    const watchlistAlerts = this.alertsOverview?.watchlist_alert_count || 0;
    const watchlistCount = this.watchlistRows.length;
    const topNews = this.news[0]?.title || 'Chua co tin noi bat';
    const positive = this.stocks.filter((x) => Number(x.raw.changePercent || 0) > 0).length;
    const negative = this.stocks.filter((x) => Number(x.raw.changePercent || 0) < 0).length;
    const neutral = Math.max(0, this.stocks.length - positive - negative);
    const totalTradingValue = this.hourlyTrading.reduce((sum, item) => sum + Number(item.tradingValue || 0), 0);
    const leadMover = [...this.stocks].sort(
      (a, b) => Math.abs(Number(b.raw.changePercent || 0)) - Math.abs(Number(a.raw.changePercent || 0))
    )[0];
    const hotWatchlist = this.watchlistRows.filter(
      (item) => Math.abs(Number(item.percentText.replace('%', '').replace('+', '') || 0)) >= 2
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
        value: this.aiOverview?.model || 'fallback',
        helper: this.aiProviderText,
        tone: this.aiOverview?.used_fallback ? 'warning' : 'up',
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
        helper: this.hourlyTrading.length ? `${this.hourlyTrading.length} moc du lieu theo gio` : 'Chua co du lieu dong tien',
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
    const positive = this.stocks.filter((x) => Number(x.raw.changePercent || 0) > 0).length;
    const negative = this.stocks.filter((x) => Number(x.raw.changePercent || 0) < 0).length;
    const totalVolume = this.hourlyTrading.reduce((sum, item) => sum + Number(item.volume || 0), 0);
    const strongestWatch = [...this.watchlistRows].sort((a, b) => {
      const aPct = Math.abs(Number(a.percentText.replace('%', '').replace('+', '') || 0));
      const bPct = Math.abs(Number(b.percentText.replace('%', '').replace('+', '') || 0));
      return bPct - aPct;
    })[0];

    return [
      {
        label: 'Do rong san',
        value: `${positive} tang / ${negative} giam`,
        helper: this.stocks.length ? `${this.stocks.length} ma dang duoc quet` : 'Chua co snapshot thi truong',
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

    if (this.alertsOverview?.headline) {
      items.push({
        title: 'Market headline',
        text: this.alertsOverview.headline,
        tone: 'up',
      });
    }

    if (this.alertsOverview?.watchlist_headline) {
      items.push({
        title: 'Watchlist lens',
        text: this.alertsOverview.watchlist_headline,
        tone: 'warning',
      });
    }

    if (this.aiOverview?.assistant_greeting) {
      items.push({
        title: 'AI note',
        text: this.aiOverview.assistant_greeting,
        tone: 'default',
      });
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
    const focus = this.alertsOverview?.watchlist_symbols?.filter(Boolean) || [];
    if (focus.length) {
      return focus.slice(0, 6);
    }

    return this.watchlistRows.slice(0, 6).map((item) => item.symbol);
  }

  get quickPromptPreview(): string[] {
    return (this.aiOverview?.quick_prompts || []).slice(0, 4);
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

  selectSymbol(symbol: string): void {
    if (!symbol || this.selectedSymbol === symbol) return;
    this.selectedSymbol = symbol;
    this.loadSelectedSymbol();
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
      stocks: this.api.getAllStocks(this.selectedExchange, 'actives', 1, 5000),
      watchlist: this.api.listWatchlist(),
      news: this.api.getNews(20),
      aiOverview: this.api.getAiAgentOverview(this.selectedExchange),
      alertsOverview: this.api.getMarketAlertsOverview(this.selectedExchange),
    }).subscribe({
      next: ({ indexCards, hourlyTrading, stocks, watchlist, news, aiOverview, alertsOverview }) => {
        const indexItems = indexCards.items || [];
        const stockItems = stocks.items || [];
        const watchlistItems = (watchlist.data || []).filter((x) => x.is_active !== false);

        this.indexCards = indexItems.map((x) => this.toIndexCardVm(x));
        this.marketRows = this.indexCards;
        this.hourlyTrading = (hourlyTrading.items || []).sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );
        this.stocks = stockItems.map((x) => this.toStockVm(x));
        this.news = news || [];
        this.currentNewsPage = 1;
        this.aiOverview = aiOverview.data || null;
        this.alertsOverview = alertsOverview.data || null;
        this.lastUpdated = this.resolveLastUpdated(indexCards.capturedAt || stocks.capturedAt);

        this.buildWatchlistRows(watchlistItems);

        const selectedFromWatchlist = watchlistItems.find(
          (x) => (x.exchange || '').toUpperCase() === this.selectedExchange
        )?.symbol;

        if (resetSelectedSymbol || !this.selectedSymbol) {
          this.selectedSymbol =
            selectedFromWatchlist ||
            this.watchlistRows[0]?.symbol ||
            this.stocks[0]?.symbol ||
            '';
        }

        this.aiForecast = this.buildForecast(
          this.aiOverview?.forecast_cards || [],
          indexItems,
          this.hourlyTrading,
          stockItems
        );
        this.alerts = this.buildAlerts(
          this.alertsOverview?.alerts || [],
          stockItems,
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
        this.scheduleRender();
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  private buildWatchlistRows(items: WatchlistItem[]): void {
    const rows = items.map((item, idx) => {
      const stock = this.stocks.find((x) => x.symbol === item.symbol);
      const changeValue = stock?.raw.changeValue ?? null;
      const changePercent = stock?.raw.changePercent ?? null;
      const price = stock?.raw.price ?? null;

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

  private loadSelectedSymbol(): void {
    if (!this.selectedSymbol) return;

    this.symbolLoading = true;
    this.symbolSub?.unsubscribe();

    this.symbolSub = forkJoin({
      quote: this.api.getSymbolQuote(this.selectedSymbol),
      hourly: this.api.getSymbolHourly(this.selectedSymbol),
    }).subscribe({
      next: ({ quote, hourly }) => {
        this.selectedQuote = quote.quote;
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
          name: this.selectedMetric === 'volume' ? 'Khối lượng' : 'Giá trị giao dịch',
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

    const volumeSeries = this.selectedHourly.map((x) => ({
      x: new Date(x.time).getTime(),
      y: Number(x.volume || 0),
    }));

    this.symbolChart = new ApexCharts(el, {
      chart: {
        type: 'line',
        height: 360,
        stacked: false,
        toolbar: { show: false },
        animations: { enabled: false },
        fontFamily: 'inherit',
      },
      series: [
        {
          name: 'Giá',
          type: 'line',
          data: closeSeries,
        },
        {
          name: 'Khối lượng',
          type: 'column',
          data: volumeSeries,
        },
      ],
      stroke: {
        width: [3, 0],
        curve: 'smooth',
      },
      colors: ['#16a34a', '#93c5fd'],
      fill: {
        opacity: [1, 0.65],
      },
      dataLabels: { enabled: false },
      xaxis: {
        type: 'datetime',
        labels: {
          datetimeUTC: false,
          formatter: (_: string, timestamp?: number) => this.formatTime(timestamp || 0),
        },
      },
      yaxis: [
        {
          labels: {
            formatter: (value: number) => this.formatPrice(value),
          },
        },
        {
          opposite: true,
          labels: {
            formatter: (value: number) => this.formatAxisNumber(value),
          },
        },
      ],
      tooltip: {
        shared: true,
        intersect: false,
        x: {
          formatter: (value: number) => this.formatTimeHms(value),
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
}
