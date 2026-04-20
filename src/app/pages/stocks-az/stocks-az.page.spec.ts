import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StocksAzPage } from './stocks-az.page';

describe('StocksAzPage', () => {
  let component: StocksAzPage;
  let fixture: ComponentFixture<StocksAzPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(StocksAzPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
