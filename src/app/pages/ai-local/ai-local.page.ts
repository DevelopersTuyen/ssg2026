import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { BackgroundRefreshService } from 'src/app/core/services/background-refresh.service';
import { AppI18nService } from 'src/app/core/i18n/app-i18n.service';
import { PageLoadStateService } from 'src/app/core/services/page-load-state.service';
import {
  AiActivityItem,
  AiAgentChatHistoryItem,
  AiForecastCard,
  AiLocalAnalysisSection,
  AiLocalDataStat,
  AiLocalFinancialMetric,
  AiLocalFinancialReport,
  AiLocalNewsItem,
  AiLocalOverviewResponse,
  AiLocalSymbolOutlook,
  AiLocalStorageStatus,
  AiStatusItem,
  ExchangeTab,
  MarketApiService,
} from 'src/app/core/services/market-api.service';

type LocalTab = 'overview' | 'chat' | 'data';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

interface PromptTemplate {
  key: string;
  titleKey: string;
  descriptionKey: string;
  prompt: string;
}

interface PendingAnalysisJob {
  prompt: string;
  mode: 'manual' | 'auto';
  exchange: ExchangeTab;
  includeFinancialAnalysis: boolean;
}

@Component({
  selector: 'app-ai-local',
  templateUrl: './ai-local.page.html',
  styleUrls: ['./ai-local.page.scss'],
  standalone: false,
})
export class AiLocalPage implements OnInit, OnDestroy {
  private readonly pageLoadKey = 'ai-local';
  private readonly autoAnalyzeStorageKey = 'ai-local.auto-analyze-enabled';
  private readonly financialAnalysisStorageKey = 'ai-local.financial-analysis-enabled';
  readonly newsPageSize = 5;

  selectedTab: LocalTab = 'overview';
  selectedExchange: ExchangeTab = 'HSX';
  currentPrompt = '';
  autoAnalyzeEnabled = false;
  financialAnalysisEnabled = false;
  currentNewsPage = 1;

  loadingOverview = false;
  sendingPrompt = false;
  overviewError = '';

  summaryItems: AiStatusItem[] = [];
  quickPrompts: string[] = [];
  forecastCards: AiForecastCard[] = [];
  recentActivities: AiActivityItem[] = [];
  datasetStats: AiLocalDataStat[] = [];
  focusSymbols: string[] = [];
  newsItems: AiLocalNewsItem[] = [];
  financialReports: AiLocalFinancialReport[] = [];
  symbolOutlooks: AiLocalSymbolOutlook[] = [];
  analysisSections: AiLocalAnalysisSection[] = [];
  cafefStorage: AiLocalStorageStatus | null = null;

  connected = false;
  modelAvailable = false;
  provider = 'ollama';
  model = 'qwen3:8b';

  chatMessages: ChatMessage[] = [];
  contextSummary: AiLocalDataStat[] = [];
  private analysisQueue: PendingAnalysisJob[] = [];
  private backgroundSub?: Subscription;
  private activeView = false;
  private lastAutoAnalysisKey = '';

  readonly promptTemplates: PromptTemplate[] = [
    {
      key: 'market_snapshot',
      titleKey: 'aiLocal.template.marketSnapshot.title',
      descriptionKey: 'aiLocal.template.marketSnapshot.description',
      prompt:
        'Hay phan tich tong quan san dang xem: index, dong tien, top tang, top giam, tin hieu can chu y va du bao ngan han.',
    },
    {
      key: 'watchlist_risk',
      titleKey: 'aiLocal.template.watchlistRisk.title',
      descriptionKey: 'aiLocal.template.watchlistRisk.description',
      prompt:
        'Hay phan tich watchlist hien tai, chi ra ma nao dang manh hon thi truong, ma nao dang co rui ro va canh bao ngan han.',
    },
    {
      key: 'cafef_digest',
      titleKey: 'aiLocal.template.cafefDigest.title',
      descriptionKey: 'aiLocal.template.cafefDigest.description',
      prompt:
        'Hay doc cac tin CafeF moi nhat trong local context, tom tat 3 y chinh va lien he voi nhom co phieu hoac dong tien thi truong.',
    },
    {
      key: 'liquidity_scan',
      titleKey: 'aiLocal.template.liquidityScan.title',
      descriptionKey: 'aiLocal.template.liquidityScan.description',
      prompt:
        'Hay quet cac ma dang hut thanh khoan trong san nay, chi ra ma dang noi bat ve volume va vi sao can theo doi.',
    },
    {
      key: 'symbol_compare',
      titleKey: 'aiLocal.template.symbolCompare.title',
      descriptionKey: 'aiLocal.template.symbolCompare.description',
      prompt:
        'Hay so sanh 2 ma toi dang quan tam trong context hien tai, neu thieu ma cu the thi goi y nhung ma noi bat de so sanh.',
    },
    {
      key: 'trading_plan',
      titleKey: 'aiLocal.template.tradingPlan.title',
      descriptionKey: 'aiLocal.template.tradingPlan.description',
      prompt:
        'Hay tao mot checklist quan sat trong phien gom: index, nhom nganh, watchlist, ma can chu y va tin tuc can doc tiep.',
    },
  ];

