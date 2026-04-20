import { AfterViewInit, Component, OnDestroy } from '@angular/core';

declare const ApexCharts: any;

type AzTab = 'overview' | 'stats' | 'news' | 'finance';

interface AzTabItem {
  key: AzTab;
  label: string;
}

interface BaseStockRow {
  code: string;
  exchange: string;
  name: string;
}

interface OverviewRow extends BaseStockRow {
  price: string;
  change: string;
  percent: string;
  volume: string;
  value: string;
  up: boolean;
  neutral?: boolean;
  sparkId: string;
  sparkData: number[];
}

interface StatsRow extends BaseStockRow {
  avg10d: string;
  high52w: string;
  low52w: string;
  change1y: string;
  change1yUp: boolean;
  freeFloat: string;
  foreignRoom: string;
  turnoverPerExchange: string;
  volumePerFreeFloat: string;
}

interface NewsRow extends BaseStockRow {
  price: string;
  change: string;
  percent: string;
  up: boolean;
  neutral?: boolean;
  headline: string;
}

interface FinanceRow {
  code: string;
  exchange: string;
  eps: string;
  pe: string;
  pb: string;
  roe: string;
  roa: string;
  avgCashDividend3Y: string;
  avgStockDividend3Y: string;
}

@Component({
  selector: 'app-stocks-az',
  templateUrl: './stocks-az.page.html',
  styleUrls: ['./stocks-az.page.scss'],
  standalone: false,
})
export class StocksAzPage implements AfterViewInit, OnDestroy {
  keyword = '';
  selectedTab: AzTab = 'overview';

  readonly tabs: AzTabItem[] = [
    { key: 'overview', label: 'Tổng quan' },
    { key: 'stats', label: 'Thống kê' },
    { key: 'news', label: 'Tin tức' },
    { key: 'finance', label: 'Tài chính' },
  ];

