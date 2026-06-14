# crm

# Zalo Campaign CRM MVP

Lightweight web app to manage campaign messaging workflow for Zalo groups:

- Group list management
- Campaign creation
- Per-group custom message drafts
- Delivery/reply status tracking
- Lead priority (hot/warm/cold) with score-based auto classification
- Campaign summary cards for quick daily operation
- Follow-up scheduler (overdue/today filters + quick +24h/+48h actions)
- CSV export for campaign task handoff/reporting
- Bulk operations: assign staff in bulk and update status by current filters
- Overdue row highlighting for immediate operational focus

## Stack (production-ready MVP)

- Frontend: HTML/CSS/JS
- Backend: Node.js + Express
- Auth: JWT + bcrypt password hashing
- Database: PostgreSQL

## Quick start

1) Copy env:

```bash
copy .env.example .env
```

2) Start PostgreSQL (Docker):

```bash
npm run db:up
```

3) Install + init schema/seed:

```bash
npm install
npm run db:init
```

4) Run app:

```bash
npm start
```

Open `http://localhost:3000` (trang chủ) → **Đăng nhập** → `http://localhost:3000/app.html` (CRM).

Trang riêng: `/login.html` (đăng nhập), `/app.html` (bảng điều khiển).

## Demo accounts

- `admin / admin123`
- `editor / editor123`
- `responder / responder123`

## Backend APIs

- `GET /api/health` - health check
- `POST /api/login` - login (`accessToken`, `refreshToken`, `expiresIn`)
- `POST /api/refresh` - rotate refresh token and issue new access token
- `POST /api/logout` - revoke refresh token
- `GET /api/me` - current user profile from access JWT
- `GET /api/state` - load app state (per user)
- `PUT /api/state` - save app state (per user)

## UI features

- Advanced filters: keyword search, assignee, lead score range, attachment/owner flags, sort
- Pagination on task table (10/25/50/100 per page)
- Bulk actions and CSV export apply to the **current filter set** (all pages)
- Access token auto-refresh ~1 minute before expiry

## Env vars

- `PORT` - server port (default `3000`)
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret
- `JWT_ACCESS_EXPIRES_IN` - access token expiry (default `15m`)
- `REFRESH_TOKEN_DAYS` - refresh token lifetime in days (default `30`)

## Migrate old `db.json` data

If you used the previous JSON backend:

```bash
npm run db:migrate-json
```

## Notes

This MVP is intentionally manual-first (no automatic sending to Zalo) to reduce account risk.

The legacy `db.json` file is no longer used at runtime.
