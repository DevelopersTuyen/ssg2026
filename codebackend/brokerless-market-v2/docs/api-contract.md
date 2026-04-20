# API contract

## GET /api/dashboard/index-cards
Trả 3 card chỉ số.

## GET /api/dashboard/top-stocks?exchange=HSX&sort=actives
Trả danh sách cổ phiếu nổi bật theo quote snapshot mới nhất.

## GET /api/market/symbols/{symbol}/quote
Trả quote mới nhất của 1 mã.

## GET /api/market/symbols/{symbol}/intraday
Trả intraday points của 1 mã.

## GET /api/market/indices/{index_symbol}/history?period=1M
Trả lịch sử daily của chỉ số.
