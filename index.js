// Plenty recipe service: a small Node server (no dependencies) that keeps API keys server-side.
// Endpoints (all JSON):
//   GET /api/health                       -> {ok, provider, live}
//   GET /api/recipes/search?q=&diet=&intolerances=&type=&maxReadyTime=&number=&offset=
//   GET /api/recipes/featured?number=      -> random / popular recipes from the provider
//   GET /api/recipes/:id                   -> full recipe (ingredients, instructions, nutrition, source)
//   GET /api/import?url=                   -> {jsonld: [...Recipe objects], source: {name, url}} or {error}
// The page normalizes provider payloads itself (normalizeSpoonacular / parseJsonLdRecipe in src/8-discover-engine.js),
// so this service only proxies and trims. Load variables from .env (see .env.example).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// --- tiny .env loader ---
try { for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch (e) { /* no .env */ }
const KEY = process.env.SPOONACULAR_API_KEY || '';
const PROVIDER = (process.env.RECIPE_PROVIDER || 'spoonacular').toLowerCase();
const LIVE = PROVIDER === 'spoonacular' && !!KEY;
const ORIGIN = process.env.PLENTY_ALLOWED_ORIGIN || '*';
const PORT = +process.env.PORT || 8787;
const IMPORT = (process.env.ENABLE_URL_IMPORT || 'true') !== 'false';
const SPOON = 'https://api.spoonacular.com';

function send(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
async function getJSON(url) { const r = await fetch(url, { headers: { 'Accept': 'application/json' } }); const text = await r.text(); let j; try { j = JSON.parse(text); } catch (e) { j = { raw: text }; } if (!r.ok) { const err = new Error(j.message || ('Upstream ' + r.status)); err.status = r.status; throw err; } return j; }
const pick = (q, keys) => { const p = new URLSearchParams(); for (const k of keys) if (q.get(k)) p.set(k, q.get(k)); return p; };

async function search(q) {
  const p = pick(q, ['query', 'diet', 'intolerances', 'type', 'cuisine', 'maxReadyTime', 'includeIngredients', 'excludeIngredients', 'number', 'offset', 'sort']);
  if (q.get('q')) p.set('query', q.get('q'));
  p.set('number', String(Math.min(30, +(p.get('number') || 12))));
  p.set('addRecipeInformation', 'true'); p.set('fillIngredients', 'true'); p.set('instructionsRequired', 'true'); p.set('apiKey', KEY);
  const j = await getJSON(SPOON + '/recipes/complexSearch?' + p.toString());
  return { provider: 'spoonacular', total: j.totalResults || 0, offset: j.offset || 0, results: j.results || [] };
}
async function featured(q) {
  const p = new URLSearchParams({ number: String(Math.min(20, +(q.get('number') || 10))), apiKey: KEY });
  if (q.get('tags')) p.set('include-tags', q.get('tags'));
  const j = await getJSON(SPOON + '/recipes/random?' + p.toString());
  return { provider: 'spoonacular', results: j.recipes || [] };
}
async function details(id) {
  const j = await getJSON(SPOON + '/recipes/' + encodeURIComponent(id) + '/information?includeNutrition=true&apiKey=' + KEY);
  return { provider: 'spoonacular', recipe: j };
}
// URL import: fetch the page and return only Schema.org Recipe JSON-LD blocks. No HTML is stored or returned.
async function importUrl(target) {
  let u; try { u = new URL(target); } catch (e) { return { error: 'That does not look like a web address.' }; }
  if (!/^https?:$/.test(u.protocol)) return { error: 'Only http and https links can be imported.' };
  const r = await fetch(u.toString(), { headers: { 'User-Agent': 'PlentyRecipeImport/1.0 (+personal meal planner)', 'Accept': 'text/html' }, redirect: 'follow' });
  if (!r.ok) return { error: 'The site answered with status ' + r.status + '. It may block automated imports.' };
  const html = (await r.text()).slice(0, 3_000_000);
  const blocks = []; const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html))) { try { blocks.push(JSON.parse(m[1].trim())); } catch (e) { /* skip broken block */ } }
  const flat = []; const walk = o => { if (!o) return; if (Array.isArray(o)) return o.forEach(walk); if (typeof o !== 'object') return; const t = o['@type']; const types = Array.isArray(t) ? t : [t]; if (types.includes('Recipe')) flat.push(o); if (o['@graph']) walk(o['@graph']); if (o.mainEntity) walk(o.mainEntity); };
  blocks.forEach(walk);
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || u.hostname;
  if (!flat.length) return { error: 'No structured recipe data (Schema.org Recipe) was found on that page.', source: { name: u.hostname, url: u.toString(), title } };
  return { jsonld: flat, source: { name: u.hostname.replace(/^www\./, ''), url: u.toString(), title } };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') return send(res, 204, {});
  try {
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, provider: LIVE ? 'spoonacular' : 'none', live: LIVE, importEnabled: IMPORT, attribution: LIVE ? 'Recipe data and images: spoonacular.com. Show the source link on every recipe.' : null });
    if (url.pathname === '/api/import') { if (!IMPORT) return send(res, 403, { error: 'URL import is disabled on this service.' }); return send(res, 200, await importUrl(url.searchParams.get('url') || '')); }
    if (!LIVE) return send(res, 503, { error: 'No live recipe provider is configured. Set SPOONACULAR_API_KEY in .env.', live: false });
    if (url.pathname === '/api/recipes/search') return send(res, 200, await search(url.searchParams));
    if (url.pathname === '/api/recipes/featured') return send(res, 200, await featured(url.searchParams));
    const m = url.pathname.match(/^\/api\/recipes\/([^/]+)$/); if (m) return send(res, 200, await details(m[1]));
    send(res, 404, { error: 'Not found' });
  } catch (e) { send(res, e.status === 402 ? 429 : 502, { error: e.status === 402 ? 'The recipe provider\'s daily quota is used up. Try again tomorrow.' : ('Recipe service error: ' + e.message) }); }
}).listen(PORT, () => console.log('Plenty recipe service on http://localhost:' + PORT + ' provider=' + (LIVE ? 'spoonacular' : 'none (starter recipes only)') + ' import=' + IMPORT));
