import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from 'src/app/core/services/auth.service';

interface LoginHighlight {
  label: string;
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
  helpMessage =
    'Dùng tài khoản nội bộ để truy cập dữ liệu thị trường, cảnh báo và AI Agent.';

  readonly highlights: LoginHighlight[] = [
    { label: 'Độ phủ dữ liệu', value: 'HSX / HNX / UPCOM', tone: 'neutral' },
    { label: 'Tần suất cập nhật', value: 'Near real-time', tone: 'up' },
    { label: 'Tác vụ AI', value: 'Watchlist + Summary', tone: 'up' },
  ];

  readonly features: LoginFeature[] = [
    {
      icon: 'pulse-outline',
      title: 'Market stream',
      text: 'Theo dõi biến động chỉ số, dòng tiền và mã nổi bật trên cùng một màn hình.',
    },
    {
      icon: 'sparkles-outline',
      title: 'AI context',
      text: 'AI Agent trả lời theo watchlist, tin tức và dữ liệu thị trường đang có.',
    },
    {
      icon: 'shield-checkmark-outline',
      title: 'Role control',
      text: 'Phân quyền theo người dùng để chốt đúng dashboard và tác vụ được phép dùng.',
    },
  ];

  readonly demoAccounts: DemoAccount[] = [
    { label: 'Trader', companyCode: 'MW', username: 'trader.demo' },
    { label: 'Analyst', companyCode: 'MW', username: 'analyst.demo' },
    { label: 'Admin', companyCode: 'MW', username: 'admin.demo' },
  ];

  constructor(
    private router: Router,
    private auth: AuthService
  ) {}

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
      this.errorMessage = 'Bạn chưa nhập mã công ty.';
      return;
    }

    if (!this.username.trim() || !this.password.trim()) {
      this.errorMessage = 'Bạn cần nhập đầy đủ tài khoản và mật khẩu.';
      return;
    }

    this.loading = true;

    try {
      const session = await firstValueFrom(
        this.auth.login(this.companyCode, this.username, this.password, this.rememberMe)
      );

      if (!session) {
        this.errorMessage = 'Đăng nhập thất bại. Kiểm tra backend auth hoặc thông tin tài khoản.';
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
    this.helpMessage = 'Liên hệ quản trị hệ thống để cấp lại mật khẩu hoặc mở khóa phiên đăng nhập.';
  }
}
