// Generates Plenty's original app icons (SVG + PNG) without any dependency: a plum rounded tile,
// a white plate and three ingredient "blobs" echoing the recipe tiles in the app. PNGs are written
// with a minimal encoder (zlib from Node).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PLUM = [0x6A, 0x3F, 0xA0], PLATE = [0xFF, 0xFF, 0xFF], GREEN = [0x5E, 0x8F, 0x5A], ORANGE = [0xD2, 0x85, 0x3A], BERRY = [0x8E, 0x2E, 0x27];

function svg(maskable) {
  const pad = maskable ? 0 : 0; // maskable icons keep content inside the safe zone (80% circle); we draw compactly anyway
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="#6A3FA0"/>
  <circle cx="256" cy="268" r="${maskable ? 150 : 168}" fill="#FFFFFF" fill-opacity="0.96"/>
  <circle cx="256" cy="268" r="${maskable ? 122 : 136}" fill="none" stroke="#6A3FA0" stroke-opacity="0.18" stroke-width="6"/>
  <ellipse cx="222" cy="252" rx="${maskable ? 56 : 62}" ry="${maskable ? 40 : 44}" transform="rotate(-18 222 252)" fill="#5E8F5A"/>
  <ellipse cx="296" cy="286" rx="${maskable ? 48 : 54}" ry="${maskable ? 36 : 40}" transform="rotate(22 296 286)" fill="#D2853A"/>
  <circle cx="262" cy="222" r="${maskable ? 26 : 30}" fill="#8E2E27"/>
  <circle cx="404" cy="116" r="${maskable ? 0 : 22}" fill="#FFFFFF" fill-opacity="0.35"/>
</svg>`;
}

// --- tiny rasteriser for the same geometry ---
function raster(size, maskable) {
  const px = new Uint8Array(size * size * 4);
  const s = size / 512;
  const inRoundRect = (x, y, r) => { const rx = Math.max(0, Math.abs(x - 256) - (256 - r)), ry = Math.max(0, Math.abs(y - 256) - (256 - r)); return rx * rx + ry * ry <= r * r; };
  const inEllipse = (x, y, cx, cy, rx, ry, deg) => { const t = -deg * Math.PI / 180, dx = x - cx, dy = y - cy; const ux = dx * Math.cos(t) - dy * Math.sin(t), uy = dx * Math.sin(t) + dy * Math.cos(t); return (ux * ux) / (rx * rx) + (uy * uy) / (ry * ry) <= 1; };
  const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  const plateR = maskable ? 150 : 168, ringR = maskable ? 122 : 136;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i + 0.5) / s, y = (j + 0.5) / s; let c = null, a = 255;
    if (maskable || inRoundRect(x, y, 112)) c = PLUM; else a = 0;
    if (c && inCircle(x, y, 256, 268, plateR)) c = PLATE;
    if (c && Math.abs(Math.hypot(x - 256, y - 268) - ringR) <= 3) c = [0xE6, 0xDF, 0xF0];
    if (c && inEllipse(x, y, 222, 252, maskable ? 56 : 62, maskable ? 40 : 44, -18)) c = GREEN;
    if (c && inEllipse(x, y, 296, 286, maskable ? 48 : 54, maskable ? 36 : 40, 22)) c = ORANGE;
    if (c && inCircle(x, y, 262, 222, maskable ? 26 : 30)) c = BERRY;
    if (c && !maskable && inCircle(x, y, 404, 116, 22)) c = [0xA0, 0x82, 0xC4];
    const o = (j * size + i) * 4; if (c) { px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = a; }
  }
  return px;
}
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(size, px) {
  const raw = Buffer.alloc((size * 4 + 1) * size); for (let j = 0; j < size; j++) { raw[j * (size * 4 + 1)] = 0; Buffer.from(px.buffer, j * size * 4, size * 4).copy(raw, j * (size * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function makeIcons(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'icon.svg'), svg(false));
  fs.writeFileSync(path.join(outDir, 'icon-192.png'), png(192, raster(192, false)));
  fs.writeFileSync(path.join(outDir, 'icon-512.png'), png(512, raster(512, false)));
  fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), png(512, raster(512, true)));
  fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), png(180, raster(180, true)));
  return ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
}
module.exports = { makeIcons, svg };
if (require.main === module) { console.log(makeIcons(process.argv[2] || path.join(__dirname, '..', 'dist', 'icons')).join('\n')); }
