# Brokerless Market V2

Hệ thống gồm 2 backend chính:

- `backend-collector`: lấy dữ liệu thị trường, tin tức, tài chính và ghi vào PostgreSQL.
- `backend-api`: đọc dữ liệu đã chuẩn hóa từ PostgreSQL rồi trả API cho frontend Ionic/Angular.

## Thành phần mặc định

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- Backend API: `http://localhost:8000`
- Collector: chạy nền, không mở cổng public

## Chạy nhanh bằng Docker

```bash
docker compose up --build
```

## Chạy local không dùng Docker

### Collector

```bash
cd backend-collector
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

### API

```bash
cd backend-api
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Luồng dữ liệu

Collector định kỳ:

1. Seed danh sách mã.
2. Đồng bộ quote snapshot.
3. Đồng bộ intraday.
4. Đồng bộ index daily.
5. Đồng bộ tin tức và báo cáo tài chính.
6. Ghi log vào `market_sync_logs`.

API chỉ đọc DB và phục vụ cho frontend:

- `/api/dashboard/*`
- `/api/live/*`
- `/api/market-alerts/*`
- `/api/ai-agent/*`
- `/api/ai-local/*`
- `/api/strategy/*`
- `/api/settings/*`

## Runtime config cho frontend

Frontend ưu tiên đọc API base URL từ file runtime:

`src/assets/app-config.json`

Ví dụ:

```json
{
  "apiBaseUrl": "http://14.224.134.120:8000"
}
```

Thứ tự ưu tiên:

1. `window.__APP_CONFIG__`
2. `assets/app-config.json`
3. `src/environments/environment*.ts`

Nhờ vậy khi đổi server API, bạn có thể sửa runtime config mà không cần rebuild lại toàn bộ frontend.

## CORS

Backend API đọc danh sách origin từ biến môi trường:

`CORS_ALLOW_ORIGINS`

Ví dụ:

```env
CORS_ALLOW_ORIGINS=http://localhost:8100,http://127.0.0.1:8100,http://14.224.134.120:8100,http://14.224.134.120:8000,http://14.224.134.120,capacitor://localhost,ionic://localhost
```

## Ghi chú triển khai

- Nếu cần public backend ra ngoài, phải chạy bằng `--host 0.0.0.0`.
- Nếu frontend trỏ đúng URL nhưng không vào được, kiểm tra:
  - process backend có đang chạy không
  - firewall/security group có mở cổng `8000` không
  - reverse proxy có chuyển tiếp đúng không
- Redis là lớp cache hỗ trợ. Không có Redis thì hệ thống vẫn chạy, nhưng chậm hơn.