  readonly overviewRows: OverviewRow[] = [
    {
      code: 'A32',
      exchange: 'UPCOM',
      name: 'CTCP 32',
      price: '33.10',
      change: '0.00',
      percent: '0.00%',
      volume: '0',
      value: '0',
      up: false,
      neutral: true,
      sparkId: 'az-spark-1',
      sparkData: [33.1, 33.1, 33.1, 33.1, 33.1, 33.1, 33.1],
    },
    {
      code: 'AAA',
      exchange: 'HSX',
      name: 'CTCP Nhựa An Phát Xanh',
      price: '7.10',
      change: '0.09',
      percent: '1.28%',
      volume: '912,700',
      value: '6,484',
      up: true,
      sparkId: 'az-spark-2',
      sparkData: [6.9, 6.7, 6.5, 6.3, 7.0, 7.2, 7.15, 7.05, 7.1],
    },
    {
      code: 'AAH',
      exchange: 'UPCOM',
      name: 'CTCP Hợp Nhất',
      price: '3.40',
      change: '0.10',
      percent: '3.03%',
      volume: '441,100',
      value: '1,454',
      up: true,
      sparkId: 'az-spark-3',
      sparkData: [3.1, 3.1, 3.2, 3.0, 3.2, 3.2, 3.3, 3.3, 3.4],
    },
    {
      code: 'AAM',
      exchange: 'HSX',
      name: 'CTCP Thủy sản Mekong',
      price: '6.69',
      change: '0.00',
      percent: '0.00%',
      volume: '4,500',
      value: '30',
      up: false,
      neutral: true,
      sparkId: 'az-spark-4',
      sparkData: [6.4, 6.5, 6.4, 6.55, 6.65, 6.75, 6.8, 6.82, 6.69],
    },
    {
      code: 'AAS',
      exchange: 'UPCOM',
      name: 'CTCP chứng khoán SmartInvest',
      price: '8.70',
      change: '0.10',
      percent: '1.16%',
      volume: '763,200',
      value: '6,566',
      up: true,
      sparkId: 'az-spark-5',
      sparkData: [8.6, 8.4, 8.3, 8.35, 8.9, 8.55, 8.5, 8.48, 8.7],
    },
    {
      code: 'AAT',
      exchange: 'HSX',
      name: 'CTCP Tập đoàn Tiên Sơn Thanh Hóa',
      price: '2.94',
      change: '0.02',
      percent: '0.68%',
      volume: '40,300',
      value: '118',
      up: true,
      sparkId: 'az-spark-6',
      sparkData: [2.9, 2.9, 2.9, 2.85, 2.75, 2.9, 2.8, 2.95, 2.94],
    },
    {
      code: 'AAV',
      exchange: 'HNX',
      name: 'CTCP AAV Group',
      price: '7.20',
      change: '-0.20',
      percent: '-2.70%',
      volume: '182,900',
      value: '1,316',
      up: false,
      sparkId: 'az-spark-7',
      sparkData: [7.6, 7.7, 7.8, 7.75, 7.7, 7.3, 7.05, 7.0, 7.2],
    },
    {
      code: 'ABB',
      exchange: 'UPCOM',
      name: 'Ngân hàng TMCP An Bình',
      price: '14.60',
      change: '-0.10',
      percent: '-0.68%',
      volume: '284,200',
      value: '4,166',
      up: false,
      sparkId: 'az-spark-8',
      sparkData: [15.2, 14.5, 14.4, 14.6, 15.0, 14.4, 14.8, 14.6, 14.6],
    },
    {
      code: 'ABC',
      exchange: 'UPCOM',
      name: 'CTCP Truyền thông VMG',
      price: '11.60',
      change: '0.10',
      percent: '0.87%',
      volume: '11,400',
      value: '132',
      up: true,
      sparkId: 'az-spark-9',
      sparkData: [11.4, 11.3, 11.2, 11.4, 11.1, 11.5, 11.55, 11.6, 11.6],
    },
    {
      code: 'ABI',
      exchange: 'UPCOM',
      name: 'CTCP Bảo hiểm Ngân hàng Nông nghiệp',
      price: '19.70',
      change: '0.10',
      percent: '0.51%',
      volume: '28,400',
      value: '556',
      up: true,
      sparkId: 'az-spark-10',
      sparkData: [19.9, 19.9, 19.8, 19.7, 20.0, 19.6, 19.9, 19.8, 19.7],
    },
    {
      code: 'ABR',
      exchange: 'HSX',
      name: 'CTCP Đầu tư Nhãn Hiệu Việt',
      price: '13.00',
      change: '0.00',
      percent: '0.00%',
      volume: '300',
      value: '4',
      up: false,
      neutral: true,
      sparkId: 'az-spark-11',
      sparkData: [12.1, 12.1, 12.1, 13.2, 13.2, 13.2, 13.2, 13.0, 13.0],
    },
    {
      code: 'ABS',
      exchange: 'HSX',
      name: 'CTCP Dịch vụ Nông nghiệp Bình Thuận',
      price: '2.99',
      change: '0.06',
      percent: '2.05%',
      volume: '267,500',
      value: '795',
      up: true,
      sparkId: 'az-spark-12',
      sparkData: [3.2, 3.5, 3.2, 3.1, 3.15, 3.08, 3.12, 3.1, 2.99],
    },
    {
      code: 'ABT',
      exchange: 'HSX',
      name: 'CTCP Xuất nhập khẩu Thủy sản Bến Tre',
      price: '60.00',
      change: '0.00',
      percent: '0.00%',
      volume: '6,700',
      value: '402',
      up: false,
      neutral: true,
      sparkId: 'az-spark-13',
      sparkData: [60.2, 60.1, 59.8, 60.0, 60.3, 59.9, 59.9, 59.9, 60.0],
    },
  ];

