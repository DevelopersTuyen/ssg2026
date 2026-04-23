import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { BackgroundRefreshService } from 'src/app/core/services/background-refresh.service';
import { AppI18nService } from 'src/app/core/i18n/app-i18n.service';
import { PageLoadStateService } from 'src/app/core/services/page-load-state.service';
import {
  AiActivityItem,
  AiAgentChatHistoryItem,
  AiAgentOverviewResponse,
  AiForecastCard,
  AiSkillItem,
  AiStatusItem,
  AiTaskItem,
  ExchangeTab,
  MarketApiService,
} from 'src/app/core/services/market-api.service';

type AiTab = 'dashboard' | 'chat' | 'tasks' | 'skills' | 'history';

interface AiTabItem {
  key: AiTab;
  label: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

@Component({
  selector: 'app-ai-agent',
  templateUrl: './ai-agent.page.html',
  styleUrls: ['./ai-agent.page.scss'],
  standalone: false,
})
export class AiAgentPage implements OnInit, OnDestroy {
  private readonly pageLoadKey = 'ai-agent';
  private backgroundSub?: Subscription;
  private activeView = false;

  selectedTab: AiTab = 'dashboard';
  selectedExchange: ExchangeTab = 'HSX';
  currentPrompt = '';

  loadingOverview = false;
  sendingPrompt = false;
  overviewError = '';

  summaryItems: AiStatusItem[] = [
    { label: 'Model', value: 'gemini-2.5-flash', tone: 'default' },
    { label: 'Status', value: 'Waiting for backend', tone: 'warning' },
    { label: 'Watchlist in scope', value: '0 symbols', tone: 'default' },
    { label: 'Last run', value: '--:--', tone: 'default' },
    { label: 'AI alerts today', value: '0 signals', tone: 'default' },
    { label: 'Summaries created', value: '0 items', tone: 'default' },
  ];
  backendQuickPrompts: string[] = [];

  forecastCards: AiForecastCard[] = [];
  recentActivities: AiActivityItem[] = [];
  tasks: AiTaskItem[] = [];
  skills: AiSkillItem[] = [];
  historyItems: AiActivityItem[] = [];

  chatMessages: ChatMessage[] = [
    {
      role: 'assistant',
      content: 'AI Agent is waiting for backend and Gemini to analyze your market data.',
      time: '--:--',
    },
  ];

  constructor(
    private api: MarketApiService,
    private i18n: AppI18nService,
    private backgroundRefresh: BackgroundRefreshService,
    private pageLoadState: PageLoadStateService
  ) {}

  get tabs(): AiTabItem[] {
    return [
      { key: 'dashboard', label: this.t('aiAgent.tab.overview') },
      { key: 'chat', label: this.t('aiAgent.tab.chat') },
      { key: 'tasks', label: this.t('aiAgent.tab.tasks') },
      { key: 'skills', label: this.t('aiAgent.tab.skills') },
      { key: 'history', label: this.t('aiAgent.tab.history') },
    ];
  }

  get quickPrompts(): string[] {
    return this.backendQuickPrompts.length
      ? this.backendQuickPrompts
      : [
      this.t('aiAgent.prompt.marketToday'),
      this.t('aiAgent.prompt.watchlistWeak'),
      this.t('aiAgent.prompt.topGainer'),
      this.t('aiAgent.prompt.bankNews'),
      this.t('aiAgent.prompt.volumeSpike'),
      this.t('aiAgent.prompt.compare'),
    ];
  }

