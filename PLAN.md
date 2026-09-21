# Plenty — product and implementation plan

Plenty is a complete weekly grocery, food, household-consumption and budget planner for one person (scales to a household), with a separate pet category for Dobby and an AI coach that reasons about the whole grocery week. It is an original product: no Mealime branding, copy, interface, recipes or assets are used.

Status: v1.2. Single-file web app (`plenty.html`, built by `npm run build` from the parts in `src/`) published as a private Claude artifact at https://claude.ai/artifact/KVbMBZMe1o9arxCE3zYFea with the `db` (persistent store) and `sample` (Claude) capabilities. Starter data was seeded into the store from `seed/`. Tests: `npm test`. Optional recipe service for live internet recipes and URL import: `npm run server` with `.env` (see `.env.example`). Section 10 describes the v1.1 additions (Discover, import, receipts); section 11 the v1.2 Weekly Health Check.

## 1. Primary goals

The app helps one person:

1. Select healthy meals for the week (breakfast, lunch, dinner, snacks, drinks, treats).
2. Stay within one complete weekly grocery budget, not a dinner-only estimate.
3. Reuse ingredients across recipes and see where reuse happens.
4. Avoid buying what is already at home (pantry, fridge, freezer, drinks, pet, household).
5. Generate one correctly consolidated grocery list with no duplicate entries.
6. Discuss the plan with an AI coach and request changes in natural language. The coach proposes; deterministic app logic applies and totals.

## 2. Product principles

- The budget always covers the whole trolley: recipes, breakfast and lunch staples, fruit, snacks, drinks, coffee and tea, pantry restocking, Dobby, household and personal care, manual extras, and a buffer.
- One grocery line per real product. "Baby spinach" and "fresh spinach" merge into "Spinach"; 100 g + 200 g becomes 300 g; salt in four recipes is one "Salt" line.
- Anything at home is excluded (or reduced by the quantity on hand) and shown under "Already at home".
- Every purchase has a priority: essential, preferred, optional. Savings suggestions remove optional items first, then preferred, never essentials and never Dobby's essential food.
- Long-lasting products (a 4-week bag of dog food) show both the actual checkout cost in the week they are bought and a normalized weekly cost for trend analysis.
- Recurring food is normal: the same breakfast Monday to Thursday, leftovers for lunch, one box of tea for the week.
- Dobby's data (food, supply, cost) is never mixed with the user's nutrition, preferences or meal recommendations.

## 3. Architecture

Single HTML file, vanilla JS, no framework. Views render from an in-memory state object; every change writes one document to the artifact database (`claude.use("db")`) and falls back to `localStorage` when the store is unavailable. Claude is reached through `claude.use("sample")`; every AI feature degrades to hidden when Claude is not available.

```
state ──render──▶ views (Home, Plan, Recipes, Groceries, Items, At Home, Coach, Settings)
  ▲                          │ user actions
  │ onSnapshot               ▼
artifact db  ◀── writeDoc queue (one write in flight per document)
```

Deterministic engine (pure functions over state):

- `canon(name)` — canonical ingredient name (descriptor stripping, aliases, singularization).
- `buildList(week)` — consolidated grocery lines from recipe slots, recurring items, extras; inventory applied; pack suggestions.
- `budgetSummary(week)` — actual and normalized totals by group, buffer, remaining, money available for meals, over-budget amount, savings suggestions.
- `itemDue(item, week)` — whether a recurring or long-lasting item must be bought this week.
- `petStatus(item)` — remaining supply, run-out date, weeks per package, normalized weekly cost.
- `applyActions(actions)` — validates and applies coach proposals; blocks anything that removes essential pet supplies or essential food.

## 4. Data model (artifact db documents)

