import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, Subscription, forkJoin } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { AppI18nService } from 'src/app/core/i18n/app-i18n.service';
import { BackgroundRefreshService } from 'src/app/core/services/background-refresh.service';
import { PageLoadStateService } from 'src/app/core/services/page-load-state.service';

import {
  StrategyAlertRule,
  StrategyChecklistItem,
  StrategyFormula,
  StrategyJournalEntry,
  StrategyOverviewResponse,
  StrategyPagedResponse,
  StrategyParameter,
  StrategyProfile,
  StrategyProfileConfigResponse,
  StrategyRuleResult,
  StrategyRiskOverviewResponse,
  StrategyScreenRule,
  StrategyScoredItem,
  StrategySignalItem,
  MarketDataQualityIssue,
  MarketApiService,
} from 'src/app/core/services/market-api.service';

type StrategyTab = 'overview' | 'screener' | 'scoring' | 'risk' | 'settings';
type StrategyLoadSection = 'profiles' | 'config' | 'scoring' | 'screener' | 'risk' | 'journal' | 'dataQuality';
type StrategyConfigEntity = StrategyFormula | StrategyScreenRule | StrategyAlertRule | StrategyChecklistItem;
type StrategySettingsSection = 'profiles' | 'formulas' | 'screenRules' | 'alertRules' | 'checklists' | 'versions';
type StrategyRuleModalMode = 'passFail' | 'triggerOk' | 'mixed';

interface StrategyVariableHint {
  key: string;
  label: string;
  description: string;
  kind: 'metric' | 'parameter' | 'formula';
}

interface StrategyDecisionNarrative {
  label: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
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

type StrategyExecutionBadgeState = 'ready' | 'wait' | 'standAside';

const VARIABLE_HINTS: Record<string, StrategyVariableHint> = {
  Q: { key: 'Q', label: 'Q Score', description: 'Điểm chất lượng doanh nghiệp và độ khỏe của mã.', kind: 'formula' },
  L: { key: 'L', label: 'L Score', description: 'Điểm leadership và mức độ đi cùng xu hướng thị trường.', kind: 'formula' },
  M: { key: 'M', label: 'M Score', description: 'Điểm động lực và xác nhận breakout.', kind: 'formula' },
  P: { key: 'P', label: 'P Score', description: 'Hệ số giá và rủi ro dùng làm mẫu số để giảm bớt hưng phấn mua đuổi.', kind: 'formula' },
  liquidity_score: { key: 'liquidity_score', label: 'Điểm thanh khoản', description: 'Mức dễ vào và ra lệnh dựa trên giá trị giao dịch.', kind: 'metric' },
  stability_score: { key: 'stability_score', label: 'Điểm ổn định giá', description: 'Giá biến động càng ổn định thì điểm càng cao.', kind: 'metric' },
  news_score: { key: 'news_score', label: 'Điểm tin tức', description: 'Mức độ được nhắc tới trong luồng tin hiện tại.', kind: 'metric' },
  watchlist_bonus: { key: 'watchlist_bonus', label: 'Điểm ưu tiên watchlist', description: 'Thưởng điểm nếu mã nằm trong danh sách theo dõi.', kind: 'metric' },
  leadership_score: { key: 'leadership_score', label: 'Điểm dẫn dắt', description: 'Khả năng dẫn dòng tiền và nổi bật trong sàn.', kind: 'metric' },
  market_trend_score: { key: 'market_trend_score', label: 'Điểm xu hướng sàn', description: 'Sức khỏe của sàn giao dịch mà mã đang thuộc về.', kind: 'metric' },
  volume_score: { key: 'volume_score', label: 'Điểm volume', description: 'Mức thanh khoản tương đối so với universe.', kind: 'metric' },
  momentum_score: { key: 'momentum_score', label: 'Điểm động lượng giá', description: 'Độ mạnh của phần trăm tăng hoặc giảm hiện tại.', kind: 'metric' },
  volume_confirmation_score: { key: 'volume_confirmation_score', label: 'Điểm xác nhận volume', description: 'Volume có đang ủng hộ xu hướng giá hay không.', kind: 'metric' },
  price_risk_score: { key: 'price_risk_score', label: 'Điểm rủi ro giá', description: 'Giá càng nóng thì rủi ro càng cao.', kind: 'metric' },
  hotness_score: { key: 'hotness_score', label: 'Điểm quá nóng', description: 'Dùng để phát hiện mã bị kéo quá nhanh.', kind: 'metric' },
  volatility_score: { key: 'volatility_score', label: 'Điểm biến động', description: 'Biến động càng mạnh thì điểm rủi ro càng cao.', kind: 'metric' },
  current_price: { key: 'current_price', label: 'Giá hiện tại', description: 'Giá đang dùng làm đầu vào cho score.', kind: 'metric' },
  price: { key: 'price', label: 'Giá hiện tại', description: 'Giá đang dùng làm đầu vào cho score.', kind: 'metric' },
  change_percent: { key: 'change_percent', label: '% thay đổi', description: 'Biến động giá phần trăm của mã.', kind: 'metric' },
  trading_value: { key: 'trading_value', label: 'Giá trị giao dịch', description: 'Giá trị giao dịch tích lũy của mã.', kind: 'metric' },
  volume: { key: 'volume', label: 'Khối lượng', description: 'Khối lượng giao dịch tích lũy của mã.', kind: 'metric' },
  price_vs_open_ratio: { key: 'price_vs_open_ratio', label: 'Tỷ lệ giá / giá mở nhịp', description: 'Dùng để xem mã có giữ được nhịp tăng hay không.', kind: 'metric' },
  margin_of_safety: { key: 'margin_of_safety', label: 'Biên an toàn', description: 'Khoảng cách giữa fair value và giá hiện tại.', kind: 'metric' },
  winning_score: { key: 'winning_score', label: 'Winning Score', description: 'Điểm tổng hợp cuối cùng để xếp hạng mã.', kind: 'formula' },
  journal_entries_today: { key: 'journal_entries_today', label: 'Số entry journal hôm nay', description: 'Dùng cho checklist kỷ luật cuối ngày.', kind: 'metric' },
};

const EXTENDED_VARIABLE_HINTS: Record<string, StrategyVariableHint> = {
  pe_current: { key: 'pe_current', label: 'P/E', description: 'Hệ số P/E hiện tại của mã.', kind: 'metric' },
  pb_current: { key: 'pb_current', label: 'P/B', description: 'Hệ số P/B hiện tại của mã.', kind: 'metric' },
  bv_current: { key: 'bv_current', label: 'Book value', description: 'Giá trị sổ sách trên mỗi cổ phần.', kind: 'metric' },
  eps_current: { key: 'eps_current', label: 'EPS', description: 'EPS hiện tại dùng để lọc tăng trưởng.', kind: 'metric' },
  eps_growth_year: { key: 'eps_growth_year', label: 'EPS growth năm', description: 'Tăng trưởng EPS năm gần nhất so với năm trước.', kind: 'metric' },
  eps_growth_quarter: { key: 'eps_growth_quarter', label: 'EPS growth quý', description: 'Tăng trưởng EPS quý gần nhất so với cùng kỳ.', kind: 'metric' },
  roe_current: { key: 'roe_current', label: 'ROE', description: 'ROE hiện tại của doanh nghiệp.', kind: 'metric' },
  dar_current: { key: 'dar_current', label: 'DAR', description: 'Tỷ lệ nợ trên tài sản hiện tại.', kind: 'metric' },
  gross_margin_current: { key: 'gross_margin_current', label: 'Biên gộp', description: 'Biên lợi nhuận gộp gần nhất.', kind: 'metric' },
  gross_margin_change: { key: 'gross_margin_change', label: 'Biến động biên gộp', description: 'Mức cải thiện hoặc suy giảm biên gộp.', kind: 'metric' },
  quality_flag_count: { key: 'quality_flag_count', label: 'Số cờ chất lượng', description: 'Số tiêu chí chất lượng hiện đang đạt.', kind: 'metric' },
  industry_pe_average: { key: 'industry_pe_average', label: 'P/E peer average', description: 'P/E trung bình nhóm so sánh hiện tại.', kind: 'metric' },
  pe_gap_to_peer: { key: 'pe_gap_to_peer', label: 'P/E gap to peer', description: 'Khoảng cách P/E so với trung bình nhóm.', kind: 'metric' },
  industry_pb_average: { key: 'industry_pb_average', label: 'P/B peer average', description: 'P/B trung bình nhóm so sánh hiện tại.', kind: 'metric' },
  pb_gap_to_peer: { key: 'pb_gap_to_peer', label: 'P/B gap to peer', description: 'Khoảng cách P/B so với trung bình nhóm.', kind: 'metric' },
  ma10_volume: { key: 'ma10_volume', label: 'MA10 volume', description: 'Khối lượng trung bình 10 phiên.', kind: 'metric' },
  ma20_volume: { key: 'ma20_volume', label: 'MA20 volume', description: 'Khối lượng trung bình 20 phiên.', kind: 'metric' },
  volume_spike_ratio: { key: 'volume_spike_ratio', label: 'Volume spike ratio', description: 'Tỷ lệ volume hiện tại so với MA10 hoặc MA20.', kind: 'metric' },
  ema10: { key: 'ema10', label: 'EMA10', description: 'Đường EMA10 của giá đóng cửa.', kind: 'metric' },
  ema20: { key: 'ema20', label: 'EMA20', description: 'Đường EMA20 của giá đóng cửa.', kind: 'metric' },
  ema_gap_pct: { key: 'ema_gap_pct', label: 'EMA gap %', description: 'Khoảng cách giá hiện tại với EMA10 hoặc EMA20.', kind: 'metric' },
  close_above_ema10: { key: 'close_above_ema10', label: 'Đóng trên EMA10', description: 'Cờ xác nhận giá đóng cửa đang nằm trên EMA10.', kind: 'metric' },
  close_above_ema20: { key: 'close_above_ema20', label: 'Đóng trên EMA20', description: 'Cờ xác nhận giá đóng cửa đang nằm trên EMA20.', kind: 'metric' },
  smart_money_inflow: { key: 'smart_money_inflow', label: 'Smart money inflow', description: 'Dòng tiền lớn vào với volume xác nhận và giá vượt vùng.', kind: 'metric' },
  surge_trap: { key: 'surge_trap', label: 'Surge trap', description: 'Volume bùng nổ nhưng nến cho tín hiệu xả hoặc trap.', kind: 'metric' },
  no_supply: { key: 'no_supply', label: 'No supply', description: 'Nhịp kéo về với volume cạn ở hỗ trợ.', kind: 'metric' },
  volume_divergence: { key: 'volume_divergence', label: 'Volume divergence', description: 'Giá tăng nhưng volume suy yếu dần.', kind: 'metric' },
  breakout_confirmation: { key: 'breakout_confirmation', label: 'Breakout confirmation', description: 'Mã đang xác nhận breakout với giá và volume.', kind: 'metric' },
  spring_shakeout: { key: 'spring_shakeout', label: 'Spring / Shakeout', description: 'Rút chân mạnh sau khi thủng hỗ trợ.', kind: 'metric' },
  absorption: { key: 'absorption', label: 'Absorption', description: 'Chuỗi nến hấp thụ nguồn cung với volume tăng dần.', kind: 'metric' },
  pullback_retest: { key: 'pullback_retest', label: 'Pullback retest', description: 'Nhịp test lại breakout hoặc EMA thành công.', kind: 'metric' },
  bullish_pattern_score: { key: 'bullish_pattern_score', label: 'Bullish pattern score', description: 'Điểm tổng hợp của các mẫu nến tăng giá.', kind: 'metric' },
  bearish_pattern_score: { key: 'bearish_pattern_score', label: 'Bearish pattern score', description: 'Điểm tổng hợp của các mẫu nến giảm giá.', kind: 'metric' },
  stop_loss_pct: { key: 'stop_loss_pct', label: 'Stop-loss %', description: 'Tỷ lệ stop-loss gợi ý theo execution engine.', kind: 'metric' },
  obv_value: { key: 'obv_value', label: 'OBV value', description: 'Giá trị OBV hiện tại của mã.', kind: 'metric' },
  obv_ma10: { key: 'obv_ma10', label: 'OBV MA10', description: 'Đường trung bình 10 phiên của OBV.', kind: 'metric' },
  obv_slope_pct: { key: 'obv_slope_pct', label: 'OBV slope %', description: 'Độ dốc gần đây của OBV.', kind: 'metric' },
  obv_trend_score: { key: 'obv_trend_score', label: 'OBV trend score', description: 'Điểm xu hướng dòng tiền theo OBV.', kind: 'metric' },
  obv_above_ma: { key: 'obv_above_ma', label: 'OBV trên MA', description: 'OBV đang nằm trên đường trung bình tham chiếu.', kind: 'metric' },
  price_context_score: { key: 'price_context_score', label: 'Price context score', description: 'Điểm bối cảnh giá: EMA, nền chặt và vùng gần breakout.', kind: 'metric' },
  near_breakout_zone: { key: 'near_breakout_zone', label: 'Near breakout zone', description: 'Giá đang nằm sát vùng breakout.', kind: 'metric' },
  base_tightness_pct: { key: 'base_tightness_pct', label: 'Base tightness %', description: 'Độ chặt của nền giá gần đây.', kind: 'metric' },
  base_is_tight: { key: 'base_is_tight', label: 'Nền giá chặt', description: 'Cờ xác nhận nền giá đang chặt.', kind: 'metric' },
  news_pressure_score: { key: 'news_pressure_score', label: 'News pressure score', description: 'Mức độ tin tức đang gây áp lực hoặc hưng phấn lên mã.', kind: 'metric' },
  pre_news_accumulation: { key: 'pre_news_accumulation', label: 'Pre-news accumulation', description: 'Dòng tiền tích lũy trước khi tin bùng nổ.', kind: 'metric' },
  obv_breakout_confirmation: { key: 'obv_breakout_confirmation', label: 'OBV breakout confirmation', description: 'OBV xác nhận cho breakout.', kind: 'metric' },
  smart_money_before_news: { key: 'smart_money_before_news', label: 'Smart money before news', description: 'Dòng tiền lớn vào trước khi news pressure tăng.', kind: 'metric' },
  obv_distribution: { key: 'obv_distribution', label: 'OBV distribution', description: 'Cảnh báo phân phối sớm theo OBV.', kind: 'metric' },
  weak_news_chase: { key: 'weak_news_chase', label: 'Weak news chase', description: 'Tin nhiều nhưng dòng tiền không đồng thuận.', kind: 'metric' },
  money_flow_score: { key: 'money_flow_score', label: 'Money flow score', description: 'Điểm tổng hợp của engine dòng tiền trước tin.', kind: 'metric' },
};

Object.assign(VARIABLE_HINTS, EXTENDED_VARIABLE_HINTS);

const STRATEGY_SCORING_FORMULA_STORAGE_KEY = 'ssg2026:strategy-scoring-formulas';

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
  selector: 'app-strategy-hub',
  templateUrl: './strategy-hub.page.html',
  styleUrls: ['./strategy-hub.page.scss'],
  standalone: false,
})
export class StrategyHubPage implements OnInit, OnDestroy {
  private readonly pageLoadKey = 'strategy-hub';
  private readonly sectionLoadedAt: Partial<Record<StrategyLoadSection, number>> = {};
  private readonly sectionMaxAgeMs: Record<StrategyLoadSection, number> = {
    profiles: 300000,
    config: 300000,
    scoring: 20000,
    screener: 20000,
    risk: 20000,
    journal: 30000,
    dataQuality: 45000,
  };
  readonly expressionOperatorGroups = EXPRESSION_OPERATOR_GROUPS;
  selectedTab: StrategyTab = 'scoring';
  selectedSettingsSection: StrategySettingsSection = 'formulas';
  expandedSettingsCardKey = '';
  loading = false;
  saving = false;
  publishing = false;
  detailLoading = false;
  detailLoadingSymbol: string | null = null;
  error = '';
  message = '';
  isMobileViewport = false;