  readonly statsRows: StatsRow[] = [
    {
      code: 'A32',
      exchange: 'UPCOM',
      name: 'CTCP 32',
      avg10d: '170',
      high52w: '42.14',
      low52w: '30.37',
      change1y: '-4.39%',
      change1yUp: false,
      freeFloat: '2,872,700',
      foreignRoom: '0',
      turnoverPerExchange: '0.00%',
      volumePerFreeFloat: '0.00%',
    },
    {
      code: 'AAA',
      exchange: 'HSX',
      name: 'CTCP Nhựa An Phát Xanh',
      avg10d: '914,480',
      high52w: '8.97',
      low52w: '6.15',
      change1y: '3.55%',
      change1yUp: true,
      freeFloat: '171,519,768',
      foreignRoom: '386,949,510',
      turnoverPerExchange: '0.03%',
      volumePerFreeFloat: '0.53%',
    },
    {
      code: 'AAH',
      exchange: 'UPCOM',
      name: 'CTCP Hợp Nhất',
      avg10d: '611,240',
      high52w: '5.10',
      low52w: '3.10',
      change1y: '-17.50%',
      change1yUp: false,
      freeFloat: '79,323,600',
      foreignRoom: '0',
      turnoverPerExchange: '0.16%',
      volumePerFreeFloat: '0.56%',
    },
    {
      code: 'AAM',
      exchange: 'HSX',
      name: 'CTCP Thủy sản Mekong',
      avg10d: '4,630',
      high52w: '7.69',
      low52w: '6.01',
      change1y: '-3.04%',
      change1yUp: false,
      freeFloat: '3,410,550',
      foreignRoom: '5,943,455',
      turnoverPerExchange: '0.00%',
      volumePerFreeFloat: '0.13%',
    },
    {
      code: 'AAS',
      exchange: 'UPCOM',
      name: 'CTCP chứng khoán SmartInvest',
      avg10d: '1,194,130',
      high52w: '24.60',
      low52w: '6.90',
      change1y: '14.67%',
      change1yUp: true,
      freeFloat: '225,222,727',
      foreignRoom: '229,801,226',
      turnoverPerExchange: '0.73%',
      volumePerFreeFloat: '0.34%',
    },
    {
      code: 'AAT',
      exchange: 'HSX',
      name: 'CTCP Tập đoàn Tiên Sơn Thanh Hóa',
      avg10d: '19,500',
      high52w: '3.99',
      low52w: '2.71',
      change1y: '-2.34%',
      change1yUp: false,
      freeFloat: '59,117,800',
      foreignRoom: '34,972,074',
      turnoverPerExchange: '0.00%',
      volumePerFreeFloat: '0.07%',
    },
    {
      code: 'AAV',
      exchange: 'HNX',
      name: 'CTCP AAV Group',
      avg10d: '767,140',
      high52w: '9.50',
      low52w: '5.40',
      change1y: '25.42%',
      change1yUp: true,
      freeFloat: '48,864,142',
      foreignRoom: '33,712,798',
      turnoverPerExchange: '0.11%',
      volumePerFreeFloat: '0.37%',
    },
    {
      code: 'ABB',
      exchange: 'UPCOM',
      name: 'Ngân hàng TMCP An Bình',
      avg10d: '1,105,670',
      high52w: '16.40',
      low52w: '6.20',
      change1y: '110.65%',
      change1yUp: true,
      freeFloat: '1,088,223,932',
      foreignRoom: '58,119,454',
      turnoverPerExchange: '0.46%',
      volumePerFreeFloat: '0.03%',
    },
  ];

