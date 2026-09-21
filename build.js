// Production build.
//   node build.js              -> dist/ (standalone PWA: index.html, 404.html, manifest, sw.js, icons)
//   node build.js --artifact   -> plenty.html (Claude artifact fragment, same parts) for the recoverable Claude version
//   node build.js --check-only -> syntax check only
// Every URL in dist is relative, so the app works from a GitHub Pages subpath (https://user.github.io/repo/).
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { makeIcons } = require('./tools/make-icons');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const parts = fs.readdirSync(SRC).filter(f => /^\d+-.*\.(js|html)$/.test(f)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
const head = parts.filter(f => f.endsWith('.html'));
const scripts = parts.filter(f => f.endsWith('.js'));
if (head.length !== 1) throw new Error('Expected exactly one numbered .html part in src/, found ' + head.length);
if (scripts[scripts.length - 1] !== '99-boot.js') throw new Error('99-boot.js must be the last script part');

const js = scripts.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
const tmp = path.join(os.tmpdir(), 'plenty-build-check.js');
fs.writeFileSync(tmp, js);
execFileSync(process.execPath, ['--check', tmp], { stdio: 'inherit' });
if (process.argv.includes('--check-only')) { console.log('Syntax OK (' + scripts.length + ' script parts)'); process.exit(0); }

const headPart = fs.readFileSync(path.join(SRC, head[0]), 'utf8');
const version = pkg.version + '+' + crypto.createHash('sha256').update(js + headPart).digest('hex').slice(0, 8);
const scriptTag = `<script>\nconst PLENTY_VERSION='${version}';\n${js}\n</script>\n`;

if (process.argv.includes('--artifact')) {
  const html = headPart + '\n' + scriptTag;
  fs.writeFileSync(path.join(ROOT, 'plenty.html'), html);
  console.log('Built plenty.html (artifact fragment, ' + html.length + ' bytes)');
  process.exit(0);
}

// standalone: split the head part into <head> material (title, links) and body material (styles, markup)
const headLinks = []; const bodyLines = [];
for (const line of headPart.split('\n')) { if (/^<title>|^<link /.test(line.trim())) headLinks.push(line); else bodyLines.push(line); }
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#FBF7EF">
<script>try{var t=JSON.parse(localStorage.getItem('plenty:ui')||'{}').theme;document.documentElement.setAttribute('data-theme',t==='dark'||t==='system'?t:'light')}catch(e){document.documentElement.setAttribute('data-theme','light')}</script>
<meta name="description" content="Plenty: weekly grocery, food, household and budget planner that lives on your device.">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Plenty">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="icon" href="./icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">
${headLinks.join('\n')}
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>
</head>
<body>
${bodyLines.join('\n')}
${scriptTag}</body>
</html>
`;
const dist = path.join(ROOT, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), html);
fs.writeFileSync(path.join(dist, '404.html'), html);
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
const icons = makeIcons(path.join(dist, 'icons'));
fs.copyFileSync(path.join(ROOT, 'pwa', 'manifest.webmanifest'), path.join(dist, 'manifest.webmanifest'));
const precache = ['./', './index.html', './manifest.webmanifest', ...icons.map(i => './' + i)];
const sw = fs.readFileSync(path.join(ROOT, 'pwa', 'sw.js'), 'utf8').replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache));
fs.writeFileSync(path.join(dist, 'sw.js'), sw);
fs.writeFileSync(path.join(dist, 'version.json'), JSON.stringify({ version, builtAt: new Date().toISOString() }));

// guard: no personal data or secrets in the bundle
const forbidden = [/simone/i, /dobby/i, /simonevharen/i, /SPOONACULAR_API_KEY\s*=\s*['"][^'"]+/, /sk-[A-Za-z0-9]{20,}/, /sk-ant-/];
for (const re of forbidden) if (re.test(html)) throw new Error('Refusing to build: bundle matches forbidden pattern ' + re);
console.log(`Built dist/ (${version}) from ${parts.length} parts; ${html.length} bytes; precache ${precache.length} files`);
