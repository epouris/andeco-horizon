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

Tables created automatically:

- `app_data` — full CRM workspace JSON  
- `users` — CRM login accounts (`username`, `password_hash`, `is_admin`, …)

## 6. Optional API token

To stop strangers from calling `/api/data` and `/api/save` if they find your URL:

1. Web service → **Variables** → add `ANDECO_API_TOKEN` = a long random string.
2. Redeploy. The server injects the token into the page for the browser; API calls require it.

## 7. Confirm storage

Open: `https://YOUR-DOMAIN/api/health`

You want something like:

```json
{ "ok": true, "storage": "postgres", "authRequired": false, "users": 1 }
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

## Turning off Supabase

You can leave or delete the old Supabase project. This deploy does not call it. Hardcoded Supabase keys in `index.html` are overridden to empty when HTML is served by `server.js`.
