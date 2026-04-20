# Thiết kế DB

## market_symbols
Lưu metadata mã chứng khoán và chỉ số.

## market_quote_snapshots
Lưu snapshot giá mới nhất theo từng lần poll.

## market_intraday_points
Lưu dữ liệu intraday theo thời gian cho từng mã.

## market_index_daily_points
Lưu daily OHLCV cho VNINDEX/HNXINDEX/UPCOMINDEX.

## market_index_intraday_points
Dự phòng cho index intraday realtime khi source hỗ trợ tốt.

## market_sync_logs
Log trạng thái các job collector.