  overview: StrategyOverviewResponse | null = null;
  profiles: StrategyProfile[] = [];
  activeProfileId: number | null = null;
  config: StrategyProfileConfigResponse | null = null;
  rankings: StrategyPagedResponse | null = null;
  dataQualityIssues: MarketDataQualityIssue[] = [];
  screener: StrategyPagedResponse | null = null;
  risk: StrategyRiskOverviewResponse | null = null;
  journal: StrategyJournalEntry[] = [];
  selectedScoreItem: StrategyScoredItem | null = null;
  symbolDetailOpen = false;
  symbolDetailSymbol = '';
  journalSuggestion: StrategyJournalSuggestion | null = null;

  scoringExchange = 'ALL';
  scoringKeyword = '';
  scoringWatchlistOnly = false;
  scoringPage = 1;
  readonly scoringPageSize = 12;
  selectedScoringFormulaCodes: string[] = [];
  ruleModalOpen = false;
  ruleModalTitle = '';
  ruleModalMode: StrategyRuleModalMode = 'passFail';
  ruleModalItems: StrategyRuleResult[] = [];
  screenerExchange = 'ALL';
  screenerKeyword = '';
  screenerWatchlistOnly = false;

  newProfile = {
    code: '',
    name: '',
    description: '',
  };
  journalForm = {
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
  editingJournalId: number | null = null;

  private backgroundSub?: Subscription;
  private scoringSub?: Subscription;
  private scoringKeywordSub?: Subscription;
  private readonly scoringKeywordChanges = new Subject<string>();
  private readonly decimal = new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
  private cachedAllScoringFirstPage: StrategyPagedResponse | null = null;
  private activeView = false;
  private loadedConfigProfileId: number | null = null;
  private loadingConfigProfileId: number | null = null;

  constructor(
    private api: MarketApiService,
    private router: Router,
    private i18n: AppI18nService,
    private backgroundRefresh: BackgroundRefreshService,
    private pageLoadState: PageLoadStateService
  ) {}

  ngOnInit(): void {
    this.updateViewportState();
    this.selectedScoringFormulaCodes = this.readStoredScoringFormulaCodes();
    this.pageLoadState.registerPage(this.pageLoadKey, 'tabs.strategy');
    this.scoringKeywordSub = this.scoringKeywordChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((keyword) => this.applyScoringKeyword(keyword));
    this.backgroundSub = this.backgroundRefresh.changes$.subscribe((domains) => {
      if (!this.activeView || !this.activeProfileId) return;
      if (domains.some((item) => ['quotes', 'intraday', 'news', 'financial', 'seedSymbols'].includes(item))) {
        this.loadDataQualityIssues(true);
        this.refreshActiveTabData(true, true);
      }
    });
    this.loadOverview();
    this.loadDataQualityIssues();
  }

  ionViewDidEnter(): void {
    this.activeView = true;
    this.pageLoadState.setActivePage(this.pageLoadKey);
    this.loadDataQualityIssues();
    if (this.activeProfileId && !this.pageLoadState.isLoading(this.pageLoadKey) && !this.pageLoadState.isFresh(this.pageLoadKey, 15000)) {
      this.refreshActiveTabData(true);
    }
  }

  ionViewDidLeave(): void {
    this.activeView = false;
  }

  ngOnDestroy(): void {
    this.backgroundSub?.unsubscribe();
    this.scoringSub?.unsubscribe();
    this.scoringKeywordSub?.unsubscribe();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateViewportState();
  }

  private t(key: string): string {
    return this.i18n.translate(key);
  }

  private updateViewportState(): void {
    this.isMobileViewport = typeof window !== 'undefined' && window.innerWidth <= 768;
  }

  private hasDetailedScoreItem(item: StrategyScoredItem | null | undefined): boolean {
    return !!item?.explanation?.topDrivers?.length;
  }

  private hasDetailedRankings(response: StrategyPagedResponse | null | undefined): boolean {
    return !!response?.items?.some((item) => this.hasDetailedScoreItem(item));
  }

  get enabledFormulas(): StrategyFormula[] {
    return [...(this.config?.formulas || [])]
      .filter((item) => item.isEnabled)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  get enabledFormulaLabels(): string[] {
    return this.enabledFormulas.map((item) => item.label);
  }

  loadDataQualityIssues(force = false): void {
    if (!force && this.dataQualityIssues.length && this.isSectionFresh('dataQuality')) {
      return;
    }
    this.api.getDataQualityIssues(120).subscribe({
      next: (response) => {
        this.dataQualityIssues = response.data || [];
        this.markSectionLoaded('dataQuality');
      },
      error: () => {
        this.dataQualityIssues = [];
      },
    });
  }

  getSymbolDataQualityIssues(symbol: string): MarketDataQualityIssue[] {
    const normalized = (symbol || '').toUpperCase();
    return this.dataQualityIssues.filter((issue) => (issue.symbol || '').toUpperCase() === normalized);
  }

  getSymbolDataQualityLabel(symbol: string): string {
    const issues = this.getSymbolDataQualityIssues(symbol);
    if (!issues.length) {
      return '';
    }
    const criticalCount = issues.filter((issue) => issue.severity === 'critical').length;
    return criticalCount ? `${criticalCount} lỗi critical` : `${issues.length} cảnh báo dữ liệu`;
  }

  get scoringTotalPages(): number {
    return Math.max(1, Math.ceil((this.rankings?.total || 0) / this.scoringPageSize));
  }

  get scoringStartIndex(): number {
    if (!this.rankings?.total) {
      return 0;
    }
    return ((this.rankings.page || this.scoringPage) - 1) * this.scoringPageSize + 1;
  }

  get scoringEndIndex(): number {
    if (!this.rankings?.total) {
      return 0;
    }
    return Math.min((this.rankings.page || this.scoringPage) * this.scoringPageSize, this.rankings.total);
  }

  getScreenerSummaryLabel(): string {
    if (!this.screener?.summary) {
      return '';
    }
    return `${this.t('strategyHub.screener.passed')} ${this.screener.summary.passed}/${this.screener.summary.total} ${this.t('strategyHub.screener.symbolUnit')} · ${this.decimal.format(this.screener.summary.passRate)}%`;
  }

  getScoringPaginationSummary(): string {
    return `${this.t('strategyHub.scoring.showing')} ${this.scoringStartIndex}-${this.scoringEndIndex} / ${this.rankings?.total || 0} ${this.t('strategyHub.scoring.symbolUnit')}`;
  }

  getScoringPageLabel(): string {
    return `${this.t('strategyHub.scoring.page')} ${this.scoringPage} / ${this.scoringTotalPages}`;
  }

  get selectableScoringFormulas(): StrategyFormula[] {
    return this.enabledFormulas.filter((item) => item.formulaCode !== 'winning_score');
  }

  isScoringFormulaSelected(formulaCode: string): boolean {
    return this.selectedScoringFormulaCodes.includes(formulaCode);
  }

  toggleScoringFormula(formulaCode: string): void {
    if (this.isScoringFormulaSelected(formulaCode)) {
      this.selectedScoringFormulaCodes = this.selectedScoringFormulaCodes.filter((item) => item !== formulaCode);
    } else {
      this.selectedScoringFormulaCodes = [...this.selectedScoringFormulaCodes, formulaCode];
    }
    this.persistScoringFormulaCodes();
  }

  getScoringFormulaValue(item: StrategyScoredItem, formulaCode: string): number | null {
    switch (formulaCode) {
      case 'q_score':
        return item.qScore;
      case 'l_score':
        return item.lScore;
      case 'm_score':
        return item.mScore;
      case 'p_score':
        return item.pScore;
      case 'winning_score':
        return item.winningScore;
      default:
        return null;
    }
  }

  getScoreRowToneClass(item: StrategyScoredItem): string {
    if (item.riskScore >= 70 || (!item.passedAllLayers && item.winningScore < 50)) {
      return 'score-row-bad';
    }
    if (item.passedAllLayers || item.winningScore >= 70 || item.isWatchlist) {
      return 'score-row-good';
    }
    return 'score-row-watch';
  }

  getSymbolToneClass(item: StrategyScoredItem): string {
    if (item.riskScore >= 70 || !item.passedLayer1) {
      return 'symbol-bad';
    }
    if (item.passedAllLayers || item.isWatchlist) {
      return 'symbol-good';
    }
    return 'symbol-watch';
  }

  getWinningToneClass(item: StrategyScoredItem): string {
    if (item.passedAllLayers || item.winningScore >= 70) {
      return 'metric-good';
    }
    if (item.winningScore < 50 || item.riskScore >= 70) {
      return 'metric-bad';
    }
    return 'metric-watch';
  }

  getFormulaToneClass(item: StrategyScoredItem, formulaCode: string): string {
    const value = this.getScoringFormulaValue(item, formulaCode);
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      return 'metric-muted';
    }
    const numericValue = Number(value);
    if (formulaCode === 'p_score') {
      if (numericValue <= 35) {
        return 'metric-good';
      }
      if (numericValue >= 65) {
        return 'metric-bad';
      }
      return 'metric-watch';
    }
    if (numericValue >= 65) {
      return 'metric-good';
    }
    if (numericValue < 45) {
      return 'metric-bad';
    }
    return 'metric-watch';
  }

  getRiskToneClass(value: number | null | undefined): string {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 'metric-muted';
    }
    if (numericValue >= 65) {
      return 'metric-bad';
    }
    if (numericValue <= 35) {
      return 'metric-good';
    }
    return 'metric-watch';
  }

