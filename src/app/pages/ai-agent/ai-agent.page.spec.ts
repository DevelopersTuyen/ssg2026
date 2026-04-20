import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AiAgentPage } from './ai-agent.page';

describe('AiAgentPage', () => {
  let component: AiAgentPage;
  let fixture: ComponentFixture<AiAgentPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AiAgentPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
