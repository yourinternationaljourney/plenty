-- Plenty account database, migration 0001 (initial schema).
-- Every private table carries user_id = the Netlify Identity subject verified server-side. No table is queried without it.
-- Money columns are numeric(12,4); ids are text so client-generated stable ids (recipes, items, weeks) round-trip unchanged.

create table if not exists schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

create table if not exists users (
  id          text primary key,            -- Identity subject (sub); never taken from the request body
  email       text,
  country     text,
  currency    text,
  locale      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists household_settings (
  user_id     text primary key references users(id) on delete cascade,
  country     text,
  currency    text,
  locale      text,
  data        jsonb not null,               -- the app/settings document (budget, buffer, targets, stores, allergies, pets...)
  updated_at  timestamptz not null default now()
);

create table if not exists pets (
  id          text not null,
  user_id     text not null references users(id) on delete cascade,
  name        text not null,
  type        text not null default 'other',
  data        jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists weekly_plans (
  user_id     text not null references users(id) on delete cascade,
  week_start  date not null,                -- Monday
  data        jsonb not null,               -- the weeks/<monday> document (slots, buy overrides, checked, extras, trips)
  updated_at  timestamptz not null default now(),
  primary key (user_id, week_start)
);

create table if not exists meals (
  id          text not null,
  user_id     text not null references users(id) on delete cascade,
  week_start  date not null,
  day         smallint not null check (day between 0 and 6),
  meal_type   text not null,                -- breakfast | lunch | dinner | snack | drink | treat
  entry_type  text not null,                -- r = recipe, l = leftovers, i = regular item portion
  recipe_id   text,
  servings    numeric(8,2),
  data        jsonb,
  primary key (user_id, id)
);
create index if not exists meals_user_week on meals (user_id, week_start);

create table if not exists recipes (
  id          text not null,
  user_id     text not null references users(id) on delete cascade,
  name        text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists grocery_items (                    -- regular / recurring groceries, household and pet supplies
  id          text not null,
  user_id     text not null references users(id) on delete cascade,
  name        text not null,
  kind        text not null default 'grocery',                  -- grocery | household | pet
  category    text,
  pet_id      text,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists pantry_items (                     -- the At Home inventory
  id          text not null,
  user_id     text not null references users(id) on delete cascade,
  name        text not null,
  location    text,                                             -- Pantry | Fridge | Freezer | Drinks | Pet | Household
  qty         numeric(12,3),
  unit        text,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists receipts (
  id                text not null,
  user_id           text not null references users(id) on delete cascade,
  week_start        date not null,
  store             text,
  receipt_date      date not null,
  total             numeric(12,4) not null default 0,
  tax               numeric(12,4) not null default 0,
  discount          numeric(12,4) not null default 0,
  currency          text,
  note              text,
  method            text not null default 'quick',                -- quick | scan | manual
  local_trip_id     text,                                          -- id of the trip on the device it came from
  image_blob_key    text,                                          -- Netlify Blobs key; the image itself never lives here
  image_mime        text,
  image_size        integer,
  processing_status text not null default 'not_connected',         -- not_connected | queued | done | failed (OCR is not connected yet)
  data              jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists receipts_user_date on receipts (user_id, receipt_date desc);

create table if not exists receipt_line_items (
  id          text not null,
  user_id     text not null references users(id) on delete cascade,
  receipt_id  text not null,
  name        text not null,
  qty         numeric(12,3) not null default 1,
  price       numeric(12,4) not null default 0,
  category    text,
  status      text not null default 'unplanned',                 -- planned | unplanned | duplicate | skip | notbought
  purpose     text not null default 'week',                      -- week | stockup | guests | occasion | pet | notme
  canon       text,                                              -- canonical product name used for matching
  data        jsonb,
  primary key (user_id, id)
);
create index if not exists receipt_lines_user_receipt on receipt_line_items (user_id, receipt_id);

create table if not exists product_mappings (                 -- raw receipt/offer text -> canonical product
  id            text not null,
  user_id       text not null references users(id) on delete cascade,
  raw_text      text not null,
  canon         text not null,
  product_name  text,
  package_size  numeric(12,3),
  package_unit  text,
  confidence    numeric(4,3) check (confidence between 0 and 1),
  updated_at    timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists price_observations (
  id            text not null,
  user_id       text not null references users(id) on delete cascade,
  canon         text not null,
  product_name  text,
  store         text,
  location      text,                                            -- store branch, city or region
  country       text,
  currency      text,
  package_size  numeric(12,3),
  package_unit  text,
  price         numeric(12,4),                                   -- price of the package
  unit_price    numeric(14,6),                                   -- price per base unit (g, ml, piece)
  source_type   text not null check (source_type in ('receipt','online','promotion','predicted')),
  source_url    text,                                            -- required for online and promotion observations (enforced in code)
  observed_at   timestamptz,
  valid_from    date,
  valid_until   date,
  confidence    numeric(4,3) check (confidence between 0 and 1),
  data          jsonb,
  created_at    timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists price_obs_user_canon on price_observations (user_id, canon);
comment on column price_observations.source_type is 'receipt = confirmed by the user''s receipt; online = seen on a retailer page; promotion = time-limited offer; predicted = estimate, must never be shown as a confirmed current price';

create table if not exists preferred_stores (
  id          text not null,
  user_id     text not null references users(id) on delete cascade,
  retailer    text,                                              -- retailer key from the provider registry (e.g. albert-heijn)
  store_name  text not null,
  location    text,
  country     text,
  sort_order  smallint not null default 0,
  primary key (user_id, id)
);

-- Shared, non-private: offers captured by future retailer providers. Empty in this phase; no source URL means no verified price.
create table if not exists retailer_offers (
  id               text primary key,
  retailer         text not null,
  country          text not null,
  region           text,
  product_name     text not null,
  canon            text,
  package_size     numeric(12,3),
  package_unit     text,
  price            numeric(12,4) not null,
  currency         text not null,
  unit_price       numeric(14,6),
  price_type       text not null check (price_type in ('normal','promotion','loyalty')),
  source_url       text not null,
  observed_at      timestamptz not null,
  valid_from       date,
  valid_until      date,
  requires_loyalty boolean not null default false,
  coupon_required  boolean not null default false,
  confidence       numeric(4,3) check (confidence between 0 and 1),
  matching_status  text not null default 'unmatched',            -- unmatched | suggested | confirmed
  data             jsonb
);
create index if not exists offers_retailer_canon on retailer_offers (retailer, canon);

-- Health data: stricter handling. Separate tables, separate export section, separate delete endpoint, never logged.
create table if not exists health_profiles (
  user_id     text primary key references users(id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
create table if not exists health_checkins (
  user_id     text not null references users(id) on delete cascade,
  day         date not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists app_documents (                    -- history, coach chats and other small documents
  user_id     text not null references users(id) on delete cascade,
  path        text not null,
  collection  text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, path)
);

create table if not exists import_status (                    -- one row per local profile imported into the account
  user_id             text not null references users(id) on delete cascade,
  source_profile_id   text not null,
  source_exported_at  text,
  doc_count           integer not null default 0,
  mode                text not null default 'merge',
  imported_at         timestamptz not null default now(),
  primary key (user_id, source_profile_id)
);
