import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';

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
  StrategyRiskOverviewResponse,
  StrategyScreenRule,
  StrategyScoredItem,
  MarketApiService,
} from 'src/app/core/services/market-api.service';

type StrategyTab = 'overview' | 'screener' | 'scoring' | 'risk' | 'journal';
type StrategyConfigEntity = StrategyFormula | StrategyScreenRule | StrategyAlertRule | StrategyChecklistItem;
type StrategySettingsSection = 'profiles' | 'formulas' | 'screenRules' | 'alertRules' | 'checklists' | 'versions';

interface StrategyVariableHint {
  key: string;
  label: string;
  description: string;
  kind: 'metric' | 'parameter' | 'formula';
}

const VARIABLE_HINTS: Record<string, StrategyVariableHint> = {
  Q: { key: 'Q', label: 'Q Score', description: 'Điểm chất lượng doanh nghiệp/độ khỏe của mã.', kind: 'formula' },
  L: { key: 'L', label: 'L Score', description: 'Điểm leadership và mức độ đi cùng xu hướng thị trường.', kind: 'formula' },
  M: { key: 'M', label: 'M Score', description: 'Điểm động lực và xác nhận breakout.', kind: 'formula' },
  P: { key: 'P', label: 'P Score', description: 'Hệ số giá/rủi ro dùng làm mẫu số giảm bớt hưng phấn mua đuổi.', kind: 'formula' },
  liquidity_score: { key: 'liquidity_score', label: 'Điểm thanh khoản', description: 'Mức dễ vào/ra lệnh dựa trên giá trị giao dịch.', kind: 'metric' },
  stability_score: { key: 'stability_score', label: 'Điểm ổn định giá', description: 'Giá biến động càng ổn định thì điểm càng cao.', kind: 'metric' },
  news_score: { key: 'news_score', label: 'Điểm tin tức', description: 'Mức độ được nhắc tới trong luồng tin hiện tại.', kind: 'metric' },
  watchlist_bonus: { key: 'watchlist_bonus', label: 'Điểm ưu tiên watchlist', description: 'Thưởng điểm nếu mã nằm trong danh sách theo dõi.', kind: 'metric' },
  leadership_score: { key: 'leadership_score', label: 'Điểm dẫn dắt', description: 'Khả năng dẫn dòng tiền và nổi bật trong sàn.', kind: 'metric' },
  market_trend_score: { key: 'market_trend_score', label: 'Điểm xu hướng sàn', description: 'Sức khỏe của sàn giao dịch mà mã đang thuộc về.', kind: 'metric' },
  volume_score: { key: 'volume_score', label: 'Điểm volume', description: 'Mức thanh khoản tương đối so với universe.', kind: 'metric' },
  momentum_score: { key: 'momentum_score', label: 'Điểm động lượng giá', description: 'Độ mạnh của % tăng/giảm hiện tại.', kind: 'metric' },
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

@Component({
  selector: 'app-strategy-hub',
  templateUrl: './strategy-hub.page.html',
  styleUrls: ['./strategy-hub.page.scss'],
  standalone: false,
})
export class StrategyHubPage implements OnInit {
  readonly expressionOperatorGroups = EXPRESSION_OPERATOR_GROUPS;
  selectedTab: StrategyTab = 'overview';
  selectedSettingsSection: StrategySettingsSection = 'formulas';
  expandedSettingsCardKey = '';
  loading = false;
  saving = false;
  publishing = false;
  error = '';
  message = '';

  overview: StrategyOverviewResponse | null = null;
  profiles: StrategyProfile[] = [];
  activeProfileId: number | null = null;
  config: StrategyProfileConfigResponse | null = null;
  rankings: StrategyPagedResponse | null = null;
  screener: StrategyPagedResponse | null = null;
  risk: StrategyRiskOverviewResponse | null = null;
  journal: StrategyJournalEntry[] = [];
  selectedScoreItem: StrategyScoredItem | null = null;

  scoringExchange = 'ALL';
  scoringKeyword = '';
  scoringWatchlistOnly = false;
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
    trade_side: 'buy',
    entry_price: null as number | null,
    exit_price: null as number | null,
    stop_loss_price: null as number | null,
    position_size: null as number | null,
    notes: '',
    mistake_tags_json: [] as string[],
  };

  constructor(private api: MarketApiService) {}

  ngOnInit(): void {
    this.loadOverview();
  }

  selectTab(tab: StrategyTab): void {
    this.selectedTab = tab;
  }

  loadOverview(): void {
    this.loading = true;
    this.error = '';
    this.message = '';

    this.api.getStrategyOverview(this.activeProfileId || undefined).subscribe({
      next: (response) => {
        this.loading = false;
        if (!response.data) {
          this.error = 'Backend strategy chưa trả dữ liệu.';
          return;
        }

        this.overview = response.data;
        this.profiles = response.data.profiles || [];
        this.activeProfileId = response.data.activeProfile?.id || null;
        this.rankings = response.data.rankings || null;
        this.screener = response.data.screener || null;
        this.risk = response.data.risk || null;
        this.journal = response.data.journal || [];
        this.selectedScoreItem = this.rankings?.items?.[0] || null;
      },
      error: () => {
        this.loading = false;
        this.error = 'Không tải được Strategy Hub.';
      },
    });
  }

  onProfileChange(): void {
    if (!this.activeProfileId) return;
    this.loadOverview();
  }

  loadConfig(profileId: number): void {
    this.api.getStrategyProfileConfig(profileId).subscribe({
      next: (response) => {
        this.config = response.data || null;
        this.ensureSettingsExpansion();
      },
    });
  }

  reloadScoring(): void {
    if (!this.activeProfileId) return;
    this.api
      .getStrategyRankings({
        profileId: this.activeProfileId,
        exchange: this.scoringExchange !== 'ALL' ? this.scoringExchange : undefined,
        keyword: this.scoringKeyword || undefined,
        watchlistOnly: this.scoringWatchlistOnly,
        page: 1,
        pageSize: 24,
      })
      .subscribe({
        next: (response) => {
          this.rankings = response.data || null;
          this.selectedScoreItem = this.rankings?.items?.[0] || null;
        },
      });
  }

  reloadScreener(): void {
    if (!this.activeProfileId) return;
    this.api
      .runStrategyScreener({
        profileId: this.activeProfileId,
        exchange: this.screenerExchange !== 'ALL' ? this.screenerExchange : undefined,
        keyword: this.screenerKeyword || undefined,
        watchlistOnly: this.screenerWatchlistOnly,
        page: 1,
        pageSize: 24,
      })
      .subscribe({
        next: (response) => {
          this.screener = response.data || null;
        },
      });
  }

  reloadRisk(): void {
    if (!this.activeProfileId) return;
    this.api.getStrategyRiskOverview(this.activeProfileId).subscribe({
      next: (response) => {
        this.risk = response.data || null;
      },
    });
  }

  refreshData(): void {
    if (!this.activeProfileId) {
      this.loadOverview();
      return;
    }

    this.loading = true;
    forkJoin({
      overview: this.api.getStrategyOverview(this.activeProfileId),
      rankings: this.api.getStrategyRankings({
        profileId: this.activeProfileId,
        exchange: this.scoringExchange !== 'ALL' ? this.scoringExchange : undefined,
        keyword: this.scoringKeyword || undefined,
        watchlistOnly: this.scoringWatchlistOnly,
        page: 1,
        pageSize: 24,
      }),
      screener: this.api.runStrategyScreener({
        profileId: this.activeProfileId,
        exchange: this.screenerExchange !== 'ALL' ? this.screenerExchange : undefined,
        keyword: this.screenerKeyword || undefined,
        watchlistOnly: this.screenerWatchlistOnly,
        page: 1,
        pageSize: 24,
      }),
      risk: this.api.getStrategyRiskOverview(this.activeProfileId),
      journal: this.api.listStrategyJournal(12),
    }).subscribe({
      next: ({ overview, rankings, screener, risk, journal }) => {
        this.loading = false;
        this.overview = overview.data || this.overview;
        this.rankings = rankings.data || this.rankings;
        this.screener = screener.data || this.screener;
        this.risk = risk.data || this.risk;
        this.journal = journal.data || this.journal;
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
    this.api
      .createStrategyJournal({
        profile_id: this.activeProfileId,
        symbol: this.journalForm.symbol.trim().toUpperCase(),
        trade_side: this.journalForm.trade_side,
        entry_price: this.journalForm.entry_price,
        exit_price: this.journalForm.exit_price,
        stop_loss_price: this.journalForm.stop_loss_price,
        position_size: this.journalForm.position_size,
        notes: this.journalForm.notes,
        mistake_tags_json: this.journalForm.mistake_tags_json,
      })
      .subscribe({
        next: (response) => {
          if (!response.data) {
            this.error = 'Không lưu được journal.';
            return;
          }
          this.message = 'Đã thêm nhật ký giao dịch.';
          this.journalForm = {
            symbol: '',
            trade_side: 'buy',
            entry_price: null,
            exit_price: null,
            stop_loss_price: null,
            position_size: null,
            notes: '',
            mistake_tags_json: [],
          };
          this.refreshData();
        },
      });
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

    const nextCaret = before.length + token.length;
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(nextCaret, nextCaret);
    });
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
}
