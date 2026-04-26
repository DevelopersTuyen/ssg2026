import { Component, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subscription, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AppI18nService } from 'src/app/core/i18n/app-i18n.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { BackgroundRefreshService } from 'src/app/core/services/background-refresh.service';

import {
  ApiEnvelope,
  ExchangeTab,
  MarketSettingsData,
  MarketAlertItem,
  MarketAlertNewsItem,
  MarketAlertsOverviewResponse,
  StrategyAlertRule,
  StrategyChecklistItem,
  StrategyDriver,
  StrategyFormula,
  StrategyJournalEntry,
  StrategyParameter,
  StrategyProfileConfigResponse,
  StrategyProfile,
  StrategyRuleResult,
  StrategyScoredItem,
  StrategyScreenRule,
  StrategyOverviewResponse,
  MarketApiService,
} from 'src/app/core/services/market-api.service';

declare const ApexCharts: any;

type DashboardChartTab = 'allocation' | 'equity' | 'outcomes';
type DashboardAlertTab = 'priority' | 'alerts' | 'news' | 'ai';
type DashboardDetailTab = 'overview' | 'rules' | 'snapshot';
type DashboardConfigEntity = StrategyFormula | StrategyScreenRule | StrategyAlertRule | StrategyChecklistItem;
type DashboardExchange = ExchangeTab | 'ALL';

interface DashboardV2JournalRowVm {
  id: number;
  date: string;
  symbol: string;
  sideLabel: string;
  tradeLabel: string;
  note: string;
  capitalLabel: string;
  pnlLabel: string;
  pnlTone: 'positive' | 'danger' | 'default';
  resultLabel: string;
}

interface DashboardV2AlertVm {
  id: string;
  title: string;
  message: string;
  symbol: string;
  timeLabel: string;
  severity: MarketAlertItem['severity'] | 'info';
  confidenceLabel: string;
  directionLabel: string;
  changeLabel: string;
  priceLabel: string;
  tags: string[];
}

interface DashboardV2PriorityVm {
  key: string;
  title: string;
  body: string;
  meta: string;
  tone: 'default' | 'warning' | 'danger' | 'positive';
}

interface DashboardV2StatsVm {
  totalCapital: number;
  realizedProfit: number;
  realizedLoss: number;
  netPnl: number;
  winRate: number;
  openCount: number;
  closedCount: number;
  winCount: number;
  lossCount: number;
  openCapital: number;
}

interface DashboardV2ExchangeOption {
  value: DashboardExchange;
  label: string;
}

interface DashboardV2TrendPoint {
  x: number;
  y: number;
}

interface DashboardV2DetailNarrativeVm {
  label: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}

interface DashboardV2DetailItemVm {
  key: string;
  label: string;
  expression: string;
  detail: string;
  status: 'pass' | 'fail' | 'warn' | 'na';
  kind: string;
}

interface DashboardV2DetailGroupVm {
  title: string;
  items: DashboardV2DetailItemVm[];
}

interface DashboardV2MetricChipVm {
  label: string;
  value: string;
  tone: 'default' | 'positive' | 'danger' | 'warning';
}

interface DashboardV2ChartDetailVm extends DashboardV2MetricChipVm {
  helper: string;
}

interface DashboardV2DetailFactVm {
  label: string;
  value: string;
}

interface DashboardV2InsightVm {
  title: string;
  body: string;
  meta: string;
}

@Component({
  selector: 'app-dashboard-v2',
  templateUrl: './dashboard-v2.page.html',
  styleUrls: ['./dashboard-v2.page.scss'],
  standalone: false,
})
export class DashboardV2Page implements OnInit, OnDestroy {
  readonly exchangeOptions: DashboardV2ExchangeOption[] = [
    { value: 'ALL', label: 'Tất cả sàn' },
    { value: 'HSX', label: 'HSX' },
    { value: 'HNX', label: 'HNX' },
    { value: 'UPCOM', label: 'UPCOM' },
  ];

  loading = false;
  error = '';
  selectedExchange: DashboardExchange = 'ALL';
  selectedChartTab: DashboardChartTab = 'allocation';
  selectedAlertTab: DashboardAlertTab = 'priority';
  compactTableEnabled = true;
  stickyHeaderEnabled = true;
  dataHealthIssues: string[] = [];
  dataHealthSummary = '';
  insightPanel: DashboardV2InsightVm = { title: '', body: '', meta: '' };

  overview: StrategyOverviewResponse | null = null;
  alertsOverview: MarketAlertsOverviewResponse | null = null;

  journalRows: DashboardV2JournalRowVm[] = [];
  alertItems: DashboardV2AlertVm[] = [];
  priorityItems: DashboardV2PriorityVm[] = [];
  aiAnalysisItems: DashboardV2PriorityVm[] = [];
  newsItems: MarketAlertNewsItem[] = [];
  stats: DashboardV2StatsVm = {
    totalCapital: 0,
    realizedProfit: 0,
    realizedLoss: 0,
    netPnl: 0,
    winRate: 0,
    openCount: 0,
    closedCount: 0,
    winCount: 0,
    lossCount: 0,
    openCapital: 0,
  };

  journalHeadline = '';
  journalSubtitle = '';
  outlookTitle = '';
  outlookSummary = '';
  outlookDirection: 'up' | 'down' | 'neutral' = 'neutral';
  outlookConfidence = 0;
  activeProfileLabel = '';

  journalDetailOpen = false;
  journalDetailLoading = false;
  journalDetailError = '';
  journalDetailEntry: StrategyJournalEntry | null = null;
  journalDetailScore: StrategyScoredItem | null = null;
  journalDetailConfig: StrategyProfileConfigResponse | null = null;
  journalDetailNarratives: DashboardV2DetailNarrativeVm[] = [];
  journalDetailGroups: DashboardV2DetailGroupVm[] = [];
  journalDetailSnapshotMetrics: DashboardV2MetricChipVm[] = [];
  journalDetailCurrentMetrics: DashboardV2MetricChipVm[] = [];
  selectedDetailTab: DashboardDetailTab = 'overview';
  symbolDetailOpen = false;
  symbolDetailSymbol = '';

