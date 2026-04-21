import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, forkJoin, interval, of, startWith, switchMap } from 'rxjs';
import {
  ExchangeTab,
  FinancialOverviewResponse,
  LiveHourlyTradingItem,
  LiveIndexCardItem,
  LiveIndexOptionItem,
  LiveIndexSeriesItem,
  LiveSymbolHourlyItem,
  LiveSymbolQuote,
  LiveStockItem,
  MarketApiService,
  SortTab,
} from 'src/app/core/services/market-api.service';

declare const ApexCharts: any;

interface IndexSeriesVm {
  x: number;
  y: number;
}

interface IndexCardVm {
  symbol: string;
  exchange: string;
  displayName: string;
  valueText: string;
  changeText: string;
  percentText: string;
  volumeText: string;
  tradingValueText: string;
  highText: string;
  lowText: string;
  updatedText: string;
  up: boolean;
  chartId: string;
  seriesPoints: IndexSeriesVm[];
  baseLinePoints: IndexSeriesVm[];
  baseValue: number | null;
  mode: 'intraday' | 'daily';
}

interface StockVm {
  rank: number;
  symbol: string;
  exchange: string;
  name?: string | null;
  priceText: string;
  changeText: string;
  percentText: string;
  volumeText: string;
  tradingValueText: string;
  up: boolean;
  raw: LiveStockItem;
}

interface WatchSummaryVm {
  label: string;
  value: string;
  helper: string;
}

type FlowRange = 'day' | 'week' | 'tenDays';

@Component({
  selector: 'app-market-watch',
  templateUrl: './market-watch.page.html',
  styleUrls: ['./market-watch.page.scss'],
  standalone: false,
})
export class MarketWatchPage implements OnInit, AfterViewInit, OnDestroy {
  readonly exchangeOptions: ExchangeTab[] = ['HSX', 'HNX', 'UPCOM'];
  readonly stockPageSize = 12;
  selectedExchange: ExchangeTab = 'HSX';
  selectedSort: SortTab = 'all';
  selectedMetric: 'volume' | 'tradingValue' = 'volume';
  selectedFlowRange: FlowRange = 'day';
  selectedIndexView = 'ALL';
  selectedSymbol = '';
  symbolModalOpen = false;
  financialModalOpen = false;
  stockSearchKeyword = '';
  currentStockPage = 1;

  availableIndices: LiveIndexOptionItem[] = [];
  indexCards: IndexCardVm[] = [];
  topStocks: StockVm[] = [];
  totalStockCount = 0;
  hourlyTrading: LiveHourlyTradingItem[] = [];
  dailyIndexSeriesMap = new Map<string, LiveIndexSeriesItem[]>();
  selectedQuote: LiveSymbolQuote | null = null;
  selectedHourly: LiveSymbolHourlyItem[] = [];
  financialOverview: FinancialOverviewResponse | null = null;

  boardLoading = false;
  symbolLoading = false;
  financialLoading = false;
  lastUpdatedText = '--';

  private boardSub?: Subscription;
  private symbolSub?: Subscription;
  private pollSub?: Subscription;
  private renderTimer: any;

  private hourlyChart: any;
  private flowCharts: any[] = [];
  private symbolChart: any;
  private miniIndexCharts: any[] = [];

  constructor(private api: MarketApiService) {}

  ngOnInit(): void {
    this.startPolling();
  }

  ngAfterViewInit(): void {
    this.scheduleRender(150);
  }

  ionViewDidEnter(): void {
    this.scheduleRender(150);
  }

  ngOnDestroy(): void {
    this.boardSub?.unsubscribe();
    this.symbolSub?.unsubscribe();
    this.pollSub?.unsubscribe();

    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
    }

