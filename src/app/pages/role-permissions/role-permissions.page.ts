import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, interval } from 'rxjs';
import {
  MarketApiService,
  RolePermissionLog,
  RolePermissionMatrixRow,
  RolePermissionRole,
  RolePermissionUser,
  RolePermissionsOverviewResponse,
} from 'src/app/core/services/market-api.service';
import { PageLoadStateService } from 'src/app/core/services/page-load-state.service';

type PermissionTab = 'users' | 'roles' | 'matrix' | 'logs';

interface PermissionTabItem {
  key: PermissionTab;
  labelKey: string;
}

interface NewUserForm {
  username: string;
  full_name: string;
  email: string;
  department: string;
  role_key: string;
  password: string;
}

interface NewRoleForm {
  key: string;
  name: string;
  description: string;
}

@Component({
  selector: 'app-role-permissions',
  templateUrl: './role-permissions.page.html',
  styleUrls: ['./role-permissions.page.scss'],
  standalone: false,
})
export class RolePermissionsPage implements OnInit, OnDestroy {
  private readonly pageLoadKey = 'role-permissions';
  selectedTab: PermissionTab = 'users';
  searchKeyword = '';
  selectedRoleFilter = 'all';
  selectedMatrixRole = '';
  loading = false;
  saving = false;
  error = '';
  notice = '';
  overview: RolePermissionsOverviewResponse | null = null;

  showAddUserForm = false;
  showAddRoleForm = false;
  newUser: NewUserForm = this.buildNewUserForm();
  newRole: NewRoleForm = this.buildNewRoleForm();
  private autoRefreshSub?: Subscription;
  private activeView = false;

  readonly tabs: PermissionTabItem[] = [
    { key: 'users', labelKey: 'permissions.tabs.users' },
    { key: 'roles', labelKey: 'permissions.tabs.roles' },
    { key: 'matrix', labelKey: 'permissions.tabs.matrix' },
    { key: 'logs', labelKey: 'permissions.tabs.logs' },
  ];

  constructor(
    private api: MarketApiService,
    private pageLoadState: PageLoadStateService
  ) {}

  ngOnInit(): void {
    this.pageLoadState.registerPage(this.pageLoadKey, 'permissions.title');
    this.loadOverview();
  }

  ionViewDidEnter(): void {
    this.activeView = true;
    this.pageLoadState.setActivePage(this.pageLoadKey);
    this.startAutoRefresh();
    if (!this.pageLoadState.isLoading(this.pageLoadKey) && !this.pageLoadState.isFresh(this.pageLoadKey, 15000)) {
      this.loadOverview(undefined, true);
    }
  }

  ionViewDidLeave(): void {
    this.activeView = false;
    this.stopAutoRefresh();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }

  get canManage(): boolean {
    return !!this.overview?.can_manage;
  }

