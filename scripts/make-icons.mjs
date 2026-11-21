// Generates simple placeholder icons (blue rounded square with a white "page")
// without any image dependency. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function icon(size) {
  const px = (x, y) => {
    const r = size * 0.2;
    const inRounded = (() => {
      const cx = Math.min(Math.max(x, r), size - 1 - r);
      const cy = Math.min(Math.max(y, r), size - 1 - r);
      return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    })();
    if (!inRounded) return [0, 0, 0, 0];
    const page = x > size * 0.28 && x < size * 0.72 && y > size * 0.2 && y < size * 0.8;
    if (page) {
      const line = Math.floor((y - size * 0.3) / (size * 0.1));
      const onLine = y > size * 0.3 && ((y - size * 0.3) % (size * 0.1)) < Math.max(1, size * 0.04) && line < 5;
      if (onLine && x > size * 0.34 && x < size * 0.66) return [37, 99, 235, 255];
      return [255, 255, 255, 255];
    }
    return [37, 99, 235, 255];
  };
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = px(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
for (const s of [16, 32, 48, 128]) writeFileSync(`public/icons/icon${s}.png`, icon(s));
console.log('icons written');
