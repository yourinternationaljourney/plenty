// Netlify Functions foundation: authentication, ownership isolation, uploads, import, deletion, migrations.
// Runs entirely in-process against MemoryRepo/MemoryBlobs; the SQL adapter is exercised only on a deployed site.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createHandlers } = require('../netlify/functions/lib/handlers');
const { MemoryRepo } = require('../netlify/functions/lib/repo');
const { MemoryBlobs } = require('../netlify/functions/lib/blobs');
const { wrap, resetRateLimits } = require('../netlify/functions/lib/http');
const { listMigrations, splitStatements } = require('../tools/db-migrate');
const { RETAILERS, validateQuote, quoteToObservation } = require('../netlify/functions/lib/retailers/interface');

function setup() { resetRateLimits(); const repo = new MemoryRepo(); const blobs = new MemoryBlobs(); const deleted = []; const h = createHandlers({ repo, blobs, fetch: async (url, o) => { deleted.push({ url, method: o.method }); return { ok: true }; } }); const w = {}; for (const k in h) w[k] = wrap(h[k]); return { repo, blobs, h: w, deleted }; }
const ctx = (user, admin) => ({ clientContext: { user: user ? { sub: user, email: user + '@example.test', email_verified: true } : undefined, identity: admin ? { url: 'https://site.netlify.app/.netlify/identity', token: 'admin-token' } : undefined } });
const ev = (method, path, body, q) => ({ httpMethod: method, path: '/.netlify/functions/' + path, body: body ? JSON.stringify(body) : null, isBase64Encoded: false, headers: {}, queryStringParameters: q || {} });
const parse = r => ({ status: r.statusCode, body: r.body && r.headers['Content-Type'] && r.headers['Content-Type'].includes('json') ? JSON.parse(r.body) : r.body });
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(64, 1)]);
const docs = { 'app/settings': { weeklyBudget: 70, currency: '€', pets: [{ id: 'pet1', name: 'Biscuit', type: 'dog' }] }, 'recipes/r1': { id: 'r1', name: 'Curry', ingredients: [] }, 'weeks/2026-09-14': { slots: { 2: { dinner: [{ t: 'r', id: 'r1', sv: 1 }] } }, trips: [{ id: 't1', date: '2026-09-19', amount: 40, lines: [{ name: 'Milk', price: 2 }] }] }, 'app/health': { goals: ['maintain'], weightKg: 52 }, 'app/checkins': { days: { '2026-09-15': { veg: true } } }, 'prices/milk': { fam: 'vol', samples: [{ unitPrice: 0.001, store: 'Aldi', date: '2026-09-19' }] } };

test('unauthenticated requests are rejected on every endpoint', async () => {
  const { h } = setup();
  for (const [name, method] of [['profile', 'GET'], ['appData', 'GET'], ['receipts', 'GET'], ['receiptImage', 'GET'], ['accountExport', 'GET'], ['healthData', 'DELETE'], ['accountDelete', 'DELETE']]) {
    const r = parse(await h[name](ev(method, name), ctx(null)));
    assert.equal(r.status, 401, name); assert.equal(r.body.error.code, 'unauthenticated');
  }
  // a user id in the body or query is ignored: without a verified token there is no user at all
  const r = parse(await h.appData(ev('POST', 'app-data', { userId: 'alice', docs }), ctx(null)));
  assert.equal(r.status, 401);
});

