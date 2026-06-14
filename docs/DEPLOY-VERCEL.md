# Deploy lên Vercel

CRM này là **Express + PostgreSQL** — không chạy chỉ bằng static hosting.

## Bước 1 — Push code lên GitHub (xong rồi mới Deploy)

```powershell
cd C:\Users\Admin\zalo-crm-mvp
git config user.email "truongthanhsbay@gmail.com"
git config user.name "ttruong0208"
git add .
git commit -m "first commit"
git branch -M main
git push -u origin main
```

## Bước 2 — PostgreSQL online (bắt buộc)

Vercel **không** có Postgres local. Chọn một:

1. **[Neon](https://neon.tech)** (free) — khuyên dùng  
2. **Supabase** → Settings → Database → connection string  
3. **Vercel Postgres** (Storage tab trong project)

Copy **connection string** dạng:

`postgresql://user:pass@host/db?sslmode=require`

Schema tự chạy lần đầu (file `db/schema.sql`).

## Bước 3 — Cấu hình trên Vercel (màn hình New Project)

| Mục | Giá trị |
|-----|---------|
| Framework Preset | **Express** (hoặc Other) |
| Root Directory | `./` |
| Build Command | *(để trống)* |
| Output Directory | *(để trống)* |
| Install Command | `npm install` |

## Bước 4 — Environment Variables (bắt buộc)

Thêm trong **Environment Variables** trước khi Deploy:

| Key | Ví dụ / ghi chú |
|-----|------------------|
| `DATABASE_URL` | Connection string Neon/Supabase |
| `JWT_SECRET` | Chuỗi random dài (≥32 ký tự) |
| `APP_BASE_URL` | `https://crm-xxx.vercel.app` (sửa sau deploy lần 1) |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Email Gmail |
| `SMTP_PASS` | App Password Gmail |
| `SMTP_FROM` | `Zalo CRM <email@gmail.com>` |
| `SUPER_ADMIN_EMAILS` | `truongthanhsbay@gmail.com` |
| `REQUIRE_EMAIL_VERIFICATION` | `true` |
| `ALLOW_SELF_PLAN_CHANGE` | `false` |

## Bước 5 — Deploy

Bấm **Deploy** → đợi build xong → mở URL.

Kiểm tra: `https://YOUR-APP.vercel.app/api/health`  
Phải thấy `"database":"postgresql"`.

## Lưu ý

- **File đính kèm task** trên Vercel lưu tạm `/tmp` — có thể mất khi function cold start. Production lâu dài nên VPS/Docker (`docker-compose.prod.yml`).
- **Zalo extension sync** vẫn cần URL CRM public — dùng domain Vercel.
- Sau deploy, cập nhật lại `APP_BASE_URL` = URL thật rồi **Redeploy**.

## Local vs Vercel

| | Local | Vercel |
|---|-------|--------|
| DB | PostgreSQL máy bạn | Neon / Supabase |
| Upload | `data/uploads/` | Tạm thời `/tmp` |
| Chạy | `npm start` | Serverless Express |
