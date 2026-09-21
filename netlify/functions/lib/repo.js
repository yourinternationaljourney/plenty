// Repository layer: one interface, two implementations.
//   MemoryRepo  - in-process maps, used by tests and as a reference for the contract.
//   SqlRepo     - Netlify Database (Postgres/Neon) through @neondatabase/serverless. Not exercised by the test suite;
//                 it runs only inside deployed Functions with NETLIFY_DB_URL (or the older NETLIFY_DATABASE_URL) set.
// Every method takes the verified userId first and never reads or writes rows of another user.
// Application documents (the local-first shape) are routed into typed tables; the original document is kept in a `data`
// column so the app can rebuild its exact local state from the account.
'use strict';
const crypto = require('crypto');
const { HttpError } = require('./http');

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const collectionOf = p => p.split('/')[0];
const weekOf = p => p.split('/')[1];

// ---- classification of app documents into tables ----
// returns {table, key, row}
function classify(userId, path, doc) {
  const coll = collectionOf(path); const id = path.split('/').slice(1).join('/');
  const t = nowIso();
  switch (coll) {
    case 'app':
      if (id === 'settings') return { table: 'household_settings', key: userId, row: { user_id: userId, country: doc.country || null, currency: doc.currency || null, locale: doc.language || null, data: doc, updated_at: t }, pets: (doc.pets || []).map(p => ({ id: String(p.id), user_id: userId, name: String(p.name || ''), type: String(p.type || 'other'), data: p, updated_at: t })) };
      if (id === 'health') return { table: 'health_profiles', key: userId, row: { user_id: userId, data: doc, updated_at: t } };
      if (id === 'checkins') return { table: 'health_checkins', key: userId, rows: Object.entries(doc.days || {}).map(([day, d]) => ({ user_id: userId, day, data: d, updated_at: t })), row: null };
      return { table: 'app_documents', key: path, row: { user_id: userId, path, collection: 'app', data: doc, updated_at: t } };
    case 'recipes': return { table: 'recipes', key: id, row: { id, user_id: userId, name: String(doc.name || ''), data: doc, updated_at: t } };
    case 'items': return { table: 'grocery_items', key: id, row: { id, user_id: userId, name: String(doc.name || ''), kind: doc.kind || 'grocery', category: doc.category || null, pet_id: doc.petId || null, data: doc, updated_at: t } };
    case 'inventory': return { table: 'pantry_items', key: id, row: { id, user_id: userId, name: String(doc.name || ''), location: doc.location || null, qty: doc.qty == null ? null : Number(doc.qty), unit: doc.unit || null, data: doc, updated_at: t } };
    case 'weeks': {
      const week = weekOf(path);
      const meals = []; for (const d in (doc.slots || {})) for (const m in doc.slots[d]) for (const e of (doc.slots[d][m] || [])) meals.push({ id: `${week}:${d}:${m}:${meals.length}`, user_id: userId, week_start: week, day: Number(d), meal_type: m, entry_type: e.t, recipe_id: e.id || e.of || null, servings: e.sv == null ? null : Number(e.sv), data: e });
      const receipts = (doc.trips || []).map(tr => ({ id: String(tr.id), user_id: userId, week_start: week, store: tr.store || null, receipt_date: tr.date || week, total: Number(tr.amount || 0), tax: Number(tr.tax || 0), discount: Number(tr.discount || 0), currency: null, note: tr.note || null, method: tr.method || 'quick', local_trip_id: String(tr.id), data: tr, created_at: t, updated_at: t, lines: (tr.lines || []).map((l, i) => ({ id: `${tr.id}:${i}`, user_id: userId, receipt_id: String(tr.id), name: String(l.name || ''), qty: Number(l.qty || 1), price: Number(l.price || 0), category: l.category || null, status: l.status || 'unplanned', purpose: l.purpose || (l.pet ? 'pet' : 'week'), canon: l.canon || null, data: l })) }));
      return { table: 'weekly_plans', key: week, row: { user_id: userId, week_start: week, data: doc, updated_at: t }, meals, receipts };
    }
    case 'prices': return { table: 'price_observations', key: id, row: { id, user_id: userId, canon: id, product_name: id, source_type: 'receipt', price: null, unit_price: (doc.samples || []).length ? Number(doc.samples[doc.samples.length - 1].unitPrice) : null, store: (doc.samples || []).length ? (doc.samples[doc.samples.length - 1].store || null) : null, observed_at: (doc.samples || []).length ? doc.samples[doc.samples.length - 1].date : null, confidence: (doc.samples || []).length >= 3 ? 0.8 : 0.5, data: doc, created_at: t } };
    default: return { table: 'app_documents', key: path, row: { user_id: userId, path, collection: coll, data: doc, updated_at: t } };
  }
}

