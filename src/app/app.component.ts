import { Component, OnInit } from '@angular/core';

import { AuthService } from './core/services/auth.service';
import { BackgroundRefreshService } from './core/services/background-refresh.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  constructor(private auth: AuthService, private backgroundRefresh: BackgroundRefreshService) {}

  ngOnInit(): void {
    this.backgroundRefresh.init();
    if (this.auth.isAuthenticated()) {
      this.auth.refreshProfile().subscribe();
    }
  }
}
