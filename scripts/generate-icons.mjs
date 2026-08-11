/**
 * Generates the FORGE PWA icons as PNGs.
 *
 * Uses a hand-rolled PNG encoder (zlib is in Node core) so icon generation adds
 * no dependency to the project. Run from the repo root:
 *
 *   npm run icons          # or: node scripts/generate-icons.mjs public/icons
 *
 * Re-run after changing the mark in src/components/brand.tsx — the geometry
 * below mirrors that SVG and the two will otherwise drift apart.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = process.argv[2] ?? "public/icons";
mkdirSync(OUT_DIR, { recursive: true });

// --- palette --------------------------------------------------------------
const BG = [11, 17, 32]; // #0b1120
const PRIMARY = [16, 185, 129]; // #10b981

const blend = (fg, bg, alpha) =>
  fg.map((c, i) => Math.round(bg[i] + alpha * (c - bg[i])));

// The three ascending bars, in the 32x32 space of the SVG mark.
const BARS = [
  { x: 2, y: 19, w: 7, h: 11, alpha: 0.45 },
  { x: 12.5, y: 12, w: 7, h: 18, alpha: 0.75 },
  { x: 23, y: 2, w: 7, h: 28, alpha: 1 },
];
const RADIUS = 1.5;

// --- PNG encoding ---------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** pixels: Buffer of RGB triplets, row-major. */
function encodePng(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter type (0 = none).
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- drawing --------------------------------------------------------------

/** Signed coverage of a rounded rect at a point, sampled for anti-aliasing. */
function insideRoundedRect(px, py, { x, y, w, h }, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;

  // Corner regions: fall back to a circle test.
  const cx = px < x + r ? x + r : px > x + w - r ? x + w - r : px;
  const cy = py < y + r ? y + r : py > y + h - r ? y + h - r : py;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r + 1e-9;
}

/**
 * @param size    output edge length in px
 * @param inset   fraction of the canvas left as padding around the mark.
 *                Maskable icons need a generous inset so Android can crop to
 *                any shape without clipping the logo.
 */
function render(size, inset) {
  const pixels = Buffer.alloc(size * size * 3);

  const content = size * (1 - 2 * inset);
  const offset = size * inset;
  const scale = content / 32;
  const SS = 3; // 3x3 supersampling for smooth edges

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Start from the background and composite each bar's coverage over it.
      let color = [...BG];

      for (const bar of BARS) {
        let hits = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const px = (x + (sx + 0.5) / SS - offset) / scale;
            const py = (y + (sy + 0.5) / SS - offset) / scale;
            if (insideRoundedRect(px, py, bar, RADIUS)) hits++;
          }
        }
        if (hits === 0) continue;

        const coverage = hits / (SS * SS);
        color = blend(blend(PRIMARY, BG, bar.alpha), color, coverage);
      }

      const index = (y * size + x) * 3;
      pixels[index] = color[0];
      pixels[index + 1] = color[1];
      pixels[index + 2] = color[2];
    }
  }

  return encodePng(size, size, pixels);
}

const targets = [
  { name: "icon-192.png", size: 192, inset: 0.14 },
  { name: "icon-512.png", size: 512, inset: 0.14 },
  // ~30% inset keeps the mark inside the maskable safe zone.
  { name: "icon-maskable-512.png", size: 512, inset: 0.26 },
  { name: "apple-touch-icon.png", size: 180, inset: 0.14 },
];

for (const { name, size, inset } of targets) {
  const png = render(size, inset);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`${name.padEnd(26)} ${size}x${size}  ${png.length} bytes`);
}