// Rebuild the local-first document map from typed rows.
function docsFromRows(rows) {
  const docs = {};
  for (const r of rows.household_settings || []) docs['app/settings'] = r.data;
  for (const r of rows.health_profiles || []) docs['app/health'] = r.data;
  if ((rows.health_checkins || []).length) docs['app/checkins'] = { days: Object.fromEntries(rows.health_checkins.map(r => [typeof r.day === 'string' ? r.day.slice(0, 10) : new Date(r.day).toISOString().slice(0, 10), r.data])), dismissed: {} };
  for (const r of rows.recipes || []) docs['recipes/' + r.id] = r.data;
  for (const r of rows.grocery_items || []) docs['items/' + r.id] = r.data;
  for (const r of rows.pantry_items || []) docs['inventory/' + r.id] = r.data;
  for (const r of rows.weekly_plans || []) docs['weeks/' + r.week_start] = r.data;
  for (const r of rows.price_observations || []) if (r.data) docs['prices/' + r.id] = r.data;
  for (const r of rows.app_documents || []) docs[r.path] = r.data;
  return docs;
}

const TABLES = ['users', 'household_settings', 'pets', 'weekly_plans', 'meals', 'recipes', 'grocery_items', 'pantry_items', 'receipts', 'receipt_line_items', 'product_mappings', 'price_observations', 'preferred_stores', 'health_profiles', 'health_checkins', 'app_documents', 'import_status'];
const HEALTH_TABLES = ['health_profiles', 'health_checkins'];
// v2.2 price-comparison documents (products, storeproducts, priceobs, offers) travel in app_documents; these two are personal price history.
const PRICE_DOC_COLLECTIONS = ['priceobs', 'offers'];

/* ================= MemoryRepo ================= */
class MemoryRepo {
  constructor() { this.t = {}; for (const n of TABLES) this.t[n] = new Map(); }
  _k(userId, key) { return userId + '|' + key; }
  _put(table, userId, key, row) { this.t[table].set(this._k(userId, key), row); }
  _rows(table, userId) { const out = []; for (const [k, v] of this.t[table]) if (k.startsWith(userId + '|')) out.push(v); return out; }
  _clear(table, userId) { for (const k of [...this.t[table].keys()]) if (k.startsWith(userId + '|')) this.t[table].delete(k); }

  async ensureUser(user) { const cur = this.t.users.get(user.id); const row = cur || { id: user.id, email: user.email, created_at: nowIso(), updated_at: nowIso(), country: null, currency: null, locale: null }; row.email = user.email || row.email; this.t.users.set(user.id, row); return row; }
  async getProfile(userId) { const u = this.t.users.get(userId); if (!u) return null; const hs = this._rows('household_settings', userId)[0]; const imp = this._rows('import_status', userId); return { user: u, settings: hs ? hs.data : null, imports: imp, counts: this._counts(userId) }; }
  _counts(userId) { const c = {}; for (const n of TABLES) if (n !== 'users') c[n] = this._rows(n, userId).length; return c; }

