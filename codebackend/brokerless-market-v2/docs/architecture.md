# Kiến trúc tổng thể

## Mục tiêu
Tách hệ thống làm 2 backend:

1. **Collector**: lấy dữ liệu ngoài, chuẩn hoá, lưu DB.
2. **API**: đọc DB, trả dữ liệu chuẩn cho frontend.

## Thành phần

- `backend-collector`
- `backend-api`
- `postgres`
- `redis`
- `frontend` (ngoài phạm vi repo này)

## Luồng dữ liệu

```text
vnstock -> collector -> postgres -> api -> frontend
```

## Lợi ích

- FE không phụ thuộc source ngoài.
- Dễ cache, retry, audit.
- Sau này đổi source chỉ sửa collector.
