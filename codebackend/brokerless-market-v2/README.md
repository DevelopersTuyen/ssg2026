# Brokerless Market V2

Dự án này tách làm 2 backend đúng theo mô hình anh đang muốn:

- **backend-collector**: lấy dữ liệu từ `vnstock`, chuẩn hoá rồi lưu PostgreSQL.
- **backend-api**: đọc PostgreSQL và trả API cho frontend Ionic/Angular.

> Lưu ý quan trọng
>
> - Code này là bộ khung chạy được để anh bắt đầu nhanh.
> - Thư viện `vnstock` thay đổi theo phiên bản và có thể yêu cầu API key. Một số hàm lấy dữ liệu có thể cần chỉnh nhẹ theo version thực tế anh cài.
> - Project này ưu tiên **ổn định kiến trúc, DB, luồng collector và API nội bộ**. Những đoạn adapter `vnstock` đã viết theo hướng phòng thủ, có nhiều fallback.

## 1. Cấu trúc thư mục

```text
brokerless-market-v2/
├── docker-compose.yml
├── .env.example
├── README.md
├── backend-collector/
├── backend-api/
└── docs/
```

## 2. Cài nhanh local

### Chuẩn bị `.env`

```bash
cp .env.example .env
```

### Chạy bằng Docker

```bash
docker compose up --build
```

Service mặc định:
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- Backend API: `http://localhost:8000`
- Collector: chạy nền, không mở port public

## 3. Chạy không dùng Docker

### Backend collector

```bash
cd backend-collector
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

### Backend api

```bash
cd backend-api
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## 4. Luồng dữ liệu

### Collector

Collector định kỳ làm các việc sau:

1. Seed danh sách mã từ biến môi trường.
2. Lấy bảng giá snapshot theo watchlist cho từng sàn.
3. Lấy intraday cho các mã ưu tiên.
4. Lấy lịch sử daily cho chỉ số `VNINDEX`, `HNXINDEX`, `UPCOMINDEX`.
5. Ghi log đồng bộ vào `market_sync_logs`.

### API

API chỉ đọc DB:

- `/api/dashboard/index-cards`
- `/api/dashboard/top-stocks?exchange=HSX&sort=actives`
- `/api/market/symbols/FPT/quote`
- `/api/market/symbols/FPT/intraday`
- `/api/market/indices/VNINDEX/history?period=1M`

## 5. Biến môi trường quan trọng

- `DATABASE_URL`
- `REDIS_URL`
- `VNSTOCK_API_KEY`
- `VNSTOCK_SOURCE`
- `HSX_SYMBOLS`
- `HNX_SYMBOLS`
- `UPCOM_SYMBOLS`
- `INTRADAY_SYMBOLS`

## 6. Lưu ý triển khai thật

- Nếu anh muốn quét **toàn thị trường**, không chỉ watchlist, hãy thay phần seed symbols bằng danh sách đầy đủ từ source thật.
- Nếu anh muốn chart index intraday realtime kiểu bảng điện, cần xác nhận source `vnstock` version anh dùng có hỗ trợ ổn định cho index intraday hay không.
- Redis trong project này đang là lớp cache hỗ trợ; nếu chưa dùng Redis thì API vẫn chạy được.
