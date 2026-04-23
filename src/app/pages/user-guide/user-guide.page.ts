import { Component } from '@angular/core';
import { Router } from '@angular/router';

interface GuideSection {
  id: string;
  kickerKey: string;
  titleKey: string;
  summaryKey: string;
  stepKeys: string[];
  relatedSettings?: string[];
  targetRoute?: string;
  buttonLabelKey?: string;
}

interface SetupLink {
  titleKey: string;
  descriptionKey: string;
  flowKey: string;
}

interface FormulaGuideBlock {
  titleKey: string;
  summaryKey: string;
  stepKeys: string[];
}

interface StatusGuideGroup {
  titleKey: string;
  summaryKey: string;
  itemKeys: string[];
}

@Component({
  selector: 'app-user-guide',
  templateUrl: './user-guide.page.html',
  styleUrls: ['./user-guide.page.scss'],
  standalone: false,
})
export class UserGuidePage {
  readonly setupChecklist = ['guide.step1', 'guide.step2', 'guide.step3', 'guide.step4', 'guide.step5', 'guide.step6'];

  readonly formulaGuideBlocks: FormulaGuideBlock[] = [
    {
      titleKey: 'guide.formulas.block1Title',
      summaryKey: 'guide.formulas.block1Summary',
      stepKeys: ['guide.formulas.block1Step1', 'guide.formulas.block1Step2', 'guide.formulas.block1Step3'],
    },
    {
      titleKey: 'guide.formulas.block2Title',
      summaryKey: 'guide.formulas.block2Summary',
      stepKeys: ['guide.formulas.block2Step1', 'guide.formulas.block2Step2', 'guide.formulas.block2Step3'],
    },
    {
      titleKey: 'guide.formulas.block3Title',
      summaryKey: 'guide.formulas.block3Summary',
      stepKeys: ['guide.formulas.block3Step1', 'guide.formulas.block3Step2', 'guide.formulas.block3Step3'],
    },
    {
      titleKey: 'guide.formulas.block4Title',
      summaryKey: 'guide.formulas.block4Summary',
      stepKeys: ['guide.formulas.block4Step1', 'guide.formulas.block4Step2', 'guide.formulas.block4Step3'],
    },
  ];

  readonly statusGuideGroups: StatusGuideGroup[] = [
    {
      titleKey: 'guide.states.group1Title',
      summaryKey: 'guide.states.group1Summary',
      itemKeys: [
        'guide.states.group1Item1',
        'guide.states.group1Item2',
        'guide.states.group1Item3',
        'guide.states.group1Item4',
      ],
    },
    {
      titleKey: 'guide.states.group2Title',
      summaryKey: 'guide.states.group2Summary',
      itemKeys: [
        'guide.states.group2Item1',
        'guide.states.group2Item2',
        'guide.states.group2Item3',
        'guide.states.group2Item4',
      ],
    },
    {
      titleKey: 'guide.states.group3Title',
      summaryKey: 'guide.states.group3Summary',
      itemKeys: [
        'guide.states.group3Item1',
        'guide.states.group3Item2',
        'guide.states.group3Item3',
        'guide.states.group3Item4',
      ],
    },
    {
      titleKey: 'guide.states.group4Title',
      summaryKey: 'guide.states.group4Summary',
      itemKeys: [
        'guide.states.group4Item1',
        'guide.states.group4Item2',
        'guide.states.group4Item3',
        'guide.states.group4Item4',
      ],
    },
    {
      titleKey: 'guide.states.group5Title',
      summaryKey: 'guide.states.group5Summary',
      itemKeys: [
        'guide.states.group5Item1',
        'guide.states.group5Item2',
        'guide.states.group5Item3',
        'guide.states.group5Item4',
      ],
    },
  ];

  readonly setupLinks: SetupLink[] = [
    {
      titleKey: 'guide.link1Title',
      descriptionKey: 'guide.link1Desc',
      flowKey: 'guide.link1Flow',
    },
    {
      titleKey: 'guide.link2Title',
      descriptionKey: 'guide.link2Desc',
      flowKey: 'guide.link2Flow',
    },
    {
      titleKey: 'guide.link3Title',
      descriptionKey: 'guide.link3Desc',
      flowKey: 'guide.link3Flow',
    },
    {
      titleKey: 'guide.link4Title',
      descriptionKey: 'guide.link4Desc',
      flowKey: 'guide.link4Flow',
    },
  ];