  constructor(
    private api: MarketApiService,
    private i18n: AppI18nService,
    private backgroundRefresh: BackgroundRefreshService,
    private pageLoadState: PageLoadStateService
  ) {}

  ngOnInit(): void {
    this.pageLoadState.registerPage(this.pageLoadKey, 'aiLocal.title');
    this.backgroundSub = this.backgroundRefresh.changes$.subscribe((domains) => {
      if (!this.activeView) return;
      if (domains.some((item) => ['quotes', 'intraday', 'news', 'financial'].includes(item))) {
        this.loadOverview(true);
      }
    });
    this.restoreLocalPreferences();
    this.loadOverview();
  }

  ionViewDidEnter(): void {
    this.activeView = true;
    this.pageLoadState.setActivePage(this.pageLoadKey);
  }

  ionViewDidLeave(): void {
    this.activeView = false;
  }

  ngOnDestroy(): void {
    this.backgroundSub?.unsubscribe();
  }

  selectTab(tab: LocalTab): void {
    this.selectedTab = tab;
  }

  onExchangeChange(): void {
    this.loadOverview(false, true, 'doi san giao dich');
  }

  usePrompt(prompt: string): void {
    this.currentPrompt = prompt;
    this.selectedTab = 'chat';
  }

  useTemplate(template: PromptTemplate): void {
    this.usePrompt(template.prompt);
  }

  sendTemplate(template: PromptTemplate): void {
    this.currentPrompt = template.prompt;
    this.sendPrompt();
  }

  onAutoAnalyzeChange(): void {
    localStorage.setItem(this.autoAnalyzeStorageKey, String(this.autoAnalyzeEnabled));
    if (this.autoAnalyzeEnabled && !this.loadingOverview) {
      this.runAutoAnalysis('bat che do tu dong');
    }
  }

  onFinancialAnalysisChange(): void {
    localStorage.setItem(this.financialAnalysisStorageKey, String(this.financialAnalysisEnabled));
    this.loadOverview(false, true, 'doi che do phan tich BCTC');
  }

  refreshOverview(): void {
    this.loadOverview(false, true, 'lam moi du lieu');
  }

  sendPrompt(): void {
    const text = this.currentPrompt.trim();
    if (!text) return;
    this.currentPrompt = '';
    this.selectedTab = 'chat';
    this.enqueueAnalysis(text, 'manual');
  }

  trackByLabel(_: number, item: AiStatusItem | AiLocalDataStat | AiLocalFinancialMetric): string {
    return item.label;
  }

  trackByText(_: number, item: AiActivityItem): string {
    return `${item.time}-${item.text}`;
  }

  trackByPrompt(_: number, item: string): string {
    return item;
  }

  trackByTemplate(_: number, item: PromptTemplate): string {
    return item.key;
  }

  trackByForecast(_: number, item: AiForecastCard): string {
    return `${item.title}-${item.direction}`;
  }

  trackBySection(_: number, item: AiLocalAnalysisSection): string {
    return item.title;
  }

  trackByFinancialReport(_: number, item: AiLocalFinancialReport): string {
    return item.symbol;
  }

  trackBySymbolOutlook(_: number, item: AiLocalSymbolOutlook): string {
    return item.symbol;
  }

