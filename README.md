# Andeco Horizon Suite

A no-install, browser-based CRM for your company. All data is stored in the browser’s local storage. No server or software installation required on user computers.

## How to run

- **Option 1 (easiest):** Double-click `index.html` or drag it into your browser.  
- **Option 2:** Put the whole folder on a shared drive or simple web server (IIS, Apache, nginx, etc.) and open the URL in any browser.
- **Option 3 (server + Postgres):** `npm install` then `npm start` — see [RAILWAY.md](RAILWAY.md) for Railway.

No Node.js is required for Option 1.

## Features

- **Login:** Username and password. Only an administrator can create users and assign which modules they can access.
- **Home:** Module icons only (no sidebar). Click a module to open it; the sidebar then shows that module’s sections.
- **Accounting module:** **Invoices** and **Receipts** — create/edit invoices, link to clients, receipts, view/print. All logic is embedded in the CRM (no external app).
- **Clients module:** Manage clients used by Accounting (invoices, receipts). Same data as the client list inside Accounting.
- **Learning (LMS):** Employee courses, inductions, procedure training, and exams. Public course catalog (`#lms-public`) for visitors to request/buy training. Careers portal (`#lms-careers`) for hiring applicants to take a pre-hire exam with an access code.
- **Settings module (admin only):** Company information, bank accounts, logo, invoice/receipt sequence numbers, default tax, currency, payment terms. Data backup & restore (export/import JSON).

Data is stored in localStorage under keys prefixed with `andeco_inv_` (invoices, receipts, clients, company settings).

**Cloud backend (Railway):** relational Postgres + Node API — see [RAILWAY.md](RAILWAY.md).

## Project structure

```
Andeco Horizon/
├── index.html              # Single entry point
├── server.js               # Serves app + /api/data|/api/save
├── lib/
│   └── pg-store.js         # Assembles/disassembles relational Postgres tables
├── package.json
├── railway/
│   └── schema.sql          # Full relational schema
├── assets/
│   └── login_logo.png      # Company logo on the login screen
├── css/
│   ├── styles.css          # Main CRM styles
│   └── accounting-invoices.css  # Invoice/receipt/settings form styles
├── js/
│   ├── app.js              # Auth, routing, role-based visibility
│   ├── accounting-data.js  # Invoices/receipts/clients storage
│   ├── accounting-invoices.js  # Embedded invoice/receipt/settings logic
│   └── clients-module.js   # Clients module (list + form)
└── README.md
```

## Adding more modules later

1. Add a new option in the login `<select>` (e.g. `value="sales"`).
2. Add a nav item and module card in `index.html` with `data-module="sales"`.
3. Add a new `<section id="page-sales" class="page">` for the module content.
4. In `app.js`, add `'sales'` to the `MODULES` array and in the `canAccessModule` map.

You can then build out each module’s UI and use `localStorage` (e.g. `localStorage.setItem('andeco_contacts', JSON.stringify(data))`) for persistence.
