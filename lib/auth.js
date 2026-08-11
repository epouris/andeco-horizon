/**
 * Session cookies + password hashing for Andeco Horizon Suite.
 * Sessions are cached in memory and persisted to Postgres when a pool is configured,
 * so Railway redeploys do not force everyone to sign in again.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const COOKIE_NAME = 'andeco_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;
/** Throttle DB sliding-expiry writes (memory still updates every request). */
const TOUCH_MIN_INTERVAL_MS = 5 * 60 * 1000;

const sessions = new Map();
let sessionPool = null;

function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function isBcryptHash(hash) {
  return typeof hash === 'string' && /^\$2[aby]?\$\d{2}\$/.test(hash);
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), BCRYPT_ROUNDS);
}

async function verifyPassword(password, storedHash) {
  const pwd = String(password || '');
  const hash = String(storedHash || '');
  if (!pwd || !hash) return { ok: false, needsUpgrade: false };
  if (isBcryptHash(hash)) {
    const ok = await bcrypt.compare(pwd, hash);
    return { ok, needsUpgrade: false };
  }
  // Legacy client/server unsalted SHA-256
  const ok = sha256Hex(pwd) === hash.toLowerCase();
  return { ok, needsUpgrade: ok };
}

function parseCookies(req) {
  const header = req.headers && req.headers.cookie;
  const out = {};
  if (!header) return out;
  String(header).split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) return;
    try {
      out[key] = decodeURIComponent(val);
    } catch (e) {
      out[key] = val;
    }
  });
  return out;
}

function configureSessionStore(pool) {
  sessionPool = pool || null;
}

function rowToSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name || row.username,
    isAdmin: row.is_admin === true,
    allowedModules: Array.isArray(row.allowed_modules)
      ? row.allowed_modules
      : (row.allowed_modules ? row.allowed_modules : []),
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : Date.now(),
    lastTouchedAt: Date.now()
  };
}

async function persistSession(session) {
  if (!sessionPool || !session) return;
  await sessionPool.query(
    `INSERT INTO auth_sessions (
       id, user_id, username, display_name, is_admin, allowed_modules, created_at, expires_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6::jsonb, to_timestamp($7 / 1000.0), to_timestamp($8 / 1000.0)
     )
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       username = EXCLUDED.username,
       display_name = EXCLUDED.display_name,
       is_admin = EXCLUDED.is_admin,
       allowed_modules = EXCLUDED.allowed_modules,
       expires_at = EXCLUDED.expires_at`,
    [
      session.id,
      session.userId,
      session.username,
      session.displayName || '',
      session.isAdmin === true,
      JSON.stringify(Array.isArray(session.allowedModules) ? session.allowedModules : []),
      session.createdAt,
      session.expiresAt
    ]
  );
}

async function loadSessionFromStore(id) {
  if (!sessionPool || !id) return null;
  const r = await sessionPool.query(
    `SELECT id, user_id, username, display_name, is_admin, allowed_modules, created_at, expires_at
     FROM auth_sessions
     WHERE id = $1 AND expires_at > now()
     LIMIT 1`,
    [id]
  );
  return rowToSession(r.rows[0]);
}

async function deleteSessionFromStore(id) {
  if (!sessionPool || !id) return;
  await sessionPool.query('DELETE FROM auth_sessions WHERE id = $1', [id]);
}

async function touchSessionInStore(session) {
  if (!sessionPool || !session) return;
  const now = Date.now();
  const last = session.lastTouchedAt || 0;
  if (now - last < TOUCH_MIN_INTERVAL_MS) return;
  session.lastTouchedAt = now;
  await sessionPool.query(
    'UPDATE auth_sessions SET expires_at = to_timestamp($1 / 1000.0) WHERE id = $2',
    [session.expiresAt, session.id]
  );
}

async function createSession(user) {
  const id = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session = {
    id,
    userId: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    isAdmin: user.isAdmin === true,
    allowedModules: Array.isArray(user.allowedModules) ? user.allowedModules.slice() : [],
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastTouchedAt: now
  };
  sessions.set(id, session);
  try {
    await persistSession(session);
  } catch (e) {
    sessions.delete(id);
    throw e;
  }
  return session;
}

async function getSession(req) {
  const cookies = parseCookies(req);
  const id = cookies[COOKIE_NAME];
  if (!id) return null;

  let session = sessions.get(id);
  if (!session) {
    try {
      session = await loadSessionFromStore(id);
    } catch (e) {
      console.warn('Session load failed:', (e && e.message) || e);
      return null;
    }
    if (session) sessions.set(id, session);
  }
  if (!session) return null;

  if (session.expiresAt < Date.now()) {
    sessions.delete(id);
    try {
      await deleteSessionFromStore(id);
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  // Sliding expiry
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  try {
    await touchSessionInStore(session);
  } catch (e) {
    console.warn('Session touch failed:', (e && e.message) || e);
  }
  return session;
}

async function destroySession(req) {
  const cookies = parseCookies(req);
  const id = cookies[COOKIE_NAME];
  if (!id) return;
  sessions.delete(id);
  try {
    await deleteSessionFromStore(id);
  } catch (e) {
    console.warn('Session delete failed:', (e && e.message) || e);
  }
}

function sessionCookieHeader(sessionId, req) {
  const secure = !!(req.headers['x-forwarded-proto'] === 'https' ||
    (req.headers.origin && String(req.headers.origin).startsWith('https:')));
  const parts = [
    COOKIE_NAME + '=' + encodeURIComponent(sessionId),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + Math.floor(SESSION_TTL_MS / 1000)
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookieHeader(req) {
  const secure = !!(req.headers['x-forwarded-proto'] === 'https' ||
    (req.headers.origin && String(req.headers.origin).startsWith('https:')));
  const parts = [
    COOKIE_NAME + '=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function publicSession(session) {
  if (!session) return null;
  return {
    userId: session.userId,
    username: session.username,
    displayName: session.displayName,
    isAdmin: session.isAdmin === true,
    allowedModules: session.allowedModules || []
  };
}

function stripSecretsFromPayload(data) {
  const out = data && typeof data === 'object' ? data : {};
  const clone = JSON.parse(JSON.stringify(out));
  if (clone.crm && Array.isArray(clone.crm.users)) {
    clone.crm.users = clone.crm.users.map((u) => {
      if (!u || typeof u !== 'object') return u;
      const copy = Object.assign({}, u);
      delete copy.passwordHash;
      delete copy.password_hash;
      delete copy.password;
      return copy;
    });
  }
  return clone;
}

function hasApiToken(req, apiToken) {
  if (!apiToken) return false;
  const auth = req.headers.authorization || '';
  if (auth === 'Bearer ' + apiToken) return true;
  if (req.headers['x-andeco-token'] === apiToken) return true;
  return false;
}

module.exports = {
  COOKIE_NAME,
  sha256Hex,
  hashPassword,
  verifyPassword,
  isBcryptHash,
  parseCookies,
  configureSessionStore,
  createSession,
  getSession,
  destroySession,
  sessionCookieHeader,
  clearSessionCookieHeader,
  publicSession,
  stripSecretsFromPayload,
  hasApiToken
};
