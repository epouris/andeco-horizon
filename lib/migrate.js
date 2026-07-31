/**
 * Apply railway/schema.sql one statement at a time (Railway / poolers often reject multi-statement queries).
 */
'use strict';

const fs = require('fs');
const path = require('path');

function splitSqlStatements(sql) {
  const lines = String(sql || '').split(/\r?\n/);
  const cleaned = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--')) continue;
    cleaned.push(line);
  }
  const body = cleaned.join('\n');
  return body
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function applySchema(pool, schemaPath) {
  const fullPath = schemaPath || path.join(__dirname, '..', 'railway', 'schema.sql');
  const sql = fs.readFileSync(fullPath, 'utf8');
  const statements = splitSqlStatements(sql);
  let applied = 0;
  for (const statement of statements) {
    try {
      await pool.query(statement);
      applied += 1;
    } catch (e) {
      // Ignore "already exists" style races; rethrow real errors
      const msg = (e && e.message) || '';
      const code = e && e.code;
      if (code === '42P07' || code === '42710' || /already exists/i.test(msg)) {
        applied += 1;
        continue;
      }
      console.error('Schema statement failed:', statement.slice(0, 120).replace(/\s+/g, ' '));
      throw e;
    }
  }
  return { statements: statements.length, applied };
}

async function listPublicTables(pool) {
  const r = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  return r.rows.map((row) => row.table_name);
}

module.exports = {
  splitSqlStatements,
  applySchema,
  listPublicTables
};
