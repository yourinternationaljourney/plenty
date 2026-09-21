const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./harness');

const R = {
  oats: { id: 'r_oats', name: 'Overnight oats', mealTypes: ['breakfast'], servings: 1, minutes: 5, ingredients: [{ qty: 50, unit: 'g', name: 'rolled oats' }, { qty: 100, unit: 'g', name: 'Greek yogurt' }, { qty: 80, unit: 'g', name: 'frozen mixed berries' }] },
  curry: { id: 'r_curry', name: 'Chickpea curry', mealTypes: ['dinner'], servings: 4, minutes: 30, ingredients: [{ qty: 400, unit: 'g', name: 'chickpeas' }, { qty: 200, unit: 'g', name: 'spinach' }, { qty: 1, unit: 'pcs', name: 'onion' }, { qty: 250, unit: 'g', name: 'brown rice' }] },
  salmon: { id: 'r_salmon', name: 'Salmon traybake', mealTypes: ['dinner'], servings: 2, minutes: 35, ingredients: [{ qty: 2, unit: 'pcs', name: 'salmon fillets' }, { qty: 1, unit: 'pcs', name: 'broccoli' }, { qty: 2, unit: 'tbsp', name: 'olive oil' }] },
  beef: { id: 'r_beef', name: 'Beef stir-fry', mealTypes: ['dinner'], servings: 2, minutes: 20, ingredients: [{ qty: 300, unit: 'g', name: 'beef strips' }, { qty: 1, unit: 'pcs', name: 'red pepper' }] },
  bacon: { id: 'r_bacon', name: 'Bacon sandwich', mealTypes: ['lunch'], servings: 1, minutes: 10, ingredients: [{ qty: 3, unit: 'slice', name: 'bacon' }, { qty: 2, unit: 'slice', name: 'white bread' }] },
  chicken: { id: 'r_chicken', name: 'Chicken wrap', mealTypes: ['lunch'], servings: 1, minutes: 15, ingredients: [{ qty: 150, unit: 'g', name: 'chicken breast' }, { qty: 1, unit: 'pcs', name: 'tortilla wrap' }, { qty: 60, unit: 'g', name: 'lettuce' }] },
};
function setup(E) { for (const r of Object.values(R)) E.S.recipes[r.id] = r; }
const week = (E, k) => { E.S.weeks[k] = E.S.weeks[k] || { slots: {}, buy: {}, checked: {}, extras: [], trips: [] }; return E.S.weeks[k]; };

test("Dobby's products are excluded from the user's nutrition analysis", () => {
  const E = loadEngine();
  E.S.items.dog = { id: 'dog', name: 'Dry dog food with chicken and rice', kind: 'pet', category: 'Pet', qty: 1, unit: 'bag', price: 28, frequency: 'weekly', priority: 'essential' };
  E.S.items.treats = { id: 'treats', name: 'Dog biscuits', kind: 'pet', category: 'Pet', qty: 1, unit: 'bag', price: 3, frequency: 'weekly', priority: 'preferred' };
  const wk = E.week();
  wk.trips.push({ id: 't1', date: '2026-09-15', amount: 31, lines: [{ name: 'Dry dog food chicken', price: 28, status: 'planned', pet: true, category: 'Pet' }, { name: 'Dog chocolate drops', price: 3, status: 'unplanned', purpose: 'pet', category: 'Pet' }] });
  const buy = E.purchaseFoodProfile(wk);
  assert.equal(buy.planned.total, 0, 'pet items on the list are not analysed');
  assert.equal(buy.bought.total, 0, 'pet receipt lines are not analysed');
  const hc = E.healthCheck(wk);
  assert.equal(hc.indicators.find(i => i.key === 'protein').status, 'unknown');
  assert.equal(hc.indicators.find(i => i.key === 'sweets').status, 'unknown');
});

test('stock-up, guest, occasion and not-consumed lines are not treated as this week\'s consumption', () => {
  const E = loadEngine();
  const wk = E.week();
  wk.trips.push({ id: 't1', date: '2026-09-15', amount: 40, lines: [
    { name: 'Chocolate bars 24 pack', price: 18, status: 'unplanned', purpose: 'stockup', category: 'Snacks & treats' },
    { name: 'Birthday cake', price: 12, status: 'unplanned', purpose: 'occasion', category: 'Bakery' },
    { name: 'Crisps party bag', price: 4, status: 'unplanned', purpose: 'guests', category: 'Snacks & treats' },
    { name: 'Cookies', price: 2, status: 'unplanned', purpose: 'notme', category: 'Snacks & treats' },
    { name: 'Dark chocolate', price: 2.5, status: 'planned', category: 'Snacks & treats' }] });
  const buy = E.purchaseFoodProfile(wk);
  assert.equal(buy.bought.sweets, 1, 'only the for-this-week sweet counts');
  assert.equal(E.receiptLinesForWeek(wk, { includeStockup: true }).length, 4, 'stock-up, guests and occasion lines are kept for trend context but flagged');
});