| Document | Purpose |
|---|---|
| `app/settings` | people, currency, weeklyBudget, buffer, groupBudgets (suggested per group), shopDay, store, petName, planTargets per meal type, kcal/protein targets, diet notes |
| `recipes/<id>` | name, mealTypes[], tags[], minutes, servings, ingredients[{qty, unit, name, category, price}], steps[], nutrition per serving, notes, favorite |
| `items/<id>` | recurring and non-recipe groceries and pet supplies: name, kind (grocery, pet, household), category, group, qty, unit, price, frequency (weekly, biweekly, monthly, asneeded), brand, store, priority, inStock, lastBought; long-lasting products add packageSize, packageUnit, packagePrice, usePerDay, remaining, remainingAsOf |
| `inventory/<id>` | At Home: name, location (Pantry, Fridge, Freezer, Drinks, Pet, Household), qty, unit, note |
| `weeks/<monday>` | slots[day][meal] = entries ({t:"r", id, sv} recipe, {t:"l", of} leftovers, {t:"i", id} item portion), buy overrides per item, checked, extras[], trips[] (actual checkout amounts), notes |
| `chat/<monday>` | coach conversation for the week: turns with reply text, proposed actions and applied state |

Ids are client-generated. All writes are last-writer-wins.

## 5. Screens

1. **Home** — weekly budget, estimated checkout, normalized weekly cost, remaining, buffer; group breakdown; food plan overview; essentials due; Dobby supply status; at-home items used; ingredients reused; leftovers planned; items to postpone when over budget; next shopping date; this week's shops and an eight-week actual-vs-estimate chart.
2. **Plan** — seven day cards with a row per active meal type. Add recipes, item portions (fruit, snacks) or leftovers; repeat across days; servings per cooking; nutrition per day from planned recipe meals.
3. **Recipes** — recipe box with meal-type and tag filters, per-serving cost derived from ingredient prices; new, edit, import from pasted text (Claude), generate (Claude), estimate nutrition, price and categories (Claude).
4. **Groceries** — the one consolidated list, grouped by store category, with quantities, pack hints, sources, price, priority, "have it" (moves to At Home), postponed items, already-at-home section, copy list, log this shop.
5. **Items** — recurring groceries and Dobby's supplies with frequency, priority, stock, store, brand, and for long-lasting products the remaining supply, run-out date and normalized weekly cost.
6. **At Home** — inventory by location with quantities; quick add, use up, edit.
7. **Coach** — chat with Claude about the whole week. Each reply can carry proposed changes; the user reviews and applies them; the engine recalculates totals. Quick prompts for the common requests.
8. **Settings** — budget, buffer, suggested group amounts, household size, currency, shop day, preferred store, pet name, which meal types to plan and how many, targets, food preferences, starter data, data reset.

Mobile: bottom bar with Home, Plan, Groceries, Coach and More; desktop: left rail with all sections.

## 6. Calculations

- Recipe line quantity = ingredient qty × (servings cooked ÷ recipe servings). Same-family units merge (g/kg, ml/l/cup, tsp/tbsp); counts merge only with the same unit word.
- Recipe line cost = ingredient price × scale. If a recipe has no ingredient prices, its legacy cost per serving is spread evenly across its ingredients.
- Item actual cost this week = price (or package price for long-lasting products) when due; normalized = price × frequency factor (weekly 1, biweekly ½, monthly ¼) or packagePrice ÷ weeks per package.
- Inventory: a line whose canonical name matches an inventory entry is reduced by the quantity on hand (same unit family) or excluded entirely when the entry has no quantity. Cost follows the remaining quantity.
- Budget: remaining = weekly budget − buffer − estimated checkout. Available for meals = weekly budget − buffer − normalized cost of non-meal groups. Over budget triggers savings suggestions ordered optional → preferred, never essential, never pet essentials.
- Dobby: remaining now = remaining − usePerDay × days since recorded; run-out = today + remaining ÷ usePerDay; due this week when run-out falls before the week ends; weeks per package = packageSize ÷ usePerDay ÷ 7.

## 7. Seed data

Loaded with "Load starter data" (Settings or empty states) and seeded into the store after publish:

