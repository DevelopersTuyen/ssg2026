import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Observable, of } from 'rxjs';
import { PageLoadState, PageLoadStateService } from 'src/app/core/services/page-load-state.service';

@Component({
  selector: 'app-page-load-indicator',
  templateUrl: './page-load-indicator.component.html',
  styleUrls: ['./page-load-indicator.component.scss'],
  standalone: false,
})
export class PageLoadIndicatorComponent implements OnChanges {
  @Input() pageId = '';

  state$: Observable<PageLoadState> = of({
    pageId: '',
    titleKey: '',
    status: 'idle',
    progress: 0,
    lastUpdatedAt: null,
    errorMessage: '',
  });

  constructor(private pageLoadState: PageLoadStateService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['pageId']) {
      this.state$ = this.pageLoadState.getPageState$(this.pageId);
    }
  }

  badgeText(state: PageLoadState): string {
    if (state.status === 'loading') return 'Đang tải';
    if (state.status === 'background') return 'Đang cập nhật nền';
    if (state.status === 'error') return 'Lỗi tải dữ liệu';
    if (state.status === 'updated') return 'Đã cập nhật';
    return 'Sẵn sàng';
  }

  shouldShow(state: PageLoadState): boolean {
    return state.status !== 'idle' || !!state.lastUpdatedAt;
  }

  lastUpdatedText(state: PageLoadState): string {
    if (!state.lastUpdatedAt) {
      return '';
    }
    return new Date(state.lastUpdatedAt).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
}