  trackByNews(_: number, item: AiLocalNewsItem): string {
    return `${item.source}-${item.title}`;
  }

  trackByChat(_: number, item: ChatMessage): string {
    return `${item.role}-${item.time}-${item.content}`;
  }

  get pagedNewsItems(): AiLocalNewsItem[] {
    const start = (this.currentNewsPage - 1) * this.newsPageSize;
    return this.newsItems.slice(start, start + this.newsPageSize);
  }

  get totalNewsPages(): number {
    return Math.max(1, Math.ceil(this.newsItems.length / this.newsPageSize));
  }

  get newsRangeLabel(): string {
    if (!this.newsItems.length) {
      return '0/0';
    }
    const end = Math.min(this.currentNewsPage * this.newsPageSize, this.newsItems.length);
    return `${end}/${this.newsItems.length}`;
  }

  get pendingAnalysisCount(): number {
    return this.analysisQueue.length;
  }

  statusToneClass(item: AiStatusItem): string {
    if (item.tone === 'positive') return 'positive';
    if (item.tone === 'warning') return 'warning';
    return 'default';
  }

  directionClass(item: AiForecastCard): string {
    return item.direction;
  }

  goToNewsPage(page: number): void {
    this.currentNewsPage = Math.min(Math.max(page, 1), this.totalNewsPages);
  }

  private loadOverview(
    silent = false,
    triggerAutoAnalysis = false,
    autoReason = 'lam moi du lieu'
  ): void {
    if (!silent) {
      this.loadingOverview = true;
      this.pageLoadState.start(this.pageLoadKey);
    } else {
      this.pageLoadState.startBackground(this.pageLoadKey);
    }
    this.overviewError = '';

    this.api
      .getAiLocalOverview(this.selectedExchange, {
        includeFinancialAnalysis: this.financialAnalysisEnabled,
      })
      .subscribe({
      next: (res) => {
        const data = res.data;
        if (!data) {
          this.overviewError = this.t('aiLocal.error.noOverview');
          this.loadingOverview = false;
          this.pageLoadState.fail(this.pageLoadKey, this.overviewError);
          return;
        }

        this.applyOverview(data);
        this.loadingOverview = false;
        this.pageLoadState.finish(this.pageLoadKey);
        if (triggerAutoAnalysis) {
          this.runAutoAnalysis(autoReason);
        }
      },
      error: () => {
        this.overviewError = this.t('aiLocal.error.backend');
        this.loadingOverview = false;
        this.pageLoadState.fail(this.pageLoadKey, this.overviewError);
      },
    });
  }

  private applyOverview(data: AiLocalOverviewResponse): void {
    this.summaryItems = data.summary_items || [];
    this.quickPrompts = data.quick_prompts || [];
    this.forecastCards = data.forecast_cards || [];
    this.recentActivities = data.recent_activities || [];
    this.datasetStats = data.dataset_stats || [];
    this.focusSymbols = data.focus_symbols || [];
    this.newsItems = data.news_items || [];
    this.currentNewsPage = 1;
    this.financialReports = data.financial_reports || [];
    this.symbolOutlooks = data.symbol_outlooks || [];
    this.analysisSections = data.analysis_sections || [];
    this.cafefStorage = data.cafef_storage || null;
    this.connected = data.connected;
    this.modelAvailable = data.model_available;
    this.provider = data.provider;
    this.model = data.model;
    this.contextSummary = data.dataset_stats || [];

    if (this.chatMessages.length === 0) {
      const firstTime =
        this.summaryItems.find((item) => item.label.toLowerCase().includes('trang thai'))?.value || '--:--';
      this.chatMessages = [
        {
          role: 'assistant',
          content: data.assistant_greeting,
          time: firstTime,
        },
      ];
    }
  }

  private restoreLocalPreferences(): void {
    this.autoAnalyzeEnabled = localStorage.getItem(this.autoAnalyzeStorageKey) === 'true';
    this.financialAnalysisEnabled = localStorage.getItem(this.financialAnalysisStorageKey) === 'true';
  }

