import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, firstValueFrom, forkJoin } from 'rxjs';
import { BackgroundRefreshService } from 'src/app/core/services/background-refresh.service';
import { AppI18nService } from 'src/app/core/i18n/app-i18n.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { PageLoadStateService } from 'src/app/core/services/page-load-state.service';
import { ThemeService } from 'src/app/core/services/theme.service';
import {
  MarketApiService,
  MarketAlertEventItem,
  MarketDataQualityIssue,
  MarketDataQualityScanResult,
  MarketExchangeRule,
  MarketSettingsData,
  MarketCoverageBucket,
  SymbolSearchItem,
  MarketSyncJobStatus,
  MarketSyncStatusData,
  StrategyOrderStatementEntry,
  StrategyAlertRule,
  StrategyActionHistoryItem,
  StrategyActionHistoryResponse,
  StrategyReviewReportResponse,
  StrategyChecklistItem,
  StrategyFormula,
  StrategyJournalEntry,
  StrategyParameter,
  StrategyProfile,
  StrategyProfileConfigResponse,
  StrategyScoredItem,
  StrategyScreenRule,
} from 'src/app/core/services/market-api.service';

type SettingsTab = 'general' | 'display' | 'alerts' | 'data' | 'ai' | 'strategy' | 'journal' | 'history' | 'security';
type SettingsLoadSection = 'settings' | 'sync' | 'foundation' | 'strategyProfiles' | 'strategyConfig' | 'strategyJournal' | 'strategyHistory';
type StrategyConfigEntity = StrategyFormula | StrategyScreenRule | StrategyAlertRule | StrategyChecklistItem;
type StrategySettingsSection = 'profiles' | 'formulas' | 'screenRules' | 'alertRules' | 'checklists' | 'journal' | 'versions';

interface SettingsTabItem {
  key: SettingsTab;
  labelKey: string;
  helperKey: string;
}

interface StrategyVariableHint {
  key: string;
  label: string;
  description: string;
  kind: 'metric' | 'parameter' | 'formula';
}

interface StrategyJournalSuggestion {
  symbol: string;
  classification: string;
  tradeSide: 'buy' | 'sell';
  entryPrice: number | null;
  exitPrice: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  positionSize: number | null;
  strategyName: string;
  psychology: string;
  notes: string;
  reasons: string[];
}

interface StrategyJournalRow {
  id?: number;
  clientKey?: string;
  profileId?: number | null;
  symbol: string;
  trade_date: string;
  classification: string;
  trade_side: string;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss_price: number | null;
  take_profit_price: number | null;
  quantity: number | null;
  position_size: number | null;
  total_capital: number | null;
  strategy_name: string;
  psychology: string;
  notes: string;
  mistake_tags_json: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
  isSaving?: boolean;
  isNew?: boolean;
}

interface StrategyOrderStatementRow {
  id?: number;
  clientKey?: string;
  profileId?: number | null;
  journal_entry_id?: number | null;
  symbol: string;
  trade_date: string;
  settlement_date: string;
  trade_side: string;
  order_type: string;
  channel: string;
  quantity: number | null;
  price: number | null;
  gross_value: number | null;
  fee: number | null;
  tax: number | null;
  transfer_fee: number | null;
  net_amount: number | null;
  broker_reference: string;
  notes: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  isSaving?: boolean;
  isNew?: boolean;
}

type OrderStatementGroupMode = 'symbol' | 'tradeDate';

interface OrderStatementGroupVm {
  key: string;
  label: string;
  rows: StrategyOrderStatementRow[];
  totalGrossValue: number;
  totalNetAmount: number;
}

type StrategyHistoryStatusFilter = 'all' | 'open' | 'completed' | 'dismissed';

const VARIABLE_HINTS: Record<string, StrategyVariableHint> = {
  Q: { key: 'Q', label: 'Q Score', description: 'Diem chat luong doanh nghiep.', kind: 'formula' },
  L: { key: 'L', label: 'L Score', description: 'Diem leadership va suc manh theo xu huong.', kind: 'formula' },
  M: { key: 'M', label: 'M Score', description: 'Diem dong luc va xac nhan breakout.', kind: 'formula' },
  P: { key: 'P', label: 'P Score', description: 'He so gia/rui ro dung lam mau so.', kind: 'formula' },
  liquidity_score: { key: 'liquidity_score', label: 'Diem thanh khoan', description: 'Muc de vao/ra lenh dua tren gia tri giao dich.', kind: 'metric' },
  stability_score: { key: 'stability_score', label: 'Diem on dinh gia', description: 'Gia cang on dinh thi diem cang cao.', kind: 'metric' },
  news_score: { key: 'news_score', label: 'Diem tin tuc', description: 'Muc do duoc nhac toi trong luong tin hien tai.', kind: 'metric' },
  watchlist_bonus: { key: 'watchlist_bonus', label: 'Diem uu tien watchlist', description: 'Thuong diem neu ma nam trong danh sach theo doi.', kind: 'metric' },
  leadership_score: { key: 'leadership_score', label: 'Diem dan dat', description: 'Kha nang dan dong tien va noi bat trong san.', kind: 'metric' },
  market_trend_score: { key: 'market_trend_score', label: 'Diem xu huong san', description: 'Suc khoe cua san giao dich ma ma dang thuoc ve.', kind: 'metric' },
  volume_score: { key: 'volume_score', label: 'Diem volume', description: 'Muc thanh khoan tuong doi so voi universe.', kind: 'metric' },
  momentum_score: { key: 'momentum_score', label: 'Diem dong luong gia', description: 'Do manh cua phan tram tang/giam hien tai.', kind: 'metric' },
  volume_confirmation_score: { key: 'volume_confirmation_score', label: 'Diem xac nhan volume', description: 'Volume co dang ung ho xu huong gia hay khong.', kind: 'metric' },
  price_risk_score: { key: 'price_risk_score', label: 'Diem rui ro gia', description: 'Gia cang nong thi rui ro cang cao.', kind: 'metric' },
  hotness_score: { key: 'hotness_score', label: 'Diem qua nong', description: 'Dung de phat hien ma bi keo qua nhanh.', kind: 'metric' },
  volatility_score: { key: 'volatility_score', label: 'Diem bien dong', description: 'Bien dong cang manh thi diem rui ro cang cao.', kind: 'metric' },
  current_price: { key: 'current_price', label: 'Gia hien tai', description: 'Gia dang dung lam dau vao cho score.', kind: 'metric' },
  price: { key: 'price', label: 'Gia hien tai', description: 'Gia dang dung lam dau vao cho score.', kind: 'metric' },
  change_percent: { key: 'change_percent', label: '% thay doi', description: 'Bien dong gia phan tram cua ma.', kind: 'metric' },
  trading_value: { key: 'trading_value', label: 'Gia tri giao dich', description: 'Gia tri giao dich tich luy cua ma.', kind: 'metric' },
  volume: { key: 'volume', label: 'Khoi luong', description: 'Khoi luong giao dich tich luy cua ma.', kind: 'metric' },
  price_vs_open_ratio: { key: 'price_vs_open_ratio', label: 'Ty le gia / gia mo nhip', description: 'Dung de xem ma co giu duoc nhip tang hay khong.', kind: 'metric' },
  margin_of_safety: { key: 'margin_of_safety', label: 'Bien an toan', description: 'Khoang cach giua fair value va gia hien tai.', kind: 'metric' },
  winning_score: { key: 'winning_score', label: 'Winning Score', description: 'Diem tong hop cuoi cung de xep hang ma.', kind: 'formula' },
  journal_entries_today: { key: 'journal_entries_today', label: 'So entry journal hom nay', description: 'Dung cho checklist ky luat cuoi ngay.', kind: 'metric' },
};

const EXTENDED_VARIABLE_HINTS: Record<string, StrategyVariableHint> = {
  pe_current: { key: 'pe_current', label: 'P/E', description: 'He so P/E hien tai cua ma.', kind: 'metric' },
  pb_current: { key: 'pb_current', label: 'P/B', description: 'He so P/B hien tai cua ma.', kind: 'metric' },
  bv_current: { key: 'bv_current', label: 'Book value', description: 'Gia tri so sach tren moi co phan.', kind: 'metric' },
  eps_current: { key: 'eps_current', label: 'EPS', description: 'EPS hien tai dung de loc tang truong.', kind: 'metric' },
  eps_growth_year: { key: 'eps_growth_year', label: 'EPS growth nam', description: 'Tang truong EPS nam gan nhat so voi nam truoc.', kind: 'metric' },
  eps_growth_quarter: { key: 'eps_growth_quarter', label: 'EPS growth quy', description: 'Tang truong EPS quy gan nhat so voi cung ky.', kind: 'metric' },
  roe_current: { key: 'roe_current', label: 'ROE', description: 'ROE hien tai cua doanh nghiep.', kind: 'metric' },
  dar_current: { key: 'dar_current', label: 'DAR', description: 'Ty le no tren tai san hien tai.', kind: 'metric' },
  gross_margin_current: { key: 'gross_margin_current', label: 'Bien gop', description: 'Bien loi nhuan gop gan nhat.', kind: 'metric' },
  gross_margin_change: { key: 'gross_margin_change', label: 'Bien dong bien gop', description: 'Muc cai thien hoac suy giam bien gop.', kind: 'metric' },
  quality_flag_count: { key: 'quality_flag_count', label: 'So co chat luong', description: 'So tieu chi chat luong hien dang dat.', kind: 'metric' },
  industry_pe_average: { key: 'industry_pe_average', label: 'P/E peer average', description: 'P/E trung binh nhom so sanh hien tai.', kind: 'metric' },
  pe_gap_to_peer: { key: 'pe_gap_to_peer', label: 'P/E gap to peer', description: 'Khoang cach P/E so voi trung binh nhom.', kind: 'metric' },
  industry_pb_average: { key: 'industry_pb_average', label: 'P/B peer average', description: 'P/B trung binh nhom so sanh hien tai.', kind: 'metric' },
  pb_gap_to_peer: { key: 'pb_gap_to_peer', label: 'P/B gap to peer', description: 'Khoang cach P/B so voi trung binh nhom.', kind: 'metric' },
  ma10_volume: { key: 'ma10_volume', label: 'MA10 volume', description: 'Khoi luong trung binh 10 phien.', kind: 'metric' },
  ma20_volume: { key: 'ma20_volume', label: 'MA20 volume', description: 'Khoi luong trung binh 20 phien.', kind: 'metric' },
  volume_spike_ratio: { key: 'volume_spike_ratio', label: 'Volume spike ratio', description: 'Ty le volume hien tai so voi MA10/MA20.', kind: 'metric' },
  ema10: { key: 'ema10', label: 'EMA10', description: 'Duong EMA10 cua gia dong cua.', kind: 'metric' },
  ema20: { key: 'ema20', label: 'EMA20', description: 'Duong EMA20 cua gia dong cua.', kind: 'metric' },
  ema_gap_pct: { key: 'ema_gap_pct', label: 'EMA gap %', description: 'Khoang cach gia hien tai voi EMA10/EMA20.', kind: 'metric' },
  close_above_ema10: { key: 'close_above_ema10', label: 'Dong tren EMA10', description: 'Co xac nhan gia dong cua dang tren EMA10.', kind: 'metric' },
  close_above_ema20: { key: 'close_above_ema20', label: 'Dong tren EMA20', description: 'Co xac nhan gia dong cua dang tren EMA20.', kind: 'metric' },
  smart_money_inflow: { key: 'smart_money_inflow', label: 'Smart money inflow', description: 'Dong tien lon vao voi volume xac nhan va gia vuot vung.', kind: 'metric' },
  surge_trap: { key: 'surge_trap', label: 'Surge trap', description: 'Volume bung no nhung nen cho tin hieu xa hoac trap.', kind: 'metric' },
  no_supply: { key: 'no_supply', label: 'No supply', description: 'Nhip keo ve voi volume can o ho tro.', kind: 'metric' },
  volume_divergence: { key: 'volume_divergence', label: 'Volume divergence', description: 'Gia tang nhung volume suy yeu dan.', kind: 'metric' },
  breakout_confirmation: { key: 'breakout_confirmation', label: 'Breakout confirmation', description: 'Ma dang xac nhan breakout voi gia va volume.', kind: 'metric' },
  spring_shakeout: { key: 'spring_shakeout', label: 'Spring / Shakeout', description: 'Rut chan manh sau khi thung ho tro.', kind: 'metric' },
  absorption: { key: 'absorption', label: 'Absorption', description: 'Chuoi nen hap thu nguon cung voi volume tang dan.', kind: 'metric' },
  pullback_retest: { key: 'pullback_retest', label: 'Pullback retest', description: 'Nhip test lai breakout/EMA thanh cong.', kind: 'metric' },
  bullish_pattern_score: { key: 'bullish_pattern_score', label: 'Bullish pattern score', description: 'Diem tong hop cua cac mau nen tang gia.', kind: 'metric' },
  bearish_pattern_score: { key: 'bearish_pattern_score', label: 'Bearish pattern score', description: 'Diem tong hop cua cac mau nen giam gia.', kind: 'metric' },
  stop_loss_pct: { key: 'stop_loss_pct', label: 'Stop-loss %', description: 'Ty le stop-loss goi y theo execution engine.', kind: 'metric' },
  obv_value: { key: 'obv_value', label: 'OBV value', description: 'Gia tri OBV hien tai cua ma.', kind: 'metric' },
  obv_ma10: { key: 'obv_ma10', label: 'OBV MA10', description: 'Duong trung binh 10 phien cua OBV.', kind: 'metric' },
  obv_slope_pct: { key: 'obv_slope_pct', label: 'OBV slope %', description: 'Do doc gan day cua OBV.', kind: 'metric' },
  obv_trend_score: { key: 'obv_trend_score', label: 'OBV trend score', description: 'Diem xu huong dong tien theo OBV.', kind: 'metric' },
  obv_above_ma: { key: 'obv_above_ma', label: 'OBV tren MA', description: 'OBV dang nam tren duong trung binh tham chieu.', kind: 'metric' },
  price_context_score: { key: 'price_context_score', label: 'Price context score', description: 'Diem boi canh gia: EMA, nen chat va gan break.', kind: 'metric' },
  near_breakout_zone: { key: 'near_breakout_zone', label: 'Near breakout zone', description: 'Gia dang nam sat vung breakout.', kind: 'metric' },
  base_tightness_pct: { key: 'base_tightness_pct', label: 'Base tightness %', description: 'Do chat cua nen gia gan day.', kind: 'metric' },
  base_is_tight: { key: 'base_is_tight', label: 'Nen gia chat', description: 'Co xac nhan nen gia dang chat.', kind: 'metric' },
  news_pressure_score: { key: 'news_pressure_score', label: 'News pressure score', description: 'Muc do tin tuc dang gay ap luc/hung phan len ma.', kind: 'metric' },
  pre_news_accumulation: { key: 'pre_news_accumulation', label: 'Pre-news accumulation', description: 'Dong tien tich luy truoc khi tin bung no.', kind: 'metric' },
  obv_breakout_confirmation: { key: 'obv_breakout_confirmation', label: 'OBV breakout confirmation', description: 'OBV xac nhan cho breakout.', kind: 'metric' },
  smart_money_before_news: { key: 'smart_money_before_news', label: 'Smart money before news', description: 'Dong tien lon vao truoc khi news pressure tang.', kind: 'metric' },
  obv_distribution: { key: 'obv_distribution', label: 'OBV distribution', description: 'Canh bao phan phoi som theo OBV.', kind: 'metric' },
  weak_news_chase: { key: 'weak_news_chase', label: 'Weak news chase', description: 'Tin nhieu nhung dong tien khong dong thuan.', kind: 'metric' },
  money_flow_score: { key: 'money_flow_score', label: 'Money flow score', description: 'Diem tong hop cua engine dong tien truoc tin.', kind: 'metric' },
};

