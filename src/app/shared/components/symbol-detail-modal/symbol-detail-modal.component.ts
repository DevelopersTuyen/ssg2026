import { AfterViewInit, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { Subscription, forkJoin } from 'rxjs';
import {
  FinancialOverviewResponse,
  FinancialStatementRow,
  FinancialStatementSection,
  LiveSymbolHourlyItem,
  LiveSymbolQuote,
  MarketApiService,
} from 'src/app/core/services/market-api.service';

declare const ApexCharts: any;

let symbolModalChartCounter = 0;

@Component({
  selector: 'app-symbol-detail-modal',
  templateUrl: './symbol-detail-modal.component.html',
  styleUrls: ['./symbol-detail-modal.component.scss'],
  standalone: false,
})
export class SymbolDetailModalComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() open = false;
  @Input() symbol = '';
  @Output() closed = new EventEmitter<void>();

  readonly financialPreviewRowCount = 12;
  readonly chartHostId = `symbol-detail-chart-${++symbolModalChartCounter}`;

  selectedQuote: LiveSymbolQuote | null = null;
  selectedHourly: LiveSymbolHourlyItem[] = [];
  financialOverview: FinancialOverviewResponse | null = null;
  symbolLoading = false;
  financialLoading = false;
  financialModalOpen = false;

  private symbolSub?: Subscription;
  private financialSub?: Subscription;
  private chart: any;
  private financialRequestedSymbol = '';
  private financialExpandedSections: Record<string, boolean> = {};
  private renderTimer?: number;

  constructor(private readonly api: MarketApiService) {}

  ngAfterViewInit(): void {
    this.scheduleChartRender();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && !this.open) {
      this.destroyChart();
      this.financialModalOpen = false;
      return;
    }

    if ((changes['open'] || changes['symbol']) && this.open && this.normalizedSymbol) {
      this.loadSelectedSymbol();
    }
  }

  ngOnDestroy(): void {
    this.symbolSub?.unsubscribe();
    this.financialSub?.unsubscribe();
    this.destroyChart();
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
    }
  }

  get normalizedSymbol(): string {
    return (this.symbol || '').trim().toUpperCase();
  }

  get selectedSymbolDisplay(): string {
    return this.normalizedSymbol || '--';
  }

  get selectedPriceText(): string {
    return this.formatPrice(this.selectedQuote?.price);
  }

  get selectedChangeText(): string {
    return this.formatSignedPrice(this.selectedQuote?.changeValue);
  }

  get selectedPercentText(): string {
    return this.formatPercent(this.selectedQuote?.changePercent);
  }

  get selectedVolumeText(): string {
    return this.formatNumber(this.selectedQuote?.volume);
  }

  get selectedTradingValueText(): string {
    return this.formatMoney(this.selectedQuote?.tradingValue);
  }

  get selectedQuoteUp(): boolean {
    return Number(this.selectedQuote?.changeValue || 0) >= 0;
  }

  get financialHighlights() {
    return this.financialOverview?.highlights || [];
  }

  get financialSections() {
    return this.financialOverview?.sections || [];
  }

  get financialSyncStatus() {
    return this.financialOverview?.syncStatus || null;
  }

  closeSymbolModal(): void {
    this.closed.emit();
  }

  openFinancialModal(): void {
    if (!this.normalizedSymbol) return;
    this.financialModalOpen = true;
    this.ensureFinancialOverview(this.normalizedSymbol);
  }

  closeFinancialModal(): void {
    this.financialModalOpen = false;
  }

  visibleFinancialRows(section: FinancialStatementSection): FinancialStatementRow[] {
    return this.isFinancialSectionExpanded(section.type)
      ? section.rows
      : section.rows.slice(0, this.financialPreviewRowCount);
  }

  hasFinancialRowToggle(section: FinancialStatementSection): boolean {
    return section.rows.length > this.financialPreviewRowCount;
  }

  isFinancialSectionExpanded(sectionType: string): boolean {
    return !!this.financialExpandedSections[sectionType];
  }

  toggleFinancialSection(sectionType: string): void {
    this.financialExpandedSections = {
      ...this.financialExpandedSections,
      [sectionType]: !this.financialExpandedSections[sectionType],
    };
  }

  formatFinancialCell(value: { displayValue: string; valueText: string | null }): string {
    return value?.displayValue || value?.valueText || '--';
  }

  trackByFinancialRow(_: number, row: FinancialStatementRow): string {
    return row.metricKey;
  }

  private loadSelectedSymbol(): void {
    const symbol = this.normalizedSymbol;
    if (!symbol) return;

    this.symbolLoading = true;
    this.symbolSub?.unsubscribe();
    this.destroyChart();

    this.symbolSub = forkJoin({
      quote: this.api.getSymbolQuote(symbol),
      hourly: this.api.getSymbolHourly(symbol),
    }).subscribe({
      next: ({ quote, hourly }) => {
        this.selectedQuote = quote.quote || null;
        this.selectedHourly = (hourly.items || []).sort(
          (left, right) => new Date(left.time).getTime() - new Date(right.time).getTime()
        );
        this.symbolLoading = false;
        this.scheduleChartRender();
      },
      error: () => {
        this.selectedQuote = null;
        this.selectedHourly = [];
        this.symbolLoading = false;
      },
    });
  }

  private ensureFinancialOverview(symbol: string): void {
    if (this.financialOverview?.symbol === symbol) return;
    if (this.financialLoading && this.financialRequestedSymbol === symbol) return;

    this.financialSub?.unsubscribe();
    this.financialRequestedSymbol = symbol;
    this.financialLoading = true;
    this.financialSub = this.api.getSymbolFinancials(symbol, 40).subscribe({
      next: (data) => {
        if (this.financialRequestedSymbol !== symbol) return;
        this.financialOverview = data;
        this.financialLoading = false;
        this.financialExpandedSections = {};
      },
      error: () => {
        if (this.financialRequestedSymbol !== symbol) return;
        this.financialOverview = null;
        this.financialLoading = false;
        this.financialExpandedSections = {};
      },
    });
  }

  private scheduleChartRender(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
    }
    this.renderTimer = window.setTimeout(() => this.renderChart(), 0);
  }

  private renderChart(): void {
    const el = document.getElementById(this.chartHostId);
    if (!this.open || !el || typeof ApexCharts === 'undefined' || !this.selectedHourly.length) {
      return;
    }

    this.destroyChart();
    const closeSeries = this.selectedHourly.map((item) => ({
      x: new Date(item.time).getTime(),
      y: Number(item.close || 0),
    }));

    this.chart = new ApexCharts(el, {
      chart: {
        type: 'area',
        height: 360,
        toolbar: { show: false },
        animations: { enabled: false },
        fontFamily: 'inherit',
      },
      series: [{ name: 'Giá', data: closeSeries }],
      stroke: { width: 3, curve: 'smooth' },
      colors: ['#16a34a'],
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.28,
          opacityTo: 0.03,
          stops: [0, 95, 100],
        },
      },
      markers: { size: 0, hover: { size: 5 } },
      dataLabels: { enabled: false },
      xaxis: {
        type: 'datetime',
        labels: {
          datetimeUTC: false,
          formatter: (_: string, timestamp?: number) => this.formatTime(timestamp || 0),
        },
      },
      yaxis: {
        labels: {
          formatter: (value: number) => this.formatPrice(value),
        },
      },
      tooltip: {
        shared: false,
        intersect: true,
        x: { formatter: (value: number) => this.formatTimeHms(value) },
        y: { formatter: (value: number) => this.formatPrice(value) },
      },
      grid: {
        borderColor: '#edf1f7',
        strokeDashArray: 4,
      },
    });

    this.chart.render();
  }

  private destroyChart(): void {
    try {
      this.chart?.destroy();
    } catch {}
    this.chart = null;
  }

  private formatTime(value: number): string {
    const date = new Date(value);
    const hh = `${date.getHours()}`.padStart(2, '0');
    const mm = `${date.getMinutes()}`.padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private formatTimeHms(value: number): string {
    const date = new Date(value);
    const hh = `${date.getHours()}`.padStart(2, '0');
    const mm = `${date.getMinutes()}`.padStart(2, '0');
    const ss = `${date.getSeconds()}`.padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  private formatPrice(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private formatSignedPrice(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    const num = Number(value);
    const abs = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${num >= 0 ? '+' : '-'}${abs}`;
  }

  private formatPercent(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    const num = Number(value);
    return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
  }

  private formatNumber(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    return Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  private formatMoney(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    const num = Number(value);
    if (Math.abs(num) >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
    if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
}