  async putAppData(userId, docs, mode) {
    if (mode === 'replace') for (const n of TABLES) if (n !== 'users' && n !== 'import_status') this._clear(n, userId);
    let n = 0;
    for (const path in docs) {
      const doc = docs[path]; if (doc === null) continue;
      const c = classify(userId, path, doc); n++;
      if (c.row) this._put(c.table, userId, c.key, c.row);
      if (c.pets) { this._clear('pets', userId); for (const p of c.pets) this._put('pets', userId, p.id, p); }
      if (c.rows) { this._clear('health_checkins', userId); for (const r of c.rows) this._put('health_checkins', userId, r.day, r); }
      if (c.meals) { for (const k of [...this.t.meals.keys()]) if (k.startsWith(userId + '|' + c.key + ':')) this.t.meals.delete(k); for (const m of c.meals) this._put('meals', userId, m.id, m); }
      if (c.receipts) for (const r of c.receipts) { const existing = this.t.receipts.get(this._k(userId, r.id)); if (existing && existing.image_blob_key) { r.image_blob_key = existing.image_blob_key; r.image_mime = existing.image_mime; r.image_size = existing.image_size; r.processing_status = existing.processing_status; } const lines = r.lines; delete r.lines; this._put('receipts', userId, r.id, { processing_status: 'not_connected', ...r }); for (const k of [...this.t.receipt_line_items.keys()]) if (k.startsWith(userId + '|' + r.id + ':')) this.t.receipt_line_items.delete(k); for (const l of lines) this._put('receipt_line_items', userId, l.id, l); }
    }
    return { written: n };
  }
  async getAppData(userId) { const rows = {}; for (const n of ['household_settings', 'health_profiles', 'health_checkins', 'recipes', 'grocery_items', 'pantry_items', 'weekly_plans', 'price_observations', 'app_documents']) rows[n] = this._rows(n, userId); return { docs: docsFromRows(rows), receipts: this._rows('receipts', userId).map(r => ({ id: r.id, local_trip_id: r.local_trip_id, image: !!r.image_blob_key, processing_status: r.processing_status })) }; }

  async getImport(userId, sourceProfileId) { return this.t.import_status.get(this._k(userId, sourceProfileId)) || null; }
  async recordImport(userId, rec) { this._put('import_status', userId, rec.source_profile_id, { user_id: userId, ...rec, imported_at: nowIso() }); }

  async createReceipt(userId, r) { const id = newId(); const row = { id, user_id: userId, week_start: r.weekStart, store: r.store || null, receipt_date: r.date, total: r.total, tax: r.tax, discount: r.discount, currency: r.currency, note: r.note || null, method: r.method, local_trip_id: r.localTripId || null, image_blob_key: null, image_mime: null, image_size: null, processing_status: 'not_connected', data: r, created_at: nowIso(), updated_at: nowIso() }; this._put('receipts', userId, id, row); r.lines.forEach((l, i) => this._put('receipt_line_items', userId, `${id}:${i}`, { id: `${id}:${i}`, user_id: userId, receipt_id: id, ...l })); return row; }
  async getReceipt(userId, id) { return this.t.receipts.get(this._k(userId, id)) || null; }
  async listReceipts(userId) { return this._rows('receipts', userId); }
  async setReceiptImage(userId, id, img) { const r = await this.getReceipt(userId, id); if (!r) return null; Object.assign(r, { image_blob_key: img ? img.key : null, image_mime: img ? img.mime : null, image_size: img ? img.size : null, updated_at: nowIso() }); return r; }
  async deleteReceipt(userId, id) { const r = await this.getReceipt(userId, id); if (!r) return null; this.t.receipts.delete(this._k(userId, id)); for (const k of [...this.t.receipt_line_items.keys()]) if (k.startsWith(userId + '|' + id + ':')) this.t.receipt_line_items.delete(k); return r; }
  async deletePriceHistory(userId) { const n = this._rows('price_observations', userId).length; this._clear('price_observations', userId); this._clear('product_mappings', userId); for (const [k, v] of [...this.t.app_documents]) if (k.startsWith(userId + '|') && PRICE_DOC_COLLECTIONS.includes(v.collection)) this.t.app_documents.delete(k); return n; }
  async deleteHealth(userId) { for (const n of HEALTH_TABLES) this._clear(n, userId); }
  async exportAll(userId) { const out = {}; for (const n of TABLES) out[n] = n === 'users' ? [this.t.users.get(userId)].filter(Boolean) : this._rows(n, userId); return out; }
  async blobKeys(userId) { return this._rows('receipts', userId).map(r => r.image_blob_key).filter(Boolean); }
  async deleteAll(userId) { for (const n of TABLES) if (n !== 'users') this._clear(n, userId); this.t.users.delete(userId); }
}

