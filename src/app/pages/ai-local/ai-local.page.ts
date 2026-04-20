import { Component, OnInit } from '@angular/core';
import {
  AiActivityItem,
  AiAgentChatHistoryItem,
  AiForecastCard,
  AiLocalDataStat,
  AiLocalNewsItem,
  AiLocalOverviewResponse,
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
  title: string;
  description: string;
  prompt: string;
}

@Component({
  selector: 'app-ai-local',
  templateUrl: './ai-local.page.html',
  styleUrls: ['./ai-local.page.scss'],
  standalone: false,
})
export class AiLocalPage implements OnInit {
  private readonly autoAnalyzeStorageKey = 'ai-local.auto-analyze-enabled';

  selectedTab: LocalTab = 'overview';
  selectedExchange: ExchangeTab = 'HSX';
  currentPrompt = '';
  autoAnalyzeEnabled = false;

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

  connected = false;
  modelAvailable = false;
  provider = 'ollama';
  model = 'qwen3:8b';

  chatMessages: ChatMessage[] = [];
  contextSummary: AiLocalDataStat[] = [];

  readonly promptTemplates: PromptTemplate[] = [
    {
      key: 'market_snapshot',
      title: 'Tong quan thi truong',
      description: 'Tom tat index, dong tien, top tang giam va tinh hinh san hien tai.',
      prompt:
        'Hay phan tich tong quan san dang xem: index, dong tien, top tang, top giam, tin hieu can chu y va du bao ngan han.',
    },
    {
      key: 'watchlist_risk',
      title: 'Rui ro watchlist',
      description: 'Tap trung vao cac ma dang theo doi, ma nao yeu hon thi truong va ma nao dang hut dong tien.',
      prompt:
        'Hay phan tich watchlist hien tai, chi ra ma nao dang manh hon thi truong, ma nao dang co rui ro va canh bao ngan han.',
    },
    {
      key: 'cafef_digest',
      title: 'Digest tin CafeF',
      description: 'Tom tat tin tuc gan nhat tu CafeF va noi voi bien dong co phieu.',
      prompt:
        'Hay doc cac tin CafeF moi nhat trong local context, tom tat 3 y chinh va lien he voi nhom co phieu hoac dong tien thi truong.',
    },
    {
      key: 'liquidity_scan',
      title: 'Quet thanh khoan',
      description: 'Loc ma dang hut volume va giao dich bat thuong.',
      prompt:
        'Hay quet cac ma dang hut thanh khoan trong san nay, chi ra ma dang noi bat ve volume va vi sao can theo doi.',
    },
    {
      key: 'symbol_compare',
      title: 'So sanh ma',
      description: 'So sanh 2 ma co phieu trong local context theo bien dong, volume va xung luc.',
      prompt:
        'Hay so sanh 2 ma toi dang quan tam trong context hien tai, neu thieu ma cu the thi goi y nhung ma noi bat de so sanh.',
    },
    {
      key: 'trading_plan',
      title: 'Ke hoach quan sat',
      description: 'Tao checklist can theo doi trong phien cho trader/analyst.',
      prompt:
        'Hay tao mot checklist quan sat trong phien gom: index, nhom nganh, watchlist, ma can chu y va tin tuc can doc tiep.',
    },
  ];

  constructor(private api: MarketApiService) {}

  ngOnInit(): void {
    this.restoreLocalPreferences();
    this.loadOverview();
  }

  selectTab(tab: LocalTab): void {
    this.selectedTab = tab;
  }

  onExchangeChange(): void {
    this.loadOverview();
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
      .chatWithAiLocal({
        prompt: text,
        exchange: this.selectedExchange,
        history,
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
              content:
                message?.content ||
                'AI Local chua tra loi. Kiem tra Ollama local va model qwen3:8b.',
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
              content: 'Khong ket noi duoc toi AI Local.',
              time: this.formatNow(),
            },
          ];
          this.sendingPrompt = false;
        },
      });
  }

  trackByLabel(_: number, item: AiStatusItem | AiLocalDataStat): string {
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

  trackByNews(_: number, item: AiLocalNewsItem): string {
    return `${item.source}-${item.title}`;
  }

  trackByChat(_: number, item: ChatMessage): string {
    return `${item.role}-${item.time}-${item.content}`;
  }

  statusToneClass(item: AiStatusItem): string {
    if (item.tone === 'positive') return 'positive';
    if (item.tone === 'warning') return 'warning';
    return 'default';
  }

  directionClass(item: AiForecastCard): string {
    return item.direction;
  }

  private loadOverview(): void {
    this.loadingOverview = true;
    this.overviewError = '';

    this.api.getAiLocalOverview(this.selectedExchange).subscribe({
      next: (res) => {
        const data = res.data;
        if (!data) {
          this.overviewError = 'Chua lay duoc du lieu AI Local tu backend.';
          this.loadingOverview = false;
          return;
        }

        this.applyOverview(data);
        this.loadingOverview = false;
        this.runAutoAnalysis('lam moi du lieu');
      },
      error: () => {
        this.overviewError = 'Khong ket noi duoc toi backend AI Local.';
        this.loadingOverview = false;
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
  }

  private runAutoAnalysis(reason: string): void {
    if (!this.autoAnalyzeEnabled || this.sendingPrompt) return;

    this.currentPrompt =
      `Hay tu dong phan tich toan bo bo du lieu local hien co cho san ${this.selectedExchange}. ` +
      `Can bao gom: index, dong tien, top tang, top giam, watchlist, focus symbols, tin CafeF, ` +
      `cac rui ro can theo doi va du bao ngan han. Ngu canh kich hoat: ${reason}.`;
    this.sendPrompt();
  }

  private formatNow(): string {
    const now = new Date();
    const hh = `${now.getHours()}`.padStart(2, '0');
    const mm = `${now.getMinutes()}`.padStart(2, '0');
    return `${hh}:${mm}`;
  }
}
