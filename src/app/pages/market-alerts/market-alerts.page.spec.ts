import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { MarketAlertsPage } from './market-alerts.page';

describe('MarketAlertsPage', () => {
  let component: MarketAlertsPage;
  let fixture: ComponentFixture<MarketAlertsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MarketAlertsPage],
      imports: [IonicModule.forRoot(), FormsModule, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(MarketAlertsPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
