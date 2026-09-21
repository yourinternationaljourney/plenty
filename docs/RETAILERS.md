# Supermarket price sources (foundation only)

This phase ships the interface, the registry and the database tables. **No retailer is contacted, scraped or called.** Every provider is registered with status `planned`, and calling one throws "not connected in this phase".

## Registry

| Key | Retailer | Country |
|---|---|---|
| `albert-heijn` | Albert Heijn | NL |
| `jumbo` | Jumbo | NL |
| `lidl-nl` | Lidl | NL |
| `kroger` | Kroger | US |
| `aldi-us` | Aldi | US |
| `walmart` | Walmart | US |
| `no-frills` | No Frills | CA |
| `walmart-ca` | Walmart Canada | CA |
| `save-on-foods` | Save-On-Foods | CA |

Code: `netlify/functions/lib/retailers/interface.js`.

## What a provider must return

A `PriceQuote` must carry: retailer, store/location or region, product identity (name plus retailer id or barcode when available), package size and unit, price and currency, unit price, price type (`normal`, `promotion`, `loyalty`), **source URL**, observed timestamp, offer validity (`validFrom` / `validUntil`), whether a loyalty card or coupon is required, and confidence plus matching status. `validateQuote()` rejects anything without a source URL: **no source means no verified price claim.**

## How quotes become prices

`quoteToObservation()` maps a quote to a `price_observations` row with `source_type` `online` or `promotion`. Receipt-confirmed prices are `receipt`. Anything the app estimates is `predicted` and is shown as an estimate, never as a confirmed current price. The UI must label the source type wherever a price is displayed.

## Legal and operational rules for future connections

- Use official APIs or documented data programs where they exist (for example Kroger's developer API). Respect each retailer's terms of use and robots directives; do not scrape sites that forbid it.
- Store raw source URLs and observation timestamps so every price can be traced.
- Run providers only inside Netlify Functions with credentials in environment variables; never in the browser.
- Cache and rate-limit per retailer; treat failures as "no data", never as a zero price.
- Country, currency and locale come from the user's household settings; never mix currencies in one comparison.
