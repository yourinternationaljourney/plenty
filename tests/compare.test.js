// Price comparison engine: normalization, price truth rules, matching, basket options, country filtering.
// Fixtures below exist only in this test process; nothing here is shipped in the build.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEngine } = require('./harness');
const ROOT = path.join(__dirname, '..');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ' expected ' + b + ' got ' + a);
const daysAgoIso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

function nlSetup(E) {
  E.S.settings.currency = '€'; E.S.settings.countryCode = 'NL'; E.S.settings.preferredStores = ['albert-heijn', 'jumbo', 'lidl-nl']; E.S.settings.people = 1;
  E.S.recipes.r1 = { id: 'r1', name: 'Breakfast', mealTypes: ['breakfast'], servings: 1, ingredients: [{ qty: 200, unit: 'g', name: 'Greek yogurt', price: 1.1 }, { qty: 2, unit: 'pcs', name: 'eggs', price: 0.6 }] };
  E.S.recipes.r2 = { id: 'r2', name: 'Frittata', mealTypes: ['dinner'], servings: 2, ingredients: [{ qty: 4, unit: 'pcs', name: 'large eggs', price: 1.2 }, { qty: 200, unit: 'g', name: 'baby spinach', price: 1.5 }] };
  E.addEntry(0, 'breakfast', { t: 'r', id: 'r1', sv: 1 }, true);
  E.addEntry(1, 'dinner', { t: 'r', id: 'r2', sv: 2 }, true);
  E.S.items.milk = { id: 'milk', name: 'Milk', kind: 'grocery', category: 'Dairy & eggs', qty: 1, unit: 'l', price: 1.2, frequency: 'weekly', priority: 'essential' };
  E.S.inventory.h1 = { id: 'h1', name: 'Spinach', qty: 0, unit: '', location: 'Fridge' }; // at home -> excluded
}
// helper: product + store product + observation in the test engine's state (fixture only)
function fixturePrice(E, storeId, name, qty, unit, price, opts) {
  opts = opts || {};
  const prod = E.makeProduct({ id: opts.pid || ('p_' + name.replace(/\W/g, '') + qty), canonicalName: name, packageQuantity: qty, packageUnit: unit, category: opts.category, ean: opts.ean });
  E.S.products[prod.id] = prod;
  const sp = E.makeStoreProduct({ id: 'sp_' + storeId + '_' + prod.id, storeId, productId: prod.id, retailerProductId: opts.rid || '' });
  E.S.storeproducts[sp.id] = sp;
  const ob = E.makeObservation({ id: 'ob_' + sp.id + '_' + (opts.tag || 'x'), storeProductId: sp.id, price, priceType: opts.type || 'regular', observedAt: opts.observedAt || new Date().toISOString(), validFrom: opts.validFrom, validUntil: opts.validUntil, sourceName: opts.source || 'Test source', sourceUrl: 'https://example.test/p', confidence: opts.confidence == null ? 0.95 : opts.confidence, manual: !!opts.manual }, prod);
  E.S.priceobs[ob.id] = ob;
  return { prod, sp, ob };
}

test('price normalization per kg, per litre and per unit', () => {
  const E = loadEngine();
  near(E.unitPriceOf(4.5, 1, 'kg').unitPrice, 0.0045);
  assert.equal(E.fmtUnitPrice(0.0045, 'mass'), '$4.50/kg');
  near(E.unitPriceOf(1.19, 1, 'l').unitPrice, 0.00119);
  assert.equal(E.fmtUnitPrice(0.00119, 'vol'), '$1.19/L');
  near(E.unitPriceOf(3.6, 12, 'pcs').unitPrice, 0.3);
  assert.equal(E.fmtUnitPrice(0.3, 'count:pcs'), '$0.30/unit');
  assert.equal(E.unitPriceOf(2, 0, 'g'), null, 'no package size means no unit price');
  const p = E.makeProduct({ canonicalName: 'Greek yogurt', packageQuantity: 500, packageUnit: 'g' });
  assert.equal(p.normalizedQuantity, 500); assert.equal(p.fam, 'mass'); assert.equal(p.canon, 'greek yogurt');
});