  readonly newsRows: NewsRow[] = [
    {
      code: 'A32',
      exchange: 'UPCOM',
      name: 'CTCP 32',
      price: '33.10',
      change: '0.00',
      percent: '0.00%',
      up: false,
      neutral: true,
      headline: 'A32: Ngày đăng ký cuối cùng tham dự Đại hội đồng cổ đông thường niên năm 2026',
    },
    {
      code: 'AAA',
      exchange: 'HSX',
      name: 'CTCP Nhựa An Phát Xanh',
      price: '7.10',
      change: '0.09',
      percent: '1.28%',
      up: true,
      headline: 'AAA: Nghị quyết HĐQT về việc thông qua thời gian, địa điểm tổ chức ĐHCĐTN 2026',
    },
    {
      code: 'AAH',
      exchange: 'UPCOM',
      name: 'CTCP Hợp Nhất',
      price: '3.40',
      change: '0.10',
      percent: '3.03%',
      up: true,
      headline: 'AAH: Ngày đăng ký cuối cùng Đại hội đồng cổ đông thường niên năm 2026',
    },
    {
      code: 'AAM',
      exchange: 'HSX',
      name: 'CTCP Thủy sản Mekong',
      price: '6.69',
      change: '0.00',
      percent: '0.00%',
      up: false,
      neutral: true,
      headline: 'AAM: Tài liệu họp ĐHĐCĐ thường niên 2026 (Điều chỉnh)',
    },
    {
      code: 'AAS',
      exchange: 'UPCOM',
      name: 'CTCP chứng khoán SmartInvest',
      price: '8.70',
      change: '0.10',
      percent: '1.16%',
      up: true,
      headline: 'AAS: Nghị quyết Hội đồng quản trị',
    },
    {
      code: 'AAT',
      exchange: 'HSX',
      name: 'CTCP Tập đoàn Tiên Sơn Thanh Hóa',
      price: '2.94',
      change: '0.02',
      percent: '0.68%',
      up: true,
      headline: 'AAT: Đính chính BCTC Hợp nhất kiểm toán năm 2025',
    },
    {
      code: 'AAV',
      exchange: 'HNX',
      name: 'CTCP AAV Group',
      price: '7.20',
      change: '-0.20',
      percent: '-2.70%',
      up: false,
      headline: 'AAV: CBTT theo yêu cầu',
    },
    {
      code: 'ABB',
      exchange: 'UPCOM',
      name: 'Ngân hàng TMCP An Bình',
      price: '14.60',
      change: '-0.10',
      percent: '-0.68%',
      up: false,
      headline: 'ABB: Tài liệu họp Đại hội đồng cổ đông',
    },
    {
      code: 'ABC',
      exchange: 'UPCOM',
      name: 'CTCP Truyền thông VMG',
      price: '11.60',
      change: '0.10',
      percent: '0.87%',
      up: true,
      headline: 'ABC: Báo cáo thường niên 2025',
    },
    {
      code: 'ABI',
      exchange: 'UPCOM',
      name: 'CTCP Bảo hiểm Ngân hàng Nông nghiệp',
      price: '19.70',
      change: '0.10',
      percent: '0.51%',
      up: true,
      headline: 'ABI: Báo cáo thường niên 2025',
    },
  ];

