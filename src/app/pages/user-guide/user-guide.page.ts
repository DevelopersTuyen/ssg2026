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

interface PracticalGuideBlock {
  id: string;
  kicker: string;
  title: string;
  summary: string;
  targetRoute?: string;
  buttonLabel?: string;
  steps: string[];
}

interface PracticalFlowStage {
  title: string;
  goal: string;
  steps: string[];
  targetRoute?: string;
}

interface PracticalModuleGuide {
  title: string;
  purpose: string;
  whenToUse: string;
  route?: string;
  actions: string[];
  cautions: string[];
}

interface WorkflowStateGuide {
  state: string;
  meaning: string;
  userAction: string;
}

interface FaqGuideItem {
  question: string;
  answer: string;
}

interface FormulaExplainGuide {
  title: string;
  summary: string;
  bullets: string[];
}

interface WorkflowOperationStage {
  title: string;
  summary: string;
  effects: string[];
}

interface FormulaMetricGuide {
  name: string;
  purpose: string;
  description: string;
  formulaText: string;
  interpretation: string[];
}

@Component({
  selector: 'app-user-guide',
  templateUrl: './user-guide.page.html',
  styleUrls: ['./user-guide.page.scss'],
  standalone: false,
})
export class UserGuidePage {
  guideSearchTerm = '';

  readonly formulaMetricGuides: FormulaMetricGuide[] = [
    {
      name: 'Q Score',
      purpose: 'Đo chất lượng nền của cơ hội trước khi bàn đến chuyện tăng mạnh hay không.',
      description:
        'Q Score thường phản ánh thanh khoản, độ ổn định, bối cảnh tin tức và trạng thái watchlist. Nó giúp loại các mã quá yếu nền, quá nhiễu hoặc thiếu điều kiện cơ bản để theo dõi tiếp.',
      formulaText:
        '(w_liquidity * liquidity_score) + (w_stability * stability_score) + (w_news * news_score) + (w_watchlist * watchlist_bonus)',
      interpretation: [
        'Q cao: mã có nền giao dịch ổn, dễ theo dõi, ít nhiễu hơn và có bối cảnh hỗ trợ tốt hơn.',
        'Q thấp: chưa nên ưu tiên, dù giá có thể đang tăng ngắn hạn.',
        'Nếu Q thấp nhưng các score khác cao, thường nên xem lại rủi ro nền trước khi hành động.',
      ],
    },
    {
      name: 'L Score',
      purpose: 'Đo mức độ dẫn dắt và sức mạnh xu hướng của mã trong bối cảnh thị trường.',
      description:
        'L Score thường đọc leadership, market trend, volume và momentum để biết mã có đang là mã mạnh thật hay chỉ là nhịp bật kỹ thuật ngắn.',
      formulaText:
        '(w_leadership * leadership_score) + (w_market * market_trend_score) + (w_volume * volume_score) + (w_price * momentum_score)',
      interpretation: [
        'L cao: mã có xu hướng mạnh, dẫn dắt tốt và vận động cùng chiều với bối cảnh thuận lợi hơn.',
        'L thấp: mã chưa chứng minh được vai trò leader hoặc đang lệch pha với thị trường.',
        'L là lớp rất quan trọng khi cần chọn cơ hội mua theo xu hướng thay vì chỉ nhìn giá rẻ.',
      ],
    },
    {
      name: 'M Score',
      purpose: 'Đo chất lượng động lượng và mức độ xác nhận của dòng tiền.',
      description:
        'M Score thường nghiêng về momentum, volume confirmation, money flow và market trend. Nó giúp phân biệt một nhịp tăng có dòng tiền xác nhận với một nhịp tăng thiếu hậu thuẫn.',
      formulaText:
        '(w_momentum * momentum_score) + (w_confirmation * volume_confirmation_score) + (w_money_flow * money_flow_score) + (w_market * market_trend_score)',
      interpretation: [
        'M cao: động lượng đang được xác nhận tương đối rõ bởi volume hoặc money flow.',
        'M thấp: có thể giá đang nhích nhưng chưa đủ xác nhận để tin vào độ bền của nhịp tăng.',
        'M đặc biệt hữu ích cho các quyết định mua thăm dò, gia tăng hoặc giữ vị thế theo đà.',
      ],
    },
    {
      name: 'P Score',
      purpose: 'Đo điều kiện giá và lớp rủi ro trước khi vào lệnh hoặc giữ lệnh.',
      description:
        'P Score thường lấy các thành phần liên quan đến rủi ro giá, độ nóng, biến động và divisor tối thiểu. Nó là lớp phanh an toàn để không bị cuốn theo các mã đang quá nóng hoặc biến động khó kiểm soát.',
      formulaText:
        'max(min_price_divisor, (w_price_risk * price_risk_score) + (w_hotness * hotness_score) + (w_volatility * volatility_score))',
      interpretation: [
        'P cao theo nghĩa rủi ro: cần cẩn thận hơn, xem lại stop-loss, vị thế và timing.',
        'P ổn định: điều kiện giá dễ quản trị hơn và ít nguy cơ bị nhiễu cực mạnh.',
        'Đừng đọc P tách rời khỏi Q/L/M; P là lớp kiểm tra vào lệnh có an toàn tương đối hay không.',
      ],
    },
    {
      name: 'Winning Score',
      purpose: 'Là lớp kết luận tổng hợp để hệ thống hình thành bias và action.',
      description:
        'Winning Score thường lấy các nhóm score chính rồi chuẩn hóa theo lớp risk/price để tạo ra kết quả tổng hợp dễ dùng hơn cho Formula Verdict, AI và workflow.',
      formulaText: '((Q + L + M) / P) hoặc biến thể tương đương theo profile chiến lược',
      interpretation: [
        'Winning Score cao: cơ hội tổng thể tốt hơn theo logic profile hiện tại.',
        'Winning Score không thay thế PASS/FAIL; một mã vẫn có thể score cao nhưng fail rule quan trọng.',
        'Đây là score nên dùng để xếp ưu tiên, không phải để bỏ qua phân tích chi tiết.',
      ],
    },
  ];