test('expired promotions are excluded and stale observations are never labelled current', () => {
  const E = loadEngine();
  nlSetup(E);
  fixturePrice(E, 'jumbo', 'Greek yogurt', 500, 'g', 2.49, { tag: 'reg', observedAt: daysAgoIso(1) });
  fixturePrice(E, 'jumbo', 'Greek yogurt', 500, 'g', 1.49, { tag: 'expired', type: 'promotion', validFrom: '2026-01-01', validUntil: '2026-01-07', observedAt: daysAgoIso(1) });
  const line = E.buildList().find(l => l.canon === 'greek yogurt');
  const best = E.bestCandidate(line, E.storeById('jumbo'));
  assert.equal(best.price, 2.49, 'the expired promotion is not used');
  assert.equal(best.type, 'regular'); assert.equal(best.label, 'Current online price'); assert.equal(best.current, true);
  // an active promotion wins
  fixturePrice(E, 'jumbo', 'Greek yogurt', 500, 'g', 1.79, { tag: 'active', type: 'promotion', validFrom: E.iso(E.today()), validUntil: E.iso(E.today()), observedAt: daysAgoIso(0) });
  const promo = E.bestCandidate(line, E.storeById('jumbo'));
  assert.equal(promo.price, 1.79); assert.equal(promo.type, 'promotion'); assert.equal(promo.label, 'Promotion');
  // a 30-day-old regular price is an estimate, not current
  fixturePrice(E, 'lidl-nl', 'Greek yogurt', 500, 'g', 1.99, { observedAt: daysAgoIso(30) });
  const stale = E.bestCandidate(line, E.storeById('lidl-nl'));
  assert.equal(stale.type, 'predicted'); assert.equal(stale.label, 'Estimated from price history'); assert.equal(stale.current, false);
  assert.equal(E.observationStatus({ priceType: 'predicted', observedAt: daysAgoIso(0) }).current, false, 'a prediction is never current even when fresh');
  assert.equal(E.PRICE_LABEL.unavailable, 'Price unavailable');
});

test('pantry items are excluded and duplicate ingredients are consolidated before comparison', () => {
  const E = loadEngine();
  nlSetup(E);
  const lines = E.comparableLines();
  assert.ok(!lines.some(l => l.canon === 'spinach'), 'spinach is at home');
  const eggs = lines.filter(l => l.canon === 'egg');
  assert.equal(eggs.length, 1, 'eggs from two recipes are one comparison line');
  assert.equal(eggs[0].qty, 6, '2 + 4 eggs');
  assert.ok(lines.some(l => l.canon === 'milk'), 'regular items participate');
});

test('one-store, two-store and any-store baskets; extra store rejected below the minimum saving; unmatched reported', () => {
  const E = loadEngine();
  nlSetup(E);
  // AH has everything; Jumbo is cheaper on eggs by a little; Lidl much cheaper on yogurt
  fixturePrice(E, 'albert-heijn', 'Greek yogurt', 500, 'g', 2.99);
  fixturePrice(E, 'albert-heijn', 'Eggs', 6, 'pcs', 2.4);
  fixturePrice(E, 'albert-heijn', 'Milk', 1, 'l', 1.29);
  fixturePrice(E, 'jumbo', 'Eggs', 6, 'pcs', 2.2);
  fixturePrice(E, 'lidl-nl', 'Greek yogurt', 500, 'g', 1.29);
  const one = E.compareBaskets({ mode: 'one', minSaving: 3 });
  assert.equal(one.totalLines, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(one.options.easiest.storeIds)), ['albert-heijn']);
  assert.equal(one.options.easiest.matched, 3); assert.equal(one.options.easiest.complete, true);
  near(one.options.easiest.total, 2.99 + 2.4 + 1.29);
  assert.equal(one.options.recommended.storeIds.length, 1, 'mode one never adds a store');
  // two stores: AH + Lidl saves 1.70 on yogurt; with a €3 threshold the extra store is rejected
  const two = E.compareBaskets({ mode: 'two', minSaving: 3 });
  assert.deepEqual(JSON.parse(JSON.stringify(two.options.recommended.storeIds)), ['albert-heijn']);
  assert.match(two.recNote, /save only .*1\.70/);
  // with a €1 threshold the second store is accepted
  const two1 = E.compareBaskets({ mode: 'two', minSaving: 1 });
  assert.equal(two1.options.recommended.storeIds.length, 2);
  assert.ok(two1.options.recommended.storeIds.includes('lidl-nl'));
  near(two1.options.recommended.total, 1.29 + 2.4 + 1.29);
  assert.equal(E.allocationText(two1.options.recommended), '2 items at Albert Heijn and 1 item at Lidl');
  // cheapest across any number of stores uses Jumbo eggs too
  const any = E.compareBaskets({ mode: 'any', minSaving: 0 });
  near(any.options.cheapest.total, 1.29 + 2.2 + 1.29);
  assert.equal(any.options.cheapest.storeIds.length, 3);
  assert.equal(any.options.cheapest.savings, Math.round(((2.99 + 2.4 + 1.29) - (1.29 + 2.2 + 1.29)) * 100) / 100, 'savings versus the most expensive complete option');
  // unmatched reporting: remove Jumbo's egg price and AH entirely -> Lidl alone matches 1 of 3
  const E2 = loadEngine(); nlSetup(E2);
  fixturePrice(E2, 'lidl-nl', 'Greek yogurt', 500, 'g', 1.29);
  const c = E2.compareBaskets({ mode: 'one' });
  assert.equal(c.options.easiest.matched, 1); assert.equal(c.options.easiest.unmatched, 2); assert.equal(c.options.easiest.complete, false);
  assert.equal(E2.coverageText(c.options.easiest, c.totalLines), 'Estimated total for 1 of 3 items — 2 prices unavailable');
});

