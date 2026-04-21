import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppI18nService } from 'src/app/core/i18n/app-i18n.service';
import { AuthService } from 'src/app/core/services/auth.service';

interface LoginHighlight {
  labelKey: string;
  value: string;
  tone: 'up' | 'neutral';
}

interface LoginFeature {
  icon: string;
  title: string;
  text: string;
}

interface DemoAccount {
  label: string;
  companyCode: string;
  username: string;
}

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage {
  companyCode = 'MW';
  username = '';
  password = '';
  rememberMe = true;
  showPassword = false;
  loading = false;
  errorMessage = '';
  helpMessage = '';

  readonly highlights: LoginHighlight[] = [
    { labelKey: 'login.highlightCoverage', value: 'HSX / HNX / UPCOM', tone: 'neutral' },
    { labelKey: 'login.highlightRefresh', value: 'Near real-time', tone: 'up' },
    { labelKey: 'login.highlightAi', value: 'Watchlist + Summary', tone: 'up' },
  ];

  readonly features: LoginFeature[] = [
    {
      icon: 'pulse-outline',
      title: 'Market stream',
      text: 'Theo doi bien dong chi so, dong tien va ma noi bat tren cung mot man hinh.',
    },
    {
      icon: 'sparkles-outline',
      title: 'AI context',
      text: 'AI Agent tra loi theo watchlist, tin tuc va du lieu thi truong dang co.',
    },
    {
      icon: 'shield-checkmark-outline',
      title: 'Role control',
      text: 'Phan quyen theo nguoi dung de chot dung dashboard va tac vu duoc phep dung.',
    },
  ];

  readonly demoAccounts: DemoAccount[] = [
    { label: 'Trader', companyCode: 'MW', username: 'trader.demo' },
    { label: 'Analyst', companyCode: 'MW', username: 'analyst.demo' },
    { label: 'Admin', companyCode: 'MW', username: 'admin.demo' },
  ];

  constructor(
    private router: Router,
    private auth: AuthService,
    private i18n: AppI18nService
  ) {
    this.helpMessage = this.i18n.translate('login.helpDefault');
  }

  get canSubmit(): boolean {
    return Boolean(this.companyCode.trim() && this.username.trim() && this.password.trim()) && !this.loading;
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  useDemo(account: DemoAccount): void {
    this.companyCode = account.companyCode;
    this.username = account.username;
    this.password = 'demo123';
    this.errorMessage = '';
  }

  async submit(): Promise<void> {
    this.errorMessage = '';

    if (!this.companyCode.trim()) {
      this.errorMessage = this.i18n.translate('login.errorCompany');
      return;
    }

    if (!this.username.trim() || !this.password.trim()) {
      this.errorMessage = this.i18n.translate('login.errorCredentials');
      return;
    }

    this.loading = true;

    try {
      const session = await firstValueFrom(
        this.auth.login(this.companyCode, this.username, this.password, this.rememberMe)
      );

      if (!session) {
        this.errorMessage = this.i18n.translate('login.errorFailed');
        return;
      }

      await firstValueFrom(this.auth.refreshSettings());
      await this.router.navigateByUrl(this.auth.resolvePreferredUrl());
    } finally {
      this.loading = false;
    }
  }

  forgotPassword(): void {
    this.errorMessage = '';
    this.helpMessage = this.i18n.translate('login.helpForgot');
  }
}