Object.assign(VARIABLE_HINTS, EXTENDED_VARIABLE_HINTS);

const EXPRESSION_RESERVED_WORDS = new Set([
  'and',
  'or',
  'not',
  'True',
  'False',
  'abs',
  'max',
  'min',
  'round',
]);

const EXPRESSION_OPERATOR_GROUPS = [
  [' + ', ' - ', ' * ', ' / '],
  [' > ', ' >= ', ' < ', ' <= '],
  [' AND ', ' OR ', '(', ')'],
];

const EXPRESSION_VARIABLE_ORDER = [
  'Q',
  'L',
  'M',
  'P',
  'winning_score',
  'margin_of_safety',
  'current_price',
  'price',
  'change_percent',
  'trading_value',
  'volume',
  'price_vs_open_ratio',
  'liquidity_score',
  'stability_score',
  'leadership_score',
  'market_trend_score',
  'momentum_score',
  'volume_score',
  'volume_confirmation_score',
  'price_risk_score',
  'hotness_score',
  'volatility_score',
  'watchlist_bonus',
  'news_score',
  'journal_entries_today',
];

EXPRESSION_VARIABLE_ORDER.splice(
  5,
  0,
  'pe_current',
  'pb_current',
  'bv_current',
  'eps_current',
  'eps_growth_year',
  'eps_growth_quarter',
  'roe_current',
  'dar_current',
  'gross_margin_current',
  'gross_margin_change',
  'quality_flag_count',
  'industry_pe_average',
  'pe_gap_to_peer',
  'industry_pb_average',
  'pb_gap_to_peer',
  'ma10_volume',
  'ma20_volume',
  'volume_spike_ratio',
  'ema10',
  'ema20',
  'ema_gap_pct',
  'close_above_ema10',
  'close_above_ema20',
  'smart_money_inflow',
  'surge_trap',
  'no_supply',
  'volume_divergence',
  'breakout_confirmation',
  'spring_shakeout',
  'absorption',
  'pullback_retest',
  'bullish_pattern_score',
  'bearish_pattern_score',
  'stop_loss_pct',
  'obv_value',
  'obv_ma10',
  'obv_slope_pct',
  'obv_trend_score',
  'obv_above_ma',
  'price_context_score',
  'near_breakout_zone',
  'base_tightness_pct',
  'base_is_tight',
  'news_pressure_score',
  'pre_news_accumulation',
  'obv_breakout_confirmation',
  'smart_money_before_news',
  'obv_distribution',
  'weak_news_chase',
  'money_flow_score'
);

@Component({
  selector: 'app-market-settings',
  templateUrl: './market-settings.page.html',
  styleUrls: ['./market-settings.page.scss'],
  standalone: false,
})
export class MarketSettingsPage implements OnInit, OnDestroy {
  private readonly pageLoadKey = 'market-settings';
  private clientRowSequence = 0;
  private readonly numericIntegerFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
  private readonly numericDecimalFormatter = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  private readonly numericEditDrafts = new WeakMap<object, Record<string, string>>();
  private readonly numericEditingFields = new WeakMap<object, Set<string>>();
  private readonly sectionLoadedAt: Partial<Record<SettingsLoadSection, number>> = {};
  private readonly sectionMaxAgeMs: Record<SettingsLoadSection, number> = {
    settings: 300000,
    sync: 15000,
    foundation: 30000,
    strategyProfiles: 300000,
    strategyConfig: 300000,
    strategyJournal: 30000,
    strategyHistory: 30000,
  };
  readonly expressionOperatorGroups = EXPRESSION_OPERATOR_GROUPS;

  selectedTab: SettingsTab = 'general';
  loading = false;
  saving = false;
  message = '';
  error = '';
  settings!: MarketSettingsData;
  syncStatus: MarketSyncStatusData = this.buildEmptySyncStatus();
  exchangeRules: MarketExchangeRule[] = [];
  dataQualityIssues: MarketDataQualityIssue[] = [];
  alertEvents: MarketAlertEventItem[] = [];
  masterDataItems: SymbolSearchItem[] = [];
  foundationLoading = false;
  foundationMessage = '';
  foundationError = '';
  dataQualityScan: MarketDataQualityScanResult | null = null;
  foundationExchange: 'ALL' | 'HSX' | 'HNX' | 'UPCOM' = 'ALL';
  masterDataKeyword = '';

  strategyLoading = false;
  strategySaving = false;
  strategyPublishing = false;
  strategyLedgerSaving = false;
  strategyMessage = '';
  strategyError = '';
  strategyProfiles: StrategyProfile[] = [];
  activeStrategyProfileId: number | null = null;
  strategyConfig: StrategyProfileConfigResponse | null = null;
  strategyJournal: StrategyJournalEntry[] = [];
  strategyJournalRows: StrategyJournalRow[] = [];
  strategyOrderStatements: StrategyOrderStatementEntry[] = [];
  strategyOrderStatementRows: StrategyOrderStatementRow[] = [];
  orderStatementGroupMode: OrderStatementGroupMode = 'symbol';
  showStrategyEntries = true;
  expandedLinkedOrderStatementIds = new Set<number>();
  strategyHistoryOverview: StrategyActionHistoryResponse | null = null;
  strategyHistoryItems: StrategyActionHistoryItem[] = [];
  strategyReviewReport: StrategyReviewReportResponse | null = null;
  strategyHistoryLoading = false;
  strategyHistoryStatusFilter: StrategyHistoryStatusFilter = 'all';
  strategyHistoryDays = 7;
  strategyJournalSourceItem: StrategyScoredItem | null = null;
  strategyJournalSuggestion: StrategyJournalSuggestion | null = null;
  strategyJournalPrefillPending = false;
  strategySavedSnapshot = '';
  selectedStrategySection: StrategySettingsSection = 'formulas';
  expandedStrategyCardKey = '';
  strategyConfigSearch = '';
  strategyVariableSearch = '';
  editingStrategyJournalId: number | null = null;
  newStrategyProfile = {
    code: '',
    name: '',
    description: '',
  };
  strategyJournalForm = this.buildEmptyStrategyJournalForm();
  private backgroundSub?: Subscription;
  private activeView = false;
  private loadedStrategyConfigProfileId: number | null = null;
  private loadingStrategyConfigProfileId: number | null = null;

  readonly tabs: SettingsTabItem[] = [
    { key: 'general', labelKey: 'settings.tabs.general', helperKey: 'settings.tabs.generalHelp' },
    { key: 'display', labelKey: 'settings.tabs.display', helperKey: 'settings.tabs.displayHelp' },
    { key: 'alerts', labelKey: 'settings.tabs.alerts', helperKey: 'settings.tabs.alertsHelp' },
    { key: 'data', labelKey: 'settings.tabs.data', helperKey: 'settings.tabs.dataHelp' },
    { key: 'ai', labelKey: 'settings.tabs.ai', helperKey: 'settings.tabs.aiHelp' },
    { key: 'strategy', labelKey: 'settings.tabs.strategy', helperKey: 'settings.tabs.strategyHelp' },
    { key: 'journal', labelKey: 'settings.tabs.journal', helperKey: 'settings.tabs.journalHelp' },
    { key: 'history', labelKey: 'settings.tabs.history', helperKey: 'settings.tabs.historyHelp' },
    { key: 'security', labelKey: 'settings.tabs.security', helperKey: 'settings.tabs.securityHelp' },
  ];

  constructor(
    private api: MarketApiService,
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private i18n: AppI18nService,
    private theme: ThemeService,
    private backgroundRefresh: BackgroundRefreshService,
    private pageLoadState: PageLoadStateService
  ) {
    this.settings = this.buildEmptySettings();
  }

  private t(key: string): string {
    return this.i18n.translate(key);
  }

  private formatMessage(key: string, vars: Record<string, string | number>): string {
    return Object.entries(vars).reduce((message, [name, value]) => {
      const token = `{${name}}`;
      return message.split(token).join(String(value));
    }, this.t(key));
  }

  ngOnInit(): void {
    this.applyRouteState();
    this.consumeStrategyJournalPrefill();
    this.pageLoadState.registerPage(this.pageLoadKey, 'settings.title');
    this.backgroundSub = this.backgroundRefresh.changes$.subscribe((domains) => {
      if (!this.activeView) return;
      if (domains.length && this.selectedTab === 'data') {
        this.loadSyncStatus(true);
        this.loadDataFoundation(true, true);
      }
    });
    this.loadSettings();
    if (this.selectedTab === 'strategy' || this.selectedTab === 'journal' || this.selectedTab === 'history') {
      this.loadStrategyOverview();
    }
  }

  ionViewDidEnter(): void {
    this.activeView = true;
    this.applyRouteState();
    this.consumeStrategyJournalPrefill();
    this.pageLoadState.setActivePage(this.pageLoadKey);
    if (this.selectedTab === 'data' && !this.pageLoadState.isLoading(this.pageLoadKey) && !this.isSectionFresh('sync')) {
      this.loadSyncStatus();
      this.loadDataFoundation(true);
    }
    if (
      (this.selectedTab === 'strategy' || this.selectedTab === 'journal' || this.selectedTab === 'history') &&
      !this.strategyProfiles.length &&
      !this.strategyLoading &&
      !this.pageLoadState.isLoading(this.pageLoadKey)
    ) {
      this.loadStrategyOverview();
    } else if (
      (this.selectedTab === 'strategy' || this.selectedTab === 'journal' || this.selectedTab === 'history') &&
      this.selectedStrategySection === 'journal' &&
      !this.isSectionFresh('strategyJournal') &&
      !this.strategyLoading
    ) {
      this.reloadStrategyJournal(true);
    } else if (this.selectedTab === 'history' && !this.isSectionFresh('strategyHistory') && !this.strategyHistoryLoading) {
      this.loadStrategyHistory(true);
    }
  }

  ionViewDidLeave(): void {
    this.activeView = false;
  }

  ngOnDestroy(): void {
    this.backgroundSub?.unsubscribe();
  }

  selectTab(tab: SettingsTab): void {
    this.selectedTab = tab;
    if (tab === 'data') {
      this.loadSyncStatus();
      this.loadDataFoundation(true);
    }
    if (tab === 'journal') {
      this.selectedStrategySection = 'journal';
    }
    if ((tab === 'strategy' || tab === 'journal' || tab === 'history') && !this.strategyProfiles.length && !this.strategyLoading) {
      this.loadStrategyOverview();
      return;
    }
    if (
      (tab === 'strategy' || tab === 'journal') &&
      this.selectedStrategySection === 'journal' &&
      !this.isSectionFresh('strategyJournal') &&
      !this.strategyLoading
    ) {
      this.reloadStrategyJournal();
    }
    if (tab === 'history' && !this.strategyHistoryLoading) {
      this.loadStrategyHistory(false, true);
    }
  }

  openStrategyJournal(): void {
    this.selectTab('journal');
  }

  loadSettings(force = false): void {
    const cachedSettings = this.auth.preferences;
    if (!force && this.settings && this.isSectionFresh('settings')) {
      this.loading = false;
      return;
    }
    if (cachedSettings) {
      this.settings = this.normalizeSettings(cachedSettings);
      this.loading = false;
      this.pageLoadState.startBackground(this.pageLoadKey);
    } else {
      this.loading = true;
      this.pageLoadState.start(this.pageLoadKey);
    }
    this.error = '';
    this.message = '';

    this.api.getMySettings().subscribe({
      next: (response) => {
        if (!response.data) {
          this.error = this.i18n.translate('settings.loadFailed');
        } else {
          this.settings = this.normalizeSettings(response.data);
          this.auth.cacheSettings(this.settings);
          this.markSectionLoaded('settings');
        }
        this.loading = false;
        this.pageLoadState.finish(this.pageLoadKey);
      },
      error: () => {
        this.error = this.i18n.translate('settings.loadFailed');
        this.loading = false;
        this.pageLoadState.fail(this.pageLoadKey, this.error);
      },
    });
  }

