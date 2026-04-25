import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { of } from 'rxjs';

import { AuthService } from 'src/app/core/services/auth.service';
import { MarketApiService } from 'src/app/core/services/market-api.service';

import { AiLocalPage } from './ai-local.page';

describe('AiLocalPage', () => {
  let component: AiLocalPage;
  let fixture: ComponentFixture<AiLocalPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AiLocalPage],
      imports: [IonicModule.forRoot()],
      providers: [
        {
          provide: MarketApiService,
          useValue: {
            getAiLocalOverview: () => of({ data: null }),
            chatWithAiLocal: () => of({ data: null }),
          },
        },
        {
          provide: AuthService,
          useValue: {
            preferences: {
              defaultExchange: 'HSX',
              aiLocalAutoAnalysis: false,
              aiLocalFinancialAnalysis: false,
            },
            isAuthenticated: () => true,
            refreshSettings: () => of(null),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AiLocalPage);
    component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });
});
