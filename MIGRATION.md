# Plenty — migration from Claude Artifact prototype to a standalone, local-first PWA

Audit date: 2026-09-20. Source prototype: `G:\My Drive\YIJ & BD\Plenty` (v1.2), published as a private Claude artifact at https://claude.ai/artifact/KVbMBZMe1o9arxCE3zYFea. That artifact and its folder are **not modified** by this migration; the standalone app lives in this repository.

## 1. Audit of the current architecture

**Shape.** One HTML page (`plenty.html`, ~325 KB) assembled by `build.js` from numbered parts in `src/`. No framework, no bundler, no runtime dependencies. Views render from an in-memory state object `S`; every change writes one JSON document through `writeDoc(path, data)` and re-renders. Tests (`node --test`, 23 passing) load the DOM-free engine parts into a `vm` sandbox.

| Part | Role |
|---|---|
| `1-head.html` | design tokens, all CSS, page skeleton |
| `2-engine.js` | constants, state, dates, money, canonical ingredient names, plan entries, items due, pet supply status, consolidated list (`buildList`), budget (`budgetSummary`), price memory, allergens |
| `3-store-views.js` | storage adapters, `boot()`, nav/render shell, Home, Plan, Recipes, Groceries views |
| `4-views2.js` | Items, At Home, Coach, Settings views |
| `5-modals.js` | recipe editor, item editor, inventory editor, slot picker, AI import/generate |
| `6-coach.js` | coach prompt, action validation and application |
| `7-events-starter.js` | event delegation, actions, starter data (16 recipes, 22 items incl. 6 pet items, 13 inventory entries) |
| `8-discover-engine.js` | recipe providers (seed / HTTP), normalizers (Spoonacular, Schema.org JSON-LD), filters, ranking, budget simulation, receipt matching, price memory application |
| `9-discover-ui.js` | Discover, recipe detail, add-to-plan, create/import, receipts UI |
| `10-health-engine.js` | Weekly Health Check engine, profile, check-ins, trends, swaps |
| `11-health-ui.js` | Health tab, Home card, profile modal, daily check-in |
| `99-boot.js` | starts the app last |

**Current use of storage and platform features (grep of `src/`):**

| Concern | Where | Notes |
|---|---|---|
| `localStorage` | `3-store-views.js` lines 3–6 (`local.get/set/del/list`, keys `plenty:<path>`) | Fallback store when the artifact database is unavailable. Holds *all* data in that mode, including health and receipts. Not acceptable as the authoritative store for the standalone app. |
| In-memory data | `S` in `2-engine.js`; `S.external` (session cache of live recipes); `imgState`; `S.ui.*` | Recomputed on load from storage; no persistence needed except `S.ui.tab/weekKey` via the artifact hot-snapshot. |
| Claude Artifact database (`claude.use("db")`) | `boot()` in `3-store-views.js`; `writeDoc`/`deleteDoc` use `db.doc(path).set/delete`; `onSnapshot` subscriptions for `app/settings`, `recipes`, `items`, `inventory`, `prices`, `weeks`, `chat/<week>`, `app/history`, `app/health`, `app/checkins` | Artifact-only. Keeps working in the artifact; absent in the standalone build. |
| Claude sampling (`claude.use("sample")`) | `sampleFn` set in `boot()`; used by recipe import/generate/estimate (`5-modals.js`, `9-discover-ui.js`), AI create, coach chat (`6-coach.js`), receipt photo reading (`9-discover-ui.js`) | Artifact-only. Every AI feature already hides behind `.ai-only` / `.ai-block` when `sampleFn` is null; the coach shows a "needs Claude" note. |
| Artifact hot-reload snapshot (`window.claude.hot`) | `2-engine.js` line 47, `3-store-views.js` line 50 | Restores tab and week across republishes. Harmless when absent. |
| External API calls (`fetch`) | `HttpProvider.fetchJSON` in `8-discover-engine.js` line 87, only when Settings → Live recipes has a service URL | Optional; calls the user's own `server/index.js` proxy, which holds the Spoonacular key server-side. No key is ever in the page. |
| Image loading | `new Image()` in `9-discover-ui.js` (recipe photos from a live provider) | Falls back to generated SVG tiles. |
| Clipboard | `navigator.clipboard.writeText` in `7-events-starter.js` (copy grocery list) with a textarea fallback | Standard web API. |
| Mock / starter data | `STARTER` in `7-events-starter.js`; `seed/*.json` (same content, used to seed the artifact database) | Original recipes and generic groceries. Six pet items are Dobby-specific dog products with dated `remainingAsOf`/`lastBought` values (7 hard dates in 2026-09). |
| Hard-coded personal information | `DEFAULT_SETTINGS.petName:'Dobby'` (`2-engine.js` line 19); Settings placeholder "Dobby" (`4-views2.js` line 89); `GROUP_LABEL('pet')` reads the pet name from settings; 34 uses of `petName()`; starter pet items (dog food, dental chews, waste bags, joint supplement) | Simone's health profile, receipts, plans and Dobby's items live only in the artifact database and localStorage of her browser, **not** in the source. The only personal defaults in code are the pet name "Dobby" and dog-shaped starter items. |
| Downloads | none (the artifact sandbox blocks page-initiated downloads) | Backup export needs a standard download in the PWA. |

