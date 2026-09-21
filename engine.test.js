const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./harness');
// values come from a vm context, so compare by structure rather than prototype
const deepEq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);

const breakfast = { id: 'r_eggs', name: 'Eggs on toast', mealTypes: ['breakfast'], servings: 1, minutes: 10, ingredients: [
  { qty: 2, unit: 'pcs', name: 'eggs', category: 'Dairy & eggs', price: 0.6 },
  { qty: 2, unit: 'slice', name: 'wholegrain bread', category: 'Bakery', price: 0.3 },
  { qty: 1, unit: 'pinch', name: 'salt', category: 'Pantry', price: 0.01 }] };
const dinner = { id: 'r_frittata', name: 'Spinach frittata', mealTypes: ['dinner'], servings: 4, minutes: 25, ingredients: [
  { qty: 3, unit: 'pcs', name: 'large eggs', category: 'Dairy & eggs', price: 0.9 },
  { qty: 100, unit: 'g', name: 'baby spinach', category: 'Produce', price: 0.75 },
  { qty: 1, unit: 'pinch', name: 'sea salt', category: 'Pantry', price: 0.01 }] };
const curry = { id: 'r_curry', name: 'Chickpea curry', mealTypes: ['dinner', 'lunch'], servings: 4, minutes: 30, ingredients: [
  { qty: 200, unit: 'g', name: 'fresh spinach', category: 'Produce', price: 1.5 },
  { qty: 2, unit: 'can', name: 'chickpeas (400 g)', category: 'Pantry', price: 1.6 },
  { qty: 1, unit: 'pinch', name: 'salt', category: 'Pantry', price: 0.01 }] };

test('canonical names merge descriptors, plurals and aliases', () => {
  const E = loadEngine();
  assert.equal(E.canon('Baby spinach'), 'spinach');
  assert.equal(E.canon('fresh spinach'), 'spinach');
  assert.equal(E.canon('large eggs'), 'egg');
  assert.equal(E.canon('sea salt'), 'salt');
  assert.equal(E.canon('scallions'), 'spring onion');
  assert.notEqual(E.canon('sweet potato'), E.canon('baby potatoes'));
});

test('serving conversion scales quantities and cost', () => {
  const E = loadEngine();
  const four = E.recipeLines(dinner, 4, 'dinner');
  const one = E.recipeLines(dinner, 1, 'dinner');
  assert.equal(four.find(l => l.name === 'large eggs').qty, 3);
  assert.equal(one.find(l => l.name === 'large eggs').qty, 0.75);
  assert.equal(one.find(l => l.name === 'baby spinach').qty, 25);
  assert.ok(Math.abs(one.reduce((a, l) => a + l.cost, 0) * 4 - four.reduce((a, l) => a + l.cost, 0)) < 1e-9);
  assert.equal(E.recipeCost(dinner), (0.9 + 0.75 + 0.01) / 4);
});

test('adding a recipe lands in the chosen day and meal type', () => {
  const E = loadEngine();
  E.S.recipes[dinner.id] = dinner;
  E.addEntry(4, 'dinner', { t: 'r', id: dinner.id, sv: 1 }, true);
  const entries = E.planEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].day, 4);
  assert.equal(entries[0].meal, 'dinner');
  assert.equal(entries[0].recipe.id, dinner.id);
  assert.equal(entries[0].servings, 1);
  // breakfast/lunch/dinner replace; snacks accumulate
  E.addEntry(4, 'dinner', { t: 'r', id: dinner.id, sv: 2 }, true);
  assert.equal(E.slotEntries(E.week(), 4, 'dinner').length, 1);
  E.addEntry(0, 'snack', { t: 'r', id: dinner.id, sv: 1 }, true);
  E.addEntry(0, 'snack', { t: 'r', id: dinner.id, sv: 1 }, true);
  assert.equal(E.slotEntries(E.week(), 0, 'snack').length, 2);
});