  private runAutoAnalysis(reason: string): void {
    if (!this.autoAnalyzeEnabled) return;
    const nextKey = `${this.selectedExchange}:${this.financialAnalysisEnabled ? 1 : 0}:${reason}`;
    if (this.lastAutoAnalysisKey === nextKey && (this.sendingPrompt || this.analysisQueue.some((item) => item.mode === 'auto'))) {
      return;
    }
    this.lastAutoAnalysisKey = nextKey;

    const prompt = this.financialAnalysisEnabled
      ? `Hay tu dong phan tich toan bo bo du lieu local hien co cho san ${this.selectedExchange}. ` +
        `Can bao gom: index, dong tien, top tang, top giam, watchlist, focus symbols, tin CafeF, ` +
        `bao cao tai chinh va du bao ngan han cho cac ma dang duoc focus. Ngu canh kich hoat: ${reason}.`
      : `Hay tu dong phan tich toan bo bo du lieu local hien co cho san ${this.selectedExchange}. ` +
        `Can bao gom: index, dong tien, top tang, top giam, watchlist, focus symbols, tin CafeF, ` +
        `cac rui ro can theo doi va du bao ngan han. Ngu canh kich hoat: ${reason}.`;
    this.enqueueAnalysis(prompt, 'auto');
  }

  private enqueueAnalysis(prompt: string, mode: 'manual' | 'auto'): void {
    const job: PendingAnalysisJob = {
      prompt,
      mode,
      exchange: this.selectedExchange,
      includeFinancialAnalysis: this.financialAnalysisEnabled,
    };

    if (mode === 'auto') {
      const existingAutoIndex = this.analysisQueue.findIndex((item) => item.mode === 'auto');
      if (existingAutoIndex >= 0) {
        this.analysisQueue[existingAutoIndex] = job;
      } else {
        this.analysisQueue.push(job);
      }
    } else {
      this.analysisQueue.push(job);
      this.chatMessages = [
        ...this.chatMessages,
        {
          role: 'user',
          content: prompt,
          time: this.formatNow(),
        },
      ];
    }

    this.processNextAnalysis();
  }

  private processNextAnalysis(): void {
    if (this.sendingPrompt || !this.analysisQueue.length) return;

    const job = this.analysisQueue.shift();
    if (!job) return;

    if (job.mode === 'auto') {
      this.chatMessages = [
        ...this.chatMessages,
        {
          role: 'user',
          content: job.prompt,
          time: this.formatNow(),
        },
      ];
    }

    const history: AiAgentChatHistoryItem[] = this.chatMessages.slice(-8).map((item) => ({
      role: item.role,
      content: item.content,
    }));

    this.sendingPrompt = true;
    this.selectedTab = 'chat';

    this.api
      .chatWithAiLocal({
        prompt: job.prompt,
        exchange: job.exchange,
        history,
        include_financial_analysis: job.includeFinancialAnalysis,
      })
      .subscribe({
        next: (res) => {
          const data = res.data;
          const message = data?.message;

          this.contextSummary = data?.context_summary || this.contextSummary;
          this.connected = data?.connected ?? this.connected;
          this.modelAvailable = data?.model_available ?? this.modelAvailable;
          this.provider = data?.provider || this.provider;
          this.model = data?.model || this.model;

          this.chatMessages = [
            ...this.chatMessages,
            {
              role: 'assistant',
              content: message?.content || this.t('aiLocal.error.noReply'),
              time: message?.time || this.formatNow(),
            },
          ];

          this.sendingPrompt = false;
          this.processNextAnalysis();
        },
        error: () => {
          this.chatMessages = [
            ...this.chatMessages,
            {
              role: 'assistant',
              content: this.t('aiLocal.error.connect'),
              time: this.formatNow(),
            },
          ];
          this.sendingPrompt = false;
          this.processNextAnalysis();
        },
      });
  }

  private formatNow(): string {
    const now = new Date();
    const hh = `${now.getHours()}`.padStart(2, '0');
    const mm = `${now.getMinutes()}`.padStart(2, '0');
    return `${hh}:${mm}`;
  }

  getTemplateTitle(item: PromptTemplate): string {
    return this.t(item.titleKey);
  }

  getTemplateDescription(item: PromptTemplate): string {
    return this.t(item.descriptionKey);
  }

  private t(key: string): string {
    return this.i18n.translate(key);
  }
}
