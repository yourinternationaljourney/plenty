// Shared HTTP helpers for Netlify Functions (v1 handler signature): structured errors, body limits, basic rate limiting.
'use strict';

class HttpError extends Error { constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; } }

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
function json(status, body, extraHeaders) { return { statusCode: status, headers: { ...JSON_HEADERS, ...(extraHeaders || {}) }, body: JSON.stringify(body) }; }
function error(status, code, message, details) { return json(status, { error: { code, message, ...(details ? { details } : {}) } }); }

const LIMITS = { jsonBytes: 2 * 1024 * 1024, imageBytes: 5 * 1024 * 1024, docs: 5000, docBytes: 256 * 1024 };

function rawBody(event) {
  if (!event.body) return Buffer.alloc(0);
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body, 'utf8');
}
function parseJsonBody(event, maxBytes) {
  const buf = rawBody(event);
  if (buf.length > (maxBytes || LIMITS.jsonBytes)) throw new HttpError(413, 'payload_too_large', `Request body exceeds ${Math.round((maxBytes || LIMITS.jsonBytes) / 1024)} KB.`);
  if (!buf.length) return {};
  try { const v = JSON.parse(buf.toString('utf8')); if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object'); return v; }
  catch (e) { throw new HttpError(400, 'invalid_json', 'Request body must be a JSON object.'); }
}

// Best-effort per-instance limiter. Netlify Functions run on many instances, so this only dampens bursts against one
// instance; it is not a security boundary. Document this and add platform rate limiting when available on the plan.
const buckets = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now(); const w = windowMs || 60000; const b = buckets.get(key) || { count: 0, reset: now + w };
  if (now > b.reset) { b.count = 0; b.reset = now + w; }
  b.count += 1; buckets.set(key, b);
  if (buckets.size > 5000) { for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k); }
  if (b.count > (limit || 60)) throw new HttpError(429, 'rate_limited', 'Too many requests. Try again in a minute.');
}

// Wraps a handler: catches HttpError -> structured response; anything else -> 500 without leaking internals.
// Never logs bodies, tokens or health data; only method, path, status and error code.
function wrap(fn) {
  return async (event, context) => {
    const started = Date.now();
    try { const res = await fn(event, context); log(event, res.statusCode, null, started); return res; }
    catch (e) {
      if (e instanceof HttpError) { log(event, e.status, e.code, started); return error(e.status, e.code, e.message, e.details); }
      log(event, 500, 'internal', started); console.error('[plenty] unhandled', e && e.message);
      return error(500, 'internal', 'Something went wrong on our side.');
    }
  };
}
function log(event, status, code, started) { console.log(JSON.stringify({ m: event.httpMethod, p: (event.path || '').replace(/\/\.netlify\/functions/, ''), s: status, c: code || undefined, ms: Date.now() - started })); }

const methodNotAllowed = () => { throw new HttpError(405, 'method_not_allowed', 'Method not allowed.'); };

function resetRateLimits() { buckets.clear(); }

module.exports = { HttpError, json, error, LIMITS, rawBody, parseJsonBody, rateLimit, resetRateLimits, wrap, methodNotAllowed };