test('receipt-confirmed history is a separate source: labelled, used when recent, estimated when old', () => {
  const E = loadEngine();
  nlSetup(E);
  E.S.prices.milk = { id: 'milk', fam: 'vol', samples: [{ unitPrice: 0.00119, store: 'Jumbo', date: E.iso(E.today()) }] };
  E.S.prices['greek yogurt'] = { id: 'greek yogurt', fam: 'mass', samples: [{ unitPrice: 0.004, store: 'Lidl', date: '2026-01-05' }] };
  const milk = E.buildList().find(l => l.canon === 'milk');
  const c = E.bestCandidate(milk, E.storeById('jumbo'));
  assert.equal(c.type, 'receipt_confirmed'); assert.equal(c.label, 'Confirmed from your receipt'); assert.equal(c.source, 'Your receipt');
  near(c.cost, 0.00119 * milk.needBase, 'cost scales the receipt unit price to the quantity needed');
  const yog = E.buildList().find(l => l.canon === 'greek yogurt');
  const old = E.bestCandidate(yog, E.storeById('lidl-nl'));
  assert.equal(old.type, 'predicted', 'an old receipt price is only an estimate');
  assert.equal(E.bestCandidate(yog, E.storeById('albert-heijn')), null, 'no data means no price, never a guess');
});

test('matching: barcode beats name; wrong unit family or low confidence is marked for review and kept out of totals', () => {
  const E = loadEngine();
  nlSetup(E);
  const line = E.buildList().find(l => l.canon === 'greek yogurt');
  const ah = E.storeById('albert-heijn');
  const wrongFam = fixturePrice(E, 'albert-heijn', 'Greek yogurt', 1, 'l', 3.5, { pid: 'p_yl' });
  const cands = E.storeCandidates(line, ah);
  assert.equal(cands.length, 0, 'a litre product cannot price a gram line');
  fixturePrice(E, 'albert-heijn', 'Yogurt', 500, 'g', 1.5, { pid: 'p_partial' });
  const partial = E.storeCandidates(line, ah);
  assert.ok(partial.length === 1 && partial[0].matchStatus === 'review', 'partial name match is a review match');
  assert.equal(E.bestCandidate(line, ah), null, 'review matches are excluded from totals');
  const exact = fixturePrice(E, 'albert-heijn', 'Greek yogurt', 500, 'g', 2.29, { pid: 'p_exact' });
  const best = E.bestCandidate(line, ah);
  assert.equal(best.productId, 'p_exact'); assert.ok(best.matchScore >= 0.9);
  const ean = E.matchScore({ ean: '8710000000001', canon: 'zzz', fam: line.fam }, E.makeProduct({ canonicalName: 'Something else', packageQuantity: 1, packageUnit: 'pcs', ean: '8710000000001' }), null);
  assert.equal(ean.score, 1); assert.deepEqual(JSON.parse(JSON.stringify(ean.reasons)), ['barcode']);
  assert.equal(E.matchStatus(0.55), 'review'); assert.equal(E.matchStatus(0.3), 'none'); assert.equal(E.matchStatus(0.9), 'matched');
});

