const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadEngine } = require('./harness');
const ROOT = path.join(__dirname, '..');
const deepEq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);

async function freshStore(E) { const backend = new E.MemoryBackend(); await E.Store.init(backend); return backend; }
const recipe = { id: 'r1', name: 'Chickpea curry', mealTypes: ['dinner'], servings: 4, minutes: 30, ingredients: [{ qty: 400, unit: 'g', name: 'chickpeas', price: 1.6 }, { qty: 200, unit: 'g', name: 'spinach', price: 1.5 }] };

test('a completely new user starts with empty onboarding and no profile', async () => {
  const E = loadEngine();
  await freshStore(E);
  assert.equal(E.Store.profileId, null);
  assert.equal(E.Store.registry.profiles.length, 0);
  assert.equal(E.onboardingRequired(), true);
  deepEq(await E.Store.allDocs('nobody'), {});
  deepEq(E.DEFAULT_SETTINGS.pets, []);
  assert.equal('petName' in E.DEFAULT_SETTINGS, false, 'no default pet name in the code');
});

test('onboarding answers become documents; pets are per profile and optional; weight loss is never assumed', () => {
  const E = loadEngine();
  const none = E.settingsFromOnboarding({ name: 'Alex', currency: '€', weeklyBudget: 60, people: 2 });
  deepEq(none.settings.pets, []);
  assert.equal(none.items.length, 0, 'no pets means no pet items');
  assert.equal(none.settings.profileName, 'Alex');
  deepEq(none.health.goals, []);
  assert.equal(E.wantsWeightLoss(none.health), false);
  const withPets = E.settingsFromOnboarding({ name: 'Sam', pets: [{ name: 'Biscuit', type: 'dog' }, { name: 'Mochi', type: 'cat' }] });
  assert.equal(withPets.settings.pets.length, 2);
  assert.ok(withPets.items.every(i => i.kind === 'pet' && i.petId), 'every pet item belongs to a pet');
  assert.ok(withPets.items.some(i => /Biscuit/.test(i.name)) && withPets.items.some(i => /Mochi/.test(i.name)));
  assert.ok(withPets.items.some(i => /cat litter/i.test(i.name)), 'cat supplies differ from dog supplies');
  E.S.settings = withPets.settings;
  assert.equal(E.petName(), 'Biscuit');
  assert.equal(E.petNames(), 'Biscuit & Mochi');
  assert.equal(E.GROUP_LABEL('pet'), 'Biscuit & Mochi');
  // pet items never enter the human nutrition analysis
  for (const it of withPets.items) E.S.items[it.id] = it;
  const buy = E.purchaseFoodProfile(E.week());
  assert.equal(buy.planned.total, 0);
});

test('separate local profiles never see each other\'s data', async () => {
  const E = loadEngine();
  await freshStore(E);
  const p1 = await E.Store.createProfile('One');
  await E.Store.set('recipes/r1', recipe);
  await E.Store.set('app/settings', { weeklyBudget: 70, pets: [{ id: 'pet1', name: 'Biscuit', type: 'dog' }] });
  await E.Store.set('weeks/2026-09-14', { trips: [{ id: 't1', amount: 40, lines: [] }] });
  const p2 = await E.Store.createProfile('Two');
  assert.equal(E.Store.profileId, p2);
  deepEq(await E.Store.list('recipes'), {});
  assert.equal(await E.Store.get('app/settings'), null, 'no settings, so no pets, no budget');
  deepEq(await E.Store.list('weeks'), {}, 'no receipts');
  await E.Store.set('recipes/r9', { ...recipe, id: 'r9', name: 'Only for two' });
  await E.Store.switchProfile(p1);
  const r1 = await E.Store.list('recipes');
  deepEq(Object.keys(r1), ['r1']);
  assert.equal((await E.Store.get('app/settings')).pets[0].name, 'Biscuit');
});

