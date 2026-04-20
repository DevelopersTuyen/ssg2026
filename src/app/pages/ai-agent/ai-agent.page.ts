import { Component, OnInit } from '@angular/core';
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
export class AiAgentPage implements OnInit {
  selectedTab: AiTab = 'dashboard';
  selectedExchange: ExchangeTab = 'HSX';
  currentPrompt = '';

  loadingOverview = false;
  sendingPrompt = false;
  overviewError = '';

  readonly tabs: AiTabItem[] = [
    { key: 'dashboard', label: 'Tong quan AI' },
    { key: 'chat', label: 'Chat AI' },
    { key: 'tasks', label: 'Tac vu tu dong' },
    { key: 'skills', label: 'Ky nang AI' },
    { key: 'history', label: 'Lich su' },
  ];

  summaryItems: AiStatusItem[] = [
    { label: 'Model', value: 'gemini-2.5-flash', tone: 'default' },
    { label: 'Trang thai', value: 'Dang cho backend', tone: 'warning' },
    { label: 'Watchlist dang theo doi', value: '0 ma', tone: 'default' },
    { label: 'Lan chay gan nhat', value: '--:--', tone: 'default' },
    { label: 'Canh bao AI hom nay', value: '0 tin hieu', tone: 'default' },
    { label: 'Tom tat da tao', value: '0 ban', tone: 'default' },
  ];

  quickPrompts: string[] = [
    'Tom tat thi truong hom nay',
    'Ma nao trong watchlist dang yeu hon VN-Index?',
    'Giai thich vi sao ma dan dau tang manh',
    'Tom tat tin tuc nhom ngan hang',
    'Loc ma co volume dot bien',
    'So sanh hai ma toi dang quan tam',
  ];

  forecastCards: AiForecastCard[] = [];
  recentActivities: AiActivityItem[] = [];
  tasks: AiTaskItem[] = [];
  skills: AiSkillItem[] = [];
  historyItems: AiActivityItem[] = [];

  chatMessages: ChatMessage[] = [
    {
      role: 'assistant',
      content:
        'Xin chao. AI Agent dang cho backend va Gemini de phan tich du lieu thi truong cho ban.',
      time: '--:--',
    },
  ];

  constructor(private api: MarketApiService) {}

  ngOnInit(): void {
    this.loadOverview();
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
                'Backend AI hien chua phan hoi. Kiem tra API hoac cau hinh GEMINI_API_KEY.',
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
              content: 'Khong the gui prompt toi backend AI o thoi diem nay.',
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

  private loadOverview(): void {
    this.loadingOverview = true;
    this.overviewError = '';

    this.api.getAiAgentOverview(this.selectedExchange).subscribe({
      next: (res) => {
        const data = res.data;

        if (!data) {
          this.overviewError = 'Chua lay duoc du lieu AI tu backend.';
          this.loadingOverview = false;
          return;
        }

        this.applyOverview(data);
        this.loadingOverview = false;
      },
      error: () => {
        this.overviewError = 'Khong ket noi duoc toi backend AI.';
        this.loadingOverview = false;
      },
    });
  }

  private applyOverview(data: AiAgentOverviewResponse): void {
    this.summaryItems = data.summary_items || this.summaryItems;
    this.quickPrompts = data.quick_prompts || this.quickPrompts;
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
}
