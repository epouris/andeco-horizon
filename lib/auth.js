/**
 * Session cookies + password hashing for Andeco Horizon Suite.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const COOKIE_NAME = 'andeco_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

const sessions = new Map();

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

function createSession(user) {
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
    expiresAt: now + SESSION_TTL_MS
  };
  sessions.set(id, session);
  return session;
}

function getSession(req) {
  const cookies = parseCookies(req);
  const id = cookies[COOKIE_NAME];
  if (!id) return null;
  const session = sessions.get(id);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(id);
    return null;
  }
  // Sliding expiry
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function destroySession(req) {
  const cookies = parseCookies(req);
  const id = cookies[COOKIE_NAME];
  if (id) sessions.delete(id);
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
  createSession,
  getSession,
  destroySession,
  sessionCookieHeader,
  clearSessionCookieHeader,
  publicSession,
  stripSecretsFromPayload,
  hasApiToken
};