  readonly formulaExplainGuides: FormulaExplainGuide[] = [
    {
      title: '1. Công thức dùng để làm gì',
      summary: 'Công thức là bộ não quy tắc của hệ thống. AI, workflow và cảnh báo đều nên bám theo công thức thay vì tự suy diễn rời rạc.',
      bullets: [
        'Công thức biến dữ liệu giá, volume, dòng tiền, tin tức, market trend, financial và checklist thành điểm số có cấu trúc.',
        'Mỗi profile chiến lược có thể có bộ trọng số, rule và checklist khác nhau.',
        'Người dùng không nên nhìn một chỉ số lẻ; phải nhìn đồng thời score, pass/fail và formula verdict.',
      ],
    },
    {
      title: '2. Cách đọc Q / L / M / P / Winning Score',
      summary: 'Các điểm số không cùng ý nghĩa, nên đọc đúng vai trò của từng nhóm trước khi quyết định.',
      bullets: [
        'Q Score nghiêng về chất lượng nền của cơ hội: thanh khoản, độ ổn định, bối cảnh tin tức, trạng thái watchlist.',
        'L Score nghiêng về leadership và xu hướng vận động của mã so với thị trường.',
        'M Score nghiêng về momentum, xác nhận volume, money flow và market trend.',
        'P Score nghiêng về risk/price condition. Điểm này giúp tránh mua vào khi rủi ro giá còn xấu.',
        'Winning Score là lớp kết luận tổng hợp để hỗ trợ bias và action, nhưng vẫn phải đọc cùng pass/fail detail.',
      ],
    },
    {
      title: '3. Cách đọc PASS / FAIL đúng',
      summary: 'PASS/FAIL mới là phần dễ hành động nhất. Điểm số cao nhưng fail rule quan trọng vẫn có thể là mã chưa nên vào lệnh.',
      bullets: [
        'Khối Những điểm đang trượt cho biết mã đang fail ở đâu và vì sao fail.',
        'Screen rules thường quyết định mã có được lọc vào danh sách cơ hội hay không.',
        'Alert rules thường quyết định có sinh cảnh báo hoặc workflow cần xử lý hay không.',
        'Checklist giúp kiểm tra kỷ luật trước khi hành động, nhất là với các điều kiện thủ công và bối cảnh riêng.',
      ],
    },
    {
      title: '4. Formula Verdict là kết luận cuối',
      summary: 'Verdict gom score, pass, fail, alert và execution plan về một kết luận dễ đọc hơn cho người dùng và AI.',
      bullets: [
        'Bias cho biết nghiêng tăng, nghiêng giảm hay trung tính.',
        'Action cho biết nên làm gì tiếp theo: theo dõi, chờ xác nhận, mua thăm dò, quản trị vị thế, chốt lời, cắt lỗ...',
        'Confidence cho biết mức độ tự tin của kết luận này theo dữ liệu hiện có.',
        'Key passes, key fails và key alerts là 3 thứ nên đọc đầu tiên khi mở mã.',
      ],
    },
    {
      title: '5. Khi nào nên sửa công thức',
      summary: 'Chỉ sửa công thức sau khi đã review đầu ra, không sửa theo cảm giác ngay trong phiên.',
      bullets: [
        'So lại mã thắng/thua với formula verdict cuối ngày để xem rule nào hữu ích thật.',
        'Nếu chỉ một mã lệch mà phần lớn mã còn lại vẫn đúng, không nên sửa cả profile quá vội.',
        'Mỗi lần chỉ sửa một cụm logic: weight, threshold, checklist hoặc alert rule, để còn đo tác động.',
      ],
    },
  ];