  ngOnInit(): void {
    this.pageLoadState.registerPage(this.pageLoadKey, 'tabs.aiAgent');
    this.backgroundSub = this.backgroundRefresh.changes$.subscribe((domains) => {
      if (!this.activeView) return;
      if (domains.some((item) => ['quotes', 'intraday', 'news', 'financial'].includes(item))) {
        this.loadOverview(true);
      }
    });
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

  selectTab(tab: AiTab): void {
    this.selectedTab = tab;
  }

  usePrompt(prompt: string): void {
    this.currentPrompt = prompt;
    this.selectedTab = 'chat';
  }

  refreshOverview(): void {
    this.loadOverview();
  }

  sendPrompt(): void {
    const text = this.currentPrompt.trim();
    if (!text || this.sendingPrompt) return;

    const history: AiAgentChatHistoryItem[] = this.chatMessages.slice(-8).map((item) => ({
      role: item.role,
      content: item.content,
    }));

    this.chatMessages = [
      ...this.chatMessages,
      {
        role: 'user',
        content: text,
        time: this.formatNow(),
      },
    ];

    this.currentPrompt = '';
    this.sendingPrompt = true;
    this.selectedTab = 'chat';

    this.api
      .chatWithAiAgent({
        prompt: text,
        exchange: this.selectedExchange,
        history,
      })
      .subscribe({
        next: (res) => {
          const message = res.data?.message;

          this.chatMessages = [
            ...this.chatMessages,
            {
              role: 'assistant',
              content:
                message?.content ||
                this.t('aiAgent.error.noReply'),
              time: message?.time || this.formatNow(),
            },
          ];

          this.sendingPrompt = false;
        },
        error: () => {
          this.chatMessages = [
            ...this.chatMessages,
            {
              role: 'assistant',
              content: this.t('aiAgent.error.send'),
              time: this.formatNow(),
            },
          ];
          this.sendingPrompt = false;
        },
      });
  }

  trackStatus(_: number, item: AiStatusItem): string {
    return item.label;
  }

  trackActivity(_: number, item: AiActivityItem): string {
    return `${item.time}-${item.text}`;
  }

  trackTask(_: number, item: AiTaskItem): string {
    return item.name;
  }

  trackSkill(_: number, item: AiSkillItem): string {
    return item.title;
  }

  trackChat(_: number, item: ChatMessage): string {
    return `${item.role}-${item.time}-${item.content}`;
  }

  trackPrompt(_: number, item: string): string {
    return item;
  }

  trackForecast(_: number, item: AiForecastCard): string {
    return `${item.title}-${item.direction}`;
  }

  statusValueClass(item: AiStatusItem): string {
    if (item.tone === 'positive') return 'text-success';
    if (item.tone === 'warning') return 'text-warning';
    return '';
  }

  forecastBadgeClass(item: AiForecastCard): string {
    if (item.direction === 'up') return 'up';
    if (item.direction === 'down') return 'down';
    return 'neutral';
  }

  private loadOverview(silent = false): void {
    if (!silent) {
      this.loadingOverview = true;
      this.pageLoadState.start(this.pageLoadKey);
    } else {
      this.pageLoadState.startBackground(this.pageLoadKey);
    }
    this.overviewError = '';

    this.api.getAiAgentOverview(this.selectedExchange).subscribe({
      next: (res) => {
        const data = res.data;

        if (!data) {
          this.overviewError = this.t('aiAgent.error.noOverview');
          this.loadingOverview = false;
          return;
        }

        this.applyOverview(data);
        this.loadingOverview = false;
        this.pageLoadState.finish(this.pageLoadKey);
      },
      error: () => {
        this.overviewError = this.t('aiAgent.error.connect');
        this.loadingOverview = false;
        this.pageLoadState.fail(this.pageLoadKey, this.overviewError);
      },
    });
  }

  private applyOverview(data: AiAgentOverviewResponse): void {
    this.summaryItems = data.summary_items || this.summaryItems;
    this.backendQuickPrompts = data.quick_prompts || this.backendQuickPrompts;
    this.forecastCards = data.forecast_cards || [];
    this.recentActivities = data.recent_activities || [];
    this.tasks = data.tasks || [];
    this.skills = data.skills || [];
    this.historyItems = data.history || [];

    if (this.shouldReplaceGreeting()) {
      const lastRun =
        this.summaryItems.find((item) => item.label.toLowerCase().includes('chay'))?.value || '--:--';
      this.chatMessages = [
        {
          role: 'assistant',
          content: data.assistant_greeting,
          time: lastRun,
        },
      ];
    }
  }

  private shouldReplaceGreeting(): boolean {
    return (
      this.chatMessages.length === 0 ||
      (this.chatMessages.length === 1 && this.chatMessages[0].role === 'assistant')
    );
  }

  private formatNow(): string {
    const now = new Date();
    const hh = `${now.getHours()}`.padStart(2, '0');
    const mm = `${now.getMinutes()}`.padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private t(key: string): string {
    return this.i18n.translate(key);
  }
}
