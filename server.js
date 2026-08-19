/**
 * Andeco Horizon Suite server.
 * - Local / no DB: static files + andeco_data.json
 * - Railway: DATABASE_URL → relational Postgres tables (see railway/schema.sql + lib/pg-store.js)
 * - Auth: httpOnly session cookies (login). Optional ANDECO_API_TOKEN for automation (never injected into HTML).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const pgStore = require('./lib/pg-store');
const migrate = require('./lib/migrate');
const auth = require('./lib/auth');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(__dirname, 'andeco_data.json');
const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.DATABASE_PRIVATE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRESQL_URL ||
  '';
const API_TOKEN = process.env.ANDECO_API_TOKEN || '';
const ADMIN_USERNAME = (process.env.ANDECO_ADMIN_USERNAME || 'admin').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ANDECO_ADMIN_PASSWORD || '';
const ADMIN_DISPLAY_NAME = process.env.ANDECO_ADMIN_DISPLAY_NAME || 'Administrator';
const MAX_BODY_BYTES = Math.max(1, parseInt(process.env.ANDECO_MAX_BODY_MB || '15', 10) || 15) * 1024 * 1024;
const ALL_MODULES = [
  'accounting', 'clients', 'fleet', 'hr', 'crew', 'shifts', 'documents', 'contacts', 'lms', 'distribution', 'settings'
];

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
  let password = ADMIN_PASSWORD;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(18).toString('base64url');
    generated = true;
  }
  const passwordHash = await auth.hashPassword(password);
  await pool.query(
    `INSERT INTO users (id, username, password_hash, display_name, is_admin, allowed_modules)
     VALUES ($1, $2, $3, $4, true, $5::jsonb)
     ON CONFLICT (username) DO NOTHING`,
    [
      'u-admin',
      ADMIN_USERNAME,
      passwordHash,
      ADMIN_DISPLAY_NAME,
      JSON.stringify(ALL_MODULES)
    ]
  );
  console.log('Postgres users: seeded admin "' + ADMIN_USERNAME + '"');
  if (generated) {
    console.log('IMPORTANT: Generated admin password (set ANDECO_ADMIN_PASSWORD to choose your own): ' + password);
  }
}

async function initPostgres() {
  if (!DATABASE_URL) {
    console.warn('DATABASE_URL is not set — Postgres tables will NOT be created.');
    console.warn('On Railway: Web service → Variables → add DATABASE_URL = ${{Postgres.DATABASE_URL}}');
    return;
  }
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
  });
  await pool.query('SELECT 1 AS ok');
  const schemaPath = path.join(__dirname, 'railway', 'schema.sql');
  const result = await migrate.applySchema(pool, schemaPath);
  console.log('Postgres schema applied:', result.applied + '/' + result.statements + ' statements');
  const tables = await migrate.listPublicTables(pool);
  console.log('Postgres public tables:', tables.join(', ') || '(none)');
  usePostgres = true;
  auth.configureSessionStore(pool);
  await ensureAdminUser();
  await pgStore.migrateLegacyPayloadIfNeeded(pool);
  console.log('Postgres: relational schema ready');
}

async function readPayloadRaw() {
  if (usePostgres) return pgStore.loadPayload(pool, { includeSecrets: true });
  return readDataFile();
}

async function readPayloadForClient() {
  if (usePostgres) return pgStore.loadPayload(pool, { includeSecrets: false });
  const data = readDataFile();
  const safe = auth.stripSecretsFromPayload(data);
  safe._rev = fileRevision();
  return safe;
}

async function writePayload(data, opts) {
  if (usePostgres) {
    await pgStore.savePayload(pool, data, opts || {});
    return;
  }
  writeDataFile(data);
}

function fileRevision() {
  try {
    const st = fs.statSync(DATA_FILE);
    return String(st.mtimeMs) + '-' + String(st.size);
  } catch (e) {
    return '0';
  }
}

async function currentRevision() {
  if (usePostgres) return pgStore.getDataRevision(pool);
  return fileRevision();
}

function sendJson(res, status, obj, extraHeaders) {
  const headers = Object.assign({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  }, extraHeaders || {});
  res.writeHead(status, headers);
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Payload too large'), { code: 'PAYLOAD_TOO_LARGE' }));
        try { req.destroy(); } catch (e) {}
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function getRequestSession(req) {
  return auth.getSession(req);
}

function isApiTokenAuth(req) {
  return auth.hasApiToken(req, API_TOKEN);
}

/** Session user or automation token. */
async function requireAuth(req, res) {
  const session = await getRequestSession(req);
  if (session) return { session, viaToken: false };
  if (isApiTokenAuth(req)) return { session: null, viaToken: true };
  sendJson(res, 401, { ok: false, error: 'Unauthorized' });
  return null;
}