  readonly workflowOperationStages: WorkflowOperationStage[] = [
    {
      title: '1. Workflow sinh ra từ đâu',
      summary: 'Workflow không tự xuất hiện ngẫu nhiên. Nó được tạo từ rule, verdict, review queue, portfolio alert hoặc thao tác thủ công của người dùng.',
      effects: [
        'Nếu rule phát hiện cần hành động, hệ thống sinh suggested action hoặc workflow mở.',
        'Nếu người dùng chủ động muốn theo dõi một mã, có thể tự đưa mã vào workflow.',
        'Portfolio alerts và journal state cũng có thể làm xuất hiện workflow quản trị vị thế.',
      ],
    },
    {
      title: '2. Manual và Automatic khác nhau thế nào',
      summary: 'Hai mode này dùng chung logic nghiệp vụ, nhưng khác ở người thực hiện bước chốt hành động.',
      effects: [
        'Manual: workflow mở ra rồi chờ người dùng xác nhận hoàn tất, bỏ qua hoặc ghi chú thêm.',
        'Automatic: hệ thống tự lấy handled price/quantity theo dữ liệu hiện có rồi cập nhật kết quả trong app.',
        'Automatic hiện là auto trong app, chưa phải gửi lệnh thật ra broker.',
      ],
    },
    {
      title: '3. Workflow cập nhật gì trong hệ thống',
      summary: 'Khi workflow thay đổi trạng thái, nhiều lớp khác cũng thay đổi theo.',
      effects: [
        'History sẽ ghi lại trạng thái trước/sau, handled price, handled time và note.',
        'Journal có thể được cập nhật exit price, result hoặc snapshot nếu workflow là take profit/cut loss/add position.',
        'Portfolio và Vị thế trong Dashboard V2 đọc từ journal summary nên sẽ phản ánh thay đổi sau đó.',
      ],
    },
    {
      title: '4. Đọc workflow thế nào cho đúng',
      summary: 'Người dùng nên nhìn workflow như hàng đợi hành động, không phải chỉ là danh sách cảnh báo.',
      effects: [
        'Đang chạy: hệ thống đang xử lý hoặc đang giữ trạng thái automatic open.',
        'Đang chờ người dùng: cần bạn quyết định hoặc xác nhận thao tác tiếp theo.',
        'Đã dừng: quyết định không xử lý nữa theo điều kiện hiện tại.',
        'Đã hoàn tất: tác vụ đã được xử lý xong và nên chuyển sang review hiệu quả.',
      ],
    },
    {
      title: '5. Luồng chuẩn sau khi có workflow',
      summary: 'Nếu người dùng mới bám đúng luồng này thì sẽ không bị rối giữa Journal, Workflow, Portfolio và History.',
      effects: [
        'Đọc lý do sinh workflow và formula verdict trước.',
        'Xem vị thế hiện tại, giá trước xử lý, giá sau xử lý và impact vào portfolio.',
        'Chỉ sau đó mới chọn hoàn tất, dừng, mở lại hoặc chỉnh note.',
      ],
    },
  ];