test('grocery list consolidates duplicates across recipes into one line per product', () => {
  const E = loadEngine();
  E.S.recipes[breakfast.id] = breakfast; E.S.recipes[dinner.id] = dinner; E.S.recipes[curry.id] = curry;
  E.addEntry(0, 'breakfast', { t: 'r', id: breakfast.id, sv: 1 }, true);
  E.addEntry(0, 'dinner', { t: 'r', id: dinner.id, sv: 4 }, true);
  E.addEntry(1, 'dinner', { t: 'r', id: curry.id, sv: 4 }, true);
  const L = E.buildList();
  const eggs = L.filter(l => l.canon === 'egg');
  assert.equal(eggs.length, 1, 'eggs are one line');
  assert.equal(eggs[0].qty, 5, '2 + 3 eggs = 5 needed');
  assert.equal(eggs[0].needBase, 5);
  assert.equal(eggs[0].pack, 'buy 1 × 6', 'suggests the nearest practical pack');
  const spinach = L.filter(l => l.canon === 'spinach');
  assert.equal(spinach.length, 1, 'baby spinach + fresh spinach is one line');
  assert.equal(spinach[0].needBase, 300);
  assert.equal(E.fmtBase(spinach[0].needBase, spinach[0].fam), '300 g');
  const salt = L.filter(l => l.canon === 'salt');
  assert.equal(salt.length, 1, 'salt from three recipes is one line');
  assert.equal(salt[0].staple, true);
});

test('pantry and At Home inventory are subtracted or excluded', () => {
  const E = loadEngine();
  E.S.recipes[breakfast.id] = breakfast; E.S.recipes[dinner.id] = dinner;
  E.addEntry(0, 'breakfast', { t: 'r', id: breakfast.id, sv: 1 }, true);
  E.addEntry(0, 'dinner', { t: 'r', id: dinner.id, sv: 4 }, true);
  E.S.inventory.h1 = { id: 'h1', name: 'Salt', qty: 0, unit: '', location: 'Pantry' };
  E.S.inventory.h2 = { id: 'h2', name: 'Eggs', qty: 6, unit: 'pcs', location: 'Fridge' };
  E.S.inventory.h3 = { id: 'h3', name: 'Spinach', qty: 40, unit: 'g', location: 'Fridge' };
  const L = E.buildList();
  const salt = L.find(l => l.canon === 'salt');
  assert.equal(salt.atHome.all, true, 'salt at home is not bought again');
  assert.equal(salt.cost, 0);
  const eggs = L.find(l => l.canon === 'egg');
  assert.equal(eggs.atHome.all, true, '6 eggs at home cover 5 needed');
  const spinach = L.find(l => l.canon === 'spinach');
  assert.equal(spinach.atHome.all, false);
  assert.equal(spinach.needBase, 60, '100 g needed minus 40 g at home');
  assert.ok(Math.abs(spinach.cost - 0.75 * 0.6) < 1e-9, 'cost follows the remaining quantity');
});

test('At Home recipe matching ranks meals by real inventory and missing items', () => {
  const E = loadEngine();
  E.S.recipes[breakfast.id] = breakfast;
  E.S.recipes[dinner.id] = dinner;
  E.S.recipes[curry.id] = curry;
  E.S.inventory.h1 = { id: 'h1', name: 'Eggs', qty: 6, unit: 'pcs', location: 'Fridge' };
  E.S.inventory.h2 = { id: 'h2', name: 'Wholegrain bread', qty: 1, unit: '', location: 'Pantry' };
  E.S.inventory.h3 = { id: 'h3', name: 'Salt', qty: 0, unit: '', location: 'Pantry' };
  const exact = E.atHomeRecipeMatches(Object.values(E.S.recipes), 0);
  assert.equal(exact.length, 1);
  assert.equal(exact[0].recipe.id, breakfast.id);
  assert.equal(exact[0].missing.length, 0);
  const oneMissing = E.atHomeRecipeMatches(Object.values(E.S.recipes), 1);
  assert.deepEqual(Array.from(oneMissing, x => x.recipe.id), [breakfast.id, dinner.id]);
  assert.equal(oneMissing[1].missing[0].canon, 'spinach');
});