  saveSettings(): void {
    this.saving = true;
    this.error = '';
    this.message = '';

    this.api.saveMySettings(this.settings).subscribe({
      next: (response) => {
        this.saving = false;
        if (!response.data) {
          this.error = 'Backend khong luu du lieu.';
          return;
        }
        this.settings = this.normalizeSettings(response.data);
        this.auth.cacheSettings(this.settings);
        this.markSectionLoaded('settings');
        this.message = this.i18n.translate('settings.saved');
      },
      error: () => {
        this.saving = false;
        this.error = this.i18n.translate('settings.saveFailed');
      },
    });
  }

  loadSyncStatus(force = false): void {
    if (!force && this.syncStatus && this.isSectionFresh('sync')) {
      return;
    }
    this.pageLoadState.startBackground(this.pageLoadKey);
    this.api.getSyncStatus().subscribe({
      next: (response) => {
        if (response.data) {
          this.syncStatus = response.data;
          this.markSectionLoaded('sync');
        }
        this.pageLoadState.finish(this.pageLoadKey);
      },
      error: () => this.pageLoadState.fail(this.pageLoadKey, 'Không tải được trạng thái đồng bộ.'),
    });
  }

  resetSettings(): void {
    const confirmed = window.confirm(this.i18n.translate('common.reset'));
    if (!confirmed) {
      return;
    }

    this.saving = true;
    this.error = '';
    this.message = '';

    this.api.resetMySettings().subscribe({
      next: (response) => {
        this.saving = false;
        if (!response.data) {
          this.error = 'Backend khong reset duoc cau hinh.';
          return;
        }
        this.settings = this.normalizeSettings(response.data);
        this.auth.cacheSettings(this.settings);
        this.markSectionLoaded('settings');
        this.message = this.i18n.translate('settings.resetDone');
      },
      error: () => {
        this.saving = false;
        this.error = this.i18n.translate('settings.resetFailed');
      },
    });
  }

  loadStrategyOverview(silent = false, force = false): void {
    if (!force && this.strategyProfiles.length && this.isSectionFresh('strategyProfiles')) {
      if (
        this.activeStrategyProfileId &&
        (!this.strategyConfig || this.loadedStrategyConfigProfileId !== this.activeStrategyProfileId)
      ) {
        this.loadStrategyConfig(this.activeStrategyProfileId, true);
      }
      if (this.selectedStrategySection === 'journal' && !this.strategyJournal.length) {
        this.reloadStrategyJournal(true, true);
      }
      return;
    }
    if (!silent) {
      this.strategyLoading = true;
      this.strategyError = '';
      this.strategyMessage = '';
      this.pageLoadState.start(this.pageLoadKey);
    } else {
      this.pageLoadState.startBackground(this.pageLoadKey);
    }

    this.api.listStrategyProfiles().subscribe({
      next: (response) => {
        this.strategyLoading = false;
        const profiles = response.data || [];
        if (!profiles.length) {
          if (!silent) {
            this.strategyError = this.t('marketSettings.messages.loadStrategyConfigFailed');
          }
          return;
        }

        this.strategyProfiles = profiles;
        this.markSectionLoaded('strategyProfiles');
        this.activeStrategyProfileId =
          this.strategyProfiles.find((item) => item.id === this.activeStrategyProfileId)?.id ||
          this.strategyProfiles.find((item) => item.isDefault)?.id ||
          this.strategyProfiles[0]?.id ||
          null;

        if (this.activeStrategyProfileId) {
          this.pageLoadState.setProgress(this.pageLoadKey, 55);
          this.loadStrategyConfig(this.activeStrategyProfileId, force);
          if (this.selectedStrategySection === 'journal') {
            this.reloadStrategyJournal(true, force);
          }
          if (this.selectedTab === 'history') {
            this.loadStrategyHistory(true, force);
          }
        } else {
          this.strategyConfig = null;
          this.pageLoadState.finish(this.pageLoadKey);
        }
      },
      error: () => {
        this.strategyLoading = false;
        if (!silent) {
          this.strategyError = this.t('marketSettings.messages.loadStrategySettingsFailed');
        }
        this.pageLoadState.fail(this.pageLoadKey, this.strategyError || 'Không tải được Strategy settings.');
      },
    });
  }

  onStrategyProfileChange(): void {
    if (!this.activeStrategyProfileId) {
      return;
    }
    this.loadedStrategyConfigProfileId = null;
    this.loadingStrategyConfigProfileId = null;
    this.loadStrategyConfig(this.activeStrategyProfileId, true);
    if (this.selectedStrategySection === 'journal') {
      this.reloadStrategyJournal(true, true);
    }
    if (this.selectedTab === 'history') {
      this.loadStrategyHistory(true, true);
    }
  }

  loadDataFoundation(silent = false, force = false): void {
    if (
      !force &&
      this.exchangeRules.length &&
      (this.dataQualityIssues.length || this.alertEvents.length) &&
      this.isSectionFresh('foundation')
    ) {
      this.foundationLoading = false;
      return;
    }
    if (!silent) {
      this.foundationLoading = true;
    }
    this.foundationError = '';
    this.foundationMessage = '';

    forkJoin({
      rules: this.api.getExchangeRules(),
      issues: this.api.getDataQualityIssues(80),
      events: this.api.getAlertEvents('pending', 40),
    }).subscribe({
      next: ({ rules, issues, events }) => {
        this.exchangeRules = rules.data || [];
        this.dataQualityIssues = issues.data || [];
        this.alertEvents = events.data || [];
        this.foundationLoading = false;
        this.markSectionLoaded('foundation');
      },
      error: () => {
        this.foundationLoading = false;
        this.foundationError = this.t('marketSettings.messages.loadFoundationFailed');
      },
    });
  }

  scanDataQuality(): void {
    this.foundationLoading = true;
    this.foundationError = '';
    this.foundationMessage = '';
    this.api.scanDataQuality(this.foundationExchange, 1000).subscribe({
      next: (response) => {
        this.dataQualityScan = response.data;
        this.foundationLoading = false;
        this.sectionLoadedAt.foundation = undefined;
        this.foundationMessage = response.data
          ? `Da scan ${response.data.quotes_checked + response.data.intraday_checked} dong, ghi nhan ${response.data.issues_upserted} canh bao.`
          : 'Scan data-quality khong co ket qua.';
        this.loadDataFoundation(true, true);
      },
      error: () => {
        this.foundationLoading = false;
        this.foundationError = this.t('marketSettings.messages.loadFoundationFailed');
      },
    });
  }

  refreshAlertEvents(): void {
    const exchanges: Array<'HSX' | 'HNX' | 'UPCOM'> =
      this.foundationExchange === 'ALL' ? ['HSX', 'HNX', 'UPCOM'] : [this.foundationExchange];
    this.foundationLoading = true;
    this.foundationError = '';
    this.foundationMessage = '';

    forkJoin(exchanges.map((exchange) => this.api.refreshAlertEvents(exchange))).subscribe({
      next: (responses) => {
        const created = responses.reduce((sum, item) => sum + Number(item.data?.events_created || 0), 0);
        this.foundationLoading = false;
        this.sectionLoadedAt.foundation = undefined;
        this.foundationMessage = this.formatMessage('marketSettings.messages.createdAlertEvents', { count: created });
        this.loadDataFoundation(true, true);
      },
      error: () => {
        this.foundationLoading = false;
        this.foundationError = this.t('marketSettings.messages.loadFoundationFailed');
      },
    });
  }

  deliverAlertEvents(): void {
    this.foundationLoading = true;
    this.foundationError = '';
    this.foundationMessage = '';

    this.api.deliverAlertEvents(80).subscribe({
      next: (response) => {
        this.foundationLoading = false;
        this.foundationMessage = response.data
          ? `Da xu ly ${response.data.checked} event: sent ${response.data.sent}, failed ${response.data.failed}.`
          : this.t('marketSettings.messages.deliverAlertsFailed');
        this.loadDataFoundation(true);
      },
      error: () => {
        this.foundationLoading = false;
        this.foundationError = this.t('marketSettings.messages.deliverAlertsFailed');
      },
    });
  }

  searchMasterData(): void {
    const keyword = this.masterDataKeyword.trim();
    if (!keyword) {
      this.masterDataItems = [];
      return;
    }

    this.api.searchSymbols(keyword, 12).subscribe({
      next: (response) => {
        this.masterDataItems = response.data || [];
      },
      error: () => {
        this.masterDataItems = [];
      },
    });
  }

  issueSeverityClass(issue: MarketDataQualityIssue): string {
    return issue.severity === 'critical' ? 'danger' : issue.severity === 'warning' ? 'warning' : 'default';
  }

  workflowToneClass(tone?: string | null): string {
    return tone === 'positive' ? 'positive' : tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'default';
  }

  workflowStatusClass(status?: string | null): string {
    return status === 'completed' ? 'positive' : status === 'dismissed' ? 'default' : 'warning';
  }

  formatHistoryActionLabel(item: StrategyActionHistoryItem): string {
    return item.resolutionType || item.actionLabel || item.actionCode;
  }

  trackByStrategyHistory(_: number, item: StrategyActionHistoryItem): number {
    return item.id;
  }