  readonly sections: GuideSection[] = [
    {
      id: 'dashboard',
      kickerKey: 'guide.dashboard.kicker',
      titleKey: 'guide.dashboard.title',
      summaryKey: 'guide.dashboard.summary',
      stepKeys: ['guide.dashboard.step1', 'guide.dashboard.step2', 'guide.dashboard.step3', 'guide.dashboard.step4'],
      relatedSettings: ['defaultExchange', 'startupPage', 'theme', 'syncMarketData', 'syncNewsData'],
      targetRoute: '/tabs/dashboard',
      buttonLabelKey: 'guide.dashboard.open',
    },
    {
      id: 'market-watch',
      kickerKey: 'guide.market.kicker',
      titleKey: 'guide.market.title',
      summaryKey: 'guide.market.summary',
      stepKeys: ['guide.market.step1', 'guide.market.step2', 'guide.market.step3', 'guide.market.step4'],
      relatedSettings: ['defaultExchange', 'defaultTimeRange', 'compactTable', 'showSparkline'],
      targetRoute: '/tabs/market-watch',
      buttonLabelKey: 'guide.market.open',
    },
    {
      id: 'alerts',
      kickerKey: 'guide.alerts.kicker',
      titleKey: 'guide.alerts.title',
      summaryKey: 'guide.alerts.summary',
      stepKeys: ['guide.alerts.step1', 'guide.alerts.step2', 'guide.alerts.step3'],
      relatedSettings: [
        'pushAlerts',
        'emailAlerts',
        'soundAlerts',
        'alertStrength',
        'volumeSpikeThreshold',
        'priceMoveThreshold',
      ],
      targetRoute: '/tabs/market-alerts',
      buttonLabelKey: 'guide.alerts.open',
    },
    {
      id: 'ai',
      kickerKey: 'guide.ai.kicker',
      titleKey: 'guide.ai.title',
      summaryKey: 'guide.ai.summary',
      stepKeys: ['guide.ai.step1', 'guide.ai.step2', 'guide.ai.step3', 'guide.ai.step4'],
      relatedSettings: [
        'aiEnabled',
        'aiModel',
        'aiSummaryAuto',
        'aiWatchlistMonitor',
        'aiExplainMove',
        'aiNewsDigest',
        'aiTaskSchedule',
      ],
      targetRoute: '/tabs/ai-local',
      buttonLabelKey: 'guide.ai.open',
    },
    {
      id: 'strategy',
      kickerKey: 'guide.strategy.kicker',
      titleKey: 'guide.strategy.title',
      summaryKey: 'guide.strategy.summary',
      stepKeys: ['guide.strategy.step1', 'guide.strategy.step2', 'guide.strategy.step3', 'guide.strategy.step4'],
      relatedSettings: ['profile chiến lược', 'công thức', 'luật lọc', 'luật cảnh báo', 'checklist', 'phiên bản', 'điểm dòng tiền', 'OBV', 'bối cảnh giá', 'tích lũy trước tin', 'dòng tiền trước tin'],
      targetRoute: '/tabs/strategy-hub',
      buttonLabelKey: 'guide.strategy.open',
    },
    {
      id: 'settings',
      kickerKey: 'guide.settings.kicker',
      titleKey: 'guide.settings.title',
      summaryKey: 'guide.settings.summary',
      stepKeys: ['guide.settings.step1', 'guide.settings.step2', 'guide.settings.step3', 'guide.settings.step4'],
      relatedSettings: ['language', 'theme', 'startupPage', 'syncMarketData', 'syncNewsData', 'permissions matrix'],
      targetRoute: '/tabs/market-settings',
      buttonLabelKey: 'guide.settings.open',
    },
  ];

  constructor(private router: Router) {}

  openRoute(route?: string): void {
    if (!route) {
      return;
    }
    this.router.navigateByUrl(route);
  }

  scrollToSection(id: string): void {
    const element = document.getElementById(id);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

