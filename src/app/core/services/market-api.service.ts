import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, finalize, shareReplay, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export type ExchangeTab = 'HSX' | 'HNX' | 'UPCOM';
export type SortTab = 'all' | 'actives' | 'gainers' | 'losers';

export interface ApiEnvelope<T = any> {
  data: T;
}

export interface LiveIndexCardItem {
  symbol: string;
  exchange: string;
  close: number | null;
  change_value: number | null;
  change_percent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  trading_value: number | null;
  updated_at: string | null;
}

export interface LiveIndexCardsResponse {
  capturedAt: string | null;
  items: LiveIndexCardItem[];
}

export interface LiveIndexOptionItem {
  symbol: string;
  exchange: string;
}

export interface LiveIndexOptionsResponse {
  items: LiveIndexOptionItem[];
}

export interface LiveIndexSeriesItem {
  time: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  value: number | null;
}

export interface LiveIndexSeriesResponse {
  exchange: ExchangeTab | string;
  items: LiveIndexSeriesItem[];
  fallback?: string;
}

export interface LiveHourlyTradingItem {
  time: string;
  volume: number | null;
  tradingValue: number | null;
  pointCount: number | null;
  symbolCount: number | null;
}

export interface LiveHourlyTradingResponse {
  exchange: ExchangeTab;
  items: LiveHourlyTradingItem[];
}

export interface LiveStockItem {
  rank: number;
  symbol: string;
  name?: string | null;
  exchange: ExchangeTab;
  instrumentType?: string | null;
  price: number | null;
  changeValue: number | null;
  changePercent: number | null;
  volume: number | null;
  tradingValue: number | null;
  pointTime: string | null;
  capturedAt: string | null;
  updatedAt?: string | null;
}

export interface LiveStocksResponse {
  exchange: ExchangeTab | string;
  sort: SortTab | string;
  page: number;
  pageSize: number;
  total: number;
  capturedAt: string | null;
  items: LiveStockItem[];
}

export interface LiveSymbolQuote {
  price: number | null;
  referencePrice: number | null;
  changeValue: number | null;
  changePercent: number | null;
  volume: number | null;
  tradingValue: number | null;
  quoteTime: string | null;
  capturedAt: string | null;
}

export interface LiveSymbolQuoteResponse {
  symbol: string;
  exchange?: ExchangeTab | string | null;
  quote: LiveSymbolQuote | null;
}

export interface LiveSymbolHourlyItem {
  time: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  tradingValue: number | null;
  pointCount: number | null;
}

export interface LiveSymbolHourlyResponse {
  symbol: string;
  items: LiveSymbolHourlyItem[];
}

export interface FinancialHighlightItem {
  label: string;
  value: string;
  helper: string;
}

export interface FinancialStatementPeriod {
  key: string;
  label: string;
  reportPeriod: string | null;
  periodType: string | null;
  fiscalYear: number | null;
  fiscalQuarter: number | null;
  statementDate: string | null;
}

export interface FinancialStatementValue {
  periodKey: string;
  reportPeriod: string | null;
  periodType: string | null;
  fiscalYear: number | null;
  fiscalQuarter: number | null;
  statementDate: string | null;
  valueNumber: number | null;
  valueText: string | null;
  displayValue: string;
  updatedAt: string | null;
  hasValue: boolean;
}

export interface FinancialStatementRow {
  metricKey: string;
  metricLabel: string;
  reportPeriod: string | null;
  periodType: string | null;
  fiscalYear: number | null;
  fiscalQuarter: number | null;
  statementDate: string | null;
  valueNumber: number | null;
  valueText: string | null;
  displayValue: string;
  updatedAt: string | null;
  rawJson: Record<string, any> | null;
  values: FinancialStatementValue[];
}

export interface FinancialStatementSection {
  type: string;
  title: string;
  latestPeriod: string | null;
  periodType: string | null;
  periodCount: number;
  rowCount: number;
  periods: FinancialStatementPeriod[];
  rows: FinancialStatementRow[];
}

export interface FinancialOverviewResponse {
  symbol: string;
  exchange: string | null;
  updatedAt: string | null;
  highlights: FinancialHighlightItem[];
  sections: FinancialStatementSection[];
  syncStatus?: FinancialSyncStatus | null;
}

export interface FinancialSyncStatus {
  status: string;
  hasData: boolean;
  message: string | null;
  finishedAt: string | null;
  source: string | null;
  errors: string[];
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string | null;
  date: string;
  capturedAt: string | null;
  url?: string | null;
  source?: string | null;
}

export interface SymbolSearchItem {
  symbol: string;
  name?: string | null;
  exchange?: string | null;
  instrument_type?: string | null;
  updated_at?: string | null;
}

export interface WatchlistItem {
  id: number;
  symbol: string;
  exchange: string | null;
  note: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  latest_price?: number | null;
  latest_volume?: number | null;
  latest_point_time?: string | null;
}

