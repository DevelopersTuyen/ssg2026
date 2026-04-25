import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { of } from 'rxjs';

import { AppI18nService } from 'src/app/core/i18n/app-i18n.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { BackgroundRefreshService } from 'src/app/core/services/background-refresh.service';
import { MarketApiService } from 'src/app/core/services/market-api.service';
import { DashboardV2Page } from './dashboard-v2.page';

describe('DashboardV2Page', () => {
  let component: DashboardV2Page;
  let fixture: ComponentFixture<DashboardV2Page>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DashboardV2Page],
      imports: [IonicModule.forRoot()],
      providers: [
        {
          provide: MarketApiService,
          useValue: {
            getStrategyOverview: () => of({ data: null }),
            listStrategyJournal: () => of({ data: [] }),
            getMarketAlertsOverview: () => of({ data: null }),
            getStrategyProfileConfig: () => of({ data: null }),
            getStrategySymbolScore: () => of({ data: null }),
          },
        },
        {
          provide: AppI18nService,
          useValue: {
            translate: (key: string) => key,
          },
        },
        {
          provide: AuthService,
          useValue: {
            preferences: null,
            isAuthenticated: () => false,
            refreshSettings: () => of(null),
          },
        },
        {
          provide: BackgroundRefreshService,
          useValue: {
            changes$: of([]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardV2Page);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
