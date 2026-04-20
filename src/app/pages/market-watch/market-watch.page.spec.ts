import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MarketWatchPage } from './market-watch.page';

describe('MarketWatchPage', () => {
  let component: MarketWatchPage;
  let fixture: ComponentFixture<MarketWatchPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MarketWatchPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
