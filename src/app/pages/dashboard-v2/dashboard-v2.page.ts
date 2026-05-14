import { Component, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subscription, forkJoin, of } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';
import { AppI18nService } from 'src/app/core/i18n/app-i18n.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { BackgroundRefreshService } from 'src/app/core/services/background-refresh.service';

import {
  ApiEnvelope,
  ExchangeTab,
  MarketSettingsData,
  MarketAlertEventItem,
  MarketAlertItem,
  MarketAlertNewsItem,
  MarketAlertsOverviewResponse,
  MarketDataQualityIssue,
  MarketExchangeRule,
  MarketSyncJobStatus,
  MarketSyncStatusData,
  StrategyAlertRule,
  StrategyChecklistItem,
  StrategyDriver,
  StrategyFormula,
  StrategyFormulaVerdict,
  StrategyActionHistoryItem,
  StrategyActionHistoryResponse,
  StrategyJournalEntry,
  StrategyActionWorkflowOverviewResponse,
  StrategyOperationsOverviewResponse,
  StrategyPortfolioOverviewResponse,
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
type DashboardJournalWorkspaceTab = 'journal' | 'operations' | 'portfolio' | 'workflow' | 'history';
type DashboardJournalPagerKey =
  | 'journal'
  | 'operations-open'
  | 'operations-actions'
  | 'portfolio-holdings'
  | 'portfolio-alerts'
  | 'workflow-suggestions'
  | 'workflow-pending'
  | 'history';
type DashboardConfigEntity = StrategyFormula | StrategyScreenRule | StrategyAlertRule | StrategyChecklistItem;
type DashboardExchange = ExchangeTab | 'ALL';

interface DashboardV2JournalRowVm {
  id: number;
  timestamp: number;
  date: string;
  symbol: string;
  isOpen: boolean;
  sideLabel: string;
  setupLabel: string;
  strategyLabel: string;
  note: string;
  workflowReason: string;
  capitalValue: number;
  capitalLabel: string;
  pnlValue: number;
  pnlLabel: string;
  pnlTone: 'positive' | 'danger' | 'default';
  resultTone: 'open' | 'profit' | 'loss' | 'flat';
  resultLabel: string;
  portfolioStateLabel: string;
  portfolioStateTone: 'positive' | 'warning' | 'default';
  workflowStateLabel: string;
  workflowStateTone: 'positive' | 'warning' | 'default';
  hasWorkflowOpen: boolean;
  hasWorkflowSuggested: boolean;
}

type DashboardV2JournalSortBy = 'date' | 'capital' | 'pnl';
type DashboardV2JournalSortDir = 'desc' | 'asc';
type DashboardV2JournalFilter = 'all' | 'open' | 'profit' | 'loss';

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

interface DashboardV2OperationRowVm {
  id: number;
  symbol: string;
  actionLabel: string;
  actionTone: 'default' | 'positive' | 'warning' | 'danger';
  capitalLabel: string;
  pnlLabel: string;
  pnlTone: 'positive' | 'danger' | 'default';
  currentPriceLabel: string;
  helper: string;
}

interface DashboardV2ActionVm {
  key: string;
  title: string;
  body: string;
  tone: 'default' | 'positive' | 'warning' | 'danger';
  symbol: string;
}

interface DashboardV2HoldingVm {
  symbol: string;
  strategyLabel: string;
  industryLabel: string;
  marketValueLabel: string;
  costBasisLabel: string;
  unrealizedLabel: string;
  unrealizedTone: 'positive' | 'danger' | 'default';
  exposureLabel: string;
}

interface DashboardV2ExposureVm {
  label: string;
  valueLabel: string;
  weightLabel: string;
}

interface DashboardV2PortfolioAlertVm {
  key: string;
  title: string;
  body: string;
  tone: 'default' | 'positive' | 'warning' | 'danger';
}

interface DashboardV2WorkflowSuggestionVm {
  sourceType: string;
  sourceKey: string;
  journalEntryId?: number | null;
  symbol: string;
  actionCode: string;
  actionLabel: string;
  executionMode: 'manual' | 'automatic';
  title: string;
  body: string;
  tone: 'default' | 'positive' | 'warning' | 'danger';
  existingActionId?: number | null;
  existingStatus?: string | null;
}

interface DashboardV2WorkflowActionVm {
  id: number;
  symbol: string;
  title: string;
  body: string;
  tone: 'default' | 'positive' | 'warning' | 'danger';
  status: string;
  runtimeLabel: string;
  runtimeTone: 'positive' | 'warning' | 'default';
  executionMode: 'manual' | 'automatic';
  sourceLabel: string;
  createdAtLabel: string;
  updatedAtLabel: string;
  note: string;
  resolutionType: string | null;
}

interface DashboardV2WorkflowHistoryVm {
  id: number;
  symbol: string;
  title: string;
  status: string;
  runtimeLabel: string;
  runtimeTone: 'positive' | 'warning' | 'default';
  effectLabel: string;
  effectTone: 'default' | 'positive' | 'warning' | 'danger';
  sourceLabel: string;
  actionLabel: string;
  executionMode: 'manual' | 'automatic';
  processLabel: string;
  handledBy: string;
  handledAtLabel: string;
  handledPriceLabel: string;
  currentPriceLabel: string;
  effectPctLabel: string;
  effectValueLabel: string;
  note: string;
  basis: string;
  auditSummary: string[];
  resolutionType: string | null;
}

interface DashboardV2SymbolHistoryVm {
  key: string;
  kind: 'journal' | 'workflow';
  title: string;
  subtitle: string;
  body: string;
  meta: string[];
  tone: 'default' | 'positive' | 'warning' | 'danger';
  timestamp: number;
}

interface DashboardV2SymbolIntelligenceVm {
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

@Component({
  selector: 'app-dashboard-v2',
  templateUrl: './dashboard-v2.page.html',
  styleUrls: ['./dashboard-v2.page.scss'],
  standalone: false,
})
export class DashboardV2Page implements OnInit, OnDestroy {
  private readonly alertPageSizes: Record<DashboardAlertTab, number> = {
    priority: 6,
    alerts: 8,
    news: 6,
    ai: 4,
  };
  private journalWorkspacePageSizes: Record<DashboardJournalPagerKey, number> = {
    journal: 10,
    'operations-open': 6,
    'operations-actions': 6,
    'portfolio-holdings': 6,
    'portfolio-alerts': 5,
    'workflow-suggestions': 5,
    'workflow-pending': 5,
    history: 6,
  };

  readonly exchangeOptions: DashboardV2ExchangeOption[] = [
    { value: 'ALL', label: 'Tất cả sàn' },
    { value: 'HSX', label: 'HSX' },
    { value: 'HNX', label: 'HNX' },
    { value: 'UPCOM', label: 'UPCOM' },
  ];
  readonly journalPageSizeOptions = [5, 10, 15];

  loading = false;
  error = '';
  selectedExchange: DashboardExchange = 'ALL';
  selectedChartTab: DashboardChartTab = 'allocation';
  selectedAlertTab: DashboardAlertTab = 'priority';
  selectedJournalWorkspaceTab: DashboardJournalWorkspaceTab = 'journal';
  compactTableEnabled = true;
  stickyHeaderEnabled = true;
  dataHealthIssues: string[] = [];
  dataHealthSummary = '';
  exchangeSessionSummary = '';
  insightPanel: DashboardV2InsightVm = { title: '', body: '', meta: '' };

  overview: StrategyOverviewResponse | null = null;
  alertsOverview: MarketAlertsOverviewResponse | null = null;
  syncStatus: MarketSyncStatusData | null = null;
  exchangeRules: MarketExchangeRule[] = [];
  dataQualityOpenIssues: MarketDataQualityIssue[] = [];
  pendingAlertEvents: MarketAlertEventItem[] = [];

  journalRows: DashboardV2JournalRowVm[] = [];
  journalSortBy: DashboardV2JournalSortBy = 'date';
  journalSortDir: DashboardV2JournalSortDir = 'desc';
  journalFilter: DashboardV2JournalFilter = 'all';
  alertItems: DashboardV2AlertVm[] = [];
  priorityItems: DashboardV2PriorityVm[] = [];
  aiAnalysisItems: DashboardV2PriorityVm[] = [];
  newsItems: MarketAlertNewsItem[] = [];
  operationsOverview: StrategyOperationsOverviewResponse | null = null;
  portfolioOverview: StrategyPortfolioOverviewResponse | null = null;
  workflowOverview: StrategyActionWorkflowOverviewResponse | null = null;
  workflowHistoryOverview: StrategyActionHistoryResponse | null = null;
  openPositionRows: DashboardV2OperationRowVm[] = [];
  reviewQueueRows: DashboardV2OperationRowVm[] = [];
  nextActionItems: DashboardV2ActionVm[] = [];
  holdingRows: DashboardV2HoldingVm[] = [];
  exposureByStrategyRows: DashboardV2ExposureVm[] = [];
  exposureByIndustryRows: DashboardV2ExposureVm[] = [];
  portfolioAlertItems: DashboardV2PortfolioAlertVm[] = [];
  jobHealthAlerts: DashboardV2PriorityVm[] = [];
  workflowSuggestionItems: DashboardV2WorkflowSuggestionVm[] = [];
  workflowPendingItems: DashboardV2WorkflowActionVm[] = [];
  workflowHistoryItems: DashboardV2WorkflowHistoryVm[] = [];
  workflowBusyKey = '';
  jobHealthSummary = '';
  jobHealthCheckedLabel = '';
  alertTabPages: Record<DashboardAlertTab, number> = {
    priority: 1,
    alerts: 1,
    news: 1,
    ai: 1,
  };
  journalWorkspacePages: Record<DashboardJournalPagerKey, number> = {
    journal: 1,
    'operations-open': 1,
    'operations-actions': 1,
    'portfolio-holdings': 1,
    'portfolio-alerts': 1,
    'workflow-suggestions': 1,
    'workflow-pending': 1,
    history: 1,
  };
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
  symbolDetailFormulaLoading = false;
  symbolDetailFormulaError = '';
  symbolDetailFormulaGroups: DashboardV2DetailGroupVm[] = [];
  symbolDetailFormulaMetrics: DashboardV2MetricChipVm[] = [];
  symbolDetailFormulaVerdict: StrategyFormulaVerdict | null = null;
  symbolDetailIntelligence: DashboardV2SymbolIntelligenceVm | null = null;
  symbolDetailHistoryItems: DashboardV2SymbolHistoryVm[] = [];

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
  private dashboardSupplementalSub?: Subscription;
  private alertsSub?: Subscription;
  private detailSub?: Subscription;
  private symbolFormulaSub?: Subscription;
  private backgroundSub?: Subscription;
  private insightChart: any;
  private journalEntries: StrategyJournalEntry[] = [];
  private hasInitialLoad = false;
  private refreshHandle: ReturnType<typeof window.setInterval> | null = null;
  private activeView = false;
  private readonly dashboardRequestTimeoutMs = 6000;

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
    this.dashboardSupplementalSub?.unsubscribe();
    this.alertsSub?.unsubscribe();
    this.detailSub?.unsubscribe();
    this.symbolFormulaSub?.unsubscribe();
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

  createWorkflowAction(item: DashboardV2WorkflowSuggestionVm, executionMode: 'manual' | 'automatic' = 'manual'): void {
    const busyKey = `create:${item.sourceKey}:${executionMode}`;
    if (this.workflowBusyKey === busyKey) {
      return;
    }
    this.workflowBusyKey = busyKey;
    this.api.createStrategyActionWorkflow({
      profile_id: this.overview?.activeProfile?.id || null,
      journal_entry_id: item.journalEntryId || null,
      symbol: item.symbol || null,
      exchange: this.selectedExchange === 'ALL' ? null : this.selectedExchange,
      source_type: item.sourceType,
      source_key: item.sourceKey,
      action_code: item.actionCode,
      action_label: item.actionLabel,
      execution_mode: executionMode,
      severity: item.tone === 'danger' ? 'critical' : item.tone === 'warning' ? 'warning' : 'info',
      title: item.title,
      message: item.body,
      metadata_json: { executionMode },
    }).subscribe({
      next: () => {
        this.workflowBusyKey = '';
        this.loadDashboard(true, true);
      },
      error: () => {
        this.workflowBusyKey = '';
        this.error = this.t('dashboardV2.error.load');
      },
    });
  }

  completeWorkflowAction(item: DashboardV2WorkflowActionVm, resolutionType: string): void {
    const busyKey = `update:${item.id}:${resolutionType}`;
    if (this.workflowBusyKey === busyKey) {
      return;
    }
    this.workflowBusyKey = busyKey;
    this.api.updateStrategyActionWorkflowStatus(item.id, {
      status: 'completed',
      resolution_type: resolutionType,
      resolution_note: `${resolutionType}: ${item.title}`,
    }).subscribe({
      next: () => {
        this.workflowBusyKey = '';
        this.loadDashboard(true, true);
      },
      error: () => {
        this.workflowBusyKey = '';
        this.error = this.t('dashboardV2.error.load');
      },
    });
  }

  dismissWorkflowAction(item: DashboardV2WorkflowActionVm): void {
    const busyKey = `dismiss:${item.id}`;
    if (this.workflowBusyKey === busyKey) {
      return;
    }
    this.workflowBusyKey = busyKey;
    this.api.updateStrategyActionWorkflowStatus(item.id, {
      status: 'dismissed',
      resolution_type: 'dismissed',
      resolution_note: `Dismissed: ${item.title}`,
    }).subscribe({
      next: () => {
        this.workflowBusyKey = '';
        this.loadDashboard(true, true);
      },
      error: () => {
        this.workflowBusyKey = '';
        this.error = this.t('dashboardV2.error.load');
      },
    });
  }

  updateWorkflowNote(item: DashboardV2WorkflowActionVm): void {
    const currentNote = item.note || item.body || '';
    const nextNote = window.prompt(this.t('dashboardV2.workflow.notePrompt'), currentNote);
    if (nextNote === null) {
      return;
    }
    const trimmed = nextNote.trim();
    const busyKey = `note:${item.id}`;
    if (this.workflowBusyKey === busyKey) {
      return;
    }
    this.workflowBusyKey = busyKey;
    this.api.updateStrategyActionWorkflowStatus(item.id, {
      status: 'open',
      resolution_type: item.resolutionType || item.status || 'open',
      resolution_note: trimmed,
    }).subscribe({
      next: () => {
        this.workflowBusyKey = '';
        this.loadDashboard(true, true);
      },
      error: () => {
        this.workflowBusyKey = '';
        this.error = this.t('dashboardV2.error.load');
      },
    });
  }

  reopenWorkflowAction(item: DashboardV2WorkflowHistoryVm): void {
    const busyKey = `reopen:${item.id}`;
    if (this.workflowBusyKey === busyKey) {
      return;
    }
    this.workflowBusyKey = busyKey;
    this.api.updateStrategyActionWorkflowStatus(item.id, {
      status: 'open',
      resolution_type: item.resolutionType || item.status || 'open',
      resolution_note: `${this.t('dashboardV2.workflow.reopenedNote')}: ${item.title}`,
    }).subscribe({
      next: () => {
        this.workflowBusyKey = '';
        this.loadDashboard(true, true);
      },
      error: () => {
        this.workflowBusyKey = '';
        this.error = this.t('dashboardV2.error.load');
      },
    });
  }

  canCreateWorkflowFromRow(row: DashboardV2JournalRowVm): boolean {
    return row.isOpen && !row.hasWorkflowOpen;
  }

  createJournalWorkflow(row: DashboardV2JournalRowVm, event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();

    const busyKey = `journal-workflow:${row.id}`;
    if (this.workflowBusyKey === busyKey) {
      return;
    }

    const entry = this.journalEntries.find((item) => item.id === row.id) || null;
    if (!entry) {
      this.error = this.t('dashboardV2.detail.error.entry');
      return;
    }

    this.workflowBusyKey = busyKey;
    this.api.createStrategyActionWorkflow({
      profile_id: entry.profileId || null,
      journal_entry_id: entry.id,
      symbol: entry.symbol,
      exchange: entry.exchange || null,
      source_type: 'journal_operation',
      source_key: `journal:${entry.id}:manual_review`,
      action_code: 'review',
      action_label: this.t('dashboardV2.workflow.followAction'),
      execution_mode: 'manual',
      severity: 'warning',
      title: `${(entry.symbol || '').toUpperCase()}: ${this.t('dashboardV2.workflow.followAction')}`,
      message: entry.notes || entry.psychology || this.t('dashboardV2.workflow.manualReviewHelp'),
      metadata_json: {
        trigger: 'journal_manual',
        classification: entry.classification || null,
        tradeSide: entry.tradeSide || null,
      },
    }).subscribe({
      next: () => {
        this.workflowBusyKey = '';
        this.loadDashboard(true, true);
      },
      error: () => {
        this.workflowBusyKey = '';
        this.error = this.t('dashboardV2.error.load');
      },
    });
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
    this.ensureAlertPageWithinBounds(tab);
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

  currentAlertItemsCount(tab: DashboardAlertTab): number {
    return this.getAlertTabItems(tab).length;
  }

  currentAlertPageItems(tab: DashboardAlertTab): Array<DashboardV2PriorityVm | DashboardV2AlertVm | MarketAlertNewsItem> {
    const items = this.getAlertTabItems(tab);
    const pageSize = this.alertPageSizes[tab];
    const currentPage = this.alertTabPages[tab];
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }

  currentAlertPage(tab: DashboardAlertTab): number {
    return this.alertTabPages[tab];
  }

  totalAlertPages(tab: DashboardAlertTab): number {
    const total = this.getAlertTabItems(tab).length;
    return Math.max(1, Math.ceil(total / this.alertPageSizes[tab]));
  }

  canMoveAlertPage(tab: DashboardAlertTab, delta: number): boolean {
    const nextPage = this.alertTabPages[tab] + delta;
    return nextPage >= 1 && nextPage <= this.totalAlertPages(tab);
  }

  moveAlertPage(tab: DashboardAlertTab, delta: number): void {
    if (!this.canMoveAlertPage(tab, delta)) {
      return;
    }
    this.alertTabPages[tab] += delta;
  }

  pagedOpenPositionRows(): DashboardV2OperationRowVm[] {
    return this.currentJournalWorkspacePageItems('operations-open', this.openPositionRows);
  }

  pagedNextActionItems(): DashboardV2ActionVm[] {
    return this.currentJournalWorkspacePageItems('operations-actions', this.nextActionItems);
  }

  pagedHoldingRows(): DashboardV2HoldingVm[] {
    return this.currentJournalWorkspacePageItems('portfolio-holdings', this.holdingRows);
  }

  pagedPortfolioAlertItems(): DashboardV2PortfolioAlertVm[] {
    return this.currentJournalWorkspacePageItems('portfolio-alerts', this.portfolioAlertItems);
  }

  pagedWorkflowSuggestionItems(): DashboardV2WorkflowSuggestionVm[] {
    return this.currentJournalWorkspacePageItems('workflow-suggestions', this.workflowSuggestionItems);
  }

  pagedWorkflowPendingItems(): DashboardV2WorkflowActionVm[] {
    return this.currentJournalWorkspacePageItems('workflow-pending', this.workflowPendingItems);
  }

  pagedWorkflowHistoryItems(): DashboardV2WorkflowHistoryVm[] {
    return this.currentJournalWorkspacePageItems('history', this.workflowHistoryItems);
  }

  pagedVisibleJournalRows(): DashboardV2JournalRowVm[] {
    return this.currentJournalWorkspacePageItems('journal', this.visibleJournalRows());
  }

  journalPageSize(): number {
    return this.journalWorkspacePageSizes.journal;
  }

  journalPageRangeLabel(): string {
    const total = this.visibleJournalRows().length;
    if (!total) {
      return '0 / 0';
    }
    const currentPage = this.currentJournalWorkspacePage('journal', total);
    const pageSize = this.journalWorkspacePageSizes.journal;
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(total, start + pageSize - 1);
    return `${start}-${end} / ${total}`;
  }

  onJournalPageSizeChange(event: Event): void {
    const nextSize = Number((event.target as HTMLSelectElement | null)?.value || 10);
    if (!Number.isFinite(nextSize) || nextSize <= 0) {
      return;
    }
    this.journalWorkspacePageSizes.journal = nextSize;
    this.journalWorkspacePages.journal = 1;
    this.ensureJournalWorkspacePageWithinBounds('journal', this.visibleJournalRows().length);
  }

  currentJournalWorkspacePage(key: DashboardJournalPagerKey, total: number): number {
    this.ensureJournalWorkspacePageWithinBounds(key, total);
    return this.journalWorkspacePages[key];
  }

  totalJournalWorkspacePages(key: DashboardJournalPagerKey, total: number): number {
    return Math.max(1, Math.ceil(total / this.journalWorkspacePageSizes[key]));
  }

  canMoveJournalWorkspacePage(key: DashboardJournalPagerKey, total: number, delta: number): boolean {
    const nextPage = this.currentJournalWorkspacePage(key, total) + delta;
    return nextPage >= 1 && nextPage <= this.totalJournalWorkspacePages(key, total);
  }

  moveJournalWorkspacePage(key: DashboardJournalPagerKey, total: number, delta: number): void {
    if (!this.canMoveJournalWorkspacePage(key, total, delta)) {
      return;
    }
    this.journalWorkspacePages[key] = this.currentJournalWorkspacePage(key, total) + delta;
  }

  pagedPriorityItems(): DashboardV2PriorityVm[] {
    return this.currentAlertPageItems('priority') as DashboardV2PriorityVm[];
  }

  pagedAlertItems(): DashboardV2AlertVm[] {
    return this.currentAlertPageItems('alerts') as DashboardV2AlertVm[];
  }

  pagedNewsItems(): MarketAlertNewsItem[] {
    return this.currentAlertPageItems('news') as MarketAlertNewsItem[];
  }

  pagedAiAnalysisItems(): DashboardV2PriorityVm[] {
    return this.currentAlertPageItems('ai') as DashboardV2PriorityVm[];
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
    this.symbolDetailHistoryItems = this.buildSymbolHistoryItems(normalized);
    this.symbolDetailIntelligence = this.buildSymbolIntelligence(normalized);
    this.loadSymbolFormulaDetail(normalized);
  }

  hasJournalFormulaForSymbol(symbol: string | null | undefined): boolean {
    const normalized = (symbol || '').trim().toUpperCase();
    if (!normalized) {
      return false;
    }
    return this.journalEntries.some((item) => (item.symbol || '').trim().toUpperCase() === normalized);
  }

  closeSymbolDetail(): void {
    this.symbolDetailOpen = false;
    this.symbolDetailFormulaLoading = false;
    this.symbolDetailFormulaError = '';
    this.symbolDetailFormulaGroups = [];
    this.symbolDetailFormulaMetrics = [];
    this.symbolDetailFormulaVerdict = null;
    this.symbolDetailIntelligence = null;
    this.symbolDetailHistoryItems = [];
    this.symbolFormulaSub?.unsubscribe();
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
      `${row.setupLabel}${row.strategyLabel && row.strategyLabel !== '--' ? ` / ${row.strategyLabel}` : ''}. ${row.note}`,
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

  workflowToneClass(tone?: string | null): 'default' | 'positive' | 'warning' | 'danger' {
    return tone === 'positive' ? 'positive' : tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'default';
  }

  workflowStatusClass(status?: string | null): 'positive' | 'warning' | 'default' {
    return status === 'completed' ? 'positive' : status === 'dismissed' ? 'default' : 'warning';
  }

  formatWorkflowStatusLabel(status?: string | null): string {
    switch ((status || '').toLowerCase()) {
      case 'completed':
        return this.t('marketSettings.history.statusCompleted');
      case 'dismissed':
        return this.t('marketSettings.history.statusDismissed');
      default:
        return this.t('marketSettings.history.statusOpen');
    }
  }

  workflowRuntimeClass(
    status?: string | null,
    executionMode?: 'manual' | 'automatic' | string | null
  ): 'positive' | 'warning' | 'default' {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (normalizedStatus === 'completed') {
      return 'positive';
    }
    if (normalizedStatus === 'dismissed') {
      return 'default';
    }
    const normalizedMode = String(executionMode || '').trim().toLowerCase();
    return normalizedMode === 'automatic' ? 'warning' : 'default';
  }

  formatWorkflowRuntimeLabel(
    status?: string | null,
    executionMode?: 'manual' | 'automatic' | string | null
  ): string {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (normalizedStatus === 'completed') {
      return this.t('dashboardV2.workflow.runtime.done');
    }
    if (normalizedStatus === 'dismissed') {
      return this.t('dashboardV2.workflow.runtime.stopped');
    }
    const normalizedMode = String(executionMode || '').trim().toLowerCase();
    if (normalizedMode === 'automatic') {
      return this.t('dashboardV2.workflow.runtime.running');
    }
    return this.t('dashboardV2.workflow.runtime.waiting');
  }

  formatHistoryActionLabel(item: StrategyActionHistoryItem): string {
    const normalized = String(item.resolutionType || item.actionCode || '').trim().toLowerCase();
    switch (normalized) {
      case 'take_profit':
        return this.t('dashboardV2.workflow.doneTakeProfit');
      case 'cut_loss':
        return this.t('dashboardV2.workflow.doneCutLoss');
      case 'rebalance':
        return this.t('dashboardV2.workflow.doneRebalance');
      case 'dismissed':
        return this.t('dashboardV2.workflow.dismiss');
      case 'probe_buy':
        return 'Mua thăm dò';
      case 'add_position':
        return 'Gia tăng vị thế';
      case 'review_portfolio':
        return 'Review danh mục';
      default:
        return item.actionLabel || item.actionCode || '--';
    }
  }

  formatWorkflowProcessLabel(item: StrategyActionHistoryItem): string {
    const actionLabel = this.formatHistoryActionLabel(item);
    if (item.status === 'dismissed') {
      return `${actionLabel}. ${this.t('dashboardV2.workflow.dismissedHelp')}`;
    }
    if (item.status !== 'completed') {
      return this.t('dashboardV2.workflow.manualHelp');
    }
    if (item.executionMode === 'automatic') {
      return `${actionLabel}. ${this.t('dashboardV2.workflow.automaticDoneHelp')}`;
    }
    return `${actionLabel}. ${this.t('dashboardV2.workflow.manualDoneHelp')}`;
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

  trackByWorkflowHistory(_: number, item: DashboardV2WorkflowHistoryVm): number {
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
      { label: this.t('dashboardV2.fact.entry'), value: this.formatJournalEntryPriceLabel(entry) },
      { label: this.t('dashboardV2.fact.exit'), value: this.formatJournalExitPriceLabel(entry) },
      { label: this.t('dashboardV2.fact.stopLoss'), value: this.formatJournalStopLossPriceLabel(entry) },
      { label: this.t('dashboardV2.fact.takeProfit'), value: this.formatJournalTakeProfitPriceLabel(entry) },
      { label: this.t('dashboardV2.fact.quantity'), value: this.formatNullableNumber(entry.quantity) },
      { label: this.t('dashboardV2.fact.capital'), value: this.formatNullableMoney(entry.totalCapital) },
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
    this.dashboardSupplementalSub?.unsubscribe();
    this.alertsSub?.unsubscribe();

    this.dashboardSub = forkJoin({
      profiles: this.safeList(this.api.listStrategyProfiles()),
      journal: this.safeList(this.api.listStrategyJournal(18)),
      syncStatus: this.safeNullable(this.api.getSyncStatus()),
    }).subscribe({
      next: ({ profiles, journal, syncStatus }) => {
        this.overview = this.buildLightOverview(profiles.data);
        this.syncStatus = syncStatus.data || null;
        this.jobHealthAlerts = this.buildJobHealthAlerts(this.syncStatus);
        this.jobHealthSummary = this.buildJobHealthSummary(this.syncStatus, this.jobHealthAlerts);
        this.jobHealthCheckedLabel = this.formatRelativeTime(this.syncStatus?.checkedAt);

        const journalEntries = journal.data || [];
        this.journalEntries = journalEntries;
        this.journalRows = this.buildJournalRows(journalEntries);
        this.stats = this.computeStats(journalEntries);
        this.ensureAllJournalWorkspacePagesWithinBounds();
        this.applyAlertsState();
        this.applyAlertNarrative();

        this.loading = false;
        this.scheduleChartRender();
        this.loadSupplementalDashboardData();
      },
      error: () => {
        this.loading = false;
        this.error = this.t('dashboardV2.error.load');
      },
    });
  }

  private loadSupplementalDashboardData(): void {
    this.dashboardSupplementalSub?.unsubscribe();

    this.dashboardSupplementalSub = forkJoin({
      operations: this.safeNullable(
        this.api.getStrategyOperationsOverview({
          exchange: this.selectedExchange,
          limit: 120,
        })
      ),
      portfolio: this.safeNullable(
        this.api.getStrategyPortfolioOverview({
          exchange: this.selectedExchange,
          limit: 300,
        })
      ),
      workflow: this.safeNullable(
        this.api.getStrategyActionWorkflowOverview({
          exchange: this.selectedExchange,
          limit: 100,
        })
      ),
      workflowHistory: this.safeNullable(
        this.api.getStrategyActionHistory({
          exchange: this.selectedExchange,
          days: 7,
          limit: 80,
        })
      ),
      rules: this.safeList(this.api.getExchangeRules()),
      dataQuality: this.safeList(this.api.getDataQualityIssues(80)),
      alertEvents: this.safeList(this.api.getAlertEvents('pending', 60)),
    }).subscribe({
      next: ({ operations, portfolio, workflow, workflowHistory, rules, dataQuality, alertEvents }) => {
        this.exchangeRules = rules.data || [];
        this.dataQualityOpenIssues = this.filterFoundationByExchange(dataQuality.data || []);
        this.pendingAlertEvents = this.filterFoundationByExchange(alertEvents.data || []);
        this.operationsOverview = operations.data || null;
        this.openPositionRows = this.buildOperationRows(this.operationsOverview?.openPositions || []);
        this.reviewQueueRows = this.buildOperationRows(this.operationsOverview?.reviewQueue || []);
        this.nextActionItems = this.buildActionItems(this.operationsOverview);
        this.portfolioOverview = portfolio.data || null;
        this.holdingRows = this.buildHoldingRows(this.portfolioOverview);
        this.exposureByStrategyRows = this.buildExposureRows(this.portfolioOverview?.exposureByStrategy || []);
        this.exposureByIndustryRows = this.buildExposureRows(this.portfolioOverview?.exposureByIndustry || []);
        this.portfolioAlertItems = this.buildPortfolioAlertItems(this.portfolioOverview);
        this.workflowOverview = workflow.data || null;
        this.workflowSuggestionItems = this.buildWorkflowSuggestionItems(this.workflowOverview);
        this.workflowPendingItems = this.buildWorkflowPendingItems(this.workflowOverview);
        this.workflowHistoryOverview = workflowHistory.data || null;
        this.workflowHistoryItems = this.buildWorkflowHistoryItems(this.workflowHistoryOverview);
        this.journalRows = this.buildJournalRows(this.journalEntries);
        this.ensureAllJournalWorkspacePagesWithinBounds();
        if (this.symbolDetailOpen && this.symbolDetailSymbol) {
          this.symbolDetailHistoryItems = this.buildSymbolHistoryItems(this.symbolDetailSymbol);
          this.symbolDetailIntelligence = this.buildSymbolIntelligence(this.symbolDetailSymbol);
        }
        this.applyAlertsState();
        this.applyAlertNarrative();
        this.scheduleChartRender();
        this.loadAlertsOverview(true);
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
      .filter((item, index, arr) => arr.findIndex((candidate) => candidate.url === item.url && candidate.title === item.title) === index);
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
      headline: `Tá»•ng há»£p ${items.length} sĂ n: ${alerts.length} cáº£nh bĂ¡o, ${newsItems.length} tin liĂªn quan.`,
      watchlist_headline: watchlistSymbols.length
        ? `${watchlistSymbols.length} mĂ£ watchlist Ä‘ang Ä‘Æ°á»£c theo dĂµi trĂªn toĂ n thá»‹ trÆ°á»ng.`
        : 'ChÆ°a cĂ³ mĂ£ watchlist ná»•i báº­t trĂªn toĂ n thá»‹ trÆ°á»ng.',
      summary_cards: [
        { label: 'Tá»•ng cáº£nh bĂ¡o', value: `${alerts.length}`, tone: alerts.length ? 'warning' : 'default', helper: 'Gá»™p HSX, HNX vĂ  UPCOM' },
        { label: 'Æ¯u tiĂªn cao', value: `${criticalCount}`, tone: criticalCount ? 'danger' : 'default', helper: 'Sá»‘ cáº£nh bĂ¡o critical toĂ n thá»‹ trÆ°á»ng' },
        { label: 'Watchlist', value: `${watchlistAlertCount}`, tone: watchlistAlertCount ? 'positive' : 'default', helper: 'Cáº£nh bĂ¡o liĂªn quan danh sĂ¡ch theo dĂµi' },
      ],
      market_outlook: {
        title: 'Outlook toĂ n thá»‹ trÆ°á»ng',
        summary: `Gá»™p dá»¯ liá»‡u HSX, HNX vĂ  UPCOM. HÆ°á»›ng chĂ­nh: ${dominantDirection}.`,
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

  private filterFoundationByExchange<T extends { exchange?: string | null }>(items: T[]): T[] {
    if (this.selectedExchange === 'ALL') {
      return items;
    }
    return items.filter((item) => (item.exchange || '').toUpperCase() === this.selectedExchange);
  }

  private buildDataQualityIssues(): string[] {
    return this.dataQualityOpenIssues.map((issue) => {
      const target = issue.symbol || issue.exchange || issue.scope;
      return `${target}: ${issue.message}`;
    });
  }

  journalFilterItems(): Array<{ key: DashboardV2JournalFilter; label: string }> {
    return [
      { key: 'all', label: this.t('dashboardV2.journalFilter.all') },
      { key: 'open', label: this.t('dashboardV2.journalFilter.open') },
      { key: 'profit', label: this.t('dashboardV2.journalFilter.profit') },
      { key: 'loss', label: this.t('dashboardV2.journalFilter.loss') },
    ];
  }

  journalWorkspaceItems(): Array<{ key: DashboardJournalWorkspaceTab; label: string; count: number }> {
    return [
      { key: 'journal', label: this.t('dashboardV2.workspace.journal'), count: this.journalRows.length },
      { key: 'operations', label: this.t('dashboardV2.workspace.operations'), count: this.operationsOverview?.totals.openCount || 0 },
      { key: 'portfolio', label: this.t('dashboardV2.workspace.portfolio'), count: this.portfolioOverview?.totals.holdingCount || 0 },
      { key: 'workflow', label: this.t('dashboardV2.workspace.workflow'), count: this.workflowOverview?.counts.pending || 0 },
      { key: 'history', label: this.t('dashboardV2.workspace.history'), count: this.workflowHistoryItems.length },
    ];
  }

  isJournalWorkspaceTab(tab: DashboardJournalWorkspaceTab): boolean {
    return this.selectedJournalWorkspaceTab === tab;
  }

  changeJournalWorkspaceTab(tab: DashboardJournalWorkspaceTab): void {
    this.selectedJournalWorkspaceTab = tab;
  }

  journalSortItems(): Array<{ key: DashboardV2JournalSortBy; label: string }> {
    return [
      { key: 'date', label: this.t('dashboardV2.journalSort.date') },
      { key: 'capital', label: this.t('dashboardV2.journalSort.capital') },
      { key: 'pnl', label: this.t('dashboardV2.journalSort.pnl') },
    ];
  }

  setJournalFilter(filter: DashboardV2JournalFilter): void {
    this.journalFilter = filter;
    this.journalWorkspacePages.journal = 1;
  }

  setJournalSortBy(sortBy: DashboardV2JournalSortBy): void {
    this.journalSortBy = sortBy;
    this.journalWorkspacePages.journal = 1;
  }

  onJournalSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement | null)?.value as DashboardV2JournalSortBy | '';
    if (value === 'date' || value === 'capital' || value === 'pnl') {
      this.setJournalSortBy(value);
    }
  }

  toggleJournalSortDir(): void {
    this.journalSortDir = this.journalSortDir === 'desc' ? 'asc' : 'desc';
    this.journalWorkspacePages.journal = 1;
  }

  visibleJournalRows(): DashboardV2JournalRowVm[] {
    const filtered = this.journalRows.filter((row) => {
      if (this.journalFilter === 'all') {
        return true;
      }
      return row.resultTone === this.journalFilter;
    });

    const factor = this.journalSortDir === 'desc' ? -1 : 1;
    return [...filtered].sort((left, right) => {
      let delta = 0;
      if (this.journalSortBy === 'capital') {
        delta = left.capitalValue - right.capitalValue;
      } else if (this.journalSortBy === 'pnl') {
        delta = left.pnlValue - right.pnlValue;
      } else {
        delta = left.timestamp - right.timestamp;
      }
      if (delta === 0) {
        delta = left.id - right.id;
      }
      return delta * factor;
    });
  }

  journalResultCount(filter: DashboardV2JournalFilter): number {
    if (filter === 'all') {
      return this.journalRows.length;
    }
    return this.journalRows.filter((row) => row.resultTone === filter).length;
  }

  private buildExchangeSessionSummary(): string {
    const rules = this.selectedExchange === 'ALL'
      ? this.exchangeRules
      : this.exchangeRules.filter((rule) => rule.exchange === this.selectedExchange);
    if (!rules.length) {
      return '';
    }

    return rules
      .map((rule) => {
        const session = this.resolveCurrentSession(rule);
        return `${rule.exchange}: ${session}`;
      })
      .join(' / ');
  }

  private resolveCurrentSession(rule: MarketExchangeRule): string {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    if (now.getDay() === 0 || now.getDay() === 6) {
      return 'nghỉ cuối tuần';
    }
    for (const session of rule.trading_sessions || []) {
      const start = this.sessionMinutes(session['start']);
      const end = this.sessionMinutes(session['end']);
      if (minutes >= start && minutes < end) {
        return session['is_break'] ? 'nghỉ giữa phiên' : (session['label'] || session['code'] || 'đang giao dịch');
      }
    }
    return 'đóng cửa';
  }

  private sessionMinutes(value: string | null | undefined): number {
    if (!value || !value.includes(':')) {
      return 0;
    }
    const [hour, minute] = value.split(':').map((part) => Number(part));
    return hour * 60 + minute;
  }

  private applyAlertsState(): void {
    this.alertItems = [
      ...this.buildAlertItems(this.alertsOverview?.alerts || []),
      ...this.buildAlertItemsFromEvents(this.pendingAlertEvents),
    ];
    this.newsItems = this.alertsOverview?.news_items || [];
    this.priorityItems = [
      ...this.buildFoundationPriorityItems(),
      ...this.buildPriorityItems(this.journalEntries, this.alertsOverview, this.newsItems),
    ];
    this.dataHealthIssues = [
      ...this.buildDataQualityIssues(),
      ...this.buildDataHealthIssues(this.overview, this.alertsOverview, this.journalEntries),
    ].slice(0, 6);
    this.dataHealthSummary = this.buildDataHealthSummary(this.journalEntries);
    this.exchangeSessionSummary = this.buildExchangeSessionSummary();
    this.aiAnalysisItems = this.buildAiAnalysisItems(this.alertsOverview);
    this.ensureAllAlertPagesWithinBounds();
  }

  private safeNullable<T>(source$: Observable<ApiEnvelope<T | null>>): Observable<ApiEnvelope<T | null>> {
    return source$.pipe(
      timeout(this.dashboardRequestTimeoutMs),
      catchError(() => of({ data: null } as ApiEnvelope<T | null>))
    );
  }

  private safeList<T>(source$: Observable<ApiEnvelope<T[]>>): Observable<ApiEnvelope<T[]>> {
    return source$.pipe(
      timeout(this.dashboardRequestTimeoutMs),
      catchError(() => of({ data: [] as T[] } as ApiEnvelope<T[]>))
    );
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
      .map((entry) => {
        const trade = this.computeTradeMetrics(entry);
        const journalState = this.resolveJournalWorkflowState(entry, trade.isOpen);
        const resultTone: DashboardV2JournalRowVm['resultTone'] = entry.resultLabel
          ? this.resolveJournalResultTone(entry.resultLabel)
          : trade.isOpen
            ? 'open'
            : trade.pnl > 0
              ? 'profit'
              : trade.pnl < 0
                ? 'loss'
                : 'flat';
        return {
          id: entry.id,
          timestamp: this.resolveJournalTimestamp(entry),
          date: this.formatDate(entry.tradeDate || null),
          symbol: entry.symbol.toUpperCase(),
          isOpen: trade.isOpen,
          sideLabel: this.tradeSideLabel(entry.tradeSide),
          setupLabel: (entry.classification || '').trim() || this.t('dashboardV2.trade.unspecified'),
          strategyLabel: (entry.strategyName || '').trim() || '--',
          note: this.buildJournalNote(entry),
          workflowReason: journalState.reason,
          capitalValue: trade.capital,
          capitalLabel: this.formatMoney(trade.capital),
          pnlValue: trade.pnl,
          pnlLabel: this.formatSignedMoney(trade.pnl),
          pnlTone: trade.pnl > 0 ? 'positive' : trade.pnl < 0 ? 'danger' : 'default',
          resultTone,
          resultLabel: entry.resultLabel || (
            trade.isOpen
              ? this.t('dashboardV2.result.open')
              : trade.pnl > 0
                ? this.t('dashboardV2.result.profit')
                : trade.pnl < 0
                  ? this.t('dashboardV2.result.loss')
                  : this.t('dashboardV2.result.flat')
          ),
          portfolioStateLabel: journalState.portfolioLabel,
          portfolioStateTone: journalState.portfolioTone,
          workflowStateLabel: journalState.workflowLabel,
          workflowStateTone: journalState.workflowTone,
          hasWorkflowOpen: journalState.hasWorkflowOpen,
          hasWorkflowSuggested: journalState.hasWorkflowSuggested,
        };
      });
  }

  private resolveJournalWorkflowState(
    entry: StrategyJournalEntry,
    isOpen: boolean
  ): {
    portfolioLabel: string;
    portfolioTone: 'positive' | 'warning' | 'default';
    workflowLabel: string;
    workflowTone: 'positive' | 'warning' | 'default';
    reason: string;
    hasWorkflowOpen: boolean;
    hasWorkflowSuggested: boolean;
  } {
    const symbol = (entry.symbol || '').trim().toUpperCase();
    const holding = (this.portfolioOverview?.holdings || []).find((item) => (item.symbol || '').trim().toUpperCase() === symbol) || null;
    const pendingWorkflow = (this.workflowOverview?.pendingActions || []).find((item) => Number(item.journalEntryId || 0) === entry.id)
      || (this.workflowOverview?.pendingActions || []).find((item) => (item.symbol || '').trim().toUpperCase() === symbol)
      || null;
    const suggestedWorkflow = (this.workflowOverview?.suggestedActions || []).find((item) => Number(item.journalEntryId || 0) === entry.id)
      || (this.workflowOverview?.suggestedActions || []).find((item) => (item.symbol || '').trim().toUpperCase() === symbol)
      || null;
    const historyWorkflow = (this.workflowHistoryOverview?.items || []).find((item) => Number(item.journalEntryId || 0) === entry.id)
      || (this.workflowHistoryOverview?.items || []).find((item) => (item.symbol || '').trim().toUpperCase() === symbol)
      || null;

    const portfolioLabel = !isOpen
      ? this.t('dashboardV2.journalState.closed')
      : holding
        ? this.t('dashboardV2.journalState.inPortfolio')
        : this.t('dashboardV2.journalState.openOnly');
    const portfolioTone: 'positive' | 'warning' | 'default' = !isOpen ? 'default' : holding ? 'positive' : 'warning';

    if (pendingWorkflow) {
      return {
        portfolioLabel,
        portfolioTone,
        workflowLabel: this.t('dashboardV2.journalState.workflowOpen'),
        workflowTone: 'warning',
        reason: pendingWorkflow.message || pendingWorkflow.title || this.t('dashboardV2.journalReason.workflowOpen'),
        hasWorkflowOpen: true,
        hasWorkflowSuggested: false,
      };
    }

    if (suggestedWorkflow) {
      return {
        portfolioLabel,
        portfolioTone,
        workflowLabel: this.t('dashboardV2.journalState.workflowSuggested'),
        workflowTone: 'warning',
        reason: suggestedWorkflow.message || suggestedWorkflow.title || this.t('dashboardV2.journalReason.workflowSuggested'),
        hasWorkflowOpen: false,
        hasWorkflowSuggested: true,
      };
    }

    if (historyWorkflow && !isOpen) {
      return {
        portfolioLabel,
        portfolioTone,
        workflowLabel: this.t('dashboardV2.journalState.workflowHandled'),
        workflowTone: 'positive',
        reason: historyWorkflow.resolutionNote || historyWorkflow.message || this.t('dashboardV2.journalReason.workflowHandled'),
        hasWorkflowOpen: false,
        hasWorkflowSuggested: false,
      };
    }

    if (!isOpen) {
      return {
        portfolioLabel,
        portfolioTone,
        workflowLabel: this.t('dashboardV2.journalState.noWorkflowNeeded'),
        workflowTone: 'default',
        reason: this.t('dashboardV2.journalReason.closedEntry'),
        hasWorkflowOpen: false,
        hasWorkflowSuggested: false,
      };
    }

    if (!entry.stopLossPrice && !entry.takeProfitPrice) {
      return {
        portfolioLabel,
        portfolioTone,
        workflowLabel: this.t('dashboardV2.journalState.noWorkflowYet'),
        workflowTone: 'default',
        reason: this.t('dashboardV2.journalReason.noTrigger'),
        hasWorkflowOpen: false,
        hasWorkflowSuggested: false,
      };
    }

    if (entry.reviewReasons?.length) {
      return {
        portfolioLabel,
        portfolioTone,
        workflowLabel: this.t('dashboardV2.journalState.noWorkflowYet'),
        workflowTone: 'default',
        reason: entry.reviewReasons[0],
        hasWorkflowOpen: false,
        hasWorkflowSuggested: false,
      };
    }

    return {
      portfolioLabel,
      portfolioTone,
      workflowLabel: this.t('dashboardV2.journalState.noWorkflowYet'),
      workflowTone: 'default',
      reason: this.t('dashboardV2.journalReason.normalOpen'),
      hasWorkflowOpen: false,
      hasWorkflowSuggested: false,
    };
  }

  private resolveJournalResultTone(value: string | null | undefined): DashboardV2JournalRowVm['resultTone'] {
    const normalized = (value || '').trim().toLowerCase();
    if (normalized.includes('open') || normalized.includes('mở')) {
      return 'open';
    }
    if (normalized.includes('profit') || normalized.includes('lãi') || normalized.includes('loi')) {
      return 'profit';
    }
    if (normalized.includes('loss') || normalized.includes('lỗ') || normalized.includes('lo')) {
      return 'loss';
    }
    return 'flat';
  }

  private buildJournalNote(entry: StrategyJournalEntry): string {
    const parts = [entry.strategyName, entry.notes, entry.psychology]
      .map((value) => (value || '').trim())
      .filter(Boolean);
    return parts[0] || this.t('dashboardV2.empty.note');
  }

  private buildOperationRows(entries: StrategyJournalEntry[]): DashboardV2OperationRowVm[] {
    return [...entries]
      .filter((entry) => Boolean(entry?.symbol))
      .map((entry) => {
        const pnlValue = Number(entry.pnlValue || 0);
        const actionTone = this.normalizeTone(entry.actionTone);
        return {
          id: entry.id,
          symbol: entry.symbol.toUpperCase(),
          actionLabel: entry.actionLabel || this.t('dashboardV2.operations.follow'),
          actionTone,
          capitalLabel: this.formatMoney(entry.totalCapital),
          pnlLabel: this.formatSignedMoney(pnlValue),
          pnlTone: pnlValue > 0 ? 'positive' : pnlValue < 0 ? 'danger' : 'default',
          currentPriceLabel: entry.currentPrice ? this.formatMoney(entry.currentPrice) : '--',
          helper: this.buildOperationHelper(entry),
        };
      });
  }

  private buildActionItems(overview: StrategyOperationsOverviewResponse | null): DashboardV2ActionVm[] {
    return (overview?.actionItems || []).map((item) => ({
      key: item.key,
      title: item.title,
      body: item.body,
      tone: this.normalizeTone(item.tone),
      symbol: (item.symbol || '').toUpperCase(),
    }));
  }

  private buildHoldingRows(overview: StrategyPortfolioOverviewResponse | null): DashboardV2HoldingVm[] {
    return (overview?.holdings || []).map((item) => ({
      symbol: item.symbol.toUpperCase(),
      strategyLabel: item.strategies?.length ? item.strategies.join(', ') : this.t('dashboardV2.portfolio.unassignedStrategy'),
      industryLabel: item.industry || item.sector || this.t('dashboardV2.portfolio.unknownIndustry'),
      marketValueLabel: this.formatMoney(item.marketValue),
      costBasisLabel: this.formatMoney(item.costBasisValue),
      unrealizedLabel: this.formatSignedMoney(item.unrealizedPnlValue),
      unrealizedTone: item.unrealizedPnlValue > 0 ? 'positive' : item.unrealizedPnlValue < 0 ? 'danger' : 'default',
      exposureLabel: `${this.decimal.format(item.exposurePct)}%`,
    }));
  }

  private buildExposureRows(
    items: Array<{ label: string; value: number; weightPct: number }>
  ): DashboardV2ExposureVm[] {
    return items.slice(0, 6).map((item) => ({
      label: item.label,
      valueLabel: this.formatMoney(item.value),
      weightLabel: `${this.decimal.format(item.weightPct)}%`,
    }));
  }

  private buildPortfolioAlertItems(overview: StrategyPortfolioOverviewResponse | null): DashboardV2PortfolioAlertVm[] {
    return (overview?.alerts || []).map((item) => ({
      key: item.code,
      title: item.title,
      body: `${item.message} (${item.metricLabel}: ${this.decimal.format(item.metricValue)} / ${this.t('dashboardV2.portfolio.threshold')}: ${this.decimal.format(item.threshold)})`,
      tone: this.normalizeTone(item.severity === 'critical' ? 'danger' : item.severity === 'warning' ? 'warning' : 'default'),
    }));
  }

  private buildWorkflowSuggestionItems(overview: StrategyActionWorkflowOverviewResponse | null): DashboardV2WorkflowSuggestionVm[] {
    return (overview?.suggestedActions || []).map((item) => ({
      sourceType: item.sourceType,
      sourceKey: item.sourceKey,
      journalEntryId: item.journalEntryId,
      symbol: (item.symbol || '').toUpperCase(),
      actionCode: item.actionCode,
      actionLabel: item.actionLabel,
      executionMode: item.executionMode === 'automatic' ? 'automatic' : 'manual',
      title: item.title,
      body: item.message,
      tone: this.normalizeTone(item.severity === 'critical' ? 'danger' : item.severity === 'warning' ? 'warning' : 'default'),
      existingActionId: item.existingActionId,
      existingStatus: item.existingStatus,
    }));
  }

  private buildWorkflowPendingItems(overview: StrategyActionWorkflowOverviewResponse | null): DashboardV2WorkflowActionVm[] {
    return (overview?.pendingActions || []).map((item) => ({
      id: item.id,
      symbol: (item.symbol || '').toUpperCase(),
      title: item.title || item.actionLabel,
      body: item.message || '',
      tone: this.normalizeTone(item.severity === 'critical' ? 'danger' : item.severity === 'warning' ? 'warning' : 'default'),
      status: item.status,
      runtimeLabel: this.formatWorkflowRuntimeLabel(item.status, item.executionMode),
      runtimeTone: this.workflowRuntimeClass(item.status, item.executionMode),
      executionMode: item.executionMode === 'automatic' ? 'automatic' : 'manual',
      sourceLabel: item.sourceType || '--',
      createdAtLabel: item.createdAt ? this.formatDateTimeLabel(item.createdAt) : '--',
      updatedAtLabel: item.updatedAt ? this.formatDateTimeLabel(item.updatedAt) : '--',
      note: item.resolutionNote || '',
      resolutionType: item.resolutionType || null,
    }));
  }

  private buildWorkflowHistoryItems(overview: StrategyActionHistoryResponse | null): DashboardV2WorkflowHistoryVm[] {
    return (overview?.items || []).map((item) => ({
      id: item.id,
      symbol: (item.symbol || '--').toUpperCase(),
      title: item.title || item.actionLabel || item.actionCode,
      status: item.status || 'open',
      runtimeLabel: this.formatWorkflowRuntimeLabel(item.status, item.executionMode),
      runtimeTone: this.workflowRuntimeClass(item.status, item.executionMode),
      effectLabel: item.effectLabel,
      effectTone: this.workflowToneClass(item.effectTone),
      sourceLabel: item.sourceLabel || item.sourceType || '--',
      actionLabel: this.formatHistoryActionLabel(item),
      executionMode: item.executionMode === 'automatic' ? 'automatic' : 'manual',
      processLabel: this.formatWorkflowProcessLabel(item),
      handledBy: item.handledBy || '--',
      handledAtLabel: item.handledAt ? this.formatDateTimeLabel(item.handledAt) : '--',
      handledPriceLabel: this.formatNullableNumber(item.handledPrice),
      currentPriceLabel: this.formatNullableNumber(item.currentPrice),
      effectPctLabel: this.formatNullablePercent(item.effectPct),
      effectValueLabel: this.formatNullableSignedMoney(item.effectValue),
      note: item.resolutionNote || this.formatWorkflowProcessLabel(item),
      basis: item.effectBasis || '',
      resolutionType: item.resolutionType || null,
      auditSummary: (item.auditTrail || []).slice(0, 3).map((audit) => {
        const actor = audit.changedBy || '--';
        const time = audit.changedAt ? this.formatDateTimeLabel(audit.changedAt) : '--';
        return `${audit.action} / ${actor} / ${time}`;
      }),
    }));
  }

  private buildSymbolHistoryItems(symbol: string): DashboardV2SymbolHistoryVm[] {
    const normalized = (symbol || '').trim().toUpperCase();
    if (!normalized) {
      return [];
    }

    const journalItems: DashboardV2SymbolHistoryVm[] = this.journalEntries
      .filter((entry) => (entry.symbol || '').trim().toUpperCase() === normalized)
      .map((entry) => {
        const metrics = this.computeTradeMetrics(entry);
        const formulaVerdict = this.resolveJournalFormulaVerdict(entry);
        const pnlLabel = this.formatSignedMoney(metrics.pnl);
        const resultLabel = metrics.isOpen
          ? this.t('dashboardV2.result.open')
          : metrics.pnl > 0
            ? this.t('dashboardV2.result.profit')
            : metrics.pnl < 0
              ? this.t('dashboardV2.result.loss')
              : this.t('dashboardV2.result.flat');
        const timestamp = this.resolveJournalTimestamp(entry);
        return {
          key: `journal-${entry.id}`,
          kind: 'journal',
          title: `Journal #${entry.id}`,
          subtitle: `${this.tradeSideLabel(entry.tradeSide)} / ${this.getTradeLabel(entry)}`,
          body: (entry.notes || entry.psychology || '').trim(),
          meta: [
            `${this.t('dashboardV2.table.date')}: ${this.formatDate(entry.tradeDate)}`,
            `${this.t('dashboardV2.history.beforeActionPrice')}: ${this.formatJournalBeforeActionPriceLabel(entry)}`,
            `${this.t('dashboardV2.history.afterActionPrice')}: ${this.formatJournalAfterActionPriceLabel(entry)}`,
            `${this.t('dashboardV2.fact.stopLoss')}: ${this.formatJournalStopLossPriceLabel(entry)}`,
            `${this.t('dashboardV2.fact.takeProfit')}: ${this.formatJournalTakeProfitPriceLabel(entry)}`,
            `${this.t('dashboardV2.table.capital')}: ${this.formatNullableMoney(entry.totalCapital)}`,
            `${this.t('dashboardV2.table.pnl')}: ${pnlLabel}`,
            `${this.t('dashboardV2.table.result')}: ${resultLabel}`,
            ...(formulaVerdict ? [`${this.t('marketWatch.formulaVerdictTitle')}: ${this.formatFormulaVerdictSummary(formulaVerdict)}`] : []),
          ],
          tone: metrics.pnl > 0 ? 'positive' : metrics.pnl < 0 ? 'danger' : metrics.isOpen ? 'warning' : 'default',
          timestamp,
        };
      });

    const workflowItems: DashboardV2SymbolHistoryVm[] = (this.workflowHistoryOverview?.items || [])
      .filter((item) => (item.symbol || '').trim().toUpperCase() === normalized)
      .map((item) => {
        const relatedJournal = item.journalEntryId
          ? this.journalEntries.find((entry) => entry.id === item.journalEntryId) || null
          : null;
        const timestamp = item.handledAt ? new Date(item.handledAt).getTime() : item.completedAt ? new Date(item.completedAt).getTime() : item.updatedAt ? new Date(item.updatedAt).getTime() : item.createdAt ? new Date(item.createdAt).getTime() : 0;
        return {
          key: `workflow-${item.id}`,
          kind: 'workflow',
          title: this.formatHistoryActionLabel(item),
          subtitle: `${item.executionMode === 'automatic' ? this.t('dashboardV2.workflow.mode.automatic') : this.t('dashboardV2.workflow.mode.manual')} / ${this.formatWorkflowRuntimeLabel(item.status, item.executionMode)}`,
          body: item.resolutionNote || item.message || this.formatWorkflowProcessLabel(item),
          meta: [
            `${this.t('marketSettings.history.source')}: ${item.sourceLabel || item.sourceType || '--'}`,
            `${this.t('marketSettings.history.time')}: ${item.handledAt ? this.formatDateTimeLabel(item.handledAt) : '--'}`,
            `${this.t('dashboardV2.history.beforeActionPrice')}: ${this.formatWorkflowEntryPriceLabel(item, relatedJournal)}`,
            `${this.t('dashboardV2.history.afterActionPrice')}: ${this.formatWorkflowAfterPriceLabel(item, relatedJournal)}`,
            `${this.t('dashboardV2.fact.stopLoss')}: ${relatedJournal ? this.formatJournalStopLossPriceLabel(relatedJournal) : '--'}`,
            `${this.t('dashboardV2.fact.takeProfit')}: ${relatedJournal ? this.formatJournalTakeProfitPriceLabel(relatedJournal) : '--'}`,
            `${this.t('marketSettings.history.currentPrice')}: ${this.formatNullableNumber(item.currentPrice)}`,
            `${this.t('marketSettings.history.effectPct')}: ${this.formatNullablePercent(item.effectPct)}`,
          ],
          tone: this.workflowToneClass(item.effectTone),
          timestamp: Number.isFinite(timestamp) ? timestamp : 0,
        };
      });

    return [...workflowItems, ...journalItems]
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 24);
  }

  private buildSymbolIntelligence(symbol: string): DashboardV2SymbolIntelligenceVm | null {
    const normalized = (symbol || '').trim().toUpperCase();
    if (!normalized) {
      return null;
    }

    const latestJournal = [...this.journalEntries]
      .filter((entry) => (entry.symbol || '').trim().toUpperCase() === normalized)
      .sort((left, right) => this.resolveJournalTimestamp(right) - this.resolveJournalTimestamp(left) || right.id - left.id)[0] || null;
    const verdict = this.symbolDetailFormulaVerdict || this.resolveJournalFormulaVerdict(latestJournal);
    const holding = (this.portfolioOverview?.holdings || []).find((item) => (item.symbol || '').trim().toUpperCase() === normalized) || null;
    const pendingActions = (this.workflowOverview?.pendingActions || []).filter((item) => (item.symbol || '').trim().toUpperCase() === normalized);
    const suggestedActions = (this.workflowOverview?.suggestedActions || []).filter((item) => (item.symbol || '').trim().toUpperCase() === normalized);
    const historyActions = (this.workflowHistoryOverview?.items || []).filter((item) => (item.symbol || '').trim().toUpperCase() === normalized);
    const portfolioAlerts = (this.portfolioOverview?.alerts || []).filter((item) => {
      const target = (item.target || '').toUpperCase();
      const title = (item.title || '').toUpperCase();
      const message = (item.message || '').toUpperCase();
      return target.includes(normalized) || title.includes(normalized) || message.includes(normalized);
    });

    if (!verdict && !holding && !pendingActions.length && !suggestedActions.length && !historyActions.length && !portfolioAlerts.length) {
      return null;
    }

    const bullCase = [
      ...(verdict?.keyPasses || []),
      ...(holding && holding.unrealizedPnlValue > 0
        ? [
            `${this.t('dashboardV2.portfolio.unrealized')}: ${this.formatSignedMoney(holding.unrealizedPnlValue)} (${this.decimal.format(holding.unrealizedPnlPct)}%)`,
          ]
        : []),
      ...(suggestedActions
        .filter((item) => item.actionCode === 'probe_buy' || item.actionCode === 'add_position' || item.actionCode === 'candidate')
        .slice(0, 2)
        .map((item) => `${item.actionLabel}: ${item.message}`)),
    ].filter(Boolean);

    const bearCase = [
      ...(verdict?.keyFails || []),
      ...(holding && holding.unrealizedPnlValue < 0
        ? [
            `${this.t('dashboardV2.portfolio.unrealized')}: ${this.formatSignedMoney(holding.unrealizedPnlValue)} (${this.decimal.format(holding.unrealizedPnlPct)}%)`,
          ]
        : []),
      ...(pendingActions
        .filter((item) => item.actionCode === 'cut_loss' || item.actionCode === 'stand_aside' || item.actionCode === 'take_profit')
        .slice(0, 2)
        .map((item) => `${item.actionLabel}: ${item.message || item.title || '--'}`)),
    ].filter(Boolean);

    const riskItems = [
      ...(verdict?.keyAlerts || []),
      ...(holding && holding.exposurePct >= 20
        ? [`${this.t('dashboardV2.portfolio.exposureTitle')}: ${this.decimal.format(holding.exposurePct)}%`]
        : []),
      ...portfolioAlerts.slice(0, 3).map((item) => `${item.title}: ${item.message}`),
      ...(historyActions
        .filter((item) => item.effectTone === 'danger')
        .slice(0, 1)
        .map((item) => `${item.actionLabel}: ${item.effectBasis || item.resolutionNote || item.message || '--'}`)),
    ].filter(Boolean);

    const actionItems = [
      verdict ? this.buildIntelligencePrimaryAction(verdict, holding) : '',
      ...pendingActions.slice(0, 2).map((item) => `${item.actionLabel}: ${item.message || item.title || '--'}`),
      ...(!pendingActions.length
        ? suggestedActions.slice(0, 2).map((item) => `${item.actionLabel}: ${item.message}`)
        : []),
      ...(!pendingActions.length && !suggestedActions.length && !holding && verdict?.action === 'candidate'
        ? [this.t('marketWatch.intelligence.monitorCandidate')]
        : []),
    ].filter(Boolean);

    return {
      summary: verdict?.summary || verdict?.headline || this.t('marketWatch.intelligence.empty'),
      biasLabel: verdict?.bias || '--',
      actionLabel: this.formatFormulaVerdictAction(verdict),
      riskLabel: verdict?.riskLevel || '--',
      confidenceLabel: verdict ? `${this.decimal.format(verdict.confidence)}%` : '--',
      bullCase: bullCase.length ? bullCase.slice(0, 4) : [this.t('marketWatch.intelligence.emptyBull')],
      bearCase: bearCase.length ? bearCase.slice(0, 4) : [this.t('marketWatch.intelligence.emptyBear')],
      riskItems: riskItems.length ? riskItems.slice(0, 4) : [this.t('marketWatch.intelligence.emptyRisk')],
      actionItems: actionItems.length ? actionItems.slice(0, 4) : [this.t('marketWatch.intelligence.emptyAction')],
    };
  }

  private buildIntelligencePrimaryAction(
    verdict: StrategyFormulaVerdict,
    holding: StrategyPortfolioOverviewResponse['holdings'][number] | null
  ): string {
    switch (verdict.action) {
      case 'take_profit':
        return holding
          ? `${this.t('dashboardV2.workflow.doneTakeProfit')}: ${this.t('marketWatch.intelligence.reviewOpenPosition')}`
          : this.t('marketWatch.intelligence.noPositionTakeProfit');
      case 'stand_aside':
        return this.t('marketWatch.intelligence.standAsideAction');
      case 'add_position':
        return this.t('marketWatch.intelligence.addPositionAction');
      case 'probe_buy':
        return this.t('marketWatch.intelligence.probeBuyAction');
      case 'candidate':
        return this.t('marketWatch.intelligence.candidateAction');
      case 'review':
        return this.t('marketWatch.intelligence.reviewAction');
      default:
        return verdict.headline || this.t('marketWatch.intelligence.reviewAction');
    }
  }

  private buildOperationHelper(entry: StrategyJournalEntry): string {
    const parts: string[] = [];
    if (typeof entry.distanceToStopLossPct === 'number') {
      parts.push(`${this.t('dashboardV2.operations.distanceToStop')} ${this.decimal.format(entry.distanceToStopLossPct)}%`);
    }
    if (typeof entry.distanceToTakeProfitPct === 'number') {
      parts.push(`${this.t('dashboardV2.operations.distanceToTakeProfit')} ${this.decimal.format(entry.distanceToTakeProfitPct)}%`);
    }
    if (entry.reviewReasons?.length) {
      parts.push(entry.reviewReasons[0]);
    }
    return parts[0] || this.buildJournalNote(entry);
  }

  private normalizeTone(value: string | null | undefined): 'default' | 'positive' | 'warning' | 'danger' {
    if (value === 'positive' || value === 'warning' || value === 'danger') {
      return value;
    }
    return 'default';
  }

  private getSyncJobs(status: MarketSyncStatusData): Array<{ key: keyof MarketSyncStatusData; job: MarketSyncJobStatus }> {
    return [
      { key: 'quotes', job: status.quotes },
      { key: 'intraday', job: status.intraday },
      { key: 'indexDaily', job: status.indexDaily },
      { key: 'financial', job: status.financial },
      { key: 'seedSymbols', job: status.seedSymbols },
      { key: 'foundationCandles', job: status.foundationCandles },
      { key: 'foundationDataQuality', job: status.foundationDataQuality },
      { key: 'foundationAlerts', job: status.foundationAlerts },
      { key: 'news', job: status.news },
    ];
  }

  private getSyncJobLabel(key: keyof MarketSyncStatusData): string {
    switch (key) {
      case 'quotes':
        return this.t('dashboardV2.syncHealth.job.quotes');
      case 'intraday':
        return this.t('dashboardV2.syncHealth.job.intraday');
      case 'indexDaily':
        return this.t('dashboardV2.syncHealth.job.indexDaily');
      case 'financial':
        return this.t('dashboardV2.syncHealth.job.financial');
      case 'seedSymbols':
        return this.t('dashboardV2.syncHealth.job.seedSymbols');
      case 'foundationCandles':
        return this.t('dashboardV2.syncHealth.job.foundationCandles');
      case 'foundationDataQuality':
        return this.t('dashboardV2.syncHealth.job.foundationDataQuality');
      case 'foundationAlerts':
        return this.t('dashboardV2.syncHealth.job.foundationAlerts');
      case 'news':
        return this.t('dashboardV2.syncHealth.job.news');
      default:
        return String(key);
    }
  }

  private getSyncJobAlertThresholdSeconds(key: keyof MarketSyncStatusData): number {
    switch (key) {
      case 'quotes':
      case 'intraday':
      case 'news':
      case 'foundationAlerts':
        return 300;
      case 'indexDaily':
      case 'foundationCandles':
      case 'foundationDataQuality':
        return 900;
      case 'financial':
      case 'seedSymbols':
        return 1800;
      default:
        return 600;
    }
  }

  private isOverdueHardFailure(key: keyof MarketSyncStatusData, job: MarketSyncJobStatus): boolean {
    if (job.health !== 'hard-failed') {
      return false;
    }
    if (typeof job.ageSeconds === 'number') {
      return job.ageSeconds >= this.getSyncJobAlertThresholdSeconds(key);
    }
    return Number(job.consecutiveFailures || 0) >= 3;
  }

  private buildAlertItems(alerts: MarketAlertItem[]): DashboardV2AlertVm[] {
    return [...alerts]
      .sort((left, right) => new Date(right.time || 0).getTime() - new Date(left.time || 0).getTime())
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

  private buildAlertItemsFromEvents(events: MarketAlertEventItem[]): DashboardV2AlertVm[] {
    return events.map((event) => ({
      id: `event-${event.id}`,
      title: event.title,
      message: event.message,
      symbol: event.symbol || event.exchange || this.t('dashboardV2.marketSymbolFallback'),
      timeLabel: this.formatRelativeTime(event.created_at),
      severity: event.severity === 'critical' || event.severity === 'warning' || event.severity === 'info'
        ? event.severity
        : 'info',
      confidenceLabel: event.status,
      directionLabel: 'event',
      changeLabel: event.delivery_channels.join(', ') || 'in-app',
      priceLabel: event.exchange || '--',
      tags: [event.scope, event.status].filter(Boolean).slice(0, 3),
    }));
  }

  private buildFoundationPriorityItems(): DashboardV2PriorityVm[] {
    const items: DashboardV2PriorityVm[] = [];
    const criticalIssues = this.dataQualityOpenIssues.filter((issue) => issue.severity === 'critical');
    if (criticalIssues.length) {
      items.push({
        key: 'foundation-data-quality-critical',
        title: this.t('dashboardV2.priority.dataQualityTitle'),
        body: `${criticalIssues.length} ${this.t('dashboardV2.priority.criticalIssuesBody')} ${criticalIssues[0]?.symbol || criticalIssues[0]?.scope || ''} - ${criticalIssues[0]?.message || ''}`,
        meta: this.selectedExchange,
        tone: 'danger',
      });
    } else if (this.dataQualityOpenIssues.length) {
      items.push({
        key: 'foundation-data-quality-warning',
        title: this.t('dashboardV2.priority.dataHealthTitle'),
        body: `${this.dataQualityOpenIssues.length} ${this.t('dashboardV2.priority.dataHealthBody')}`,
        meta: this.selectedExchange,
        tone: 'warning',
      });
    }

    if (this.pendingAlertEvents.length) {
      items.push({
        key: 'foundation-alert-events',
        title: this.t('dashboardV2.priority.alertEventsTitle'),
        body: `${this.pendingAlertEvents.length} ${this.t('dashboardV2.priority.alertEventsBody')}`,
        meta: this.pendingAlertEvents[0]?.delivery_channels?.join(', ') || this.t('dashboardV2.priority.inApp'),
        tone: 'warning',
      });
    }

    if (this.exchangeSessionSummary) {
      items.push({
        key: 'foundation-exchange-session',
        title: this.t('dashboardV2.priority.sessionTitle'),
        body: this.exchangeSessionSummary,
        meta: this.selectedExchange,
        tone: 'default',
      });
    }

    return items;
  }

  private buildJobHealthAlerts(status: MarketSyncStatusData | null): DashboardV2PriorityVm[] {
    if (!status) {
      return [];
    }

    return this.getSyncJobs(status)
      .filter(({ key, job }) => this.isOverdueHardFailure(key, job))
      .map(({ key, job }) => {
        const thresholdMinutes = Math.max(1, Math.round(this.getSyncJobAlertThresholdSeconds(key) / 60));
        const ageLabel = this.formatAgeSeconds(job.ageSeconds);
        const lastError = (job.lastError || job.message || this.t('dashboardV2.syncHealth.noError')).trim();
        return {
          key: `sync-health-${String(key)}`,
          title: `${this.getSyncJobLabel(key)} ${this.t('dashboardV2.syncHealth.hardFailedTooLong')} ${thresholdMinutes} ${this.t('dashboardV2.syncHealth.minuteUnit')}`,
          body: `${lastError}${ageLabel !== '--' ? ` ${this.t('dashboardV2.syncHealth.agePrefix')}: ${ageLabel}.` : ''}`,
          meta: `${this.t('dashboardV2.syncHealth.failStreak')}: ${job.consecutiveFailures || 0} / ${this.t('dashboardV2.syncHealth.lastOk')}: ${this.formatRelativeTime(job.lastSuccessAt || job.finishedAt)}`,
          tone: 'danger' as const,
        };
      })
      .slice(0, 4);
  }

  private buildJobHealthSummary(status: MarketSyncStatusData | null, alerts: DashboardV2PriorityVm[]): string {
    if (!status) {
      return '';
    }
    if (alerts.length) {
      return `${alerts.length} ${this.t('dashboardV2.syncHealth.summaryHard')}`;
    }

    const softFailedCount = this.getSyncJobs(status).filter(({ job }) => job.health === 'soft-failed').length;
    if (softFailedCount) {
      return `${softFailedCount} ${this.t('dashboardV2.syncHealth.summarySoft')}`;
    }

    return '';
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

    return items;
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

    return items;
  }

  private getAlertTabItems(tab: DashboardAlertTab): Array<DashboardV2PriorityVm | DashboardV2AlertVm | MarketAlertNewsItem> {
    if (tab === 'priority') {
      return this.priorityItems;
    }
    if (tab === 'alerts') {
      return this.alertItems;
    }
    if (tab === 'news') {
      return this.newsItems;
    }
    return this.aiAnalysisItems;
  }

  private ensureAlertPageWithinBounds(tab: DashboardAlertTab): void {
    const totalPages = this.totalAlertPages(tab);
    const current = this.alertTabPages[tab];
    this.alertTabPages[tab] = Math.min(Math.max(current, 1), totalPages);
  }

  private ensureAllAlertPagesWithinBounds(): void {
    this.ensureAlertPageWithinBounds('priority');
    this.ensureAlertPageWithinBounds('alerts');
    this.ensureAlertPageWithinBounds('news');
    this.ensureAlertPageWithinBounds('ai');
  }

  private currentJournalWorkspacePageItems<T>(key: DashboardJournalPagerKey, items: T[]): T[] {
    this.ensureJournalWorkspacePageWithinBounds(key, items.length);
    const pageSize = this.journalWorkspacePageSizes[key];
    const currentPage = this.journalWorkspacePages[key];
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }

  private ensureJournalWorkspacePageWithinBounds(key: DashboardJournalPagerKey, totalItems: number): void {
    const totalPages = Math.max(1, Math.ceil(totalItems / this.journalWorkspacePageSizes[key]));
    const current = this.journalWorkspacePages[key];
    this.journalWorkspacePages[key] = Math.min(Math.max(current, 1), totalPages);
  }

  private ensureAllJournalWorkspacePagesWithinBounds(): void {
    this.ensureJournalWorkspacePageWithinBounds('journal', this.visibleJournalRows().length);
    this.ensureJournalWorkspacePageWithinBounds('operations-open', this.openPositionRows.length);
    this.ensureJournalWorkspacePageWithinBounds('operations-actions', this.nextActionItems.length);
    this.ensureJournalWorkspacePageWithinBounds('portfolio-holdings', this.holdingRows.length);
    this.ensureJournalWorkspacePageWithinBounds('portfolio-alerts', this.portfolioAlertItems.length);
    this.ensureJournalWorkspacePageWithinBounds('workflow-suggestions', this.workflowSuggestionItems.length);
    this.ensureJournalWorkspacePageWithinBounds('workflow-pending', this.workflowPendingItems.length);
    this.ensureJournalWorkspacePageWithinBounds('history', this.workflowHistoryItems.length);
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
    const derivedCapital = Number(entry.totalCapital || 0);
    const derivedPnl = Number(entry.pnlValue || 0);
    const derivedOpen = typeof entry.isOpen === 'boolean' ? entry.isOpen : null;
    if (derivedOpen !== null) {
      return {
        capital: Math.abs(derivedCapital) || 0,
        pnl: Number.isFinite(derivedPnl) ? derivedPnl : 0,
        isOpen: derivedOpen,
      };
    }

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

    const metrics: DashboardV2MetricChipVm[] = [];
    if (score.formulaVerdict) {
      metrics.push({
        label: this.t('dashboardV2.ai.confidence'),
        value: `${this.decimal.format(score.formulaVerdict.confidence)}%`,
        tone:
          score.formulaVerdict.confidence >= 70
            ? 'positive'
            : score.formulaVerdict.confidence >= 45
              ? 'warning'
              : 'danger',
      });
    }

    return [
      ...metrics,
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

  private formatNullableMoney(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return '--';
    }
    return this.formatMoney(Number(value));
  }

  private formatSignedMoney(value: number | null | undefined): string {
    const safeValue = Number(value || 0);
    const sign = safeValue > 0 ? '+' : '';
    return `${sign}${this.formatMoney(safeValue)}`;
  }

  private formatNullableSignedMoney(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return '--';
    }
    return this.formatSignedMoney(Number(value));
  }

  private formatPercent(value: number | null | undefined): string {
    const safeValue = Number(value || 0) * 100;
    return `${this.percent.format(safeValue)}%`;
  }

  private formatNullablePercent(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return '--';
    }
    return `${this.decimal.format(Number(value))}%`;
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

  private formatDateTimeLabel(value: string | null | undefined): string {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private formatNullableNumber(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return '--';
    }
    return this.decimal.format(Number(value));
  }

  private resolveSnapshotPrice(snapshot: Record<string, any> | null | undefined, keys: string[]): number | null {
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }
    for (const key of keys) {
      const value = Number(snapshot[key]);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    return null;
  }

  private resolveJournalFormulaVerdict(entry: StrategyJournalEntry | null | undefined): StrategyFormulaVerdict | null {
    const verdict = entry?.resultSnapshot?.['formulaVerdict'];
    return verdict && typeof verdict === 'object' ? (verdict as StrategyFormulaVerdict) : null;
  }

  private formatFormulaVerdictSummary(verdict: StrategyFormulaVerdict | null | undefined): string {
    if (!verdict) {
      return '--';
    }
    const confidence = typeof verdict.confidence === 'number' ? `${this.decimal.format(verdict.confidence)}%` : '--';
    return `${verdict.headline || verdict.action || verdict.bias} / ${confidence}`;
  }

  private formatFormulaVerdictAction(verdict: StrategyFormulaVerdict | null | undefined): string {
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

  private preferredPrice(...values: Array<number | null | undefined>): number | null {
    for (const rawValue of values) {
      const value = Number(rawValue);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    return null;
  }

  private resolveJournalEntryPrice(entry: StrategyJournalEntry | null | undefined): number | null {
    if (!entry) {
      return null;
    }
    return this.preferredPrice(
      entry.entryPrice,
      this.resolveSnapshotPrice(entry.signalSnapshot, ['entryPrice', 'currentPrice', 'price', 'close']),
      this.resolveSnapshotPrice(entry.resultSnapshot, ['entryPrice', 'currentPrice', 'price', 'close']),
      entry.currentPrice
    );
  }

  private resolveJournalExitPrice(entry: StrategyJournalEntry | null | undefined): number | null {
    if (!entry) {
      return null;
    }
    return this.preferredPrice(
      entry.exitPrice,
      this.resolveSnapshotPrice(entry.resultSnapshot, ['exitPrice', 'handledPrice']),
      this.resolveSnapshotPrice(entry.signalSnapshot, ['exitPrice', 'handledPrice'])
    );
  }

  private resolveJournalStopLossPrice(entry: StrategyJournalEntry | null | undefined): number | null {
    if (!entry) {
      return null;
    }
    return this.preferredPrice(
      entry.stopLossPrice,
      this.resolveSnapshotPrice(entry.signalSnapshot, ['stopLossPrice']),
      this.resolveSnapshotPrice(entry.resultSnapshot, ['stopLossPrice'])
    );
  }

  private resolveJournalTakeProfitPrice(entry: StrategyJournalEntry | null | undefined): number | null {
    if (!entry) {
      return null;
    }
    return this.preferredPrice(
      entry.takeProfitPrice,
      this.resolveSnapshotPrice(entry.signalSnapshot, ['takeProfitPrice']),
      this.resolveSnapshotPrice(entry.resultSnapshot, ['takeProfitPrice'])
    );
  }

  private formatJournalEntryPriceLabel(entry: StrategyJournalEntry | null | undefined): string {
    if (!entry) {
      return '--';
    }
    const direct = this.preferredPrice(entry.entryPrice);
    if (direct !== null) {
      return this.formatMoney(direct);
    }
    const snapshot = this.preferredPrice(
      this.resolveSnapshotPrice(entry.signalSnapshot, ['entryPrice', 'currentPrice', 'price', 'close']),
      this.resolveSnapshotPrice(entry.resultSnapshot, ['entryPrice', 'currentPrice', 'price', 'close'])
    );
    if (snapshot !== null) {
      return `${this.formatMoney(snapshot)} (${this.t('dashboardV2.history.snapshotFallback')})`;
    }
    const current = this.preferredPrice(entry.currentPrice);
    if (current !== null) {
      return `${this.formatMoney(current)} (${this.t('dashboardV2.history.currentPriceFallback')})`;
    }
    return '--';
  }

  private formatJournalExitPriceLabel(entry: StrategyJournalEntry | null | undefined): string {
    if (!entry) {
      return '--';
    }
    const direct = this.preferredPrice(entry.exitPrice);
    if (direct !== null) {
      return this.formatMoney(direct);
    }
    const handled = this.preferredPrice(
      this.resolveSnapshotPrice(entry.resultSnapshot, ['exitPrice', 'handledPrice']),
      this.resolveSnapshotPrice(entry.signalSnapshot, ['exitPrice', 'handledPrice'])
    );
    if (handled !== null) {
      return `${this.formatMoney(handled)} (${this.t('dashboardV2.history.handledPriceFallback')})`;
    }
    return this.t('dashboardV2.result.open');
  }

  private formatJournalBeforeActionPriceLabel(entry: StrategyJournalEntry | null | undefined): string {
    return this.formatJournalEntryPriceLabel(entry);
  }

  private formatJournalAfterActionPriceLabel(entry: StrategyJournalEntry | null | undefined): string {
    if (!entry) {
      return '--';
    }
    const directExit = this.preferredPrice(entry.exitPrice);
    if (directExit !== null) {
      return this.formatMoney(directExit);
    }
    const handled = this.preferredPrice(
      this.resolveSnapshotPrice(entry.resultSnapshot, ['handledPrice', 'exitPrice']),
      this.resolveSnapshotPrice(entry.signalSnapshot, ['handledPrice', 'exitPrice'])
    );
    if (handled !== null) {
      return `${this.formatMoney(handled)} (${this.t('dashboardV2.history.handledPriceFallback')})`;
    }
    const current = this.preferredPrice(entry.currentPrice);
    if (current !== null) {
      return `${this.formatMoney(current)} (${this.t('dashboardV2.history.currentPriceFallback')})`;
    }
    return this.t('dashboardV2.result.open');
  }

  private formatJournalStopLossPriceLabel(entry: StrategyJournalEntry | null | undefined): string {
    const value = this.resolveJournalStopLossPrice(entry);
    return value !== null ? this.formatMoney(value) : '--';
  }

  private formatJournalTakeProfitPriceLabel(entry: StrategyJournalEntry | null | undefined): string {
    const value = this.resolveJournalTakeProfitPrice(entry);
    return value !== null ? this.formatMoney(value) : '--';
  }

  private formatWorkflowEntryPriceLabel(
    item: StrategyActionHistoryItem,
    relatedJournal: StrategyJournalEntry | null
  ): string {
    const journalPrice = this.resolveJournalEntryPrice(relatedJournal);
    if (journalPrice !== null) {
      return this.formatMoney(journalPrice);
    }
    const handled = this.preferredPrice(item.handledPrice);
    if (handled !== null) {
      return `${this.formatMoney(handled)} (${this.t('dashboardV2.history.handledPriceFallback')})`;
    }
    const current = this.preferredPrice(item.currentPrice);
    if (current !== null) {
      return `${this.formatMoney(current)} (${this.t('dashboardV2.history.currentPriceFallback')})`;
    }
    return '--';
  }

  private formatWorkflowAfterPriceLabel(
    item: StrategyActionHistoryItem,
    relatedJournal: StrategyJournalEntry | null
  ): string {
    const journalExit = this.resolveJournalExitPrice(relatedJournal);
    if (journalExit !== null) {
      return this.formatMoney(journalExit);
    }
    const handled = this.preferredPrice(item.handledPrice);
    if (handled !== null) {
      return this.formatMoney(handled);
    }
    const current = this.preferredPrice(item.currentPrice);
    if (current !== null) {
      return `${this.formatMoney(current)} (${this.t('dashboardV2.history.currentPriceFallback')})`;
    }
    return '--';
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

  private loadSymbolFormulaDetail(symbol: string): void {
    const normalized = (symbol || '').trim().toUpperCase();
    this.symbolFormulaSub?.unsubscribe();
    this.symbolDetailFormulaLoading = false;
    this.symbolDetailFormulaError = '';
    this.symbolDetailFormulaGroups = [];
    this.symbolDetailFormulaMetrics = [];
    this.symbolDetailFormulaVerdict = null;

    if (!normalized) {
      return;
    }

    const latestEntry = [...this.journalEntries]
      .filter((item) => (item.symbol || '').trim().toUpperCase() === normalized)
      .sort((left, right) => this.resolveJournalTimestamp(right) - this.resolveJournalTimestamp(left) || right.id - left.id)[0];

    const profileId = latestEntry?.profileId || this.overview?.activeProfile?.id || null;
    if (!latestEntry || !profileId) {
      return;
    }

    this.symbolDetailFormulaLoading = true;
    this.symbolFormulaSub = forkJoin({
      config: this.safeNullable(this.api.getStrategyProfileConfig(profileId)),
      score: this.safeNullable(this.api.getStrategySymbolScore(profileId, normalized)),
    }).subscribe({
      next: ({ config, score }) => {
        this.symbolDetailFormulaGroups = this.buildDetailGroups(config.data || null, score.data || null);
        this.symbolDetailFormulaMetrics = this.buildCurrentMetrics(score.data || null);
        this.symbolDetailFormulaVerdict = score.data?.formulaVerdict || null;
        this.symbolDetailIntelligence = this.buildSymbolIntelligence(normalized);
        this.symbolDetailFormulaLoading = false;
      },
      error: () => {
        this.symbolDetailFormulaLoading = false;
        this.symbolDetailFormulaError = this.t('dashboardV2.detail.error.score');
        this.symbolDetailIntelligence = this.buildSymbolIntelligence(normalized);
      },
    });
  }

  private formatAgeSeconds(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '--';
    }
    if (value < 60) {
      return `${Math.max(0, Math.round(value))} giây`;
    }
    if (value < 3600) {
      return `${Math.max(1, Math.round(value / 60))} phút`;
    }
    return `${Math.max(1, Math.round(value / 3600))} giờ`;
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
    const el = document.getElementById('dashboard-v2-chart-host') as HTMLCanvasElement | null;
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

