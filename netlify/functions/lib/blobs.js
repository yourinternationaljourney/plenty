// Receipt-image storage. Keys are non-guessable and namespaced per user; nothing is public and listing is only done
// server-side for account deletion. The relational row keeps only the key.
'use strict';
const crypto = require('crypto');

const STORE_NAME = 'plenty-receipts';
const newKey = userId => `receipts/${userId}/${crypto.randomUUID()}-${crypto.randomBytes(8).toString('hex')}`;

class MemoryBlobs {
  constructor() { this.m = new Map(); }
  async put(key, buf, meta) { this.m.set(key, { buf: Buffer.from(buf), meta: meta || {} }); }
  async get(key) { const r = this.m.get(key); return r ? { buf: r.buf, meta: r.meta } : null; }
  async delete(key) { this.m.delete(key); }
  async listPrefix(prefix) { return [...this.m.keys()].filter(k => k.startsWith(prefix)); }
}

class NetlifyBlobs {
  constructor() { const { getStore } = require('@netlify/blobs'); this.store = getStore({ name: STORE_NAME, consistency: 'strong' }); }
  async put(key, buf, meta) { await this.store.set(key, buf, { metadata: meta || {} }); }
  async get(key) { const r = await this.store.getWithMetadata(key, { type: 'arrayBuffer' }); return r && r.data ? { buf: Buffer.from(r.data), meta: r.metadata || {} } : null; }
  async delete(key) { await this.store.delete(key); }
  async listPrefix(prefix) { const { blobs } = await this.store.list({ prefix }); return (blobs || []).map(b => b.key); }
}

module.exports = { MemoryBlobs, NetlifyBlobs, newKey, STORE_NAME };