  readonly practicalQuickStart: PracticalGuideBlock[] = [
    {
      id: 'quick-start',
      kicker: 'Bắt đầu',
      title: 'Làm quen hệ thống trong 10 phút',
      summary: 'Đi theo đúng thứ tự này để người mới không bị rối và nhìn đúng ý nghĩa của từng màn.',
      targetRoute: '/tabs/dashboard-v2',
      buttonLabel: 'Mở Dashboard V2',
      steps: [
        'Đăng nhập bằng tài khoản nội bộ và kiểm tra đúng công ty, đúng người dùng, đúng môi trường dữ liệu.',
        'Vào Market Settings để kiểm tra ngôn ngữ, theme, sàn mặc định và trạng thái đồng bộ dữ liệu.',
        'Xem Market Settings > Data trước để chắc hệ thống đang có quote, intraday, financial, news và không bị đứng job nền.',
        'Quay lại Dashboard V2 để nhìn bức tranh tổng thể: Journal, Vị thế, Danh mục, Workflow, Lịch sử.',
        'Nếu chỉ phân tích mã, đi vào Strategy Hub hoặc mở modal chi tiết mã từ Dashboard V2.',
        'Nếu muốn dùng AI, kiểm tra trước AI Local model hoặc AI Agent online trong phần Settings > AI.',
      ],
    },
    {
      id: 'first-day',
      kicker: 'Ngày đầu',
      title: 'Những việc phải làm ngay trong ngày đầu tiên',
      summary: 'Đây là checklist tối thiểu để hệ thống bắt đầu hữu ích và không bị dùng sai từ đầu.',
      targetRoute: '/tabs/market-settings',
      buttonLabel: 'Mở Market Settings',
      steps: [
        'Chọn nguồn dữ liệu đúng: Quote/Intraday/Index/Symbol master ưu tiên VCI, Financial ưu tiên CAFEF.',
        'Đặt nhịp sync an toàn theo giới hạn hiện tại của vnstock, không chỉnh quá thấp gây rate limit.',
        'Tạo hoặc chọn profile chiến lược sẽ dùng chính, vì Dashboard V2 và Formula Verdict bám vào profile đang active.',
        'Nhập một số dòng Sao kê khớp lệnh mẫu, rồi kiểm tra Entries có tự tổng hợp đúng không.',
        'Kiểm tra Vị thế và Danh mục trong Dashboard V2 để xác nhận đối soát statement -> entry -> portfolio đang chạy đúng.',
        'Bật workflow auto chỉ sau khi đã hiểu rõ manual flow và biết hệ thống sẽ tạo action theo rule nào.',
      ],
    },
  ];