test('receipt ownership: another user cannot read, download or delete a receipt, and ids in the request do not grant access', async () => {
  const { h, repo, blobs } = setup();
  const created = parse(await h.receipts(ev('POST', 'receipts', { localTripId: 't1', weekStart: '2026-09-14', date: '2026-09-19', store: 'Aldi', total: 42.5, lines: [{ name: 'Milk', price: 2, status: 'planned' }] }), ctx('alice')));
  assert.equal(created.status, 201); const id = created.body.receipt.id; assert.equal(created.body.receipt.processingStatus, 'not_connected');
  const up = parse(await h.receiptImage(ev('POST', 'receipt-image', { receiptId: id, contentType: 'image/png', data: PNG.toString('base64') }), ctx('alice')));
  assert.equal(up.status, 201); assert.equal(up.body.processing.status, 'not_connected');
  const row = await repo.getReceipt('alice', id); assert.ok(row.image_blob_key.startsWith('receipts/alice/'), 'blob key is namespaced and non-guessable');
  assert.equal((await blobs.listPrefix('receipts/alice/')).length, 1);
  for (const [name, method] of [['receipts', 'GET'], ['receiptImage', 'GET'], ['receipts', 'DELETE'], ['receiptImage', 'DELETE']]) {
    const r = parse(await h[name](ev(method, name, null, { id }), ctx('bob')));
    assert.equal(r.status, 404, `${method} ${name} as bob`);
  }
  assert.ok(await repo.getReceipt('alice', id), 'alice still has her receipt');
  assert.equal((await blobs.listPrefix('receipts/alice/')).length, 1, 'bob could not delete the image');
  const mine = await h.receiptImage(ev('GET', 'receipt-image', null, { id }), ctx('alice'));
  assert.equal(mine.statusCode, 200); assert.equal(mine.headers['Content-Type'], 'image/png'); assert.ok(mine.isBase64Encoded);
  assert.equal(parse(await h.receipts(ev('GET', 'receipts'), ctx('bob'))).body.receipts.length, 0, 'bob lists nothing');
  const del = parse(await h.receipts(ev('DELETE', 'receipts', null, { id }), ctx('alice')));
  assert.equal(del.status, 200); assert.equal(del.body.imageDeleted, true);
  assert.equal((await blobs.listPrefix('receipts/alice/')).length, 0, 'deleting the receipt removes its blob');
});

test('invalid uploads are rejected server-side: wrong type, oversized, mismatched declaration, unknown receipt', async () => {
  const { h } = setup();
  const created = parse(await h.receipts(ev('POST', 'receipts', { weekStart: '2026-09-14', date: '2026-09-19', total: 5 }), ctx('alice'))); const id = created.body.receipt.id;
  const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)]);
  assert.equal(parse(await h.receiptImage(ev('POST', 'receipt-image', { receiptId: id, contentType: 'image/png', data: gif.toString('base64') }), ctx('alice'))).body.error.code, 'unsupported_image');
  const html = Buffer.from('<html><script>alert(1)</script></html>');
  assert.equal(parse(await h.receiptImage(ev('POST', 'receipt-image', { receiptId: id, contentType: 'image/jpeg', data: html.toString('base64') }), ctx('alice'))).body.error.code, 'unsupported_image');
  assert.equal(parse(await h.receiptImage(ev('POST', 'receipt-image', { receiptId: id, contentType: 'image/jpeg', data: PNG.toString('base64') }), ctx('alice'))).body.error.code, 'image_type_mismatch');
  const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
  assert.equal(parse(await h.receiptImage(ev('POST', 'receipt-image', { receiptId: id, contentType: 'image/png', data: big.toString('base64') }), ctx('alice'))).status, 413);
  assert.equal(parse(await h.receiptImage(ev('POST', 'receipt-image', { receiptId: 'nope', contentType: 'image/png', data: PNG.toString('base64') }), ctx('alice'))).status, 404);
  assert.equal(parse(await h.receipts(ev('POST', 'receipts', { weekStart: 'monday', date: '2026-09-19', total: 5 }), ctx('alice'))).status, 400);
  assert.equal(parse(await h.receipts(ev('POST', 'receipts', { weekStart: '2026-09-14', date: '2026-09-19', total: -1 }), ctx('alice'))).status, 400);
  assert.equal(parse(await h.receipts({ ...ev('POST', 'receipts'), body: '{not json' }, ctx('alice'))).body.error.code, 'invalid_json');
});

