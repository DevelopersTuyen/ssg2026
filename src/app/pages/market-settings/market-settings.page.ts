import { Component, OnInit } from '@angular/core';
import { AuthService } from 'src/app/core/services/auth.service';
import { MarketApiService, MarketSettingsData } from 'src/app/core/services/market-api.service';

type SettingsTab = 'general' | 'display' | 'alerts' | 'data' | 'ai' | 'security';

interface SettingsTabItem {
  key: SettingsTab;
  label: string;
  helper: string;
}

@Component({
  selector: 'app-market-settings',
  templateUrl: './market-settings.page.html',
  styleUrls: ['./market-settings.page.scss'],
  standalone: false,
})
export class MarketSettingsPage implements OnInit {
  selectedTab: SettingsTab = 'general';
  loading = false;
  saving = false;
  message = '';
  error = '';
  settings!: MarketSettingsData;

  readonly tabs: SettingsTabItem[] = [
    { key: 'general', label: 'Chung', helper: 'Khoi dong va ngon ngu' },
    { key: 'display', label: 'Giao dien', helper: 'Theme va bang gia' },
    { key: 'alerts', label: 'Canh bao', helper: 'Nguong va kenh thong bao' },
    { key: 'data', label: 'Du lieu', helper: 'Refresh, cache, dong bo' },
    { key: 'ai', label: 'AI', helper: 'Lich va cach AI hoat dong' },
    { key: 'security', label: 'Bao mat', helper: 'Session va rang buoc dang nhap' },
  ];

  constructor(
    private api: MarketApiService,
    private auth: AuthService
  ) {
    this.settings = this.buildEmptySettings();
  }

  ngOnInit(): void {
    this.loadSettings();
  }

  selectTab(tab: SettingsTab): void {
    this.selectedTab = tab;
  }

  loadSettings(): void {
    this.loading = true;
    this.error = '';
    this.message = '';

    this.api.getMySettings().subscribe({
      next: (response) => {
        if (!response.data) {
          this.error = 'Khong tai duoc cau hinh tu backend.';
        } else {
          this.settings = response.data;
          this.auth.cacheSettings(response.data);
        }
        this.loading = false;
      },
      error: () => {
        this.error = 'Khong tai duoc cau hinh tu backend.';
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
        this.message = 'Da luu market-settings cho tai khoan hien tai.';
      },
      error: () => {
        this.saving = false;
        this.error = 'Luu cau hinh that bai.';
      },
    });
  }

  resetSettings(): void {
    const confirmed = window.confirm('Khoi phuc market-settings ve mac dinh?');
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
        this.message = 'Da khoi phuc cau hinh mac dinh.';
      },
      error: () => {
        this.saving = false;
        this.error = 'Reset cau hinh that bai.';
      },
    });
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
}