test('planned, purchased and reported are kept apart', () => {
  const E = loadEngine();
  setup(E);
  E.addEntry(0, 'dinner', { t: 'r', id: 'r_curry', sv: 2 }, true);
  const wk = E.week();
  wk.trips.push({ id: 't1', date: '2026-09-15', amount: 5, lines: [{ name: 'Bananas', price: 1.5, status: 'unplanned', category: 'Produce' }] });
  const plan = E.planFoodProfile(wk);
  const buy = E.purchaseFoodProfile(wk);
  assert.equal(plan.fruitPortions, 0, 'no fruit is planned');
  assert.equal(buy.bought.fruit, 1, 'but fruit was purchased');
  const hc = E.healthCheck(wk);
  const veg = hc.indicators.find(i => i.key === 'veg');
  assert.match(veg.text, /Based on the recipes currently planned/);
  assert.match(veg.basis, /purchases/);
  const sweets = hc.indicators.find(i => i.key === 'sweets');
  assert.ok(!/ate all/.test(sweets.text));
  // reported is separate storage, never inferred from receipts
  E.saveCheckin('2026-09-15', { veg: true, followed: false });
  assert.equal(E.checkins().days['2026-09-15'].veg, true);
  assert.equal(hc.plan.fruitPortions, 0);
});

test('meat frequency and protein variety are counted per planned meal', () => {
  const E = loadEngine();
  setup(E);
  E.addEntry(0, 'dinner', { t: 'r', id: 'r_beef', sv: 1 }, true);
  E.addEntry(1, 'dinner', { t: 'r', id: 'r_salmon', sv: 1 }, true);
  E.addEntry(2, 'lunch', { t: 'r', id: 'r_bacon', sv: 1 }, true);
  E.addEntry(3, 'lunch', { t: 'r', id: 'r_chicken', sv: 1 }, true);
  E.addEntry(4, 'dinner', { t: 'r', id: 'r_curry', sv: 1 }, true);
  E.addEntry(5, 'lunch', { t: 'l', of: 'r_curry' }, true);
  const plan = E.planFoodProfile();
  assert.equal(plan.meals, 6);
  assert.equal(plan.meatMeals, 3, 'beef, bacon and chicken count as meat; salmon and chickpeas do not');
  assert.equal(plan.redMeatMeals, 1);
  assert.equal(plan.processedMeatMeals, 1);
  assert.equal(plan.fishMeals, 1);
  assert.equal(plan.plantProteinMeals, 2, 'curry plus its leftovers');
  assert.ok(plan.proteinTypeCount >= 4);
  const hc = E.healthCheck();
  assert.equal(hc.indicators.find(i => i.key === 'protein').status, 'balanced');
  // mostly meat -> suggestion to vary, phrased supportively
  const E2 = loadEngine(); setup(E2);
  E2.addEntry(0, 'dinner', { t: 'r', id: 'r_beef', sv: 1 }, true); E2.addEntry(1, 'lunch', { t: 'r', id: 'r_bacon', sv: 1 }, true); E2.addEntry(2, 'lunch', { t: 'r', id: 'r_chicken', sv: 1 }, true);
  const p2 = E2.healthCheck().indicators.find(i => i.key === 'protein');
  assert.equal(p2.status, 'more');
  assert.match(p2.text, /lentils, chickpeas or tofu/);
  assert.ok(!/bad|cheat|failed/i.test(p2.text));
});