    this.destroyCharts();
  }

  changeExchange(exchange: ExchangeTab): void {
    if (this.selectedExchange === exchange) return;
    this.selectedExchange = exchange;
    this.selectedIndexView = 'ALL';
    this.currentStockPage = 1;
    this.refreshBoard(true);
  }

  changeSort(sort: SortTab): void {
    if (this.selectedSort === sort) return;
    this.selectedSort = sort;
    this.currentStockPage = 1;
    this.refreshBoard(true);
  }

  changeMetric(metric: 'volume' | 'tradingValue'): void {
    if (this.selectedMetric === metric) return;
    this.selectedMetric = metric;
    this.scheduleRender(50);
  }

  changeIndexView(symbol: string): void {
    if (this.selectedIndexView === symbol) return;
    this.selectedIndexView = symbol;
    this.scheduleRender(50);
  }

  selectSymbol(symbol: string): void {
    if (!symbol) return;

    const symbolChanged = this.selectedSymbol !== symbol;
    this.selectedSymbol = symbol;
    this.symbolModalOpen = true;
    if (symbolChanged) {
      this.financialModalOpen = false;
      this.financialOverview = null;
    }

    if (symbolChanged || !this.selectedQuote) {
      this.loadSelectedSymbol();
      return;
    }

    this.scheduleRender(120);
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

  trackByIndex(_: number, item: IndexCardVm): string {
    return item.symbol;
  }

  trackByTopStock(_: number, item: StockVm): string {
    return item.symbol;
  }

  get filteredIndexCards(): IndexCardVm[] {
    const exchangeCards = this.indexCards.filter((item) => item.exchange === this.selectedExchange);
    if (this.selectedIndexView === 'ALL') {
      return exchangeCards;
    }

    return exchangeCards.filter((item) => item.symbol === this.selectedIndexView);
  }

  get focusIndexCard(): IndexCardVm | null {
    return this.filteredIndexCards[0] || this.indexCards.find((item) => item.exchange === this.selectedExchange) || null;
  }

  get exchangeIndexOptions(): LiveIndexOptionItem[] {
    return this.availableIndices.filter((item) => item.exchange === this.selectedExchange);
  }

  get flowFocusSymbol(): string {
    return this.focusIndexCard?.symbol || '';
  }

  hasFlowChartData(range: FlowRange): boolean {
    if (range === 'day') {
      return this.hourlyTrading.some((item) =>
        this.selectedMetric === 'volume'
          ? this.num(item.volume) > 0
          : this.num(item.tradingValue) > 0
      );
    }

    return this.buildFlowDailyPoints(range).length > 0;
  }

  get totalHourlyValueText(): string {
    const total = this.hourlyTrading.reduce((sum, item) => sum + this.num(item.tradingValue), 0);
    return this.formatMoney(total);
  }

  get totalHourlyVolumeText(): string {
    const total = this.hourlyTrading.reduce((sum, item) => sum + this.num(item.volume), 0);
    return this.formatAxisNumber(total);
  }

  get watchSummary(): WatchSummaryVm[] {
    const leader = this.topStocks[0];
    const start = this.totalStockCount === 0 ? 0 : ((this.currentStockPage - 1) * this.stockPageSize) + 1;
    const end = Math.min(this.currentStockPage * this.stockPageSize, this.totalStockCount);
    return [
      {
        label: 'Chi so hien thi',
        value: `${this.filteredIndexCards.length}`,
        helper: this.selectedIndexView === 'ALL' ? 'Dang xem toan bo danh sach' : `Dang loc ${this.selectedIndexView}`,
      },
      {
        label: 'Co phieu tren san',
        value: `${start}-${end}/${this.totalStockCount}`,
        helper: this.selectedSort === 'all'
          ? `Dang xem full universe cua ${this.selectedExchange}${this.stockSearchKeyword ? ' va tim kiem dang bat' : ''}`
          : `Bo loc ${this.stockSortLabel} va tim kiem ${this.stockSearchKeyword ? 'dang bat' : 'tat'}`,
      },
      {
        label: 'Dong tien theo gio',
        value: this.selectedMetric === 'volume' ? this.totalHourlyVolumeText : this.totalHourlyValueText,
        helper: this.selectedMetric === 'volume' ? 'Tong khoi luong cong don' : 'Tong gia tri giao dich cong don',
      },
      {
        label: 'Ma dan dau',
        value: leader?.symbol || '--',
        helper: leader ? `${leader.changeText} / ${leader.percentText}` : 'Chua co ma noi bat',
      },
    ];
  }

  get filteredStocks(): StockVm[] {
    return this.topStocks;
  }

  get pagedStocks(): StockVm[] {
    return this.topStocks;
  }

  get totalStockPages(): number {
    return Math.max(1, Math.ceil(this.totalStockCount / this.stockPageSize));
  }

  get stockSortLabel(): string {
    if (this.selectedSort === 'all') return 'Tat ca ma';
    if (this.selectedSort === 'gainers') return 'Top tang';
    if (this.selectedSort === 'losers') return 'Top giam';
    return 'Thanh khoan cao';
  }

  get stockBoardChipLabel(): string {
    return this.selectedSort === 'all' ? 'FULL UNIVERSE' : this.stockSortLabel.toUpperCase();
  }

  get stockBoardSubtitle(): string {
    if (this.selectedSort === 'all') {
      return `Dang xem toan bo ${this.totalStockCount} ma tren san ${this.selectedExchange}. Chon mot ma de mo chi tiet ngay trong modal.`;
    }

    return `Dang xem ${this.stockSortLabel.toLowerCase()} cua san ${this.selectedExchange}. Chon mot ma de xem chi tiet ngay ben duoi.`;
  }

  onStockKeywordChange(value: string): void {
    this.stockSearchKeyword = value || '';
    this.currentStockPage = 1;
    this.refreshBoard(false);
  }

  goToStockPage(page: number): void {
    this.currentStockPage = Math.min(this.totalStockPages, Math.max(1, page));
    this.refreshBoard(false);
  }

  private startPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = interval(30000)
      .pipe(startWith(0))
      .subscribe(() => this.refreshBoard(false));
  }

  private refreshBoard(forceResetSymbol: boolean): void {
    this.boardLoading = true;
    this.boardSub?.unsubscribe();
    const normalizedKeyword = this.stockSearchKeyword.trim().toUpperCase();
    const usingKeywordSearch = !!normalizedKeyword;
    const usingFullUniverse = this.selectedSort === 'all';
    const requestedPage = (usingKeywordSearch || usingFullUniverse) ? 1 : this.currentStockPage;
    const requestedPageSize = (usingKeywordSearch || usingFullUniverse) ? 5000 : this.stockPageSize;

    this.boardSub = this.api.getLiveIndexCards()
      .pipe(
        switchMap((indexCards) => {
          const indexItems = indexCards.items || [];
          const uniqueIndexItems = indexItems.filter(
            (item, index, arr) =>
              arr.findIndex((candidate) => candidate.symbol === item.symbol) === index
          );
          const seriesRequests = uniqueIndexItems.length
            ? forkJoin(uniqueIndexItems.map((item) => this.api.getLiveIndexSeries(item.symbol)))
            : of([]);
          const dailySeriesRequests = uniqueIndexItems.length
            ? forkJoin(
                uniqueIndexItems.map((item) =>
                  this.api.getLiveIndexSeries(item.symbol, { days: 30, preferDaily: true })
                )
              )
            : of([]);

          return forkJoin({
            indexCards: of(indexCards),
            hourlyTrading: this.api.getHourlyTrading(this.selectedExchange),
            stocks: this.api.getAllStocks(
              this.selectedExchange,
              this.selectedSort,
              requestedPage,
              requestedPageSize,
              this.stockSearchKeyword
            ),
            indexSeriesResponses: seriesRequests,
            dailyIndexSeriesResponses: dailySeriesRequests,
          });
        })
      )
      .subscribe({
      next: ({ indexCards, hourlyTrading, stocks, indexSeriesResponses, dailyIndexSeriesResponses }) => {
        const uniqueIndexItems = (indexCards.items || []).filter(
          (item, index, arr) =>
            arr.findIndex((candidate) => candidate.symbol === item.symbol) === index
        );
        const seriesMap = new Map<string, LiveIndexSeriesItem[]>();
        const dailySeriesMap = new Map<string, LiveIndexSeriesItem[]>();
        indexSeriesResponses.forEach((response, index) => {
          const symbol = uniqueIndexItems[index]?.symbol;
          if (symbol) {
            seriesMap.set(symbol, response.items || []);
          }
        });
        dailyIndexSeriesResponses.forEach((response, index) => {
          const symbol = uniqueIndexItems[index]?.symbol;
          if (symbol) {
            dailySeriesMap.set(symbol, response.items || []);
          }
        });

        this.lastUpdatedText = this.pickLastUpdatedText(indexCards.capturedAt, stocks.capturedAt);
        this.availableIndices = uniqueIndexItems.map((item) => ({
          symbol: item.symbol,
          exchange: item.exchange,
        }));

        if (
          this.selectedIndexView !== 'ALL' &&
          !this.availableIndices.some((item) => item.symbol === this.selectedIndexView)
        ) {
          this.selectedIndexView = 'ALL';
        }

        this.indexCards = uniqueIndexItems.map((item) =>
          this.toIndexCardVm(item, seriesMap.get(item.symbol) || [])
        );
        this.dailyIndexSeriesMap = dailySeriesMap;

        this.hourlyTrading = this.resolveMarketHourlySeries(hourlyTrading.items || []);

        const nextStocks = (stocks.items || []).map((x) => this.toStockVm(x));
        const universeStocks = usingFullUniverse
          ? [...nextStocks].sort((a, b) => a.symbol.localeCompare(b.symbol))
          : nextStocks;
        const refinedStocks = usingKeywordSearch
          ? this.refineStocksByKeyword(universeStocks, normalizedKeyword)
          : universeStocks;
        const pagedStocks = (usingKeywordSearch || usingFullUniverse)
          ? refinedStocks.slice(
              (this.currentStockPage - 1) * this.stockPageSize,
              this.currentStockPage * this.stockPageSize
            )
          : refinedStocks;

        this.topStocks = pagedStocks;
        this.totalStockCount = (usingKeywordSearch || usingFullUniverse) ? refinedStocks.length : (stocks.total || 0);

        if (this.currentStockPage > this.totalStockPages && this.totalStockCount > 0) {
          this.currentStockPage = this.totalStockPages;
          this.refreshBoard(forceResetSymbol);
          return;
        }

        const strongestByVolume = this.pickStrongestSymbolByVolume(nextStocks);

        if (
          forceResetSymbol ||
          !this.selectedSymbol
        ) {
          this.selectedSymbol = this.resolvePreferredSelectedSymbol(strongestByVolume || nextStocks[0]?.symbol || '');
        }

        if (this.selectedSymbol) {
          this.loadSelectedSymbol();
        } else {
          this.selectedQuote = null;
          this.selectedHourly = [];
          this.scheduleRender(50);
        }

        this.boardLoading = false;
        this.scheduleRender(50);
      },
      error: () => {
        this.boardLoading = false;
      },
    });
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
        this.selectedQuote = quote.quote ?? this.buildFallbackQuote(this.selectedSymbol);
        this.selectedHourly = (hourly.items || []).sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );
        this.symbolLoading = false;
        this.scheduleRender(50);
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

  private toIndexCardVm(
    item: LiveIndexCardItem,
    seriesItems: LiveIndexSeriesItem[]
  ): IndexCardVm {
    const points = this.buildIndexSeriesPoints(seriesItems);
    const latestPoint = points.length ? points[points.length - 1] : null;
    const prevPoint = points.length > 1 ? points[points.length - 2] : null;

    const currentValue = this.numOrNull(item.close) ?? latestPoint?.y ?? null;
    const prevValue = prevPoint?.y ?? null;

    let changeValue = this.numOrNull(item.change_value);
    let changePercent = this.numOrNull(item.change_percent);

    if (changeValue === null && currentValue !== null && prevValue !== null) {
      changeValue = currentValue - prevValue;
    }

    if (
      changePercent === null &&
      changeValue !== null &&
      prevValue !== null &&
      prevValue !== 0
    ) {
      changePercent = (changeValue / prevValue) * 100;
    }

    const up = (changeValue ?? 0) >= 0;
    const baseValue = prevValue;
    const baseLinePoints =
      baseValue !== null
        ? points.map((p) => ({ x: p.x, y: baseValue }))
        : [];

    return {
      symbol: item.symbol,
      exchange: item.exchange,
      displayName: this.indexDisplayName(item.exchange, item.symbol),
      valueText: this.formatPriceValue(currentValue),
      changeText: this.formatSignedPrice(changeValue),
      percentText: this.formatPercent(changePercent),
      volumeText: this.formatNumber(item.volume),
      tradingValueText: this.formatMoney(item.trading_value),
      highText: this.formatPriceValue(item.high),
      lowText: this.formatPriceValue(item.low),
      updatedText: this.resolveLastUpdated(item.updated_at),
      up,
      chartId: `index-chart-${item.symbol.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      seriesPoints: points,
      baseLinePoints,
      baseValue,
      mode: this.detectSeriesMode(seriesItems),
    };
  }

  private resolveMarketHourlySeries(hourlyItems: LiveHourlyTradingItem[]): LiveHourlyTradingItem[] {
    const sortedHourly = [...hourlyItems].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    if (sortedHourly.length) {
      return sortedHourly;
    }

    const focusSeries = this.focusIndexCard?.seriesPoints || [];
    return focusSeries.map((point) => ({
      time: new Date(point.x).toISOString(),
      volume: null,
      tradingValue: point.y,
      pointCount: null,
      symbolCount: 1,
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

  private resolvePreferredSelectedSymbol(preferredSymbol?: string): string {
    const preferred = preferredSymbol?.toUpperCase();
    if (preferred) {
      const preferredItem = this.topStocks.find((item) => item.symbol === preferred);
      if (this.hasStockData(preferredItem)) {
        return preferred;
      }
    }

    const firstWithData = this.topStocks.find((item) => this.hasStockData(item));
    return firstWithData?.symbol || preferred || '';
  }

  private buildFallbackQuote(symbol: string): LiveSymbolQuote | null {
    const stock = this.topStocks.find((item) => item.symbol === symbol);
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

  private toStockVm(item: LiveStockItem): StockVm {
    const up = (item.changeValue ?? 0) >= 0;
    return {
      rank: item.rank,
      symbol: item.symbol,
      exchange: item.exchange,
      name: item.name,
      priceText: this.formatPriceValue(item.price),
      changeText: this.formatSignedPrice(item.changeValue),
      percentText: this.formatPercent(item.changePercent),
      volumeText: this.formatNumber(item.volume),
      tradingValueText: this.formatMoney(item.tradingValue),
      up,
      raw: item,
    };
  }

  private buildIndexSeriesPoints(seriesItems: LiveIndexSeriesItem[]): IndexSeriesVm[] {
    return (seriesItems || [])
      .map((x) => {
        const ts = this.safeTimeToMs(x.time);
        const value = this.numOrNull(x.close) ?? this.numOrNull(x.value);
        return ts !== null && value !== null ? { x: ts, y: value } : null;
      })
      .filter((x): x is IndexSeriesVm => !!x)
      .sort((a, b) => a.x - b.x);
  }

  private detectSeriesMode(seriesItems: LiveIndexSeriesItem[]): 'intraday' | 'daily' {
    const first = (seriesItems || []).find((x) => !!x.time);
    const raw = String(first?.time || '');
    return raw.includes('T') || raw.includes(':') ? 'intraday' : 'daily';
  }

  private pickLastUpdatedText(indexCapturedAt: string | null, stockCapturedAt: string | null): string {
    const stockText = this.formatLastUpdatedDirect(stockCapturedAt);
    if (stockText !== '--') return stockText;

    const indexText = this.formatLastUpdatedDirect(indexCapturedAt);
    if (indexText !== '--') return indexText;

    return '--';
  }

  private pickStrongestSymbolByVolume(items: StockVm[]): string {
    if (!items.length) return '';
    const sorted = [...items].sort(
      (a, b) => this.num(b.raw.volume) - this.num(a.raw.volume)
    );
    return sorted[0]?.symbol || '';
  }

  private scheduleRender(delay = 80): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
    }

    this.renderTimer = setTimeout(() => {
      this.renderCharts();
    }, delay);
  }

  private renderCharts(): void {
    if (typeof ApexCharts === 'undefined') return;
    this.destroyCharts();
    this.renderIndexMiniCharts();
    this.renderFlowCharts();
    this.renderSymbolDetailChart();
  }

  private refineStocksByKeyword(items: StockVm[], normalizedKeyword: string): StockVm[] {
    if (!normalizedKeyword) {
      return items;
    }

    const symbolExact = items.filter((item) => item.symbol.toUpperCase() === normalizedKeyword);
    if (symbolExact.length) {
      return symbolExact;
    }

    const symbolPrefix = items.filter((item) => item.symbol.toUpperCase().startsWith(normalizedKeyword));
    if (symbolPrefix.length) {
      return symbolPrefix;
    }

    return items.filter((item) => {
      const name = (item.name || '').trim().toUpperCase();
      if (!name || name === item.symbol.toUpperCase()) {
        return false;
      }
      return name.includes(normalizedKeyword);
    });
  }

  private destroyCharts(): void {
    this.miniIndexCharts.forEach((chart) => {
      try {
        chart.destroy();
      } catch {}
    });
    this.miniIndexCharts = [];

    this.flowCharts.forEach((chart) => {
      try {
        chart.destroy();
      } catch {}
    });
    this.flowCharts = [];
    try {
      this.symbolChart?.destroy();
    } catch {}

    this.symbolChart = null;
  }

  private renderIndexMiniCharts(): void {
    this.filteredIndexCards.forEach((item) => {
      const element = document.getElementById(item.chartId);
      if (!element || !item.seriesPoints.length) return;

      const minX = item.seriesPoints[0].x;
      const maxX = item.seriesPoints[item.seriesPoints.length - 1].x;

      const chart = new ApexCharts(element, {
        chart: {
          type: 'line',
          height: 160,
          toolbar: { show: false },
          zoom: { enabled: false },
          animations: { enabled: false },
          fontFamily: 'inherit',
        },
        series: [
          {
            name: item.displayName,
            data: item.seriesPoints,
          },
          {
            name: 'Reference',
            data: item.baseLinePoints,
          },
        ],
        colors: [item.up ? '#00b050' : '#de4455', '#d7b53b'],
        stroke: {
          curve: 'straight',
          width: [2.2, 1.2],
          dashArray: [0, 4],
        },
        markers: {
          size: 0,
          hover: {
            size: 5,
          },
        },
        dataLabels: {
          enabled: false,
        },
        fill: {
          type: 'solid',
          opacity: [0.15, 0],
        },
        grid: {
          borderColor: '#edf0f5',
          strokeDashArray: 2,
        },
        legend: {
          show: false,
        },
        xaxis: {
          type: 'datetime',
          min: minX,
          max: maxX,
          tickAmount: item.mode === 'intraday' ? 6 : 4,
          labels: {
            datetimeUTC: false,
            formatter: (_: string, timestamp?: number) =>
              item.mode === 'intraday'
                ? this.formatTimeLabel(timestamp ?? 0)
                : this.formatDateLabel(timestamp ?? 0),
            style: {
              colors: '#8a94a6',
              fontSize: '11px',
            },
            hideOverlappingLabels: true,
          },
          axisBorder: { show: false },
          axisTicks: { show: false },
        },
        yaxis: {
          labels: {
            style: {
              colors: '#8a94a6',
              fontSize: '11px',
            },
            formatter: (value: number) => value.toLocaleString('en-US'),
          },
        },
        tooltip: {
          shared: true,
          intersect: false,
          x: {
            formatter: (value: number) =>
              item.mode === 'intraday'
                ? this.formatTimeLabelHms(value)
                : this.formatDateTimeFull(value, false),
          },
          y: {
            formatter: (value: number, opts: any) => {
              const seriesIndex = opts?.seriesIndex ?? 0;
              if (seriesIndex === 1) {
                return `Mốc tham chiếu: ${this.formatPriceValue(value)}`;
              }

              const base = item.baseValue;

              let diff: number | null = null;
              let pct: number | null = null;

              if (base !== null && base !== 0) {
                diff = value - base;
                pct = (diff / base) * 100;
              }

              const price = this.formatPriceValue(value);
              const diffText = this.formatSignedPrice(diff);
              const pctText = this.formatPercent(pct);

              return `${price} (${diffText} / ${pctText})`;
            },
          },
        },
      });

      chart.render();
      this.miniIndexCharts.push(chart);
    });
  }

  private renderFlowCharts(): void {
    this.renderSingleFlowChart('chart-hourly-trading-day', 'day');
    this.renderSingleFlowChart('chart-hourly-trading-week', 'week');
    this.renderSingleFlowChart('chart-hourly-trading-ten-days', 'tenDays');
  }

  private renderSingleFlowChart(elementId: string, range: FlowRange): void {
    const element = document.getElementById(elementId);
    if (!element) return;

    const points =
      range === 'day'
        ? this.hourlyTrading
            .filter((item) => item.time)
            .map((item) => ({
              x: new Date(item.time).getTime(),
              y:
                this.selectedMetric === 'volume'
                  ? this.num(item.volume)
                  : this.num(item.tradingValue),
            }))
            .sort((a, b) => a.x - b.x)
        : this.buildFlowDailyPoints(range);

    const chartTitle =
      this.selectedMetric === 'volume'
        ? `Khoi luong giao dich ${this.getFlowRangeLabel(range).toLowerCase()}`
        : `Gia tri giao dich ${this.getFlowRangeLabel(range).toLowerCase()}`;

    const sessionAnnotations = range === 'day' ? this.buildTradingSessionAnnotations(this.hourlyTrading) : [];
    const useTimeLabels = range === 'day';

    const chart = new ApexCharts(element, {
      chart: {
        type: 'line',
        height: 300,
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: false },
        fontFamily: 'inherit',
      },
      series: [
        {
          name: chartTitle,
          data: points,
        },
      ],
      annotations: {
        xaxis: sessionAnnotations,
      },
      stroke: {
        curve: 'straight',
        width: 2.5,
      },
      markers: {
        size: 3,
        hover: {
          size: 5,
        },
      },
      colors: ['#2d6cdf'],
      dataLabels: {
        enabled: false,
      },
      grid: {
        borderColor: '#e8edf5',
        strokeDashArray: 4,
      },
      xaxis: {
        type: 'datetime',
        labels: {
          datetimeUTC: false,
          formatter: (_: string, timestamp?: number) =>
            useTimeLabels ? this.formatTimeLabel(timestamp ?? 0) : this.formatDateLabel(timestamp ?? 0),
          style: {
            colors: '#7a8699',
            fontSize: '11px',
          },
          hideOverlappingLabels: true,
        },
      },
      yaxis: {
        labels: {
          formatter: (value: number) =>
            this.selectedMetric === 'volume'
              ? this.formatAxisNumber(value)
              : this.formatAxisMoney(value),
          style: {
            colors: '#7a8699',
            fontSize: '11px',
          },
        },
      },
      tooltip: {
        shared: false,
        intersect: false,
        x: {
          formatter: (value: number) =>
            useTimeLabels ? this.formatTimeLabelHms(value) : this.formatDateTimeFull(value, false),
        },
        y: {
          formatter: (value: number) =>
            this.selectedMetric === 'volume'
              ? this.formatAxisNumber(value)
              : this.formatAxisMoney(value),
        },
      },
      legend: {
        show: false,
      },
    });

    chart.render();
    this.flowCharts.push(chart);
  }

  private getFlowRangeLabel(range: FlowRange): string {
    if (range === 'week') return 'Tuan';
    if (range === 'tenDays') return '10 ngay';
    return 'Ngay';
  }

  get flowRangeLabel(): string {
    return this.getFlowRangeLabel(this.selectedFlowRange);
  }

  private renderFlowChart(): void {
    const element = document.getElementById('chart-hourly-trading');
    if (!element) return;

    const points =
      this.selectedFlowRange === 'day'
        ? this.hourlyTrading
            .filter((item) => item.time)
            .map((item) => ({
              x: new Date(item.time).getTime(),
              y:
                this.selectedMetric === 'volume'
                  ? this.num(item.volume)
                  : this.num(item.tradingValue),
            }))
            .sort((a, b) => a.x - b.x)
        : this.buildFlowDailyPoints(this.selectedFlowRange);

    const chartTitle =
      this.selectedMetric === 'volume'
        ? `Khoi luong giao dich ${this.flowRangeLabel.toLowerCase()}`
        : `Gia tri giao dich ${this.flowRangeLabel.toLowerCase()}`;

    const sessionAnnotations =
      this.selectedFlowRange === 'day' ? this.buildTradingSessionAnnotations(this.hourlyTrading) : [];
    const useTimeLabels = this.selectedFlowRange === 'day';

    this.hourlyChart = new ApexCharts(element, {
      chart: {
        type: 'line',
        height: 360,
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: false },
        fontFamily: 'inherit',
      },
      series: [
        {
          name: chartTitle,
          data: points,
        },
      ],
      annotations: {
        xaxis: sessionAnnotations,
      },
      stroke: {
        curve: 'straight',
        width: 2.5,
      },
      markers: {
        size: 3,
        hover: {
          size: 5,
        },
      },
      colors: ['#2d6cdf'],
      dataLabels: {
        enabled: false,
      },
      grid: {
        borderColor: '#e8edf5',
        strokeDashArray: 4,
      },
      xaxis: {
        type: 'datetime',
        labels: {
          datetimeUTC: false,
          formatter: (_: string, timestamp?: number) =>
            useTimeLabels ? this.formatTimeLabel(timestamp ?? 0) : this.formatDateLabel(timestamp ?? 0),
          style: {
            colors: '#7a8699',
            fontSize: '11px',
          },
          hideOverlappingLabels: true,
        },
      },
      yaxis: {
        labels: {
          formatter: (value: number) =>
            this.selectedMetric === 'volume'
              ? this.formatAxisNumber(value)
              : this.formatAxisMoney(value),
          style: {
            colors: '#7a8699',
            fontSize: '11px',
          },
        },
      },
      tooltip: {
        shared: false,
        intersect: false,
        x: {
          formatter: (value: number) =>
            useTimeLabels ? this.formatTimeLabelHms(value) : this.formatDateTimeFull(value, false),
        },
        y: {
          formatter: (value: number) =>
            this.selectedMetric === 'volume'
              ? this.formatAxisNumber(value)
              : this.formatAxisMoney(value),
        },
      },
      legend: {
        show: false,
      },
    });

    this.hourlyChart.render();
  }

  private buildFlowDailyPoints(range: FlowRange): IndexSeriesVm[] {
    const symbol = this.flowFocusSymbol;
    const source = this.dailyIndexSeriesMap.get(symbol) || [];
    const length = range === 'week' ? 7 : 10;

    return source
      .map((item) => {
        const ts = this.safeTimeToMs(item.time);
        const value =
          this.selectedMetric === 'volume'
            ? this.numOrNull(item.volume)
            : this.numOrNull(item.value);
        return ts !== null && value !== null ? { x: ts, y: value } : null;
      })
      .filter((item): item is IndexSeriesVm => !!item)
      .sort((a, b) => a.x - b.x)
      .slice(-length);
  }

  private renderFlowChartLegacy(): void {
    const element = document.getElementById('chart-hourly-trading');
    if (!element) return;

    const points = this.hourlyTrading
      .filter((item) => item.time)
      .map((item) => ({
        x: new Date(item.time).getTime(),
        y:
          this.selectedMetric === 'volume'
            ? this.num(item.volume)
            : this.num(item.tradingValue),
      }))
      .sort((a, b) => a.x - b.x);

    const chartTitle =
      this.selectedMetric === 'volume'
        ? 'Khối lượng giao dịch theo thời gian'
        : 'Giá trị giao dịch theo thời gian';

    const sessionAnnotations = this.buildTradingSessionAnnotations(this.hourlyTrading);

    this.hourlyChart = new ApexCharts(element, {
      chart: {
        type: 'line',
        height: 360,
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: false },
        fontFamily: 'inherit',
      },
      series: [
        {
          name: chartTitle,
          data: points,
        },
      ],
      annotations: {
        xaxis: sessionAnnotations,
      },
      stroke: {
        curve: 'straight',
        width: 2.5,
      },
      markers: {
        size: 3,
        hover: {
          size: 5,
        },
      },
      colors: ['#2d6cdf'],
      dataLabels: {
        enabled: false,
      },
      grid: {
        borderColor: '#e8edf5',
        strokeDashArray: 4,
      },
      xaxis: {
        type: 'datetime',
        labels: {
          datetimeUTC: false,
          formatter: (_: string, timestamp?: number) => this.formatTimeLabel(timestamp ?? 0),
          style: {
            colors: '#7a8699',
            fontSize: '11px',
          },
          hideOverlappingLabels: true,
        },
      },
      yaxis: {
        labels: {
          formatter: (value: number) =>
            this.selectedMetric === 'volume'
              ? this.formatAxisNumber(value)
              : this.formatAxisMoney(value),
          style: {
            colors: '#7a8699',
            fontSize: '11px',
          },
        },
      },
      tooltip: {
        shared: false,
        intersect: false,
        x: {
          formatter: (value: number) => this.formatTimeLabelHms(value),
        },
        y: {
          formatter: (value: number) =>
            this.selectedMetric === 'volume'
              ? this.formatAxisNumber(value)
              : this.formatAxisMoney(value),
        },
      },
      legend: {
        show: false,
      },
    });

    this.hourlyChart.render();
  }

  private renderSymbolDetailChart(): void {
    const element = document.getElementById('chart-symbol-detail');
    if (!element || !this.selectedHourly.length) return;

    const closeSeries = this.selectedHourly.map((item) => ({
      x: new Date(item.time).getTime(),
      y: this.num(item.close),
    }));

    const sessionAnnotations = this.buildTradingSessionAnnotations(this.selectedHourly);

    this.symbolChart = new ApexCharts(element, {
      chart: {
        height: 360,
        type: 'area',
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
      annotations: {
        xaxis: sessionAnnotations,
      },
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
        hover: {
          size: 5,
        },
      },
      dataLabels: {
        enabled: false,
      },
      grid: {
        borderColor: '#e8edf5',
        strokeDashArray: 4,
      },
      xaxis: {
        type: 'datetime',
        labels: {
          datetimeUTC: false,
          formatter: (_: string, timestamp?: number) => this.formatTimeLabel(timestamp ?? 0),
          style: {
            colors: '#7a8699',
            fontSize: '11px',
          },
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
          formatter: (value: number) => this.formatTimeLabelHms(value),
        },
        y: {
          formatter: (value: number) => this.formatPrice(value),
        },
      },
      legend: {
        show: false,
      },
    });

    this.symbolChart.render();
  }

  private buildTradingSessionAnnotations(
    items: Array<{ time: string }>
  ): Array<Record<string, any>> {
    const baseDate = items.length ? new Date(items[0].time) : new Date();
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const day = baseDate.getDate();

    const morningStart = new Date(year, month, day, 9, 0, 0, 0).getTime();
    const morningEnd = new Date(year, month, day, 11, 30, 0, 0).getTime();
    const afternoonStart = new Date(year, month, day, 13, 0, 0, 0).getTime();
    const afternoonEnd = new Date(year, month, day, 15, 0, 0, 0).getTime();

    return [
      {
        x: morningStart,
        x2: morningEnd,
        fillColor: 'rgba(45, 108, 223, 0.06)',
        borderColor: 'transparent',
        label: {
          text: 'Phiên sáng',
          style: {
            background: '#2d6cdf',
            color: '#fff',
            fontSize: '10px',
          },
        },
      },
      {
        x: afternoonStart,
        x2: afternoonEnd,
        fillColor: 'rgba(15, 157, 88, 0.05)',
        borderColor: 'transparent',
        label: {
          text: 'Phiên chiều',
          style: {
            background: '#0f9d58',
            color: '#fff',
            fontSize: '10px',
          },
        },
      },
    ];
  }

  get selectedSymbolDisplay(): string {
    return this.selectedSymbol || '--';
  }

  get selectedPriceText(): string {
    return this.formatPriceValue(this.selectedQuote?.price);
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
    return (this.selectedQuote?.changeValue ?? 0) >= 0;
  }

  get financialHighlights() {
    return this.financialOverview?.highlights || [];
  }

  get financialSections() {
    return this.financialOverview?.sections || [];
  }

  private indexDisplayName(exchange: string, symbol: string): string {
    if (symbol) return symbol;
    return symbol;
  }

  private resolveLastUpdated(value: string | null | undefined): string {
    if (!value) return '--';

    const raw = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return this.lastUpdatedText !== '--' ? this.lastUpdatedText : 'Cuối ngày';
    }

    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '--';

    const hh = `${d.getHours()}`.padStart(2, '0');
    const mm = `${d.getMinutes()}`.padStart(2, '0');
    const ss = `${d.getSeconds()}`.padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  private formatLastUpdatedDirect(value: string | null | undefined): string {
    if (!value) return '--';

    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return '--';
    }

    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '--';

    const hh = `${d.getHours()}`.padStart(2, '0');
    const mm = `${d.getMinutes()}`.padStart(2, '0');
    const ss = `${d.getSeconds()}`.padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  private safeTimeToMs(value: string | null | undefined): number | null {
    if (!value) return null;

    const raw = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-').map((x) => Number(x));
      return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
    }

    const parsed = new Date(raw).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  private formatTimeLabel(value: number): string {
    const d = new Date(value);
    const hh = `${d.getHours()}`.padStart(2, '0');
    const mm = `${d.getMinutes()}`.padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private formatTimeLabelHms(value: number): string {
    const d = new Date(value);
    const hh = `${d.getHours()}`.padStart(2, '0');
    const mm = `${d.getMinutes()}`.padStart(2, '0');
    const ss = `${d.getSeconds()}`.padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  private formatDateLabel(value: number): string {
    const d = new Date(value);
    const dd = `${d.getDate()}`.padStart(2, '0');
    const mm = `${d.getMonth() + 1}`.padStart(2, '0');
    return `${dd}/${mm}`;
  }

  private formatDateTimeFull(value: number, includeTime = true): string {
    const d = new Date(value);
    const dd = `${d.getDate()}`.padStart(2, '0');
    const mm = `${d.getMonth() + 1}`.padStart(2, '0');
    const yyyy = d.getFullYear();

    if (!includeTime) {
      return `${dd}/${mm}/${yyyy}`;
    }

    const hh = `${d.getHours()}`.padStart(2, '0');
    const mi = `${d.getMinutes()}`.padStart(2, '0');
    const ss = `${d.getSeconds()}`.padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
  }

  private formatPriceValue(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    return Number(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private formatPrice(value: number | null | undefined): string {
    return this.formatPriceValue(value);
  }

  private formatSignedPrice(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    const number = Number(value);
    const text = Math.abs(number).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${number >= 0 ? '+' : '-'}${text}`;
  }

  private formatPercent(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    const number = Number(value);
    return `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`;
  }

  private formatNumber(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    return Number(value).toLocaleString('en-US', {
      maximumFractionDigits: 0,
    });
  }

  private formatMoney(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    const number = Number(value);
    if (Math.abs(number) >= 1_000_000_000) {
      return `${(number / 1_000_000_000).toFixed(2)}B`;
    }
    if (Math.abs(number) >= 1_000_000) {
      return `${(number / 1_000_000).toFixed(2)}M`;
    }
    return number.toLocaleString('en-US', {
      maximumFractionDigits: 0,
    });
  }

  private formatAxisNumber(value: number): string {
    if (Math.abs(value) >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1_000) {
      return `${(value / 1_000).toFixed(0)}K`;
    }
    return `${Math.round(value)}`;
  }

  private formatAxisMoney(value: number): string {
    if (Math.abs(value) >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(1)}B`;
    }
    if (Math.abs(value) >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    return `${Math.round(value)}`;
  }

  private num(value: number | null | undefined): number {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return 0;
    return Number(value);
  }

  private numOrNull(value: number | null | undefined): number | null {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
    return Number(value);
  }
}