test('local profile import: preview, confirm, duplicate prevention, older-data protection, restore', async () => {
  const { h, repo } = setup();
  const body = { sourceProfileId: 'p_local1', exportedAt: '2026-09-20T10:00:00.000Z', docs };
  const pv = parse(await h.appData(ev('POST', 'app-data', body, { preview: '1' }), ctx('alice')));
  assert.equal(pv.status, 200); assert.equal(pv.body.preview.docCount, 6); assert.equal(pv.body.preview.alreadyImported, false);
  assert.equal(Object.keys((await repo.getAppData('alice')).docs).length, 0, 'preview writes nothing');
  const imp = parse(await h.appData(ev('POST', 'app-data', body), ctx('alice')));
  assert.equal(imp.status, 200); assert.equal(imp.body.imported, 6);
  const back = parse(await h.appData(ev('GET', 'app-data'), ctx('alice')));
  assert.equal(back.body.docCount, 6);
  assert.deepEqual(back.body.docs['recipes/r1'], docs['recipes/r1'], 'documents round-trip unchanged');
  assert.equal(back.body.docs['app/settings'].pets[0].name, 'Biscuit');
  assert.equal(back.body.receipts.length, 1, 'trips inside weeks became receipt rows');
  assert.equal(repo.t.pets.size, 1); assert.equal(repo.t.meals.size, 1); assert.equal(repo.t.receipt_line_items.size, 1); assert.equal(repo.t.health_checkins.size, 1);
  const dup = parse(await h.appData(ev('POST', 'app-data', body), ctx('alice')));
  assert.equal(dup.status, 409); assert.equal(dup.body.error.code, 'already_imported');
  const older = parse(await h.appData(ev('POST', 'app-data', { ...body, exportedAt: '2026-09-01T00:00:00.000Z', force: true }), ctx('alice')));
  assert.equal(older.status, 200, 'an explicit confirmation is honoured');
  assert.equal(parse(await h.appData(ev('POST', 'app-data', { ...body, docs: { 'bad path!': {} } }), ctx('bob'))).status, 400);
  assert.equal(parse(await h.appData(ev('POST', 'app-data', { docs }), ctx('bob'))).body.error.code, 'missing_field');
  // bob's account is untouched by alice's import
  assert.equal(parse(await h.appData(ev('GET', 'app-data'), ctx('bob'))).body.docCount, 0);
  const prof = parse(await h.profile(ev('GET', 'profile'), ctx('alice')));
  assert.equal(prof.body.imports.length, 1); assert.equal(prof.body.sync.mode, 'manual'); assert.equal(prof.body.counts.recipes, 1);
});

test('health data and price history can be deleted separately; export puts health in its own section', async () => {
  const { h, repo } = setup();
  await h.appData(ev('POST', 'app-data', { sourceProfileId: 'p1', docs }), ctx('alice'));
  const exp = parse(await h.accountExport(ev('GET', 'account-export'), ctx('alice')));
  assert.equal(exp.status, 200); assert.equal(exp.body.format, 'plenty-account-export');
  assert.equal(exp.body.health.health_profiles.length, 1); assert.equal('health_profiles' in exp.body.data, false);
  assert.equal(parse(await h.healthData(ev('DELETE', 'health-data'), ctx('alice'))).body.deleted, 'health');
  assert.equal(repo.t.health_profiles.size, 0); assert.equal(repo.t.health_checkins.size, 0); assert.equal(repo.t.recipes.size, 1, 'other data stays');
  assert.equal(parse(await h.healthData(ev('DELETE', 'health-data', null, { what: 'prices' }), ctx('alice'))).body.count, 1);
  assert.equal(repo.t.price_observations.size, 0);
  // v2.2: price observations and offers entered in the app are personal price history too; products are not
  await h.appData(ev('POST', 'app-data', { sourceProfileId: 'p9', docs: { ...docs, 'products/p1': { id: 'p1', canonicalName: 'Milk' }, 'storeproducts/sp1': { id: 'sp1', storeId: 'jumbo', productId: 'p1' }, 'priceobs/ob1': { id: 'ob1', storeProductId: 'sp1', price: 1.19, manual: true }, 'offers/of1': { id: 'of1', storeProductId: 'sp1' } } }), ctx('carol'));
  const collsOf = () => [...repo.t.app_documents.entries()].filter(([k]) => k.startsWith('carol|')).map(([, r]) => r.collection).sort();
  assert.deepEqual(collsOf(), ['offers', 'priceobs', 'products', 'storeproducts']);
  await h.healthData(ev('DELETE', 'health-data', null, { what: 'prices' }), ctx('carol'));
  assert.deepEqual(collsOf(), ['products', 'storeproducts'], 'entered prices and offers are deleted with price history; products stay');
});

