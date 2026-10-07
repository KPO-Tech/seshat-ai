// Convertit les captures du terminal (PNG, dans seshat/docs/captures) en WebP pour le site :
// une version pleine (1600 px) et une miniature (480 px). Usage : node scripts/optimize-captures.mjs
import sharp from 'sharp';
import { readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(process.env.CAPTURES_DIR ?? resolve(here, '../../../seshat/docs/captures'));
const out = resolve(here, '../public/captures');
mkdirSync(out, { recursive: true });
for (const f of readdirSync(src).filter((f) => f.endsWith('.png'))) {
  const name = 'tui-' + basename(f, '.png');
  const full = await sharp(resolve(src, f)).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile(resolve(out, `${name}.webp`));
  const thumb = await sharp(resolve(src, f)).resize({ width: 480 }).webp({ quality: 78 }).toFile(resolve(out, `${name}-thumb.webp`));
  console.log(name, `${full.width}x${full.height}`, `${(full.size / 1024) | 0} KB`, `thumb ${(thumb.size / 1024) | 0} KB`);
}