async function requireAdmin(req, res) {
  const authz = await requireAuth(req, res);
  if (!authz) return null;
  if (authz.viaToken) return authz;
  if (!authz.session || !authz.session.isAdmin) {
    sendJson(res, 403, { ok: false, error: 'Admin access required' });
    return null;
  }
  return authz;
}

function findUserInPayload(data, username) {
  const users = data && data.crm && Array.isArray(data.crm.users) ? data.crm.users : [];
  const name = String(username || '').trim().toLowerCase();
  return users.filter((u) => u && String(u.username || '').toLowerCase() === name)[0] || null;
}

async function findUserRecord(username) {
  const name = String(username || '').trim().toLowerCase();
  if (!name) return null;
  if (usePostgres) {
    const r = await pool.query(
      `SELECT id, username, password_hash, display_name, is_admin, allowed_modules
       FROM users WHERE lower(username) = $1 LIMIT 1`,
      [name]
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      displayName: row.display_name || '',
      isAdmin: row.is_admin === true,
      allowedModules: Array.isArray(row.allowed_modules) ? row.allowed_modules : []
    };
  }
  const data = readDataFile();
  const user = findUserInPayload(data, name);
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    passwordHash: user.passwordHash,
    displayName: user.displayName || '',
    isAdmin: user.isAdmin === true,
    allowedModules: Array.isArray(user.allowedModules) ? user.allowedModules : []
  };
}

async function updateUserPasswordHash(userId, passwordHash) {
  if (usePostgres) {
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
    return;
  }
  const data = readDataFile();
  if (!data.crm) data.crm = { users: [] };
  if (!Array.isArray(data.crm.users)) data.crm.users = [];
  data.crm.users = data.crm.users.map((u) => {
    if (!u || u.id !== userId) return u;
    return Object.assign({}, u, { passwordHash: passwordHash });
  });
  writeDataFile(data);
}