  getChangeToneClass(value: number | null | undefined): string {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 'metric-muted';
    }
    if (numericValue > 0) {
      return 'metric-good';
    }
    if (numericValue < 0) {
      return 'metric-bad';
    }
    return 'metric-muted';
  }

  getNewsToneClass(value: number | null | undefined): string {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return 'metric-muted';
    }
    if (numericValue >= 3) {
      return 'metric-watch';
    }
    return 'metric-info';
  }

  getScoringFormulaChipLabel(formulaCode: string, fallbackLabel: string): string {
    switch (formulaCode) {
      case 'q_score':
        return 'Q';
      case 'l_score':
        return 'L';
      case 'm_score':
        return 'M';
      case 'p_score':
        return 'P';
      default:
        return fallbackLabel;
    }
  }

  selectTab(tab: StrategyTab): void {
    this.selectedTab = tab;
    if (!this.activeProfileId) {
      return;
    }
    if (tab === 'scoring' && (!this.rankings || !this.hasDetailedRankings(this.rankings))) {
      this.reloadScoring();
      return;
    }
    if (tab === 'scoring' && this.selectedScoreItem) {
      this.ensureDetailedScoreItem(this.selectedScoreItem);
    }
    if (tab === 'screener' && !this.screener) {
      this.reloadScreener();
      return;
    }
    if (tab === 'risk' && (!this.risk || !(this.risk.highRiskItems?.length))) {
      this.reloadRisk();
      return;
    }
  }

  loadOverview(force = false): void {
    if (!force && this.profiles.length && this.activeProfileId && this.isSectionFresh('profiles')) {
      this.ensureProfileConfigLoaded(this.activeProfileId);
      if (!this.rankings) {
        this.reloadScoring(1, true, true);
      }
      return;
    }
    this.loading = true;
    this.pageLoadState.start(this.pageLoadKey);
    this.error = '';
    this.message = '';

    this.api.listStrategyProfiles().subscribe({
      next: (response) => {
        const profiles = response.data || [];
        if (!profiles.length) {
          this.loading = false;
          this.error = 'Backend strategy chưa trả dữ liệu.';
          return;
        }

        this.profiles = profiles;
        this.activeProfileId =
          profiles.find((item) => item.id === this.activeProfileId)?.id ||
          profiles.find((item) => item.isDefault)?.id ||
          profiles.find((item) => item.isActive)?.id ||
          profiles[0].id;
        this.markSectionLoaded('profiles');
        this.pageLoadState.setProgress(this.pageLoadKey, 45);
        this.screener = null;
        this.risk = null;
        this.journal = [];
        this.overview = this.buildLightOverview(this.profiles, this.config, this.rankings);
        this.loading = false;
        this.loadConfig(this.activeProfileId!, true);
        this.reloadScoring(1, false, true);
        return;

        forkJoin({
          config: this.api.getStrategyProfileConfig(this.activeProfileId!),
          rankings: this.api.getStrategyRankings({
            profileId: this.activeProfileId!,
            exchange: this.scoringExchange !== 'ALL' ? this.scoringExchange : undefined,
            keyword: this.normalizedScoringKeyword || undefined,
            watchlistOnly: this.scoringWatchlistOnly,
            page: 1,
            pageSize: this.scoringPageSize,
          }),
        }).subscribe({
          next: ({ config, rankings }) => {
            this.loading = false;
            this.config = config.data || null;
            this.rankings = rankings.data || null;
            this.screener = null;
            this.risk = null;
            this.journal = [];
            this.ensureScoringFormulaSelection();
            this.ensureSettingsExpansion();
            this.overview = this.buildLightOverview(this.profiles, this.config, this.rankings);
            this.syncSelectedScoreItem(this.rankings, this.selectedScoreItem?.symbol, true);
            this.pageLoadState.finish(this.pageLoadKey);
          },
          error: () => {
            this.error = 'KhĂ´ng táº£i Ä‘Æ°á»£c Strategy Hub.';
            this.pageLoadState.fail(this.pageLoadKey, this.error);
          },
        });
      },
      error: () => {
        this.loading = false;
        this.error = 'Không tải được Strategy Hub.';
        this.pageLoadState.fail(this.pageLoadKey, this.error);
      },
    });
  }

  onProfileChange(): void {
    if (!this.activeProfileId) return;
    this.config = null;
    this.loadedConfigProfileId = null;
    this.selectedScoreItem = null;
    this.cachedAllScoringFirstPage = null;
    this.loadOverview(true);
  }

  loadConfig(profileId: number, force = false): void {
    if (!force && this.loadedConfigProfileId === profileId && this.config && this.isSectionFresh('config')) {
      return;
    }
    if (this.loadingConfigProfileId === profileId) {
      return;
    }
    this.loadingConfigProfileId = profileId;
    this.pageLoadState.startBackground(this.pageLoadKey);
    this.api.getStrategyProfileConfig(profileId).subscribe({
      next: (response) => {
        this.config = response.data || null;
        this.loadedConfigProfileId = response.data ? profileId : null;
        this.loadingConfigProfileId = null;
        this.ensureScoringFormulaSelection();
        this.ensureSettingsExpansion();
        this.markSectionLoaded('config');
        this.pageLoadState.finish(this.pageLoadKey);
      },
      error: () => {
        this.loadingConfigProfileId = null;
        this.pageLoadState.fail(this.pageLoadKey, 'Không tải được cấu hình strategy.');
      },
    });
  }

  reloadScoring(page = this.scoringPage, background = false, force = false): void {
    if (!this.activeProfileId) return;
    if (!force && page === this.scoringPage && this.rankings && this.hasDetailedRankings(this.rankings) && this.isSectionFresh('scoring')) {
      return;
    }
    this.scoringPage = Math.max(1, page);
    if (background) {
      this.pageLoadState.startBackground(this.pageLoadKey);
    } else {
      this.pageLoadState.start(this.pageLoadKey);
    }
    this.scoringSub?.unsubscribe();
    this.scoringSub = this.api
      .getStrategyRankings({
        profileId: this.activeProfileId,
        exchange: this.scoringExchange !== 'ALL' ? this.scoringExchange : undefined,
        keyword: this.normalizedScoringKeyword || undefined,
        watchlistOnly: this.scoringWatchlistOnly,
        page: this.scoringPage,
        pageSize: this.scoringPageSize,
      })
      .subscribe({
        next: (response) => {
          this.rankings = response.data || null;
          this.scoringPage = this.rankings?.page || this.scoringPage;
          this.overview = this.buildLightOverview(this.profiles, this.config, this.rankings);
          this.syncSelectedScoreItem(this.rankings, this.selectedScoreItem?.symbol, true);
          this.rememberAllScoringFirstPage();
          this.markSectionLoaded('scoring');
          this.pageLoadState.finish(this.pageLoadKey);
        },
        error: () => this.pageLoadState.fail(this.pageLoadKey, 'Không tải được dữ liệu scoring.'),
      });
  }

  reloadScoringFromFirstPage(): void {
    if (!this.normalizedScoringKeyword && this.applyCachedAllScoringFirstPage()) {
      this.reloadScoring(1, true);
      return;
    }
    this.reloadScoring(1);
  }

  onScoringKeywordChange(value: string): void {
    const normalized = (value || '').trim().toUpperCase();
    this.scoringKeyword = normalized;

    if (!normalized && this.applyCachedAllScoringFirstPage()) {
      this.scoringKeywordChanges.next('');
      return;
    }

    this.scoringKeywordChanges.next(normalized);
  }

  private applyScoringKeyword(keyword: string): void {
    this.scoringKeyword = (keyword || '').trim().toUpperCase();
    this.reloadScoringFromFirstPage();
  }

  private get normalizedScoringKeyword(): string {
    return (this.scoringKeyword || '').trim().toUpperCase();
  }

  private canUseAllScoringCache(): boolean {
    return this.scoringExchange === 'ALL' && !this.scoringWatchlistOnly && !this.normalizedScoringKeyword;
  }

  private rememberAllScoringFirstPage(): void {
    if (this.canUseAllScoringCache() && this.scoringPage === 1 && this.rankings) {
      this.cachedAllScoringFirstPage = this.rankings;
    }
  }

  private applyCachedAllScoringFirstPage(): boolean {
    if (!this.cachedAllScoringFirstPage || !this.canUseAllScoringCache()) {
      return false;
    }

    this.rankings = this.cachedAllScoringFirstPage;
    this.scoringPage = this.rankings.page || 1;
    this.overview = this.buildLightOverview(this.profiles, this.config, this.rankings);
    this.syncSelectedScoreItem(this.rankings, this.selectedScoreItem?.symbol, true);
    return true;
  }

  goToPreviousScoringPage(): void {
    if (this.scoringPage <= 1) {
      return;
    }
    this.reloadScoring(this.scoringPage - 1);
  }

  goToNextScoringPage(): void {
    if (this.scoringPage >= this.scoringTotalPages) {
      return;
    }
    this.reloadScoring(this.scoringPage + 1);
  }

  reloadScreener(force = false): void {
    if (!this.activeProfileId) return;
    if (!force && this.screener && this.isSectionFresh('screener')) {
      return;
    }
    this.pageLoadState.start(this.pageLoadKey);
    this.api
      .runStrategyScreener({
        profileId: this.activeProfileId,
        exchange: this.screenerExchange !== 'ALL' ? this.screenerExchange : undefined,
        keyword: this.screenerKeyword || undefined,
        watchlistOnly: this.screenerWatchlistOnly,
        page: 1,
        pageSize: 12,
      })
      .subscribe({
        next: (response) => {
          this.screener = response.data || null;
          this.markSectionLoaded('screener');
          this.pageLoadState.finish(this.pageLoadKey);
        },
        error: () => this.pageLoadState.fail(this.pageLoadKey, 'Không tải được dữ liệu screener.'),
      });
  }

  reloadRisk(force = false): void {
    if (!this.activeProfileId) return;
    if (!force && this.risk && this.isSectionFresh('risk')) {
      return;
    }
    this.pageLoadState.start(this.pageLoadKey);
    this.api.getStrategyRiskOverview(this.activeProfileId).subscribe({
      next: (response) => {
        this.risk = response.data || null;
        this.markSectionLoaded('risk');
        this.pageLoadState.finish(this.pageLoadKey);
      },
      error: () => this.pageLoadState.fail(this.pageLoadKey, 'Không tải được dữ liệu risk.'),
    });
  }

  reloadJournal(force = false): void {
    if (!force && this.journal.length && this.isSectionFresh('journal')) {
      return;
    }
    this.pageLoadState.startBackground(this.pageLoadKey);
    this.api.listStrategyJournal(12).subscribe({
      next: (response) => {
        this.journal = response.data || [];
        this.markSectionLoaded('journal');
        this.pageLoadState.finish(this.pageLoadKey);
      },
      error: () => this.pageLoadState.fail(this.pageLoadKey, 'Không tải được nhật ký giao dịch.'),
    });
  }

  refreshData(silent = false, force = false): void {
    if (!this.activeProfileId || this.selectedTab === 'overview') {
      this.loadOverview(force);
      return;
    }

    this.refreshActiveTabData(silent, force);
    return;

    if (!silent) {
      this.loading = true;
      this.error = '';
    }
    forkJoin({
      overview: this.api.getStrategyOverview(this.activeProfileId!),
      rankings: this.api.getStrategyRankings({
        profileId: this.activeProfileId!,
        exchange: this.scoringExchange !== 'ALL' ? this.scoringExchange : undefined,
        keyword: this.normalizedScoringKeyword || undefined,
        watchlistOnly: this.scoringWatchlistOnly,
        page: 1,
        pageSize: this.scoringPageSize,
      }),
      screener: this.api.runStrategyScreener({
        profileId: this.activeProfileId!,
        exchange: this.screenerExchange !== 'ALL' ? this.screenerExchange : undefined,
        keyword: this.screenerKeyword || undefined,
        watchlistOnly: this.screenerWatchlistOnly,
        page: 1,
        pageSize: 12,
      }),
      risk: this.api.getStrategyRiskOverview(this.activeProfileId!),
      journal: this.api.listStrategyJournal(12),
    }).subscribe({
      next: ({ overview, rankings, screener, risk, journal }) => {
        this.loading = false;
        this.overview = overview.data || this.overview;
        this.profiles = this.overview?.profiles || this.profiles;
        this.activeProfileId = this.overview?.activeProfile?.id || this.activeProfileId;
        this.rankings = rankings.data || this.rankings;
        this.screener = screener.data || this.screener;
        this.risk = risk.data || this.risk;
        this.journal = journal.data || this.journal;
        if (this.selectedScoreItem?.symbol) {
          this.selectedScoreItem =
            this.rankings?.items?.find((item) => item.symbol === this.selectedScoreItem?.symbol) ||
            this.rankings?.items?.[0] ||
            null;
        } else {
          this.selectedScoreItem = this.rankings?.items?.[0] || null;
        }
      },
      error: () => {
        this.loading = false;
        this.error = 'Không làm mới được dữ liệu Strategy Hub.';
      },
    });
  }

  chooseScoreItem(item: StrategyScoredItem): void {
    this.selectedScoreItem = item;
    this.selectedTab = 'scoring';
    this.ensureDetailedScoreItem(item);
  }

  openJournalFromItem(item: StrategyScoredItem, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.selectedScoreItem = item;
    this.message = '';

    if (!this.activeProfileId || this.hasDetailedScoreItem(item)) {
      this.navigateToJournalSettings(item);
      return;
    }

    const symbol = item.symbol?.toUpperCase?.() || item.symbol;
    if (!symbol) {
      this.navigateToJournalSettings(item);
      return;
    }

    this.detailLoading = true;
    this.detailLoadingSymbol = symbol;
    this.pageLoadState.startBackground(this.pageLoadKey);
    this.api.getStrategySymbolScore(this.activeProfileId, symbol).subscribe({
      next: (response) => {
        this.detailLoading = false;
        if (this.detailLoadingSymbol === symbol) {
          this.detailLoadingSymbol = null;
        }
        const detailedItem = response.data?.symbol === symbol ? response.data : item;
        this.selectedScoreItem = detailedItem;
        this.navigateToJournalSettings(detailedItem);
        this.pageLoadState.finish(this.pageLoadKey);
      },
      error: () => {
        this.detailLoading = false;
        if (this.detailLoadingSymbol === symbol) {
          this.detailLoadingSymbol = null;
        }
        this.navigateToJournalSettings(item);
        this.pageLoadState.fail(this.pageLoadKey, 'Không tải được chi tiết công thức của mã.');
      },
    });
  }

  private ensureProfileConfigLoaded(profileId: number, force = false): void {
    if (!force && this.loadedConfigProfileId === profileId && this.config && this.isSectionFresh('config')) {
      return;
    }
    this.loadConfig(profileId, force);
  }

  private markSectionLoaded(section: StrategyLoadSection): void {
    this.sectionLoadedAt[section] = Date.now();
  }

  private isSectionFresh(section: StrategyLoadSection, maxAgeMs = this.sectionMaxAgeMs[section]): boolean {
    const loadedAt = this.sectionLoadedAt[section];
    return typeof loadedAt === 'number' && Date.now() - loadedAt <= maxAgeMs;
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

  private buildLightOverview(
    profiles: StrategyProfile[],
    config: StrategyProfileConfigResponse | null,
    rankings: StrategyPagedResponse | null
  ): StrategyOverviewResponse | null {
    const activeProfile =
      profiles.find((item) => item.id === this.activeProfileId) ||
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
        formulaCount: config?.formulas?.length || 0,
        screenRuleCount: config?.screenRules?.length || 0,
        alertRuleCount: config?.alertRules?.length || 0,
        checklistCount: config?.checklists?.length || 0,
        versionCount: config?.versions?.length || 0,
      },
      rankings: rankings || {
        page: 1,
        pageSize: 0,
        total: 0,
        items: [],
      },
      screener: this.screener || {
        page: 1,
        pageSize: 0,
        total: 0,
        items: [],
      },
      risk: this.risk || {
        profile: activeProfile,
        summaryCards: [],
        highRiskItems: [],
      },
      journal: this.journal || [],
    };
  }

  private syncSelectedScoreItem(
    source: StrategyPagedResponse | null | undefined,
    preferredSymbol?: string | null,
    hydrateDetail = false
  ): void {
    const items = source?.items || [];
    const nextItem = preferredSymbol
      ? items.find((item) => item.symbol === preferredSymbol) || items[0] || null
      : items[0] || null;
    this.selectedScoreItem = nextItem;
    if (hydrateDetail && nextItem) {
      this.ensureDetailedScoreItem(nextItem);
    }
  }

  private ensureDetailedScoreItem(item: StrategyScoredItem | null | undefined): void {
    if (!item || !this.activeProfileId) {
      return;
    }
    if (this.hasDetailedScoreItem(item)) {
      this.selectedScoreItem = item;
      return;
    }

    const symbol = item.symbol?.toUpperCase?.() || item.symbol;
    if (!symbol || (this.detailLoading && this.detailLoadingSymbol === symbol)) {
      return;
    }

    this.detailLoading = true;
    this.detailLoadingSymbol = symbol;
    this.pageLoadState.startBackground(this.pageLoadKey);
    this.api.getStrategySymbolScore(this.activeProfileId, symbol).subscribe({
      next: (response) => {
        this.detailLoading = false;
        if (this.detailLoadingSymbol === symbol) {
          this.detailLoadingSymbol = null;
        }
        if (response.data && response.data.symbol === symbol) {
          this.selectedScoreItem = response.data;
        }
        this.pageLoadState.finish(this.pageLoadKey);
      },
      error: () => {
        this.detailLoading = false;
        if (this.detailLoadingSymbol === symbol) {
          this.detailLoadingSymbol = null;
        }
        this.pageLoadState.fail(this.pageLoadKey, 'Không tải được chi tiết công thức của mã.');
      },
    });
  }

  activateProfile(profile: StrategyProfile): void {
    this.api.activateStrategyProfile(profile.id).subscribe({
      next: (response) => {
        if (!response.data) return;
        this.activeProfileId = response.data.id;
        this.message = `Đã chuyển sang profile ${response.data.name}.`;
        this.loadOverview();
      },
    });
  }

  createProfile(): void {
    if (!this.newProfile.code.trim() || !this.newProfile.name.trim()) {
      this.error = 'Cần nhập code và tên profile.';
      return;
    }
    this.api.createStrategyProfile(this.newProfile).subscribe({
      next: (response) => {
        if (!response.data) {
          this.error = 'Không tạo được profile.';
          return;
        }
        this.newProfile = { code: '', name: '', description: '' };
        this.message = 'Đã tạo profile mới.';
        this.loadOverview();
      },
      error: () => {
        this.error = 'Tạo profile thất bại.';
      },
    });
  }

  saveConfig(): void {
    if (!this.activeProfileId || !this.config) return;
    this.saving = true;
    this.error = '';
    this.message = '';
    this.api.saveStrategyProfileConfig(this.activeProfileId, this.config).subscribe({
      next: (response) => {
        this.saving = false;
        if (!response.data) {
          this.error = 'Backend không lưu được strategy config.';
          return;
        }
        this.config = response.data;
        this.ensureSettingsExpansion();
        this.message = 'Đã lưu strategy settings.';
        this.refreshData();
      },
      error: () => {
        this.saving = false;
        this.error = 'Lưu strategy settings thất bại.';
      },
    });
  }

  publishConfig(): void {
    if (!this.activeProfileId) return;
    this.publishing = true;
    this.error = '';
    this.message = '';
    this.api.publishStrategyProfile(this.activeProfileId, 'Publish from strategy hub').subscribe({
      next: (response) => {
        this.publishing = false;
        if (!response.data) {
          this.error = 'Không publish được version.';
          return;
        }
        this.message = `Đã publish version #${response.data.versionNo}.`;
        this.loadConfig(this.activeProfileId!);
      },
      error: () => {
        this.publishing = false;
        this.error = 'Publish strategy thất bại.';
      },
    });
  }

  saveJournal(): void {
    if (!this.activeProfileId || !this.journalForm.symbol.trim()) {
      this.error = 'Cần nhập mã giao dịch.';
      return;
    }
    const payload = {
      profile_id: this.activeProfileId,
      symbol: this.journalForm.symbol.trim().toUpperCase(),
      trade_date: this.journalForm.trade_date,
      classification: this.journalForm.classification,
      trade_side: this.journalForm.trade_side,
      entry_price: this.journalForm.entry_price,
      exit_price: this.journalForm.exit_price,
      stop_loss_price: this.journalForm.stop_loss_price,
      take_profit_price: this.journalForm.take_profit_price,
      quantity: this.journalForm.quantity,
      position_size: this.journalForm.position_size,
      total_capital: this.journalForm.total_capital,
      strategy_name: this.journalForm.strategy_name,
      psychology: this.journalForm.psychology,
      notes: this.journalForm.notes,
      mistake_tags_json: this.journalForm.mistake_tags_json,
      signal_snapshot_json: this.selectedScoreItem
        ? {
            volumeIntelligence: this.selectedScoreItem.volumeIntelligence,
            candlestickSignals: this.selectedScoreItem.candlestickSignals,
            footprintSignals: this.selectedScoreItem.footprintSignals,
          }
        : undefined,
      result_snapshot_json: this.selectedScoreItem
        ? {
            winningScore: this.selectedScoreItem.winningScore,
            qScore: this.selectedScoreItem.qScore,
            lScore: this.selectedScoreItem.lScore,
            mScore: this.selectedScoreItem.mScore,
            pScore: this.selectedScoreItem.pScore,
            riskScore: this.selectedScoreItem.riskScore,
            fairValue: this.selectedScoreItem.fairValue,
            marginOfSafety: this.selectedScoreItem.marginOfSafety,
            executionPlan: this.selectedScoreItem.executionPlan,
            formulaVerdict: this.selectedScoreItem.formulaVerdict,
          }
        : undefined,
    };

    const request$ = this.editingJournalId
      ? this.api.updateStrategyJournal(this.editingJournalId, payload)
      : this.api.createStrategyJournal(payload);

    request$.subscribe({
      next: (response) => {
        if (!response.data) {
          this.error = this.editingJournalId ? 'Không cập nhật được nhật ký.' : 'Không lưu được nhật ký.';
          return;
        }
        this.message = this.editingJournalId ? 'Đã cập nhật nhật ký giao dịch.' : 'Đã thêm nhật ký giao dịch.';
        this.resetJournalForm();
        this.refreshData();
      },
    });
  }

  editJournal(item: StrategyJournalEntry): void {
    this.journalSuggestion = null;
    this.editingJournalId = item.id;
    this.journalForm = {
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

  cancelJournalEdit(): void {
    this.resetJournalForm();
  }

  deleteJournal(item: StrategyJournalEntry): void {
    const confirmed = window.confirm(`Xóa nhật ký giao dịch cho mã ${item.symbol}?`);
    if (!confirmed) {
      return;
    }
    this.api.deleteStrategyJournal(item.id).subscribe({
      next: (response) => {
        if (!response.data) {
          this.error = 'Không xóa được journal.';
          return;
        }
        if (this.editingJournalId === item.id) {
          this.resetJournalForm();
        }
        this.message = 'Đã xóa nhật ký giao dịch.';
        this.reloadJournal();
      },
    });
  }

  private resetJournalForm(): void {
    this.editingJournalId = null;
    this.journalSuggestion = null;
    this.journalForm = {
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
    };
  }

  private refreshActiveTabData(silent = false, force = false): void {
    if (!this.activeProfileId) {
      this.loadOverview(force);
      return;
    }

    if (!silent) {
      this.loading = true;
      this.error = '';
    }

    const complete = () => {
      if (!silent) {
        this.loading = false;
      }
    };

    switch (this.selectedTab) {
      case 'overview':
        if (!force && this.isSectionFresh('profiles', 20000)) {
          complete();
          return;
        }
        this.api.getStrategyOverview(this.activeProfileId).subscribe({
          next: (response) => {
            if (response.data) {
              this.overview = response.data;
              this.profiles = response.data.profiles || this.profiles;
              this.activeProfileId = response.data.activeProfile?.id || this.activeProfileId;
              this.rankings = response.data.rankings || this.rankings;
              this.screener = response.data.screener || this.screener;
              this.risk = response.data.risk || this.risk;
              this.journal = response.data.journal || this.journal;
              if (this.activeProfileId) {
                this.ensureProfileConfigLoaded(this.activeProfileId);
              }
              this.syncSelectedScoreItem(this.rankings, this.selectedScoreItem?.symbol, true);
              this.markSectionLoaded('profiles');
              this.markSectionLoaded('scoring');
              this.markSectionLoaded('screener');
              this.markSectionLoaded('risk');
              this.markSectionLoaded('journal');
            }
            complete();
          },
          error: () => {
            this.error = 'Không làm mới được dữ liệu Strategy Hub.';
            complete();
          },
        });
        return;
      case 'scoring':
        if (!force && this.rankings && this.isSectionFresh('scoring')) {
          complete();
          return;
        }
        this.api
          .getStrategyRankings({
            profileId: this.activeProfileId,
            exchange: this.scoringExchange !== 'ALL' ? this.scoringExchange : undefined,
            keyword: this.normalizedScoringKeyword || undefined,
            watchlistOnly: this.scoringWatchlistOnly,
            page: this.scoringPage,
            pageSize: this.scoringPageSize,
          })
          .subscribe({
            next: (response) => {
              this.rankings = response.data || this.rankings;
              this.scoringPage = this.rankings?.page || this.scoringPage;
              this.overview = this.buildLightOverview(this.profiles, this.config, this.rankings);
              this.syncSelectedScoreItem(this.rankings, this.selectedScoreItem?.symbol, true);
              this.markSectionLoaded('scoring');
              complete();
            },
            error: () => {
              this.error = 'Không làm mới được dữ liệu Strategy Hub.';
              complete();
            },
          });
        return;
      case 'screener':
        if (!force && this.screener && this.isSectionFresh('screener')) {
          complete();
          return;
        }
        this.api
          .runStrategyScreener({
            profileId: this.activeProfileId,
            exchange: this.screenerExchange !== 'ALL' ? this.screenerExchange : undefined,
            keyword: this.screenerKeyword || undefined,
            watchlistOnly: this.screenerWatchlistOnly,
            page: 1,
            pageSize: 12,
          })
          .subscribe({
            next: (response) => {
              this.screener = response.data || this.screener;
              this.markSectionLoaded('screener');
              complete();
            },
            error: () => {
              this.error = 'Không làm mới được dữ liệu Strategy Hub.';
              complete();
            },
          });
        return;
      case 'risk':
        if (!force && this.risk && this.isSectionFresh('risk')) {
          complete();
          return;
        }
        this.api.getStrategyRiskOverview(this.activeProfileId).subscribe({
          next: (response) => {
            this.risk = response.data || this.risk;
            this.markSectionLoaded('risk');
            complete();
          },
          error: () => {
            this.error = 'Không làm mới được dữ liệu Strategy Hub.';
            complete();
          },
        });
        return;
      default:
        if (!force && this.journal.length && this.isSectionFresh('journal')) {
          complete();
          return;
        }
        this.api.listStrategyJournal(12).subscribe({
          next: (response) => {
            this.journal = response.data || this.journal;
            this.markSectionLoaded('journal');
            complete();
          },
          error: () => {
            this.error = 'Không làm mới được dữ liệu Strategy Hub.';
            complete();
          },
        });
        return;
    }
  }

  parseTags(input: string): void {
    this.journalForm.mistake_tags_json = input
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  trackByCode(_: number, item: StrategyProfile | StrategyFormula | StrategyScreenRule | StrategyAlertRule | StrategyChecklistItem): string | number {
    return (item as any).id || (item as any).code || (item as any).formulaCode || (item as any).ruleCode || (item as any).itemCode;
  }

  selectSettingsSection(section: StrategySettingsSection): void {
    this.selectedSettingsSection = section;
    this.ensureSettingsExpansion();
  }

  toggleSettingsCard(section: StrategySettingsSection, entity: StrategyConfigEntity): void {
    const key = this.getSettingsCardKey(section, entity);
    this.expandedSettingsCardKey = this.expandedSettingsCardKey === key ? '' : key;
  }

  isSettingsCardOpen(section: StrategySettingsSection, entity: StrategyConfigEntity): boolean {
    return this.expandedSettingsCardKey === this.getSettingsCardKey(section, entity);
  }

  getSettingsSectionCount(section: StrategySettingsSection): number {
    if (!this.config) {
      return 0;
    }

    switch (section) {
      case 'profiles':
        return this.profiles.length;
      case 'formulas':
        return this.config.formulas.length;
      case 'screenRules':
        return this.config.screenRules.length;
      case 'alertRules':
        return this.config.alertRules.length;
      case 'checklists':
        return this.config.checklists.length;
      case 'versions':
        return this.config.versions.length;
      default:
        return 0;
    }
  }

  parameterAsNumber(parameter: StrategyParameter): number | null {
    if (parameter.value === null || parameter.value === undefined || parameter.value === '') {
      return null;
    }
    return Number(parameter.value);
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
      return parameter.value ? 'Bật' : 'Tắt';
    }
    if (parameter.value === null || parameter.value === undefined || parameter.value === '') {
      return 'Chưa đặt';
    }
    return String(parameter.value);
  }

  getDecisionNarratives(item: StrategyScoredItem | null): StrategyDecisionNarrative[] {
    if (!item) {
      return [];
    }

    const narratives: StrategyDecisionNarrative[] = [];
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
        label: 'Winning Score',
        status: winningRule.passed ? 'pass' : 'fail',
        detail: this.buildRuleNarrative(
          winningRule,
          `Hiện tại ${item.winningScore.toFixed(2)}`,
          'Vượt ngưỡng cấu hình',
          'Chưa đạt ngưỡng cấu hình'
        ),
      });
    }

    if (marginRule) {
      narratives.push({
        label: 'Biên an toàn',
        status: marginRule.passed ? 'pass' : 'fail',
        detail: this.buildRuleNarrative(
          marginRule,
          `Hiện tại ${(item.marginOfSafety * 100).toFixed(1)}%`,
          'Biên an toàn đang đạt yêu cầu',
          'Biên an toàn còn thấp hơn mức yêu cầu'
        ),
      });
    }

    if (qualityRule) {
      narratives.push({
        label: 'Chất lượng doanh nghiệp',
        status: qualityRule.passed ? 'pass' : 'fail',
        detail: this.buildRuleNarrative(
          qualityRule,
          `Q Score hiện tại ${item.qScore.toFixed(2)}`,
          'Q Score đang đạt chuẩn vào lệnh',
          'Q Score chưa đạt chuẩn vào lệnh'
        ),
      });
    }

    if (breakoutRule) {
      narratives.push({
        label: 'Xác nhận kỹ thuật',
        status: breakoutRule.passed ? 'pass' : 'warn',
        detail: this.buildRuleNarrative(
          breakoutRule,
          `M Score ${item.mScore.toFixed(2)}`,
          'Đang có xác nhận kỹ thuật tốt',
          'Xác nhận kỹ thuật còn yếu'
        ),
      });
    }

    return narratives;
  }

  getSmartMoneyBadgeState(item: StrategyScoredItem | null): 'on' | 'off' {
    return item?.volumeIntelligence?.smartMoneyInflow ? 'on' : 'off';
  }

  getPrimaryCandlestickSignal(item: StrategyScoredItem | null): string {
    const detectedSignal = item?.candlestickSignals?.find((signal) => signal.detected);
    return detectedSignal?.label || 'strategyHub.state.none';
  }

  getExecutionBadgeState(item: StrategyScoredItem | null): StrategyExecutionBadgeState {
    const executionPlan = item?.executionPlan;
    if (!executionPlan) {
      return 'wait';
    }
    if (executionPlan.standAside) {
      return 'standAside';
    }
    if (executionPlan.probeBuy30 || executionPlan.addBuy70) {
      return 'ready';
    }
    return 'wait';
  }

  getExecutionBadgeLabel(item: StrategyScoredItem | null): string {
    const state = this.getExecutionBadgeState(item);
    if (state === 'standAside') {
      return 'strategyHub.state.standAside';
    }
    if (state === 'ready') {
      return 'strategyHub.state.ready';
    }
    return 'strategyHub.state.wait';
  }

  countPassedRules(items: StrategyRuleResult[] | null | undefined): number {
    return (items || []).filter((item) => item.passed).length;
  }

  countFailedRules(items: StrategyRuleResult[] | null | undefined): number {
    return (items || []).filter((item) => !item.passed).length;
  }

  countTriggeredAlerts(items: StrategyRuleResult[] | null | undefined): number {
    return (items || []).filter((item) => item.passed).length;
  }

  openRuleModal(title: string, items: StrategyRuleResult[] | null | undefined, mode: StrategyRuleModalMode = 'passFail'): void {
    this.ruleModalTitle = title;
    this.ruleModalItems = items || [];
    this.ruleModalMode = mode;
    this.ruleModalOpen = true;
  }

  openDecisionBreakdownModal(item: StrategyScoredItem): void {
    const items = this.getDecisionNarratives(item).map((narrative) =>
      this.buildModalResult(
        narrative.label,
        narrative.status === 'pass',
        narrative.detail,
        narrative.label.toLowerCase().replace(/\s+/g, '_'),
        narrative.status
      )
    );
    this.openRuleModal(`Tổng hợp quyết định ${item.symbol}`, items, 'passFail');
  }

  openFundamentalBreakdownModal(item: StrategyScoredItem): void {
    const fundamentals = item.fundamentalMetrics;
    const items = (fundamentals?.qualityFlags || []).map((flag) =>
      this.buildModalResult(
        flag.label,
        flag.passed,
        `${flag.passed ? 'Đạt' : 'Chưa đạt'} tiêu chí cơ bản. P/E ${this.optionalNumberLabel(fundamentals?.pe, 1)}, ROE ${this.percentWholeLabel(fundamentals?.roe)}.`,
        flag.code
      )
    );
    if (!items.length) {
      items.push(this.buildModalResult('Dữ liệu cơ bản', false, 'Chưa có đủ dữ liệu cơ bản để đánh giá pass/fail.', 'fundamental_missing'));
    }
    this.openRuleModal(`Cơ bản ${item.symbol}`, items, 'passFail');
  }

  openFlowBreakdownModal(item: StrategyScoredItem): void {
    const volume = item.volumeIntelligence;
    const moneyFlow = item.moneyFlowIntelligence;
    const items: StrategyRuleResult[] = [
      this.buildModalResult(
        'Dòng tiền thông minh',
        !!volume?.smartMoneyInflow,
        volume?.smartMoneyInflow ? 'Có dấu hiệu dòng tiền lớn tham gia.' : 'Chưa thấy dòng tiền lớn xác nhận.',
        'smart_money_inflow'
      ),
      this.buildModalResult(
        'Volume spike',
        Number(volume?.volumeSpikeRatio || 0) >= 1.5,
        `Spike hiện tại ${this.optionalNumberLabel(volume?.volumeSpikeRatio, 2)}x.`,
        'volume_spike_ratio'
      ),
      this.buildModalResult(
        'Bẫy tăng tốc',
        volume ? !volume.surgeTrap : false,
        volume?.surgeTrap ? 'Có tín hiệu trap, cần tránh mua đuổi.' : 'Chưa phát hiện trap volume.',
        'surge_trap'
      ),
      this.buildModalResult(
        'Phân phối OBV',
        moneyFlow ? !moneyFlow.obvDistribution : false,
        moneyFlow?.obvDistribution ? 'OBV có dấu hiệu phân phối.' : 'Chưa thấy phân phối OBV rõ.',
        'obv_distribution'
      ),
      this.buildModalResult(
        'Dòng tiền trước tin',
        !!moneyFlow?.smartMoneyBeforeNews,
        moneyFlow?.smartMoneyBeforeNews ? 'Có tín hiệu dòng tiền đi trước tin.' : 'Chưa có tín hiệu dòng tiền trước tin.',
        'smart_money_before_news'
      ),
    ];

    for (const signal of [...(moneyFlow?.items || []), ...(item.candlestickSignals || []), ...(item.footprintSignals || [])]) {
      items.push(
        this.buildModalResult(
          signal.label,
          signal.detected && signal.bias !== 'bearish',
          signal.detail || (signal.detected ? 'Đã phát hiện tín hiệu.' : 'Chưa phát hiện tín hiệu.'),
          signal.code,
          signal.bias
        )
      );
    }

    this.openRuleModal(`Dòng tiền ${item.symbol}`, items, 'passFail');
  }

  openRulesBreakdownModal(item: StrategyScoredItem): void {
    const items = [
      ...this.prefixRuleResults('Layer', item.layerResults),
      ...this.prefixRuleResults('Alert', item.alertResults),
      ...this.prefixRuleResults('Checklist', item.checklistResults),
    ];
    this.openRuleModal(`Luật & cảnh báo ${item.symbol}`, items, 'mixed');
  }

  openSignalOverviewModal(item: StrategyScoredItem): void {
    const volume = item.volumeIntelligence;
    const moneyFlow = item.moneyFlowIntelligence;
    const items = [
      this.buildModalResult(
        'Smart Money',
        this.getSmartMoneyBadgeState(item) === 'on',
        volume?.smartMoneyInflow ? 'Dòng tiền lớn đang được hệ thống xác nhận.' : 'Chưa có xác nhận dòng tiền lớn.',
        'smart_money'
      ),
      this.buildModalResult(
        'No Supply',
        !!volume?.noSupply,
        volume?.noSupply ? 'Nhịp điều chỉnh có dấu hiệu cạn cung.' : 'Chưa có tín hiệu cạn cung rõ.',
        'no_supply'
      ),
      this.buildModalResult(
        'Tích lũy trước tin',
        !!moneyFlow?.preNewsAccumulation,
        moneyFlow?.preNewsAccumulation ? 'Có dấu hiệu tích lũy trước tin.' : 'Chưa thấy tích lũy trước tin.',
        'pre_news_accumulation'
      ),
      this.buildModalResult(
        'Đuổi giá theo tin yếu',
        moneyFlow ? !moneyFlow.weakNewsChase : false,
        moneyFlow?.weakNewsChase ? 'Có rủi ro đuổi giá theo tin yếu.' : 'Chưa phát hiện rủi ro đuổi giá theo tin yếu.',
        'weak_news_chase'
      ),
    ];
    this.openRuleModal(`Tín hiệu nhanh ${item.symbol}`, items, 'passFail');
  }

  openCandleSignalsModal(item: StrategyScoredItem): void {
    const signals = [...(item.candlestickSignals || []), ...(item.footprintSignals || [])];
    const items = signals.map((signal) =>
      this.buildModalResult(
        signal.label,
        signal.detected,
        signal.detail || (signal.detected ? 'Đã phát hiện tín hiệu.' : 'Chưa phát hiện tín hiệu.'),
        signal.code,
        signal.bias
      )
    );
    if (!items.length) {
      items.push(this.buildModalResult('Mẫu nến', false, 'Chưa có mẫu nến hoặc dấu chân tổ chức nào được phát hiện.', 'no_candle_signal'));
    }
    this.openRuleModal(`Mẫu nến & footprint ${item.symbol}`, items, 'passFail');
  }

  openExecutionPlanModal(item: StrategyScoredItem): void {
    const plan = item.executionPlan;
    const items = [
      this.buildModalResult('Mua thăm dò 30%', !!plan?.probeBuy30, plan?.probeBuy30 ? 'Có thể cân nhắc mua thăm dò.' : 'Chưa đủ điều kiện mua thăm dò.', 'probe_buy_30'),
      this.buildModalResult('Mua gia tăng 70%', !!plan?.addBuy70, plan?.addBuy70 ? 'Có thể cân nhắc mua gia tăng.' : 'Chưa đủ điều kiện mua gia tăng.', 'add_buy_70'),
      this.buildModalResult('Chốt lời', plan ? !plan.takeProfitSignal : false, plan?.takeProfitSignal ? 'Có tín hiệu cần cân nhắc chốt lời.' : 'Chưa có tín hiệu chốt lời.', 'take_profit_signal'),
      this.buildModalResult('Đứng ngoài', plan ? !plan.standAside : false, plan?.standAside ? 'Engine đang khuyến nghị đứng ngoài.' : 'Không có tín hiệu bắt buộc đứng ngoài.', 'stand_aside'),
      this.buildModalResult(
        'Vùng stop-loss',
        !!plan && plan.stopLossMin !== null && plan.stopLossMax !== null,
        `Stop-loss tham chiếu ${this.percentWholeLabel(plan?.stopLossMin)} đến ${this.percentWholeLabel(plan?.stopLossMax)}.`,
        'stop_loss_zone'
      ),
    ];
    for (const [index, note] of (plan?.rationale || []).entries()) {
      items.push(this.buildModalResult(`Lý do ${index + 1}`, true, note, `execution_reason_${index + 1}`));
    }
    this.openRuleModal(`Kế hoạch thực thi ${item.symbol}`, items, 'passFail');
  }

  openValuationMetricModal(
    item: StrategyScoredItem,
    metric: 'fairValue' | 'marginOfSafety' | 'changePercent' | 'watchlist'
  ): void {
    const metricMap = {
      fairValue: {
        title: 'Giá trị hợp lý',
        passed: item.fairValue !== null && item.currentPrice <= item.fairValue,
        message: `Giá hiện tại ${this.optionalNumberLabel(item.currentPrice, 2)}, fair value ${this.optionalNumberLabel(item.fairValue, 2)}.`,
      },
      marginOfSafety: {
        title: 'Biên an toàn',
        passed: item.marginOfSafety > 0,
        message: `Biên an toàn hiện tại ${(item.marginOfSafety * 100).toFixed(1)}%. Số dương nghĩa là giá đang thấp hơn fair value.`,
      },
      changePercent: {
        title: 'Biến động',
        passed: Math.abs(item.changePercent) <= 3,
        message: `Biến động phiên hiện tại ${item.changePercent.toFixed(2)}%. Biến động quá mạnh cần kiểm tra thanh khoản và tin tức.`,
      },
      watchlist: {
        title: 'Danh sách theo dõi',
        passed: item.isWatchlist,
        message: item.isWatchlist ? 'Mã đang nằm trong danh sách theo dõi nên được ưu tiên giám sát.' : 'Mã chưa nằm trong danh sách theo dõi.',
      },
    };
    const selected = metricMap[metric];
    const items = [
      this.buildModalResult(selected.title, selected.passed, selected.message, metric),
      this.buildModalResult('Rủi ro', item.riskScore < 65, `Risk score hiện tại ${item.riskScore.toFixed(2)}.`, 'risk_score'),
      this.buildModalResult('Winning Score', item.winningScore >= 50, `Winning Score hiện tại ${item.winningScore.toFixed(2)}.`, 'winning_score'),
    ];
    this.openRuleModal(`${selected.title} ${item.symbol}`, items, 'passFail');
  }

  openScoreMetricModal(item: StrategyScoredItem, score: 'Q' | 'L' | 'M' | 'P' | 'Winning'): void {
    const scoreMap = {
      Q: {
        title: 'Q Score',
        value: item.qScore,
        passed: item.qScore >= 50,
        message: 'Đánh giá chất lượng doanh nghiệp, sức khỏe cơ bản và các cờ chất lượng.',
      },
      L: {
        title: 'L Score',
        value: item.lScore,
        passed: item.lScore >= 50,
        message: 'Đánh giá mức dẫn dắt, xu hướng thị trường và vị thế tương đối.',
      },
      M: {
        title: 'M Score',
        value: item.mScore,
        passed: item.mScore >= 50,
        message: 'Đánh giá động lượng giá, xác nhận volume và tín hiệu breakout.',
      },
      P: {
        title: 'P Score',
        value: item.pScore,
        passed: item.pScore <= 35,
        message: 'Đánh giá mức nóng của giá và rủi ro mua đuổi. P thấp thường tốt hơn.',
      },
      Winning: {
        title: 'Winning Score',
        value: item.winningScore,
        passed: item.passedAllLayers,
        message: 'Điểm tổng hợp cuối cùng sau khi kết hợp Q, L, M, P và rule theo profile.',
      },
    };
    const selected = scoreMap[score];
    const items = [
      this.buildModalResult(selected.title, selected.passed, `${selected.message} Giá trị hiện tại ${selected.value.toFixed(2)}.`, score),
      this.buildModalResult('Layer 1', item.passedLayer1, item.passedLayer1 ? 'Layer 1 đang đạt.' : 'Layer 1 chưa đạt.', 'layer_1'),
      this.buildModalResult('Layer 2', item.passedLayer2, item.passedLayer2 ? 'Layer 2 đang đạt.' : 'Layer 2 chưa đạt.', 'layer_2'),
      this.buildModalResult('Layer 3', item.passedLayer3, item.passedLayer3 ? 'Layer 3 đang đạt.' : 'Layer 3 chưa đạt.', 'layer_3'),
    ];
    if (score === 'Q') {
      items.push(...this.prefixRuleResults('Cơ bản', item.layerResults.filter((rule) => ['quality', 'pe', 'eps', 'roe'].some((code) => rule.ruleCode.includes(code)))));
    }
    if (score === 'M') {
      items.push(...this.prefixRuleResults('Động lượng', item.layerResults.filter((rule) => ['breakout', 'volume', 'momentum', 'price_action'].some((code) => rule.ruleCode.includes(code)))));
    }
    if (score === 'Winning') {
      items.push(...this.prefixRuleResults('Rule', item.layerResults));
    }
    this.openRuleModal(`${selected.title} ${item.symbol}`, items, 'passFail');
  }

  closeRuleModal(): void {
    this.ruleModalOpen = false;
  }

  get ruleModalPassItems(): StrategyRuleResult[] {
    return this.ruleModalItems.filter((item) => item.passed);
  }

  get ruleModalFailItems(): StrategyRuleResult[] {
    return this.ruleModalItems.filter((item) => !item.passed);
  }

  get ruleModalPassTitle(): string {
    if (this.ruleModalMode === 'triggerOk') {
      return 'TRIGGER';
    }
    if (this.ruleModalMode === 'mixed') {
      return 'PASS / TRIGGER';
    }
    return 'PASS';
  }

  get ruleModalFailTitle(): string {
    if (this.ruleModalMode === 'triggerOk') {
      return 'OK';
    }
    if (this.ruleModalMode === 'mixed') {
      return 'FAIL / OK';
    }
    return 'FAIL';
  }

  countDetectedSignals(items: StrategySignalItem[] | null | undefined): number {
    return (items || []).filter((item) => item.detected).length;
  }

  optionalNumberLabel(value: number | null | undefined, digits = 1): string {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      return '-';
    }
    return Number(value).toFixed(digits);
  }

  percentWholeLabel(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      return '-';
    }
    return `${Number(value).toFixed(1)}%`;
  }

  useSuggestedJournalPrefill(): void {
    if (!this.selectedScoreItem) {
      return;
    }
    this.prefillJournalFromScoreItem(this.selectedScoreItem);
  }

  getExpressionBuilderVariables(entity: StrategyConfigEntity): StrategyVariableHint[] {
    const parameterHints = (entity.parameters || []).map((parameter) => ({
      key: parameter.paramKey,
      label: parameter.label,
      description: `Tham số cấu hình. Giá trị hiện tại: ${this.getParameterValueLabel(parameter)}.`,
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

  private ensureScoringFormulaSelection(): void {
    const availableCodes = this.selectableScoringFormulas.map((item) => item.formulaCode);
    if (!availableCodes.length) {
      this.selectedScoringFormulaCodes = [];
      this.persistScoringFormulaCodes();
      return;
    }

    const filtered = this.selectedScoringFormulaCodes.filter((code) => availableCodes.includes(code));
    this.selectedScoringFormulaCodes = filtered.length
      ? filtered
      : availableCodes.slice(0, Math.min(4, availableCodes.length));
    this.persistScoringFormulaCodes();
  }

  private readStoredScoringFormulaCodes(): string[] {
    const raw = localStorage.getItem(STRATEGY_SCORING_FORMULA_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as string[];
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private persistScoringFormulaCodes(): void {
    localStorage.setItem(
      STRATEGY_SCORING_FORMULA_STORAGE_KEY,
      JSON.stringify(this.selectedScoringFormulaCodes)
    );
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
        description: `Giá trị cấu hình hiện tại: ${this.getParameterValueLabel(parameter)}.`,
        kind: 'parameter',
      };
    }
    return VARIABLE_HINTS[token] || {
      key: token,
      label: token.replace(/_/g, ' '),
      description: 'Biến kỹ thuật đang được dùng trong công thức, chưa có mô tả business riêng.',
      kind: 'metric',
    };
  }

  private findRuleResult(results: StrategyRuleResult[], codes: string[]): StrategyRuleResult | null {
    return results.find((item) => codes.includes(item.ruleCode)) || null;
  }

  private buildModalResult(
    label: string,
    passed: boolean,
    message: string,
    ruleCode: string,
    severity = 'info',
    expression = ''
  ): StrategyRuleResult {
    return {
      id: 0,
      ruleCode,
      label,
      expression,
      severity,
      isRequired: false,
      passed,
      message,
      parameters: [],
    };
  }

  private prefixRuleResults(prefix: string, items: StrategyRuleResult[] | null | undefined): StrategyRuleResult[] {
    return (items || []).map((item) => ({
      ...item,
      label: `[${prefix}] ${item.label}`,
    }));
  }

  private buildRuleNarrative(
    rule: StrategyRuleResult,
    currentValueText: string,
    passPrefix: string,
    failPrefix: string
  ): string {
    const thresholdText = this.describeRuleThreshold(rule);
    const prefix = rule.passed ? passPrefix : failPrefix;
    return thresholdText ? `${prefix}: ${currentValueText}, ngưỡng ${thresholdText}.` : `${prefix}: ${currentValueText}.`;
  }

  private describeRuleThreshold(rule: StrategyRuleResult): string {
    if (!rule.parameters?.length) {
      return '';
    }
    const parameter = rule.parameters[0];
    const valueLabel = this.getParameterValueLabel(parameter);
    if (!valueLabel || valueLabel === 'Chưa đặt') {
      return '';
    }
    return `${parameter.label.toLowerCase()} = ${valueLabel}`;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private ensureSettingsExpansion(): void {
    if (!this.config) {
      this.expandedSettingsCardKey = '';
      return;
    }

    const currentItems = this.getSettingsEntities(this.selectedSettingsSection);
    if (!currentItems.length) {
      this.expandedSettingsCardKey = '';
      return;
    }

    const hasCurrent = currentItems.some(
      (item) => this.getSettingsCardKey(this.selectedSettingsSection, item) === this.expandedSettingsCardKey
    );

    if (!hasCurrent) {
      this.expandedSettingsCardKey = this.getSettingsCardKey(this.selectedSettingsSection, currentItems[0]);
    }
  }

  private getSettingsEntities(section: StrategySettingsSection): StrategyConfigEntity[] {
    if (!this.config) {
      return [];
    }

    switch (section) {
      case 'formulas':
        return this.config.formulas;
      case 'screenRules':
        return this.config.screenRules;
      case 'alertRules':
        return this.config.alertRules;
      case 'checklists':
        return this.config.checklists;
      default:
        return [];
    }
  }

  private getSettingsCardKey(section: StrategySettingsSection, entity: StrategyConfigEntity): string {
    return `${section}:${this.trackByCode(0, entity as any)}`;
  }

  private navigateToJournalSettings(item: StrategyScoredItem): void {
    this.router.navigate(['/tabs/market-settings'], {
      queryParams: {
        tab: 'journal',
      },
      state: {
        strategyJournalPrefill: item,
      },
    });
  }

  private prefillJournalFromScoreItem(item: StrategyScoredItem): void {
    const suggestion = this.buildJournalSuggestion(item);
    this.journalSuggestion = suggestion;
    this.editingJournalId = null;
    this.journalForm = {
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

  private buildJournalSuggestion(item: StrategyScoredItem): StrategyJournalSuggestion {
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

    const primaryCandle = this.getPrimaryCandlestickSignal(item);
    const reasons = [
      item.formulaVerdict?.headline ? `Formula verdict: ${item.formulaVerdict.headline}.` : '',
      item.formulaVerdict?.summary || '',
      `Winning Score ${item.winningScore.toFixed(2)} theo profile hiện tại.`,
      volume?.smartMoneyInflow ? 'Smart Money Inflow đang bật.' : 'Smart Money Inflow chưa xác nhận.',
      primaryCandle !== 'strategyHub.state.none' ? `Mẫu nến chính: ${primaryCandle}.` : 'Chưa có mẫu nến chính nổi bật.',
      execution?.probeBuy30 ? 'Execution engine cho phép mua thăm dò 30%.' : '',
      execution?.addBuy70 ? 'Execution engine cho phép mua gia tăng 70%.' : '',
      execution?.standAside ? 'Execution engine đang khuyến nghị đứng ngoài.' : '',
      execution?.takeProfitSignal ? 'Execution engine đang phát hiện tín hiệu chốt lời.' : '',
      ...(execution?.rationale || []).slice(0, 3),
    ].filter(Boolean);

    const strategyName =
      execution?.takeProfitSignal ? 'Exit by Volume Divergence' :
      execution?.addBuy70 ? 'Add 70 - Pullback Retest' :
      execution?.probeBuy30 ? 'Buy 30 - Breakout Probe' :
      volume?.noSupply ? 'No Supply Retest' :
      volume?.smartMoneyInflow ? 'Smart Money Inflow Scan' :
      `${this.overview?.activeProfile?.name || 'Strategy'} Review`;

    const psychology =
      execution?.standAside
        ? 'Đứng ngoài và quan sát thêm, tránh FOMO vì setup chưa đủ xác nhận.'
        : tradeSide === 'sell'
          ? 'Chủ động khóa lợi nhuận và bán theo kế hoạch, không nuôi kỳ vọng thêm.'
          : execution?.addBuy70
            ? 'Có thể gia tăng vị thế nhưng vẫn phải giữ kỷ luật stop-loss.'
            : execution?.probeBuy30
              ? 'Chỉ mua thăm dò để kiểm định setup, tránh vào full vị thế quá sớm.'
              : 'Theo dõi kỷ luật và đợi thêm xác nhận trước khi tăng vị thế.';

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
}
