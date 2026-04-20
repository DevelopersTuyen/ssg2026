import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export type ExchangeTab = 'HSX' | 'HNX' | 'UPCOM';
export type SortTab = 'actives' | 'gainers' | 'losers';

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

export interface AiLocalOverviewResponse {
  exchange: string;
  provider: string;
  model: string;
  connected: boolean;
  model_available: boolean;
  used_fallback: boolean;
  generated_at: string;
  summary_items: AiStatusItem[];
  quick_prompts: string[];
  forecast_cards: AiForecastCard[];
  recent_activities: AiActivityItem[];
  dataset_stats: AiLocalDataStat[];
  focus_symbols: string[];
  news_items: AiLocalNewsItem[];
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

@Injectable({
  providedIn: 'root',
})
export class MarketApiService {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getLiveIndexCards(): Observable<LiveIndexCardsResponse> {
    return this.http.get<LiveIndexCardsResponse>(`${this.baseUrl}/api/live/index-cards`).pipe(
      catchError(() =>
        of({
          capturedAt: null,
          items: [],
        })
      )
    );
  }

  getLiveIndexOptions(): Observable<LiveIndexOptionsResponse> {
    return this.http.get<LiveIndexOptionsResponse>(`${this.baseUrl}/api/live/index-options`).pipe(
      catchError(() =>
        of({
          items: [],
        })
      )
    );
  }

  getLiveIndexSeries(exchange: string): Observable<LiveIndexSeriesResponse> {
    return this.http
      .get<LiveIndexSeriesResponse>(`${this.baseUrl}/api/live/index-series`, {
        params: { exchange },
      })
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
    return this.http
      .get<LiveHourlyTradingResponse>(`${this.baseUrl}/api/live/hourly-trading`, {
        params: { exchange },
      })
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
    pageSize = 5000,
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

    return this.http
      .get<LiveStocksResponse>(`${this.baseUrl}/api/live/stocks`, { params })
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
    return this.http
      .get<LiveSymbolQuoteResponse>(`${this.baseUrl}/api/live/symbols/${symbol}/quote`)
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
    return this.http
      .get<LiveSymbolHourlyResponse>(`${this.baseUrl}/api/live/symbols/${symbol}/hourly`)
      .pipe(
        catchError(() =>
          of({
            symbol: symbol.toUpperCase(),
            items: [],
          })
        )
      );
  }

  getNews(limit = 10): Observable<NewsItem[]> {
    return this.http
      .get<NewsItem[]>(`${this.baseUrl}/api/live/news`, {
        params: { limit },
      })
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
    return this.http
      .get<ApiEnvelope<WatchlistItem[]>>(`${this.baseUrl}/api/watchlist`)
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
    return this.http
      .get<ApiEnvelope<AiAgentOverviewResponse>>(`${this.baseUrl}/api/ai-agent/overview`, {
        params: { exchange },
      })
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

  getAiLocalOverview(exchange: ExchangeTab = 'HSX'): Observable<ApiEnvelope<AiLocalOverviewResponse | null>> {
    return this.http
      .get<ApiEnvelope<AiLocalOverviewResponse>>(`${this.baseUrl}/api/ai-local/overview`, {
        params: { exchange },
      })
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
    return this.http
      .get<ApiEnvelope<MarketAlertsOverviewResponse>>(`${this.baseUrl}/api/market-alerts/overview`, {
        params: { exchange },
      })
      .pipe(
        catchError(() =>
          of({
            data: null,
          })
        )
      );
  }

  getMySettings(): Observable<ApiEnvelope<MarketSettingsData | null>> {
    return this.http.get<ApiEnvelope<MarketSettingsData>>(`${this.baseUrl}/api/settings/me`).pipe(
      catchError(() =>
        of({
          data: null,
        })
      )
    );
  }

  saveMySettings(body: MarketSettingsData): Observable<ApiEnvelope<MarketSettingsData | null>> {
    return this.http.put<ApiEnvelope<MarketSettingsData>>(`${this.baseUrl}/api/settings/me`, body).pipe(
      catchError(() =>
        of({
          data: null,
        })
      )
    );
  }

  resetMySettings(): Observable<ApiEnvelope<MarketSettingsData | null>> {
    return this.http.post<ApiEnvelope<MarketSettingsData>>(`${this.baseUrl}/api/settings/me/reset`, {}).pipe(
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
}
