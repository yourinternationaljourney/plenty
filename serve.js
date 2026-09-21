// Local static server for dist/ that mimics a GitHub Pages subpath: http://localhost:8080/plenty/
// Service workers need http(s); this is the simplest way to test install, offline and updates locally.
const http = require('http');
const fs = require('fs');
const path = require('path');
const DIST = path.join(__dirname, '..', 'dist');
const BASE = '/' + (process.env.PLENTY_BASE || 'plenty') + '/';
const PORT = +process.env.PORT || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.writeHead(302, { Location: BASE }); return res.end(); }
  if (!url.startsWith(BASE)) { res.writeHead(404); return res.end('Not under ' + BASE); }
  let rel = url.slice(BASE.length) || 'index.html'; if (rel.endsWith('/')) rel += 'index.html';
  let file = path.join(DIST, rel);
  if (!fs.existsSync(file)) file = path.join(DIST, '404.html');
  const ext = path.extname(file);
  res.writeHead(fs.existsSync(file) ? 200 : 404, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': BASE });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('Plenty at http://localhost:' + PORT + BASE + '  (build first: npm run build)'));