async function upsertUserRecord(user, passwordPlain) {
  let passwordHash = null;
  if (passwordPlain) passwordHash = await auth.hashPassword(passwordPlain);
  if (usePostgres) {
    const existing = await pool.query(
      'SELECT id, password_hash FROM users WHERE id = $1 OR lower(username) = $2 LIMIT 1',
      [user.id, user.username]
    );
    if (!existing.rows[0] && !passwordHash) {
      throw Object.assign(new Error('Password required for new user'), { code: 'PASSWORD_REQUIRED' });
    }
    if (existing.rows[0]) {
      if (passwordHash) {
        await pool.query(
          `UPDATE users
           SET username = $2, password_hash = $3, display_name = $4, is_admin = $5, allowed_modules = $6::jsonb
           WHERE id = $1`,
          [
            existing.rows[0].id,
            user.username,
            passwordHash,
            user.displayName,
            user.isAdmin === true,
            JSON.stringify(user.allowedModules || [])
          ]
        );
      } else {
        await pool.query(
          `UPDATE users
           SET username = $2, display_name = $3, is_admin = $4, allowed_modules = $5::jsonb
           WHERE id = $1`,
          [
            existing.rows[0].id,
            user.username,
            user.displayName,
            user.isAdmin === true,
            JSON.stringify(user.allowedModules || [])
          ]
        );
      }
    } else {
      await pool.query(
        `INSERT INTO users (id, username, password_hash, display_name, is_admin, allowed_modules)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [
          user.id,
          user.username,
          passwordHash,
          user.displayName,
          user.isAdmin === true,
          JSON.stringify(user.allowedModules || [])
        ]
      );
    }
    return;
  }
  const data = readDataFile();
  if (!data.crm) data.crm = { users: [] };
  if (!Array.isArray(data.crm.users)) data.crm.users = [];
  const idx = data.crm.users.findIndex((u) => u && (u.id === user.id || u.username === user.username));
  const prev = idx >= 0 ? data.crm.users[idx] : null;
  const next = {
    id: user.id || (prev && prev.id) || ('u' + Date.now()),
    username: user.username,
    displayName: user.displayName,
    isAdmin: user.isAdmin === true,
    allowedModules: user.allowedModules || [],
    passwordHash: passwordHash || (prev && prev.passwordHash) || null
  };
  if (!next.passwordHash) {
    throw Object.assign(new Error('Password required for new user'), { code: 'PASSWORD_REQUIRED' });
  }
  if (idx >= 0) data.crm.users[idx] = next;
  else data.crm.users.push(next);
  writeDataFile(data);
}

async function deleteUserRecord(userId) {
  if (usePostgres) {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    return;
  }
  const data = readDataFile();
  if (!data.crm || !Array.isArray(data.crm.users)) return;
  data.crm.users = data.crm.users.filter((u) => u && u.id !== userId);
  writeDataFile(data);
}

async function listUsersSafe() {
  if (usePostgres) {
    const r = await pool.query(
      `SELECT id, username, display_name, is_admin, allowed_modules FROM users ORDER BY username`
    );
    return r.rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name || '',
      isAdmin: row.is_admin === true,
      allowedModules: Array.isArray(row.allowed_modules) ? row.allowed_modules : []
    }));
  }
  const data = readDataFile();
  const users = data.crm && Array.isArray(data.crm.users) ? data.crm.users : [];
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName || '',
    isAdmin: u.isAdmin === true,
    allowedModules: Array.isArray(u.allowedModules) ? u.allowedModules : []
  }));
}

function injectConfigIntoHtml(html) {
  const preferServer = usePostgres || process.env.ANDECO_PREFER_SERVER_DATA === '1';
  const config = {
    ANDECO_DATA_FILE_URL: '/api/data',
    ANDECO_SAVE_API_URL: '/api/save',
    ANDECO_PREFER_SERVER_DATA: preferServer,
    ANDECO_SERVER_AUTH: true
    // Intentionally omit ANDECO_API_TOKEN — never expose secrets to the browser.
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
    if (req.method === 'GET' && url === '/api/health') {
      const session = await getRequestSession(req);
      const detail = parsed.searchParams.get('detail') === '1';
      const health = {
        ok: true,
        storage: usePostgres ? 'postgres-relational' : 'file',
        authRequired: true,
        serverAuth: true
      };
      if (detail && ((session && session.isAdmin) || isApiTokenAuth(req))) {
        health.databaseUrlConfigured = !!DATABASE_URL;
        if (usePostgres) {
          health.tables = await pgStore.tableInventory(pool);
          health.tableNames = await migrate.listPublicTables(pool);
          health.users = health.tables.users;
        }
      }
      sendJson(res, 200, health);
      return;
    }

    if (req.method === 'GET' && url === '/api/session') {
      const session = await getRequestSession(req);
      const users = await listUsersSafe();
      sendJson(res, 200, {
        ok: true,
        session: auth.publicSession(session),
        hasUsers: users.length > 0
      });
      return;
    }

    if (req.method === 'POST' && url === '/api/bootstrap') {
      const users = await listUsersSafe();
      if (users.length > 0) {
        sendJson(res, 400, { ok: false, error: 'Setup is already complete.' });
        return;
      }
      const body = JSON.parse(await readBody(req) || '{}');
      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '');
      const displayName = String(body.displayName || '').trim();
      if (!username || !password || !displayName || password.length < 6) {
        sendJson(res, 400, { ok: false, error: 'Username, display name, and password (min 6) are required.' });
        return;
      }
      await upsertUserRecord({
        id: 'u-admin',
        username,
        displayName,
        isAdmin: true,
        allowedModules: ALL_MODULES.slice()
      }, password);
      const user = await findUserRecord(username);
      const session = await auth.createSession(user);
      sendJson(res, 200, { ok: true, session: auth.publicSession(session) }, {
        'Set-Cookie': auth.sessionCookieHeader(session.id, req)
      });
      return;
    }

    if (req.method === 'POST' && url === '/api/login') {
      const body = JSON.parse(await readBody(req) || '{}');
      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!username || !password) {
        sendJson(res, 400, { ok: false, error: 'Username and password are required.' });
        return;
      }
      const user = await findUserRecord(username);
      if (!user) {
        sendJson(res, 401, { ok: false, error: 'Invalid username or password.' });
        return;
      }
      const verified = await auth.verifyPassword(password, user.passwordHash);
      if (!verified.ok) {
        sendJson(res, 401, { ok: false, error: 'Invalid username or password.' });
        return;
      }
      if (verified.needsUpgrade) {
        const upgraded = await auth.hashPassword(password);
        await updateUserPasswordHash(user.id, upgraded);
      }
      const session = await auth.createSession(user);
      sendJson(res, 200, { ok: true, session: auth.publicSession(session) }, {
        'Set-Cookie': auth.sessionCookieHeader(session.id, req)
      });
      return;
    }

    if (req.method === 'POST' && url === '/api/logout') {
      await auth.destroySession(req);
      sendJson(res, 200, { ok: true }, {
        'Set-Cookie': auth.clearSessionCookieHeader(req)
      });
      return;
    }

    if (req.method === 'POST' && url === '/api/change-password') {
      const authz = await requireAuth(req, res);
      if (!authz || !authz.session) {
        if (authz && authz.viaToken) sendJson(res, 400, { ok: false, error: 'Use an interactive session to change password.' });
        return;
      }
      const body = JSON.parse(await readBody(req) || '{}');
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      const displayName = body.displayName != null ? String(body.displayName).trim() : '';
      const user = await findUserRecord(authz.session.username);
      if (!user) {
        sendJson(res, 401, { ok: false, error: 'Unauthorized' });
        return;
      }

      if (displayName && displayName !== user.displayName) {
        await upsertUserRecord({
          id: user.id,
          username: user.username,
          displayName: displayName,
          isAdmin: user.isAdmin,
          allowedModules: user.allowedModules
        }, null);
        authz.session.displayName = displayName;
        user.displayName = displayName;
      }

      if (currentPassword || newPassword) {
        if (!currentPassword || !newPassword || newPassword.length < 6) {
          sendJson(res, 400, { ok: false, error: 'Provide current password and a new password (min 6 characters).' });
          return;
        }
        const verified = await auth.verifyPassword(currentPassword, user.passwordHash);
        if (!verified.ok) {
          sendJson(res, 401, { ok: false, error: 'Current password is incorrect.' });
          return;
        }
        const nextHash = await auth.hashPassword(newPassword);
        await updateUserPasswordHash(user.id, nextHash);
      }

      sendJson(res, 200, {
        ok: true,
        session: auth.publicSession(authz.session)
      });
      return;
    }

    if (req.method === 'GET' && url === '/api/users') {
      const authz = await requireAdmin(req, res);
      if (!authz) return;
      sendJson(res, 200, { ok: true, users: await listUsersSafe() });
      return;
    }

    if (req.method === 'POST' && url === '/api/users') {
      const authz = await requireAdmin(req, res);
      if (!authz) return;
      const body = JSON.parse(await readBody(req) || '{}');
      const username = String(body.username || '').trim().toLowerCase();
      const displayName = String(body.displayName || '').trim();
      const isAdmin = body.isAdmin === true;
      const allowedModules = Array.isArray(body.allowedModules) ? body.allowedModules : [];
      const password = body.password != null ? String(body.password) : '';
      const id = String(body.id || ('u' + Date.now()));
      if (!username || !displayName) {
        sendJson(res, 400, { ok: false, error: 'Username and display name are required.' });
        return;
      }
      const existingUsers = await listUsersSafe();
      const existing = existingUsers.filter((u) => u.username === username || u.id === id)[0];
      if (!existing && !password) {
        sendJson(res, 400, { ok: false, error: 'Password is required for new users.' });
        return;
      }
      if (existing && existing.isAdmin && !isAdmin) {
        const otherAdmins = existingUsers.filter((u) => u.isAdmin && u.id !== existing.id);
        if (otherAdmins.length === 0) {
          sendJson(res, 400, { ok: false, error: 'Cannot remove the last administrator.' });
          return;
        }
      }
      try {
        await upsertUserRecord({
          id: existing ? existing.id : id,
          username,
          displayName,
          isAdmin,
          allowedModules: isAdmin ? ALL_MODULES.slice() : allowedModules
        }, password || null);
      } catch (e) {
        if (e && e.code === 'PASSWORD_REQUIRED') {
          sendJson(res, 400, { ok: false, error: 'Password is required for new users.' });
          return;
        }
        throw e;
      }
      sendJson(res, 200, { ok: true, users: await listUsersSafe() });
      return;
    }

    if (req.method === 'DELETE' && url === '/api/users') {
      const authz = await requireAdmin(req, res);
      if (!authz) return;
      const body = JSON.parse(await readBody(req) || '{}');
      const userId = String(body.id || '');
      if (!userId) {
        sendJson(res, 400, { ok: false, error: 'User id is required.' });
        return;
      }
      const existingUsers = await listUsersSafe();
      const target = existingUsers.filter((u) => u.id === userId)[0];
      if (!target) {
        sendJson(res, 404, { ok: false, error: 'User not found.' });
        return;
      }
      if (target.isAdmin) {
        const otherAdmins = existingUsers.filter((u) => u.isAdmin && u.id !== userId);
        if (otherAdmins.length === 0) {
          sendJson(res, 400, { ok: false, error: 'Cannot delete the last administrator.' });
          return;
        }
      }
      await deleteUserRecord(userId);
      sendJson(res, 200, { ok: true, users: await listUsersSafe() });
      return;
    }

    if (req.method === 'POST' && url === '/api/save') {
      const authz = await requireAuth(req, res);
      if (!authz) return;
      const body = await readBody(req);
      const data = JSON.parse(body || '{}');
      const clientRev = data && data._rev != null ? String(data._rev) : '';
      const serverRev = await currentRevision();
      if (clientRev && serverRev && clientRev !== serverRev) {
        sendJson(res, 409, {
          ok: false,
          error: 'Data was updated elsewhere. Reload and try again.',
          code: 'CONFLICT',
          _rev: serverRev
        });
        return;
      }
      // Never accept password hashes / user password fields from client workspace saves.
      // Preserve existing users server-side (Postgres via preserveUsers; file via merge).
      let existingUsers = null;
      if (!usePostgres) {
        const current = readDataFile();
        existingUsers = current && current.crm && Array.isArray(current.crm.users)
          ? current.crm.users
          : [];
      }
      if (!data.crm || typeof data.crm !== 'object') data.crm = {};
      if (existingUsers) data.crm.users = existingUsers;
      else delete data.crm.users;
      delete data._rev;
      await writePayload(data, { preserveUsers: true });
      const nextRev = await currentRevision();
      sendJson(res, 200, { ok: true, _rev: nextRev });
      return;
    }

    if (req.method === 'GET' && (url === '/andeco_data.json' || url === '/api/data')) {
      const authz = await requireAuth(req, res);
      if (!authz) return;
      const data = await readPayloadForClient();
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'POST' && url === '/api/setup-db') {
      const authz = await requireAuth(req, res);
      if (!authz) return;
      if (!authz.viaToken && !(authz.session && authz.session.isAdmin)) {
        sendJson(res, 403, { ok: false, error: 'Admin access required' });
        return;
      }
      if (!DATABASE_URL) {
        sendJson(res, 500, { ok: false, error: 'DATABASE_URL is not set on this service' });
        return;
      }
      if (!pool) {
        const { Pool } = require('pg');
        pool = new Pool({
          connectionString: DATABASE_URL,
          ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
        });
      }
      const schemaPath = path.join(__dirname, 'railway', 'schema.sql');
      const result = await migrate.applySchema(pool, schemaPath);
      usePostgres = true;
      auth.configureSessionStore(pool);
      await ensureAdminUser();
      await pgStore.migrateLegacyPayloadIfNeeded(pool);
      const tableNames = await migrate.listPublicTables(pool);
      sendJson(res, 200, {
        ok: true,
        applied: result.applied,
        statements: result.statements,
        tableNames,
        tables: await pgStore.tableInventory(pool)
      });
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
    if (e && e.code === 'PAYLOAD_TOO_LARGE') {
      sendJson(res, 413, { ok: false, error: 'Upload too large.' });
      return;
    }
    sendJson(res, 500, { ok: false, error: 'Server error' });
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
  // Large workspace saves (photos / payroll) can outlive default idle timeouts and
  // surface in the browser as ERR_HTTP2_PING_FAILED / Failed to fetch.
  server.requestTimeout = 0;
  server.headersTimeout = 130000;
  server.keepAliveTimeout = 120000;
  server.timeout = 0;
  server.listen(PORT, () => {
    console.log('Andeco Horizon Suite at http://localhost:' + PORT);
    console.log('Storage:', usePostgres ? 'Postgres relational tables' : 'file (' + DATA_FILE + ')');
    console.log('Auth: session cookies required for /api/data and /api/save');
    if (API_TOKEN) console.log('API token: accepted for automation (not exposed to browser)');
  });
}

main();
