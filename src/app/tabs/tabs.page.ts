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

  get canViewPermissions(): boolean {
    const permissions = this.auth.profile?.permissions || [];
    return permissions.some((item) => item.startsWith('role-permissions.'));
  }
}
