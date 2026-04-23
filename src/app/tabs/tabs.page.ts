import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { AuthService } from '../core/services/auth.service';
import { GlobalLoadState, PageLoadStateService } from '../core/services/page-load-state.service';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: false,
})
export class TabsPage implements OnInit, OnDestroy {
  globalLoadState: GlobalLoadState | null = null;
  private globalLoadSub?: Subscription;

  constructor(
    private auth: AuthService,
    private pageLoadState: PageLoadStateService
  ) {}

  ngOnInit(): void {
    this.globalLoadSub = this.pageLoadState.globalState$.subscribe((state) => {
      this.globalLoadState = state.visible ? state : null;
    });
  }

  ngOnDestroy(): void {
    this.globalLoadSub?.unsubscribe();
  }

  can(permission: string): boolean {
    const permissions = this.auth.profile?.permissions || [];
    return permissions.includes(permission);
  }

  get canViewStrategy(): boolean {
    return this.can('strategy-hub.view');
  }

  get canViewPermissions(): boolean {
    return this.can('role-permissions.view');
  }

  globalBadgeText(): string {
    if (!this.globalLoadState) return '';
    if (this.globalLoadState.status === 'loading') return 'Đang tải toàn hệ thống';
    if (this.globalLoadState.status === 'background') return 'Đang cập nhật nền';
    if (this.globalLoadState.status === 'error') return 'Có lỗi đồng bộ';
    if (this.globalLoadState.status === 'updated') return 'Đã cập nhật';
    return 'Sẵn sàng';
  }

  globalUpdatedText(): string {
    if (!this.globalLoadState?.lastUpdatedAt) return '';
    return new Date(this.globalLoadState.lastUpdatedAt).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
}
