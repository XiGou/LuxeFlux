#!/usr/bin/env node
/**
 * Generates placeholder PWA icons (192 & 512) for Luxe Flux.
 * Pure-Node implementation (zlib + hand-rolled PNG encoder) — no native deps.
 * Swap these with real brand assets later; the game auto-serves them
 * from /icons in both the H5 build and the Capacitor native shell.
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

/* ---------------- minimal PNG encoder ---------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // raw scanlines with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------------- icon drawing ---------------- */
function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;

  // gold stops for gradient
  const goldAt = (t) => {
    const stops = [
      [0.0, 0xf0, 0xd6, 0x8a],
      [0.45, 0xd4, 0xaf, 0x37],
      [1.0, 0x9a, 0x7b, 0x2d]
    ];
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        a = stops[i];
        b = stops[i + 1];
        break;
      }
    }
    const span = b[0] - a[0] || 1;
    const f = Math.min(1, Math.max(0, (t - a[0]) / span));
    return [Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f), Math.round(a[3] + (b[3] - a[3]) * f)];
  };

  const set = (x, y, r, g, bl, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = bl;
    px[i + 3] = a;
  };

  const ringW = Math.max(3, Math.round(size * 0.05));
  const inset = Math.round(size * 0.06);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // background
      set(x, y, 0x0a, 0x0a, 0x0a);

      // gold gradient ring (rounded rect)
      const rr = Math.round(size * 0.12);
      const inRect =
        x >= inset - ringW && x < size - inset + ringW && y >= inset - ringW && y < size - inset + ringW;
      const outRect =
        x >= inset && x < size - inset && y >= inset && y < size - inset;
      const cornerDist = (px0, py0) =>
        Math.sqrt((x - px0) ** 2 + (y - py0) ** 2);
      const inCorner =
        (x < inset + rr && y < inset + rr && cornerDist(inset + rr, inset + rr) > rr) ||
        (x >= size - inset - rr && y < inset + rr && cornerDist(size - inset - rr, inset + rr) > rr) ||
        (x < inset + rr && y >= size - inset - rr && cornerDist(inset + rr, size - inset - rr) > rr) ||
        (x >= size - inset - rr && y >= size - inset - rr && cornerDist(size - inset - rr, size - inset - rr) > rr);

      if (inRect && !(outRect && !inCorner)) {
        const t = (x + y) / (2 * size);
        const [r, g, bl] = goldAt(t);
        set(x, y, r, g, bl);
      }

      // center diamond "gem"
      const half = size * 0.22;
      const dx = (x - cx) / half;
      const dy = (y - cy) / half;
      if (Math.abs(dx) + Math.abs(dy) <= 1) {
        const t = 0.3 + 0.7 * (1 - (Math.abs(dx) + Math.abs(dy)));
        const [r, g, bl] = goldAt(t);
        // glossy highlight
        const hi = 1 - Math.max(Math.abs(dx), Math.abs(dy)) * 0.5;
        set(x, y, Math.min(255, Math.round(r * hi)), Math.min(255, Math.round(g * hi)), Math.min(255, Math.round(bl * hi)));
      }
    }
  }
  return px;
}

[192, 512].forEach((s) => {
  const png = encodePNG(s, s, draw(s));
  fs.writeFileSync(path.join(outDir, `icon-${s}.png`), png);
  console.log(`icon-${s}.png ✓ (${png.length} bytes)`);
});
