# Plenty

A local-first weekly grocery, food, household and budget planner. One weekly budget for everything from the store, a consolidated grocery list that never duplicates an ingredient, pantry deductions, pet supplies with run-out dates, receipt logging with actual-versus-estimated spending, a supportive Weekly Health Check, and recipe discovery. It runs entirely on your device as an installable Progressive Web App: no account, no server, no database to manage.

- **Live app**: deployed from this repository to GitHub Pages (see Deployment). Share that one URL; every person who opens it gets their own clean onboarding and their own private local profile.
- **Privacy**: your Plenty information is stored privately on this device (IndexedDB). Plenty does not synchronize between devices; export a backup to protect or transfer your data.
- **No personal data in this repository**: profiles, health information, receipts, receipt images, local databases and backups are never committed (see `.gitignore` and the CI guard).

## Project structure

```
src/                 numbered parts assembled into one HTML page (order matters; 99-boot.js is last)
  1-head.html        design tokens, CSS, page skeleton
  2-engine.js        grocery, budget, pet-supply and price engines (DOM-free)
  3-store-views.js   storage seams (writeDoc/deleteDoc), boot, Home/Plan/Recipes/Groceries
  4-views2.js        Items, At Home, Coach, Settings
  5-modals.js        editors and pickers
  6-coach.js         AI Coach prompt and deterministic action application
  7-events-starter.js actions and original starter recipes/groceries
  8-discover-engine.js recipe providers, normalizers, ranking, budget simulation, receipts (DOM-free)
  9-discover-ui.js   Discover, recipe detail, add-to-plan, create/import, receipts UI
  10-health-engine.js Weekly Health Check engine (DOM-free)
  11-health-ui.js    Health tab, profile, check-ins
  12-storage.js      IndexedDB store, profiles, schema migrations, prototype-data detection (DOM-free)
  13-onboarding.js   onboarding wizard, profile picker, pets
  14-backup.js       export/import, encryption, data controls, prototype migration
  15-pwa.js          service-worker registration, updates, install
  99-boot.js         start
pwa/                 manifest.webmanifest and the service-worker template
tools/               icon generator, local subpath server, migration scripts
server/              optional Node proxy for live recipe search and URL import (keys stay server-side)
tests/               node:test suites (engine, health, standalone)
build.js             production build -> dist/
MIGRATION.md         architecture audit and migration plan
PLAN.md              product plan (v1 to v1.2 history)
```

## Setup

Requirements: Node 18 or newer. There are no npm dependencies.

```bash
git clone <your-repo-url> plenty
cd plenty
npm test
npm run build
```

## Development

Edit the parts in `src/`, then:

```bash
npm run build      # writes dist/ (index.html, 404.html, manifest, sw.js, icons, version.json)
npm run serve      # serves dist/ at http://localhost:8080/plenty/ to mimic the GitHub Pages subpath
```

Service workers only run over http(s), so use `npm run serve` (not a `file://` URL) to test install, offline and update behaviour. Chrome DevTools → Application shows the manifest, service worker and IndexedDB database `plenty`.

The Claude artifact version of Plenty is built from the same parts with `npm run build:artifact` (writes `plenty.html`, ignored by git). The original prototype is untouched.

## Tests

```bash
npm test
```

Covers ingredient normalization, serving scaling, consolidation, pantry deductions, budgets, external recipe normalization, URL import, allergy enforcement, receipts and price memory, the Weekly Health Check, and the standalone layer: empty onboarding for new users, profile separation, persistence and re-open, schema upgrades, prototype-data migration, backup export/import (including images), encrypted backups, invalid backups, data deletion, offline plan and list, and a scan of the built bundle for personal data, secrets, absolute paths, manifest fields and service-worker scope.

## Production build

`npm run build` assembles `dist/`. Every URL is relative (`./…`), so the app works from a repository subpath such as `https://<user>.github.io/<repo>/`. The build refuses to complete if the bundle matches a personal-data or secret pattern.

## Deployment (GitHub Pages)

1. Push this repository to GitHub (default branch `main`).
2. In the repository settings → Pages, set **Source** to **GitHub Actions**.
3. Every push to `main` runs `.github/workflows/pages.yml`: tests, build, deploy. The URL is `https://<user>.github.io/<repo>/`.
4. Open that URL on your phone and choose Install (Android Chrome, desktop Chrome/Edge) or Share → Add to Home Screen (iPhone Safari).

`.github/workflows/ci.yml` runs tests and the build on every branch and fails if a `.env`, backup or receipt image is committed or a secret pattern appears.