  readonly practicalDailyFlow: PracticalFlowStage[] = [
    {
      title: '1. Trước phiên',
      goal: 'Kiểm tra dữ liệu nền và chọn đúng danh sách cần theo dõi trước khi ra quyết định.',
      targetRoute: '/tabs/market-settings',
      steps: [
        'Mở Data để kiểm tra runtime, source, coverage, lag và xem có job nào đang fail không.',
        'Mở Strategy/Formula để chắc profile hiện tại đúng với kiểu giao dịch hôm nay.',
        'Chuẩn bị watchlist hoặc danh sách mã trọng tâm để AI và workflow bám theo.',
      ],
    },
    {
      title: '2. Trong phiên',
      goal: 'Ưu tiên nhận biết mã cần chú ý, mã đang rủi ro và hành động tiếp theo.',
      targetRoute: '/tabs/dashboard-v2',
      steps: [
        'Mở Dashboard V2, chọn đúng sàn và đọc Insight đầu trang trước.',
        'Xem tab Workflow để biết mã nào đang chạy tự động, mã nào chờ người dùng, mã nào đã dừng.',
        'Xem tab Danh mục để theo dõi tỷ trọng, cost basis, unrealized P/L và cảnh báo tập trung.',
        'Bấm vào từng mã để mở Formula, Financial analysis, History và Symbol intelligence trước khi quyết định.',
      ],
    },
    {
      title: '3. Sau khi có lệnh khớp',
      goal: 'Ghi nhận đúng execution thực tế để hệ thống tự hiểu vị thế đang vào/ra như thế nào.',
      targetRoute: '/tabs/market-settings',
      steps: [
        'Nhập các dòng khớp lệnh vào Sao kê khớp lệnh, không nhập tắt vào Entries nếu dữ liệu khớp đã có.',
        'Bấm Lưu tất cả để hệ thống đối soát statement sang Entries.',
        'Kiểm tra Entries có hiện số fills liên kết, tổng giá trị và ngày khớp gần nhất hay chưa.',
        'Quay lại Dashboard V2 > Journal/Vị thế/Danh mục để xác nhận trạng thái đã thay đổi đúng.',
      ],
    },
    {
      title: '4. Cuối ngày',
      goal: 'Review hiệu quả, sai sót và quyết định còn mở để ngày sau không lặp lại lỗi.',
      targetRoute: '/tabs/dashboard-v2',
      steps: [
        'Mở tab Lịch sử trong Journal - Growth Discipline để xem workflow nào đã hoàn tất, workflow nào đã dừng.',
        'Đối chiếu Journal với Order Statement để xem có dòng khớp lệnh nào chưa được tổng hợp đúng vào Entries hay không.',
        'Xem lại Formula Verdict của các mã thắng/thua để hiểu rule nào đang hữu ích và rule nào cần chỉnh.',
        'Chỉ sau khi review xong mới sửa formula, threshold, auto policy hoặc cấu hình AI.',
      ],
    },
  ];

  readonly practicalModuleGuides: PracticalModuleGuide[] = [
    {
      title: 'Dashboard V2',
      purpose: 'Màn vận hành chính để nhìn tổng thể thị trường, journal, vị thế, danh mục, workflow và lịch sử.',
      whenToUse: 'Dùng khi cần biết ngay bây giờ phải chú ý mã nào, vị thế nào, workflow nào.',
      route: '/tabs/dashboard-v2',
      actions: [
        'Chọn đúng sàn hoặc ALL.',
        'Đọc insight đầu trang và sync health nếu có cảnh báo.',
        'Chuyển qua các tab Journal / Vị thế / Danh mục / Workflow / Lịch sử.',
        'Bấm vào mã để mở modal chi tiết và đọc Formula Verdict trước khi hành động.',
      ],
      cautions: [
        'Không xem Dashboard V2 như nơi nhập lệnh khớp thực tế.',
        'Nếu dữ liệu lạ, kiểm tra Data ở Settings trước khi kết luận hệ thống sai.',
      ],
    },
    {
      title: 'Strategy Hub',
      purpose: 'Nơi chuẩn hóa cách lọc cơ hội bằng formula, screen rule, alert rule và checklist.',
      whenToUse: 'Dùng khi muốn thay đổi logic phân tích hoặc đánh giá vì sao mã pass/fail.',
      route: '/tabs/strategy-hub',
      actions: [
        'Chọn đúng profile chiến lược.',
        'Xem scoring và screener trước khi sửa công thức.',
        'Chỉ chỉnh một nhóm logic mỗi lần để biết tác động thật.',
        'Lưu version trước khi publish thay đổi lớn.',
      ],
      cautions: [
        'Không sửa công thức giữa phiên nếu chưa hiểu tác động.',
        'Không dùng AI thay thế cho formula; AI chỉ nên giải thích formula.',
      ],
    },
    {
      title: 'Market Settings',
      purpose: 'Trung tâm cấu hình dữ liệu, AI, workflow automation, journal và bảo mật.',
      whenToUse: 'Dùng khi cần chỉnh nguồn dữ liệu, nhịp sync, AI model, history, journal, security.',
      route: '/tabs/market-settings',
      actions: [
        'Kiểm tra Data coverage và job health đầu tiên.',
        'Kiểm tra AI online/local trước khi bật auto analysis.',
        'Nhập Sao kê khớp lệnh khi có execution thật.',
        'Dùng Entries để xem bản tổng hợp nghiệp vụ sau khi đối soát.',
      ],
      cautions: [
        'Không hạ thời gian sync quá thấp nếu đang dùng gói community của vnstock.',
        'Không coi Entries là statement chi tiết; Entries là summary.',
      ],
    },
    {
      title: 'AI Local / AI Agent',
      purpose: 'Lớp giải thích quyết định dựa trên formula verdict, watchlist, dữ liệu thị trường và tin tức.',
      whenToUse: 'Dùng khi cần tóm tắt nhanh, đọc bull/bear/risk/action và hiểu vì sao mã được chú ý.',
      route: '/tabs/ai-local',
      actions: [
        'Kiểm tra trạng thái provider/model trước.',
        'Dùng prompt template phù hợp thay vì hỏi quá rộng.',
        'So AI output với Formula Verdict và workflow state trước khi tin hoàn toàn.',
      ],
      cautions: [
        'Nếu thiếu intraday hoặc financial coverage, confidence của AI phải được hiểu thấp hơn.',
        'AI không thay thế risk control và không thay thế execution record.',
      ],
    },
    {
      title: 'Journal, Order Statement, Entries',
      purpose: 'Lớp ghi nhận quyết định và execution để hệ thống hiểu vị thế thực tế.',
      whenToUse: 'Dùng sau khi có lệnh khớp hoặc khi cần đối chiếu vị thế đang nắm giữ.',
      route: '/tabs/market-settings',
      actions: [
        'Nhập từng fill vào Sao kê khớp lệnh.',
        'Bấm Lưu tất cả.',
        'Mở Entries để xem bản summary đã ăn theo bao nhiêu fills.',
        'Kiểm tra Dashboard V2 để xác nhận position/portfolio đã cập nhật.',
      ],
      cautions: [
        'Không nhập một dữ liệu execution ở cả hai bảng nếu đã có statement chi tiết.',
        'Nếu fill chưa link sang entry, phải kiểm tra save backend hoặc mapping profile/symbol.',
      ],
    },
  ];