export interface WatchlistCreateBody {
  symbol: string;
  exchange?: string | null;
  note?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface AuthUserProfile {
  id: number;
  company_code: string;
  username: string;
  full_name: string;
  role: string;
  permissions: string[];
}

export interface AuthSession {
  access_token: string;
  token_type: string;
  expires_at: string;
  profile: AuthUserProfile;
}

export interface LoginRequestBody {
  company_code: string;
  username: string;
  password: string;
}

export interface AiStatusItem {
  label: string;
  value: string;
  tone: 'default' | 'positive' | 'warning';
}

export interface AiForecastCard {
  title: string;
  summary: string;
  direction: 'up' | 'down' | 'neutral';
  confidence: number;
}

export interface AiActivityItem {
  time: string;
  text: string;
}

export interface AiTaskItem {
  name: string;
  schedule: string;
  status: string;
  target: string;
}

export interface AiSkillItem {
  title: string;
  description: string;
  icon: string;
}

export interface AiAgentOverviewResponse {
  exchange: string;
  provider: string;
  model: string;
  used_fallback: boolean;
  generated_at: string;
  summary_items: AiStatusItem[];
  quick_prompts: string[];
  forecast_cards: AiForecastCard[];
  recent_activities: AiActivityItem[];
  tasks: AiTaskItem[];
  skills: AiSkillItem[];
  history: AiActivityItem[];
  assistant_greeting: string;
}

export interface AiAgentChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiAgentChatRequest {
  prompt: string;
  exchange?: ExchangeTab | string;
  focus_symbols?: string[];
  history?: AiAgentChatHistoryItem[];
  include_financial_analysis?: boolean;
}

export interface AiAgentChatMessage {
  role: 'assistant';
  content: string;
  time: string;
}

export interface AiAgentChatResponse {
  exchange: string;
  provider: string;
  model: string;
  used_fallback: boolean;
  generated_at: string;
  focus_symbols: string[];
  message: AiAgentChatMessage;
}

export interface AiLocalDataStat {
  label: string;
  value: string;
  helper: string;
}

export interface AiLocalNewsItem {
  title: string;
  summary: string;
  source: string;
  published_at: string | null;
  url?: string | null;
}

export interface AiLocalAnalysisSection {
  title: string;
  summary: string;
  bullets: string[];
}

export interface AiLocalStorageStatus {
  stored_in_db: boolean;
  source: string;
  detail: string;
  checked_at: string;
}

export interface AiLocalFinancialMetric {
  label: string;
  value: string;
  helper: string;
}

export interface AiLocalFinancialReport {
  symbol: string;
  exchange?: string | null;
  updated_at?: string | null;
  highlights: AiLocalFinancialMetric[];
  note: string;
}

export interface AiLocalSymbolOutlook {
  symbol: string;
  exchange?: string | null;
  direction: 'up' | 'down' | 'neutral';
  confidence: number;
  horizon: string;
  summary: string;
  basis: string[];
}

export interface AiLocalOverviewResponse {
  exchange: string;
  provider: string;
  model: string;
  connected: boolean;
  model_available: boolean;
  include_financial_analysis: boolean;
  used_fallback: boolean;
  generated_at: string;
  summary_items: AiStatusItem[];
  quick_prompts: string[];
  forecast_cards: AiForecastCard[];
  recent_activities: AiActivityItem[];
  dataset_stats: AiLocalDataStat[];
  focus_symbols: string[];
  news_items: AiLocalNewsItem[];
  financial_reports: AiLocalFinancialReport[];
  symbol_outlooks: AiLocalSymbolOutlook[];
  analysis_sections: AiLocalAnalysisSection[];
  cafef_storage: AiLocalStorageStatus;
  assistant_greeting: string;
}

export interface AiLocalChatResponse {
  exchange: string;
  provider: string;
  model: string;
  connected: boolean;
  model_available: boolean;
  used_fallback: boolean;
  generated_at: string;
  focus_symbols: string[];
  context_summary: AiLocalDataStat[];
  message: AiAgentChatMessage;
}

export interface MarketAlertSummaryCard {
  label: string;
  value: string;
  tone: 'default' | 'positive' | 'warning' | 'danger';
  helper: string;
}

export interface MarketAlertOutlook {
  title: string;
  summary: string;
  direction: 'up' | 'down' | 'neutral';
  confidence: number;
}

export interface MarketAlertItem {
  id: string;
  scope: 'market' | 'watchlist' | 'news';
  severity: 'critical' | 'warning' | 'info';
  symbol: string;
  title: string;
  message: string;
  prediction: string;
  source: string;
  source_url?: string | null;
  time: string;
  price: number | null;
  change_value: number | null;
  change_percent: number | null;
  volume: number | null;
  trading_value: number | null;
  confidence: number;
  direction: 'up' | 'down' | 'neutral';
  watchlist: boolean;
  tags: string[];
}

export interface MarketAlertNewsItem {
  title: string;
  summary: string;
  url: string;
  published_at: string | null;
  related_symbols: string[];
  watchlist_hit: boolean;
}

export interface MarketAlertsOverviewResponse {
  exchange: string;
  provider: string;
  model: string;
  used_fallback: boolean;
  generated_at: string;
  headline: string;
  watchlist_headline: string;
  summary_cards: MarketAlertSummaryCard[];
  market_outlook: MarketAlertOutlook;
  alerts: MarketAlertItem[];
  news_items: MarketAlertNewsItem[];
  watchlist_symbols: string[];
  alert_count: number;
  watchlist_alert_count: number;
}

export interface MarketSettingsData {
  language: string;
  defaultExchange: ExchangeTab | string;
  defaultLandingPage: string;
  defaultTimeRange: string;
  startupPage: string;
  theme: string;
  compactTable: boolean;
  showSparkline: boolean;
  flashPriceChange: boolean;
  stickyHeader: boolean;
  fontScale: string;
  pushAlerts: boolean;
  emailAlerts: boolean;
  soundAlerts: boolean;
  alertStrength: string;
  volumeSpikeThreshold: string;
  priceMoveThreshold: string;
  autoRefreshSeconds: string;
  preloadCharts: boolean;
  cacheDays: string;
  syncMarketData: boolean;
  syncNewsData: boolean;
  syncCloud: boolean;
  downloadOnWifiOnly: boolean;
  aiEnabled: boolean;
  aiModel: string;
  aiSummaryAuto: boolean;
  aiWatchlistMonitor: boolean;
  aiExplainMove: boolean;
  aiNewsDigest: boolean;
  aiTaskSchedule: string;
  aiTone: string;
  safeMode: boolean;
  biometricLogin: boolean;
  sessionTimeout: string;
  deviceBinding: boolean;
}

export interface MarketSyncJobStatus {
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
  batchIndex: number | null;
  totalBatches: number | null;
  remainingBatches: number | null;
  itemsInBatch: number | null;
  itemsResolved: number | null;
}

export interface MarketSyncStatusData {
  quotes: MarketSyncJobStatus;
  intraday: MarketSyncJobStatus;
  indexDaily: MarketSyncJobStatus;
  financial: MarketSyncJobStatus;
  seedSymbols: MarketSyncJobStatus;
  news: MarketSyncJobStatus;
  checkedAt: string | null;
}

export interface RolePermissionUser {
  id: number;
  username: string;
  full_name: string;
  department?: string | null;
  role_key: string;
  email?: string | null;
  status: 'active' | 'inactive';
  company_code?: string;
}

export interface RolePermissionRole {
  id: number;
  key: string;
  name: string;
  description?: string | null;
  user_count: number;
  status: 'active' | 'inactive';
  permissions_count: number;
}

export interface RolePermissionMatrixRow {
  module_key: string;
  module: string;
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
  approve: boolean;
  export: boolean;
  ai: boolean;
}

export interface RolePermissionLog {
  time: string;
  user: string;
  action: string;
  target: string;
  detail: string;
}

export interface RolePermissionsOverviewResponse {
  selected_role_key: string;
  can_manage: boolean;
  users: RolePermissionUser[];
  roles: RolePermissionRole[];
  matrix: RolePermissionMatrixRow[];
  logs: RolePermissionLog[];
}

export interface StrategyProfile {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface StrategyParameter {
  id?: number;
  paramKey: string;
  label: string;
  value: string | number | boolean | null;
  dataType: 'number' | 'text' | 'boolean' | string;
  minValue?: number | null;
  maxValue?: number | null;
  stepValue?: number | null;
  uiControl?: string | null;
}

export interface StrategyFormula {
  id: number;
  profileId: number;
  formulaCode: string;
  label: string;
  description?: string | null;
  expression: string;
  resultType: string;
  displayOrder: number;
  isEditable: boolean;
  isEnabled: boolean;
  parameters: StrategyParameter[];
}

export interface StrategyScreenRule {
  id: number;
  profileId: number;
  layerCode: 'qualitative' | 'quantitative' | 'technical' | string;
  ruleCode: string;
  label: string;
  expression: string;
  severity: string;
  isRequired: boolean;
  isEnabled: boolean;
  displayOrder: number;
  parameters: StrategyParameter[];
}

export interface StrategyAlertRule {
  id: number;
  profileId: number;
  ruleCode: string;
  label: string;
  expression: string;
  severity: string;
  cooldownMinutes: number;
  notifyTelegram: boolean;
  notifyInApp: boolean;
  messageTemplate?: string | null;
  isEnabled: boolean;
  displayOrder: number;
  parameters: StrategyParameter[];
}

export interface StrategyChecklistItem {
  id: number;
  profileId: number;
  checklistType: string;
  itemCode: string;
  label: string;
  expression: string;
  isRequired: boolean;
  isEnabled: boolean;
  displayOrder: number;
  parameters: StrategyParameter[];
}

export interface StrategyVersion {
  id: number;
  versionNo: number;
  changeSummary?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
}

export interface StrategyProfileConfigResponse {
  profile: StrategyProfile;
  formulas: StrategyFormula[];
  screenRules: StrategyScreenRule[];
  alertRules: StrategyAlertRule[];
  checklists: StrategyChecklistItem[];
  versions: StrategyVersion[];
}

export interface StrategyRuleResult {
  id: number;
  layerCode?: string;
  ruleCode: string;
  label: string;
  expression: string;
  severity: string;
  isRequired: boolean;
  passed: boolean;
  message: string;
  parameters: StrategyParameter[];
}

export interface StrategyDriver {
  label: string;
  value: number;
}

export interface StrategySignalItem {
  code: string;
  label: string;
  detected: boolean;
  bias: 'bullish' | 'bearish' | 'neutral' | string;
  detail: string;
}

export interface StrategyFundamentalMetrics {
  symbol: string;
  exchange: string;
  pe: number | null;
  pb: number | null;
  bv: number | null;
  eps: number | null;
  epsGrowthYear: number | null;
  epsGrowthQuarter: number | null;
  roe: number | null;
  dar: number | null;
  grossMargin: number | null;
  grossMarginChange: number | null;
  qualityFlags: Array<{ code: string; label: string; passed: boolean }>;
  qualityFlagCount: number;
}

export interface StrategyVolumeIntelligence {
  ma10Volume: number | null;
  ma20Volume: number | null;
  volumeSpikeRatio: number;
  ema10: number | null;
  ema20: number | null;
  emaGapPct: number | null;
  smartMoneyInflow: boolean;
  surgeTrap: boolean;
  noSupply: boolean;
  volumeDivergence: boolean;
}

export interface StrategyMoneyFlowIntelligence {
  obvValue: number | null;
  obvMa10: number | null;
  obvSlopePct: number | null;
  obvTrendScore: number | null;
  obvAboveMa: boolean;
  priceContextScore: number | null;
  nearBreakoutZone: boolean;
  baseTightnessPct: number | null;
  baseIsTight: boolean;
  newsPressureScore: number | null;
  moneyFlowScore: number | null;
  preNewsAccumulation: boolean;
  obvBreakoutConfirmation: boolean;
  smartMoneyBeforeNews: boolean;
  obvDistribution: boolean;
  weakNewsChase: boolean;
  items?: StrategySignalItem[];
}

export interface StrategyExecutionPlan {
  probeBuy30: boolean;
  addBuy70: boolean;
  takeProfitSignal: boolean;
  standAside: boolean;
  stopLossMin: number | null;
  stopLossMax: number | null;
  rationale: string[];
}

export interface StrategyScoredItem {
  rank: number;
  symbol: string;
  name?: string | null;
  exchange: string;
  tradeDate?: string | null;
  createdAt?: string | null;
  classification?: string | null;
  strategyName?: string | null;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  quantity?: number | null;
  totalCapital?: number | null;
  psychology?: string | null;
  price: number;
  changePercent: number;
  tradingValue: number;
  volume: number;
  currentPrice: number;
  fairValue: number | null;
  marginOfSafety: number;
  qScore: number;
  lScore: number;
  mScore: number;
  pScore: number;
  winningScore: number;
  fundamentalMetrics?: StrategyFundamentalMetrics | null;
  volumeIntelligence?: StrategyVolumeIntelligence | null;
  moneyFlowIntelligence?: StrategyMoneyFlowIntelligence | null;
  candlestickSignals?: StrategySignalItem[];
  footprintSignals?: StrategySignalItem[];
  executionPlan?: StrategyExecutionPlan | null;
  riskScore: number;
  isWatchlist: boolean;
  newsMentions: number;
  passedLayer1: boolean;
  passedLayer2: boolean;
  passedLayer3: boolean;
  passedAllLayers: boolean;
  metrics: Record<string, any>;
  layerResults: StrategyRuleResult[];
  alertResults: StrategyRuleResult[];
  checklistResults: StrategyRuleResult[];
  explanation: {
    topDrivers: StrategyDriver[];
    ruleResults: StrategyRuleResult[];
    alerts: StrategyRuleResult[];
    checklists: StrategyRuleResult[];
  };
}

export interface StrategyPagedResponse {
  page: number;
  pageSize: number;
  total: number;
  items: StrategyScoredItem[];
  summary?: {
    passed: number;
    total: number;
    passRate: number;
  };
}

export interface StrategySummaryCard {
  label: string;
  value: string | number;
  helper: string;
}

export interface StrategyRiskOverviewResponse {
  profile: StrategyProfile;
  summaryCards: StrategySummaryCard[];
  highRiskItems: StrategyScoredItem[];
}

export interface StrategyJournalEntry {
  id: number;
  profileId?: number | null;
  symbol: string;
  tradeDate?: string | null;
  classification?: string | null;
  tradeSide: string;
  entryPrice?: number | null;
  exitPrice?: number | null;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  quantity?: number | null;
  positionSize?: number | null;
  totalCapital?: number | null;
  strategyName?: string | null;
  psychology?: string | null;
  checklistResult?: Record<string, any>;
  signalSnapshot?: Record<string, any>;
  resultSnapshot?: Record<string, any>;
  notes?: string | null;
  mistakeTags: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface StrategyOverviewResponse {
  profiles: StrategyProfile[];
  activeProfile: StrategyProfile;
  configSummary: {
    formulaCount: number;
    screenRuleCount: number;
    alertRuleCount: number;
    checklistCount: number;
    versionCount: number;
  };
  rankings: StrategyPagedResponse;
  screener: StrategyPagedResponse;
  risk: StrategyRiskOverviewResponse;
  journal: StrategyJournalEntry[];
}

@Injectable({
  providedIn: 'root',
})
export class MarketApiService {
  private readonly baseUrl = environment.apiBaseUrl;
  private readonly persistentCachePrefix = 'ssg2026:persist-cache:';
  private readonly responseCache = new Map<string, { expiresAt: number; data: unknown }>();
  private readonly inflightRequests = new Map<string, Observable<unknown>>();