**Features that must remain functional** (all present in v1.2): weekly planning for breakfast, lunch, dinner, snacks, drinks and treats; one-person servings and leftovers; recipe Discover with filters, collections and local recommendations; original starter recipes; manual recipes; URL/JSON-LD import; favorites, viewed and cooked history; grocery-list consolidation with canonical names, unit merging, pack hints; pantry/At Home deductions; budget with groups, buffer, normalized weekly cost, over-budget suggestions that protect essentials; actual-versus-estimated spending; shopping-trip history and eight-week chart; receipt logging with editable lines, statuses, purposes and price memory; pet expenses with run-out dates; Weekly Health Check with optional profile, daily check-ins, trends and user-controlled swaps; AI Coach interface (unavailable state outside Claude); existing visual design and mobile navigation; all 23 tests.

## 2. Target architecture

Static files only, served from GitHub Pages under `https://<user>.github.io/<repo>/` (a subpath). No server, no database to manage, no account.

```
dist/                      built by `npm run build`
  index.html               the app (parts 1–99 + standalone parts), relative URLs only
  404.html                 copy of index.html so a refresh on the subpath never 404s
  manifest.webmanifest     name, icons, theme/background colour, display: standalone, start_url "./"
  sw.js                    service worker, scope "./", versioned cache, update message
  icons/                   original Plenty icons (SVG + PNG 192/512, maskable)
```

**Storage.** A path-based document store with one interface and two backends:

- `ArtifactBackend` — the existing `claude.use("db")` path, unchanged, used only when the page runs inside the Claude artifact.
- `IdbBackend` — IndexedDB database `plenty`, versioned schema with an explicit migration table:
  - `docs` (key `profileId + "/" + path`, indexed by `profileId` and `collection`): every JSON document the app already writes (`app/settings`, `recipes/*`, `items/*`, `inventory/*`, `weeks/*`, `chat/*`, `prices/*`, `app/history`, `app/health`, `app/checkins`).
  - `blobs` (key `profileId + "/" + blobId`): receipt images.
  - `meta` (key): profile registry `{profiles:[{id,name,createdAt}], activeId}` and schema markers.
- `localStorage` keeps only `plenty:ui` (last tab, last week, "install banner dismissed"). No health, receipt, plan or budget data.

`writeDoc`, `deleteDoc` and the collection loaders in `boot()` are the only seams; every module keeps using them, so there is one storage system for recipes, items, budgets, receipts and health.

**Profiles.** One active local profile by default; a profile switcher allows several on one device. Every document key is prefixed by the profile id, so budgets, lists, receipts, pets and health never mix. Switching requires a deliberate action and reloads state.