- 16 recipes across breakfast, lunch, dinner and snack, priced per ingredient.
- Recurring items: bananas, apples, Greek yogurt, milk, bread, eggs, tea, coffee, sparkling water, protein bars, dark chocolate, oats, peanut butter, paper towels, laundry detergent, toothpaste.
- Dobby: dry food (long-lasting bag), wet food, training treats, dental chews, waste bags, joint supplement.
- At Home: salt, black pepper, olive oil, rice, tea, soy sauce, honey, frozen peas, garlic, sparkling water.

## 8. Implementation plan

1. Engine: units, canonical names, consolidation, inventory offset, pack hints, budget summary, due logic, pet status. ✔
2. Storage: db with local fallback, one write per document, snapshot subscriptions for settings, recipes, items, inventory, weeks, chat. ✔
3. Views and modals: Home, Plan, Recipes, Groceries, Items, At Home, Coach, Settings; recipe editor, item editor, inventory editor, picker, log shop. ✔
4. Claude: import recipe, generate recipe, estimate nutrition/price/category, coach chat with typed actions and deterministic application. ✔
5. Publish as artifact with `db` + `sample`; seed starter data. ✔
6. Next: photo receipt capture into trips, per-store price memory, nutrition for item portions, export.

## 9. Definition of done (checked against v1)

1. Set one complete weekly grocery budget. ✔
2. Plan breakfast, lunch, dinner, snacks, treats and drinks. ✔
3. Add non-recipe items such as tea or fruit. ✔
4. Include Dobby's food and supplies. ✔
5. Distinguish essential, preferred and optional purchases. ✔
6. Track products that last multiple weeks. ✔
7. See actual purchase-week costs and normalized weekly costs. ✔
8. Reserve a budget buffer. ✔
9. Use leftovers for future lunches. ✔
10. Generate one consolidated grocery list. ✔
11. Exclude everything already available at home. ✔
12. See a complete grocery total instead of only a dinner estimate. ✔
13. Ask the AI to reorganize the entire week within budget. ✔
14. Protect essential food and pet supplies when reducing costs. ✔
15. Track the actual checkout amount after shopping. ✔

## 10. v1.1 — Discover, recipe import, receipts

Added 2026-09-20 on top of v1 without changing the existing design, navigation, budgeting logic, grocery engine, daily meal slots or Dobby section.

### Architecture inspection (before the change)

The v1 page is one HTML file assembled from numbered parts in `src/`. All grocery maths lives in `src/2-engine.js` (`canon`, `buildList`, `budgetSummary`, `itemDue`, `petStatus`); views and modals only render state and call `saveWeek`/`saveRecipe`. That made the extension straightforward: new recipes from any source become ordinary `recipes/<id>` documents and the existing engine consolidates their ingredients. There were no tests and no build script, so both were added first (`npm test`, `npm run build`).

### Recipe sources

- **Provider abstraction** (`src/8-discover-engine.js`): `SeedProvider` (recipe box + original starter recipes, always available) and `HttpProvider` (`search`, `featured`, `details`, `importUrl`), both normalizing into the same recipe shape. `activeProvider()` picks `HttpProvider` only when Settings → Live recipes has a service URL. Every failure is a typed error (`network`, `timeout`, `quota`, `http`) and Discover shows the error with a Retry button while still browsing the seed set.
- **Provider choice for the MVP: Spoonacular.** It has clear docs, complex search with diet and intolerance filters, images, ingredients with metric measures, analysed instructions, nutrition, `pricePerServing`, and a free developer tier (points per day). Its terms require attribution and linking back, so every external recipe shows the source name, "Recipe data and image via spoonacular.com" and a link to the original. TheMealDB (free, attribution only, no dietary filters or prices) is the fallback candidate; Edamam requires its badge and link on every plan. Sources checked: Spoonacular pricing and Postman docs, Edamam developer portal, TheMealDB API page, and two 2026 API round-ups.
- **Keys stay server-side.** `server/index.js` is a dependency-free Node proxy: `/api/recipes/search`, `/api/recipes/featured`, `/api/recipes/:id`, `/api/import?url=`, `/api/health`. `.env.example` lists `SPOONACULAR_API_KEY` (this variable alone enables live external recipes), `RECIPE_PROVIDER`, `PLENTY_ALLOWED_ORIGIN`, `PORT`, `ENABLE_URL_IMPORT`.
- **Honest limits.** The published Claude artifact has no internet access, so live recipes and server-side URL fetch only work when `plenty.html` is served next to the service. Inside the artifact Discover runs on the seed provider and says so; nothing is presented as coming from the internet unless it did. Photos: external recipes carry the provider's image URL and fall back to an original generated tile when the image cannot load; starter and AI recipes always use tiles.

