// Endpoint logic, built from injected dependencies so tests run it against MemoryRepo/MemoryBlobs and production uses
// SqlRepo/NetlifyBlobs. Every handler: verify the user from the Netlify-validated token, rate-limit, validate input,
// check ownership, return structured JSON. No secrets, tokens or health data are ever logged.
'use strict';
const { HttpError, json, parseJsonBody, rateLimit, rawBody, methodNotAllowed, LIMITS } = require('./http');
const { requireUser, identityAdmin } = require('./auth');
const { validateDocs, validateReceipt, validateImage } = require('./validate');
const { newKey } = require('./blobs');

function createHandlers(deps) {
  const repo = () => (typeof deps.repo === 'function' ? deps.repo() : deps.repo);
  const blobs = () => (typeof deps.blobs === 'function' ? deps.blobs() : deps.blobs);
  const fetchImpl = deps.fetch || (typeof fetch === 'function' ? fetch : null);
  const limit = (user, event, n) => rateLimit((user && user.id) || (event.headers && (event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'])) || 'anon', n || 60);
  const ownerOr404 = (row) => { if (!row) throw new HttpError(404, 'not_found', 'Not found.'); return row; };
  const idParam = (event) => { const q = event.queryStringParameters || {}; const fromPath = (event.path || '').split('/').filter(Boolean).pop(); const id = q.id || (fromPath && !/^(receipts|receipt-image|profile|app-data|account-export|account-delete|health-data)$/.test(fromPath) ? fromPath : ''); if (!id || !/^[A-Za-z0-9_\-:.]{1,120}$/.test(id)) throw new HttpError(400, 'invalid_id', 'A valid id is required.'); return id; };

  return {
    // GET /api/profile -> the account profile, import history and record counts (also creates the user row on first call)
    async profile(event, context) {
      const user = requireUser(context); limit(user, event); if (event.httpMethod !== 'GET') methodNotAllowed();
      const r = repo(); await r.ensureUser(user); const p = await r.getProfile(user.id);
      return json(200, { user: { id: user.id, email: user.email, emailVerified: user.emailVerified }, settings: p && p.settings, imports: (p && p.imports) || [], counts: (p && p.counts) || {}, sync: { mode: 'manual', note: 'Local data stays authoritative on each device. Import and restore are explicit actions; automatic synchronization is not implemented yet.' } });
    },

    // GET /api/app-data -> the account's documents; POST -> import a local profile (preview with ?preview=1)
    async appData(event, context) {
      const user = requireUser(context); limit(user, event, 30); const r = repo(); await r.ensureUser(user);
      if (event.httpMethod === 'GET') { const d = await r.getAppData(user.id); return json(200, { docs: d.docs, receipts: d.receipts, docCount: Object.keys(d.docs).length }); }
      if (event.httpMethod !== 'POST') methodNotAllowed();
      const body = parseJsonBody(event);
      const docs = validateDocs(body.docs || {});
      const sourceProfileId = String(body.sourceProfileId || '').slice(0, 120); if (!sourceProfileId) throw new HttpError(400, 'missing_field', 'sourceProfileId is required so the same profile is not imported twice by accident.');
      const exportedAt = String(body.exportedAt || '').slice(0, 40);
      const mode = body.mode === 'replace' ? 'replace' : 'merge';
      const existing = await r.getImport(user.id, sourceProfileId);
      const current = await r.getAppData(user.id);
      const preview = { docCount: Object.keys(docs).length, accountDocCount: Object.keys(current.docs).length, alreadyImported: !!existing, previousImport: existing ? { exportedAt: existing.source_exported_at, importedAt: existing.imported_at, docCount: existing.doc_count } : null, mode, wouldReplace: mode === 'replace' && Object.keys(current.docs).length > 0 };
      if ((event.queryStringParameters || {}).preview === '1') return json(200, { preview });
      if (existing && !body.force) throw new HttpError(409, 'already_imported', 'This local profile was already imported into the account. Confirm to import it again (documents with the same ids are overwritten).', preview);
      if (mode === 'merge' && existing && exportedAt && existing.source_exported_at && exportedAt < existing.source_exported_at && !body.force) throw new HttpError(409, 'older_than_account', 'The account already holds a newer import of this profile. Confirm to overwrite it with older data.', preview);
      const res = await r.putAppData(user.id, docs, mode);
      await r.recordImport(user.id, { source_profile_id: sourceProfileId, source_exported_at: exportedAt || null, doc_count: res.written, mode });
      return json(200, { imported: res.written, mode, preview });
    },

    // POST /api/receipts -> create; GET /api/receipts -> list; GET|DELETE /api/receipts/:id
    async receipts(event, context) {
      const user = requireUser(context); limit(user, event); const r = repo(); await r.ensureUser(user);
      if (event.httpMethod === 'POST') { const rec = validateReceipt(parseJsonBody(event)); const row = await r.createReceipt(user.id, rec); return json(201, { receipt: publicReceipt(row) }); }
      if (event.httpMethod === 'GET') { const q = event.queryStringParameters || {}; const tail = (event.path || '').split('/').filter(Boolean).pop(); if (!q.id && (tail === 'receipts' || !tail)) { const rows = await r.listReceipts(user.id); return json(200, { receipts: rows.map(publicReceipt) }); } const row = ownerOr404(await r.getReceipt(user.id, idParam(event))); return json(200, { receipt: publicReceipt(row) }); }
      if (event.httpMethod === 'DELETE') { const id = idParam(event); const row = ownerOr404(await r.deleteReceipt(user.id, id)); if (row.image_blob_key) await blobs().delete(row.image_blob_key).catch(() => {}); return json(200, { deleted: id, imageDeleted: !!row.image_blob_key }); }
      methodNotAllowed();
    },

    // POST /api/receipt-image {receiptId, contentType, data(base64)} ; GET ?id=receiptId ; DELETE ?id=receiptId
    async receiptImage(event, context) {
      const user = requireUser(context); limit(user, event, 30); const r = repo(); await r.ensureUser(user);
      if (event.httpMethod === 'POST') {
        const body = parseJsonBody(event, LIMITS.imageBytes + 2 * 1024 * 1024);
        const receiptId = String(body.receiptId || ''); if (!/^[A-Za-z0-9_\-:.]{1,120}$/.test(receiptId)) throw new HttpError(400, 'invalid_id', 'receiptId is required.');
        const row = ownerOr404(await r.getReceipt(user.id, receiptId));
        let buf; try { buf = Buffer.from(String(body.data || ''), 'base64'); } catch (e) { throw new HttpError(400, 'invalid_image', 'Image data must be base64.'); }
        const type = validateImage(buf, body.contentType ? String(body.contentType) : null);
        if (row.image_blob_key) await blobs().delete(row.image_blob_key).catch(() => {});
        const key = newKey(user.id);
        await blobs().put(key, buf, { userId: user.id, receiptId, type });
        await r.setReceiptImage(user.id, receiptId, { key, mime: type, size: buf.length });
        return json(201, { receiptId, image: { mime: type, size: buf.length }, processing: { status: 'not_connected', message: 'Receipt processing is not connected yet. The photo is stored privately; line items stay manual.' } });
      }
      if (event.httpMethod === 'GET') {
        const row = ownerOr404(await r.getReceipt(user.id, idParam(event)));
        if (!row.image_blob_key) throw new HttpError(404, 'no_image', 'This receipt has no photo.');
        const b = await blobs().get(row.image_blob_key); if (!b) throw new HttpError(404, 'no_image', 'The photo is no longer stored.');
        return { statusCode: 200, headers: { 'Content-Type': row.image_mime || 'application/octet-stream', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="receipt"', 'X-Content-Type-Options': 'nosniff' }, body: b.buf.toString('base64'), isBase64Encoded: true };
      }
      if (event.httpMethod === 'DELETE') {
        const id = idParam(event); const row = ownerOr404(await r.getReceipt(user.id, id));
        if (row.image_blob_key) await blobs().delete(row.image_blob_key).catch(() => {});
        await r.setReceiptImage(user.id, id, null); return json(200, { receiptId: id, imageDeleted: !!row.image_blob_key });
      }
      methodNotAllowed();
    },

    // GET /api/account-export -> everything the account holds, as JSON (health data included, in its own section)
    async accountExport(event, context) {
      const user = requireUser(context); limit(user, event, 10); if (event.httpMethod !== 'GET') methodNotAllowed();
      const r = repo(); await r.ensureUser(user); const all = await r.exportAll(user.id);
      const health = { health_profiles: all.health_profiles, health_checkins: all.health_checkins }; delete all.health_profiles; delete all.health_checkins;
      return json(200, { format: 'plenty-account-export', version: 1, exportedAt: new Date().toISOString(), user: { id: user.id, email: user.email }, data: all, health, receiptImages: (all.receipts || []).filter(x => x.image_blob_key).map(x => ({ receiptId: x.id, mime: x.image_mime, size: x.image_size, download: `/api/receipt-image?id=${encodeURIComponent(x.id)}` })) }, { 'Content-Disposition': 'attachment; filename="plenty-account-export.json"' });
    },

    // DELETE /api/health-data -> health profile and check-ins only ; DELETE /api/health-data?what=prices -> price history
    async healthData(event, context) {
      const user = requireUser(context); limit(user, event, 10); if (event.httpMethod !== 'DELETE') methodNotAllowed();
      const r = repo(); await r.ensureUser(user); const what = (event.queryStringParameters || {}).what || 'health';
      if (what === 'prices') { const n = await r.deletePriceHistory(user.id); return json(200, { deleted: 'prices', count: n }); }
      await r.deleteHealth(user.id); return json(200, { deleted: 'health' });
    },

    // DELETE /api/account-delete {confirm:"DELETE"} -> database rows, receipt blobs, then the Identity user
    async accountDelete(event, context) {
      const user = requireUser(context); limit(user, event, 5); if (event.httpMethod !== 'DELETE' && event.httpMethod !== 'POST') methodNotAllowed();
      const body = parseJsonBody(event); if (body.confirm !== 'DELETE') throw new HttpError(400, 'confirm_required', 'Send {"confirm":"DELETE"} to delete the account.');
      const r = repo(); const keys = await r.blobKeys(user.id);
      const b = blobs(); let blobsDeleted = 0; for (const k of keys) { await b.delete(k).catch(() => {}); blobsDeleted++; }
      for (const k of await b.listPrefix(`receipts/${user.id}/`).catch(() => [])) { await b.delete(k).catch(() => {}); blobsDeleted++; }
      await r.deleteAll(user.id);
      let identityDeleted = false; const admin = identityAdmin(context);
      if (admin && fetchImpl) { try { const res = await fetchImpl(`${admin.url}/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${admin.token}` } }); identityDeleted = res.ok; } catch (e) { identityDeleted = false; } }
      return json(200, { deleted: true, blobsDeleted, identityDeleted, note: identityDeleted ? 'Your account and all its data were deleted.' : 'All your data was deleted. The login itself could not be removed automatically; it holds no data and can be removed by the site owner.' });
    },
  };
}
function publicReceipt(r) { return { id: r.id, localTripId: r.local_trip_id, weekStart: r.week_start, store: r.store, date: r.receipt_date, total: r.total, tax: r.tax, discount: r.discount, currency: r.currency, note: r.note, method: r.method, image: r.image_blob_key ? { mime: r.image_mime, size: r.image_size } : null, processingStatus: r.processing_status || 'not_connected', createdAt: r.created_at }; }

// Production wiring (lazy so tests never touch the SDKs).
let prodRepo = null, prodBlobs = null;
function productionDeps() {
  const { SqlRepo } = require('./repo'); const { NetlifyBlobs } = require('./blobs');
  return { repo: () => (prodRepo = prodRepo || SqlRepo.fromEnv()), blobs: () => (prodBlobs = prodBlobs || new NetlifyBlobs()) };
}

module.exports = { createHandlers, productionDeps, publicReceipt };