**Pets.** `settings.pets: [{id, name, type}]` replaces the single `petName`. Items of kind `pet` carry `petId`. `petName()` keeps working (first pet's name, or "Pet") so the 34 existing call sites and the Health Check exclusion stay intact. Starter pet items are generated from the pets the user creates during onboarding; nothing about Dobby is in the build.

**Onboarding.** With no active profile the app shows a clean wizard (name, country, currency, language, household, budget, stores, meals to plan, dietary preferences, allergies, dislikes, more-often/limit foods, optional health goals and body data, pets). Writes `app/settings`, `app/health` and pet items; optionally loads the original starter recipes and generic groceries.

**Backup.** `plenty-backup` JSON, version 2: profile name, export date, all documents, receipt images as base64. Optional AES-GCM encryption (PBKDF2, 210k iterations) when health or receipt data is present. Import validates format and version, previews name/date/counts, warns about replacement, requires confirmation, runs schema migrations, verifies counts. Download uses a Blob URL (works in the PWA; inside the artifact the JSON is shown to copy instead).

**Prototype-data migration.** On first standalone start the app looks for `plenty:*` keys in `localStorage` (the old fallback store). If found it explains what was detected, offers to import into IndexedDB under a new profile, writes a backup first, verifies counts, and leaves the original keys in place until the user confirms.

**AI and live recipes.** `AIProvider` interface with `ClaudeArtifactAI` (existing) and `NoAI` (standalone). Every AI surface stays visible with a clear unavailable state; deterministic alternatives (fill week, health check, swaps) are unaffected. `RecipeProvider` stays as is; live search needs the optional `server/` proxy and is honestly labelled. No provider or AI keys exist in the client bundle; build-time variables cannot make a client key secret, so none are used.

## 3. Migration plan

1. **Copy** the prototype into this repository unchanged (`src/`, `tests/`, `server/`, `build.js`, `PLAN.md`, `.env.example`). Keep the artifact build target (`npm run build:artifact`) so the Claude version remains reproducible.
2. **Storage layer**: add `src/12-storage.js` (IndexedDB backend, memory backend for tests, profile registry, schema migrations, blob store). Route `writeDoc`/`deleteDoc`/loaders through it when `claude.use("db")` is unavailable. Remove `localStorage` as a data store; keep it for UI preferences only.
3. **Profiles and onboarding**: `src/13-onboarding.js` (wizard, profile switcher, privacy explanation, pets). Generalize `petName` to a pets list with a compatibility shim.
4. **Backup and data controls**: `src/14-backup.js` (export, encryption, import with validation and confirmation, data deletion controls, prototype-data migration).
5. **PWA**: `src/15-pwa.js` (service-worker registration, update prompt, install action), `pwa/manifest.webmanifest`, `pwa/sw.js`, generated icons, `build.js` producing `dist/` with relative paths and a `404.html`.
6. **Receipts**: optional local photo attachment stored in IndexedDB; removable; scanning stays behind the AI provider with an honest unavailable state.
7. **Tests**: `tests/standalone.test.js` (profiles, onboarding, persistence, migrations, backup, encryption, invalid backup, deletion, receipt images, secrets scan, subpath/manifest/service-worker checks) plus the existing 23.
8. **Repository**: README, `.gitignore`, GitHub Actions (`ci.yml` test + build, `pages.yml` deploy), release tagging via `npm version`. Initial commit; push and Pages enablement need the GitHub remote (not created from here).
9. **Verify** the complete scenario from the brief in the browser, on narrow and desktop viewports.

## 4. Future compatibility (documented, not implemented)

- **Accounts and sync**: add a `RemoteBackend` implementing the same document-store interface; sync by last-writer-wins per document (the artifact backend already behaves this way). Profiles map to accounts.
- **Shared households**: a household document shared across accounts; the profile prefix becomes a household id. Budgets, lists and pets are already scoped by that prefix.
- **Secure server-side AI**: implement `AIProvider` against a small authenticated proxy (the pattern of `server/index.js`), never in the client.
- **Live recipe providers**: `HttpProvider` already targets a proxy; add providers by implementing `search/featured/details/importUrl` and a normalizer.
- **Push notifications**: the service worker is in place; notifications need a push service and user consent.
- **App stores**: the PWA can be wrapped (PWABuilder / Trusted Web Activity) without code changes.

## 5. Status after migration (2026-09-20)

Implemented in this repository (v2.0.0): steps 1–8 of the plan. `npm test` runs 35 tests (23 inherited, 12 standalone) and `npm run build` produces `dist/` with the personal-data and secret guard.

Verified in a browser served from a `/plenty/` subpath (`npm run serve`), following the brief's scenario: new user → onboarding as Simone with the pet Dobby → weekly plan with a one-serving recipe → grocery list and budget update (spinach 50 g, checkout +€1.40) → pet food added changes the budget (+€28) but not one Health Check indicator → shopping trip logged → reload keeps everything (IndexedDB) → encrypted backup exported (33 KB) → delete all data returns to onboarding → import restores 54 documents, pet, plan, receipt and health goals → deleting the database (a clean browser profile) starts at empty onboarding with no mention of Simone or Dobby.

Not verifiable from this environment and left for the owner: pushing to GitHub and enabling Pages (no remote exists yet; `gh` is not installed here), and installation tests on Android Chrome, iPhone Safari and desktop Chrome. The embedded preview browser does not run service workers, so the offline and update paths were checked by tests on the built `sw.js` (precache list, scope, `SKIP_WAITING`) and by serving `sw.js`, the manifest and icons with correct content types, not by an end-to-end install.

Known limits of v2.0.0: interface language is English (the language preference is stored); receipt photos can be attached to quick-entry trips and removed, but the line-item confirmation screen does not attach photos; automatic receipt reading, the coach, recipe generation and live recipe search are unavailable without a secure service and say so.