test('budget totals recalculate when a recipe is added, and simulateAdd previews the impact', () => {
  const E = loadEngine();
  E.S.recipes[dinner.id] = dinner; E.S.recipes[curry.id] = curry;
  const before = E.budgetSummary();
  assert.equal(before.actual, 0);
  const sim = E.simulateAdd(2, 'dinner', curry, 4, true);
  assert.ok(sim.after.actual > sim.before.actual);
  assert.ok(Math.abs(sim.delta - (1.5 + 1.6 + 0.01)) < 1e-9, 'delta equals the recipe cost when nothing is at home');
  assert.equal(E.planEntries().length, 0, 'simulation does not change the real week');
  E.addEntry(2, 'dinner', { t: 'r', id: curry.id, sv: 4 }, true);
  const after = E.budgetSummary();
  assert.ok(Math.abs(after.actual - sim.after.actual) < 1e-9);
  assert.equal(after.remaining, 70 - 5 - after.actual);
  // over budget: suggestions never include essentials
  E.S.settings.weeklyBudget = 6;
  E.S.items.pet = { id: 'pet', name: 'Dry dog food', kind: 'pet', category: 'Pet', qty: 1, unit: 'bag', price: 28, frequency: 'weekly', priority: 'essential' };
  E.S.items.choc = { id: 'choc', name: 'Dark chocolate', kind: 'grocery', category: 'Snacks & treats', qty: 1, unit: 'pcs', price: 2.5, frequency: 'weekly', priority: 'optional' };
  const tight = E.budgetSummary();
  assert.ok(tight.overBy > 0);
  assert.ok(tight.suggestions.every(s => s.prio !== 'essential'));
  assert.ok(tight.suggestions.some(s => s.line.canon === 'dark chocolate'));
  assert.ok(!tight.suggestions.some(s => s.line.items.some(i => i.kind === 'pet')));
});

test('external recipe normalization (Spoonacular payload) maps units, meal types, source and price', () => {
  const E = loadEngine();
  const r = E.normalizeSpoonacular({ id: 715538, title: 'Bruschetta Style Pork &amp; Pasta', image: 'https://img.example/715538.jpg', readyInMinutes: 35, servings: 4, pricePerServing: 285.4, dishTypes: ['lunch', 'main course'], vegetarian: false, glutenFree: false, sourceName: 'Pink When', sourceUrl: 'https://example.com/recipe', spoonacularSourceUrl: 'https://spoonacular.com/x',
    extendedIngredients: [{ name: 'pork tenderloin', nameClean: 'pork tenderloin', aisle: 'Meat', measures: { metric: { amount: 453.59, unitShort: 'g' } } }, { name: 'olive oil', aisle: 'Oil, Vinegar, Salad Dressing', measures: { metric: { amount: 2, unitShort: 'Tbsps' } } }, { name: 'pasta', aisle: 'Pasta and Rice', measures: { metric: { amount: 8, unitShort: 'oz' } } }],
    analyzedInstructions: [{ steps: [{ number: 1, step: 'Cook the pasta.' }, { number: 2, step: 'Sear the pork.' }] }],
    nutrition: { nutrients: [{ name: 'Calories', amount: 512.3 }, { name: 'Protein', amount: 33.2 }, { name: 'Carbohydrates', amount: 40 }, { name: 'Fat', amount: 20 }] } });
  assert.equal(r.id, 'x_spoon_715538');
  assert.equal(r.name, 'Bruschetta Style Pork & Pasta');
  deepEq(r.mealTypes, ['lunch', 'dinner']);
  assert.equal(r.source.type, 'external');
  assert.equal(r.source.url, 'https://example.com/recipe');
  assert.equal(r.costPerServing, 2.85);
  assert.equal(r.ingredients[0].unit, 'g'); assert.equal(r.ingredients[0].category, 'Meat & seafood');
  assert.equal(r.ingredients[1].unit, 'tbsp');
  assert.equal(r.ingredients[2].unit, 'g'); assert.equal(r.ingredients[2].qty, 226.8, 'ounces converted to grams');
  assert.equal(r.steps.length, 2);
  assert.equal(r.nutrition.kcal, 512);
  // it flows through the same grocery engine
  E.S.recipes[r.id] = r;
  E.addEntry(3, 'dinner', { t: 'r', id: r.id, sv: 1 }, true);
  const L = E.buildList();
  assert.ok(Math.abs(L.find(l => l.canon === 'pork tenderloin').needBase - 453.59 / 4) < 1e-9, 'one serving of a four-serving recipe');
  assert.ok(E.budgetSummary().actual > 0, 'legacy cost per serving is used when ingredient prices are unknown');
});