  constructor(private http: HttpClient) {}

  private getCachedValue<T>(key: string): T | null {
    const cached = this.responseCache.get(key);
    if (!cached) {
      return null;
    }
    if (cached.expiresAt <= Date.now()) {
      this.responseCache.delete(key);
      return null;
    }
    return cached.data as T;
  }

  private setCachedValue<T>(key: string, data: T, ttlMs: number): T {
    this.responseCache.set(key, {
      expiresAt: Date.now() + ttlMs,
      data,
    });
    return data;
  }

  private getPersistentCacheEntry<T>(key: string): { expiresAt: number; data: T } | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    try {
      const raw = localStorage.getItem(`${this.persistentCachePrefix}${key}`);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as { expiresAt?: number; data?: T };
      if (!parsed || !parsed.expiresAt || parsed.expiresAt <= Date.now()) {
        localStorage.removeItem(`${this.persistentCachePrefix}${key}`);
        return null;
      }
      return {
        expiresAt: parsed.expiresAt,
        data: parsed.data as T,
      };
    } catch {
      return null;
    }
  }

  private setPersistentCacheValue<T>(key: string, data: T, ttlMs: number): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(
        `${this.persistentCachePrefix}${key}`,
        JSON.stringify({
          expiresAt: Date.now() + ttlMs,
          data,
        })
      );
    } catch {
      // Ignore storage quota or serialization errors and keep runtime cache only.
    }
  }