test('fruit and vegetable variety across days', () => {
  const E = loadEngine();
  setup(E);
  E.addEntry(0, 'dinner', { t: 'r', id: 'r_curry', sv: 1 }, true);
  E.addEntry(1, 'dinner', { t: 'r', id: 'r_salmon', sv: 1 }, true);
  E.addEntry(2, 'dinner', { t: 'r', id: 'r_beef', sv: 1 }, true);
  E.addEntry(3, 'lunch', { t: 'r', id: 'r_chicken', sv: 1 }, true);
  const plan = E.planFoodProfile();
  assert.equal(plan.vegMeals, 4);
  assert.equal(plan.daysWithVeg, 4);
  assert.ok(plan.vegVariety.includes('spinach') && plan.vegVariety.includes('broccoli') && plan.vegVariety.includes('red pepper') && plan.vegVariety.includes('lettuce'));
  assert.equal(plan.fruitPortions, 0);
  const hc = E.healthCheck();
  const veg = hc.indicators.find(i => i.key === 'veg');
  assert.equal(veg.status, 'more', 'vegetables fine, fruit missing');
  assert.match(veg.text, /bananas or berries/);
  E.addEntry(0, 'breakfast', { t: 'r', id: 'r_oats', sv: 1 }, true);
  E.addEntry(1, 'breakfast', { t: 'r', id: 'r_oats', sv: 1 }, true);
  E.addEntry(2, 'breakfast', { t: 'r', id: 'r_oats', sv: 1 }, true);
  assert.equal(E.healthCheck().indicators.find(i => i.key === 'veg').status, 'balanced');
});

test('fiber sources are recognised from recipes and the list', () => {
  const E = loadEngine();
  setup(E);
  E.addEntry(0, 'breakfast', { t: 'r', id: 'r_oats', sv: 1 }, true);
  E.addEntry(0, 'dinner', { t: 'r', id: 'r_curry', sv: 1 }, true);
  const plan = E.planFoodProfile();
  assert.ok(plan.fiber.includes('oat'));
  assert.ok(plan.fiber.includes('chickpea'));
  assert.ok(plan.fiber.includes('brown rice'));
  E.S.items.bread = { id: 'bread', name: 'Wholegrain bread', kind: 'grocery', category: 'Bakery', qty: 1, unit: 'loaf', price: 2.5, frequency: 'weekly', priority: 'essential' };
  const hc = E.healthCheck();
  const fib = hc.indicators.find(i => i.key === 'fiber');
  assert.equal(fib.status, 'balanced');
  assert.match(fib.text, /good fiber base/);
  assert.ok(E.classifyFood('white bread').has('gluten') === false && !E.classifyFood('white bread').has('wholegrain'), 'white bread is not a whole grain');
});

test('sweet-snack trends need four weeks of receipts and ignore stock-ups', () => {
  const E = loadEngine();
  const mon = '2026-09-14';
  const addWeek = (offset, sweets, fruit) => { const k = E.iso(E.addDays(E.parseISO(mon), -7 * offset)); const w = week(E, k); const lines = []; for (let i = 0; i < sweets; i++) lines.push({ name: 'Chocolate bar ' + i, price: 2, status: 'unplanned', category: 'Snacks & treats' }); if (fruit) lines.push({ name: 'Bananas', price: 1.5, status: 'planned', category: 'Produce' }); w.trips.push({ id: 't' + offset, date: k, amount: 10, lines }); };
  addWeek(1, 5, true); addWeek(2, 5, true); addWeek(3, 2, false);
  assert.equal(E.receiptTrends(mon).enough, false, 'three weeks is not enough');
  addWeek(4, 2, true);
  const tr = E.receiptTrends(mon);
  assert.equal(tr.enough, true);
  assert.equal(tr.fruitWeeks, 3);
  assert.ok(tr.lines.some(l => /rose from about 2 to 5/.test(l)), tr.lines.join(' | '));
  // a huge stock-up does not count toward the sweet average
  const k5 = E.iso(E.addDays(E.parseISO(mon), -35)); const w5 = week(E, k5); const stock = []; for (let i = 0; i < 20; i++) stock.push({ name: 'Chocolate bars ' + i, price: 1, status: 'unplanned', purpose: 'stockup', category: 'Snacks & treats' }); w5.trips.push({ id: 't5', date: k5, amount: 20, lines: stock });
  const tr2 = E.receiptTrends(mon);
  assert.ok(tr2.sweetAvg < 4, 'stock-up week does not inflate the average: ' + tr2.sweetAvg);
  // current week compared to the baseline
  const cur = E.week(); cur.trips.push({ id: 'tc', date: mon, amount: 12, lines: [1, 2, 3, 4, 5, 6].map(i => ({ name: 'Cookies ' + i, price: 2, status: 'unplanned', category: 'Snacks & treats' })) });
  const sw = E.healthCheck().indicators.find(i => i.key === 'sweets');
  assert.equal(sw.status, 'higher');
  assert.match(sw.text, /Your purchases suggest 6/);
  assert.match(sw.text, /cannot know from the receipt/);
});