test('account deletion removes every row and blob for that user only, then the Identity user', async () => {
  const { h, repo, blobs, deleted } = setup();
  for (const u of ['alice', 'bob']) { await h.appData(ev('POST', 'app-data', { sourceProfileId: 'p_' + u, docs }), ctx(u)); const c = parse(await h.receipts(ev('POST', 'receipts', { weekStart: '2026-09-14', date: '2026-09-19', total: 5 }), ctx(u))); await h.receiptImage(ev('POST', 'receipt-image', { receiptId: c.body.receipt.id, contentType: 'image/png', data: PNG.toString('base64') }), ctx(u)); }
  assert.equal(parse(await h.accountDelete(ev('DELETE', 'account-delete', {}), ctx('alice', true))).body.error.code, 'confirm_required');
  const r = parse(await h.accountDelete(ev('DELETE', 'account-delete', { confirm: 'DELETE' }), ctx('alice', true)));
  assert.equal(r.status, 200); assert.equal(r.body.deleted, true); assert.equal(r.body.identityDeleted, true);
  assert.equal(deleted[0].url, 'https://site.netlify.app/.netlify/identity/admin/users/alice'); assert.equal(deleted[0].method, 'DELETE');
  for (const t of Object.keys(repo.t)) assert.equal([...repo.t[t].keys()].filter(k => k.startsWith('alice|') || k === 'alice').length, 0, 'no alice rows in ' + t);
  assert.equal((await blobs.listPrefix('receipts/alice/')).length, 0);
  assert.ok(repo.t.recipes.size >= 1 && [...repo.t.recipes.keys()].every(k => k.startsWith('bob|')), 'bob keeps his data');
  assert.equal((await blobs.listPrefix('receipts/bob/')).length, 1);
  assert.equal(parse(await h.appData(ev('GET', 'app-data'), ctx('alice'))).body.docCount, 0, 'a fresh sign-in sees an empty account');
});

test('schema migrations: ordered, every private table owned by user_id, price sources distinguished', () => {
  const ms = listMigrations();
  assert.ok(ms.length >= 1); assert.equal(ms[0].version, '0001');
  for (let i = 1; i < ms.length; i++) assert.ok(ms[i].version > ms[i - 1].version, 'versions are strictly ordered');
  const sql = ms.map(m => m.sql).join('\n');
  const tables = [...sql.matchAll(/create table if not exists (\w+)\s*\(([\s\S]*?)\n\);/g)].map(m => ({ name: m[1], body: m[2] }));
  assert.ok(tables.length >= 16, 'found ' + tables.length + ' tables');
  const shared = new Set(['schema_migrations', 'users', 'retailer_offers']);
  for (const t of tables) if (!shared.has(t.name)) assert.match(t.body, /user_id\s+text/, t.name + ' must belong to a user');
  const po = tables.find(t => t.name === 'price_observations');
  assert.match(po.body, /source_type in \('receipt','online','promotion','predicted'\)/);
  assert.match(po.body, /valid_from/); assert.match(po.body, /valid_until/); assert.match(po.body, /confidence/); assert.match(po.body, /source_url/); assert.match(po.body, /unit_price/); assert.match(po.body, /package_size/);
  const offers = tables.find(t => t.name === 'retailer_offers');
  assert.match(offers.body, /source_url\s+text not null/); assert.match(offers.body, /price_type in \('normal','promotion','loyalty'\)/); assert.match(offers.body, /requires_loyalty/); assert.match(offers.body, /coupon_required/);
  for (const name of ['health_profiles', 'health_checkins', 'import_status', 'product_mappings', 'preferred_stores', 'pets', 'meals', 'pantry_items', 'grocery_items', 'receipt_line_items']) assert.ok(tables.some(t => t.name === name), name);
  const stmts = splitStatements(ms[0].sql);
  assert.ok(stmts.length > 20 && stmts.every(s => /^(create|comment)/i.test(s)), 'statements split cleanly');
});

