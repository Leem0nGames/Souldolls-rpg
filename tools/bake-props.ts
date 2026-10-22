/**
 * Bakes the overworld props (trees, bushes, flowers, rocks) into transparent
 * PNGs that can be used as billboards.
 *
 * The tiles of the tileset come with the grass (or the path) painted behind
 * them, so the backdrop is keyed with the *pattern* of the grass tile: a
 * pixel is background only when it matches the grass exactly at that
 * position, which keeps the light green highlights of the foliage.
 *
 * Usage:  npm run bake:props
 */
import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { removeColorSet, hexToRgb } from '../src/game/graphics/BackgroundKey';

const TILES = 'public/tilesets/overworld';
const OUT = 'public/assets/props';

interface Raw {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

async function readRaw(path: string): Promise<Raw> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  };
}

/** Flat colours of the grass and of the path, used to key the props. */
const GRASS_COLORS = [hexToRgb('#b5ff52'), hexToRgb('#63ce08')];
const PATH_COLORS = [hexToRgb('#deffde')];

/** Bounding box of the pixels that are not transparent. */
function opaqueBox(raw: Raw): { x: number; y: number; w: number; h: number } | null {
  let minX = raw.width;
  let minY = raw.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < raw.height; y++) {
    for (let x = 0; x < raw.width; x++) {
      if (raw.data[(y * raw.width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

async function writeRaw(raw: Raw, path: string): Promise<number> {
  await mkdir(resolve(path, '..'), { recursive: true });
  await sharp(Buffer.from(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength), {
    raw: { width: raw.width, height: raw.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(path);
  const { size } = await import('fs/promises').then(fs => fs.stat(path));
  return size;
}

(async () => {
  const props: string[] = [];

  // --- Trees -------------------------------------------------------------
  for (const [source, out] of [
    ['construct-Tree-short.png', 'tree-short.png'],
    ['construct-Tree-talle.png', 'tree-tall.png'],
  ] as const) {
    const raw = await readRaw(`${TILES}/${source}`);
    removeColorSet(raw.data, raw.width, raw.height, GRASS_COLORS, 10);
    const size = await writeRaw(raw, `${OUT}/${out}`);
    props.push(`${out} (${raw.width}x${raw.height}) ${(size / 1024).toFixed(1)} KB`);
  }

  // --- Bush: the round canopy of the short tree, without the trunk --------
  {
    const raw = await readRaw(`${TILES}/construct-Tree-short.png`);
    removeColorSet(raw.data, raw.width, raw.height, GRASS_COLORS, 10);
    const box = opaqueBox(raw);
    if (box) {
      // The canopy is the upper part of the silhouette; the trunk is dropped.
      const bushH = Math.max(4, Math.round(box.h * 0.72));
      const bushW = Math.max(4, box.w - 2);
      const out: Raw = {
        width: bushW,
        height: bushH,
        data: new Uint8ClampedArray(bushW * bushH * 4),
      };
      for (let y = 0; y < bushH; y++) {
        for (let x = 0; x < bushW; x++) {
          const sx = box.x + 1 + x;
          const sy = box.y + y;
          const si = (sy * raw.width + sx) * 4;
          const di = (y * bushW + x) * 4;
          out.data[di] = raw.data[si];
          out.data[di + 1] = raw.data[si + 1];
          out.data[di + 2] = raw.data[si + 2];
          out.data[di + 3] = raw.data[si + 3];
        }
      }
      const size = await writeRaw(out, `${OUT}/bush.png`);
      props.push(`bush.png (${out.width}x${out.height}) ${(size / 1024).toFixed(1)} KB`);
    }
  }

  // --- Flowers (their backdrop is the light path colour) ------------------
  for (const [source, out] of [
    ['Flower-johto-00.png', 'flower-a.png'],
    ['Flower-johto-01.png', 'flower-b.png'],
  ] as const) {
    const raw = await readRaw(`${TILES}/${source}`);
    removeColorSet(raw.data, raw.width, raw.height, PATH_COLORS, 10);
    const size = await writeRaw(raw, `${OUT}/${out}`);
    props.push(`${out} (${raw.width}x${raw.height}) ${(size / 1024).toFixed(1)} KB`);
  }

  // --- Signpost -------------------------------------------------------------
  {
    const raw = await readRaw(`${TILES}/Sign-metal-00.png`);
    removeColorSet(raw.data, raw.width, raw.height, GRASS_COLORS, 10);
    const size = await writeRaw(raw, `${OUT}/sign.png`);
    props.push(`sign.png (${raw.width}x${raw.height}) ${(size / 1024).toFixed(1)} KB`);
  }

  // --- Grass tuft (the spirit grass accent) --------------------------------
  {
    const raw = await readRaw(`${TILES}/Grass-tall.png`);
    removeColorSet(raw.data, raw.width, raw.height, GRASS_COLORS, 10);
    const size = await writeRaw(raw, `${OUT}/grass-tuft.png`);
    props.push(`grass-tuft.png (${raw.width}x${raw.height}) ${(size / 1024).toFixed(1)} KB`);
  }

  // --- Rock: a rounded boulder cropped from the cliff tiles -----------------
  if (existsSync(`${TILES}/construct-Ridge.png`)) {
    const ridge = await readRaw(`${TILES}/construct-Ridge.png`);
    const size = 16;
    const rock: Raw = {
      width: size,
      height: size,
      data: new Uint8ClampedArray(size * size * 4),
    };
    // A clean chunk of the cliff face.
    const srcX = 8;
    const srcY = 16;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const si = ((srcY + y) * ridge.width + (srcX + x)) * 4;
        const di = (y * size + x) * 4;
        rock.data[di] = ridge.data[si];
        rock.data[di + 1] = ridge.data[si + 1];
        rock.data[di + 2] = ridge.data[si + 2];
        rock.data[di + 3] = 255;
      }
    }
    // Round it off so it reads as a boulder and not a tile.
    const cx = (size - 1) / 2;
    const cy = (size - 1) / 2;
    const radius = size * 0.46;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const di = (y * size + x) * 4;
        if (d > radius) rock.data[di + 3] = 0;
        else if (d > radius - 1.2) rock.data[di + 3] = 170;
      }
    }
    const outSize = await writeRaw(rock, `${OUT}/rock.png`);
    props.push(`rock.png (${size}x${size}) ${(outSize / 1024).toFixed(1)} KB`);
  }

  console.log('Props horneados:');
  for (const p of props) console.log('  ' + p);
})();
