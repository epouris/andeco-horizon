/**
 * Andeco Horizon Suite server.
 * - Local / no DB: static files + andeco_data.json
 * - Railway: DATABASE_URL → relational Postgres tables (see railway/schema.sql + lib/pg-store.js)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const pgStore = require('./lib/pg-store');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(__dirname, 'andeco_data.json');
const DATABASE_URL = process.env.DATABASE_URL || '';
const API_TOKEN = process.env.ANDECO_API_TOKEN || '';
const ADMIN_USERNAME = (process.env.ANDECO_ADMIN_USERNAME || 'admin').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ANDECO_ADMIN_PASSWORD || 'AndecoAdmin1!';
const ADMIN_DISPLAY_NAME = process.env.ANDECO_ADMIN_DISPLAY_NAME || 'Administrator';
const ALL_MODULES = [
  'accounting', 'clients', 'fleet', 'hr', 'crew', 'shifts', 'documents', 'contacts', 'settings'
];

function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

let pool = null;
let usePostgres = false;

function emptyPayload() {
  return pgStore.emptyPayload();
}

function readDataFile() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return raw ? JSON.parse(raw) : emptyPayload();
  } catch (e) {
    if (e.code === 'ENOENT') return emptyPayload();
    throw e;
  }
}

function ensureDataFile() {
  try {
    fs.accessSync(DATA_FILE);
  } catch (e) {
    if (e.code === 'ENOENT') {
      const dir = path.dirname(DATA_FILE);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(emptyPayload(), null, 2), 'utf8');
    }
  }
}

function writeDataFile(data) {
  const dir = path.dirname(DATA_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function ensureAdminUser() {
  const count = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  if (count.rows[0].n > 0) {
    console.log('Postgres users: ' + count.rows[0].n + ' account(s)');
    return;
  }
  await pool.query(
    `INSERT INTO users (id, username, password_hash, display_name, is_admin, allowed_modules)
     VALUES ($1, $2, $3, $4, true, $5::jsonb)
     ON CONFLICT (username) DO NOTHING`,
    [
      'u-admin',
      ADMIN_USERNAME,
      sha256Hex(ADMIN_PASSWORD),
      ADMIN_DISPLAY_NAME,
      JSON.stringify(ALL_MODULES)
    ]
  );
  console.log('Postgres users: seeded admin "' + ADMIN_USERNAME + '"');
}

async function initPostgres() {
  if (!DATABASE_URL) return;
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
  });
  const schemaPath = path.join(__dirname, 'railway', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schemaSql);
  usePostgres = true;
  await ensureAdminUser();
  await pgStore.migrateLegacyPayloadIfNeeded(pool);
  console.log('Postgres: relational schema ready');
}

async function readPayload() {
  if (usePostgres) return pgStore.loadPayload(pool);
  return readDataFile();
}

async function writePayload(data) {
  if (usePostgres) {
    await pgStore.savePayload(pool, data);
    return;
  }
  writeDataFile(data);
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function isAuthorized(req) {
  if (!API_TOKEN) return true;
  const auth = req.headers.authorization || '';
  if (auth === 'Bearer ' + API_TOKEN) return true;
  const headerToken = req.headers['x-andeco-token'];
  if (headerToken === API_TOKEN) return true;
  return false;
}

function injectConfigIntoHtml(html) {
  const preferServer = usePostgres || process.env.ANDECO_PREFER_SERVER_DATA === '1';
  const config = {
    ANDECO_DATA_FILE_URL: '/api/data',
    ANDECO_SAVE_API_URL: '/api/save',
    ANDECO_PREFER_SERVER_DATA: preferServer,
    ANDECO_API_TOKEN: API_TOKEN || '',
    ANDECO_SUPABASE_URL: '',
    ANDECO_SUPABASE_ANON_KEY: '',
    ANDECO_ORG_ID: ''
  };
  const snippet = '<script>window.ANDECO_RUNTIME_CONFIG=' + JSON.stringify(config) + ';' +
    'Object.keys(window.ANDECO_RUNTIME_CONFIG).forEach(function(k){window[k]=window.ANDECO_RUNTIME_CONFIG[k];});</script>';
  if (html.includes('<!-- ANDECO_RUNTIME_CONFIG -->')) {
    return html.replace('<!-- ANDECO_RUNTIME_CONFIG -->', snippet);
  }
  return html.replace('<head>', '<head>\n  ' + snippet);
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url || '/', 'http://localhost');
  const url = parsed.pathname;

  try {
    if (req.method === 'POST' && url === '/api/save') {
      if (!isAuthorized(req)) {
        sendJson(res, 401, { ok: false, error: 'Unauthorized' });
        return;
      }
      const body = await readBody(req);
      const data = JSON.parse(body);
      await writePayload(data);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && (url === '/andeco_data.json' || url === '/api/data')) {
      if (!isAuthorized(req)) {
        sendJson(res, 401, { ok: false, error: 'Unauthorized' });
        return;
      }
      const data = await readPayload();
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'GET' && url === '/api/health') {
      const health = {
        ok: true,
        storage: usePostgres ? 'postgres-relational' : 'file',
        authRequired: !!API_TOKEN
      };
      if (usePostgres) {
        health.tables = await pgStore.tableInventory(pool);
        health.users = health.tables.users;
      }
      sendJson(res, 200, health);
      return;
    }

    if (req.method === 'GET' && (url === '/favicon.ico' || url === '/favicon.svg')) {
      const favPath = path.join(__dirname, 'favicon.svg');
      fs.readFile(favPath, (err, content) => {
        if (err) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400'
        });
        res.end(content);
      });
      return;
    }

    const filePath = path.join(__dirname, url === '/' ? 'index.html' : url);
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404);
          res.end('Not found');
        } else {
          res.writeHead(500);
          res.end('Server error');
        }
        return;
      }
      const ext = path.extname(filePath);
      let out = content;
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
      if (ext === '.html') {
        out = Buffer.from(injectConfigIntoHtml(content.toString('utf8')), 'utf8');
        headers['Cache-Control'] = 'no-store';
      }
      res.writeHead(200, headers);
      res.end(out);
    });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { ok: false, error: e.message || 'Server error' });
  }
});

async function main() {
  try {
    await initPostgres();
  } catch (e) {
    console.error('Postgres init failed:', e.message);
    process.exit(1);
  }
  if (!usePostgres) {
    ensureDataFile();
  }
  server.listen(PORT, () => {
    console.log('Andeco Horizon Suite at http://localhost:' + PORT);
    console.log('Storage:', usePostgres ? 'Postgres relational tables' : 'file (' + DATA_FILE + ')');
    if (API_TOKEN) console.log('API token: required (ANDECO_API_TOKEN)');
  });
}

main();
