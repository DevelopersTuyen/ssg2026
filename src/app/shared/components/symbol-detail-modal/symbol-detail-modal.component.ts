import { AfterViewInit, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { Subscription, forkJoin } from 'rxjs';
import { AppI18nService } from 'src/app/core/i18n/app-i18n.service';
import {
  FinancialOverviewResponse,
  FinancialStatementRow,
  FinancialStatementSection,
  LiveSymbolHourlyItem,
  LiveSymbolQuote,
  MarketCandleItem,
  MarketDataQualityIssue,
  MarketExchangeRule,
  MarketIntradayPoint,
  MarketSymbolListItem,
  MarketApiService,
  StrategyFormulaVerdict,
  SymbolNewsItem,
  SymbolNewsResponse,
} from 'src/app/core/services/market-api.service';

declare const ApexCharts: any;

let symbolModalChartCounter = 0;

type SymbolDetailTab = 'overview' | 'news' | 'history' | 'intelligence' | 'formula' | 'financial-analysis' | 'financial';
type SymbolDetailFinancialMetricKind = 'revenue' | 'profit';

interface SymbolDetailFormulaMetric {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'danger' | 'warning' | string;
}

interface SymbolDetailFormulaItem {
  key: string;
  label: string;
  expression: string;
  detail: string;
  status: 'pass' | 'fail' | 'warn' | 'na' | string;
  kind: string;
}

interface SymbolDetailFormulaGroup {
  title: string;
  items: SymbolDetailFormulaItem[];
}

interface SymbolDetailDecisionColumns {
  passItems: SymbolDetailFormulaItem[];
  failItems: SymbolDetailFormulaItem[];
  neutralItems: SymbolDetailFormulaItem[];
}

interface SymbolDetailFailItem extends SymbolDetailFormulaItem {
  groupTitle: string;
}

interface SymbolDetailHistoryItem {
  key: string;
  kind: 'journal' | 'workflow' | string;
  title: string;
  subtitle: string;
  body?: string;
  meta: string[];
  tone?: 'default' | 'positive' | 'warning' | 'danger' | string;
}

interface SymbolDetailIntelligenceView {
  summary: string;
  biasLabel: string;
  actionLabel: string;
  riskLabel: string;
  confidenceLabel: string;
  bullCase: string[];
  bearCase: string[];
  riskItems: string[];
  actionItems: string[];
}

interface SymbolDetailFinancialChartPoint {
  label: string;
  shortLabel: string;
  value: number | null;
  displayText: string;
  barHeight: number;
}

interface SymbolDetailFinancialSeriesVm {
  title: string;
  latestLabel: string;
  latestValue: string;
  unitLabel: string;
  points: SymbolDetailFinancialChartPoint[];
}

interface SymbolDetailFinancialMetricItemVm {
  label: string;
  value: string;
}

interface SymbolDetailFinancialMetricGroupVm {
  title: string;
  items: SymbolDetailFinancialMetricItemVm[];
}

interface SymbolDetailFinancialAnalysisVm {
  revenueQuarterly: SymbolDetailFinancialSeriesVm | null;
  revenueYearly: SymbolDetailFinancialSeriesVm | null;
  profitQuarterly: SymbolDetailFinancialSeriesVm | null;
  profitYearly: SymbolDetailFinancialSeriesVm | null;
  metricGroups: SymbolDetailFinancialMetricGroupVm[];
}

@Component({
  selector: 'app-symbol-detail-modal',
  templateUrl: './symbol-detail-modal.component.html',
  styleUrls: ['./symbol-detail-modal.component.scss'],
  standalone: false,
})
export class SymbolDetailModalComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() open = false;
  @Input() symbol = '';
  @Input() showFormulaButton = false;
  @Input() formulaLoading = false;
  @Input() formulaError = '';
  @Input() formulaMetrics: SymbolDetailFormulaMetric[] = [];
  @Input() formulaGroups: SymbolDetailFormulaGroup[] = [];
  @Input() formulaVerdict: StrategyFormulaVerdict | null = null;
  @Input() formulaEmptyCopy = '';
  @Input() historyItems: SymbolDetailHistoryItem[] = [];
  @Input() intelligenceView: SymbolDetailIntelligenceView | null = null;
  @Input() historyLoading = false;
  @Input() historyError = '';
  @Output() closed = new EventEmitter<void>();

  readonly financialPreviewRowCount = 12;
  readonly chartHostId = `symbol-detail-chart-${++symbolModalChartCounter}`;

  selectedQuote: LiveSymbolQuote | null = null;
  selectedHourly: LiveSymbolHourlyItem[] = [];
  selectedCandles: MarketCandleItem[] = [];
  selectedIntraday: MarketIntradayPoint[] = [];
  selectedSymbolMaster: MarketSymbolListItem | null = null;
  exchangeRule: MarketExchangeRule | null = null;
  dataQualityIssues: MarketDataQualityIssue[] = [];
  symbolNews: SymbolNewsItem[] = [];
  symbolNewsMeta: SymbolNewsResponse | null = null;
  financialOverview: FinancialOverviewResponse | null = null;
  financialAnalysis: SymbolDetailFinancialAnalysisVm | null = null;
  symbolLoading = false;
  financialLoading = false;
  selectedTab: SymbolDetailTab = 'overview';
  selectedFinancialMetric: SymbolDetailFinancialMetricKind = 'revenue';

  private symbolSub?: Subscription;
  private financialSub?: Subscription;
  private chart: any;
  private financialRequestedSymbol = '';
  private financialExpandedSections: Record<string, boolean> = {};
  private renderTimer?: number;

  constructor(
    private readonly api: MarketApiService,
    private readonly i18n: AppI18nService
  ) {}

  ngAfterViewInit(): void {
    this.scheduleChartRender();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && !this.open) {
      this.destroyChart();
      this.selectedTab = 'overview';
      this.selectedFinancialMetric = 'revenue';
      return;
    }

    if ((changes['open'] || changes['symbol']) && this.open && this.normalizedSymbol) {
      this.selectedTab = 'overview';
      this.loadSelectedSymbol();
    }
  }

  ngOnDestroy(): void {
    this.symbolSub?.unsubscribe();
    this.financialSub?.unsubscribe();
    this.destroyChart();
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
    }
  }

  get normalizedSymbol(): string {
    return (this.symbol || '').trim().toUpperCase();
  }

  get selectedSymbolDisplay(): string {
    return this.normalizedSymbol || '--';
  }

  get symbolDetailTabs(): Array<{ key: SymbolDetailTab; labelKey: string }> {
    const tabs: Array<{ key: SymbolDetailTab; labelKey: string }> = [
      { key: 'overview', labelKey: 'marketWatch.detailTab.overview' },
      { key: 'news', labelKey: 'marketWatch.detailTab.news' },
    ];

    if (this.historyLoading || this.historyError || this.historyItems.length) {
      tabs.push({ key: 'history', labelKey: 'dashboardV2.workspace.history' });
    }

    if (this.intelligenceView) {
      tabs.push({ key: 'intelligence', labelKey: 'marketWatch.detailTab.intelligence' });
    }

    if (this.showFormulaButton) {
      tabs.push({ key: 'formula', labelKey: 'marketWatch.detailTab.formula' });
    }

    tabs.push({ key: 'financial-analysis', labelKey: 'marketWatch.detailTab.financialAnalysis' });
    tabs.push({ key: 'financial', labelKey: 'marketWatch.detailTab.financial' });
    return tabs;
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

  get chartSourceText(): string {
    if (this.selectedIntraday.length) {
      const latest = this.selectedIntraday[this.selectedIntraday.length - 1];
      return `Intraday tick / ${this.selectedIntraday.length} điểm / cập nhật ${this.formatTimeHms(new Date(latest.time).getTime())}`;
    }
    if (this.selectedCandles.length) {
      const latest = this.selectedCandles[this.selectedCandles.length - 1];
      return `Candle 5m / ${this.selectedCandles.length} nến / cập nhật ${this.formatDateTime(latest?.computed_at || latest?.time)}`;
    }
    if (this.selectedHourly.length) {
      return `Hourly fallback / ${this.selectedHourly.length} điểm`;
    }
    return 'Chưa có dữ liệu chart';
  }

  get exchangeContextText(): string {
    if (!this.exchangeRule) {
      return 'Chưa có rule sàn';
    }
    return `${this.resolveCurrentSession(this.exchangeRule)} / Biên độ ${this.exchangeRule.price_limit_percent || '--'}% / Lot ${this.exchangeRule.lot_size}`;
  }

  get masterDataText(): string {
    const master = this.selectedSymbolMaster;
    if (!master) {
      return 'Chưa có master data';
    }
    const industry = master.industry || master.sector || 'Chưa có ngành';
    const cap = this.formatMoney(master.market_cap);
    const status = master.trading_status || (master.is_active === false ? 'inactive' : 'active');
    return `${industry} / vốn hóa ${cap} / ${status}`;
  }

  get dataQualityText(): string {
    if (!this.dataQualityIssues.length) {
      return 'Không có lỗi dữ liệu mở';
    }
    const critical = this.dataQualityIssues.filter((issue) => issue.severity === 'critical').length;
    return critical
      ? `${critical} lỗi critical, cần kiểm tra trước khi ra quyết định`
      : `${this.dataQualityIssues.length} cảnh báo dữ liệu`;
  }

  get newsSummaryText(): string {
    if (!this.symbolNews.length) {
      return 'Chưa phát hiện tin liên quan gần đây';
    }
    return `${this.symbolNews.length} tin liên quan tới mã này`;
  }

  get financialHighlights() {
    return this.financialOverview?.highlights || [];
  }

  get financialSections() {
    return this.financialOverview?.sections || [];
  }

  get financialSyncStatus() {
    return this.financialOverview?.syncStatus || null;
  }

  get financialQuarterlySeries(): SymbolDetailFinancialSeriesVm | null {
    if (!this.financialAnalysis) {
      return null;
    }
    return this.selectedFinancialMetric === 'revenue'
      ? this.financialAnalysis.revenueQuarterly
      : this.financialAnalysis.profitQuarterly;
  }

  get financialYearlySeries(): SymbolDetailFinancialSeriesVm | null {
    if (!this.financialAnalysis) {
      return null;
    }
    return this.selectedFinancialMetric === 'revenue'
      ? this.financialAnalysis.revenueYearly
      : this.financialAnalysis.profitYearly;
  }

  get financialMetricGroups(): SymbolDetailFinancialMetricGroupVm[] {
    return this.financialAnalysis?.metricGroups || [];
  }

  isTab(tab: SymbolDetailTab): boolean {
    return this.selectedTab === tab;
  }

  changeTab(tab: SymbolDetailTab): void {
    this.selectedTab = tab;
    if ((tab === 'financial' || tab === 'financial-analysis') && this.normalizedSymbol) {
      this.ensureFinancialOverview(this.normalizedSymbol);
    }
  }

  changeFinancialMetric(metric: SymbolDetailFinancialMetricKind): void {
    this.selectedFinancialMetric = metric;
  }

  closeSymbolModal(): void {
    this.closed.emit();
  }

  sentimentClass(label: string | null | undefined): string {
    const normalized = (label || '').toLowerCase();
    if (normalized.includes('tích') || normalized.includes('positive')) return 'positive';
    if (normalized.includes('tiêu') || normalized.includes('negative')) return 'negative';
    return 'neutral';
  }

  impactClass(label: string | null | undefined): string {
    const normalized = (label || '').toLowerCase();
    if (normalized.includes('cao') || normalized.includes('high')) return 'high';
    if (normalized.includes('vừa') || normalized.includes('medium')) return 'medium';
    return 'low';
  }

  visibleFinancialRows(section: FinancialStatementSection): FinancialStatementRow[] {
    return this.isFinancialSectionExpanded(section.type)
      ? section.rows
      : section.rows.slice(0, this.financialPreviewRowCount);
  }

  hasFinancialRowToggle(section: FinancialStatementSection): boolean {
    return section.rows.length > this.financialPreviewRowCount;
  }

  isFinancialSectionExpanded(sectionType: string): boolean {
    return !!this.financialExpandedSections[sectionType];
  }

  toggleFinancialSection(sectionType: string): void {
    this.financialExpandedSections = {
      ...this.financialExpandedSections,
      [sectionType]: !this.financialExpandedSections[sectionType],
    };
  }

  formatFinancialCell(value: { displayValue: string; valueText: string | null }): string {
    return value?.displayValue || value?.valueText || '--';
  }

  trackByFinancialRow(_: number, row: FinancialStatementRow): string {
    return row.metricKey;
  }

  trackByFormulaItem(_: number, item: SymbolDetailFormulaItem): string {
    return item.key;
  }

  buildFormulaDecisionColumns(group: SymbolDetailFormulaGroup): SymbolDetailDecisionColumns {
    const passItems = group.items.filter((item) => item.status === 'pass');
    const failItems = group.items.filter((item) => item.status === 'fail' || item.status === 'warn');
    const neutralItems = group.items.filter((item) => item.status === 'na');
    return { passItems, failItems, neutralItems };
  }

  buildFormulaFailHighlights(groups: SymbolDetailFormulaGroup[]): SymbolDetailFailItem[] {
    const items: SymbolDetailFailItem[] = [];
    groups.forEach((group: SymbolDetailFormulaGroup) => {
      group.items
        .filter((item: SymbolDetailFormulaItem) => item.status === 'fail' || item.status === 'warn')
        .forEach((item: SymbolDetailFormulaItem) => {
          items.push({
            ...item,
            groupTitle: group.title,
          });
        });
    });
    return items;
  }

  hasDecisionItems(group: SymbolDetailFormulaGroup): boolean {
    return group.items.some((item) => item.status !== 'na');
  }

  hasNeutralItems(group: SymbolDetailFormulaGroup): boolean {
    return group.items.some((item) => item.status === 'na');
  }

  formulaStatusLabel(item: SymbolDetailFormulaItem): string {
    if (item.status === 'pass') return 'PASS';
    if (item.status === 'fail') return 'FAIL';
    if (item.status === 'warn') return 'Cần xem';
    return 'N/A';
  }

  formulaFailReason(item: SymbolDetailFormulaItem): string {
    const detail = (item.detail || '').trim();
    if (detail) {
      return detail;
    }
    if (item.status === 'warn') {
      return 'Rule đang ở trạng thái cảnh báo, chưa đủ xác nhận để pass.';
    }
    if (item.status === 'fail') {
      return 'Rule chưa đạt ngưỡng hoặc chưa thỏa điều kiện bắt buộc.';
    }
    return 'Chưa có lý do đánh giá cụ thể.';
  }

  formulaVerdictTone(verdict: StrategyFormulaVerdict | null | undefined): 'default' | 'positive' | 'warning' | 'danger' {
    if (!verdict) {
      return 'default';
    }
    if (verdict.riskLevel === 'high' || verdict.action === 'stand_aside' || verdict.action === 'take_profit') {
      return 'danger';
    }
    if (verdict.bias === 'bullish' || verdict.action === 'add_position' || verdict.action === 'candidate') {
      return 'positive';
    }
    if (verdict.bias === 'constructive' || verdict.action === 'probe_buy') {
      return 'warning';
    }
    return 'default';
  }

  formatFormulaVerdictAction(verdict: StrategyFormulaVerdict | null | undefined): string {
    const action = verdict?.action || '';
    switch (action) {
      case 'take_profit':
        return 'Take profit';
      case 'stand_aside':
        return 'Stand aside';
      case 'add_position':
        return 'Add position';
      case 'probe_buy':
        return 'Probe buy';
      case 'candidate':
        return 'Candidate';
      case 'review':
        return 'Review';
      default:
        return action || '--';
    }
  }

  intelligenceTone(value: string | null | undefined): 'default' | 'positive' | 'warning' | 'danger' {
    const normalized = (value || '').toLowerCase();
    if (normalized.includes('bull') || normalized.includes('constructive') || normalized.includes('candidate')) {
      return 'positive';
    }
    if (normalized.includes('bear') || normalized.includes('high') || normalized.includes('take profit') || normalized.includes('stand aside')) {
      return 'danger';
    }
    if (normalized.includes('review') || normalized.includes('probe')) {
      return 'warning';
    }
    return 'default';
  }

  trackByHistoryItem(_: number, item: SymbolDetailHistoryItem): string {
    return item.key;
  }

  trackByFinancialMetricGroup(_: number, item: SymbolDetailFinancialMetricGroupVm): string {
    return item.title;
  }

  private loadSelectedSymbol(): void {
    const symbol = this.normalizedSymbol;
    if (!symbol) return;

    this.symbolLoading = true;
    this.symbolSub?.unsubscribe();
    this.destroyChart();
    this.symbolNews = [];
    this.symbolNewsMeta = null;

    this.symbolSub = forkJoin({
      quote: this.api.getSymbolQuote(symbol),
      intraday: this.api.getSymbolIntraday(symbol, 2000),
      candles: this.api.getSymbolCandles(symbol, '5m', 240),
      hourly: this.api.getSymbolHourly(symbol),
      news: this.api.getSymbolNews(symbol, 20),
      master: this.api.getMarketSymbols({ keyword: symbol, pageSize: 1 }),
      rules: this.api.getExchangeRules(),
      dataQuality: this.api.getDataQualityIssues(120),
    }).subscribe({
      next: ({ quote, intraday, candles, hourly, news, master, rules, dataQuality }) => {
        this.selectedQuote = quote.quote || null;
        this.selectedIntraday = this.normalizeIntradayPoints(intraday.data || []);
        this.selectedCandles = candles.data || [];
        this.symbolNewsMeta = news;
        this.symbolNews = news?.items || [];
        this.selectedSymbolMaster = this.resolveSymbolMaster(symbol, master.data?.items || []);
        const exchange = this.selectedSymbolMaster?.exchange || quote.exchange || null;
        this.exchangeRule = this.resolveExchangeRule(exchange, rules.data || []);
        this.dataQualityIssues = (dataQuality.data || []).filter((issue) => (issue.symbol || '').toUpperCase() === symbol);
        const intradayItems = this.mapIntradayToHourly(this.selectedIntraday);
        const candleItems = this.mapCandlesToHourly(this.selectedCandles);
        this.selectedHourly = (intradayItems.length ? intradayItems : candleItems.length ? candleItems : hourly.items || []).sort(
          (left, right) => new Date(left.time).getTime() - new Date(right.time).getTime()
        );
        this.symbolLoading = false;
        this.scheduleChartRender();
      },
      error: () => {
        this.selectedQuote = null;
        this.selectedHourly = [];
        this.selectedIntraday = [];
        this.selectedCandles = [];
        this.selectedSymbolMaster = null;
        this.exchangeRule = null;
        this.dataQualityIssues = [];
        this.symbolNews = [];
        this.symbolNewsMeta = null;
        this.symbolLoading = false;
      },
    });
  }

  private normalizeIntradayPoints(points: MarketIntradayPoint[]): MarketIntradayPoint[] {
    return points
      .filter((item) => item.time && this.safeChartPrice(item.price))
      .sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
  }

  private mapIntradayToHourly(points: MarketIntradayPoint[]): LiveSymbolHourlyItem[] {
    return points.map((item, index) => {
      const close = this.safeChartPrice(item.price) || 0;
      const previous = index > 0 ? this.safeChartPrice(points[index - 1].price) : null;
      const open = previous || close;
      return {
        time: item.time,
        open,
        high: Math.max(open, close),
        low: Math.min(open, close),
        close,
        volume: item.volume,
        tradingValue: item.trading_value,
        pointCount: 1,
      };
    });
  }

  private mapCandlesToHourly(candles: MarketCandleItem[]): LiveSymbolHourlyItem[] {
    return candles.map((item) => ({
      time: item.time,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
      tradingValue: item.trading_value,
      pointCount: item.point_count,
    }));
  }

  private resolveSymbolMaster(symbol: string, items: MarketSymbolListItem[]): MarketSymbolListItem | null {
    return items.find((item) => item.symbol?.toUpperCase() === symbol) || items[0] || null;
  }

  private resolveExchangeRule(exchange: string | null | undefined, rules: MarketExchangeRule[]): MarketExchangeRule | null {
    const normalized = (exchange || '').toUpperCase();
    return rules.find((rule) => rule.exchange === normalized) || null;
  }

  private resolveCurrentSession(rule: MarketExchangeRule): string {
    const now = new Date();
    if (now.getDay() === 0 || now.getDay() === 6) {
      return 'Nghỉ cuối tuần';
    }
    const minutes = now.getHours() * 60 + now.getMinutes();
    for (const session of rule.trading_sessions || []) {
      const start = this.sessionMinutes(session['start']);
      const end = this.sessionMinutes(session['end']);
      if (minutes >= start && minutes < end) {
        return session['is_break'] ? 'Nghỉ giữa phiên' : (session['label'] || session['code'] || 'Đang giao dịch');
      }
    }
    return 'Đóng cửa';
  }

  private sessionMinutes(value: string | null | undefined): number {
    if (!value || !value.includes(':')) {
      return 0;
    }
    const [hour, minute] = value.split(':').map((part) => Number(part));
    return hour * 60 + minute;
  }

  private ensureFinancialOverview(symbol: string): void {
    if (this.financialOverview?.symbol === symbol) return;
    if (this.financialLoading && this.financialRequestedSymbol === symbol) return;

    this.financialSub?.unsubscribe();
    this.financialRequestedSymbol = symbol;
    this.financialLoading = true;
    this.financialSub = this.api.getSymbolFinancials(symbol, 40).subscribe({
      next: (data) => {
        if (this.financialRequestedSymbol !== symbol) return;
        this.financialOverview = data;
        this.financialAnalysis = this.buildFinancialAnalysis(data);
        this.financialLoading = false;
        this.financialExpandedSections = {};
      },
      error: () => {
        if (this.financialRequestedSymbol !== symbol) return;
        this.financialOverview = null;
        this.financialAnalysis = null;
        this.financialLoading = false;
        this.financialExpandedSections = {};
      },
    });
  }

  private buildFinancialAnalysis(overview: FinancialOverviewResponse | null): SymbolDetailFinancialAnalysisVm | null {
    if (!overview?.sections?.length) {
      return null;
    }
    const rows: FinancialStatementRow[] = [];
    overview.sections.forEach((section) => {
      (section.rows || []).forEach((row) => rows.push(row));
    });
    return {
      revenueQuarterly: this.findFinancialSeries(rows, ['doanh thu', 'revenue', 'sales'], 'quarter'),
      revenueYearly: this.findFinancialSeries(rows, ['doanh thu', 'revenue', 'sales'], 'year'),
      profitQuarterly: this.findFinancialSeries(
        rows,
        ['loi nhuan sau thue', 'lợi nhuận sau thuế', 'profit after tax', 'net income'],
        'quarter'
      ),
      profitYearly: this.findFinancialSeries(
        rows,
        ['loi nhuan sau thue', 'lợi nhuận sau thuế', 'profit after tax', 'net income'],
        'year'
      ),
      metricGroups: [
        this.buildFinancialMetricGroup(this.t('marketWatch.financialAnalysis.valuation'), rows, [
          { label: 'EPS', patterns: ['eps'] },
          { label: this.t('marketWatch.financialAnalysis.dilutedEps'), patterns: ['eps pha loang', 'eps pha loãng', 'diluted eps'] },
          { label: 'PE', patterns: ['pe'] },
          { label: this.t('marketWatch.financialAnalysis.dilutedPe'), patterns: ['pe pha loang', 'pe pha loãng', 'diluted pe'] },
          { label: 'PB', patterns: ['pb'] },
        ]),
        this.buildFinancialMetricGroup(this.t('marketWatch.financialAnalysis.profitability'), rows, [
          { label: 'ROE', patterns: ['roe'] },
          { label: 'ROA', patterns: ['roa'] },
          { label: 'ROIC', patterns: ['roic'] },
          { label: this.t('marketWatch.financialAnalysis.grossMargin'), patterns: ['ty suat ln gop', 'tỷ suất ln gộp', 'gross margin'] },
          { label: this.t('marketWatch.financialAnalysis.netMargin'), patterns: ['bien ln rong', 'biên ln ròng', 'net margin'] },
        ]),
        this.buildFinancialMetricGroup(this.t('marketWatch.financialAnalysis.financialStrength'), rows, [
          { label: this.t('marketWatch.financialAnalysis.debtEquity'), patterns: ['tong no/vcsh', 'tổng nợ/vcsh', 'debt/equity'] },
          { label: this.t('marketWatch.financialAnalysis.debtAssets'), patterns: ['tong no/tong ts', 'tổng nợ/tổng ts', 'debt/assets'] },
          { label: this.t('marketWatch.financialAnalysis.quickRatio'), patterns: ['thanh toan nhanh', 'quick ratio'] },
          { label: this.t('marketWatch.financialAnalysis.currentRatio'), patterns: ['thanh toan hien hanh', 'thanh toán hiện hành', 'current ratio'] },
        ]),
      ].filter((group) => group.items.length),
    };
  }

  private buildFinancialMetricGroup(
    title: string,
    rows: FinancialStatementRow[],
    mappings: Array<{ label: string; patterns: string[] }>
  ): SymbolDetailFinancialMetricGroupVm {
    const items = mappings
      .map((mapping) => {
        const row = this.findFinancialMetricRow(rows, mapping.patterns);
        return {
          label: mapping.label,
          value: row ? this.resolveFinancialRowLatestValue(row) : '--',
        };
      })
      .filter((item) => item.value !== '--');
    return { title, items };
  }

  private findFinancialSeries(
    rows: FinancialStatementRow[],
    patterns: string[],
    periodKind: 'quarter' | 'year'
  ): SymbolDetailFinancialSeriesVm | null {
    const row = this.findFinancialMetricRow(rows, patterns, periodKind);
    if (!row) {
      return null;
    }
    const points = this.buildFinancialChartPoints(row);
    if (!points.length) {
      return null;
    }
    return {
      title: periodKind === 'quarter'
        ? this.t('marketWatch.financialAnalysis.quarterlySeries')
        : this.t('marketWatch.financialAnalysis.yearlySeries'),
      latestLabel: points[points.length - 1]?.label || '--',
      latestValue: points[points.length - 1]?.displayText || '--',
      unitLabel: this.resolveFinancialUnitLabel(points),
      points,
    };
  }

  private findFinancialMetricRow(
    rows: FinancialStatementRow[],
    patterns: string[],
    preferredPeriodKind?: 'quarter' | 'year'
  ): FinancialStatementRow | null {
    const normalizedPatterns = patterns.map((pattern) => this.normalizeFinancialLabel(pattern));
    const candidates = rows.filter((row) => {
      const label = this.normalizeFinancialLabel(row.metricLabel || row.metricKey || '');
      return normalizedPatterns.some((pattern) => label.includes(pattern));
    });
    if (!candidates.length) {
      return null;
    }
    const exactType = preferredPeriodKind
      ? candidates.find((row) => this.resolveFinancialPeriodKind(row) === preferredPeriodKind && this.hasFinancialValues(row))
      : null;
    if (exactType) {
      return exactType;
    }
    return candidates.find((row) => this.hasFinancialValues(row)) || candidates[0];
  }

  private buildFinancialChartPoints(row: FinancialStatementRow): SymbolDetailFinancialChartPoint[] {
    const rawPoints = (row.values || [])
      .map((value) => ({
        label: value.reportPeriod || '--',
        shortLabel: this.toShortFinancialLabel(value.reportPeriod || '--'),
        value: typeof value.valueNumber === 'number' && Number.isFinite(value.valueNumber) ? value.valueNumber : null,
        displayText: value.displayValue || value.valueText || '--',
      }))
      .reverse()
      .filter((item) => item.value !== null || item.displayText !== '--');

    const maxAbs = rawPoints.reduce((max, item) => Math.max(max, Math.abs(item.value || 0)), 0);
    return rawPoints.map((item) => ({
      ...item,
      barHeight: maxAbs > 0 && item.value !== null ? Math.max(10, Math.round((Math.abs(item.value) / maxAbs) * 100)) : 0,
    }));
  }

  private resolveFinancialUnitLabel(points: SymbolDetailFinancialChartPoint[]): string {
    const maxAbs = points.reduce((max, item) => Math.max(max, Math.abs(item.value || 0)), 0);
    if (maxAbs >= 1_000_000_000) {
      return this.t('marketWatch.financialAnalysis.unitBillion');
    }
    if (maxAbs >= 1_000_000) {
      return this.t('marketWatch.financialAnalysis.unitMillion');
    }
    return this.t('marketWatch.financialAnalysis.unitRaw');
  }

  private resolveFinancialRowLatestValue(row: FinancialStatementRow): string {
    const latest = row.displayValue && row.displayValue !== '--'
      ? row.displayValue
      : (row.values || []).find((value) => value.displayValue && value.displayValue !== '--')?.displayValue;
    return latest || '--';
  }

  private hasFinancialValues(row: FinancialStatementRow): boolean {
    return (row.values || []).some((value) => typeof value.valueNumber === 'number' && Number.isFinite(value.valueNumber));
  }

  private resolveFinancialPeriodKind(row: FinancialStatementRow): 'quarter' | 'year' | 'other' {
    const rawType = this.normalizeFinancialLabel(row.periodType || '');
    const periodLabel = this.normalizeFinancialLabel((row.values || [])[0]?.reportPeriod || row.reportPeriod || '');
    if (rawType.includes('quarter') || periodLabel.includes('q') || periodLabel.includes('quy')) {
      return 'quarter';
    }
    if (rawType.includes('year') || rawType.includes('annual') || periodLabel.includes('nam')) {
      return 'year';
    }
    return 'other';
  }

  private normalizeFinancialLabel(value: string): string {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  }

  private toShortFinancialLabel(value: string): string {
    const normalized = (value || '').trim();
    const quarterMatch = normalized.match(/(Q\d)\s*[-/]?\s*(\d{4})/i);
    if (quarterMatch) {
      return `${quarterMatch[1].toUpperCase()} ${quarterMatch[2]}`;
    }
    const yearMatch = normalized.match(/(\d{4})/);
    return yearMatch ? yearMatch[1] : normalized;
  }

  private t(key: string): string {
    return this.i18n.translate(key);
  }

  private scheduleChartRender(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
    }
    this.renderTimer = window.setTimeout(() => this.renderChart(), 0);
  }

  private renderChart(): void {
    const el = document.getElementById(this.chartHostId);
    if (!this.open || !el || typeof ApexCharts === 'undefined' || !this.selectedHourly.length) {
      return;
    }

    this.destroyChart();
    const priceBand = this.resolvePriceBand();
    const candleSeries = this.buildCandleSeries();
    const canRenderCandles = candleSeries.some((item) => item.y.some((value, index, values) => index > 0 && value !== values[0]));
    const chartType = canRenderCandles ? 'candlestick' : 'area';
    const closeSeries = canRenderCandles
      ? candleSeries
      : candleSeries.map((item) => ({
          x: item.x,
          y: item.y[3],
        }));

    this.chart = new ApexCharts(el, {
      chart: {
        type: chartType,
        height: 360,
        toolbar: { show: false },
        animations: { enabled: false },
        fontFamily: 'inherit',
      },
      series: [{ name: 'Giá', data: closeSeries }],
      legend: { show: false },
      annotations: {
        yaxis: this.buildPriceBandAnnotations(priceBand),
      },
      plotOptions: {
        candlestick: {
          colors: {
            upward: '#16a34a',
            downward: '#dc2626',
          },
          wick: {
            useFillColor: true,
          },
        },
      },
      stroke: { width: canRenderCandles ? 1 : 3, curve: 'smooth' },
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
      markers: { size: 0, hover: { size: 5 } },
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
        intersect: !canRenderCandles,
        x: { formatter: (value: number) => this.formatTimeHms(value) },
        y: { formatter: (value: number) => this.formatPrice(value) },
      },
      grid: {
        borderColor: '#edf1f7',
        strokeDashArray: 4,
      },
    });

    this.chart.render();
  }

  private buildCandleSeries(): Array<{ x: number; y: [number, number, number, number] }> {
    return this.selectedHourly
      .map((item) => {
        const close = this.safeChartPrice(item.close);
        const open = this.safeChartPrice(item.open) ?? close;
        const high = this.safeChartPrice(item.high) ?? close ?? open;
        const low = this.safeChartPrice(item.low) ?? close ?? open;
        const fallback = close ?? open ?? high ?? low;
        if (!fallback) {
          return null;
        }

        const values = [
          open ?? fallback,
          Math.max(high ?? fallback, open ?? fallback, close ?? fallback),
          Math.min(low ?? fallback, open ?? fallback, close ?? fallback),
          close ?? fallback,
        ] as [number, number, number, number];
        return {
          x: new Date(item.time).getTime(),
          y: values,
        };
      })
      .filter((item): item is { x: number; y: [number, number, number, number] } => !!item && Number.isFinite(item.x));
  }

  private safeChartPrice(value: number | null | undefined): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  private resolvePriceBand(): { ceiling: number; reference: number; floor: number } | null {
    const reference = this.resolveReferencePrice();
    const limitPercent = Number(this.exchangeRule?.price_limit_percent);
    if (!reference || !Number.isFinite(reference) || !limitPercent || !Number.isFinite(limitPercent)) {
      return null;
    }

    const band = reference * limitPercent / 100;
    return {
      ceiling: reference + band,
      reference,
      floor: Math.max(0, reference - band),
    };
  }

  private resolveReferencePrice(): number | null {
    const reference = this.normalizeComparablePrice(this.selectedQuote?.referencePrice, this.selectedQuote?.price);
    if (reference) {
      return reference;
    }

    const price = Number(this.selectedQuote?.price);
    const changeValue = Number(this.selectedQuote?.changeValue);
    if (Number.isFinite(price) && price > 0 && Number.isFinite(changeValue)) {
      const inferred = price - changeValue;
      if (inferred > 0) {
        return inferred;
      }
    }

    const changePercent = Number(this.selectedQuote?.changePercent);
    if (Number.isFinite(price) && price > 0 && Number.isFinite(changePercent) && changePercent !== -100) {
      const inferred = price / (1 + changePercent / 100);
      if (inferred > 0) {
        return inferred;
      }
    }

    return null;
  }

  private normalizeComparablePrice(value: number | null | undefined, currentPrice: number | null | undefined): number | null {
    const ref = Number(value);
    const price = Number(currentPrice);
    if (!Number.isFinite(ref) || ref <= 0) {
      return null;
    }
    if (!Number.isFinite(price) || price <= 0) {
      return ref;
    }
    if (ref > price * 100) {
      return ref / 1000;
    }
    if (ref > price * 10) {
      return ref / 100;
    }
    return ref;
  }

  private buildPriceBandAnnotations(priceBand: { ceiling: number; reference: number; floor: number } | null): Array<Record<string, any>> {
    if (!priceBand) {
      return [];
    }

    return [
      this.buildPriceBandAnnotation(priceBand.ceiling, 'Trần', '#dc2626'),
      this.buildPriceBandAnnotation(priceBand.reference, 'TC', '#f59e0b'),
      this.buildPriceBandAnnotation(priceBand.floor, 'Sàn', '#2563eb'),
    ];
  }

  private buildPriceBandAnnotation(value: number, label: string, color: string): Record<string, any> {
    return {
      y: value,
      borderColor: color,
      strokeDashArray: 5,
      label: {
        borderColor: color,
        offsetX: -8,
        style: {
          background: color,
          color: '#fff',
          fontSize: '11px',
          fontWeight: 800,
        },
        text: `${label} ${this.formatPrice(value)}`,
      },
    };
  }

  private destroyChart(): void {
    try {
      this.chart?.destroy();
    } catch {}
    this.chart = null;
  }

  private formatTime(value: number): string {
    const date = new Date(value);
    const hh = `${date.getHours()}`.padStart(2, '0');
    const mm = `${date.getMinutes()}`.padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private formatTimeHms(value: number): string {
    const date = new Date(value);
    const hh = `${date.getHours()}`.padStart(2, '0');
    const mm = `${date.getMinutes()}`.padStart(2, '0');
    const ss = `${date.getSeconds()}`.padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  private formatPrice(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private formatSignedPrice(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    const num = Number(value);
    const abs = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  private formatDateTime(value: string | null | undefined): string {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    const hh = `${date.getHours()}`.padStart(2, '0');
    const mm = `${date.getMinutes()}`.padStart(2, '0');
    return `${hh}:${mm}`;
  }
}