test('URL import: Schema.org JSON-LD parses, and failed imports report what is missing', () => {
  const E = loadEngine();
  const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Lemon Chicken","image":["https://x/1.jpg"],"recipeYield":"2 servings","prepTime":"PT10M","cookTime":"PT20M","recipeCategory":"Dinner","recipeCuisine":"Greek","recipeIngredient":["2 chicken breasts","1/2 cup rice","1 tbsp olive oil","Salt to taste"],"recipeInstructions":[{"@type":"HowToStep","text":"Cook the rice."},{"@type":"HowToStep","text":"Sear the chicken."}],"nutrition":{"@type":"NutritionInformation","calories":"520 calories","proteinContent":"42 g"},"author":{"@type":"Person","name":"Jo"}}]}</script></head></html>`;
  const nodes = E.extractJsonLd(html);
  assert.equal(nodes.length, 1);
  const { recipe, missing } = E.parseJsonLdRecipe(nodes[0], { name: 'example.com', url: 'https://example.com/lemon' });
  deepEq(missing, []);
  assert.equal(recipe.name, 'Lemon Chicken');
  assert.equal(recipe.servings, 2); assert.equal(recipe.prepMinutes, 10); assert.equal(recipe.cookMinutes, 20); assert.equal(recipe.minutes, 30);
  deepEq(recipe.mealTypes, ['dinner']);
  assert.equal(recipe.ingredients[0].qty, 2); assert.equal(recipe.ingredients[0].name, 'chicken breasts');
  assert.equal(recipe.ingredients[1].qty, 0.5); assert.equal(recipe.ingredients[1].unit, 'cup'); assert.equal(recipe.ingredients[1].name, 'rice');
  assert.equal(recipe.ingredients[3].qty, 0); assert.equal(recipe.ingredients[3].name, 'Salt');
  assert.equal(recipe.nutrition.kcal, 520);
  assert.equal(recipe.source.type, 'import'); assert.equal(recipe.source.url, 'https://example.com/lemon'); assert.equal(recipe.source.author, 'Jo');
  // failure paths
  deepEq(E.extractJsonLd('<html><body>no data</body></html>'), []);
  const bad = E.parseJsonLdRecipe({ '@type': 'Recipe', name: 'Mystery' }, {});
  assert.equal(bad.recipe, null);
  assert.ok(bad.missing.includes('ingredients'));
  const noInstr = E.parseJsonLdRecipe({ '@type': 'Recipe', name: 'X', recipeIngredient: ['1 egg'] }, {});
  assert.ok(noInstr.recipe, 'a recipe with a name and ingredients is importable');
  assert.ok(noInstr.missing.includes('instructions'), 'but the missing instructions are reported, never hidden');
});

test('missing recipe images fall back to a generated tile', () => {
  const E = loadEngine();
  const r = E.normalizeSpoonacular({ id: 1, title: 'No photo', servings: 2, extendedIngredients: [{ name: 'spinach', measures: { metric: { amount: 100, unitShort: 'g' } } }] });
  assert.equal(r.image, null);
  const svg = E.tileSvg(r);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('#5E8F5A') || svg.includes('#A9C9A0'), 'palette follows the ingredients');
  assert.ok(E.tileDataUrl(r).startsWith('data:image/svg+xml'));
});

