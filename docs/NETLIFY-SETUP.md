# Netlify setup for Plenty (manual steps)

GitHub stays the source of truth; Netlify builds from it. GitHub Pages keeps working as a fallback until this is verified.

## 1. Create the site

1. Netlify → **Add new site → Import an existing project → GitHub** → choose `yourinternationaljourney/plenty`.
2. Build settings are read from `netlify.toml` (build command `npm run build:netlify`, publish `dist`, functions `netlify/functions`). Leave them as detected.
3. Deploy. The first deploy runs without a database; the app works in local-only mode and the account card says the account service is not configured.
4. Optional: **Site configuration → Domain management** to set a custom domain.

Deploy previews are on by default for pull requests (Site configuration → Build & deploy → Deploy previews).

## 2. Enable Netlify Identity

1. Site configuration → **Identity → Enable Identity**.
2. Registration: **Open** (anyone can sign up) or **Invite only** for a private beta.
3. Emails: keep "Confirm sign-up" on so addresses are verified; password recovery emails are on by default.
4. Optional: External providers (Google etc.) if wanted.
5. Nothing to configure in code: the app loads the Identity widget when built with `PLENTY_CLOUD=netlify`, and Functions receive the verified user from Netlify.

## 3. Enable Netlify Database

1. Site configuration → **Database** (Netlify DB, powered by Neon) → **Add database** (or `npx netlify db init` from the CLI).
2. Netlify sets the connection string as an environment variable (`NETLIFY_DB_URL`; older projects use `NETLIFY_DATABASE_URL`). Plenty reads either.
3. Within 7 days, claim the database with a Neon account as Netlify instructs, or it expires.
4. Trigger a deploy. `npm run build:netlify` applies `netlify/db/migrations/*.sql` once each (tracked in `schema_migrations`). Check the deploy log for `[db-migrate] applied: 0001_init.sql`.

## 4. Netlify Blobs

Nothing to enable: Functions get access automatically. Receipt photos go to the store `plenty-receipts` under non-guessable keys `receipts/<userId>/<uuid>-<random>`; they are never public and are only served through `/api/receipt-image` to their owner.

## 5. Environment variables

Set in Site configuration → Environment variables. Placeholder values only; never commit real ones.

| Variable | Set by | Value | Purpose |
|---|---|---|---|
| `PLENTY_CLOUD` | `netlify.toml` | `netlify` | Build flag: include the Identity widget and account UI |
| `NODE_VERSION` | `netlify.toml` | `20` | Build runtime |
| `NETLIFY_DB_URL` | Netlify Database | `postgres://user:password@host/db?sslmode=require` | Functions and migrations (read server-side only) |
| `NETLIFY_DATABASE_URL` | older Netlify DB setups | same shape | Accepted as a fallback name |
| `NETLIFY_BLOBS_CONTEXT` / blob tokens | Netlify runtime | automatic | Never set by hand |

No other secrets are needed in this phase. Live recipe search (`server/`, `SPOONACULAR_API_KEY`) and AI are not part of the Netlify deployment.

## 6. Verify after deploy

1. Open the site URL: onboarding appears; Settings shows an **Account** card with "Sign in or create account".
2. Create an account, confirm the email, sign in: the card shows the email and the import/restore/export/delete actions.
3. Import a local profile; then sign in on a second device and use **Restore from my account** into a new local profile.
4. Upload a receipt photo on a trip; the receipt shows "stored in account · processing not connected yet"; download and delete it.
5. Delete the account and confirm the profile endpoint returns no data afterwards.

## Local development

`netlify dev` (Netlify CLI) serves `dist/` with Functions at `/api/*`, Identity and Blobs emulation; set `NETLIFY_DB_URL` in `.env` locally to reach a database. Without the CLI, `npm run serve` still runs the local-only app.