test('country and store filtering: only the selected market\'s stores are offered and searched', () => {
  const E = loadEngine();
  E.S.settings.countryCode = 'NL'; E.S.settings.preferredStores = ['albert-heijn', 'kroger'];
  assert.deepEqual(JSON.parse(JSON.stringify(E.storesForCountry('US').map(s => s.name))), ['Kroger', 'Aldi', 'Walmart']);
  assert.deepEqual(JSON.parse(JSON.stringify(E.storesForCountry('CA').map(s => s.id))), ['no-frills', 'walmart-ca', 'save-on-foods']);
  assert.deepEqual(JSON.parse(JSON.stringify(E.preferredStores().map(s => s.id))), ['albert-heijn'], 'a US store in an NL profile is ignored');
  E.S.settings.countryCode = ''; E.S.settings.country = 'Canada';
  assert.equal(E.countryCode(), 'CA');
  fixturePrice(E, 'walmart-ca', 'Oat milk', 1, 'l', 3.49);
  fixturePrice(E, 'walmart', 'Oat milk', 1, 'l', 2.99, { pid: 'p_us' });
  E.S.settings.preferredStores = ['walmart-ca'];
  const rows = E.searchProducts('oat milk', {});
  assert.equal(rows.length, 2);
  const ca = rows.find(r => r.product.id !== 'p_us');
  assert.ok(ca.prices.every(x => x.store.countryCode === 'CA'), 'US prices are not shown in a Canadian market');
  const us = rows.find(r => r.product.id === 'p_us');
  assert.equal(us.prices.length, 0);
});

test('manual prices are stored as "Entered by you", never as current online prices; provider seams are honest', async () => {
  const E = loadEngine();
  nlSetup(E);
  const r = await E.recordManualPrice({ storeId: 'jumbo', name: 'Greek yogurt', packageQuantity: 500, packageUnit: 'g', category: 'Dairy & eggs', price: 2.15 });
  assert.equal(r.observation.manual, true); assert.equal(r.observation.userConfirmed, true); assert.equal(r.observation.sourceName, 'Entered by you');
  const line = E.buildList().find(l => l.canon === 'greek yogurt');
  const c = E.bestCandidate(line, E.storeById('jumbo'));
  assert.equal(c.type, 'manual'); assert.equal(c.label, 'Entered by you'); assert.ok(c.label !== 'Current online price');
  assert.ok(E.writes.some(w => w[0].startsWith('priceobs/')), 'observations are persisted as documents');
  assert.deepEqual(JSON.parse(JSON.stringify(E.PriceProviderInterface)), ['searchProducts', 'getProduct', 'getPrices', 'getOffers', 'getSourceMetadata']);
  for (const m of E.PriceProviderInterface) { assert.equal(typeof E.LocalProvider[m], 'function'); assert.equal(typeof E.RemoteProvider[m], 'function'); }
  assert.equal(E.LocalProvider.live, true); assert.equal(E.RemoteProvider.live, false);
  assert.ok(E.RETAILER_ADAPTERS.length === 9 && E.RETAILER_ADAPTERS.every(a => a.status === 'planned'));
  await assert.rejects(E.RemoteProvider.getOffers('jumbo'), e => e.code === 'not_configured');
  const meta = await E.LocalProvider.getSourceMetadata(); assert.match(meta.note, /No retailer is contacted/);
});

test('production build: deep links intact, no fixture prices shipped, comparison UI present', () => {
  const html = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
  assert.match(html, /const ALL_TABS=\['home','plan','discover','recipes','groceries','items','athome','health','coach','settings'\]/);
  assert.match(html, /addEventListener\('hashchange'/);
  assert.ok(!/example\.test|fixturePrice|Test source/.test(html), 'test fixtures never ship');
  assert.ok(!/STARTER_PRICES|DEMO_PRICES|samplePrices/.test(html), 'no hard-coded price data');
  assert.match(html, /groceriesSegmentsHtml/); assert.match(html, /How price comparison works/); assert.match(html, /Estimated total for \$\{option\.matched\} of \$\{total\} items/);
  assert.match(html, /Plenty never invents prices/);
});