Why GitHub Pages works here: Plenty is static HTML and JavaScript with a service worker scoped to `./`, a `404.html` that is the app itself (so refreshing never breaks), and no server-side code. The only things that cannot run on Pages are the optional live recipe proxy and any AI service, because both need secret keys that a public static site cannot protect.

## Releases

Stable versions are tagged with npm's version command, which also updates `package.json` and stamps the build:

```bash
npm run release        # bumps the minor version, commits and tags v2.x.0
git push --follow-tags
```

Create a GitHub Release from the tag if you want release notes. The build embeds the version (`version.json` and Settings → App).

## Configuration

Copy `.env.example` to `.env` only if you run the optional recipe service (`npm run server`). It is the only place a Spoonacular key may live; the static app never contains keys, and build-time variables would not make a client-side key secret. Without the service, Discover uses your recipe box and the original starter recipes and says so.

## AI features

The standalone build has no AI service. The Coach, recipe generation, nutrition estimates and automatic receipt reading show an unavailable state; all planning, grocery, budget, receipt, pet and health calculations are deterministic and work fully. Inside the Claude artifact the same code uses Claude. Connecting a secure server-side AI later means implementing the small provider interface described in `MIGRATION.md`.

## Data, backups and privacy

Settings → Your data offers: export a backup (optionally encrypted when it contains health or receipt data), import a backup with a preview and confirmation, edit or delete the health profile, remove receipts and receipt photos, delete shopping history, reset the current week, and delete all Plenty data. Backups are also how you move Plenty from a computer to a phone. Receipt photos are stored only in the device's IndexedDB and are removable.

## Recipe photography

Starter recipes show real food photographs from Wikimedia Commons, each with the photographer and licence (CC0, CC BY 2.0, CC BY-SA 4.0) credited on the image and linked to the file page. The records live in `STARTER_PHOTOS` (`src/8-discover-engine.js`) with `imageUrl`, `imageAlt`, `imageCredit`, `imageCreditUrl`, `imageLicense`, `imageLicenseUrl` and `imageProvider`. Remote images are only displayed from approved providers whose terms permit embedding (Wikimedia Commons, Unsplash, Pexels, Spoonacular); anything else falls back to Plenty's own procedurally drawn food tile. No AI-generated images are used.

## Supermarket price comparison (v2.2)

The Groceries tab has three internal segments: **My list**, **Compare stores** and **Search products**. Choose your market and preferred supermarkets in Settings; Plenty compares the whole list and offers Easiest, Recommended and Cheapest baskets, labels every price with its source and date, and never invents a price. Prices currently come from receipts you confirm and prices you enter; retailer connections are planned behind Netlify Functions and are not live. Details: `docs/PRICE-COMPARISON.md`.

## Netlify deployment and accounts (v2.1)

Netlify hosts the same static build and adds an optional account layer; GitHub remains the source repository and the GitHub Pages deployment keeps working as a local-only fallback.

- `netlify.toml`: build `npm run build:netlify` (production build + database migrations), publish `dist`, functions in `netlify/functions`, `/api/*` → Functions, SPA fallback for PWA refreshes, security headers, deploy previews.
- **Identity**: sign up, email verification, login, logout, password recovery and password/email changes through the Netlify Identity widget (loaded only in cloud builds). Functions read the verified user from the token Netlify validates; ids in requests are never trusted.
- **Database**: Netlify Database (Postgres) with version-controlled migrations in `netlify/db/migrations/`, applied once each at deploy by `tools/db-migrate.js`. Every private table is keyed by `user_id`; health data lives in separate tables with its own export section and delete endpoint.
- **Blobs**: receipt photos in the private store `plenty-receipts` under non-guessable per-user keys, served only to their owner through `/api/receipt-image`, deleted with the receipt or the account. Receipt processing (OCR) is not connected; the UI says so.
- **Functions**: `profile`, `app-data` (import with preview, duplicate and older-data protection; read back), `receipts`, `receipt-image`, `account-export`, `health-data` (delete health or price history), `account-delete`. Input validation, ownership checks, structured errors, size limits and best-effort rate limiting live in `netlify/functions/lib/`.
- **Local-first stays authoritative**: an account holds a copy only when you import; restoring on another device is explicit. Automatic synchronization is not implemented (see `docs/SYNC.md`).
- Setup steps and environment variables: `docs/NETLIFY-SETUP.md`. Future supermarket price sources: `docs/RETAILERS.md` (interface and registry only).
