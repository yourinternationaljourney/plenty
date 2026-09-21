// Applies netlify/db/migrations/*.sql in order, once each, tracked in schema_migrations.
// Runs as part of `npm run build:netlify`. With no database URL it exits 0 and says so, so builds never fail before
// Netlify Database is enabled. Exported helpers are unit-tested without a database.
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'netlify', 'db', 'migrations');
function listMigrations(dir) {
  return fs.readdirSync(dir || DIR).filter(f => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort().map(f => ({ version: f.slice(0, 4), file: f, sql: fs.readFileSync(path.join(dir || DIR, f), 'utf8') }));
}
// Split on statement terminators at line ends; comments are kept (Postgres accepts them). Good enough for our DDL.
function splitStatements(sql) { return sql.split(/;\s*(?:\r?\n|$)/).map(s => s.replace(/^(\s*--[^\n]*\n)+/, '').trim()).filter(Boolean); }

async function migrate(connectionString, dir) {
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(connectionString);
  await sql.query('create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())');
  const applied = new Set((await sql.query('select version from schema_migrations')).map(r => r.version));
  const done = [];
  for (const m of listMigrations(dir)) {
    if (applied.has(m.version)) continue;
    for (const st of splitStatements(m.sql)) await sql.query(st);
    await sql.query('insert into schema_migrations (version) values ($1)', [m.version]);
    done.push(m.file);
  }
  return done;
}

if (require.main === module) {
  const url = process.env.NETLIFY_DB_URL || process.env.NETLIFY_DATABASE_URL;
  if (!url) { console.log('[db-migrate] No NETLIFY_DB_URL / NETLIFY_DATABASE_URL set; skipping migrations (account features stay off until Netlify Database is enabled).'); process.exit(0); }
  migrate(url).then(done => { console.log('[db-migrate] applied: ' + (done.length ? done.join(', ') : 'nothing new')); }).catch(e => { console.error('[db-migrate] failed:', e.message); process.exit(1); });
}
module.exports = { listMigrations, splitStatements, migrate };