### Discover

`src/9-discover-ui.js`: search (300 ms debounce), quick filter chips, full filter modal (meal type, max time, max cost, one serving, cuisine, dietary, include/exclude ingredients, pantry, overlap, leftovers, freezer). Allergies from Settings are enforced inside `filterRecipes` and `discoverCollections`, so no query or collection can bypass them; hidden counts are shown. Collections: Featured, Recommended for you, Under budget, Quick meals, Breakfast, Lunch, Dinner, Snacks, One-person friendly, Uses what you already have, Good ingredient overlap, Favorites, Recently viewed, Recently cooked. Horizontal shelves on mobile, grid on desktop. Cards show tile or photo, title, meal type, time, price per serving, servings, up to two signals ("Uses your spinach", "Shares 4 ingredients with your week", "Under $4 per serving", "Good for one"), favorite, Add. Recommendations are local (`rankRecipes`): liked-similarity, disliked penalty, usual cooking time, budget fit, frequently bought ingredients, pantry and overlap, recently cooked penalty. No AI call is needed for ranking.

Recipe detail: hero image, description, prep/cook/total, servings selector (down to one), cost per serving and total, ingredients with at-home marks, at home / need to buy / shared with your week, method or source link, nutrition when available, allergens, dietary tags, storage, leftovers, source and link, live budget impact. Actions: Add to plan, favorite, add missing ingredients to groceries, similar recipe (AI), ask the coach, edit, cooked it (liked / not for me), hide.

Add-to-plan flow (`openAddFlow` + `simulateAdd`): day, meal type, servings, replace warning, summary (recipe cost, new lines, at home, reused, new checkout, remaining, warning) computed on a cloned week with the real engine. Over budget never blocks; options: cheaper option, reduce portions, replace another planned recipe, remove an optional grocery item, save for next week. Empty meal slots open the picker with "Browse Discover", which pre-filters by meal type and adds straight into that slot; Plan has a prominent "Find recipes" action. Mobile bottom navigation is unchanged (Home, Plan, Groceries, Coach, More); Discover sits in More and behind Plan → Find recipes.

### Create recipe

Chooser with three routes: manual (existing editor), Import from URL, Create with AI. URL import: with the service, the page is fetched server-side and only Schema.org `Recipe` JSON-LD is used (`parseJsonLdRecipe`), preserving source name, URL and author; without the service, the user pastes the page source (parsed locally, no AI) or the recipe text (structured by Claude). Missing name or ingredients means the import fails with a clear message and a manual-entry button; missing instructions are reported, never hidden. AI creation takes meal type, ingredients to use and avoid, max time, budget per serving, servings, dietary requirements, cuisine and nutrition preference; the result is validated (`coerceRecipe`, allergy check) and labelled "Created for you by Claude".

### Receipts

`openLogShop` (quick entry: store, date, actual total, tax, discounts, notes) and `openReceiptScan` (photo → Claude vision → `parseReceiptResult` → editable confirmation → `matchReceiptLines`). Statuses: purchased as planned, not purchased, unplanned purchase, possible duplicate, not a grocery line; category and priority per line; abbreviations expanded and editable. On save: the trip joins `weeks/<monday>.trips` (several trips per week sum to the weekly total), the estimate at the time is stored beside it, matched lines are marked bought, confirmed "not purchased" lines stay unticked, and `applyReceiptToPrices` records unit prices into `prices/<canon>`; `robustUnitPrice` uses a median with outlier rejection so one discounted receipt cannot distort estimates. Home shows actual spend by category (Dobby stays under Pet) and over/under budget; the eight-week chart is unchanged. Receipt photos are read in memory and never stored.

