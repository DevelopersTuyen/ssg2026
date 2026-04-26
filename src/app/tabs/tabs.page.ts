import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { AuthService } from '../core/services/auth.service';
import { GlobalLoadState, PageLoadStateService } from '../core/services/page-load-state.service';

const SIDEBAR_COLLAPSE_STORAGE_KEY = 'ssg2026:tabs-sidebar-collapsed';

interface TabsMenuItem {
  href: string;
  icon: string;
  labelKey: string;
  permission: string;
}

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: false,
})
export class TabsPage implements OnInit, OnDestroy {
  readonly sidebarExpandedWidth = 280;
  readonly sidebarCollapsedWidth = 76;
  readonly menuItems: TabsMenuItem[] = [
    {
      href: '/tabs/dashboard-v2',
      icon: 'grid-outline',
      labelKey: 'tabs.dashboardV2',
      permission: 'dashboard.view',
    },
    {
      href: '/tabs/strategy-hub',
      icon: 'layers-outline',
      labelKey: 'tabs.strategy',
      permission: 'strategy-hub.view',
    },
    {
      href: '/tabs/market-settings',
      icon: 'settings-outline',
      labelKey: 'tabs.settings',
      permission: 'market-settings.view',
    },
  ];

  globalLoadState: GlobalLoadState | null = null;
  sidebarCollapsed = false;
  private globalLoadSub?: Subscription;

  constructor(
    private auth: AuthService,
    private pageLoadState: PageLoadStateService
  ) {}

  ngOnInit(): void {
    this.sidebarCollapsed = this.readCollapsedState();
    this.globalLoadSub = this.pageLoadState.globalState$.subscribe((state) => {
      this.globalLoadState = state.visible ? state : null;
    });
  }

  ngOnDestroy(): void {
    this.globalLoadSub?.unsubscribe();
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.persistCollapsedState();
  }

  get sidebarWidth(): number {
    return this.sidebarCollapsed ? this.sidebarCollapsedWidth : this.sidebarExpandedWidth;
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

  private readCollapsedState(): boolean {
    return localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === '1';
  }

  private persistCollapsedState(): void {
    localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, this.sidebarCollapsed ? '1' : '0');
  }
}