  readonly financeRows: FinanceRow[] = [
    {
      code: 'A32',
      exchange: 'UPCOM',
      eps: '7,481',
      pe: '4.42',
      pb: '0.98',
      roe: '22.52%',
      roa: '10.31%',
      avgCashDividend3Y: '2,233',
      avgStockDividend3Y: '0.00%',
    },
    {
      code: 'AAA',
      exchange: 'HSX',
      eps: '947',
      pe: '7.40',
      pb: '0.50',
      roe: '6.06%',
      roa: '2.80%',
      avgCashDividend3Y: '100',
      avgStockDividend3Y: '0.00%',
    },
    {
      code: 'AAH',
      exchange: 'UPCOM',
      eps: '2',
      pe: '1,421.03',
      pb: '0.33',
      roe: '0.02%',
      roa: '0.02%',
      avgCashDividend3Y: '0',
      avgStockDividend3Y: '0.00%',
    },
    {
      code: 'AAM',
      exchange: 'HSX',
      eps: '177',
      pe: '37.86',
      pb: '0.35',
      roe: '0.94%',
      roa: '0.92%',
      avgCashDividend3Y: '0',
      avgStockDividend3Y: '0.00%',
    },
    {
      code: 'AAS',
      exchange: 'UPCOM',
      eps: '688',
      pe: '12.51',
      pb: '0.75',
      roe: '6.15%',
      roa: '3.39%',
      avgCashDividend3Y: '0',
      avgStockDividend3Y: '0.00%',
    },
    {
      code: 'AAT',
      exchange: 'HSX',
      eps: '335',
      pe: '8.72',
      pb: '0.29',
      roe: '3.21%',
      roa: '1.69%',
      avgCashDividend3Y: '0',
      avgStockDividend3Y: '0.00%',
    },
    {
      code: 'AAV',
      exchange: 'HNX',
      eps: '-311',
      pe: '-23.78',
      pb: '0.72',
      roe: '-2.84%',
      roa: '-1.82%',
      avgCashDividend3Y: '0',
      avgStockDividend3Y: '0.00%',
    },
    {
      code: 'ABB',
      exchange: 'UPCOM',
      eps: '2,714',
      pe: '5.38',
      pb: '0.90',
      roe: '18.22%',
      roa: '1.41%',
      avgCashDividend3Y: '0',
      avgStockDividend3Y: '0.00%',
    },
    {
      code: 'ABC',
      exchange: 'UPCOM',
      eps: '4,839',
      pe: '2.40',
      pb: '0.40',
      roe: '18.27%',
      roa: '11.74%',
      avgCashDividend3Y: '167',
      avgStockDividend3Y: '0.00%',
    },
    {
      code: 'ABI',
      exchange: 'UPCOM',
      eps: '2,509',
      pe: '7.89',
      pb: '1.11',
      roe: '14.85%',
      roa: '5.58%',
      avgCashDividend3Y: '667',
      avgStockDividend3Y: '13.33%',
    },
  ];

  private charts: any[] = [];
  private renderTimer: any;

  ngAfterViewInit(): void {
    this.scheduleRender(100);
  }

  ionViewDidEnter(): void {
    this.scheduleRender(100);
  }

  ngOnDestroy(): void {
    this.destroyCharts();
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
    }
  }

  selectTab(tab: AzTab): void {
    this.selectedTab = tab;
    this.scheduleRender();
  }

  trackOverview(_: number, item: OverviewRow): string {
    return item.code;
  }

  trackStats(_: number, item: StatsRow): string {
    return item.code;
  }

  trackNews(_: number, item: NewsRow): string {
    return item.code;
  }

  trackFinance(_: number, item: FinanceRow): string {
    return item.code;
  }

  private scheduleRender(delay = 50): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
    }

    this.renderTimer = setTimeout(() => {
      this.renderCharts();
    }, delay);
  }

  private renderCharts(): void {
    if (typeof ApexCharts === 'undefined') return;

    this.destroyCharts();

    if (this.selectedTab !== 'overview') return;

    this.overviewRows.forEach((row) => {
      const el = document.getElementById(row.sparkId);
      if (!el) return;

      const chart = new ApexCharts(el, {
        chart: {
          type: 'line',
          height: 28,
          width: 52,
          sparkline: { enabled: true },
          toolbar: { show: false },
          animations: { enabled: false },
        },
        series: [{ data: row.sparkData }],
        stroke: {
          curve: 'smooth',
          width: 1.4,
        },
        colors: ['#7dbfe8'],
        markers: {
          size: [0, 0, 0, 0, 0, 0, 0, 0, 2.5],
        },
        tooltip: { enabled: false },
        dataLabels: { enabled: false },
      });

      chart.render();
      this.charts.push(chart);
    });
  }

  private destroyCharts(): void {
    this.charts.forEach((chart) => {
      try {
        chart.destroy();
      } catch {}
    });
    this.charts = [];
  }
}