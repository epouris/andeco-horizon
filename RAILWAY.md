# Deploy Andeco Horizon Suite on Railway (Postgres)

Same GitHub repo. Data lives in **Railway Postgres** — empty by default (no Supabase import).

## What you get

| Piece | Role |
|--------|------|
| GitHub | Source (unchanged repo) |
| Railway web service | Runs `node server.js` (serves UI + API) |
| Railway Postgres | Stores one JSON workspace in `app_data.payload` |
| CRM login | Built-in username/password (not Supabase Auth) |

Supabase is disabled when the app is served by this server.

---

## 1. Push this code to GitHub

Commit and push the Railway changes (`package.json`, `server.js`, `railway/schema.sql`, etc.) to your existing repo.

## 2. Create the Railway project

1. Open [railway.app](https://railway.app) → sign in with GitHub.
2. **New Project** → **Deploy from GitHub repo** → select your Andeco Horizon Suite repo.
3. Optionally rename the service to **Andeco Horizon Suite**.
4. Railway will install npm deps and run `npm start`.

## 3. Create Postgres (step by step)

1. Open your Railway **project** (the one with the web app).
2. Click **+ New** (top right of the canvas, or **Create**).
3. Choose **Database**.
4. Choose **PostgreSQL**.
5. Wait until the Postgres service shows **Online** / provisioned.
6. Click the **Postgres** service → open the **Variables** (or **Connect**) tab.
7. Copy **`DATABASE_URL`** (or note the service name, often `Postgres`).
8. Click your **web app** service (the GitHub deploy) → **Variables**.
9. Click **+ New Variable** (or **Add variable**).
10. Name: `DATABASE_URL`
11. Value: use **Add a variable reference** / **Shared variable** and pick  
    `Postgres` → `DATABASE_URL`  
    (Railway inserts something like `${{Postgres.DATABASE_URL}}` — that is correct.)
12. Save. Trigger a **Redeploy** of the web service if it did not redeploy automatically.

On first boot the server runs `railway/schema.sql` and creates an **empty** `app_data` row. You do **not** need to run SQL by hand.

## 4. Public URL

1. Web service → **Settings** → **Networking** → **Generate domain**.
2. Open the HTTPS URL.

You should see the normal CRM login / first-time setup. There is **no** company data until you create it in the app.

## 5. Admin user (first login)

On first boot with an empty `users` table, the server creates an administrator.

| Variable | Default | Purpose |
|----------|---------|---------|
| `ANDECO_ADMIN_USERNAME` | `admin` | Login username |
| `ANDECO_ADMIN_PASSWORD` | `AndecoAdmin1!` | Login password (set your own on Railway) |
| `ANDECO_ADMIN_DISPLAY_NAME` | `Administrator` | Display name |

**Recommended:** on the web service → **Variables**, set your own `ANDECO_ADMIN_PASSWORD`, then redeploy.

Login at your Railway URL with that username/password. After you’re in, change the password under **Admin → User management** (or reset by clearing the `users` table and redeploying with new env vars).

Tables created automatically on deploy (relational):

- **Auth:** `users`
- **Accounting:** `company_settings`, `company_banks`, `clients`, `products`, `invoices`, `invoice_items`, `receipts`, `receipt_invoices`
- **Fleet:** `vessels`, `vessel_photos`, `vessel_documents`, `vessel_maintenance`, `vessel_drydock`, `vessel_inventory`, `vessel_logbooks`, `vessel_crew_legacy`
- **Crew:** `crew_members`, `crew_documents`, `crew_assignments`
- **Shifts:** `shift_staff`, `shift_entries`, `shift_requests`, `shift_settings`
- **Payroll/HR:** `hr_employees`, `payslips`, `payroll_company_settings`
- **Legacy snapshot:** `app_data` (JSON backup of last save; not the primary store)

The browser still uses `/api/data` + `/api/save`; the server maps that JSON onto these tables.

## 6. Authentication (required)

The app uses **server session cookies** after login:

- `POST /api/login` creates an httpOnly session cookie
- `/api/data` and `/api/save` require that session (or an automation token)
- Password hashes are **never** sent to the browser
- Passwords are stored with **bcrypt** (legacy SHA-256 hashes are upgraded on next login)

### Optional automation token

`ANDECO_API_TOKEN` is for scripts/admin tooling only. It is **not** injected into the HTML page.

1. Web service → **Variables** → add `ANDECO_API_TOKEN` = a long random string.
2. Redeploy.
3. Call APIs with header: `Authorization: Bearer YOUR_TOKEN`.

### Admin password on first seed

Set `ANDECO_ADMIN_PASSWORD` before first deploy. If unset and no users exist, the server generates a random admin password and prints it once in deploy logs.

## 7. Confirm storage

Open: `https://YOUR-DOMAIN/api/health`

You want something like:

```json
{ "ok": true, "storage": "postgres-relational", "users": 1, "tables": { "clients": 0, "invoices": 0, "...": "..." } }
```

## Local development with Postgres (optional)

```bash
npm install
set DATABASE_URL=postgres://USER:PASS@HOST:5432/railway
npm start
```

Without `DATABASE_URL`, the server uses `andeco_data.json` as before.

## Clean start notes

- **No data is copied from Supabase.**
- When Postgres is used, the server sets `ANDECO_PREFER_SERVER_DATA` so an empty cloud DB is **not** filled from old browser `localStorage`.
- To wipe the workspace later: in Railway Postgres query  
  `UPDATE app_data SET payload = '{}'::jsonb, updated_at = now() WHERE id = 1;`

## Troubleshooting: no tables in Postgres

1. Open your **web app** service (not the Postgres service) → **Variables**.
2. Confirm `DATABASE_URL` exists and references Postgres, e.g. `${{Postgres.DATABASE_URL}}`.
   - If it’s only on the Postgres service, the app never sees it and **creates no tables**.
3. Redeploy the **web** service.
4. Check **Deploy Logs** for: `Postgres schema applied:` and `Postgres public tables:`.
5. Open `https://YOUR-DOMAIN/api/health`:
   - `"databaseUrlConfigured": true`
   - `"storage": "postgres-relational"`
   - `"tableNames": [ ... ]`
6. Or call setup manually (from a terminal):

```bash
curl -X POST https://YOUR-DOMAIN/api/setup-db
```

If you set `ANDECO_API_TOKEN`, include header: `Authorization: Bearer YOUR_TOKEN`.
