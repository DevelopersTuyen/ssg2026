import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { MarketSettingsPage } from './market-settings.page';

describe('MarketSettingsPage', () => {
  let component: MarketSettingsPage;
  let fixture: ComponentFixture<MarketSettingsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MarketSettingsPage],
      imports: [IonicModule.forRoot(), FormsModule, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(MarketSettingsPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