test('API unavailability: the app falls back to the seed provider and surfaces a typed error', async () => {
  const E = loadEngine({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
  assert.equal(E.activeProvider().id, 'seed', 'no service URL means seed provider');
  E.S.settings.apiBase = 'http://localhost:8787';
  assert.equal(E.activeProvider().id, 'http');
  await assert.rejects(E.HttpProvider.search({ q: 'soup' }), e => e.code === 'network');
  const E2 = loadEngine({ fetch: async () => ({ ok: false, status: 429, json: async () => ({ error: 'quota' }) }) });
  E2.S.settings.apiBase = 'http://localhost:8787';
  await assert.rejects(E2.HttpProvider.featured(), e => e.code === 'quota');
  // seed provider always answers
  E2.S.recipes[dinner.id] = dinner;
  const seed = await E2.SeedProvider.search({});
  assert.equal(seed.results.length, 1);
  const imp = await E2.SeedProvider.importUrl('https://x');
  assert.ok(imp.error && imp.offline);
});

test('allergy settings are always enforced in browsing and ranking', () => {
  const E = loadEngine();
  const safe = { id: 'r_safe', name: 'Rice bowl', mealTypes: ['dinner'], servings: 2, minutes: 15, ingredients: [{ qty: 150, unit: 'g', name: 'rice', price: 0.4 }] };
  E.S.recipes[breakfast.id] = breakfast; E.S.recipes[dinner.id] = dinner; E.S.recipes.r_safe = safe;
  E.S.settings.allergies = ['eggs'];
  const all = Object.values(E.S.recipes);
  const { results, hiddenByAllergy } = E.filterRecipes(all, {});
  assert.equal(hiddenByAllergy, 2);
  deepEq(results.map(r => r.id), ['r_safe']);
  assert.ok(E.violatesAllergies(dinner).includes('eggs'));
  deepEq(E.violatesAllergies(safe), []);
  const cols = E.discoverCollections(all);
  assert.ok(cols.every(c => c.recipes.every(r => r.id === 'r_safe')), 'no collection leaks an allergen recipe');
  // a search for "eggs" still cannot bypass the setting
  assert.equal(E.filterRecipes(all, { q: 'eggs' }).results.length, 0);
});

test('receipt lines match planned items and update price memory without letting one outlier distort estimates', () => {
  const E = loadEngine();
  E.S.recipes[breakfast.id] = breakfast;
  E.addEntry(0, 'breakfast', { t: 'r', id: breakfast.id, sv: 1 }, true);
  E.S.items.milk = { id: 'milk', name: 'Milk', kind: 'grocery', category: 'Dairy & eggs', qty: 2, unit: 'l', price: 2.2, frequency: 'weekly', priority: 'essential' };
  const list = E.buildList();
  const parsed = E.parseReceiptResult({ store: 'Aldi', date: '2026-09-19', total: 9.5, lines: [{ text: 'EGGS LRG 6PK', price: 2.1 }, { text: 'MLK 2L', price: 2.0 }, { text: 'CHOC BAR', price: 1.5 }, { text: 'MILK', price: 2.0 }] });
  assert.equal(parsed.ok, true);
  const m = E.matchReceiptLines(parsed.lines, list);
  const byName = Object.fromEntries(m.rows.map(r => [r.text, r]));
  assert.equal(byName['EGGS LRG 6PK'].status, 'planned');
  assert.equal(byName['MLK 2L'].status, 'planned');
  assert.equal(byName['MILK'].status, 'duplicate');
  assert.equal(byName['CHOC BAR'].status, 'unplanned');
  assert.ok(m.notPurchased.some(n => n.name.toLowerCase().includes('bread')));
  const trip = { store: 'Aldi', date: '2026-09-19', lines: m.rows };
  assert.ok(E.applyReceiptToPrices(trip) >= 2);
  const milk = E.priceMemoryFor('milk', 'vol');
  assert.ok(milk && Math.abs(milk.unitPrice - 2.0 / 2000) < 1e-9);
  // an absurd one-off price does not move the robust estimate
  for (let i = 0; i < 2; i++) E.recordPrice('milk', 'vol', 2.1 / 2000, 'Aldi', '2026-09-1' + i);
  E.recordPrice('milk', 'vol', 0.2 / 2000, 'Aldi', '2026-09-20');
  const after = E.priceMemoryFor('milk', 'vol');
  assert.ok(after.unitPrice >= 2.0 / 2000 && after.unitPrice <= 2.1 / 2000);
  // and the estimate is used by the grocery engine
  const L2 = E.buildList();
  assert.equal(L2.find(l => l.canon === 'milk').priced, 'Aldi');
});