/* ================= SqlRepo (Netlify Database / Neon) ================= */
class SqlRepo {
  constructor(sql) { this.sql = sql; }
  static fromEnv() {
    const url = process.env.NETLIFY_DB_URL || process.env.NETLIFY_DATABASE_URL;
    if (!url) throw new HttpError(503, 'database_not_configured', 'The account database is not configured on this deployment yet.');
    const { neon } = require('@neondatabase/serverless');
    return new SqlRepo(neon(url));
  }
  async ensureUser(user) { const rows = await this.sql`insert into users (id, email) values (${user.id}, ${user.email}) on conflict (id) do update set email = excluded.email, updated_at = now() returning *`; return rows[0]; }
  async getProfile(userId) { const u = (await this.sql`select * from users where id = ${userId}`)[0]; if (!u) return null; const hs = (await this.sql`select data from household_settings where user_id = ${userId}`)[0]; const imports = await this.sql`select source_profile_id, source_exported_at, doc_count, mode, imported_at from import_status where user_id = ${userId}`; const counts = {}; for (const n of TABLES) if (n !== 'users') counts[n] = Number((await this.sql.query(`select count(*)::int as c from ${n} where user_id = $1`, [userId]))[0].c); return { user: u, settings: hs ? hs.data : null, imports, counts }; }
  async putAppData(userId, docs, mode) {
    if (mode === 'replace') for (const n of TABLES) if (n !== 'users' && n !== 'import_status') await this.sql.query(`delete from ${n} where user_id = $1`, [userId]);
    let n = 0;
    for (const path in docs) { const doc = docs[path]; if (doc === null) continue; const c = classify(userId, path, doc); n++;
      const r = c.row; const j = JSON.stringify;
      switch (c.table) {
        case 'household_settings': await this.sql`insert into household_settings (user_id, country, currency, locale, data) values (${userId}, ${r.country}, ${r.currency}, ${r.locale}, ${j(r.data)}::jsonb) on conflict (user_id) do update set country = excluded.country, currency = excluded.currency, locale = excluded.locale, data = excluded.data, updated_at = now()`; await this.sql`delete from pets where user_id = ${userId}`; for (const p of c.pets) await this.sql`insert into pets (id, user_id, name, type, data) values (${p.id}, ${userId}, ${p.name}, ${p.type}, ${j(p.data)}::jsonb)`; break;
        case 'health_profiles': await this.sql`insert into health_profiles (user_id, data) values (${userId}, ${j(r.data)}::jsonb) on conflict (user_id) do update set data = excluded.data, updated_at = now()`; break;
        case 'health_checkins': await this.sql`delete from health_checkins where user_id = ${userId}`; for (const d of c.rows) await this.sql`insert into health_checkins (user_id, day, data) values (${userId}, ${d.day}, ${j(d.data)}::jsonb)`; break;
        case 'recipes': await this.sql`insert into recipes (id, user_id, name, data) values (${r.id}, ${userId}, ${r.name}, ${j(r.data)}::jsonb) on conflict (user_id, id) do update set name = excluded.name, data = excluded.data, updated_at = now()`; break;
        case 'grocery_items': await this.sql`insert into grocery_items (id, user_id, name, kind, category, pet_id, data) values (${r.id}, ${userId}, ${r.name}, ${r.kind}, ${r.category}, ${r.pet_id}, ${j(r.data)}::jsonb) on conflict (user_id, id) do update set name = excluded.name, kind = excluded.kind, category = excluded.category, pet_id = excluded.pet_id, data = excluded.data, updated_at = now()`; break;
        case 'pantry_items': await this.sql`insert into pantry_items (id, user_id, name, location, qty, unit, data) values (${r.id}, ${userId}, ${r.name}, ${r.location}, ${r.qty}, ${r.unit}, ${j(r.data)}::jsonb) on conflict (user_id, id) do update set name = excluded.name, location = excluded.location, qty = excluded.qty, unit = excluded.unit, data = excluded.data, updated_at = now()`; break;
        case 'weekly_plans': await this.sql`insert into weekly_plans (user_id, week_start, data) values (${userId}, ${r.week_start}, ${j(r.data)}::jsonb) on conflict (user_id, week_start) do update set data = excluded.data, updated_at = now()`; await this.sql`delete from meals where user_id = ${userId} and week_start = ${r.week_start}`; for (const m of c.meals) await this.sql`insert into meals (id, user_id, week_start, day, meal_type, entry_type, recipe_id, servings, data) values (${m.id}, ${userId}, ${m.week_start}, ${m.day}, ${m.meal_type}, ${m.entry_type}, ${m.recipe_id}, ${m.servings}, ${j(m.data)}::jsonb)`;
          for (const rc of c.receipts) { const lines = rc.lines; await this.sql`insert into receipts (id, user_id, week_start, store, receipt_date, total, tax, discount, currency, note, method, local_trip_id, data) values (${rc.id}, ${userId}, ${rc.week_start}, ${rc.store}, ${rc.receipt_date}, ${rc.total}, ${rc.tax}, ${rc.discount}, ${rc.currency}, ${rc.note}, ${rc.method}, ${rc.local_trip_id}, ${j(rc.data)}::jsonb) on conflict (user_id, id) do update set store = excluded.store, receipt_date = excluded.receipt_date, total = excluded.total, tax = excluded.tax, discount = excluded.discount, note = excluded.note, data = excluded.data, updated_at = now()`; await this.sql`delete from receipt_line_items where user_id = ${userId} and receipt_id = ${rc.id}`; for (const l of lines) await this.sql`insert into receipt_line_items (id, user_id, receipt_id, name, qty, price, category, status, purpose, canon, data) values (${l.id}, ${userId}, ${l.receipt_id}, ${l.name}, ${l.qty}, ${l.price}, ${l.category}, ${l.status}, ${l.purpose}, ${l.canon}, ${j(l.data)}::jsonb)`; } break;
        case 'price_observations': await this.sql`insert into price_observations (id, user_id, canon, product_name, store, source_type, unit_price, observed_at, confidence, data) values (${r.id}, ${userId}, ${r.canon}, ${r.product_name}, ${r.store}, 'receipt', ${r.unit_price}, ${r.observed_at}, ${r.confidence}, ${j(r.data)}::jsonb) on conflict (user_id, id) do update set store = excluded.store, unit_price = excluded.unit_price, observed_at = excluded.observed_at, confidence = excluded.confidence, data = excluded.data`; break;
        default: await this.sql`insert into app_documents (user_id, path, collection, data) values (${userId}, ${r.path}, ${r.collection}, ${j(r.data)}::jsonb) on conflict (user_id, path) do update set data = excluded.data, updated_at = now()`;
      } }
    return { written: n };
  }
  async getAppData(userId) { const rows = {}; for (const n of ['household_settings', 'health_profiles', 'health_checkins', 'recipes', 'grocery_items', 'pantry_items', 'weekly_plans', 'price_observations', 'app_documents']) rows[n] = await this.sql.query(`select * from ${n} where user_id = $1`, [userId]); const receipts = await this.sql`select id, local_trip_id, image_blob_key, processing_status from receipts where user_id = ${userId}`; return { docs: docsFromRows(rows), receipts: receipts.map(r => ({ id: r.id, local_trip_id: r.local_trip_id, image: !!r.image_blob_key, processing_status: r.processing_status })) }; }
  async getImport(userId, sourceProfileId) { return (await this.sql`select * from import_status where user_id = ${userId} and source_profile_id = ${sourceProfileId}`)[0] || null; }
  async recordImport(userId, rec) { await this.sql`insert into import_status (user_id, source_profile_id, source_exported_at, doc_count, mode) values (${userId}, ${rec.source_profile_id}, ${rec.source_exported_at}, ${rec.doc_count}, ${rec.mode}) on conflict (user_id, source_profile_id) do update set source_exported_at = excluded.source_exported_at, doc_count = excluded.doc_count, mode = excluded.mode, imported_at = now()`; }
  async createReceipt(userId, r) { const id = newId(); const rows = await this.sql`insert into receipts (id, user_id, week_start, store, receipt_date, total, tax, discount, currency, note, method, local_trip_id, data) values (${id}, ${userId}, ${r.weekStart}, ${r.store || null}, ${r.date}, ${r.total}, ${r.tax}, ${r.discount}, ${r.currency}, ${r.note || null}, ${r.method}, ${r.localTripId || null}, ${JSON.stringify(r)}::jsonb) returning *`; let i = 0; for (const l of r.lines) { await this.sql`insert into receipt_line_items (id, user_id, receipt_id, name, qty, price, category, status, purpose, canon, data) values (${id + ':' + (i++)}, ${userId}, ${id}, ${l.name}, ${l.qty}, ${l.price}, ${l.category || null}, ${l.status}, ${l.purpose}, ${l.canon || null}, ${JSON.stringify(l)}::jsonb)`; } return rows[0]; }
  async getReceipt(userId, id) { return (await this.sql`select * from receipts where user_id = ${userId} and id = ${id}`)[0] || null; }
  async listReceipts(userId) { return this.sql`select * from receipts where user_id = ${userId} order by receipt_date desc`; }
  async setReceiptImage(userId, id, img) { const rows = await this.sql`update receipts set image_blob_key = ${img ? img.key : null}, image_mime = ${img ? img.mime : null}, image_size = ${img ? img.size : null}, updated_at = now() where user_id = ${userId} and id = ${id} returning *`; return rows[0] || null; }
  async deleteReceipt(userId, id) { const r = await this.getReceipt(userId, id); if (!r) return null; await this.sql`delete from receipt_line_items where user_id = ${userId} and receipt_id = ${id}`; await this.sql`delete from receipts where user_id = ${userId} and id = ${id}`; return r; }
  async deletePriceHistory(userId) { const n = (await this.sql`delete from price_observations where user_id = ${userId} returning id`).length; await this.sql`delete from product_mappings where user_id = ${userId}`; await this.sql`delete from app_documents where user_id = ${userId} and collection in ('priceobs', 'offers')`; return n; }
  async deleteHealth(userId) { for (const n of HEALTH_TABLES) await this.sql.query(`delete from ${n} where user_id = $1`, [userId]); }
  async exportAll(userId) { const out = {}; for (const n of TABLES) out[n] = n === 'users' ? await this.sql`select * from users where id = ${userId}` : await this.sql.query(`select * from ${n} where user_id = $1`, [userId]); return out; }
  async blobKeys(userId) { return (await this.sql`select image_blob_key from receipts where user_id = ${userId} and image_blob_key is not null`).map(r => r.image_blob_key); }
  async deleteAll(userId) { for (const n of [...TABLES].reverse()) if (n !== 'users') await this.sql.query(`delete from ${n} where user_id = $1`, [userId]); await this.sql`delete from users where id = ${userId}`; }
}

module.exports = { MemoryRepo, SqlRepo, classify, docsFromRows, TABLES, HEALTH_TABLES, newId };