test('retailer foundation: nine planned providers, quotes without a source URL are refused', async () => {
  assert.deepEqual(Object.keys(RETAILERS).sort(), ['albert-heijn', 'aldi-us', 'jumbo', 'kroger', 'lidl-nl', 'no-frills', 'save-on-foods', 'walmart', 'walmart-ca']);
  assert.ok(Object.values(RETAILERS).every(r => r.status === 'planned'));
  await assert.rejects(RETAILERS.jumbo.searchOffers({ canon: 'milk' }), /not connected/);
  const q = { retailer: 'jumbo', country: 'NL', productName: 'Halfvolle melk 1L', price: 1.19, currency: 'EUR', priceType: 'normal', observedAt: '2026-09-21T10:00:00Z', requiresLoyalty: false, couponRequired: false, confidence: 0.9, matchingStatus: 'suggested' };
  assert.equal(validateQuote(q).ok, false, 'no source URL means no verified price');
  const ok = validateQuote({ ...q, sourceUrl: 'https://www.jumbo.com/producten/x' }); assert.equal(ok.ok, true);
  assert.equal(quoteToObservation({ ...q, sourceUrl: 'https://www.jumbo.com/x', priceType: 'promotion' }, 'alice', 'milk').source_type, 'promotion');
  assert.equal(quoteToObservation({ ...q, sourceUrl: 'https://www.jumbo.com/x' }, 'alice', 'milk').source_type, 'online');
});

test('netlify.toml publishes dist, routes /api to functions, and the cloud build only adds the Identity widget when flagged', () => {
  const toml = fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf8');
  assert.match(toml, /publish = "dist"/); assert.match(toml, /functions = "netlify\/functions"/); assert.match(toml, /from = "\/api\/\*"/); assert.match(toml, /to = "\/index\.html"/);
  assert.ok(!/[A-Za-z0-9_]{20,}=/.test(toml.replace(/NODE_VERSION = "20"/, '')), 'no secrets in netlify.toml');
  const { execFileSync } = require('child_process');
  const out = fs.mkdtempSync(path.join(require('os').tmpdir(), 'plenty-cloud-'));
  execFileSync(process.execPath, [path.join(__dirname, '..', 'build.js')], { stdio: 'pipe', env: { ...process.env, PLENTY_CLOUD: 'netlify', PLENTY_OUT: out } });
  const cloud = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(cloud, /<meta name="plenty-cloud" content="netlify">/); assert.match(cloud, /identity\.netlify\.com\/v1\/netlify-identity-widget\.js/);
  assert.ok(!/NETLIFY_DB_URL|postgres:\/\//.test(cloud), 'no database secrets in the client bundle');
  const out2 = fs.mkdtempSync(path.join(require('os').tmpdir(), 'plenty-local-'));
  execFileSync(process.execPath, [path.join(__dirname, '..', 'build.js')], { stdio: 'pipe', env: { ...process.env, PLENTY_CLOUD: '', PLENTY_OUT: out2 } });
  const local = fs.readFileSync(path.join(out2, 'index.html'), 'utf8');
  fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(out2, { recursive: true, force: true });
  assert.ok(!/identity\.netlify\.com/.test(local), 'the GitHub Pages build stays local-only');
});