### Tests and build

`tests/engine.test.js` (node:test) covers normalization, serving conversion, adding to a day and meal type, grocery integration, pantry subtraction, duplicate consolidation, budget recalculation, failed imports, missing images, API unavailability and allergy enforcement, plus receipt matching and price memory. `build.js` assembles and syntax-checks `plenty.html`.

## 11. v1.2 — Weekly Health Check

A simple, supportive review of whether the week's plan and purchases form a reasonably balanced, heart-conscious pattern. Not a calorie counter, not a diet app, not medical care. Everything from v1.1 is preserved.

- **Health profile** (`app/health`, optional, every field explains why it is asked; delete at any time): age, sex, height, weight, activity level, general goals (balanced meals, heart health, cholesterol-conscious choices, more vegetables, more fiber, fewer processed snacks, enough protein, maintain weight, energy, no goal; weight loss only as an explicit choice, never assumed), dietary preferences, considerations, foods to limit, foods to eat more often. Allergies stay in Settings. Nothing is hard-coded for the current user; the profile is editable settings. Only goals, considerations, preferences and limit/more-often lists go to the coach; age, height and weight never leave the device, are never logged and never go to recipe providers.
- **Engine** (`src/10-health-engine.js`, deterministic): `classifyFood` tags ingredients and products (vegetables, fruit, whole grains, legumes, nuts and seeds, fish, poultry, eggs, dairy, red meat, processed meat, sweets, highly processed snacks, unsaturated and saturated fats). `planFoodProfile` reads the week's recipes (leftovers count as the same recipe); `purchaseFoodProfile` reads the grocery list to buy and confirmed receipt lines whose purpose is "for this week"; `receiptTrends` compares at least four weeks of receipts and reports fruit frequency, sweet-snack trend, protein sources and vegetables bought but not planned. Pet lines, stock-up, guests, special-occasion and not-consumed-by-me lines are excluded from the user's analysis. `healthCheck` produces five indicators (vegetables and fruit, fiber-rich foods, protein variety, heart-conscious choices, sweets and highly processed snacks) with statuses Looking balanced / Could use a little more / Higher than your usual target / Not enough information yet, a short summary, positives, improvements and one suggested action. No overall score. The wording always distinguishes planned, purchased and reported, and says a receipt cannot show what was eaten.
- **UI** (`src/11-health-ui.js`): a compact card on Home; a Health tab (rail and More) with the five indicators, the week in short, reported check-ins, longer-term purchasing patterns, and sweet-snack swaps with Swap / Add both / Keep original / Don't suggest this again (nothing is ever removed silently). Grocery list side panel shows health notes such as "No fruit currently on the list" or "Most proteins this week come from meat" as notes only. Receipt confirmation gained a "For" column (this week, stock-up, guests, special occasion, pet, not consumed by me). Optional daily check-in (five yes/no questions, dismissible, no streaks) feeds the "reported" view.
- **Coach**: receives the deterministic health summary and minimal profile; rules limit health answers to three prioritized, budget-aware suggestions, forbid diagnoses, medication or treatment claims, forbid weight-loss or calorie talk unless chosen, and require swaps to be proposed as confirmable actions with at least one treat kept when asked.
- **Tests** (`tests/health.test.js`): pet exclusion, stock-up handling, planned vs purchased vs reported, meat frequency, fruit and vegetable variety, fiber recognition, sweet-snack trends and insufficient-data states, user-controlled swaps, profile deletion, and no weight-loss language.

Build note: `src/99-boot.js` must stay the last part. The first render touches every engine, so `boot()` may only run after all `const` bindings exist; calling it earlier aborts start-up before the database subscriptions are set up.