  private withCache<T>(
    key: string,
    ttlMs: number,
    request: Observable<T>,
    options?: { persistent?: boolean; persistentTtlMs?: number }
  ): Observable<T> {
    const cached = this.getCachedValue<T>(key);
    if (cached !== null) {
      return of(cached);
    }

    if (options?.persistent) {
      const persistentEntry = this.getPersistentCacheEntry<T>(key);
      if (persistentEntry) {
        this.responseCache.set(key, {
          expiresAt: persistentEntry.expiresAt,
          data: persistentEntry.data,
        });
        return of(persistentEntry.data);
      }
    }

    const inflight = this.inflightRequests.get(key);
    if (inflight) {
      return inflight as Observable<T>;
    }

    const sharedRequest = request.pipe(
      tap((data) => {
        this.setCachedValue(key, data, ttlMs);
        if (options?.persistent) {
          this.setPersistentCacheValue(key, data, options.persistentTtlMs ?? ttlMs);
        }
      }),
      finalize(() => this.inflightRequests.delete(key)),
      shareReplay(1)
    );

    this.inflightRequests.set(key, sharedRequest);
    return sharedRequest;
  }

  private invalidateCache(prefixes: string[]): void {
    const keys = [...this.responseCache.keys()];
    keys.forEach((key) => {
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        this.responseCache.delete(key);
      }
    });