  formatLargeNumber(value?: number | null): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return '--';
    }
    const number = Number(value);
    if (Math.abs(number) >= 1_000_000_000) {
      return `${(number / 1_000_000_000).toFixed(1)}B`;
    }
    if (Math.abs(number) >= 1_000_000) {
      return `${(number / 1_000_000).toFixed(1)}M`;
    }
    return number.toLocaleString('vi-VN');
  }

  get hasUnsavedStrategyChanges(): boolean {
    if (!this.strategyConfig || !this.strategySavedSnapshot) {
      return false;
    }
    return this.strategySavedSnapshot !== this.serializeStrategyConfig(this.strategyConfig);
  }

  loadStrategyConfig(profileId: number, force = false): void {
    if (
      !force &&
      this.loadedStrategyConfigProfileId === profileId &&
      this.strategyConfig &&
      this.isSectionFresh('strategyConfig')
    ) {
      return;
    }
    if (this.loadingStrategyConfigProfileId === profileId) {
      return;
    }
    this.strategyLoading = true;
    this.strategyError = '';
    this.loadingStrategyConfigProfileId = profileId;
    this.pageLoadState.startBackground(this.pageLoadKey);

    this.api.getStrategyProfileConfig(profileId).subscribe({
      next: (response) => {
        this.strategyLoading = false;
        this.strategyConfig = response.data || null;
        this.loadedStrategyConfigProfileId = response.data ? profileId : null;
        this.loadingStrategyConfigProfileId = null;
        this.strategySavedSnapshot = this.strategyConfig ? this.serializeStrategyConfig(this.strategyConfig) : '';
        this.ensureStrategyExpansion();
        this.markSectionLoaded('strategyConfig');
        this.pageLoadState.finish(this.pageLoadKey);
      },
      error: () => {
        this.strategyLoading = false;
        this.loadingStrategyConfigProfileId = null;
        this.strategyError = this.t('marketSettings.messages.loadStrategyConfigFailed');
        this.pageLoadState.fail(this.pageLoadKey, this.strategyError);
      },
    });
  }

  saveStrategyConfig(): void {
    this.persistStrategyConfig();
  }

  applyStrategyToHub(): void {
    if (this.hasUnsavedStrategyChanges) {
      this.persistStrategyConfig(true);
      return;
    }
    this.strategyMessage = 'Config da duoc ap dung. Dang mo Strategy Hub...';
    this.navigateToStrategyHub();
  }

  private persistStrategyConfig(navigateAfterSave = false): void {
    if (!this.activeStrategyProfileId || !this.strategyConfig) {
      return;
    }

    this.strategySaving = true;
    this.strategyError = '';
    this.strategyMessage = '';

    this.api.saveStrategyProfileConfig(this.activeStrategyProfileId, this.strategyConfig).subscribe({
      next: (response) => {
        this.strategySaving = false;
        if (!response.data) {
          this.strategyError = 'Backend khong luu duoc strategy config.';
          return;
        }
        this.strategyConfig = response.data;
        this.loadedStrategyConfigProfileId = this.activeStrategyProfileId;
        this.strategySavedSnapshot = this.serializeStrategyConfig(this.strategyConfig);
        this.ensureStrategyExpansion();
        this.markSectionLoaded('strategyConfig');
        this.strategyMessage = navigateAfterSave
          ? 'Da luu va ap dung config. Dang mo Strategy Hub...'
          : 'Da luu strategy settings.';
        if (navigateAfterSave) {
          this.navigateToStrategyHub();
        }
      },
      error: () => {
        this.strategySaving = false;
        this.strategyError = this.t('settings.saveFailed');
      },
    });
  }

  publishStrategyConfig(): void {
    if (!this.activeStrategyProfileId) {
      return;
    }

    this.strategyPublishing = true;
    this.strategyError = '';
    this.strategyMessage = '';

    this.api.publishStrategyProfile(this.activeStrategyProfileId, 'Publish from market settings').subscribe({
      next: (response) => {
        this.strategyPublishing = false;
        if (!response.data) {
          this.strategyError = this.t('marketSettings.messages.publishVersionFailed');
          return;
        }
        this.strategyMessage = `Da publish version #${response.data.versionNo}.`;
        this.sectionLoadedAt.strategyConfig = undefined;
        this.loadStrategyConfig(this.activeStrategyProfileId!, true);
      },
      error: () => {
        this.strategyPublishing = false;
        this.strategyError = this.t('marketSettings.messages.publishVersionFailed');
      },
    });
  }

  createStrategyProfile(): void {
    if (!this.newStrategyProfile.code.trim() || !this.newStrategyProfile.name.trim()) {
      this.strategyError = this.t('marketSettings.messages.profileRequired');
      return;
    }

    this.api.createStrategyProfile(this.newStrategyProfile).subscribe({
      next: (response) => {
        if (!response.data) {
          this.strategyError = this.t('marketSettings.messages.createProfileFailed');
          return;
        }
        this.newStrategyProfile = { code: '', name: '', description: '' };
        this.strategyMessage = this.t('marketSettings.messages.createdProfile');
        this.sectionLoadedAt.strategyProfiles = undefined;
        this.loadStrategyOverview(false, true);
      },
      error: () => {
        this.strategyError = this.t('marketSettings.messages.createProfileFailed');
      },
    });
  }

  activateStrategyProfile(profile: StrategyProfile): void {
    this.api.activateStrategyProfile(profile.id).subscribe({
      next: (response) => {
        if (!response.data) {
          this.strategyError = this.t('marketSettings.messages.activateProfileFailed');
          return;
        }
        this.activeStrategyProfileId = response.data.id;
        this.strategyMessage = `Da chuyen sang profile ${response.data.name}.`;
        this.loadedStrategyConfigProfileId = null;
        this.loadingStrategyConfigProfileId = null;
        this.sectionLoadedAt.strategyConfig = undefined;
        this.loadStrategyConfig(this.activeStrategyProfileId, true);
      },
      error: () => {
        this.strategyError = this.t('marketSettings.messages.activateProfileFailed');
      },
    });
  }

  selectStrategySection(section: StrategySettingsSection): void {
    this.selectedStrategySection = section;
    this.strategyConfigSearch = '';
    this.strategyVariableSearch = '';
    this.ensureStrategyExpansion();
    if (section === 'journal' && !this.isSectionFresh('strategyJournal') && !this.strategyLoading) {
      this.reloadStrategyJournal();
    }
  }

  matchesStrategyConfigSearch(entity: StrategyConfigEntity): boolean {
    const keyword = this.strategyConfigSearch.trim().toLowerCase();
    if (!keyword) {
      return true;
    }

    const source = [
      (entity as any).label,
      (entity as any).formulaCode,
      (entity as any).layerCode,
      (entity as any).ruleCode,
      (entity as any).checklistType,
      entity.expression,
      ...(entity.parameters || []).map((parameter) => `${parameter.label} ${parameter.paramKey}`),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return source.includes(keyword);
  }

  getStrategySectionTitle(): string {
    switch (this.selectedStrategySection) {
      case 'profiles':
        return this.t('marketSettings.strategy.sections.profiles');
      case 'screenRules':
        return this.t('marketSettings.strategy.sections.screenRules');
      case 'alertRules':
        return this.t('marketSettings.strategy.sections.alertRules');
      case 'checklists':
        return this.t('marketSettings.strategy.sections.checklists');
      case 'versions':
        return this.t('marketSettings.strategy.sections.versions');
      default:
        return this.t('marketSettings.strategy.sections.formulas');
    }
  }

  getStrategySectionHelp(): string {
    switch (this.selectedStrategySection) {
      case 'profiles':
        return this.t('marketSettings.strategy.help.profiles');
      case 'screenRules':
        return this.t('marketSettings.strategy.help.screenRules');
      case 'alertRules':
        return this.t('marketSettings.strategy.help.alertRules');
      case 'checklists':
        return this.t('marketSettings.strategy.help.checklists');
      case 'versions':
        return this.t('marketSettings.strategy.help.versions');
      default:
        return this.t('marketSettings.strategy.help.formulas');
    }
  }

  toggleStrategyCard(section: StrategySettingsSection, entity: StrategyConfigEntity): void {
    const key = this.getStrategyCardKey(section, entity);
    this.expandedStrategyCardKey = this.expandedStrategyCardKey === key ? '' : key;
  }

  isStrategyCardOpen(section: StrategySettingsSection, entity: StrategyConfigEntity): boolean {
    return this.expandedStrategyCardKey === this.getStrategyCardKey(section, entity);
  }

  getStrategySectionCount(section: StrategySettingsSection): number {
    if (!this.strategyConfig) {
      return section === 'journal' ? this.strategyJournalRows.length : 0;
    }

    switch (section) {
      case 'profiles':
        return this.strategyProfiles.length;
      case 'formulas':
        return this.strategyConfig.formulas.length;
      case 'screenRules':
        return this.strategyConfig.screenRules.length;
      case 'alertRules':
        return this.strategyConfig.alertRules.length;
      case 'checklists':
        return this.strategyConfig.checklists.length;
      case 'journal':
        return this.strategyJournalRows.length;
      case 'versions':
        return this.strategyConfig.versions.length;
      default:
        return 0;
    }
  }

  reloadStrategyJournal(silent = false, force = false): void {
    if (!this.activeStrategyProfileId) {
      return;
    }
    if (!force && this.strategyJournal.length && this.isSectionFresh('strategyJournal')) {
      return;
    }

    if (!silent) {
      this.strategyLoading = true;
      this.strategyError = '';
      this.strategyMessage = '';
    }
    this.pageLoadState.startBackground(this.pageLoadKey);

    forkJoin({
      journal: this.api.listStrategyJournal(24),
      statements: this.api.listStrategyOrderStatements(120),
    }).subscribe({
      next: ({ journal, statements }) => {
        this.strategyJournal = journal.data || [];
        this.strategyJournalRows = this.strategyJournal.map((item) => this.mapJournalEntryToRow(item));
        this.strategyOrderStatements = statements.data || [];
        this.strategyOrderStatementRows = this.strategyOrderStatements.map((item) => this.mapOrderStatementEntryToRow(item));
        if (this.strategyJournalPrefillPending && this.strategyJournalSuggestion) {
          this.strategyJournalRows.unshift(this.buildStrategyJournalRowFromSuggestion(this.strategyJournalSuggestion));
          this.strategyJournalPrefillPending = false;
        }
        this.strategyLoading = false;
        this.markSectionLoaded('strategyJournal');
        this.pageLoadState.finish(this.pageLoadKey);
      },
      error: () => {
        this.strategyLoading = false;
        this.strategyError = this.t('marketSettings.messages.loadStrategyJournalFailed');
        this.pageLoadState.fail(this.pageLoadKey, this.strategyError);
      },
    });
  }

  loadStrategyHistory(silent = false, force = false): void {
    if (!this.activeStrategyProfileId) {
      return;
    }
    if (!force && this.strategyHistoryItems.length && this.isSectionFresh('strategyHistory')) {
      return;
    }

    this.strategyHistoryLoading = true;
    if (!silent) {
      this.strategyLoading = true;
      this.strategyError = '';
      this.strategyMessage = '';
    }
    this.pageLoadState.startBackground(this.pageLoadKey);

    forkJoin({
      history: this.api.getStrategyActionHistory({
        profileId: this.activeStrategyProfileId,
        status: this.strategyHistoryStatusFilter,
        days: this.strategyHistoryDays,
        limit: 160,
      }),
      reviewReport: this.api.getStrategyReviewReport({
        profileId: this.activeStrategyProfileId,
        days: this.strategyHistoryDays,
        limit: 300,
      }),
    }).subscribe({
        next: (response) => {
          this.strategyHistoryOverview = response.history.data || null;
          this.strategyHistoryItems = response.history.data?.items || [];
          this.strategyReviewReport = response.reviewReport.data || null;
          this.strategyHistoryLoading = false;
          this.strategyLoading = false;
          this.markSectionLoaded('strategyHistory');
          this.pageLoadState.finish(this.pageLoadKey);
        },
        error: () => {
          this.strategyHistoryLoading = false;
          this.strategyLoading = false;
          this.strategyError = this.t('marketSettings.messages.loadWorkflowHistoryFailed');
          this.pageLoadState.fail(this.pageLoadKey, this.strategyError);
        },
      });
  }

  onStrategyHistoryFilterChange(): void {
    this.loadStrategyHistory(false, true);
  }

  get strategyReviewSummaryCards(): Array<{ label: string; value: string; tone?: string }> {
    const report = this.strategyReviewReport;
    if (!report) {
      return [];
    }
    return [
      {
        label: 'Win rate',
        value: `${(report.performance.winRate ?? 0).toFixed(1)}%`,
        tone: report.performance.winRate >= 60 ? 'positive' : report.performance.winRate < 45 ? 'danger' : 'warning',
      },
      {
        label: 'Realized PnL',
        value: this.formatLargeNumber(report.performance.realizedPnlValue),
        tone: report.performance.realizedPnlValue > 0 ? 'positive' : report.performance.realizedPnlValue < 0 ? 'danger' : 'default',
      },
      {
        label: 'Workflow open',
        value: `${report.workflow.pending}`,
        tone: report.workflow.pending > 0 ? 'warning' : 'positive',
      },
      {
        label: 'Critical alerts',
        value: `${report.portfolio.criticalAlerts}`,
        tone: report.portfolio.criticalAlerts > 0 ? 'danger' : report.portfolio.warningAlerts > 0 ? 'warning' : 'positive',
      },
    ];
  }

  private markSectionLoaded(section: SettingsLoadSection): void {
    this.sectionLoadedAt[section] = Date.now();
  }

  private isSectionFresh(section: SettingsLoadSection, maxAgeMs = this.sectionMaxAgeMs[section]): boolean {
    const loadedAt = this.sectionLoadedAt[section];
    return typeof loadedAt === 'number' && Date.now() - loadedAt <= maxAgeMs;
  }

  addStrategyJournalRow(prefill?: Partial<StrategyJournalRow>): void {
    const row = this.buildEmptyStrategyJournalRow();
    this.strategyJournalRows = [...this.strategyJournalRows, { ...row, ...prefill, isNew: true }];
  }

  addStrategyOrderStatementRow(prefill?: Partial<StrategyOrderStatementRow>): void {
    const row = this.buildEmptyOrderStatementRow();
    this.strategyOrderStatementRows = [...this.strategyOrderStatementRows, { ...row, ...prefill, isNew: true }];
  }

  duplicateStrategyOrderStatementRow(row: StrategyOrderStatementRow): void {
    const clone: StrategyOrderStatementRow = {
      ...row,
      id: undefined,
      clientKey: this.nextClientRowKey('statement'),
      createdAt: null,
      updatedAt: null,
      isSaving: false,
      isNew: true,
      broker_reference: '',
    };
    const index = this.strategyOrderStatementRows.indexOf(row);
    if (index < 0) {
      this.strategyOrderStatementRows = [...this.strategyOrderStatementRows, clone];
      return;
    }
    const rows = [...this.strategyOrderStatementRows];
    rows.splice(index + 1, 0, clone);
    this.strategyOrderStatementRows = rows;
  }

  private isStrategyJournalRowBlank(row: StrategyJournalRow): boolean {
    return !row.id
      && !row.symbol.trim()
      && !row.notes.trim()
      && !row.strategy_name.trim()
      && !row.psychology.trim()
      && !this.preferredNumber(row.entry_price)
      && !this.preferredNumber(row.exit_price)
      && !this.preferredNumber(row.stop_loss_price)
      && !this.preferredNumber(row.take_profit_price)
      && !this.preferredNumber(row.quantity)
      && !this.preferredNumber(row.total_capital);
  }

  private isStrategyOrderStatementRowBlank(row: StrategyOrderStatementRow): boolean {
    return !row.id
      && !row.symbol.trim()
      && !this.preferredNumber(row.quantity)
      && !this.preferredNumber(row.price)
      && !this.preferredNumber(row.transfer_fee);
  }

  private async persistStrategyJournalRow(
    row: StrategyJournalRow,
    options: { announce?: boolean; clearStatus?: boolean } = {}
  ): Promise<void> {
    if (this.isStrategyJournalRowBlank(row)) {
      return;
    }
    if (!this.activeStrategyProfileId) {
      throw new Error(this.t('marketSettings.messages.profileRequired'));
    }
    if (!row.symbol.trim()) {
      throw new Error(this.t('marketSettings.messages.symbolRequired'));
    }

    const payload = this.buildJournalPayload(row);
    const request$ = row.id
      ? this.api.updateStrategyJournal(row.id, payload)
      : this.api.createStrategyJournal(payload);

    row.isSaving = true;
    if (options.clearStatus !== false) {
      this.strategyError = '';
      this.strategyMessage = '';
    }

    try {
      const response = await firstValueFrom(request$);
      if (!response.data) {
        throw new Error(
          row.id
            ? this.t('marketSettings.messages.updateJournalFailed')
            : this.t('marketSettings.messages.saveJournalFailed')
        );
      }
      const savedRow = this.mapJournalEntryToRow(response.data);
      const index = this.strategyJournalRows.indexOf(row);
      if (index >= 0) {
        this.strategyJournalRows.splice(index, 1, savedRow);
        this.strategyJournalRows = [...this.strategyJournalRows];
      } else {
        this.strategyJournalRows = [...this.strategyJournalRows, savedRow];
      }
      if (options.announce !== false) {
        this.strategyMessage = row.id
          ? this.t('marketSettings.messages.updatedJournal')
          : this.t('marketSettings.messages.createdJournal');
      }
      this.markSectionLoaded('strategyJournal');
    } catch (error) {
      this.strategyError = row.id
        ? this.extractApiErrorMessage(error, 'marketSettings.messages.updateJournalFailedVerbose')
        : this.extractApiErrorMessage(error, 'marketSettings.messages.saveJournalFailedVerbose');
      throw error;
    } finally {
      row.isSaving = false;
    }
  }

  private async persistStrategyOrderStatementRow(
    row: StrategyOrderStatementRow,
    options: { announce?: boolean; clearStatus?: boolean } = {}
  ): Promise<void> {
    if (this.isStrategyOrderStatementRowBlank(row)) {
      return;
    }
    if (!this.activeStrategyProfileId) {
      throw new Error(this.t('marketSettings.messages.profileRequired'));
    }
    if (!row.symbol.trim()) {
      throw new Error(this.t('marketSettings.messages.symbolRequired'));
    }
    const quantityValue = this.preferredNumber(row.quantity);
    const priceValue = this.preferredNumber(row.price);
    if (quantityValue === null || quantityValue === 0 || priceValue === null || priceValue === 0) {
      throw new Error(this.t('marketSettings.messages.orderStatementQuantityPriceRequired'));
    }

    const payload = this.buildOrderStatementPayload(row);
    const request$ = row.id
      ? this.api.updateStrategyOrderStatement(row.id, payload)
      : this.api.createStrategyOrderStatement(payload);

    row.isSaving = true;
    if (options.clearStatus !== false) {
      this.strategyError = '';
      this.strategyMessage = '';
    }

    try {
      const response = await firstValueFrom(request$);
      if (!response.data) {
        throw new Error(
          row.id
            ? this.t('marketSettings.messages.updateOrderStatementFailed')
            : this.t('marketSettings.messages.saveOrderStatementFailed')
        );
      }
      const savedRow = this.mapOrderStatementEntryToRow(response.data);
      const index = this.strategyOrderStatementRows.indexOf(row);
      if (index >= 0) {
        this.strategyOrderStatementRows.splice(index, 1, savedRow);
        this.strategyOrderStatementRows = [...this.strategyOrderStatementRows];
      } else {
        this.strategyOrderStatementRows = [...this.strategyOrderStatementRows, savedRow];
      }
      if (options.announce !== false) {
        this.strategyMessage = row.id
          ? this.t('marketSettings.messages.updatedOrderStatement')
          : this.t('marketSettings.messages.createdOrderStatement');
      }
      this.markSectionLoaded('strategyJournal');
    } catch (error) {
      this.strategyError = row.id
        ? this.extractApiErrorMessage(error, 'marketSettings.messages.updateOrderStatementFailedVerbose')
        : this.extractApiErrorMessage(error, 'marketSettings.messages.saveOrderStatementFailedVerbose');
      throw error;
    } finally {
      row.isSaving = false;
    }
  }

  async saveAllStrategyLedger(): Promise<void> {
    if (this.strategyLedgerSaving) {
      return;
    }

    this.strategyLedgerSaving = true;
    this.strategyError = '';
    this.strategyMessage = '';
    let savedOrderStatementCount = 0;
    let savedJournalCount = 0;
    const errors: string[] = [];

    try {
      for (const row of [...this.strategyOrderStatementRows]) {
        if (this.isStrategyOrderStatementRowBlank(row)) {
          continue;
        }
        try {
          await this.persistStrategyOrderStatementRow(row, { announce: false, clearStatus: false });
          savedOrderStatementCount += 1;
        } catch (error) {
          errors.push(this.describeStrategyLedgerSaveError('statement', row.symbol, error));
        }
      }

      for (const row of [...this.strategyJournalRows]) {
        if (this.isStrategyJournalRowBlank(row)) {
          continue;
        }
        try {
          await this.persistStrategyJournalRow(row, { announce: false, clearStatus: false });
          savedJournalCount += 1;
        } catch (error) {
          errors.push(this.describeStrategyLedgerSaveError('journal', row.symbol, error));
        }
      }

      const totalSaved = savedOrderStatementCount + savedJournalCount;
      if (totalSaved > 0) {
        this.strategyMessage = `Da luu ${savedOrderStatementCount} dong Sao ke va ${savedJournalCount} dong Entries.`;
        this.markSectionLoaded('strategyJournal');
        this.reloadStrategyJournal(true, true);
      }

      if (errors.length) {
        this.strategyError =
          errors.length === 1
            ? errors[0]
            : `${errors[0]} (+${errors.length - 1} loi khac)`;
      } else if (!totalSaved) {
        this.strategyError = 'Chua co dong hop le de luu.';
      }
    } finally {
      this.strategyLedgerSaving = false;
    }
  }

  saveStrategyJournalRow(row: StrategyJournalRow): void {
    this.persistStrategyJournalRow(row).catch(() => undefined);
  }

  deleteStrategyJournalRow(row: StrategyJournalRow): void {
    if (!row.id) {
      this.strategyJournalRows = this.strategyJournalRows.filter((item) => item !== row);
      return;
    }

    const confirmed = window.confirm(this.formatMessage('marketSettings.messages.confirmDeleteJournal', { symbol: row.symbol }));
    if (!confirmed) {
      return;
    }

    this.api.deleteStrategyJournal(row.id).subscribe({
      next: (response) => {
        if (!response.data) {
          this.strategyError = this.t('marketSettings.messages.deleteJournalFailed');
          return;
        }
        this.strategyJournalRows = this.strategyJournalRows.filter((item) => item !== row);
        this.strategyMessage = this.t('marketSettings.messages.deletedJournal');
        this.markSectionLoaded('strategyJournal');
      },
      error: () => {
        this.strategyError = this.t('marketSettings.messages.deleteJournalFailedVerbose');
      },
    });
  }

  saveStrategyOrderStatementRow(row: StrategyOrderStatementRow): void {
    this.persistStrategyOrderStatementRow(row).catch(() => undefined);
  }

  deleteStrategyOrderStatementRow(row: StrategyOrderStatementRow): void {
    if (!row.id) {
      this.strategyOrderStatementRows = this.strategyOrderStatementRows.filter((item) => item !== row);
      return;
    }

    const confirmed = window.confirm(this.formatMessage('marketSettings.messages.confirmDeleteOrderStatement', { symbol: row.symbol }));
    if (!confirmed) {
      return;
    }

    this.api.deleteStrategyOrderStatement(row.id).subscribe({
      next: (response) => {
        if (!response.data) {
          this.strategyError = this.t('marketSettings.messages.deleteOrderStatementFailed');
          return;
        }
        this.strategyOrderStatementRows = this.strategyOrderStatementRows.filter((item) => item !== row);
        this.strategyMessage = this.t('marketSettings.messages.deletedOrderStatement');
        this.markSectionLoaded('strategyJournal');
      },
      error: () => {
        this.strategyError = this.t('marketSettings.messages.deleteOrderStatementFailedVerbose');
      },
    });
  }

  parseStrategyJournalRowTags(row: StrategyJournalRow, input: string): void {
    row.mistake_tags_json = input
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  trackByStrategyJournalRow(_: number, item: StrategyJournalRow): number | string {
    return item.id || item.clientKey || `${item.symbol}:${item.trade_date}:${item.createdAt || 'new'}`;
  }

  trackByStrategyOrderStatementRow(_: number, item: StrategyOrderStatementRow): number | string {
    return item.id || item.clientKey || `${item.symbol}:${item.trade_date}:${item.broker_reference || 'new'}`;
  }

  orderStatementGroupItems(): Array<{ key: OrderStatementGroupMode; label: string }> {
    return [
      { key: 'symbol', label: this.t('marketSettings.orderStatement.groupBySymbol') },
      { key: 'tradeDate', label: this.t('marketSettings.orderStatement.groupByTradeDate') },
    ];
  }

  groupedOrderStatementRows(): OrderStatementGroupVm[] {
    const groups = new Map<string, OrderStatementGroupVm>();
    for (const row of this.strategyOrderStatementRows) {
      const key = this.orderStatementGroupMode === 'tradeDate'
        ? (row.trade_date || 'no-date')
        : (row.symbol?.trim().toUpperCase() || 'NO_SYMBOL');
      const label = this.orderStatementGroupMode === 'tradeDate'
        ? (row.trade_date || this.t('marketSettings.orderStatement.noTradeDate'))
        : (row.symbol?.trim().toUpperCase() || this.t('marketSettings.orderStatement.noSymbol'));

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label,
          rows: [],
          totalGrossValue: 0,
          totalNetAmount: 0,
        });
      }

      const group = groups.get(key)!;
      group.rows.push(row);
      group.totalGrossValue += this.computeOrderStatementGrossValue(row) || 0;
      group.totalNetAmount += this.computeOrderStatementNetAmount(row) || 0;
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        rows: [...group.rows].sort((left, right) => {
          const leftDate = left.trade_date || '';
          const rightDate = right.trade_date || '';
          if (leftDate !== rightDate) {
            return rightDate.localeCompare(leftDate);
          }
          return (left.symbol || '').localeCompare(right.symbol || '');
        }),
      }))
      .sort((left, right) => {
        if (this.orderStatementGroupMode === 'tradeDate') {
          return right.key.localeCompare(left.key);
        }
        return left.label.localeCompare(right.label);
      });
  }

  computeOrderStatementGrossValue(row: StrategyOrderStatementRow): number | null {
    const quantity = this.preferredNumber(row.quantity);
    const price = this.preferredNumber(row.price);
    if (quantity === null || price === null) {
      return this.preferredNumber(row.gross_value);
    }
    return Math.round(quantity * price * 100) / 100;
  }

  computeOrderStatementNetAmount(row: StrategyOrderStatementRow): number | null {
    const gross = this.computeOrderStatementGrossValue(row);
    const fee = this.preferredNumber(row.fee, 0) || 0;
    const tax = this.preferredNumber(row.tax, 0) || 0;
    const transferFee = this.preferredNumber(row.transfer_fee, 0) || 0;
    if (gross === null) {
      return this.preferredNumber(row.net_amount);
    }
    const totalCharges = fee + tax + transferFee;
    const net = row.trade_side === 'sell' ? gross - totalCharges : gross + totalCharges;
    return Math.round(net * 100) / 100;
  }

  formatOrderStatementSide(tradeSide: string | null | undefined): string {
    return String(tradeSide || '').trim().toLowerCase() === 'sell'
      ? this.t('marketSettings.orderStatement.sideSell')
      : this.t('marketSettings.orderStatement.sideBuy');
  }

  resolveOrderStatementOrderType(tradeSide: string | null | undefined): string {
    return String(tradeSide || '').trim().toLowerCase() === 'sell' ? 'Sell' : 'Buy';
  }

  formatOrderStatementNumber(value: number | null | undefined): string {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return '--';
    }
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  getLinkedOrderStatementRows(row: StrategyJournalRow): StrategyOrderStatementRow[] {
    if (!row.id) {
      return [];
    }
    return this.strategyOrderStatementRows.filter((item) => item.journal_entry_id === row.id);
  }

  isLinkedOrderStatementsExpanded(row: StrategyJournalRow): boolean {
    return !!row.id && this.expandedLinkedOrderStatementIds.has(row.id);
  }

  toggleLinkedOrderStatements(row: StrategyJournalRow): void {
    if (!row.id || !this.hasOrderStatementSync(row)) {
      return;
    }
    const next = new Set(this.expandedLinkedOrderStatementIds);
    if (next.has(row.id)) {
      next.delete(row.id);
    } else {
      next.add(row.id);
    }
    this.expandedLinkedOrderStatementIds = next;
  }

  getLinkedOrderStatementCount(row: StrategyJournalRow): number {
    return this.getLinkedOrderStatementRows(row).length;
  }

  getLinkedOrderStatementGrossTotal(row: StrategyJournalRow): number {
    return this.getLinkedOrderStatementRows(row).reduce((sum, item) => sum + (this.computeOrderStatementGrossValue(item) || 0), 0);
  }

  getLinkedOrderStatementNetTotal(row: StrategyJournalRow): number {
    return this.getLinkedOrderStatementRows(row).reduce((sum, item) => sum + (this.computeOrderStatementNetAmount(item) || 0), 0);
  }

  getLinkedOrderStatementLatestTradeDate(row: StrategyJournalRow): string | null {
    const values = this.getLinkedOrderStatementRows(row)
      .map((item) => item.trade_date || '')
      .filter(Boolean)
      .sort((left, right) => right.localeCompare(left));
    return values[0] || null;
  }

  hasOrderStatementSync(row: StrategyJournalRow): boolean {
    return this.getLinkedOrderStatementCount(row) > 0;
  }

  getOrderStatementSyncSummary(row: StrategyJournalRow): string {
    const count = this.getLinkedOrderStatementCount(row);
    if (!count) {
      return 'Chưa có dòng khớp lệnh liên kết.';
    }
    const gross = this.formatOrderStatementNumber(this.getLinkedOrderStatementGrossTotal(row));
    const latestTradeDate = this.getLinkedOrderStatementLatestTradeDate(row);
    return latestTradeDate
      ? `${count} dòng khớp lệnh, tổng giá trị ${gross}, khớp gần nhất ${latestTradeDate}.`
      : `${count} dòng khớp lệnh, tổng giá trị ${gross}.`;
  }

  getFormattedNumberInputValue(
    row: StrategyJournalRow | StrategyOrderStatementRow,
    field: string,
    mode: 'integer' | 'decimal' = 'integer'
  ): string {
    const draft = this.getNumericDraft(row, field);
    if (this.isNumericFieldEditing(row, field) && draft !== undefined) {
      return draft;
    }
    const rawValue = (row as Record<string, any>)[field];
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return '';
    }
    const num = Number(rawValue);
    if (!Number.isFinite(num)) {
      return '';
    }
    return mode === 'decimal' ? this.numericDecimalFormatter.format(num) : this.numericIntegerFormatter.format(num);
  }

  beginFormattedNumberEdit(row: StrategyJournalRow | StrategyOrderStatementRow, field: string): void {
    const editingSet = this.getNumericEditingSet(row, true)!;
    editingSet.add(field);
    this.setNumericDraft(row, field, this.rawNumberString((row as Record<string, any>)[field]));
  }

  updateFormattedNumberField(row: StrategyJournalRow | StrategyOrderStatementRow, field: string, rawValue: string): void {
    this.setNumericDraft(row, field, rawValue);
    (row as Record<string, any>)[field] = this.parseLooseNumber(rawValue);
  }

  endFormattedNumberEdit(row: StrategyJournalRow | StrategyOrderStatementRow, field: string): void {
    const editingSet = this.getNumericEditingSet(row);
    editingSet?.delete(field);
  }

  addStrategyJournalExamples(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.addStrategyJournalRow({
      symbol: 'FPT',
      trade_date: today,
      classification: 'swing',
      trade_side: 'buy',
      entry_price: 75100,
      stop_loss_price: 72800,
      take_profit_price: 81200,
      quantity: 500,
      total_capital: 37550000,
      strategy_name: 'Trend leader',
      psychology: 'Kỷ luật',
      notes: 'Mẫu: mã dẫn dắt công nghệ, giữ nền giá tốt.',
    });
    this.addStrategyJournalRow({
      symbol: 'SSI',
      trade_date: today,
      classification: 'retest',
      trade_side: 'buy',
      entry_price: 28550,
      stop_loss_price: 27600,
      take_profit_price: 30900,
      quantity: 1500,
      total_capital: 42825000,
      strategy_name: 'Retest breakout',
      psychology: 'Bình tĩnh',
      notes: 'Mẫu: dòng chứng khoán retest sau phiên kéo.',
    });
    this.addStrategyJournalRow({
      symbol: 'MWG',
      trade_date: today,
      classification: 'position',
      trade_side: 'buy',
      entry_price: 61200,
      stop_loss_price: 58800,
      take_profit_price: 66200,
      quantity: 400,
      total_capital: 24480000,
      strategy_name: 'Position build',
      psychology: 'Chờ xác nhận',
      notes: 'Mẫu: tích lũy vị thế theo nhịp phục hồi tiêu dùng.',
    });
  }

  addStrategyOrderStatementExamples(): void {
    const tradeDate = new Date().toISOString().slice(0, 10);
    const settlementDate = this.addDaysToIsoDate(tradeDate, 2);
    this.addStrategyOrderStatementRow({
      symbol: 'FPT',
      trade_date: tradeDate,
      settlement_date: settlementDate,
      trade_side: 'buy',
      quantity: 500,
      price: 75100,
      transfer_fee: 0,
    });
    this.addStrategyOrderStatementRow({
      symbol: 'SSI',
      trade_date: tradeDate,
      settlement_date: settlementDate,
      trade_side: 'buy',
      quantity: 1500,
      price: 28550,
      transfer_fee: 0,
    });
    this.addStrategyOrderStatementRow({
      symbol: 'MWG',
      trade_date: tradeDate,
      settlement_date: settlementDate,
      trade_side: 'buy',
      quantity: 400,
      price: 61200,
      transfer_fee: 0,
    });
  }

  addStrategyLedgerExamples(): void {
    this.addStrategyOrderStatementExamples();
    this.addStrategyJournalExamples();
  }

  saveStrategyJournal(): void {
    if (!this.activeStrategyProfileId || !this.strategyJournalForm.symbol.trim()) {
      this.strategyError = this.t('marketSettings.messages.symbolRequired');
      return;
    }

    const payload = {
      profile_id: this.activeStrategyProfileId,
      symbol: this.strategyJournalForm.symbol.trim().toUpperCase(),
      trade_date: this.strategyJournalForm.trade_date,
      classification: this.strategyJournalForm.classification,
      trade_side: this.strategyJournalForm.trade_side,
      entry_price: this.strategyJournalForm.entry_price,
      exit_price: this.strategyJournalForm.exit_price,
      stop_loss_price: this.strategyJournalForm.stop_loss_price,
      take_profit_price: this.strategyJournalForm.take_profit_price,
      quantity: this.strategyJournalForm.quantity,
      position_size: this.strategyJournalForm.position_size,
      total_capital: this.strategyJournalForm.total_capital,
      strategy_name: this.strategyJournalForm.strategy_name,
      psychology: this.strategyJournalForm.psychology,
      notes: this.strategyJournalForm.notes,
      mistake_tags_json: this.strategyJournalForm.mistake_tags_json,
      signal_snapshot_json: this.strategyJournalSourceItem
        ? {
            volumeIntelligence: this.strategyJournalSourceItem.volumeIntelligence,
            candlestickSignals: this.strategyJournalSourceItem.candlestickSignals,
            footprintSignals: this.strategyJournalSourceItem.footprintSignals,
          }
        : undefined,
      result_snapshot_json: this.strategyJournalSourceItem
        ? {
            winningScore: this.strategyJournalSourceItem.winningScore,
            qScore: this.strategyJournalSourceItem.qScore,
            lScore: this.strategyJournalSourceItem.lScore,
            mScore: this.strategyJournalSourceItem.mScore,
            pScore: this.strategyJournalSourceItem.pScore,
            riskScore: this.strategyJournalSourceItem.riskScore,
            fairValue: this.strategyJournalSourceItem.fairValue,
            marginOfSafety: this.strategyJournalSourceItem.marginOfSafety,
            executionPlan: this.strategyJournalSourceItem.executionPlan,
          }
        : undefined,
    };

    const request$ = this.editingStrategyJournalId
      ? this.api.updateStrategyJournal(this.editingStrategyJournalId, payload)
      : this.api.createStrategyJournal(payload);

    this.strategySaving = true;
    this.strategyError = '';
    this.strategyMessage = '';

    request$.subscribe({
      next: (response) => {
        this.strategySaving = false;
        if (!response.data) {
          this.strategyError = this.editingStrategyJournalId
            ? this.t('marketSettings.messages.updateJournalFailed')
            : this.t('marketSettings.messages.saveJournalFailed');
          return;
        }
        this.strategyMessage = this.editingStrategyJournalId
          ? this.t('marketSettings.messages.updatedJournal')
          : this.t('marketSettings.messages.createdJournal');
        this.resetStrategyJournalForm();
        this.reloadStrategyJournal(true, true);
      },
      error: () => {
        this.strategySaving = false;
        this.strategyError = this.editingStrategyJournalId
          ? this.t('marketSettings.messages.updateJournalFailedVerbose')
          : this.t('marketSettings.messages.saveJournalFailedVerbose');
      },
    });
  }

  editStrategyJournal(item: StrategyJournalEntry): void {
    this.strategyJournalSuggestion = null;
    this.strategyJournalSourceItem = null;
    this.editingStrategyJournalId = item.id;
    this.strategyJournalForm = {
      symbol: item.symbol || '',
      trade_date: item.tradeDate || new Date().toISOString().slice(0, 10),
      classification: item.classification || 'swing',
      trade_side: item.tradeSide || 'buy',
      entry_price: item.entryPrice ?? null,
      exit_price: item.exitPrice ?? null,
      stop_loss_price: item.stopLossPrice ?? null,
      take_profit_price: item.takeProfitPrice ?? null,
      quantity: item.quantity ?? null,
      position_size: item.positionSize ?? null,
      total_capital: item.totalCapital ?? null,
      strategy_name: item.strategyName || '',
      psychology: item.psychology || '',
      notes: item.notes || '',
      mistake_tags_json: [...(item.mistakeTags || [])],
    };
  }

  cancelStrategyJournalEdit(): void {
    this.resetStrategyJournalForm();
  }

  deleteStrategyJournal(item: StrategyJournalEntry): void {
    const confirmed = window.confirm(this.formatMessage('marketSettings.messages.confirmDeleteJournal', { symbol: item.symbol }));
    if (!confirmed) {
      return;
    }

    this.api.deleteStrategyJournal(item.id).subscribe({
      next: (response) => {
        if (!response.data) {
          this.strategyError = this.t('marketSettings.messages.deleteJournalFailed');
          return;
        }
        if (this.editingStrategyJournalId === item.id) {
          this.resetStrategyJournalForm();
        }
        this.strategyMessage = this.t('marketSettings.messages.deletedJournal');
        this.reloadStrategyJournal(true);
      },
      error: () => {
        this.strategyError = this.t('marketSettings.messages.deleteJournalFailedVerbose');
      },
    });
  }

  parseStrategyJournalTags(input: string): void {
    this.strategyJournalForm.mistake_tags_json = input
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  useStrategyJournalSuggestion(): void {
    if (this.strategyJournalSuggestion) {
      this.strategyJournalRows = [...this.strategyJournalRows, this.buildStrategyJournalRowFromSuggestion(this.strategyJournalSuggestion)];
      this.strategyJournalPrefillPending = false;
    }
  }

  trackByStrategyCode(
    _: number,
    item: StrategyProfile | StrategyFormula | StrategyScreenRule | StrategyAlertRule | StrategyChecklistItem
  ): string | number {
    return (item as any).id || (item as any).code || (item as any).formulaCode || (item as any).ruleCode || (item as any).itemCode;
  }

  updateParameterNumber(parameter: StrategyParameter, event: Event): void {
    const target = event.target as HTMLInputElement;
    if (parameter.dataType === 'text') {
      parameter.value = target.value;
      return;
    }
    parameter.value = target.value === '' ? null : Number(target.value);
  }

  getFriendlyExpression(entity: StrategyConfigEntity): string {
    let rendered = entity.expression || '';
    const variables = this.getVariableHints(entity);
    variables.forEach((item) => {
      const pattern = new RegExp(`\\b${this.escapeRegExp(item.key)}\\b`, 'g');
      rendered = rendered.replace(pattern, item.label);
    });
    return rendered;
  }

  getVariableHints(entity: StrategyConfigEntity): StrategyVariableHint[] {
    const tokens = this.extractExpressionTokens(entity.expression || '');
    const hints = tokens
      .map((token) => this.resolveVariableHint(token, entity.parameters || []))
      .filter((item): item is StrategyVariableHint => !!item);

    const seen = new Set<string>();
    return hints.filter((item) => {
      if (seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    });
  }

  getParameterValueLabel(parameter: StrategyParameter): string {
    if (parameter.dataType === 'boolean') {
      return parameter.value ? 'Bat' : 'Tat';
    }
    if (parameter.value === null || parameter.value === undefined || parameter.value === '') {
      return this.t('marketSettings.messages.notSet');
    }
    return String(parameter.value);
  }

  getExpressionBuilderVariables(entity: StrategyConfigEntity): StrategyVariableHint[] {
    const parameterHints = (entity.parameters || []).map((parameter) => ({
      key: parameter.paramKey,
      label: parameter.label,
      description: `Tham so cau hinh. Gia tri hien tai: ${this.getParameterValueLabel(parameter)}.`,
      kind: 'parameter' as const,
    }));

    const hintedVariables = EXPRESSION_VARIABLE_ORDER.map((key) => VARIABLE_HINTS[key]).filter(
      (item): item is StrategyVariableHint => !!item
    );

    const usedVariables = this.getVariableHints(entity);
    const ordered = [...parameterHints, ...hintedVariables, ...usedVariables];
    const seen = new Set<string>();

    return ordered.filter((item) => {
      if (seen.has(item.key)) {
        return false;
      }
      seen.add(item.key);
      return true;
    });
  }

  filterExpressionBuilderVariables(entity: StrategyConfigEntity): StrategyVariableHint[] {
    const keyword = this.strategyVariableSearch.trim().toLowerCase();
    const variables = this.getExpressionBuilderVariables(entity);
    if (!keyword) {
      return variables;
    }

    return variables.filter((variable) =>
      [variable.label, variable.key, variable.description].join(' ').toLowerCase().includes(keyword)
    );
  }

  insertExpressionToken(entity: StrategyConfigEntity, editor: HTMLTextAreaElement, token: string): void {
    const expression = entity.expression || '';
    const start = editor.selectionStart ?? expression.length;
    const end = editor.selectionEnd ?? expression.length;
    const before = expression.slice(0, start);
    const after = expression.slice(end);
    const nextExpression = `${before}${token}${after}`;

    entity.expression = nextExpression;
    editor.value = nextExpression;
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    const nextCaret = before.length + token.length;
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(nextCaret, nextCaret);
    });
  }

  onLanguageChange(): void {
    this.i18n.setLanguage(this.settings.language);
  }

  onThemeChange(): void {
    this.theme.applyTheme(this.settings.theme);
  }

  getThemePreviewIcon(): string {
    if (this.settings.theme === 'dark') {
      return 'moon';
    }
    if (this.settings.theme === 'auto') {
      return 'contrast';
    }
    return 'sunny';
  }

  getThemePreviewLabel(): string {
    if (this.settings.theme === 'dark') {
      return this.i18n.translate('settings.themePreviewDarkLabel');
    }
    if (this.settings.theme === 'auto') {
      return `${this.i18n.translate('settings.themePreviewAutoLabel')} (${this.getResolvedThemeLabel()})`;
    }
    return this.i18n.translate('settings.themePreviewLightLabel');
  }

  getThemePreviewDescription(): string {
    if (this.settings.theme === 'dark') {
      return this.i18n.translate('settings.themePreviewDarkDesc');
    }
    if (this.settings.theme === 'auto') {
      return this.i18n.translate('settings.themePreviewAutoDesc');
    }
    return this.i18n.translate('settings.themePreviewLightDesc');
  }

  getResolvedThemeLabel(): string {
    return this.theme.getResolvedMode(this.settings.theme) === 'dark'
      ? this.i18n.translate('settings.themeResolvedDark')
      : this.i18n.translate('settings.themeResolvedLight');
  }

  logout(): void {
    const confirmed = window.confirm(this.i18n.translate('settings.logoutConfirm'));
    if (!confirmed) {
      return;
    }

    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  openUserGuide(): void {
    this.router.navigateByUrl('/tabs/user-guide');
  }

  formatSyncTime(value: string | null | undefined): string {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('vi-VN');
  }

  getSyncBatchText(job: MarketSyncJobStatus): string {
    if (!job.totalBatches || !job.batchIndex) {
      return '--';
    }
    return `${job.batchIndex}/${job.totalBatches}`;
  }

  getSyncRemainingText(job: MarketSyncJobStatus): string {
    if (job.remainingBatches === null || job.remainingBatches === undefined) {
      return '--';
    }
    return `${job.remainingBatches}`;
  }

  getSyncHealthLabel(job: MarketSyncJobStatus): string {
    switch (job.health) {
      case 'healthy':
        return 'Ổn định';
      case 'soft-failed':
        return 'Fail mềm';
      case 'hard-failed':
        return 'Fail cứng';
      case 'recovered':
        return 'Đã hồi phục';
      default:
        return 'Chưa chạy';
    }
  }

  getSyncHealthTone(job: MarketSyncJobStatus): string {
    switch (job.health) {
      case 'healthy':
        return 'positive';
      case 'soft-failed':
        return 'warning';
      case 'hard-failed':
        return 'danger';
      case 'recovered':
        return 'recovered';
      default:
        return 'idle';
    }
  }

  getSyncLagText(job: MarketSyncJobStatus): string {
    if (job.ageSeconds === null || job.ageSeconds === undefined) {
      return '--';
    }
    if (job.ageSeconds < 60) {
      return `${job.ageSeconds}s`;
    }
    if (job.ageSeconds < 3600) {
      return `${Math.floor(job.ageSeconds / 60)}m`;
    }
    return `${Math.floor(job.ageSeconds / 3600)}h`;
  }

  hasSyncIssue(job: MarketSyncJobStatus): boolean {
    return ['soft-failed', 'hard-failed'].includes(job.health || '');
  }

  getSyncSourceText(job: MarketSyncJobStatus): string {
    const value = String(job.source || '').trim();
    return value || '--';
  }

  getIntradayCoverageLabel(job: MarketSyncJobStatus): string {
    switch (job.coverageMode) {
      case 'full':
        return this.t('marketSettings.sync.coverageFull');
      case 'rotated':
        return this.t('marketSettings.sync.coverageRotated');
      default:
        return '--';
    }
  }

  getIntradayCoverageTone(job: MarketSyncJobStatus): string {
    switch (job.coverageMode) {
      case 'full':
        return 'positive';
      case 'rotated':
        return 'warning';
      default:
        return 'idle';
    }
  }

  coverageBuckets(): MarketCoverageBucket[] {
    const coverage = this.syncStatus?.coverage;
    if (!coverage) {
      return [];
    }
    return [coverage.all, ...Object.values(coverage.byExchange || {})];
  }

  formatCoveragePercent(value: number | null | undefined): string {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return '--';
    }
    return `${num.toFixed(2)}%`;
  }

  formatCoverageCount(value: number | null | undefined, total: number | null | undefined): string {
    const left = Number(value);
    const right = Number(total);
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      return '--';
    }
    return `${left}/${right}`;
  }

  private extractExpressionTokens(expression: string): string[] {
    const matches = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    return matches.filter((item) => !EXPRESSION_RESERVED_WORDS.has(item));
  }

  private resolveVariableHint(token: string, parameters: StrategyParameter[]): StrategyVariableHint | null {
    const parameter = parameters.find((item) => item.paramKey === token);
    if (parameter) {
      return {
        key: token,
        label: parameter.label,
        description: `Gia tri cau hinh hien tai: ${this.getParameterValueLabel(parameter)}.`,
        kind: 'parameter',
      };
    }
    return (
      VARIABLE_HINTS[token] || {
        key: token,
        label: token.replace(/_/g, ' '),
        description: 'Bien ky thuat dang duoc dung trong cong thuc, chua co mo ta business rieng.',
        kind: 'metric',
      }
    );
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private ensureStrategyExpansion(): void {
    if (!this.strategyConfig) {
      this.expandedStrategyCardKey = '';
      return;
    }

    const currentItems = this.getStrategyEntities(this.selectedStrategySection);
    if (!currentItems.length) {
      this.expandedStrategyCardKey = '';
      return;
    }

    const hasCurrent = currentItems.some(
      (item) => this.getStrategyCardKey(this.selectedStrategySection, item) === this.expandedStrategyCardKey
    );

    if (!hasCurrent) {
      this.expandedStrategyCardKey = this.getStrategyCardKey(this.selectedStrategySection, currentItems[0]);
    }
  }

  private getStrategyEntities(section: StrategySettingsSection): StrategyConfigEntity[] {
    if (!this.strategyConfig) {
      return [];
    }

    switch (section) {
      case 'formulas':
        return this.strategyConfig.formulas;
      case 'screenRules':
        return this.strategyConfig.screenRules;
      case 'alertRules':
        return this.strategyConfig.alertRules;
      case 'checklists':
        return this.strategyConfig.checklists;
      default:
        return [];
    }
  }

  private applyRouteState(): void {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    const section = this.route.snapshot.queryParamMap.get('section');
    if (tab === 'journal' || (tab === 'strategy' && section === 'journal')) {
      this.selectedTab = 'journal';
      this.selectedStrategySection = 'journal';
    } else if (tab === 'history') {
      this.selectedTab = 'history';
    } else if (tab === 'strategy') {
      this.selectedTab = 'strategy';
    }

    if (this.isStrategySection(section) && section !== 'journal') {
      this.selectedStrategySection = section;
    }
  }

  private consumeStrategyJournalPrefill(): void {
    const state = (window.history.state || {}) as { strategyJournalPrefill?: StrategyScoredItem | null };
    const item = state.strategyJournalPrefill;
    if (!item?.symbol) {
      return;
    }

    this.selectedTab = 'journal';
    this.selectedStrategySection = 'journal';
    this.prefillStrategyJournalFromScoreItem(item);
    this.strategyJournalPrefillPending = true;

    const nextState = { ...window.history.state };
    delete nextState.strategyJournalPrefill;
    window.history.replaceState(nextState, document.title);
  }

  private isStrategySection(value: string | null): value is StrategySettingsSection {
    return ['profiles', 'formulas', 'screenRules', 'alertRules', 'checklists', 'journal', 'versions'].includes(
      value || ''
    );
  }

  private getStrategyCardKey(section: StrategySettingsSection, entity: StrategyConfigEntity): string {
    return `${section}:${this.trackByStrategyCode(0, entity as any)}`;
  }

  private serializeStrategyConfig(config: StrategyProfileConfigResponse): string {
    return JSON.stringify(config);
  }

  private navigateToStrategyHub(): void {
    this.router.navigateByUrl('/tabs/strategy-hub');
  }

  private resetStrategyJournalForm(): void {
    this.editingStrategyJournalId = null;
    this.strategyJournalSourceItem = null;
    this.strategyJournalSuggestion = null;
    this.strategyJournalForm = this.buildEmptyStrategyJournalForm();
  }

  private buildEmptyStrategyJournalForm() {
    return {
      symbol: '',
      trade_date: new Date().toISOString().slice(0, 10),
      classification: 'swing',
      trade_side: 'buy',
      entry_price: null as number | null,
      exit_price: null as number | null,
      stop_loss_price: null as number | null,
      take_profit_price: null as number | null,
      quantity: null as number | null,
      position_size: null as number | null,
      total_capital: null as number | null,
      strategy_name: '',
      psychology: '',
      notes: '',
      mistake_tags_json: [] as string[],
    };
  }

  private prefillStrategyJournalFromScoreItem(item: StrategyScoredItem): void {
    const suggestion = this.buildStrategyJournalSuggestion(item);
    this.strategyJournalSourceItem = item;
    this.strategyJournalSuggestion = suggestion;
    this.editingStrategyJournalId = null;
    this.strategyJournalForm = {
      symbol: suggestion.symbol,
      trade_date: new Date().toISOString().slice(0, 10),
      classification: suggestion.classification,
      trade_side: suggestion.tradeSide,
      entry_price: suggestion.entryPrice,
      exit_price: suggestion.exitPrice,
      stop_loss_price: suggestion.stopLossPrice,
      take_profit_price: suggestion.takeProfitPrice,
      quantity: null,
      position_size: suggestion.positionSize,
      total_capital: null,
      strategy_name: suggestion.strategyName,
      psychology: suggestion.psychology,
      notes: suggestion.notes,
      mistake_tags_json: [],
    };
  }

  private buildStrategyJournalSuggestion(item: StrategyScoredItem): StrategyJournalSuggestion {
    const currentPrice = this.preferredNumber(item.currentPrice, item.price);
    const execution = item.executionPlan;
    const volume = item.volumeIntelligence;
    const tradeSide: 'buy' | 'sell' = execution?.takeProfitSignal ? 'sell' : 'buy';
    const classification =
      execution?.addBuy70 ? 'retest' :
      execution?.probeBuy30 ? 'breakout' :
      volume?.noSupply ? 'retest' :
      item.passedAllLayers ? 'position' :
      'swing';

    const positionSize =
      execution?.standAside ? 0 :
      execution?.addBuy70 ? 70 :
      execution?.probeBuy30 ? 30 :
      50;

    const stopLossPctCandidates = [execution?.stopLossMin, execution?.stopLossMax]
      .filter((value): value is number => typeof value === 'number' && isFinite(value) && value > 0);
    const stopLossPct = stopLossPctCandidates.length
      ? stopLossPctCandidates.reduce((sum, value) => sum + value, 0) / stopLossPctCandidates.length / 100
      : 0.06;

    const stopLossPrice =
      tradeSide === 'buy' && currentPrice !== null
        ? this.roundPrice(currentPrice * (1 - stopLossPct))
        : null;
    const takeProfitBase = Math.max(stopLossPct * 2, 0.1);
    const takeProfitPrice =
      tradeSide === 'buy' && currentPrice !== null
        ? this.roundPrice(currentPrice * (1 + takeProfitBase))
        : currentPrice;
    const exitPrice = tradeSide === 'sell' ? currentPrice : null;

    const reasons = [
      `Winning Score ${item.winningScore.toFixed(2)} theo profile hien tai.`,
      volume?.smartMoneyInflow ? 'Smart Money Inflow dang bat.' : 'Smart Money Inflow chua xac nhan.',
      execution?.probeBuy30 ? 'Execution engine cho phep mua tham do 30%.' : '',
      execution?.addBuy70 ? 'Execution engine cho phep mua gia tang 70%.' : '',
      execution?.standAside ? 'Execution engine dang khuyen nghi dung ngoai.' : '',
      execution?.takeProfitSignal ? 'Execution engine dang phat hien tin hieu chot loi.' : '',
      ...(execution?.rationale || []).slice(0, 3),
    ].filter(Boolean);

    const strategyName =
      execution?.takeProfitSignal ? 'Exit by Volume Divergence' :
      execution?.addBuy70 ? 'Add 70 - Pullback Retest' :
      execution?.probeBuy30 ? 'Buy 30 - Breakout Probe' :
      volume?.noSupply ? 'No Supply Retest' :
      volume?.smartMoneyInflow ? 'Smart Money Inflow Scan' :
      `${this.strategyConfig?.profile?.name || 'Strategy'} Review`;

    const psychology =
      execution?.standAside
        ? 'Dung ngoai va quan sat them, tranh FOMO vi setup chua du xac nhan.'
        : tradeSide === 'sell'
          ? 'Chu dong khoa loi nhuan va ban theo ke hoach, khong nuoi ky vong them.'
          : execution?.addBuy70
            ? 'Co the gia tang vi the nhung van phai giu ky luat stop-loss.'
            : execution?.probeBuy30
              ? 'Chi mua tham do de kiem dinh setup, tranh vao full vi the qua som.'
              : 'Theo doi ky luat va doi them xac nhan truoc khi tang vi the.';

    return {
      symbol: item.symbol,
      classification,
      tradeSide,
      entryPrice: currentPrice,
      exitPrice,
      stopLossPrice,
      takeProfitPrice,
      positionSize,
      strategyName,
      psychology,
      notes: reasons.join('\n'),
      reasons,
    };
  }

  private buildEmptyStrategyJournalRow(): StrategyJournalRow {
    return {
      clientKey: this.nextClientRowKey('journal'),
      symbol: '',
      trade_date: new Date().toISOString().slice(0, 10),
      classification: 'swing',
      trade_side: 'buy',
      entry_price: null,
      exit_price: null,
      stop_loss_price: null,
      take_profit_price: null,
      quantity: null,
      position_size: null,
      total_capital: null,
      strategy_name: '',
      psychology: '',
      notes: '',
      mistake_tags_json: [],
      isNew: true,
      isSaving: false,
    };
  }

  private mapJournalEntryToRow(item: StrategyJournalEntry): StrategyJournalRow {
    return {
      id: item.id,
      clientKey: item.id ? `journal-${item.id}` : this.nextClientRowKey('journal'),
      profileId: item.profileId ?? null,
      symbol: item.symbol || '',
      trade_date: item.tradeDate || new Date().toISOString().slice(0, 10),
      classification: item.classification || 'swing',
      trade_side: item.tradeSide || 'buy',
      entry_price: item.entryPrice ?? null,
      exit_price: item.exitPrice ?? null,
      stop_loss_price: item.stopLossPrice ?? null,
      take_profit_price: item.takeProfitPrice ?? null,
      quantity: item.quantity ?? null,
      position_size: item.positionSize ?? null,
      total_capital: item.totalCapital ?? null,
      strategy_name: item.strategyName || '',
      psychology: item.psychology || '',
      notes: item.notes || '',
      mistake_tags_json: [...(item.mistakeTags || [])],
      createdAt: item.createdAt ?? null,
      updatedAt: item.updatedAt ?? null,
      isSaving: false,
      isNew: false,
    };
  }

  private buildStrategyJournalRowFromSuggestion(suggestion: StrategyJournalSuggestion): StrategyJournalRow {
    return {
      ...this.buildEmptyStrategyJournalRow(),
      symbol: suggestion.symbol,
      classification: suggestion.classification,
      trade_side: suggestion.tradeSide,
      entry_price: suggestion.entryPrice,
      exit_price: suggestion.exitPrice,
      stop_loss_price: suggestion.stopLossPrice,
      take_profit_price: suggestion.takeProfitPrice,
      position_size: suggestion.positionSize,
      strategy_name: suggestion.strategyName,
      psychology: suggestion.psychology,
      notes: suggestion.notes,
      mistake_tags_json: [],
      isNew: true,
    };
  }

  private buildEmptyOrderStatementRow(): StrategyOrderStatementRow {
    return {
      clientKey: this.nextClientRowKey('statement'),
      symbol: '',
      trade_date: new Date().toISOString().slice(0, 10),
      settlement_date: '',
      trade_side: 'buy',
      order_type: 'Buy',
      channel: 'N',
      quantity: null,
      price: null,
      gross_value: null,
      fee: null,
      tax: null,
      transfer_fee: null,
      net_amount: null,
      broker_reference: '',
      notes: '',
      isNew: true,
      isSaving: false,
    };
  }

  private mapOrderStatementEntryToRow(item: StrategyOrderStatementEntry): StrategyOrderStatementRow {
    return {
      id: item.id,
      clientKey: item.id ? `statement-${item.id}` : this.nextClientRowKey('statement'),
      profileId: item.profileId ?? null,
      journal_entry_id: item.journalEntryId ?? null,
      symbol: item.symbol || '',
      trade_date: item.tradeDate || new Date().toISOString().slice(0, 10),
      settlement_date: item.settlementDate || '',
      trade_side: item.tradeSide || 'buy',
      order_type: item.orderType || (item.tradeSide === 'sell' ? 'Sell' : 'Buy'),
      channel: item.channel || 'N',
      quantity: item.quantity ?? null,
      price: item.price ?? null,
      gross_value: item.grossValue ?? null,
      fee: item.fee ?? null,
      tax: item.tax ?? null,
      transfer_fee: item.transferFee ?? null,
      net_amount: item.netAmount ?? null,
      broker_reference: item.brokerReference || '',
      notes: item.notes || '',
      createdAt: item.createdAt ?? null,
      updatedAt: item.updatedAt ?? null,
      isSaving: false,
      isNew: false,
    };
  }

  private buildJournalPayload(row: StrategyJournalRow) {
    return {
      profile_id: this.activeStrategyProfileId,
      symbol: row.symbol.trim().toUpperCase(),
      trade_date: row.trade_date,
      classification: row.classification,
      trade_side: row.trade_side,
      entry_price: row.entry_price,
      exit_price: row.exit_price,
      stop_loss_price: row.stop_loss_price,
      take_profit_price: row.take_profit_price,
      quantity: row.quantity,
      position_size: row.position_size,
      total_capital: row.total_capital,
      strategy_name: row.strategy_name,
      psychology: row.psychology,
      notes: row.notes,
      mistake_tags_json: row.mistake_tags_json,
      signal_snapshot_json: this.strategyJournalSourceItem
        ? {
            volumeIntelligence: this.strategyJournalSourceItem.volumeIntelligence,
            candlestickSignals: this.strategyJournalSourceItem.candlestickSignals,
            footprintSignals: this.strategyJournalSourceItem.footprintSignals,
          }
        : undefined,
      result_snapshot_json: this.strategyJournalSourceItem
        ? {
            winningScore: this.strategyJournalSourceItem.winningScore,
            qScore: this.strategyJournalSourceItem.qScore,
            lScore: this.strategyJournalSourceItem.lScore,
            mScore: this.strategyJournalSourceItem.mScore,
            pScore: this.strategyJournalSourceItem.pScore,
            riskScore: this.strategyJournalSourceItem.riskScore,
            fairValue: this.strategyJournalSourceItem.fairValue,
            marginOfSafety: this.strategyJournalSourceItem.marginOfSafety,
            executionPlan: this.strategyJournalSourceItem.executionPlan,
          }
        : undefined,
    };
  }

  private buildOrderStatementPayload(row: StrategyOrderStatementRow) {
    return {
      profile_id: this.activeStrategyProfileId,
      journal_entry_id: row.journal_entry_id || null,
      symbol: row.symbol.trim().toUpperCase(),
      trade_date: row.trade_date || null,
      settlement_date: row.settlement_date || null,
      trade_side: row.trade_side,
        order_type: this.resolveOrderStatementOrderType(row.trade_side),
      channel: row.channel,
      quantity: row.quantity,
      price: row.price,
      gross_value: this.computeOrderStatementGrossValue(row),
      fee: row.fee,
      tax: row.tax,
      transfer_fee: row.transfer_fee,
      net_amount: this.computeOrderStatementNetAmount(row),
      broker_reference: row.broker_reference,
      notes: row.notes,
    };
  }

  private describeStrategyLedgerSaveError(
    kind: 'journal' | 'statement',
    symbol: string | null | undefined,
    error: unknown
  ): string {
    const label = kind === 'statement' ? 'Sao ke khop lenh' : 'Entries';
    const normalizedSymbol = String(symbol || '').trim().toUpperCase() || 'dong chua co ma';
    const message = error instanceof Error && error.message?.trim()
      ? error.message.trim()
      : this.t(
          kind === 'statement'
            ? 'marketSettings.messages.saveOrderStatementFailedVerbose'
            : 'marketSettings.messages.saveJournalFailedVerbose'
        );
    return `${label} (${normalizedSymbol}): ${message}`;
  }

  private extractApiErrorMessage(error: any, fallbackKey: string): string {
    const detail = error?.error?.detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail.trim();
    }
    if (detail && typeof detail === 'object') {
      const nested = detail.message || detail.error || detail.detail;
      if (typeof nested === 'string' && nested.trim()) {
        return nested.trim();
      }
    }
    return this.t(fallbackKey);
  }

  private nextClientRowKey(prefix: 'journal' | 'statement'): string {
    this.clientRowSequence += 1;
    return `${prefix}-${Date.now()}-${this.clientRowSequence}`;
  }

  private rawNumberString(value: any): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    const num = Number(value);
    return Number.isFinite(num) ? `${num}` : '';
  }

  private parseLooseNumber(rawValue: string): number | null {
    const sanitized = String(rawValue || '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/[^\d,.-]/g, '');
    if (!sanitized || sanitized === '-' || sanitized === ',' || sanitized === '.') {
      return null;
    }
    const lastComma = sanitized.lastIndexOf(',');
    const lastDot = sanitized.lastIndexOf('.');
    const decimalIndex = Math.max(lastComma, lastDot);
    let normalized = sanitized;
    if (decimalIndex >= 0) {
      const sign = normalized.startsWith('-') ? '-' : '';
      const withoutSign = sign ? normalized.slice(1) : normalized;
      const adjustedIndex = sign ? decimalIndex - 1 : decimalIndex;
      const intPart = withoutSign.slice(0, adjustedIndex).replace(/[.,]/g, '');
      const fracPart = withoutSign.slice(adjustedIndex + 1).replace(/[^\d]/g, '');
      normalized = `${sign}${intPart}${fracPart ? `.${fracPart}` : ''}`;
    } else {
      normalized = normalized.replace(/[.,]/g, '');
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private getNumericDraft(row: object, field: string): string | undefined {
    return this.numericEditDrafts.get(row)?.[field];
  }

  private setNumericDraft(row: object, field: string, value: string): void {
    const current = this.numericEditDrafts.get(row) || {};
    current[field] = value;
    this.numericEditDrafts.set(row, current);
  }

  private getNumericEditingSet(row: object, create = false): Set<string> | undefined {
    const existing = this.numericEditingFields.get(row);
    if (existing || !create) {
      return existing;
    }
    const created = new Set<string>();
    this.numericEditingFields.set(row, created);
    return created;
  }

  private isNumericFieldEditing(row: object, field: string): boolean {
    return this.numericEditingFields.get(row)?.has(field) || false;
  }

  private addDaysToIsoDate(value: string, days: number): string {
    const dt = new Date(value || new Date().toISOString().slice(0, 10));
    dt.setDate(dt.getDate() + days);
    return dt.toISOString().slice(0, 10);
  }

  private preferredNumber(...values: Array<number | null | undefined>): number | null {
    for (const value of values) {
      if (typeof value === 'number' && isFinite(value)) {
        return value;
      }
    }
    return null;
  }

  private roundPrice(value: number | null): number | null {
    if (value === null || !isFinite(value)) {
      return null;
    }
    return Math.round(value * 100) / 100;
  }

  private buildEmptySettings(): MarketSettingsData {
    return {
      language: 'vi',
      defaultExchange: 'HSX',
      defaultLandingPage: 'dashboard-v2',
      defaultTimeRange: '1d',
      startupPage: 'dashboard-v2',
      theme: 'light',
      compactTable: true,
      showSparkline: true,
      flashPriceChange: true,
      stickyHeader: true,
      fontScale: '100',
      pushAlerts: true,
      emailAlerts: false,
      soundAlerts: true,
      alertStrength: 'normal',
      volumeSpikeThreshold: '50',
      priceMoveThreshold: '3',
      autoRefreshSeconds: '15',
      preloadCharts: true,
      cacheDays: '30',
      syncMarketData: true,
      syncNewsData: true,
      collectorQuotePollSeconds: '60',
      collectorIntradayPollSeconds: '180',
      collectorIndexDailyPollSeconds: '300',
      collectorFinancialPollSeconds: '1800',
      collectorNewsPollSeconds: '300',
      collectorQuoteRequestsPerRun: '4',
      collectorIntradayRequestsPerRun: '6',
      collectorIntradayMaxConcurrency: '2',
      collectorFinancialSymbolsPerRun: '20',
      collectorIntradayBackfillIntervalSeconds: '300',
      collectorIntradayBackfillRequestsPerRun: '12',
      collectorFinancialBackfillIntervalSeconds: '600',
      collectorFinancialBackfillSymbolsPerRun: '300',
      collectorCashFlowBackfillIntervalSeconds: '900',
      collectorCashFlowBackfillSymbolsPerRun: '60',
      collectorQuoteSource: 'VCI',
      collectorIntradaySource: 'VCI',
      collectorIndexSource: 'VCI',
      collectorFinancialSource: 'CAFEF',
      collectorSymbolMasterSource: 'VCI',
      syncCloud: true,
      downloadOnWifiOnly: true,
      aiEnabled: true,
      aiModel: 'gemini-2.5-flash',
      aiSummaryAuto: true,
      aiWatchlistMonitor: true,
      aiExplainMove: true,
      aiNewsDigest: true,
      aiTaskSchedule: '08:30, 11:30, 14:45',
      aiTone: 'ngan gon',
      aiLocalAutoAnalysis: false,
      aiLocalFinancialAnalysis: false,
      aiLocalModel: 'qwen3:8b',
      workflowAutoEnabled: false,
      workflowAutoExchangeScope: 'ALL',
      workflowAutoTakeProfit: true,
      workflowAutoCutLoss: true,
      workflowAutoRebalance: true,
      workflowAutoReviewPortfolio: false,
      workflowAutoProbeBuy: false,
      workflowAutoAddPosition: false,
      safeMode: true,
      biometricLogin: false,
      sessionTimeout: '30',
      deviceBinding: true,
    };
  }

  private normalizeSettings(raw: MarketSettingsData | null | undefined): MarketSettingsData {
    const defaults = this.buildEmptySettings();
    const next = {
      ...defaults,
      ...(raw || {}),
    } as MarketSettingsData;

    next.collectorQuoteSource = this.normalizeSourceValue(next.collectorQuoteSource, defaults.collectorQuoteSource, ['VCI', 'KBS']);
    next.collectorIntradaySource = this.normalizeSourceValue(next.collectorIntradaySource, defaults.collectorIntradaySource, ['VCI', 'KBS']);
    next.collectorIndexSource = this.normalizeSourceValue(next.collectorIndexSource, defaults.collectorIndexSource, ['VCI', 'KBS']);
    next.collectorFinancialSource = this.normalizeSourceValue(next.collectorFinancialSource, defaults.collectorFinancialSource, ['CAFEF', 'VCI', 'KBS']);
    next.collectorSymbolMasterSource = this.normalizeSourceValue(next.collectorSymbolMasterSource, defaults.collectorSymbolMasterSource, ['VCI', 'KBS']);

    return next;
  }

  private normalizeSourceValue(value: string | null | undefined, fallback: string, allowed: readonly string[]): string {
    const normalized = String(value || '').trim().toUpperCase();
    return allowed.includes(normalized) ? normalized : fallback;
  }

  private buildEmptySyncStatus(): MarketSyncStatusData {
    const emptyJob = (): MarketSyncJobStatus => ({
      status: 'idle',
      jobName: null,
      health: 'idle',
      startedAt: null,
      finishedAt: null,
      message: null,
      batchIndex: null,
      totalBatches: null,
      remainingBatches: null,
      itemsInBatch: null,
      itemsResolved: null,
      source: null,
      coverageMode: null,
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: null,
      recoveredAt: null,
      consecutiveFailures: 0,
      ageSeconds: null,
    });

    return {
      quotes: emptyJob(),
      intraday: emptyJob(),
      intradayBackfill: emptyJob(),
      indexDaily: emptyJob(),
      financial: emptyJob(),
      financialBackfill: emptyJob(),
      cashFlowBackfill: emptyJob(),
      seedSymbols: emptyJob(),
      foundationCandles: emptyJob(),
      foundationDataQuality: emptyJob(),
      foundationAlerts: emptyJob(),
      workflowAutomation: emptyJob(),
      news: emptyJob(),
      coverage: {
        latestIntradayDate: null,
        all: {
          exchange: 'ALL',
          totalSymbols: 0,
          intradaySymbols: 0,
          intradayPct: 0,
          financialSymbols: 0,
          financialPct: 0,
          cashFlowSymbols: 0,
          cashFlowPct: 0,
        },
        byExchange: {},
      },
      checkedAt: null,
    };
  }
}