test('documents persist across a re-open and blobs (receipt images) can be stored and deleted', async () => {
  const E = loadEngine();
  const backend = await freshStore(E);
  const pid = await E.Store.createProfile('Me');
  await E.Store.set('items/i1', { id: 'i1', name: 'Milk' });
  const fakeBlob = { type: 'image/jpeg', size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  await E.Store.putBlob('img1', fakeBlob, { tripId: 't1' });
  // simulate closing and reopening the app with the same database
  const E2 = loadEngine();
  await E2.Store.init(backend);
  assert.equal(E2.Store.profileId, pid, 'active profile is remembered');
  assert.equal((await E2.Store.get('items/i1')).name, 'Milk');
  assert.equal((await E2.Store.listBlobs()).length, 1);
  await E2.Store.delBlob('img1');
  assert.equal((await E2.Store.listBlobs()).length, 0, 'receipt image removed');
  assert.equal((await E2.Store.get('items/i1')).name, 'Milk', 'deleting an image never touches documents');
  // IndexedDB backend exists for the browser and uses the versioned schema
  assert.equal(typeof E2.IdbBackend, 'function');
  assert.equal(E2.PLENTY_DB_VERSION, 2);
  assert.ok(E2.IDB_SCHEMA[1] && E2.IDB_SCHEMA[2]);
});

test('schema upgrades migrate old documents without deleting anything', async () => {
  const E = loadEngine();
  const backend = await freshStore(E);
  const pid = await E.Store.createProfile('Old');
  await E.Store.set('app/settings', { weeklyBudget: 55, petName: 'Rex' });
  await E.Store.set('recipes/r1', recipe);
  E.Store.registry.profiles[0].dataVersion = 1; await E.Store.saveRegistry();
  const E2 = loadEngine();
  await E2.Store.init(backend);
  const s = await E2.Store.get('app/settings');
  assert.equal(s.weeklyBudget, 55);
  deepEq(s.pets, [{ id: 'pet1', name: 'Rex', type: 'dog' }]);
  assert.equal('petName' in s, false);
  assert.equal((await E2.Store.get('recipes/r1')).name, 'Chickpea curry');
  assert.equal(E2.Store.registry.profiles[0].dataVersion, E2.PLENTY_DATA_VERSION);
});

test('existing prototype data in localStorage is detected, imported and left in place until confirmed', async () => {
  const E = loadEngine();
  await freshStore(E);
  const ls = { store: { 'plenty:app/settings': JSON.stringify({ weeklyBudget: 70, petName: 'Rex' }), 'plenty:recipes/r1': JSON.stringify(recipe), 'plenty:weeks/2026-09-07': JSON.stringify({ slots: {}, trips: [{ id: 't', amount: 30 }] }), 'plenty:ui': '{"tab":"home"}', 'other': 'x' }, get length() { return Object.keys(this.store).length; }, key(i) { return Object.keys(this.store)[i]; }, getItem(k) { return this.store[k]; } };
  const det = E.detectPrototypeLocalData(ls);
  assert.equal(det.count, 3);
  assert.equal(det.recipes, 1); assert.equal(det.weeks, 1); assert.equal(det.hasReceipts, true);
  const pid = await E.Store.createProfile('Simone');
  const n = await E.importPrototypeData(det, pid);
  assert.equal(n, 3);
  const s = await E.Store.get('app/settings');
  deepEq(s.pets, [{ id: 'pet1', name: 'Rex', type: 'dog' }], 'migrated to the new pets shape on import');
  assert.equal((await E.Store.get('recipes/r1')).name, 'Chickpea curry');
  assert.equal(ls.length, 5, 'original browser data untouched');
});

test('backup export and import round-trip, including images, with verification', async () => {
  const E = loadEngine();
  await freshStore(E);
  const p1 = await E.Store.createProfile('Simone');
  await E.Store.set('app/settings', { weeklyBudget: 70, pets: [{ id: 'pet1', name: 'Biscuit', type: 'dog' }] });
  await E.Store.set('recipes/r1', recipe);
  await E.Store.set('app/health', { goals: ['maintain'] });
  await E.Store.set('weeks/2026-09-14', { slots: {}, trips: [{ id: 't1', amount: 42.5, imageId: 'img1', lines: [{ name: 'Milk', price: 2 }] }] });
  await E.Store.putBlob('img1', { type: 'image/png', size: 4, arrayBuffer: async () => new Uint8Array([9, 8, 7, 6]).buffer }, { tripId: 't1' });
  const backup = await E.buildBackup();
  assert.equal(backup.format, 'plenty-backup'); assert.equal(backup.version, 2);
  assert.equal(backup.counts.recipes, 1); assert.equal(backup.counts.receipts, 1); assert.equal(backup.counts.images, 1); assert.equal(backup.counts.health, 1);
  assert.equal(backup.profile.name, 'Simone');
  const text = await E.serializeBackup(backup, null);
  const parsed = await E.parseBackup(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.summary.name, 'Simone');
  // restore into a fresh profile on "another device"
  const E2 = loadEngine();
  await freshStore(E2);
  const p2 = await E2.Store.createProfile('Simone');
  const v = await E2.applyBackup(p2, parsed.backup, 'replace');
  assert.equal(v.ok, true); assert.equal(v.docs, 4); assert.equal(v.blobs, 1);
  assert.equal((await E2.Store.get('recipes/r1')).name, 'Chickpea curry');
  assert.equal((await E2.Store.get('app/settings')).pets[0].name, 'Biscuit');
  const img = await E2.Store.getBlob('img1');
  assert.equal(Array.from(new Uint8Array(await img.blob.arrayBuffer())).join(','), '9,8,7,6');
});

test('encrypted backups need the password and reject the wrong one', async () => {
  const E = loadEngine();
  await freshStore(E);
  await E.Store.createProfile('Me');
  await E.Store.set('app/health', { goals: ['heart'], weightKg: 52 });
  const backup = await E.buildBackup();
  assert.equal(E.containsSensitive(backup.docs), true, 'health data marks the backup as sensitive');
  const text = await E.serializeBackup(backup, 'correct horse battery');
  const env = JSON.parse(text);
  assert.equal(env.encrypted, true);
  assert.ok(!text.includes('52') || !text.includes('weightKg'), 'health values are not readable in the file');
  assert.ok(!text.includes('"goals"'));
  const noPw = await E.parseBackup(text);
  assert.equal(noPw.ok, false); assert.equal(noPw.needsPassword, true);
  const wrong = await E.parseBackup(text, 'nope');
  assert.equal(wrong.ok, false); assert.match(wrong.error, /Wrong password/);
  const right = await E.parseBackup(text, 'correct horse battery');
  assert.equal(right.ok, true);
  assert.equal(right.backup.docs['app/health'].weightKg, 52);
});

test('invalid backups are rejected with a clear reason', async () => {
  const E = loadEngine();
  assert.match((await E.parseBackup('not json')).error, /not valid JSON/);
  assert.match((await E.parseBackup(JSON.stringify({ hello: 1 }))).error, /not a Plenty backup/);
  assert.match((await E.parseBackup(JSON.stringify({ format: 'plenty-backup', version: 99, docs: {} }))).error, /newer Plenty/);
  assert.match((await E.parseBackup(JSON.stringify({ format: 'plenty-backup', version: 2, docs: [] }))).error, /no documents/);
  assert.match((await E.parseBackup(JSON.stringify({ format: 'plenty-backup', version: 2, docs: { 'bad path with spaces': {} } }))).error, /Damaged document path/);
  assert.match((await E.parseBackup(JSON.stringify({ format: 'plenty-backup', version: 2, docs: { 'recipes/r1': 'string' } }))).error, /Damaged document/);
  // an old backup (data version 1) is accepted and migrated
  const old = await E.parseBackup(JSON.stringify({ format: 'plenty-backup', version: 1, dataVersion: 1, docs: { 'app/settings': { petName: 'Rex' } } }));
  assert.equal(old.ok, true); assert.equal(old.summary.migrated, true);
  deepEq(old.backup.docs['app/settings'].pets, [{ id: 'pet1', name: 'Rex', type: 'dog' }]);
});

test('deleting local data removes documents, images and the profile', async () => {
  const E = loadEngine();
  await freshStore(E);
  const p1 = await E.Store.createProfile('A');
  await E.Store.set('recipes/r1', recipe); await E.Store.set('app/health', { goals: ['heart'] });
  await E.Store.putBlob('img1', { type: 'image/png', size: 1, arrayBuffer: async () => new Uint8Array([1]).buffer }, {});
  const p2 = await E.Store.createProfile('B', { activate: false });
  await E.Store.set('recipes/rB', recipe, p2);
  await E.Store.clearProfile(p1);
  deepEq(await E.Store.allDocs(p1), {}); assert.equal((await E.Store.listBlobs(p1)).length, 0);
  assert.equal((await E.Store.get('recipes/rB', p2)).id, 'r1', 'other profiles are untouched');
  await E.Store.deleteProfile(p1);
  assert.equal(E.Store.registry.profiles.length, 1);
  assert.equal(E.Store.profileId, null, 'deleting the active profile leaves no active profile, so onboarding shows again');
});

test('the offline app serves the weekly plan and grocery list from local documents alone', async () => {
  const E = loadEngine();
  await freshStore(E);
  await E.Store.createProfile('Me');
  await E.Store.set('recipes/r1', recipe);
  await E.Store.set('weeks/2026-09-14', { slots: { 2: { dinner: [{ t: 'r', id: 'r1', sv: 1 }] } }, buy: {}, checked: {}, extras: [], trips: [] });
  E.S.recipes = await E.Store.list('recipes'); E.S.weeks = await E.Store.list('weeks');
  const entries = E.planEntries();
  assert.equal(entries.length, 1); assert.equal(entries[0].day, 2);
  const L = E.buildList();
  assert.ok(L.some(l => l.canon === 'chickpea') && L.some(l => l.canon === 'spinach'));
  assert.equal(E.budgetSummary().actual > 0, true);
});

test('the production build contains no personal information or secrets and works from a subpath', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'pipe' });
  const dist = path.join(ROOT, 'dist');
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  assert.ok(!/simone|dobby|simonevharen/i.test(html), 'no personal names in the bundle');
  assert.ok(!/sk-ant-|sk-[A-Za-z0-9]{20,}|SPOONACULAR_API_KEY\s*=\s*["'][^"']+/.test(html), 'no API secrets in the bundle');
  assert.ok(!/apiKey\s*[:=]\s*["'][A-Za-z0-9]{16,}/.test(html));
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) { const u = m[1]; assert.ok(!u.startsWith('/'), 'absolute path would break a GitHub Pages subpath: ' + u); assert.ok(/^(\.\/|https?:|data:|#)/.test(u) || !u.includes('/'), 'relative or external only: ' + u); }
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(html, /navigator\.serviceWorker\.register\('\.\/sw\.js',\{scope:'\.\/'\}\)/);
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'Plenty'); assert.equal(manifest.display, 'standalone'); assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './');
  assert.equal(manifest.theme_color, '#6A3FA0'); assert.ok(manifest.background_color);
  assert.ok(manifest.icons.length >= 3 && manifest.icons.every(i => !i.src.startsWith('/') && fs.existsSync(path.join(dist, i.src))));
  const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');
  assert.ok(!sw.includes('__VERSION__') && !sw.includes('__PRECACHE__'));
  const pre = JSON.parse(sw.match(/const PRECACHE = (\[[^\]]*\]);/)[1]);
  assert.ok(pre.includes('./index.html') && pre.includes('./manifest.webmanifest'), 'app shell is precached for offline use');
  assert.ok(sw.includes('SKIP_WAITING'), 'updates can be applied without users getting stuck');
  assert.equal(fs.readFileSync(path.join(dist, '404.html'), 'utf8'), html, 'refresh on the subpath falls back to the app');
  assert.ok(fs.existsSync(path.join(dist, '.nojekyll')));
});