    const inflightKeys = [...this.inflightRequests.keys()];
    inflightKeys.forEach((key) => {
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        this.inflightRequests.delete(key);
      }
    });

    if (typeof localStorage !== 'undefined') {
      try {
        const storageKeys = Object.keys(localStorage);
        storageKeys.forEach((storageKey) => {
          if (!storageKey.startsWith(this.persistentCachePrefix)) {
            return;
          }
          const cacheKey = storageKey.slice(this.persistentCachePrefix.length);
          if (prefixes.some((prefix) => cacheKey.startsWith(prefix))) {
            localStorage.removeItem(storageKey);
          }
        });
      } catch {
        // Ignore storage access issues.
      }
    }
  }

  invalidateDomainCaches(domains: Array<'quotes' | 'intraday' | 'indexDaily' | 'financial' | 'seedSymbols' | 'news'>): void {
    const prefixes = new Set<string>();

    domains.forEach((domain) => {
      switch (domain) {
        case 'quotes':
          prefixes.add('live:index-cards');
          prefixes.add('live:stocks:');
          prefixes.add('live:symbol-quote:');
          prefixes.add('watchlist:list');
          prefixes.add('ai-agent:overview:');
          prefixes.add('ai-local:overview:');
          prefixes.add('market-alerts:overview:');
          prefixes.add('strategy:overview:');
          prefixes.add('strategy:rankings:');
          prefixes.add('strategy:screener:');
          prefixes.add('strategy:risk:');
          break;
        case 'intraday':
          prefixes.add('live:hourly:');
          prefixes.add('live:symbol-hourly:');
          prefixes.add('live:index-series:');
          prefixes.add('ai-agent:overview:');
          prefixes.add('ai-local:overview:');
          prefixes.add('market-alerts:overview:');
          prefixes.add('strategy:overview:');
          prefixes.add('strategy:rankings:');
          prefixes.add('strategy:screener:');
          prefixes.add('strategy:risk:');
          break;
        case 'indexDaily':
          prefixes.add('live:index-cards');
          prefixes.add('live:index-options');
          prefixes.add('live:index-series:');
          prefixes.add('live:hourly:');
          break;
        case 'financial':
          prefixes.add('live:symbol-financials:');
          prefixes.add('ai-local:overview:');
          prefixes.add('ai-agent:overview:');
          prefixes.add('market-alerts:overview:');
          prefixes.add('strategy:overview:');
          prefixes.add('strategy:rankings:');
          prefixes.add('strategy:screener:');
          prefixes.add('strategy:risk:');
          break;
        case 'seedSymbols':
          prefixes.add('live:index-cards');
          prefixes.add('live:index-options');
          prefixes.add('live:stocks:');
          prefixes.add('watchlist:list');
          prefixes.add('strategy:overview:');
          prefixes.add('strategy:rankings:');
          prefixes.add('strategy:screener:');
          prefixes.add('strategy:risk:');
          break;
        case 'news':
          prefixes.add('live:news:');
          prefixes.add('ai-agent:overview:');
          prefixes.add('ai-local:overview:');
          prefixes.add('market-alerts:overview:');
          prefixes.add('strategy:overview:');
          prefixes.add('strategy:rankings:');
          prefixes.add('strategy:screener:');
          break;
      }
    });

    this.invalidateCache(Array.from(prefixes));
  }

  getLiveIndexCards(): Observable<LiveIndexCardsResponse> {
    return this.withCache(
      'live:index-cards',
      12000,
      this.http.get<LiveIndexCardsResponse>(`${this.baseUrl}/api/live/index-cards`),
      { persistent: true, persistentTtlMs: 180000 }
    ).pipe(
      catchError(() =>
        of({
          capturedAt: null,
          items: [],
        })
      )
    );
  }

  getLiveIndexOptions(): Observable<LiveIndexOptionsResponse> {
    return this.withCache(
      'live:index-options',
      300000,
      this.http.get<LiveIndexOptionsResponse>(`${this.baseUrl}/api/live/index-options`),
      { persistent: true, persistentTtlMs: 86400000 }
    ).pipe(
      catchError(() =>
        of({
          items: [],
        })
      )
    );
  }

  getLiveIndexSeries(
    exchange: string,
    options?: { days?: number; preferDaily?: boolean }
  ): Observable<LiveIndexSeriesResponse> {
    const params: Record<string, string> = { exchange };
    if (options?.days) {
      params['days'] = `${options.days}`;
    }
    if (options?.preferDaily) {
      params['prefer_daily'] = 'true';
    }
    const cacheKey = `live:index-series:${exchange}:${options?.days || 0}:${options?.preferDaily ? 'daily' : 'intraday'}`;
    const ttlMs = options?.preferDaily ? 300000 : 12000;
    return this.withCache(
      cacheKey,
      ttlMs,
      this.http.get<LiveIndexSeriesResponse>(`${this.baseUrl}/api/live/index-series`, {
        params,
      })
    )
      .pipe(
        catchError(() =>
          of({
            exchange,
            items: [],
          })
        )
      );
  }

  getHourlyTrading(exchange: ExchangeTab): Observable<LiveHourlyTradingResponse> {
    return this.withCache(
      `live:hourly:${exchange}`,
      12000,
      this.http.get<LiveHourlyTradingResponse>(`${this.baseUrl}/api/live/hourly-trading`, {
        params: { exchange },
      })
    )
      .pipe(
        catchError(() =>
          of({
            exchange,
            items: [],
          })
        )
      );
  }

  getAllStocks(
    exchange: ExchangeTab,
    sort: SortTab = 'actives',
    page = 1,
    pageSize = 50,
    keyword?: string
  ): Observable<LiveStocksResponse> {
    const params: Record<string, string | number> = {
      exchange,
      sort,
      page,
      page_size: pageSize,
    };

    if (keyword && keyword.trim()) {
      params['q'] = keyword.trim().toUpperCase();
    }

    const cacheKey = `live:stocks:${exchange}:${sort}:${page}:${pageSize}:${params['q'] || ''}`;
    return this.withCache(
      cacheKey,
      12000,
      this.http.get<LiveStocksResponse>(`${this.baseUrl}/api/live/stocks`, { params })
    )
      .pipe(
        catchError(() =>
          of({
            exchange,
            sort,
            page,
            pageSize,
            total: 0,
            capturedAt: null,
            items: [],
          })
        )
      );
  }

  getSymbolQuote(symbol: string): Observable<LiveSymbolQuoteResponse> {
    return this.withCache(
      `live:symbol-quote:${symbol.toUpperCase()}`,
      12000,
      this.http.get<LiveSymbolQuoteResponse>(`${this.baseUrl}/api/live/symbols/${symbol}/quote`)
    )
      .pipe(
        catchError(() =>
          of({
            symbol: symbol.toUpperCase(),
            exchange: null,
            quote: null,
          })
        )
      );
  }

  getSymbolHourly(symbol: string): Observable<LiveSymbolHourlyResponse> {
    return this.withCache(
      `live:symbol-hourly:${symbol.toUpperCase()}`,
      12000,
      this.http.get<LiveSymbolHourlyResponse>(`${this.baseUrl}/api/live/symbols/${symbol}/hourly`)
    )
      .pipe(
        catchError(() =>
          of({
            symbol: symbol.toUpperCase(),
            items: [],
          })
        )
      );
  }

  getSymbolFinancials(symbol: string, limitPerSection = 40): Observable<FinancialOverviewResponse | null> {
    return this.withCache(
      `live:symbol-financials:${symbol.toUpperCase()}:${limitPerSection}`,
      300000,
      this.http.get<FinancialOverviewResponse>(`${this.baseUrl}/api/live/symbols/${symbol}/financials`, {
        params: {
          limit_per_section: limitPerSection,
        },
      })
    )
      .pipe(catchError(() => of(null)));
  }

  getNews(limit = 10): Observable<NewsItem[]> {
    return this.withCache(
      `live:news:${limit}`,
      45000,
      this.http.get<NewsItem[]>(`${this.baseUrl}/api/live/news`, {
        params: { limit },
      }),
      { persistent: true, persistentTtlMs: 300000 }
    )
      .pipe(catchError(() => of([])));
  }

  searchSymbols(keyword: string, limit = 20): Observable<ApiEnvelope<SymbolSearchItem[]>> {
    return this.http
      .get<ApiEnvelope<SymbolSearchItem[]>>(`${this.baseUrl}/api/market/symbols/search`, {
        params: {
          q: keyword.trim().toUpperCase(),
          limit,
        },
      })
      .pipe(
        catchError(() =>
          of({
            data: [],
          })
        )
      );
  }

  listWatchlist(): Observable<ApiEnvelope<WatchlistItem[]>> {
    return this.withCache(
      'watchlist:list',
      15000,
      this.http.get<ApiEnvelope<WatchlistItem[]>>(`${this.baseUrl}/api/watchlist`)
    )
      .pipe(
        catchError(() =>
          of({
            data: [],
          })
        )
      );
  }

  addWatchlistItem(body: WatchlistCreateBody): Observable<ApiEnvelope<WatchlistItem | null>> {
    return this.http
      .post<ApiEnvelope<WatchlistItem>>(`${this.baseUrl}/api/watchlist`, body)
      .pipe(
        tap(() => this.invalidateCache(['watchlist:list', 'live:stocks:', 'live:hourly:', 'live:index-cards'])),
        catchError(() =>
          of({
            data: null,
          })
        )
      );
  }

  deleteWatchlistItem(symbol: string): Observable<ApiEnvelope<{ deleted: boolean } | null>> {
    return this.http
      .delete<ApiEnvelope<{ deleted: boolean }>>(`${this.baseUrl}/api/watchlist/${symbol}`)
      .pipe(
        tap(() => this.invalidateCache(['watchlist:list', 'live:stocks:', 'live:hourly:', 'live:index-cards'])),
        catchError(() =>
          of({
            data: null,
          })
        )
      );
  }

  login(body: LoginRequestBody): Observable<ApiEnvelope<AuthSession | null>> {
    return this.http
      .post<ApiEnvelope<AuthSession>>(`${this.baseUrl}/api/auth/login`, body)
      .pipe(
        catchError(() =>
          of({
            data: null,
          })
        )
      );
  }

  getCurrentUser(): Observable<ApiEnvelope<AuthUserProfile | null>> {
    return this.http
      .get<ApiEnvelope<AuthUserProfile>>(`${this.baseUrl}/api/auth/me`)
      .pipe(
        catchError(() =>
          of({
            data: null,
          })
        )
      );
  }

  getAiAgentOverview(exchange: ExchangeTab = 'HSX'): Observable<ApiEnvelope<AiAgentOverviewResponse | null>> {
    return this.withCache(
      `ai-agent:overview:${exchange}`,
      45000,
      this.http.get<ApiEnvelope<AiAgentOverviewResponse>>(`${this.baseUrl}/api/ai-agent/overview`, {
        params: { exchange },
      }),
      { persistent: true, persistentTtlMs: 180000 }
    )
      .pipe(
        catchError(() =>
          of({
            data: null,
          })
        )
      );
  }

  chatWithAiAgent(body: AiAgentChatRequest): Observable<ApiEnvelope<AiAgentChatResponse | null>> {
    return this.http
      .post<ApiEnvelope<AiAgentChatResponse>>(`${this.baseUrl}/api/ai-agent/chat`, body)
      .pipe(
        catchError(() =>
          of({
            data: null,
          })
        )
      );
  }

  getAiLocalOverview(
    exchange: ExchangeTab = 'HSX',
    options?: { includeFinancialAnalysis?: boolean }
  ): Observable<ApiEnvelope<AiLocalOverviewResponse | null>> {
    const includeFinancialAnalysis = options?.includeFinancialAnalysis ? 'true' : 'false';
    return this.withCache(
      `ai-local:overview:${exchange}:${includeFinancialAnalysis}`,
      45000,
      this.http.get<ApiEnvelope<AiLocalOverviewResponse>>(`${this.baseUrl}/api/ai-local/overview`, {
        params: {
          exchange,
          include_financial_analysis: includeFinancialAnalysis,
        },
      }),
      { persistent: true, persistentTtlMs: 180000 }
    )
      .pipe(
        catchError(() =>
          of({
            data: null,
          })
        )
      );
  }

  chatWithAiLocal(body: AiAgentChatRequest): Observable<ApiEnvelope<AiLocalChatResponse | null>> {
    return this.http
      .post<ApiEnvelope<AiLocalChatResponse>>(`${this.baseUrl}/api/ai-local/chat`, body)
      .pipe(
        catchError(() =>
          of({
            data: null,
          })
        )
      );
  }

  getMarketAlertsOverview(exchange: ExchangeTab = 'HSX'): Observable<ApiEnvelope<MarketAlertsOverviewResponse | null>> {
    return this.withCache(
      `market-alerts:overview:${exchange}`,
      45000,
      this.http.get<ApiEnvelope<MarketAlertsOverviewResponse>>(`${this.baseUrl}/api/market-alerts/overview`, {
        params: { exchange },
      }),
      { persistent: true, persistentTtlMs: 180000 }
    )
      .pipe(
        catchError(() =>
          of({
            data: null,
          })
        )
      );
  }

  getMySettings(): Observable<ApiEnvelope<MarketSettingsData | null>> {
    return this.withCache(
      'settings:me',
      60000,
      this.http.get<ApiEnvelope<MarketSettingsData>>(`${this.baseUrl}/api/settings/me`),
      { persistent: true, persistentTtlMs: 86400000 }
    ).pipe(
      catchError(() =>
        of({
          data: null,
        })
      )
    );
  }

  saveMySettings(body: MarketSettingsData): Observable<ApiEnvelope<MarketSettingsData | null>> {
    return this.http.put<ApiEnvelope<MarketSettingsData>>(`${this.baseUrl}/api/settings/me`, body).pipe(
      tap(() => this.invalidateCache(['settings:me', 'settings:sync-status'])),
      catchError(() =>
        of({
          data: null,
        })
      )
    );
  }

  resetMySettings(): Observable<ApiEnvelope<MarketSettingsData | null>> {
    return this.http.post<ApiEnvelope<MarketSettingsData>>(`${this.baseUrl}/api/settings/me/reset`, {}).pipe(
      tap(() => this.invalidateCache(['settings:me', 'settings:sync-status'])),
      catchError(() =>
        of({
          data: null,
        })
      )
    );
  }

  getSyncStatus(): Observable<ApiEnvelope<MarketSyncStatusData | null>> {
    return this.withCache(
      'settings:sync-status',
      15000,
      this.http.get<ApiEnvelope<MarketSyncStatusData>>(`${this.baseUrl}/api/settings/sync-status`)
    ).pipe(
      catchError(() =>
        of({
          data: null,
        })
      )
    );
  }

  getRolePermissionsOverview(roleKey?: string): Observable<ApiEnvelope<RolePermissionsOverviewResponse | null>> {
    const options = roleKey ? { params: { role_key: roleKey } } : {};
    return this.http
      .get<ApiEnvelope<RolePermissionsOverviewResponse>>(`${this.baseUrl}/api/role-permissions/overview`, options)
      .pipe(
        catchError(() =>
          of({
            data: null,
          })
        )
      );
  }

  createRolePermissionUser(body: {
    username: string;
    full_name: string;
    email?: string;
    department?: string;
    role_key: string;
    password: string;
  }): Observable<ApiEnvelope<RolePermissionUser | null>> {
    return this.http
      .post<ApiEnvelope<RolePermissionUser>>(`${this.baseUrl}/api/role-permissions/users`, body)
      .pipe(
        catchError(() =>
          of({
            data: null,
          })
        )
      );
  }

  updateRolePermissionUser(
    userId: number,
    body: Partial<{
      full_name: string;
      email: string;
      department: string;
      role_key: string;
      is_active: boolean;
    }>
  ): Observable<ApiEnvelope<RolePermissionUser | null>> {
    return this.http
      .patch<ApiEnvelope<RolePermissionUser>>(`${this.baseUrl}/api/role-permissions/users/${userId}`, body)
      .pipe(
        catchError(() =>
          of({
            data: null,
          })
        )
      );
  }

  createRolePermissionRole(body: {
    key: string;
    name: string;
    description?: string;
  }): Observable<ApiEnvelope<RolePermissionRole | null>> {
    return this.http
      .post<ApiEnvelope<RolePermissionRole>>(`${this.baseUrl}/api/role-permissions/roles`, body)
      .pipe(
        catchError(() =>
          of({
            data: null,
          })
        )
      );
  }

  updateRolePermissionRole(
    roleKey: string,
    body: Partial<{
      name: string;
      description: string;
      is_active: boolean;
    }>
  ): Observable<ApiEnvelope<RolePermissionRole | null>> {
    return this.http
      .patch<ApiEnvelope<RolePermissionRole>>(`${this.baseUrl}/api/role-permissions/roles/${roleKey}`, body)
      .pipe(
        catchError(() =>
          of({
            data: null,
          })
        )
      );
  }

  saveRolePermissionMatrix(
    roleKey: string,
    matrix: RolePermissionMatrixRow[]
  ): Observable<ApiEnvelope<{ role_key: string; permissions_count: number; matrix: RolePermissionMatrixRow[] } | null>> {
    return this.http
      .put<ApiEnvelope<{ role_key: string; permissions_count: number; matrix: RolePermissionMatrixRow[] }>>(
        `${this.baseUrl}/api/role-permissions/roles/${roleKey}/matrix`,
        { matrix }
      )
      .pipe(
        catchError(() =>
          of({
            data: null,
          })
        )
      );
  }

  getStrategyOverview(profileId?: number): Observable<ApiEnvelope<StrategyOverviewResponse | null>> {
    const params: Record<string, string | number | boolean> = {};
    if (profileId) {
      params['profile_id'] = profileId;
    }
    return this.withCache(
      `strategy:overview:${profileId || 'active'}`,
      30000,
      this.http.get<ApiEnvelope<StrategyOverviewResponse>>(`${this.baseUrl}/api/strategy/overview`, { params }),
      { persistent: true, persistentTtlMs: 300000 }
    ).pipe(catchError(() => of({ data: null })));
  }

  listStrategyProfiles(): Observable<ApiEnvelope<StrategyProfile[]>> {
    return this.withCache(
      'strategy:profiles',
      300000,
      this.http.get<ApiEnvelope<StrategyProfile[]>>(`${this.baseUrl}/api/strategy/profiles`)
    ).pipe(catchError(() => of({ data: [] })));
  }

  createStrategyProfile(body: {
    code: string;
    name: string;
    description?: string;
  }): Observable<ApiEnvelope<StrategyProfile | null>> {
    return this.http
      .post<ApiEnvelope<StrategyProfile>>(`${this.baseUrl}/api/strategy/profiles`, body)
      .pipe(
        tap(() => this.invalidateCache(['strategy:'])),
        catchError(() => of({ data: null }))
      );
  }

  activateStrategyProfile(profileId: number): Observable<ApiEnvelope<StrategyProfile | null>> {
    return this.http
      .post<ApiEnvelope<StrategyProfile>>(`${this.baseUrl}/api/strategy/profiles/${profileId}/activate`, {})
      .pipe(
        tap(() => this.invalidateCache(['strategy:'])),
        catchError(() => of({ data: null }))
      );
  }

  getStrategyProfileConfig(profileId: number): Observable<ApiEnvelope<StrategyProfileConfigResponse | null>> {
    return this.withCache(
      `strategy:config:${profileId}`,
      300000,
      this.http.get<ApiEnvelope<StrategyProfileConfigResponse>>(`${this.baseUrl}/api/strategy/profiles/${profileId}/config`),
      { persistent: true, persistentTtlMs: 43200000 }
    ).pipe(catchError(() => of({ data: null })));
  }

  saveStrategyProfileConfig(
    profileId: number,
    body: StrategyProfileConfigResponse
  ): Observable<ApiEnvelope<StrategyProfileConfigResponse | null>> {
    return this.http
      .put<ApiEnvelope<StrategyProfileConfigResponse>>(`${this.baseUrl}/api/strategy/profiles/${profileId}/config`, body)
      .pipe(
        tap(() => this.invalidateCache(['strategy:'])),
        catchError(() => of({ data: null }))
      );
  }

  publishStrategyProfile(profileId: number, summary?: string): Observable<ApiEnvelope<{ versionId: number; versionNo: number } | null>> {
    return this.http
      .post<ApiEnvelope<{ versionId: number; versionNo: number }>>(`${this.baseUrl}/api/strategy/profiles/${profileId}/publish`, { summary })
      .pipe(
        tap(() => this.invalidateCache(['strategy:'])),
        catchError(() => of({ data: null }))
      );
  }

  getStrategyRankings(options: {
    profileId: number;
    exchange?: string;
    keyword?: string;
    watchlistOnly?: boolean;
    page?: number;
    pageSize?: number;
  }): Observable<ApiEnvelope<StrategyPagedResponse | null>> {
    const params: Record<string, string | number | boolean> = {
      profile_id: options.profileId,
      page: options.page ?? 1,
      page_size: options.pageSize ?? 20,
    };
    if (options.exchange) params['exchange'] = options.exchange;
    if (options.keyword) params['keyword'] = options.keyword;
    if (options.watchlistOnly) params['watchlist_only'] = true;
    return this.withCache(
      `strategy:rankings:${options.profileId}:${options.exchange || 'ALL'}:${options.keyword || ''}:${options.watchlistOnly ? 'watch' : 'all'}:${options.page ?? 1}:${options.pageSize ?? 20}`,
      30000,
      this.http.get<ApiEnvelope<StrategyPagedResponse>>(`${this.baseUrl}/api/strategy/scoring/rankings`, { params })
    ).pipe(catchError(() => of({ data: null })));
  }

  getStrategySymbolScore(profileId: number, symbol: string): Observable<ApiEnvelope<StrategyScoredItem | null>> {
    return this.withCache(
      `strategy:symbol:${profileId}:${symbol.toUpperCase()}`,
      30000,
      this.http.get<ApiEnvelope<StrategyScoredItem>>(`${this.baseUrl}/api/strategy/scoring/symbol/${symbol}`, {
        params: { profile_id: profileId },
      })
    ).pipe(catchError(() => of({ data: null })));
  }

  runStrategyScreener(options: {
    profileId: number;
    exchange?: string;
    keyword?: string;
    watchlistOnly?: boolean;
    page?: number;
    pageSize?: number;
  }): Observable<ApiEnvelope<StrategyPagedResponse | null>> {
    const params: Record<string, string | number | boolean> = {
      profile_id: options.profileId,
      page: options.page ?? 1,
      page_size: options.pageSize ?? 20,
    };
    if (options.exchange) params['exchange'] = options.exchange;
    if (options.keyword) params['keyword'] = options.keyword;
    if (options.watchlistOnly) params['watchlist_only'] = true;
    return this.withCache(
      `strategy:screener:${options.profileId}:${options.exchange || 'ALL'}:${options.keyword || ''}:${options.watchlistOnly ? 'watch' : 'all'}:${options.page ?? 1}:${options.pageSize ?? 20}`,
      30000,
      this.http.get<ApiEnvelope<StrategyPagedResponse>>(`${this.baseUrl}/api/strategy/screener/run`, { params })
    ).pipe(catchError(() => of({ data: null })));
  }

  getStrategyRiskOverview(profileId: number): Observable<ApiEnvelope<StrategyRiskOverviewResponse | null>> {
    return this.withCache(
      `strategy:risk:${profileId}`,
      30000,
      this.http.get<ApiEnvelope<StrategyRiskOverviewResponse>>(`${this.baseUrl}/api/strategy/risk/overview`, {
        params: { profile_id: profileId },
      })
    ).pipe(catchError(() => of({ data: null })));
  }

  listStrategyJournal(limit = 50): Observable<ApiEnvelope<StrategyJournalEntry[]>> {
    return this.withCache(
      `strategy:journal:${limit}`,
      30000,
      this.http.get<ApiEnvelope<StrategyJournalEntry[]>>(`${this.baseUrl}/api/strategy/journal`, {
        params: { limit },
      })
    ).pipe(catchError(() => of({ data: [] })));
  }

  createStrategyJournal(body: {
    profile_id?: number | null;
    symbol: string;
    trade_date?: string | null;
    classification?: string | null;
    trade_side: string;
    entry_price?: number | null;
    exit_price?: number | null;
    stop_loss_price?: number | null;
    take_profit_price?: number | null;
    quantity?: number | null;
    position_size?: number | null;
    total_capital?: number | null;
    strategy_name?: string | null;
    psychology?: string | null;
    checklist_result_json?: Record<string, any>;
    signal_snapshot_json?: Record<string, any>;
    result_snapshot_json?: Record<string, any>;
    notes?: string;
    mistake_tags_json?: string[];
  }): Observable<ApiEnvelope<StrategyJournalEntry | null>> {
    return this.http
      .post<ApiEnvelope<StrategyJournalEntry>>(`${this.baseUrl}/api/strategy/journal`, body)
      .pipe(
        tap(() =>
          this.invalidateCache([
            'strategy:journal:',
            'strategy:overview:',
            'strategy:rankings:',
            'strategy:risk:',
          ])
        ),
        catchError(() => of({ data: null }))
      );
  }

  updateStrategyJournal(
    entryId: number,
    body: {
      profile_id?: number | null;
      symbol: string;
      trade_date?: string | null;
      classification?: string | null;
      trade_side: string;
      entry_price?: number | null;
      exit_price?: number | null;
      stop_loss_price?: number | null;
      take_profit_price?: number | null;
      quantity?: number | null;
      position_size?: number | null;
      total_capital?: number | null;
      strategy_name?: string | null;
      psychology?: string | null;
      checklist_result_json?: Record<string, any>;
      signal_snapshot_json?: Record<string, any>;
      result_snapshot_json?: Record<string, any>;
      notes?: string;
      mistake_tags_json?: string[];
    }
  ): Observable<ApiEnvelope<StrategyJournalEntry | null>> {
    return this.http
      .put<ApiEnvelope<StrategyJournalEntry>>(`${this.baseUrl}/api/strategy/journal/${entryId}`, body)
      .pipe(
        tap(() =>
          this.invalidateCache([
            'strategy:journal:',
            'strategy:overview:',
            'strategy:rankings:',
            'strategy:risk:',
          ])
        ),
        catchError(() => of({ data: null }))
      );
  }

  deleteStrategyJournal(entryId: number): Observable<ApiEnvelope<StrategyJournalEntry | null>> {
    return this.http.delete<ApiEnvelope<StrategyJournalEntry>>(`${this.baseUrl}/api/strategy/journal/${entryId}`).pipe(
      tap(() =>
        this.invalidateCache([
          'strategy:journal:',
          'strategy:overview:',
          'strategy:rankings:',
          'strategy:risk:',
        ])
      ),
      catchError(() => of({ data: null }))
    );
  }
}