  readonly workflowStateGuide: WorkflowStateGuide[] = [
    {
      state: 'Đang chạy',
      meaning: 'Workflow automatic đang được hệ thống xử lý hoặc đang ở trạng thái mở tự động.',
      userAction: 'Theo dõi note, nguồn sinh action và kết quả sau xử lý. Chỉ can thiệp nếu logic sai hoặc muốn dừng.',
    },
    {
      state: 'Đang chờ người dùng',
      meaning: 'Workflow manual đã được tạo nhưng chưa có xác nhận hoàn tất hoặc dừng.',
      userAction: 'Đọc lý do, kiểm tra giá hiện tại, rồi chọn chốt lời, cắt lỗ, rebalance, ghi chú hoặc bỏ qua.',
    },
    {
      state: 'Đã dừng',
      meaning: 'Workflow đã bị dismissed hoặc dừng theo nghiệp vụ.',
      userAction: 'Chỉ mở lại nếu điều kiện thị trường đổi hoặc trước đó dừng nhầm.',
    },
    {
      state: 'Đã hoàn tất',
      meaning: 'Workflow đã được xử lý xong và đã ghi nhận vào history.',
      userAction: 'Xem lại hiệu quả phần trăm, giá trị, handled price và note để rút kinh nghiệm.',
    },
  ];

  readonly journalRelationshipGuide: string[] = [
    'Sao kê khớp lệnh là bảng chi tiết execution thực tế. Mỗi dòng là một fill hoặc một lệnh khớp.',
    'Entries là bảng tổng hợp nghiệp vụ ăn theo Sao kê khớp lệnh. Một entry có thể ăn theo nhiều fills.',
    'Portfolio và Vị thế trong Dashboard V2 không lấy trực tiếp từ statement, mà lấy từ dữ liệu tổng hợp sau đối soát.',
    'Nếu statement lưu được mà Dashboard chưa đổi, phải kiểm tra đối soát, profile, symbol hoặc backend route.',
  ];

