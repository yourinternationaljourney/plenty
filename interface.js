// Supermarket price-source foundation: interface and registry only. No retailer is contacted in this phase.
// A provider turns a retailer's public offer or product data into PriceQuote records. Anything without a source URL is
// not a verified price and must be stored as source_type 'predicted' and presented as an estimate.
'use strict';

/**
 * @typedef {Object} PriceQuote
 * @property {string} retailer          registry key, e.g. "albert-heijn"
 * @property {string} country           ISO 3166-1 alpha-2, e.g. "NL"
 * @property {string} [region]          store, city or delivery region the price applies to
 * @property {string} [storeId]         retailer's own store/location identifier
 * @property {string} productName       name as shown by the retailer
 * @property {string} [productId]       retailer's product identifier
 * @property {string} [gtin]            barcode when known
 * @property {number} [packageSize]     numeric size of the package
 * @property {string} [packageUnit]     g | kg | ml | l | pcs
 * @property {number} price             package price
 * @property {string} currency          ISO 4217
 * @property {number} [unitPrice]       price per base unit
 * @property {'normal'|'promotion'|'loyalty'} priceType
 * @property {string} sourceUrl         REQUIRED: page the price was observed on
 * @property {string} observedAt        ISO timestamp of the observation
 * @property {string} [validFrom]       YYYY-MM-DD
 * @property {string} [validUntil]      YYYY-MM-DD
 * @property {boolean} requiresLoyalty  loyalty card needed for this price
 * @property {boolean} couponRequired   coupon/voucher needed for this price
 * @property {number} confidence        0..1, how sure the provider is about product identity and price parsing
 * @property {'unmatched'|'suggested'|'confirmed'} matchingStatus  match to the user's canonical product
 */

/**
 * @typedef {Object} RetailerProvider
 * @property {string} key
 * @property {string} name
 * @property {string} country
 * @property {'planned'|'available'} status
 * @property {(query:{canon:string, region?:string, storeId?:string}) => Promise<PriceQuote[]>} searchOffers
 * @property {(productId:string, region?:string) => Promise<PriceQuote|null>} getProduct
 */

const REQUIRED = ['retailer', 'country', 'productName', 'price', 'currency', 'priceType', 'sourceUrl', 'observedAt', 'requiresLoyalty', 'couponRequired', 'confidence', 'matchingStatus'];
function validateQuote(q) {
  const missing = REQUIRED.filter(k => q[k] === undefined || q[k] === null || q[k] === '');
  if (missing.length) return { ok: false, error: 'missing ' + missing.join(', ') };
  if (!/^https?:\/\//.test(q.sourceUrl)) return { ok: false, error: 'sourceUrl must be an http(s) URL; a quote without a source is not a verified price' };
  if (!['normal', 'promotion', 'loyalty'].includes(q.priceType)) return { ok: false, error: 'priceType must be normal, promotion or loyalty' };
  if (!(q.confidence >= 0 && q.confidence <= 1)) return { ok: false, error: 'confidence must be between 0 and 1' };
  if (!(Number(q.price) >= 0)) return { ok: false, error: 'price must be a non-negative number' };
  return { ok: true };
}
// Map a quote to a price_observations row. Promotions become 'promotion'; everything else with a source is 'online'.
function quoteToObservation(q, userId, canon) { return { user_id: userId, canon, product_name: q.productName, store: q.retailer, location: q.region || q.storeId || null, country: q.country, currency: q.currency, package_size: q.packageSize || null, package_unit: q.packageUnit || null, price: q.price, unit_price: q.unitPrice || null, source_type: q.priceType === 'promotion' ? 'promotion' : 'online', source_url: q.sourceUrl, observed_at: q.observedAt, valid_from: q.validFrom || null, valid_until: q.validUntil || null, confidence: q.confidence, data: q }; }

const notConnected = key => async () => { throw new Error(`Retailer provider "${key}" is registered but not connected in this phase.`); };
const define = (key, name, country) => ({ key, name, country, status: 'planned', searchOffers: notConnected(key), getProduct: notConnected(key) });
const RETAILERS = {
  'albert-heijn': define('albert-heijn', 'Albert Heijn', 'NL'),
  'jumbo': define('jumbo', 'Jumbo', 'NL'),
  'lidl-nl': define('lidl-nl', 'Lidl', 'NL'),
  'kroger': define('kroger', 'Kroger', 'US'),
  'aldi-us': define('aldi-us', 'Aldi', 'US'),
  'walmart': define('walmart', 'Walmart', 'US'),
  'no-frills': define('no-frills', 'No Frills', 'CA'),
  'walmart-ca': define('walmart-ca', 'Walmart Canada', 'CA'),
  'save-on-foods': define('save-on-foods', 'Save-On-Foods', 'CA'),
};
module.exports = { RETAILERS, validateQuote, quoteToObservation, REQUIRED };
