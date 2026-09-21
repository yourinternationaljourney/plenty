# Supermarket price comparison (v2.2)

Price comparison lives **inside the Groceries tab** as three internal segments: **My list**, **Compare stores** and **Search products**. The five-tab navigation is unchanged.

## What it does

- Compares the consolidated grocery list (items already at home excluded, duplicates merged into one line) across the supermarkets chosen in Settings.
- Shows three basket options: **Easiest** (everything matched from one store), **Recommended** (respects the store-count setting; a second store is only added when it saves at least the minimum saving) and **Cheapest** (lowest known total). Each shows the total, how many items were priced, which stores, savings versus the priciest option with the same coverage, the allocation per store, when prices were last checked and the mix of price types.
- **Use this option for the budget** stores the chosen estimate in the week document (`basketChoice`) and shows it on Home and in the Groceries side panel. The grocery list itself is never rewritten.
- Per line, **Compare** opens the candidates at each store with source, date, label, unit price and match status.
- **Search products** searches known products with store chips, category and sort (total / per kg, L or unit / name), favourites and add-to-list.
- **Add a price you saw** records a manual observation labelled *Entered by you*.

## Price truth rules

Every displayed price carries source, observation date, price type, confidence and store scope. Labels: *Current online price* (retailer observation at most 7 days old), *Promotion* (active window only; expired promotions are never used), *Confirmed from your receipt* (at most 60 days), *Entered by you*, *Estimated from price history* (older observations; never called current) and *Price unavailable*. Plenty never invents a price, and a basket is never called complete while a line is unpriced.

## Data model (local documents, also carried by account import/export)

`products/<id>` (canonical name, brand, category, package quantity/unit, normalized quantity, unit family, identifiers, favourite), `storeproducts/<id>` (store to product link with retailer id/url), `priceobs/<id>` (price, currency, normalized unit price, type, observedAt, validity, source, confidence, userConfirmed, scope, manual) and `offers/<id>`. Stores come from the built-in `STORE_REGISTRY` (NL: Albert Heijn, Jumbo, Lidl; US: Kroger, Aldi, Walmart; CA: No Frills, Walmart Canada, Save-On-Foods). Receipt-confirmed history stays in `prices/<canon>` and is read as a separate source per store.

On Netlify these documents travel through `app_documents`; deleting price history from the account also removes `priceobs` and `offers` rows. No SQL migration was needed.

## Matching

Barcode (1.0), then retailer product id (0.95), then canonical name (0.85, plus or minus 0.1 for unit family, plus 0.05 for category). Scores of 0.8 and above are matched; 0.5 to 0.8 are shown as **Review match** and excluded from totals; below 0.5 are ignored. A product in the wrong unit family can never price a line.

## Providers

`PriceProviderInterface` = `searchProducts`, `getProduct`, `getPrices`, `getOffers`, `getSourceMetadata`. `LocalProvider` (receipts plus manual prices) is live. `RemoteProvider` targets authenticated Netlify Functions at `/api/prices/*` and is **not live**; every entry in `RETAILER_ADAPTERS` is `planned`. The browser never contacts or scrapes a retailer.

## Settings

Market (country code), preferred supermarkets (filtered to the market), default store count (one / two / any) and minimum saving to visit another store (default 3 in the local currency).