  readonly commonMistakesGuide: FaqGuideItem[] = [
    {
      question: 'Tại sao nhập Sao kê khớp lệnh xong nhưng Dashboard V2 chưa thay đổi?',
      answer: 'Vì statement mới chỉ là execution detail. Hệ thống phải lưu thành công, đối soát sang Entries, rồi Entries mới phản ánh sang portfolio/workflow/history.',
    },
    {
      question: 'Khi nào mã trong Journal vào Workflow?',
      answer: 'Không phải cứ có journal là vào workflow. Nó vào khi rule tạo suggested action, có pending workflow, hoặc bạn chủ động đưa vào workflow.',
    },
    {
      question: 'Tại sao chỉ có một vài mã có intraday hoặc cash flow?',
      answer: 'Do coverage và backfill đang chạy theo batch, còn phụ thuộc giới hạn request/phút và upstream source.',
    },
    {
      question: 'Khi nào nên tin AI?',
      answer: 'Khi AI output bám đúng Formula Verdict, có data freshness rõ, có source trace, và không mâu thuẫn với workflow/portfolio state.',
    },
    {
      question: 'Lúc nào cần sửa Formula?',
      answer: 'Sau review cuối ngày hoặc sau khi so output với thực tế thị trường, không nên sửa cảm tính giữa phiên.',
    },
  ];

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

  get hasGuideSearch(): boolean {
    return this.normalizeText(this.guideSearchTerm).length > 0;
  }

  get filteredPracticalQuickStart(): PracticalGuideBlock[] {
    return this.practicalQuickStart.filter((item) =>
      this.matchesGuideText(item.kicker, item.title, item.summary, ...item.steps, item.buttonLabel ?? '', item.targetRoute ?? ''),
    );
  }

  get filteredPracticalDailyFlow(): PracticalFlowStage[] {
    return this.practicalDailyFlow.filter((item) =>
      this.matchesGuideText(item.title, item.goal, ...item.steps, item.targetRoute ?? ''),
    );
  }

  get filteredPracticalModuleGuides(): PracticalModuleGuide[] {
    return this.practicalModuleGuides.filter((item) =>
      this.matchesGuideText(item.title, item.purpose, item.whenToUse, ...item.actions, ...item.cautions, item.route ?? ''),
    );
  }

  get filteredFormulaExplainGuides(): FormulaExplainGuide[] {
    return this.formulaExplainGuides.filter((item) =>
      this.matchesGuideText(item.title, item.summary, ...item.bullets),
    );
  }

  get filteredFormulaMetricGuides(): FormulaMetricGuide[] {
    return this.formulaMetricGuides.filter((item) =>
      this.matchesGuideText(item.name, item.purpose, item.description, item.formulaText, ...item.interpretation),
    );
  }

  get filteredJournalRelationshipGuide(): string[] {
    return this.journalRelationshipGuide.filter((item) => this.matchesGuideText(item));
  }

  get filteredWorkflowOperationStages(): WorkflowOperationStage[] {
    return this.workflowOperationStages.filter((item) =>
      this.matchesGuideText(item.title, item.summary, ...item.effects),
    );
  }

  get filteredWorkflowStateGuide(): WorkflowStateGuide[] {
    return this.workflowStateGuide.filter((item) =>
      this.matchesGuideText(item.state, item.meaning, item.userAction),
    );
  }

  get filteredCommonMistakesGuide(): FaqGuideItem[] {
    return this.commonMistakesGuide.filter((item) => this.matchesGuideText(item.question, item.answer));
  }

  get hasGuideSearchResults(): boolean {
    return (
      this.filteredPracticalQuickStart.length > 0 ||
      this.filteredPracticalDailyFlow.length > 0 ||
      this.filteredPracticalModuleGuides.length > 0 ||
      this.filteredFormulaExplainGuides.length > 0 ||
      this.filteredFormulaMetricGuides.length > 0 ||
      this.filteredJournalRelationshipGuide.length > 0 ||
      this.filteredWorkflowOperationStages.length > 0 ||
      this.filteredWorkflowStateGuide.length > 0 ||
      this.filteredCommonMistakesGuide.length > 0
    );
  }

  onGuideSearch(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.guideSearchTerm = (target?.value ?? '').replace(/^\s+/, '');
  }

  clearGuideSearch(): void {
    this.guideSearchTerm = '';
  }

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

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  private matchesGuideText(...values: string[]): boolean {
    if (!this.hasGuideSearch) {
      return true;
    }
    const keyword = this.normalizeText(this.guideSearchTerm);
    return values.some((value) => this.normalizeText(value).includes(keyword));
  }
}

