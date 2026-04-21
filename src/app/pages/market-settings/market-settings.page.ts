import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AppI18nService } from 'src/app/core/i18n/app-i18n.service';
import { AuthService } from 'src/app/core/services/auth.service';
import {
  MarketApiService,
  MarketSettingsData,
  MarketSyncJobStatus,
  MarketSyncStatusData,
  StrategyAlertRule,
  StrategyChecklistItem,
  StrategyFormula,
  StrategyParameter,
  StrategyProfile,
  StrategyProfileConfigResponse,
  StrategyScreenRule,
} from 'src/app/core/services/market-api.service';

type SettingsTab = 'general' | 'display' | 'alerts' | 'data' | 'ai' | 'strategy' | 'security';
type StrategyConfigEntity = StrategyFormula | StrategyScreenRule | StrategyAlertRule | StrategyChecklistItem;
type StrategySettingsSection = 'profiles' | 'formulas' | 'screenRules' | 'alertRules' | 'checklists' | 'versions';

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
  selector: 'app-market-settings',
  templateUrl: './market-settings.page.html',
  styleUrls: ['./market-settings.page.scss'],
  standalone: false,
})
export class MarketSettingsPage implements OnInit {
  readonly expressionOperatorGroups = EXPRESSION_OPERATOR_GROUPS;

  selectedTab: SettingsTab = 'general';
  loading = false;
  saving = false;
  message = '';
  error = '';
  settings!: MarketSettingsData;
  syncStatus: MarketSyncStatusData = this.buildEmptySyncStatus();

  strategyLoading = false;
  strategySaving = false;
  strategyPublishing = false;
  strategyMessage = '';
  strategyError = '';
  strategyProfiles: StrategyProfile[] = [];
  activeStrategyProfileId: number | null = null;
  strategyConfig: StrategyProfileConfigResponse | null = null;
  strategySavedSnapshot = '';
  selectedStrategySection: StrategySettingsSection = 'formulas';
  expandedStrategyCardKey = '';
  newStrategyProfile = {
    code: '',
    name: '',
    description: '',
  };

  readonly tabs: SettingsTabItem[] = [
    { key: 'general', labelKey: 'settings.tabs.general', helperKey: 'settings.tabs.generalHelp' },
    { key: 'display', labelKey: 'settings.tabs.display', helperKey: 'settings.tabs.displayHelp' },
    { key: 'alerts', labelKey: 'settings.tabs.alerts', helperKey: 'settings.tabs.alertsHelp' },
    { key: 'data', labelKey: 'settings.tabs.data', helperKey: 'settings.tabs.dataHelp' },
    { key: 'ai', labelKey: 'settings.tabs.ai', helperKey: 'settings.tabs.aiHelp' },
    { key: 'strategy', labelKey: 'Strategy', helperKey: 'Cong thuc, rule, checklist va version' },
    { key: 'security', labelKey: 'settings.tabs.security', helperKey: 'settings.tabs.securityHelp' },
  ];

  constructor(
    private api: MarketApiService,
    private auth: AuthService,
    private router: Router,
    private i18n: AppI18nService
  ) {
    this.settings = this.buildEmptySettings();
  }

  ngOnInit(): void {
    this.loadSettings();
    this.loadStrategyOverview();
  }

  selectTab(tab: SettingsTab): void {
    this.selectedTab = tab;
    if (tab === 'strategy' && !this.strategyConfig && !this.strategyLoading) {
      this.loadStrategyOverview();
    }
  }

  loadSettings(): void {
    this.loading = true;
    this.error = '';
    this.message = '';
    this.loadSyncStatus();

    this.api.getMySettings().subscribe({
      next: (response) => {
        if (!response.data) {
          this.error = this.i18n.translate('settings.loadFailed');
        } else {
          this.settings = response.data;
          this.auth.cacheSettings(response.data);
        }
        this.loading = false;
      },
      error: () => {
        this.error = this.i18n.translate('settings.loadFailed');
        this.loading = false;
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
        this.settings = response.data;
        this.auth.cacheSettings(response.data);
        this.message = this.i18n.translate('settings.saved');
      },
      error: () => {
        this.saving = false;
        this.error = this.i18n.translate('settings.saveFailed');
      },
    });
  }

