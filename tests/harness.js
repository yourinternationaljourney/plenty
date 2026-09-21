// Loads the DOM-free parts into a sandbox for node:test:
// engine (2), discover engine (8), health engine (10), storage (12), onboarding helpers (13), backup (14).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadEngine(opts = {}) {
  const ctx = {
    window: { claude: undefined, addEventListener() {}, matchMedia: () => ({ matches: false }) },
    navigator: { userAgent: 'node', onLine: true },
    location: { protocol: 'file:', reload() {} },
    console,
    writes: [],
    fetch: opts.fetch,
    crypto: globalThis.crypto,
    TextEncoder, TextDecoder, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    Blob: globalThis.Blob, URL,
    AbortController: global.AbortController, setTimeout, clearTimeout,
    URLSearchParams, encodeURIComponent, decodeURIComponent, Math, Date, JSON, Number, String, Array, Object, Set, Map, RegExp, Error, TypeError, parseFloat, parseInt, isNaN, Promise, Uint8Array, ArrayBuffer,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const parts = ['2-engine.js', '8-discover-engine.js', '10-health-engine.js', '12-storage.js', '13-onboarding.js', '14-backup.js'];
  const src = parts.map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n')
    // top-level const/let become context globals so tests can reach them (function declarations already are)
    .replace(/^(const|let) /gm, 'var ')
    // class declarations are lexical too; expose them the same way
    .replace(/^class (\w+)/gm, 'var $1 = class $1');
  // stubs for storage/UI functions the engine parts call into (defined in the UI parts in the real page)
  const stubs = `var db=null;function writeDoc(p,d){writes.push([p,JSON.parse(JSON.stringify(d))]);if(typeof Store!=='undefined'&&Store.backend&&Store.profileId)return Store.set(p,d);return Promise.resolve()}function toast(){}function render(){}function renderNav(){}function closeModal(){}function openModal(){}function loadProfileState(){return Promise.resolve()}var DISCLAIMER='';var fieldCss='';`;
  vm.runInContext(stubs + '\n' + src, ctx, { filename: 'engine.js' });
  ctx.S.ui.weekKey = '2026-09-14';
  ctx.S.settings.weeklyBudget = 70; ctx.S.settings.buffer = 5;
  return ctx;
}
module.exports = { loadEngine };