test('insufficient data produces "Not enough information yet", never a score', () => {
  const E = loadEngine();
  const hc = E.healthCheck();
  assert.ok(hc.indicators.every(i => i.status === 'unknown'));
  assert.match(hc.summary, /Not enough information yet/);
  assert.equal(hc.action, '');
  assert.ok(!('score' in hc));
  assert.equal(E.receiptTrends().enough, false);
  assert.deepEqual(JSON.parse(JSON.stringify(E.listHealthNotes([]))), []);
});

test('sweet swaps are user-controlled: keep does nothing, dismiss is remembered, swap postpones and adds', () => {
  const E = loadEngine();
  E.S.items.choc = { id: 'choc', name: 'Dark chocolate', kind: 'grocery', category: 'Snacks & treats', qty: 1, unit: 'pcs', price: 2.5, frequency: 'weekly', priority: 'optional' };
  E.S.items.cookies = { id: 'cookies', name: 'Cookies', kind: 'grocery', category: 'Snacks & treats', qty: 1, unit: 'pack', price: 2, frequency: 'weekly', priority: 'preferred' };
  let sug = E.sweetSwapSuggestions();
  assert.equal(sug.length, 2);
  const wk = E.week();
  E.applySweetSwap(sug[0].line, 'keep', sug[0].alternatives[0], wk);
  assert.equal(E.buildList().filter(l => !(l.atHome && l.atHome.all)).length, 2, 'keep changes nothing');
  const target = sug.find(s => s.line.canon === 'cooky' || /cookie/i.test(s.line.name));
  E.applySweetSwap(target.line, 'swap', target.alternatives[0], wk);
  assert.equal(wk.buy.cookies, false, 'swap postpones the original for this week');
  assert.ok(wk.extras.some(x => x.name === target.alternatives[0].name), 'and adds the alternative');
  const other = sug.find(s => s !== target);
  E.applySweetSwap(other.line, 'dismiss', null, wk);
  assert.equal(E.sweetSwapSuggestions().some(s => s.line.canon === other.line.canon), false, 'dismissed items are not suggested again');
  assert.ok(E.buildList().some(l => l.canon === other.line.canon), 'but the product itself stays on the list');
});

test('health profile can be saved and deleted, and allergies are untouched by deletion', () => {
  const E = loadEngine();
  E.S.settings.allergies = ['peanuts'];
  E.saveHealthProfile({ sex: 'Female', heightCm: 168, weightKg: 52, goals: ['maintain', 'balanced'], considerations: ['cholesterol'], preferences: 'not too much meat' });
  assert.equal(E.hasHealthProfile(), true);
  assert.equal(E.cholesterolConscious(), true);
  assert.equal(E.wantsWeightLoss(), false);
  const w = E.writes.find(w => w[0] === 'app/health');
  assert.equal(w[1].weightKg, 52);
  E.deleteHealthProfile();
  assert.equal(E.hasHealthProfile(), false);
  assert.equal(E.healthProfile().weightKg, null);
  assert.deepEqual(JSON.parse(JSON.stringify(E.S.settings.allergies)), ['peanuts']);
  const ctx = E.healthCoachContext();
  assert.ok(!/168|52/.test(ctx), 'height and weight are never sent to the coach');
});

test('no weight-loss or dieting language unless the user chose that goal', () => {
  const E = loadEngine();
  setup(E);
  E.saveHealthProfile({ sex: 'Female', heightCm: 168, weightKg: 52, goals: ['maintain'], considerations: ['cholesterol'], preferences: 'not too much meat' });
  E.addEntry(0, 'dinner', { t: 'r', id: 'r_beef', sv: 1 }, true); E.addEntry(1, 'lunch', { t: 'r', id: 'r_bacon', sv: 1 }, true); E.addEntry(2, 'lunch', { t: 'r', id: 'r_chicken', sv: 1 }, true);
  E.S.items.choc = { id: 'choc', name: 'Chocolate', kind: 'grocery', category: 'Snacks & treats', qty: 5, unit: 'pcs', price: 10, frequency: 'weekly', priority: 'optional' };
  const hc = E.healthCheck();
  const text = JSON.stringify(hc) + E.healthCoachContext() + E.HEALTH_COACH_RULES();
  assert.ok(!/lose weight|weight loss|calorie/i.test(JSON.stringify(hc)), 'the check never talks about weight loss or calories');
  assert.match(E.healthCoachContext(), /NOT chosen weight loss/);
  assert.ok(!/bad food|cheat|failed week/i.test(text));
  assert.match(hc.indicators.find(i => i.key === 'heart').text, /not medical advice/);
  assert.match(hc.indicators.find(i => i.key === 'heart').text, /cholesterol-conscious preference/);
});