  private readonly currency = new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
  private readonly decimal = new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
  private readonly percent = new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });

  private renderTimer?: number;
  private dashboardSub?: Subscription;
  private alertsSub?: Subscription;
  private detailSub?: Subscription;
  private backgroundSub?: Subscription;
  private insightChart: any;
  private journalEntries: StrategyJournalEntry[] = [];
  private hasInitialLoad = false;
  private refreshHandle: ReturnType<typeof window.setInterval> | null = null;
  private activeView = false;

  constructor(
    private readonly api: MarketApiService,
    private readonly i18n: AppI18nService,
    private readonly auth: AuthService,
    private readonly backgroundRefresh: BackgroundRefreshService
  ) {
    this.applyDefaultCopy();
  }

  ngOnInit(): void {
    this.applyStoredSettings();
    this.backgroundSub = this.backgroundRefresh.changes$.subscribe((domains) => {
      if (!this.activeView) {
        return;
      }

      if (domains.some((item) => ['quotes', 'intraday', 'financial', 'news'].includes(item))) {
        this.loadDashboard(true, true);
      }
    });

    if (!this.auth.preferences && this.auth.isAuthenticated()) {
      this.auth.refreshSettings().subscribe((settings) => {
        if (!settings) {
          return;
        }

        this.applySettings(settings);
        if (this.hasInitialLoad) {
          this.loadDashboard(true, true);
        }
      });
    }

    this.ensureDashboardLoaded();
  }

  ionViewWillEnter(): void {
    this.applyStoredSettings();
    if (this.hasInitialLoad) {
      this.loadDashboard(true);
      return;
    }

    this.ensureDashboardLoaded();
  }

  ionViewDidEnter(): void {
    this.activeView = true;
    this.applyStoredSettings();
    this.applyAutoRefresh();
    this.scheduleChartRender();
  }

  ionViewDidLeave(): void {
    this.activeView = false;
    this.stopAutoRefresh();
  }

  ngOnDestroy(): void {
    this.dashboardSub?.unsubscribe();
    this.alertsSub?.unsubscribe();
    this.detailSub?.unsubscribe();
    this.backgroundSub?.unsubscribe();
    this.stopAutoRefresh();
    this.destroyChart();
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
    }
  }

  refreshData(): void {
    this.loadDashboard(true);
  }

  changeExchange(exchange: DashboardExchange): void {
    if (this.selectedExchange === exchange) {
      return;
    }

    this.selectedExchange = exchange;
    this.loadDashboard(true);
  }

  changeChartTab(tab: DashboardChartTab): void {
    if (this.selectedChartTab !== tab) {
      this.selectedChartTab = tab;
      this.scheduleChartRender();
    }

    this.setInsightPanel(
      this.t(`dashboardV2.chartTab.${tab}`),
      this.currentChartDescription(),
      this.currentChartTitle()
    );
  }

  isChartTab(tab: DashboardChartTab): boolean {
    return this.selectedChartTab === tab;
  }

  chartTabLabel(tab: DashboardChartTab): string {
    return this.t(`dashboardV2.chartTab.${tab}`);
  }

  chartTabHelp(tab: DashboardChartTab): string {
    return this.t(`dashboardV2.chartDescription.${tab}`);
  }

  changeAlertTab(tab: DashboardAlertTab): void {
    this.selectedAlertTab = tab;
    this.setInsightPanel(
      this.t(`dashboardV2.alertTab.${tab}`),
      this.alertTabHelp(tab),
      this.selectedExchange
    );
  }

  isAlertTab(tab: DashboardAlertTab): boolean {
    return this.selectedAlertTab === tab;
  }

  alertTabLabel(tab: DashboardAlertTab): string {
    return this.t(`dashboardV2.alertTab.${tab}`);
  }

  alertTabHelp(tab: DashboardAlertTab): string {
    return this.t(`dashboardV2.alertTabHelp.${tab}`);
  }

  openJournalDetail(row: DashboardV2JournalRowVm): void {
    const entry = this.journalEntries.find((item) => item.id === row.id) || null;
    this.journalDetailOpen = true;
    this.journalDetailEntry = entry;
    this.journalDetailLoading = true;
    this.journalDetailError = '';
    this.journalDetailScore = null;
    this.journalDetailConfig = null;
    this.journalDetailNarratives = [];
    this.journalDetailGroups = [];
    this.journalDetailSnapshotMetrics = this.buildSnapshotMetrics(entry);
    this.journalDetailCurrentMetrics = [];
    this.selectedDetailTab = 'overview';

    if (!entry) {
      this.journalDetailLoading = false;
      this.journalDetailError = this.t('dashboardV2.detail.error.entry');
      return;
    }

    const profileId = entry.profileId || this.overview?.activeProfile?.id;
    if (!profileId) {
      this.journalDetailLoading = false;
      this.journalDetailError = this.t('dashboardV2.detail.error.profile');
      return;
    }

    this.detailSub?.unsubscribe();
    this.detailSub = forkJoin({
      config: this.safeNullable(this.api.getStrategyProfileConfig(profileId)),
      score: this.safeNullable(this.api.getStrategySymbolScore(profileId, entry.symbol)),
    }).subscribe({
      next: ({ config, score }) => {
        this.journalDetailConfig = config.data || null;
        this.journalDetailScore = score.data || null;
        this.journalDetailNarratives = score.data ? this.buildDecisionNarratives(score.data) : [];
        this.journalDetailGroups = this.buildDetailGroups(config.data, score.data);
        this.journalDetailCurrentMetrics = this.buildCurrentMetrics(score.data);
        this.journalDetailLoading = false;
      },
      error: () => {
        this.journalDetailLoading = false;
        this.journalDetailError = this.t('dashboardV2.detail.error.score');
      },
    });
  }

  openSymbolDetail(symbol: string, event?: Event): void {
    event?.stopPropagation();
    const normalized = (symbol || '').trim().toUpperCase();
    if (!normalized) {
      return;
    }
    this.symbolDetailSymbol = normalized;
    this.symbolDetailOpen = true;
  }

  closeSymbolDetail(): void {
    this.symbolDetailOpen = false;
  }

  closeJournalDetail(): void {
    this.journalDetailOpen = false;
    this.journalDetailLoading = false;
    this.journalDetailError = '';
    this.journalDetailEntry = null;
    this.journalDetailScore = null;
    this.journalDetailConfig = null;
    this.journalDetailNarratives = [];
    this.journalDetailGroups = [];
    this.journalDetailSnapshotMetrics = [];
    this.journalDetailCurrentMetrics = [];
    this.selectedDetailTab = 'overview';
  }

  showJournalInsight(row: DashboardV2JournalRowVm): void {
    this.setInsightPanel(
      `${row.symbol} - ${row.resultLabel}`,
      `${row.tradeLabel}. ${row.note}`,
      `${row.capitalLabel} / ${row.pnlLabel}`
    );
  }

  showPriorityInsight(item: DashboardV2PriorityVm): void {
    this.setInsightPanel(item.title, item.body, item.meta);
  }

  showAlertInsight(item: DashboardV2AlertVm): void {
    this.setInsightPanel(
      item.title,
      item.message,
      `${item.symbol} / ${item.directionLabel} / ${item.timeLabel}`
    );
  }

  showNewsInsight(item: MarketAlertNewsItem): void {
    this.setInsightPanel(
      item.title,
      item.summary || this.t('dashboardV2.newsLinkedHelp'),
      `${this.newsScopeLabel(item)} / ${item.published_at || '--'}`
    );
  }

  showMetricInsight(metric: DashboardV2MetricChipVm): void {
    this.setInsightPanel(metric.label, metric.value, this.currentChartTitle());
  }

  resetInsightPanel(): void {
    this.setInsightPanel(
      this.outlookTitle || this.t('dashboardV2.defaultInsightTitle'),
      this.dataHealthSummary || this.outlookSummary || this.t('dashboardV2.defaultInsightBody'),
      this.activeProfileLabel
    );
  }

  trackByJournal(_: number, item: DashboardV2JournalRowVm): number {
    return item.id;
  }

  trackByExchange(_: number, item: DashboardV2ExchangeOption): DashboardExchange {
    return item.value;
  }

  trackByAlert(_: number, item: DashboardV2AlertVm): string {
    return item.id;
  }

  trackByNews(_: number, item: MarketAlertNewsItem): string {
    return `${item.title}-${item.published_at || ''}`;
  }

  trackByPriority(_: number, item: DashboardV2PriorityVm): string {
    return item.key;
  }

  trackByDetailItem(_: number, item: DashboardV2DetailItemVm): string {
    return item.key;
  }

  newsScopeLabel(item: MarketAlertNewsItem): string {
    const symbols = (item.related_symbols || []).filter(Boolean).slice(0, 3);
    return symbols.length ? symbols.join(' / ') : this.t('dashboardV2.newsScopeFallback');
  }

  currentChartTitle(): string {
    if (this.selectedChartTab === 'allocation') {
      return this.t('dashboardV2.chartTitle.allocation');
    }
    if (this.selectedChartTab === 'equity') {
      return this.t('dashboardV2.chartTitle.equity');
    }
    return this.t('dashboardV2.chartTitle.outcomes');
  }

  currentChartDescription(): string {
    if (this.selectedChartTab === 'allocation') {
      return this.t('dashboardV2.chartDescription.allocation');
    }
    if (this.selectedChartTab === 'equity') {
      return this.t('dashboardV2.chartDescription.equity');
    }
    return this.t('dashboardV2.chartDescription.outcomes');
  }

  currentChartMetrics(): DashboardV2MetricChipVm[] {
    if (this.selectedChartTab === 'allocation') {
      return [
        { label: this.t('dashboardV2.metric.capital'), value: this.formatMoney(this.stats.totalCapital), tone: 'default' },
        { label: this.t('dashboardV2.metric.profit'), value: this.formatSignedMoney(this.stats.realizedProfit), tone: 'positive' },
        { label: this.t('dashboardV2.metric.loss'), value: this.formatSignedMoney(-this.stats.realizedLoss), tone: 'danger' },
      ];
    }

    if (this.selectedChartTab === 'equity') {
      return [
        { label: this.t('dashboardV2.metric.netPnl'), value: this.formatSignedMoney(this.stats.netPnl), tone: this.stats.netPnl >= 0 ? 'positive' : 'danger' },
        { label: this.t('dashboardV2.metric.winRate'), value: this.formatPercent(this.stats.winRate), tone: this.stats.winRate >= 0.5 ? 'positive' : 'warning' },
        { label: this.t('dashboardV2.metric.closed'), value: `${this.stats.closedCount}`, tone: 'default' },
      ];
    }

    return [
      { label: this.t('dashboardV2.metric.wins'), value: `${this.stats.winCount}`, tone: 'positive' },
      { label: this.t('dashboardV2.metric.losses'), value: `${this.stats.lossCount}`, tone: 'danger' },
      { label: this.t('dashboardV2.metric.open'), value: `${this.stats.openCount}`, tone: 'warning' },
    ];
  }

  currentChartDetails(): DashboardV2ChartDetailVm[] {
    if (this.selectedChartTab === 'allocation') {
      const deployedRatio = this.stats.totalCapital > 0 ? this.stats.openCapital / this.stats.totalCapital : 0;
      return [
        {
          label: this.t('dashboardV2.chartDetail.deployed'),
          value: this.formatPercent(deployedRatio),
          tone: deployedRatio > 0.65 ? 'warning' : 'default',
          helper: this.t('dashboardV2.chartDetail.deployedHelp'),
        },
        {
          label: this.t('dashboardV2.chartDetail.realized'),
          value: this.formatSignedMoney(this.stats.realizedProfit - this.stats.realizedLoss),
          tone: this.stats.netPnl >= 0 ? 'positive' : 'danger',
          helper: this.t('dashboardV2.chartDetail.realizedHelp'),
        },
      ];
    }

    if (this.selectedChartTab === 'equity') {
      return [
        {
          label: this.t('dashboardV2.chartDetail.trend'),
          value: this.stats.netPnl >= 0 ? this.t('dashboardV2.chartDetail.trendUp') : this.t('dashboardV2.chartDetail.trendDown'),
          tone: this.stats.netPnl >= 0 ? 'positive' : 'danger',
          helper: this.t('dashboardV2.chartDetail.trendHelp'),
        },
        {
          label: this.t('dashboardV2.chartDetail.sample'),
          value: `${Math.min(this.journalEntries.length, 24)}`,
          tone: 'default',
          helper: this.t('dashboardV2.chartDetail.sampleHelp'),
        },
      ];
    }

    const decidedCount = this.stats.winCount + this.stats.lossCount;
    return [
      {
        label: this.t('dashboardV2.chartDetail.closedRatio'),
        value: this.formatPercent(this.journalEntries.length ? decidedCount / this.journalEntries.length : 0),
        tone: decidedCount > 0 ? 'default' : 'warning',
        helper: this.t('dashboardV2.chartDetail.closedRatioHelp'),
      },
      {
        label: this.t('dashboardV2.chartDetail.executionQuality'),
        value: this.formatPercent(this.stats.winRate),
        tone: this.stats.winRate >= 0.5 ? 'positive' : 'warning',
        helper: this.t('dashboardV2.chartDetail.executionQualityHelp'),
      },
    ];
  }

  detailStatusLabel(status: 'pass' | 'fail' | 'warn' | 'na'): string {
    if (status === 'pass') return this.t('dashboardV2.detailStatus.pass');
    if (status === 'fail') return this.t('dashboardV2.detailStatus.fail');
    if (status === 'warn') return this.t('dashboardV2.detailStatus.warn');
    return this.t('dashboardV2.detailStatus.info');
  }

  chartTabItems(): Array<{ key: DashboardChartTab; label: string }> {
    return [
      { key: 'allocation', label: this.t('dashboardV2.chartTab.allocation') },
      { key: 'equity', label: this.t('dashboardV2.chartTab.equity') },
      { key: 'outcomes', label: this.t('dashboardV2.chartTab.outcomes') },
    ];
  }

  alertTabItems(): Array<{ key: DashboardAlertTab; label: string }> {
    return [
      { key: 'priority', label: this.t('dashboardV2.alertTab.priority') },
      { key: 'alerts', label: this.t('dashboardV2.alertTab.alerts') },
      { key: 'news', label: this.t('dashboardV2.alertTab.news') },
      { key: 'ai', label: this.t('dashboardV2.alertTab.ai') },
    ];
  }

  detailTabItems(): Array<{ key: DashboardDetailTab; label: string }> {
    return [
      { key: 'overview', label: this.t('dashboardV2.detailTab.overview') },
      { key: 'rules', label: this.t('dashboardV2.detailTab.rules') },
      { key: 'snapshot', label: this.t('dashboardV2.detailTab.snapshot') },
    ];
  }

  changeDetailTab(tab: DashboardDetailTab): void {
    this.selectedDetailTab = tab;
  }

  executionRationale(): string[] {
    return (this.journalDetailScore?.executionPlan?.rationale || []).filter(Boolean).slice(0, 5);
  }

  detailFacts(): DashboardV2DetailFactVm[] {
    const entry = this.journalDetailEntry;
    const score = this.journalDetailScore;
    if (!entry) {
      return [];
    }

    return [
      { label: this.t('dashboardV2.fact.tradeDate'), value: this.formatDate(entry.tradeDate || null) },
      { label: this.t('dashboardV2.fact.side'), value: this.tradeSideLabel(entry.tradeSide) },
      { label: this.t('dashboardV2.fact.entry'), value: this.formatMoney(entry.entryPrice) },
      { label: this.t('dashboardV2.fact.exit'), value: entry.exitPrice ? this.formatMoney(entry.exitPrice) : this.t('dashboardV2.result.open') },
      { label: this.t('dashboardV2.fact.quantity'), value: this.formatMoney(entry.quantity) },
      { label: this.t('dashboardV2.fact.capital'), value: this.formatMoney(entry.totalCapital) },
      { label: this.t('dashboardV2.fact.strategy'), value: entry.strategyName || this.t('dashboardV2.trade.unspecified') },
      {
        label: this.t('dashboardV2.fact.execution'),
        value: score?.executionPlan?.standAside
          ? this.t('dashboardV2.execution.standAside')
          : score?.executionPlan?.probeBuy30 || score?.executionPlan?.addBuy70
            ? this.t('dashboardV2.execution.ready')
            : this.t('dashboardV2.execution.wait'),
      },
    ];
  }

  private ensureDashboardLoaded(): void {
    if (this.hasInitialLoad) {
      return;
    }

    this.hasInitialLoad = true;
    this.loadDashboard();
  }

  private loadDashboard(force = false, silent = false): void {
    if (this.loading && !force) {
      return;
    }

    if (!silent) {
      this.loading = true;
    }
    this.error = '';
    this.dashboardSub?.unsubscribe();
    this.loadAlertsOverview(true);

    this.dashboardSub = forkJoin({
      profiles: this.safeList(this.api.listStrategyProfiles()),
      journal: this.safeList(this.api.listStrategyJournal(18, this.selectedExchange)),
    }).subscribe({
      next: ({ profiles, journal }) => {
        this.overview = this.buildLightOverview(profiles.data);

        const journalEntries = journal.data || [];
        this.journalEntries = journalEntries;
        this.journalRows = this.buildJournalRows(journalEntries);
        this.stats = this.computeStats(journalEntries);
        this.applyAlertsState();
        this.applyAlertNarrative();

        this.loading = false;
        this.scheduleChartRender();
      },
      error: () => {
        this.loading = false;
        this.error = this.t('dashboardV2.error.load');
      },
    });
  }

  private loadAlertsOverview(silent = false): void {
    this.alertsSub?.unsubscribe();
    this.alertsSub = this.getAlertsOverviewForSelectedExchange().subscribe({
      next: (alerts) => {
        this.alertsOverview = alerts.data || null;
        this.applyAlertsState();
        this.applyAlertNarrative();
      },
      error: () => {
        if (!silent) {
          this.error = this.t('dashboardV2.error.load');
        }
      },
    });
  }

  private getAlertsOverviewForSelectedExchange(): Observable<ApiEnvelope<MarketAlertsOverviewResponse | null>> {
    if (this.selectedExchange !== 'ALL') {
      return this.safeNullable(this.api.getMarketAlertsOverview(this.selectedExchange));
    }

    return forkJoin([
      this.safeNullable(this.api.getMarketAlertsOverview('HSX')),
      this.safeNullable(this.api.getMarketAlertsOverview('HNX')),
      this.safeNullable(this.api.getMarketAlertsOverview('UPCOM')),
    ]).pipe(
      catchError(() => of([] as ApiEnvelope<MarketAlertsOverviewResponse | null>[])),
      map((responses) => ({
        data: this.mergeAlertsOverview(responses.map((response) => response.data).filter(Boolean) as MarketAlertsOverviewResponse[]),
      }))
    );
  }

  private mergeAlertsOverview(items: MarketAlertsOverviewResponse[]): MarketAlertsOverviewResponse | null {
    if (!items.length) {
      return null;
    }

    const alerts: MarketAlertItem[] = items.reduce<MarketAlertItem[]>((acc, item) => acc.concat(item.alerts || []), []);
    const newsItems = items
      .reduce<MarketAlertNewsItem[]>((acc, item) => acc.concat(item.news_items || []), [])
      .filter((item, index, arr) => arr.findIndex((candidate) => candidate.url === item.url && candidate.title === item.title) === index)
      .slice(0, 20);
    const watchlistSymbols = Array.from(new Set(items.reduce<string[]>((acc, item) => acc.concat(item.watchlist_symbols || []), [])));
    const generatedDates = items.map((item) => item.generated_at).filter(Boolean).sort();
    const generatedAt = generatedDates.length ? generatedDates[generatedDates.length - 1] : '';
    const criticalCount = alerts.filter((item) => item.severity === 'critical').length;
    const watchlistAlertCount = items.reduce((sum, item) => sum + Number(item.watchlist_alert_count || 0), 0);
    const averageConfidence = items.length
      ? items.reduce((sum, item) => sum + Number(item.market_outlook?.confidence || 0), 0) / items.length
      : 0;
    const dominantDirection = this.resolveDominantDirection(items);

    return {
      exchange: 'ALL',
      provider: items.find((item) => item.provider)?.provider || '',
      model: items.find((item) => item.model)?.model || '',
      used_fallback: items.some((item) => item.used_fallback),
      generated_at: generatedAt,
      headline: `Tổng hợp ${items.length} sàn: ${alerts.length} cảnh báo, ${newsItems.length} tin liên quan.`,
      watchlist_headline: watchlistSymbols.length
        ? `${watchlistSymbols.length} mã watchlist đang được theo dõi trên toàn thị trường.`
        : 'Chưa có mã watchlist nổi bật trên toàn thị trường.',
      summary_cards: [
        { label: 'Tổng cảnh báo', value: `${alerts.length}`, tone: alerts.length ? 'warning' : 'default', helper: 'Gộp HSX, HNX và UPCOM' },
        { label: 'Ưu tiên cao', value: `${criticalCount}`, tone: criticalCount ? 'danger' : 'default', helper: 'Số cảnh báo critical toàn thị trường' },
        { label: 'Watchlist', value: `${watchlistAlertCount}`, tone: watchlistAlertCount ? 'positive' : 'default', helper: 'Cảnh báo liên quan danh sách theo dõi' },
      ],
      market_outlook: {
        title: 'Outlook toàn thị trường',
        summary: `Gộp dữ liệu HSX, HNX và UPCOM. Hướng chính: ${dominantDirection}.`,
        direction: dominantDirection,
        confidence: averageConfidence,
      },
      alerts,
      news_items: newsItems,
      watchlist_symbols: watchlistSymbols,
      alert_count: alerts.length,
      watchlist_alert_count: watchlistAlertCount,
    };
  }

  private resolveDominantDirection(items: MarketAlertsOverviewResponse[]): 'up' | 'down' | 'neutral' {
    const counts = items.reduce(
      (acc, item) => {
        const direction = item.market_outlook?.direction || 'neutral';
        acc[direction] += 1;
        return acc;
      },
      { up: 0, down: 0, neutral: 0 }
    );
    if (counts.up > counts.down && counts.up >= counts.neutral) {
      return 'up';
    }
    if (counts.down > counts.up && counts.down >= counts.neutral) {
      return 'down';
    }
    return 'neutral';
  }

  private applyAlertsState(): void {
    this.alertItems = this.buildAlertItems(this.alertsOverview?.alerts || []);
    this.newsItems = this.alertsOverview?.news_items || [];
    this.priorityItems = this.buildPriorityItems(this.journalEntries, this.alertsOverview, this.newsItems);
    this.dataHealthIssues = this.buildDataHealthIssues(this.overview, this.alertsOverview, this.journalEntries);
    this.dataHealthSummary = this.buildDataHealthSummary(this.journalEntries);
    this.aiAnalysisItems = this.buildAiAnalysisItems(this.alertsOverview);
  }

  private safeNullable<T>(source$: Observable<ApiEnvelope<T | null>>): Observable<ApiEnvelope<T | null>> {
    return source$.pipe(catchError(() => of({ data: null } as ApiEnvelope<T | null>)));
  }

  private safeList<T>(source$: Observable<ApiEnvelope<T[]>>): Observable<ApiEnvelope<T[]>> {
    return source$.pipe(catchError(() => of({ data: [] as T[] } as ApiEnvelope<T[]>)));
  }

  private buildLightOverview(profiles: StrategyProfile[]): StrategyOverviewResponse | null {
    const activeProfile =
      profiles.find((item) => item.isDefault) ||
      profiles.find((item) => item.isActive) ||
      profiles[0] ||
      null;

    if (!activeProfile) {
      return null;
    }

    return {
      profiles,
      activeProfile,
      configSummary: {
        formulaCount: 0,
        screenRuleCount: 0,
        alertRuleCount: 0,
        checklistCount: 0,
        versionCount: 0,
      },
      rankings: {
        page: 1,
        pageSize: 0,
        total: 0,
        items: [],
      },
      screener: {
        page: 1,
        pageSize: 0,
        total: 0,
        items: [],
      },
      risk: {
        profile: activeProfile,
        summaryCards: [],
        highRiskItems: [],
      },
      journal: [],
    };
  }

  private buildJournalRows(entries: StrategyJournalEntry[]): DashboardV2JournalRowVm[] {
    return [...entries]
      .filter((entry) => Boolean(entry && entry.symbol))
      .sort((left, right) => this.resolveJournalTimestamp(right) - this.resolveJournalTimestamp(left) || right.id - left.id)
      .slice(0, 12)
      .map((entry) => {
        const trade = this.computeTradeMetrics(entry);
        return {
          id: entry.id,
          date: this.formatDate(entry.tradeDate || null),
          symbol: entry.symbol.toUpperCase(),
          sideLabel: this.tradeSideLabel(entry.tradeSide),
          tradeLabel: this.getTradeLabel(entry),
          note: this.buildJournalNote(entry),
          capitalLabel: this.formatMoney(trade.capital),
          pnlLabel: this.formatSignedMoney(trade.pnl),
          pnlTone: trade.pnl > 0 ? 'positive' : trade.pnl < 0 ? 'danger' : 'default',
          resultLabel: trade.isOpen
            ? this.t('dashboardV2.result.open')
            : trade.pnl > 0
              ? this.t('dashboardV2.result.profit')
              : trade.pnl < 0
                ? this.t('dashboardV2.result.loss')
                : this.t('dashboardV2.result.flat'),
        };
      });
  }

  private buildJournalNote(entry: StrategyJournalEntry): string {
    const parts = [entry.strategyName, entry.notes, entry.psychology]
      .map((value) => (value || '').trim())
      .filter(Boolean);
    return parts[0] || this.t('dashboardV2.empty.note');
  }

  private buildAlertItems(alerts: MarketAlertItem[]): DashboardV2AlertVm[] {
    return [...alerts]
      .sort((left, right) => new Date(right.time || 0).getTime() - new Date(left.time || 0).getTime())
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        title: item.title,
        message: item.message || item.prediction || '',
        symbol: item.symbol || this.t('dashboardV2.marketSymbolFallback'),
        timeLabel: this.formatRelativeTime(item.time),
        severity: item.severity,
        confidenceLabel: `${this.decimal.format(Number(item.confidence || 0))}%`,
        directionLabel: item.direction === 'up'
          ? this.t('dashboardV2.direction.bullish')
          : item.direction === 'down'
            ? this.t('dashboardV2.direction.bearish')
            : this.t('dashboardV2.direction.neutral'),
        changeLabel: this.formatSignedPercent(item.change_percent),
        priceLabel: item.price != null ? this.formatMoney(item.price) : '--',
        tags: (item.tags || []).slice(0, 3),
      }));
  }

  private buildPriorityItems(
    entries: StrategyJournalEntry[],
    overview: MarketAlertsOverviewResponse | null,
    newsItems: MarketAlertNewsItem[]
  ): DashboardV2PriorityVm[] {
    const journalSymbols = new Set(entries.map((item) => item.symbol?.toUpperCase()).filter(Boolean));
    const items: DashboardV2PriorityVm[] = [];

    if (overview?.watchlist_headline) {
      items.push({
        key: `headline-watchlist-${this.selectedExchange}`,
        title: this.t('dashboardV2.priority.journalHeadline'),
        body: overview.watchlist_headline,
        meta: this.selectedExchange,
        tone: 'warning',
      });
    } else if (overview?.headline) {
      items.push({
        key: `headline-market-${this.selectedExchange}`,
        title: this.t('dashboardV2.priority.marketHeadline'),
        body: overview.headline,
        meta: this.selectedExchange,
        tone: 'default',
      });
    }

    for (const item of overview?.alerts || []) {
      if (!item.symbol || !journalSymbols.has(item.symbol.toUpperCase())) {
        continue;
      }

      items.push({
        key: `alert-${item.id}`,
        title: `${item.symbol} - ${item.title}`,
        body: item.message || item.prediction || '',
        meta: `${this.formatRelativeTime(item.time)} / ${item.severity}`,
        tone: item.severity === 'critical' ? 'danger' : item.severity === 'warning' ? 'warning' : 'default',
      });
    }

    for (const item of newsItems) {
      const relatedHit = (item.related_symbols || []).some((symbol) => journalSymbols.has((symbol || '').toUpperCase()));
      if (!relatedHit) {
        continue;
      }

      items.push({
        key: `news-${item.title}-${item.published_at || ''}`,
        title: this.t('dashboardV2.priority.newsLinked'),
        body: item.title,
        meta: `${this.newsScopeLabel(item)} / ${item.published_at || '--'}`,
        tone: 'positive',
      });
    }

    if (!items.length) {
      const fallbackNews = newsItems[0];
      if (fallbackNews) {
        items.push({
          key: 'fallback-news',
          title: this.t('dashboardV2.priority.importantNews'),
          body: fallbackNews.title,
          meta: fallbackNews.published_at || '--',
          tone: 'default',
        });
      }
    }

    return items.slice(0, 6);
  }

  private buildAiAnalysisItems(overview: MarketAlertsOverviewResponse | null): DashboardV2PriorityVm[] {
    const outlook = overview?.market_outlook;
    const items: DashboardV2PriorityVm[] = [];

    if (outlook) {
      items.push({
        key: `ai-outlook-${overview?.exchange || this.selectedExchange}`,
        title: outlook.title || this.t('dashboardV2.ai.outlookTitle'),
        body: outlook.summary || this.t('dashboardV2.ai.outlookBody'),
        meta: `${this.t('dashboardV2.ai.confidence')} ${this.decimal.format(Number(outlook.confidence || 0))}%`,
        tone: outlook.direction === 'up' ? 'positive' : outlook.direction === 'down' ? 'danger' : 'default',
      });
    }

    if (overview?.headline || overview?.watchlist_headline) {
      items.push({
        key: `ai-headline-${overview.exchange || this.selectedExchange}`,
        title: this.t('dashboardV2.ai.keyFinding'),
        body: overview.watchlist_headline || overview.headline,
        meta: overview.generated_at || this.selectedExchange,
        tone: overview.watchlist_headline ? 'warning' : 'default',
      });
    }

    items.push({
      key: `ai-source-${overview?.provider || 'fallback'}`,
      title: this.t('dashboardV2.ai.dataSource'),
      body: overview
        ? `${overview.provider || 'Fallback'} / ${overview.model || '--'}`
        : this.t('dashboardV2.ai.waitingData'),
      meta: overview?.used_fallback ? this.t('dashboardV2.ai.fallback') : this.t('dashboardV2.ai.live'),
      tone: overview?.used_fallback ? 'warning' : 'positive',
    });

    if (this.dataHealthIssues.length) {
      items.push({
        key: 'ai-data-health',
        title: this.t('dashboardV2.ai.dataHealth'),
        body: this.dataHealthIssues.slice(0, 2).join(' / '),
        meta: this.t('dashboardV2.ai.needsReview'),
        tone: 'warning',
      });
    }

    return items.slice(0, 5);
  }

  private applyAlertNarrative(): void {
    const outlook = this.alertsOverview?.market_outlook;
    const headline = this.alertsOverview?.watchlist_headline || this.alertsOverview?.headline || '';

    this.journalHeadline = this.overview?.activeProfile?.name
      ? `${this.t('dashboardV2.section.journal')} - ${this.overview.activeProfile.name}`
      : this.t('dashboardV2.section.journal');
    this.journalSubtitle = this.t('dashboardV2.journalSubtitle');
    this.outlookTitle = outlook?.title || headline || this.t('dashboardV2.outlook.emptyTitle');
    this.outlookSummary = outlook?.summary || headline || this.t('dashboardV2.outlook.emptySummary');
    this.outlookDirection = outlook?.direction || 'neutral';
    this.outlookConfidence = Number(outlook?.confidence || 0);
    this.activeProfileLabel = this.overview?.activeProfile?.name || this.t('dashboardV2.profile.empty');
    this.resetInsightPanel();
  }

  private computeStats(entries: StrategyJournalEntry[]): DashboardV2StatsVm {
    let totalCapital = 0;
    let realizedProfit = 0;
    let realizedLoss = 0;
    let openCapital = 0;
    let openCount = 0;
    let closedCount = 0;
    let winCount = 0;
    let lossCount = 0;

    for (const entry of entries) {
      const trade = this.computeTradeMetrics(entry);
      totalCapital += trade.capital;

      if (trade.isOpen) {
        openCount += 1;
        openCapital += trade.capital;
        continue;
      }

      closedCount += 1;
      if (trade.pnl > 0) {
        realizedProfit += trade.pnl;
        winCount += 1;
      } else if (trade.pnl < 0) {
        realizedLoss += Math.abs(trade.pnl);
        lossCount += 1;
      }
    }

    const netPnl = realizedProfit - realizedLoss;
    const winRate = closedCount > 0 ? winCount / closedCount : 0;

    return {
      totalCapital,
      realizedProfit,
      realizedLoss,
      netPnl,
      winRate,
      openCount,
      closedCount,
      winCount,
      lossCount,
      openCapital,
    };
  }

  private computeTradeMetrics(entry: StrategyJournalEntry): {
    capital: number;
    pnl: number;
    isOpen: boolean;
  } {
    const quantity = Number(entry.quantity || 0);
    const entryPrice = Number(entry.entryPrice || 0);
    const exitPrice = Number(entry.exitPrice || 0);
    const capital =
      Math.abs(Number(entry.totalCapital || 0)) ||
      Math.abs(entryPrice * quantity) ||
      Math.abs(Number(entry.positionSize || 0));
    const isOpen = !entry.exitPrice || !Number.isFinite(exitPrice) || exitPrice === 0;
    const sideMultiplier = (entry.tradeSide || '').toLowerCase() === 'sell' ? -1 : 1;
    const pnl = isOpen ? 0 : sideMultiplier * (exitPrice - entryPrice) * quantity;

    return {
      capital,
      pnl,
      isOpen,
    };
  }

  private buildDecisionNarratives(item: StrategyScoredItem): DashboardV2DetailNarrativeVm[] {
    const narratives: DashboardV2DetailNarrativeVm[] = [];
    const winningRule =
      this.findRuleResult(item.layerResults, ['score']) ||
      this.findRuleResult(item.checklistResults, ['winning_score']);
    const marginRule =
      this.findRuleResult(item.checklistResults, ['margin']) ||
      this.findRuleResult(item.alertResults, ['margin_safety_low']);
    const qualityRule = this.findRuleResult(item.checklistResults, ['business_quality']);
    const breakoutRule =
      this.findRuleResult(item.layerResults, ['breakout_volume']) ||
      this.findRuleResult(item.layerResults, ['price_action']);

    if (winningRule) {
      narratives.push({
        label: this.t('dashboardV2.narrative.winningScore'),
        status: winningRule.passed ? 'pass' : 'fail',
        detail: this.buildRuleNarrative(
          winningRule,
          `${this.t('dashboardV2.current.now')} ${item.winningScore.toFixed(2)}`,
          this.t('dashboardV2.narrativeDetail.winningScorePass'),
          this.t('dashboardV2.narrativeDetail.winningScoreFail')
        ),
      });
    }

    if (marginRule) {
      narratives.push({
        label: this.t('dashboardV2.narrative.marginSafety'),
        status: marginRule.passed ? 'pass' : 'fail',
        detail: this.buildRuleNarrative(
          marginRule,
          `${this.t('dashboardV2.current.now')} ${(item.marginOfSafety * 100).toFixed(1)}%`,
          this.t('dashboardV2.narrativeDetail.marginPass'),
          this.t('dashboardV2.narrativeDetail.marginFail')
        ),
      });
    }

    if (qualityRule) {
      narratives.push({
        label: this.t('dashboardV2.narrative.businessQuality'),
        status: qualityRule.passed ? 'pass' : 'fail',
        detail: this.buildRuleNarrative(
          qualityRule,
          `${this.t('dashboardV2.current.qScore')} ${item.qScore.toFixed(2)}`,
          this.t('dashboardV2.narrativeDetail.qualityPass'),
          this.t('dashboardV2.narrativeDetail.qualityFail')
        ),
      });
    }

    if (breakoutRule) {
      narratives.push({
        label: this.t('dashboardV2.narrative.technicalConfirmation'),
        status: breakoutRule.passed ? 'pass' : 'warn',
        detail: this.buildRuleNarrative(
          breakoutRule,
          `${this.t('dashboardV2.current.mScore')} ${item.mScore.toFixed(2)}`,
          this.t('dashboardV2.narrativeDetail.technicalPass'),
          this.t('dashboardV2.narrativeDetail.technicalFail')
        ),
      });
    }

    return narratives;
  }

  private buildDetailGroups(
    config: StrategyProfileConfigResponse | null,
    score: StrategyScoredItem | null
  ): DashboardV2DetailGroupVm[] {
    if (!config) {
      return [];
    }

    return [
      {
        title: this.t('dashboardV2.group.formulas'),
        items: this.mapFormulaItems(config.formulas || [], score),
      },
      {
        title: this.t('dashboardV2.group.screenRules'),
        items: this.mapRuleItems('screen', config.screenRules || [], score?.layerResults || []),
      },
      {
        title: this.t('dashboardV2.group.alertRules'),
        items: this.mapRuleItems('alert', config.alertRules || [], score?.alertResults || []),
      },
      {
        title: this.t('dashboardV2.group.checklist'),
        items: this.mapRuleItems('checklist', config.checklists || [], score?.checklistResults || []),
      },
    ].filter((group) => group.items.length);
  }

  private mapFormulaItems(formulas: StrategyFormula[], score: StrategyScoredItem | null): DashboardV2DetailItemVm[] {
    return formulas
      .filter((item) => item.isEnabled)
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((item) => ({
        key: `formula-${item.id}`,
        label: item.label,
        expression: item.expression,
        detail: this.resolveFormulaDetail(item, score),
        status: 'na',
        kind: 'formula',
      }));
  }

  private mapRuleItems(
    kind: 'screen' | 'alert' | 'checklist',
    items: Array<StrategyScreenRule | StrategyAlertRule | StrategyChecklistItem>,
    results: StrategyRuleResult[]
  ): DashboardV2DetailItemVm[] {
    return items
      .filter((item) => item.isEnabled)
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((item) => {
        const ruleCode = 'ruleCode' in item ? item.ruleCode : item.itemCode;
        const result = this.findRuleResult(results, [ruleCode]);
        return {
          key: `${kind}-${item.id}`,
          label: item.label,
          expression: item.expression,
          detail: result ? this.buildResultDetail(result) : this.parameterSummary(item.parameters),
          status: result ? this.resolveResultStatus(result) : 'na',
          kind,
        };
      });
  }

  private buildResultDetail(result: StrategyRuleResult): string {
    const threshold = this.describeRuleThreshold(result);
    const message = (result.message || '').trim();
    if (threshold && message) {
      return `${message} / ${threshold}`;
    }
    return message || threshold || this.t('dashboardV2.detail.noEvaluation');
  }

  private resolveResultStatus(result: StrategyRuleResult): 'pass' | 'fail' | 'warn' {
    if (result.passed) {
      return 'pass';
    }
    return result.isRequired ? 'fail' : 'warn';
  }

  private resolveFormulaDetail(formula: StrategyFormula, score: StrategyScoredItem | null): string {
    if (!score) {
      return this.parameterSummary(formula.parameters);
    }

    const code = (formula.formulaCode || '').toLowerCase();
    if (code.includes('winning')) {
      return `${this.t('dashboardV2.current.winningScore')} ${score.winningScore.toFixed(2)}`;
    }
    if (code.includes('margin')) {
      return `${this.t('dashboardV2.current.margin')} ${(score.marginOfSafety * 100).toFixed(1)}%`;
    }
    if (code.includes('q_score') || code.includes('quality')) {
      return `${this.t('dashboardV2.current.qScore')} ${score.qScore.toFixed(2)}`;
    }
    if (code.includes('m_score') || code.includes('momentum')) {
      return `${this.t('dashboardV2.current.mScore')} ${score.mScore.toFixed(2)}`;
    }
    if (code.includes('risk')) {
      return `${this.t('dashboardV2.current.riskScore')} ${score.riskScore.toFixed(2)}`;
    }
    if (code.includes('fair')) {
      return `${this.t('dashboardV2.current.fairValue')} ${this.formatMoney(score.fairValue)}`;
    }
    return this.parameterSummary(formula.parameters);
  }

  private buildSnapshotMetrics(entry: StrategyJournalEntry | null): DashboardV2MetricChipVm[] {
    const snapshot = entry?.signalSnapshot || {};
    const metrics: DashboardV2MetricChipVm[] = [];

    const addMetric = (label: string, rawValue: unknown, formatter?: (value: number) => string): void => {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) {
        return;
      }
      metrics.push({
        label,
        value: formatter ? formatter(value) : this.decimal.format(value),
        tone: 'default',
      });
    };

    addMetric(this.t('dashboardV2.metric.winning'), snapshot['winningScore']);
    addMetric(this.t('dashboardV2.metric.qScore'), snapshot['qScore']);
    addMetric(this.t('dashboardV2.metric.mScore'), snapshot['mScore']);
    addMetric(this.t('dashboardV2.metric.risk'), snapshot['riskScore']);
    addMetric(this.t('dashboardV2.metric.margin'), snapshot['marginOfSafety'], (value) => `${this.decimal.format(value * 100)}%`);

    return metrics;
  }

  private buildCurrentMetrics(score: StrategyScoredItem | null): DashboardV2MetricChipVm[] {
    if (!score) {
      return [];
    }

    return [
      { label: this.t('dashboardV2.metric.winning'), value: score.winningScore.toFixed(2), tone: score.winningScore >= 0 ? 'positive' : 'default' },
      { label: this.t('dashboardV2.metric.qScore'), value: score.qScore.toFixed(2), tone: score.qScore >= 0 ? 'positive' : 'default' },
      { label: this.t('dashboardV2.metric.mScore'), value: score.mScore.toFixed(2), tone: score.mScore >= 0 ? 'positive' : 'default' },
      { label: this.t('dashboardV2.metric.risk'), value: score.riskScore.toFixed(2), tone: score.riskScore > 0.5 ? 'warning' : 'default' },
      { label: this.t('dashboardV2.metric.margin'), value: `${this.decimal.format(score.marginOfSafety * 100)}%`, tone: score.marginOfSafety > 0 ? 'positive' : 'warning' },
    ];
  }

  private findRuleResult(results: StrategyRuleResult[], codes: string[]): StrategyRuleResult | null {
    return results.find((item) => codes.includes(item.ruleCode)) || null;
  }

  private buildRuleNarrative(
    rule: StrategyRuleResult,
    currentValueText: string,
    passPrefix: string,
    failPrefix: string
  ): string {
    const thresholdText = this.describeRuleThreshold(rule);
    const prefix = rule.passed ? passPrefix : failPrefix;
    return thresholdText
      ? `${prefix}. ${currentValueText}. ${this.t('dashboardV2.detail.threshold')}: ${thresholdText}.`
      : `${prefix}. ${currentValueText}.`;
  }

  private describeRuleThreshold(rule: StrategyRuleResult): string {
    if (!rule.parameters?.length) {
      return '';
    }

    const parameter = rule.parameters[0];
    const valueLabel = this.getParameterValueLabel(parameter);
    if (!valueLabel) {
      return '';
    }

    return `${parameter.label} = ${valueLabel}`;
  }

  private parameterSummary(parameters: StrategyParameter[]): string {
    if (!parameters?.length) {
      return this.t('dashboardV2.detail.noParameters');
    }

    return parameters
      .slice(0, 3)
      .map((item) => `${item.label}: ${this.getParameterValueLabel(item)}`)
      .join(' / ');
  }

  private getParameterValueLabel(parameter: StrategyParameter): string {
    if (parameter.value === null || parameter.value === undefined || parameter.value === '') {
      return '';
    }
    if (typeof parameter.value === 'boolean') {
      return parameter.value ? this.t('dashboardV2.toggle.on') : this.t('dashboardV2.toggle.off');
    }
    if (typeof parameter.value === 'number') {
      return Number.isFinite(parameter.value) ? this.decimal.format(parameter.value) : '';
    }
    return String(parameter.value);
  }

  private tradeSideLabel(side: string): string {
    const value = (side || '').toLowerCase();
    if (value === 'buy') return this.t('dashboardV2.side.buy');
    if (value === 'sell') return this.t('dashboardV2.side.sell');
    return side || this.t('dashboardV2.side.na');
  }

  private getTradeLabel(entry: StrategyJournalEntry): string {
    const classification = (entry.classification || '').trim();
    const strategy = (entry.strategyName || '').trim();

    if (classification && strategy) {
      return `${classification} / ${strategy}`;
    }
    if (classification) {
      return classification;
    }
    if (strategy) {
      return strategy;
    }
    return this.t('dashboardV2.trade.unspecified');
  }

  private formatMoney(value: number | null | undefined): string {
    const safeValue = Number(value || 0);
    if (!Number.isFinite(safeValue)) {
      return '0';
    }
    return this.currency.format(Math.round(safeValue));
  }

  private formatSignedMoney(value: number | null | undefined): string {
    const safeValue = Number(value || 0);
    const sign = safeValue > 0 ? '+' : '';
    return `${sign}${this.formatMoney(safeValue)}`;
  }

  private formatPercent(value: number | null | undefined): string {
    const safeValue = Number(value || 0) * 100;
    return `${this.percent.format(safeValue)}%`;
  }

  private formatSignedPercent(value: number | null | undefined): string {
    const safeValue = Number(value || 0);
    if (!Number.isFinite(safeValue)) {
      return '--';
    }
    const sign = safeValue > 0 ? '+' : '';
    return `${sign}${this.decimal.format(safeValue)}%`;
  }

  private formatDate(value: string | null | undefined): string {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).format(date);
  }

  private formatRelativeTime(value: string | null | undefined): string {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
    if (diffMinutes < 60) {
      return `${diffMinutes}${this.t('dashboardV2.time.minuteAgo')}`;
    }
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}${this.t('dashboardV2.time.hourAgo')}`;
    }
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}${this.t('dashboardV2.time.dayAgo')}`;
  }

  private applyStoredSettings(): void {
    this.applySettings(this.auth.preferences);
  }

  private applySettings(settings: MarketSettingsData | null): void {
    if (!settings) {
      return;
    }

    if (
      settings.defaultExchange === 'ALL' ||
      settings.defaultExchange === 'HSX' ||
      settings.defaultExchange === 'HNX' ||
      settings.defaultExchange === 'UPCOM'
    ) {
      this.selectedExchange = settings.defaultExchange;
    }

    this.compactTableEnabled = settings.compactTable;
    this.stickyHeaderEnabled = settings.stickyHeader;
    this.applyAutoRefresh();
  }

  private applyAutoRefresh(): void {
    this.stopAutoRefresh();
    const seconds = Number(this.auth.preferences?.autoRefreshSeconds || 0);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }

    this.refreshHandle = window.setInterval(() => {
      if (!this.activeView) {
        return;
      }
      this.loadDashboard(true, true);
    }, seconds * 1000);
  }

  private stopAutoRefresh(): void {
    if (this.refreshHandle) {
      window.clearInterval(this.refreshHandle);
      this.refreshHandle = null;
    }
  }

  setInsightPanel(title: string, body: string, meta = ''): void {
    this.insightPanel = { title, body, meta };
  }

  private applyDefaultCopy(): void {
    this.journalHeadline = this.t('dashboardV2.section.journal');
    this.journalSubtitle = this.t('dashboardV2.journalSubtitle');
    this.outlookTitle = this.t('dashboardV2.outlook.emptyTitle');
    this.outlookSummary = this.t('dashboardV2.outlook.emptySummary');
    this.activeProfileLabel = this.t('dashboardV2.profile.empty');
    this.resetInsightPanel();
  }

  private buildDataHealthSummary(entries: StrategyJournalEntry[]): string {
    return this.t('dashboardV2.dataHealth.summary')
      .replace('{profile}', this.overview?.activeProfile?.name || this.t('dashboardV2.profile.empty'))
      .replace('{journal}', `${entries.length}`)
      .replace('{alerts}', `${this.alertItems.length}`)
      .replace('{news}', `${this.newsItems.length}`);
  }

  private buildDataHealthIssues(
    overview: StrategyOverviewResponse | null,
    alerts: MarketAlertsOverviewResponse | null,
    entries: StrategyJournalEntry[]
  ): string[] {
    const issues: string[] = [];

    if (!overview?.activeProfile?.id) {
      issues.push(this.t('dashboardV2.dataHealth.issue.profile'));
    }

    if (this.selectedExchange !== 'ALL' && alerts?.exchange && alerts.exchange !== this.selectedExchange) {
      issues.push(this.t('dashboardV2.dataHealth.issue.exchange'));
    }

    if (entries.some((item) => !item.symbol)) {
      issues.push(this.t('dashboardV2.dataHealth.issue.journalSymbol'));
    }

    if ((alerts?.alerts || []).some((item) => !item.id || !item.title)) {
      issues.push(this.t('dashboardV2.dataHealth.issue.alertPayload'));
    }

    return issues;
  }

  private t(key: string): string {
    return this.i18n.translate(key);
  }

  private scheduleChartRender(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
    }

    this.renderTimer = window.setTimeout(() => this.renderActiveChart(), 0);
  }

  private destroyChart(): void {
    try {
      this.insightChart?.destroy();
    } catch {}
    this.insightChart = null;
  }

  private renderActiveChart(): void {
    const el = document.getElementById('dashboard-v2-chart-host');
    if (!el || typeof ApexCharts === 'undefined') {
      return;
    }

    this.destroyChart();

    if (this.selectedChartTab === 'allocation') {
      this.renderAllocationChart(el);
      return;
    }

    if (this.selectedChartTab === 'equity') {
      this.renderEquityChart(el);
      return;
    }

    this.renderOutcomeChart(el);
  }

  private renderAllocationChart(container: HTMLElement): void {
    const series = [this.stats.totalCapital, this.stats.realizedProfit, this.stats.realizedLoss, this.stats.openCapital];
    const hasData = series.some((item) => item > 0);

    this.insightChart = new ApexCharts(container, {
      chart: {
        type: 'donut',
        height: 315,
        toolbar: { show: false },
        fontFamily: 'inherit',
      },
      series: hasData ? series : [1, 0, 0, 0],
      labels: [
        this.t('dashboardV2.metric.capital'),
        this.t('dashboardV2.metric.profit'),
        this.t('dashboardV2.metric.loss'),
        this.t('dashboardV2.metric.open'),
      ],
      colors: ['#111827', '#0f766e', '#dc2626', '#64748b'],
      dataLabels: { enabled: false },
      legend: {
        position: 'bottom',
        fontSize: '12px',
      },
      plotOptions: {
        pie: {
          donut: {
            size: '72%',
            labels: {
              show: true,
              total: {
                show: true,
                label: this.t('dashboardV2.metric.netPnl'),
                formatter: () => this.formatSignedMoney(this.stats.netPnl),
              },
            },
          },
        },
      },
      stroke: { width: 0 },
      tooltip: {
        y: {
          formatter: (value: number) => this.formatMoney(value),
        },
      },
    });

    this.insightChart.render();
  }

  private renderEquityChart(container: HTMLElement): void {
    const trend = this.buildEquityTrend();
    const areaData = trend.length ? trend : [{ x: Date.now(), y: 0 }];

    this.insightChart = new ApexCharts(container, {
      chart: {
        type: 'area',
        height: 315,
        toolbar: { show: false },
        fontFamily: 'inherit',
      },
      series: [{ name: this.t('dashboardV2.metric.cumulativePnl'), data: areaData }],
      colors: ['#111827'],
      stroke: {
        curve: 'smooth',
        width: 2.5,
      },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 0.35,
          opacityFrom: 0.22,
          opacityTo: 0.02,
          stops: [0, 90, 100],
        },
      },
      grid: {
        borderColor: 'rgba(148, 163, 184, 0.18)',
      },
      xaxis: {
        type: 'datetime',
      },
      yaxis: {
        labels: {
          formatter: (value: number) => this.formatMoney(value),
        },
      },
      dataLabels: { enabled: false },
      tooltip: {
        x: { format: 'dd/MM/yy' },
        y: {
          formatter: (value: number) => this.formatSignedMoney(value),
        },
      },
    });

    this.insightChart.render();
  }

  private renderOutcomeChart(container: HTMLElement): void {
    this.insightChart = new ApexCharts(container, {
      chart: {
        type: 'bar',
        height: 315,
        toolbar: { show: false },
        fontFamily: 'inherit',
      },
      series: [
        {
          name: this.t('dashboardV2.metric.trades'),
          data: [this.stats.winCount, this.stats.lossCount, this.stats.openCount],
        },
      ],
      colors: ['#0f766e'],
      plotOptions: {
        bar: {
          borderRadius: 6,
          horizontal: true,
          distributed: true,
        },
      },
      dataLabels: { enabled: false },
      xaxis: {
        categories: [
          this.t('dashboardV2.metric.wins'),
          this.t('dashboardV2.metric.losses'),
          this.t('dashboardV2.metric.open'),
        ],
      },
      grid: {
        borderColor: 'rgba(148, 163, 184, 0.18)',
      },
    });

    this.insightChart.render();
  }

  private buildEquityTrend(): DashboardV2TrendPoint[] {
    const rawEntries = [...this.journalEntries]
      .filter((entry) => Boolean(entry && entry.symbol))
      .sort((left, right) => this.resolveJournalTimestamp(left) - this.resolveJournalTimestamp(right) || left.id - right.id);

    let runningPnl = 0;
    const result: DashboardV2TrendPoint[] = [];

    for (const entry of rawEntries) {
      const metrics = this.computeTradeMetrics(entry);
      if (!metrics.isOpen) {
        runningPnl += metrics.pnl;
      }

      const time = this.resolveJournalTimestamp(entry);
      result.push({
        x: Number.isFinite(time) ? time : Date.now(),
        y: runningPnl,
      });
    }

    return result.slice(-24);
  }

  private resolveJournalTimestamp(entry: StrategyJournalEntry): number {
    const date = entry.tradeDate ? new Date(entry.tradeDate).getTime() : NaN;
    if (Number.isFinite(date)) {
      return date;
    }
    return entry.id || Date.now();
  }
}
