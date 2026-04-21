import { Component } from '@angular/core';

import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: false,
})
export class TabsPage {
  constructor(private auth: AuthService) {}

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
}
