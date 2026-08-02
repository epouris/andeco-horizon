# Single-file storage (e.g. OneDrive)

All app data (invoices, receipts, clients, company settings, products, fleet, crew, shifts, payroll, LMS, users) is stored in one file: **`andeco_data.json`** (or Postgres on Railway).

## How it works

- **With server (recommended for shared use)**  
  Run the app with the included Node server so the app can read and write the file:

  ```bash
  node server.js
  ```

  Then open **http://localhost:3000**. The server:

  - Serves the app (HTML, JS, CSS).
  - **GET** `/andeco_data.json` → returns the contents of `andeco_data.json`.
  - **POST** `/api/save` → writes the request body to `andeco_data.json`.

  Every time you add or edit data, the app sends the full state to `/api/save`, so the file is always up to date. The app also **polls** `/andeco_data.json` every 30 seconds and when you switch back to the tab, so everyone sees updates without reloading.

- **Without server (file:// or static host with no save endpoint)**  
  If the app cannot reach `/andeco_data.json` or `/api/save`, it falls back to **localStorage** (per-browser). The single file is not used.

## Using with OneDrive

1. Put the whole app folder (including `server.js` and `andeco_data.json`) in a **OneDrive folder** and sync it.
2. On each PC where you want to use the app, run **`node server.js`** in that folder and open **http://localhost:3000**.
3. OneDrive will sync `andeco_data.json` between PCs. Other users see updates after the next poll (or when they focus the tab).

## Optional configuration

Before the app script loads, you can set:

```html
<script>
  window.ANDECO_DATA_FILE_URL = '/andeco_data.json';  // URL to load data (default: andeco_data.json)
  window.ANDECO_SAVE_API_URL  = '/api/save';           // URL to save data (default: /api/save)
  window.ANDECO_DATA_POLL_INTERVAL_MS = 30000;         // Poll interval in ms (default: 30000)
</script>
```

## Data file shape

`andeco_data.json` looks like:

```json
{
  "invoices": [],
  "receipts": [],
  "clients": [],
  "companySettings": {},
  "products": []
}
```

The server creates this file with empty arrays/object if it does not exist.

## Cloud storage (Railway)

Shared data is loaded via `GET /api/data` and saved via `POST /api/save`. On Railway with `DATABASE_URL`, the Node server stores that payload in relational Postgres tables — see **[RAILWAY.md](RAILWAY.md)**.