  get users(): RolePermissionUser[] {
    const keyword = this.searchKeyword.trim().toLowerCase();
    return (this.overview?.users || []).filter((row) => {
      if (this.selectedRoleFilter !== 'all' && row.role_key !== this.selectedRoleFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [row.username, row.full_name, row.email || '', row.department || '']
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }

  get roles(): RolePermissionRole[] {
    return this.overview?.roles || [];
  }

  get matrix(): RolePermissionMatrixRow[] {
    return this.overview?.matrix || [];
  }

  get logs(): RolePermissionLog[] {
    return this.overview?.logs || [];
  }

  selectTab(tab: PermissionTab): void {
    this.selectedTab = tab;
  }

  loadOverview(roleKey?: string, silent = false): void {
    if (!silent) {
      this.loading = true;
      this.error = '';
      this.pageLoadState.start(this.pageLoadKey);
    } else {
      this.pageLoadState.startBackground(this.pageLoadKey);
    }

    this.api.getRolePermissionsOverview(roleKey || this.selectedMatrixRole || undefined).subscribe({
      next: (response) => {
        this.overview = response.data;
        if (!response.data) {
          if (!silent) {
            this.error = 'Khong tai duoc role-permissions tu backend.';
          }
        } else {
          this.selectedMatrixRole = response.data.selected_role_key;
          this.syncNewUserRole();
        }
        this.loading = false;
        this.pageLoadState.finish(this.pageLoadKey);
      },
      error: () => {
        this.loading = false;
        if (!silent) {
          this.error = 'Khong tai duoc role-permissions tu backend.';
        }
        this.pageLoadState.fail(this.pageLoadKey, this.error || 'Không tải được role-permissions.');
      },
    });
  }

  setMatrixRole(roleKey: string): void {
    this.selectedMatrixRole = roleKey;
    this.loadOverview(roleKey);
  }

  openAddUserForm(): void {
    if (!this.canManage) {
      return;
    }

    this.showAddUserForm = true;
    this.showAddRoleForm = false;
    this.syncNewUserRole();
  }

  cancelAddUser(): void {
    this.showAddUserForm = false;
    this.newUser = this.buildNewUserForm();
  }

  submitNewUser(): void {
    if (!this.canManage || this.saving) {
      return;
    }

    if (!this.newUser.username.trim() || !this.newUser.full_name.trim() || !this.newUser.password.trim()) {
      this.error = 'Can nhap username, ho ten va mat khau khoi tao.';
      return;
    }

    this.saving = true;
    this.notice = '';
    this.error = '';

    this.api
      .createRolePermissionUser({
        username: this.newUser.username.trim().toLowerCase(),
        full_name: this.newUser.full_name.trim(),
        email: this.newUser.email.trim(),
        department: this.newUser.department.trim(),
        role_key: this.newUser.role_key.trim().toLowerCase(),
        password: this.newUser.password,
      })
      .subscribe({
        next: (response) => {
          this.saving = false;
          if (!response.data) {
            this.error = 'Khong tao duoc user.';
            return;
          }
          this.notice = `Da tao user ${response.data.username}.`;
          this.cancelAddUser();
          this.loadOverview(this.selectedMatrixRole);
        },
        error: () => {
          this.saving = false;
          this.error = 'Khong tao duoc user.';
        },
      });
  }

  saveUser(row: RolePermissionUser): void {
    if (!this.canManage) {
      return;
    }

    this.saving = true;
    this.notice = '';
    this.error = '';
    this.api
      .updateRolePermissionUser(row.id, {
        full_name: row.full_name,
        email: row.email || '',
        department: row.department || '',
        role_key: row.role_key,
        is_active: row.status === 'active',
      })
      .subscribe({
        next: (response) => {
          this.saving = false;
          if (!response.data) {
            this.error = `Khong luu duoc user ${row.username}.`;
            return;
          }
          this.notice = `Da cap nhat user ${row.username}.`;
          this.loadOverview(this.selectedMatrixRole);
        },
        error: () => {
          this.saving = false;
          this.error = `Khong luu duoc user ${row.username}.`;
        },
      });
  }

  toggleUserStatus(row: RolePermissionUser): void {
    row.status = row.status === 'active' ? 'inactive' : 'active';
  }

  openAddRoleForm(): void {
    if (!this.canManage) {
      return;
    }

    this.showAddRoleForm = true;
    this.showAddUserForm = false;
  }

  cancelAddRole(): void {
    this.showAddRoleForm = false;
    this.newRole = this.buildNewRoleForm();
  }

  submitNewRole(): void {
    if (!this.canManage || this.saving) {
      return;
    }

    if (!this.newRole.key.trim() || !this.newRole.name.trim()) {
      this.error = 'Can nhap role key va ten hien thi.';
      return;
    }

    this.saving = true;
    this.notice = '';
    this.error = '';
    this.api
      .createRolePermissionRole({
        key: this.newRole.key.trim().toLowerCase(),
        name: this.newRole.name.trim(),
        description: this.newRole.description.trim(),
      })
      .subscribe({
        next: (response) => {
          this.saving = false;
          if (!response.data) {
            this.error = 'Khong tao duoc role.';
            return;
          }
          this.notice = `Da tao role ${response.data.name}.`;
          this.selectedMatrixRole = response.data.key;
          this.cancelAddRole();
          this.loadOverview(response.data.key);
        },
        error: () => {
          this.saving = false;
          this.error = 'Khong tao duoc role.';
        },
      });
  }

  saveRole(role: RolePermissionRole): void {
    if (!this.canManage) {
      return;
    }

    this.saving = true;
    this.notice = '';
    this.error = '';
    this.api
      .updateRolePermissionRole(role.key, {
        name: role.name,
        description: role.description || '',
        is_active: role.status === 'active',
      })
      .subscribe({
        next: (response) => {
          this.saving = false;
          if (!response.data) {
            this.error = `Khong luu duoc role ${role.key}.`;
            return;
          }
          this.notice = `Da cap nhat role ${role.name}.`;
          this.loadOverview(this.selectedMatrixRole || role.key);
        },
        error: () => {
          this.saving = false;
          this.error = `Khong luu duoc role ${role.key}.`;
        },
      });
  }

  toggleRoleStatus(role: RolePermissionRole): void {
    role.status = role.status === 'active' ? 'inactive' : 'active';
  }

  saveMatrix(): void {
    if (!this.canManage || !this.selectedMatrixRole) {
      return;
    }

    this.saving = true;
    this.notice = '';
    this.error = '';
    this.api.saveRolePermissionMatrix(this.selectedMatrixRole, this.matrix).subscribe({
      next: (response) => {
        this.saving = false;
        if (!response.data) {
          this.error = 'Khong luu duoc ma tran quyen.';
          return;
        }
        this.notice = `Da luu ma tran quyen cho ${this.selectedMatrixRole}.`;
        this.loadOverview(this.selectedMatrixRole);
      },
      error: () => {
        this.saving = false;
        this.error = 'Khong luu duoc ma tran quyen.';
      },
    });
  }

  roleLabel(roleKey: string): string {
    return this.roles.find((item) => item.key === roleKey)?.name || roleKey;
  }

  formatLogTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    }).format(date);
  }

  trackUser(_: number, item: RolePermissionUser): number {
    return item.id;
  }

  trackRole(_: number, item: RolePermissionRole): number {
    return item.id;
  }

  trackMatrix(_: number, item: RolePermissionMatrixRow): string {
    return item.module_key;
  }

  trackLog(_: number, item: RolePermissionLog): string {
    return `${item.time}-${item.user}-${item.target}`;
  }

  private syncNewUserRole(): void {
    const defaultRole =
      this.selectedRoleFilter !== 'all'
        ? this.selectedRoleFilter
        : this.roles[0]?.key || 'viewer';

    this.newUser = {
      ...this.newUser,
      role_key: this.newUser.role_key || defaultRole,
    };
  }

  private buildNewUserForm(): NewUserForm {
    return {
      username: '',
      full_name: '',
      email: '',
      department: '',
      role_key: '',
      password: 'demo123',
    };
  }

  private buildNewRoleForm(): NewRoleForm {
    return {
      key: '',
      name: '',
      description: '',
    };
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.autoRefreshSub = interval(120000).subscribe(() => {
      if (!this.activeView || this.saving) {
        return;
      }
      this.loadOverview(undefined, true);
    });
  }

  private stopAutoRefresh(): void {
    this.autoRefreshSub?.unsubscribe();
    this.autoRefreshSub = undefined;
  }
}
