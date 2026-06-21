# Supabase setup for Andeco Horizon

The app stores one JSON document per organization in Supabase (`organization_data.payload`). When Supabase is configured and you are signed in, **all modules** sync through that payload:

- Accounting: invoices, receipts, clients, company settings, products
- Fleet, crew, shifts
- Payroll: employees, payroll runs, payslip company settings
- CRM users (`andeco_crm_users`)

The CRM **session** (`andeco_crm_session`) stays in the browser only (who is logged into the app on this device).

## 1. Create a Supabase project

1. [Supabase Dashboard](https://supabase.com/dashboard) → New project.
2. **Authentication → Providers**: enable **Email** (or the provider you prefer).
3. **Project Settings → API**: copy **Project URL** and **anon public** key.

## 2. Apply the database schema

In **SQL Editor**, run the contents of:

`supabase/migrations/20260421120000_andeco_horizon.sql`

Or, with [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase db push` from this repo (after linking the project).

## 3. Bootstrap your first organization (SQL Editor)

Run as the dashboard SQL user (bypasses RLS). Replace the email with a user that already exists under **Authentication → Users** (invite/sign up first).

```sql
-- 1) Create org
insert into public.organizations (id, name)
values ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'My company')
returning id;

-- 2) Link your auth user (replace with real auth.users.id from Authentication table)
insert into public.organization_members (org_id, user_id, is_admin, allowed_modules)
values (
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid,
  true,
  '{}'::text[]
);

-- 3) Empty workspace row (payload filled on first save from the app)
insert into public.organization_data (org_id, payload)
values ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '{}'::jsonb);
```

Use your own UUIDs; keep `org_id` the same in all three steps.

## 4. Configure the web app

Before `accounting-data.js` runs, set (e.g. in `index.html`, or via your static host’s env injection):

```html
<script>
  window.ANDECO_SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
  window.ANDECO_SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
  window.ANDECO_ORG_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
</script>
```

`index.html` already loads `@supabase/supabase-js` from jsDelivr before `js/accounting-data.js`.

**Important:** use **HTTPS** or **http://localhost** so `crypto.subtle` and Supabase Auth behave reliably (same requirement as the existing CRM login).

## 5. Sign in to the app

When the three config variables are set, you use **one sign-in** on the login screen:

1. Enter your **Supabase Auth email** and **password** (the same account you created under Authentication → Users).
2. Click **Sign in**.

That single step connects cloud data **and** opens the CRM. Module access comes from your `organization_members` row (`is_admin`, `allowed_modules`).

On return visits, if your session is still valid, the app opens **without** asking you to sign in again. Use **Sign out** in the header to log out fully.

For local-only mode (no Supabase config), the original CRM username/password login is still used.

## 6. Behaviour summary

| Mode | When |
|------|------|
| **Supabase** | URL + anon key + org id set **and** `auth.getSession()` returns a user who is in `organization_members` for that org. Load/save use `organization_data`. |
| **Supabase pending** | Config is set but not signed in yet. The app starts with an **empty workspace** (no import from old browser data). Saves are held until you connect cloud data. |
| **JSON file** | Otherwise, if `GET andeco_data.json` succeeds (e.g. `node server.js`), same as before. |
| **localStorage** | If neither Supabase nor file server works (e.g. `file://`), existing browser keys are used. |

Polling (every 60s / tab focus) uses **Supabase** when `isSupabaseMode()` is true.

## 7. Payload shape (version 1.0)

```json
{
  "version": "1.0",
  "invoices": [],
  "receipts": [],
  "clients": [],
  "companySettings": {},
  "products": [],
  "fleet": { "vessels": [], "vesselPhotos": [], "documents": [], "maintenance": [], "drydock": [], "inventory": [], "logbooks": [], "crew": [] },
  "crew": { "crewMembers": [], "crewDocuments": [], "crewAssignments": [] },
  "shifts": { "staff": [], "shifts": [], "requests": [], "settings": {} },
  "payroll": { "employees": [], "payrollData": {}, "companySettings": {} },
  "crm": { "users": [] }
}
```

Export/import JSON from Settings remains a valid backup path.

## 8. Security notes

- Never expose the **service_role** key in the browser.
- Tighten RLS later (e.g. read-only members, module-based roles mirroring CRM).
- `organization_data.payload` is one JSON document per save (same concurrency story as `POST /api/save`).