  loadSyncStatus(): void {
    this.api.getSyncStatus().subscribe({
      next: (response) => {
        if (response.data) {
          this.syncStatus = response.data;
        }
      },
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
        this.settings = response.data;
        this.auth.cacheSettings(response.data);
        this.message = this.i18n.translate('settings.resetDone');
      },
      error: () => {
        this.saving = false;
        this.error = this.i18n.translate('settings.resetFailed');
      },
    });
  }

  loadStrategyOverview(): void {
    this.strategyLoading = true;
    this.strategyError = '';
    this.strategyMessage = '';

    this.api.getStrategyOverview(this.activeStrategyProfileId || undefined).subscribe({
      next: (response) => {
        this.strategyLoading = false;
        if (!response.data) {
          this.strategyError = 'Khong tai duoc cau hinh strategy.';
          return;
        }

        this.strategyProfiles = response.data.profiles || [];
        this.activeStrategyProfileId = response.data.activeProfile?.id || this.strategyProfiles[0]?.id || null;

        if (this.activeStrategyProfileId) {
          this.loadStrategyConfig(this.activeStrategyProfileId);
        } else {
          this.strategyConfig = null;
        }
      },
      error: () => {
        this.strategyLoading = false;
        this.strategyError = 'Khong tai duoc Strategy settings.';
      },
    });
  }

  onStrategyProfileChange(): void {
    if (!this.activeStrategyProfileId) {
      return;
    }
    this.loadStrategyConfig(this.activeStrategyProfileId);
  }

  get hasUnsavedStrategyChanges(): boolean {
    if (!this.strategyConfig || !this.strategySavedSnapshot) {
      return false;
    }
    return this.strategySavedSnapshot !== this.serializeStrategyConfig(this.strategyConfig);
  }

  loadStrategyConfig(profileId: number): void {
    this.strategyLoading = true;
    this.strategyError = '';

    this.api.getStrategyProfileConfig(profileId).subscribe({
      next: (response) => {
        this.strategyLoading = false;
        this.strategyConfig = response.data || null;
        this.strategySavedSnapshot = this.strategyConfig ? this.serializeStrategyConfig(this.strategyConfig) : '';
        this.ensureStrategyExpansion();
      },
      error: () => {
        this.strategyLoading = false;
        this.strategyError = 'Khong tai duoc strategy config.';
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
        this.strategySavedSnapshot = this.serializeStrategyConfig(this.strategyConfig);
        this.ensureStrategyExpansion();
        this.strategyMessage = navigateAfterSave
          ? 'Da luu va ap dung config. Dang mo Strategy Hub...'
          : 'Da luu strategy settings.';
        if (navigateAfterSave) {
          this.navigateToStrategyHub();
        }
      },
      error: () => {
        this.strategySaving = false;
        this.strategyError = 'Luu strategy settings that bai.';
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
          this.strategyError = 'Khong publish duoc version.';
          return;
        }
        this.strategyMessage = `Da publish version #${response.data.versionNo}.`;
        this.loadStrategyConfig(this.activeStrategyProfileId!);
      },
      error: () => {
        this.strategyPublishing = false;
        this.strategyError = 'Publish strategy that bai.';
      },
    });
  }

  createStrategyProfile(): void {
    if (!this.newStrategyProfile.code.trim() || !this.newStrategyProfile.name.trim()) {
      this.strategyError = 'Can nhap code va ten profile.';
      return;
    }

    this.api.createStrategyProfile(this.newStrategyProfile).subscribe({
      next: (response) => {
        if (!response.data) {
          this.strategyError = 'Khong tao duoc profile.';
          return;
        }
        this.newStrategyProfile = { code: '', name: '', description: '' };
        this.strategyMessage = 'Da tao profile moi.';
        this.loadStrategyOverview();
      },
      error: () => {
        this.strategyError = 'Tao profile that bai.';
      },
    });
  }

  activateStrategyProfile(profile: StrategyProfile): void {
    this.api.activateStrategyProfile(profile.id).subscribe({
      next: (response) => {
        if (!response.data) {
          this.strategyError = 'Khong kich hoat duoc profile.';
          return;
        }
        this.activeStrategyProfileId = response.data.id;
        this.strategyMessage = `Da chuyen sang profile ${response.data.name}.`;
        this.loadStrategyOverview();
      },
      error: () => {
        this.strategyError = 'Kich hoat profile that bai.';
      },
    });
  }

  selectStrategySection(section: StrategySettingsSection): void {
    this.selectedStrategySection = section;
    this.ensureStrategyExpansion();
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
      return 0;
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
      case 'versions':
        return this.strategyConfig.versions.length;
      default:
        return 0;
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
      return 'Chua dat';
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

  onLanguageChange(): void {
    this.i18n.setLanguage(this.settings.language);
  }

  logout(): void {
    const confirmed = window.confirm(this.i18n.translate('settings.logoutConfirm'));
    if (!confirmed) {
      return;
    }

    this.auth.logout();
    this.router.navigateByUrl('/login');
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

  private getStrategyCardKey(section: StrategySettingsSection, entity: StrategyConfigEntity): string {
    return `${section}:${this.trackByStrategyCode(0, entity as any)}`;
  }

  private serializeStrategyConfig(config: StrategyProfileConfigResponse): string {
    return JSON.stringify(config);
  }

  private navigateToStrategyHub(): void {
    this.router.navigateByUrl('/tabs/strategy-hub');
  }

  private buildEmptySettings(): MarketSettingsData {
    return {
      language: 'vi',
      defaultExchange: 'HSX',
      defaultLandingPage: 'market-watch',
      defaultTimeRange: '1d',
      startupPage: 'dashboard',
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
      safeMode: true,
      biometricLogin: false,
      sessionTimeout: '30',
      deviceBinding: true,
    };
  }

  private buildEmptySyncStatus(): MarketSyncStatusData {
    const emptyJob = (): MarketSyncJobStatus => ({
      status: 'idle',
      startedAt: null,
      finishedAt: null,
      message: null,
      batchIndex: null,
      totalBatches: null,
      remainingBatches: null,
      itemsInBatch: null,
      itemsResolved: null,
    });

    return {
      quotes: emptyJob(),
      intraday: emptyJob(),
      indexDaily: emptyJob(),
      seedSymbols: emptyJob(),
      news: emptyJob(),
      checkedAt: null,
    };
  }
}
