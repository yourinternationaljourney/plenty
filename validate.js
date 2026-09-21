// Input validation shared by the handlers. Everything here is deterministic and dependency-free so tests cover it directly.
'use strict';
const { HttpError, LIMITS } = require('./http');

const PATH_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}(\/[A-Za-z0-9_\-.~:@+]{1,200}){1,15}$/;
const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateDocs(docs) {
  if (!docs || typeof docs !== 'object' || Array.isArray(docs)) throw new HttpError(400, 'invalid_docs', 'docs must be an object of path -> document.');
  const paths = Object.keys(docs);
  if (paths.length > LIMITS.docs) throw new HttpError(413, 'too_many_docs', `At most ${LIMITS.docs} documents per import.`);
  for (const p of paths) {
    if (!PATH_RE.test(p)) throw new HttpError(400, 'invalid_path', 'Damaged document path.', { path: p.slice(0, 60) });
    const d = docs[p];
    if (d === null) continue;
    if (typeof d !== 'object' || Array.isArray(d)) throw new HttpError(400, 'invalid_doc', 'Documents must be objects.', { path: p });
    if (JSON.stringify(d).length > LIMITS.docBytes) throw new HttpError(413, 'doc_too_large', 'A document exceeds 256 KB.', { path: p });
  }
  return docs;
}

function str(v, max, name, required) {
  if (v == null || v === '') { if (required) throw new HttpError(400, 'missing_field', `${name} is required.`); return ''; }
  if (typeof v !== 'string') throw new HttpError(400, 'invalid_field', `${name} must be text.`);
  if (v.length > max) throw new HttpError(400, 'invalid_field', `${name} is too long.`);
  return v;
}
function num(v, name, opts) {
  opts = opts || {};
  if (v == null || v === '') { if (opts.required) throw new HttpError(400, 'missing_field', `${name} is required.`); return null; }
  const n = Number(v);
  if (!isFinite(n)) throw new HttpError(400, 'invalid_field', `${name} must be a number.`);
  if (opts.min != null && n < opts.min) throw new HttpError(400, 'invalid_field', `${name} is below ${opts.min}.`);
  if (opts.max != null && n > opts.max) throw new HttpError(400, 'invalid_field', `${name} is above ${opts.max}.`);
  return Math.round(n * 10000) / 10000;
}

function validateReceipt(body) {
  const weekStart = str(body.weekStart, 10, 'weekStart', true); if (!WEEK_RE.test(weekStart)) throw new HttpError(400, 'invalid_field', 'weekStart must be YYYY-MM-DD.');
  const date = str(body.date, 10, 'date', true); if (!WEEK_RE.test(date)) throw new HttpError(400, 'invalid_field', 'date must be YYYY-MM-DD.');
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length > 300) throw new HttpError(400, 'invalid_field', 'At most 300 line items per receipt.');
  return {
    localTripId: str(body.localTripId, 80, 'localTripId'),
    weekStart, date,
    store: str(body.store, 120, 'store'),
    total: num(body.total, 'total', { required: true, min: 0, max: 100000 }),
    tax: num(body.tax, 'tax', { min: 0, max: 100000 }) || 0,
    discount: num(body.discount, 'discount', { min: 0, max: 100000 }) || 0,
    currency: str(body.currency, 8, 'currency') || null,
    note: str(body.note, 500, 'note'),
    method: ['quick', 'scan', 'manual'].includes(body.method) ? body.method : 'quick',
    lines: lines.map((l, i) => ({
      id: str(l.id, 80, `lines[${i}].id`) || null,
      name: str(l.name, 200, `lines[${i}].name`, true),
      qty: num(l.qty, `lines[${i}].qty`, { min: 0, max: 10000 }) || 1,
      price: num(l.price, `lines[${i}].price`, { min: 0, max: 100000 }) || 0,
      category: str(l.category, 60, `lines[${i}].category`),
      status: ['planned', 'unplanned', 'duplicate', 'skip', 'notbought'].includes(l.status) ? l.status : 'unplanned',
      purpose: ['week', 'stockup', 'guests', 'occasion', 'pet', 'notme'].includes(l.purpose) ? l.purpose : 'week',
      canon: str(l.canon, 120, `lines[${i}].canon`),
      pet: !!l.pet,
    })),
  };
}

// Image validation by magic bytes, never by the client's declared type alone.
const IMAGE_TYPES = { 'image/jpeg': [[0xFF, 0xD8, 0xFF]], 'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]], 'image/webp': null, 'image/heic': null };
function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  const brand = buf.slice(4, 12).toString('ascii');
  if (brand.startsWith('ftyp') && /heic|heix|hevc|mif1|msf1/.test(brand.slice(4))) return 'image/heic';
  return null;
}
function validateImage(buf, declaredType) {
  if (!buf || !buf.length) throw new HttpError(400, 'empty_image', 'No image data was received.');
  if (buf.length > LIMITS.imageBytes) throw new HttpError(413, 'image_too_large', 'Receipt photos must be 5 MB or smaller.');
  const type = sniffImage(buf);
  if (!type || !(type in IMAGE_TYPES)) throw new HttpError(400, 'unsupported_image', 'Only JPEG, PNG, WebP or HEIC photos are accepted.');
  if (declaredType && declaredType !== type && !(declaredType === 'image/jpg' && type === 'image/jpeg')) throw new HttpError(400, 'image_type_mismatch', 'The photo content does not match its declared type.');
  return type;
}

module.exports = { validateDocs, validateReceipt, validateImage, sniffImage, str, num, PATH_RE };
