/**
 * Bakes the character sheets into WebP with a real alpha channel.
 *
 * The runtime then loads a small WebP that is already keyed: no flood fill,
 * no halo and no pixels eaten from the character.
 *
 * Usage:  npx tsx tools/bake-sprites.ts
 */
import sharp from 'sharp';
import { stat, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  SOULDOLL_BACKGROUND,
  PLAYER_BACKGROUND,
  detectBackgroundColor,
  removeBackground,
  rgbToHex,
} from '../src/game/graphics/BackgroundKey';

const DOLL_DIR = 'public/assets/souldolls';
const PLAYER_SOURCE = 'public/assets/831706773_1792592438332202.jpg';

/** Every sheet of the folder is baked, so new artwork is picked up. */
async function dollSources(): Promise<string[]> {
  if (!existsSync(DOLL_DIR)) return [];
  const files = await readdir(DOLL_DIR);
  return files
    .filter(f => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg'))
    .sort()
    .map(f => `${DOLL_DIR}/${f}`);
}

interface BakeReport {
  source: string;
  output: string;
  background: string;
  bytes: number;
}

async function bake(
  source: string,
  output: string,
  tolerance: number,
  minHoleArea: number
): Promise<BakeReport> {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const detected = detectBackgroundColor(rgba, info.width, info.height);
  const key = { color: detected, tolerance, minHoleArea };
  removeBackground(rgba, info.width, info.height, key);

  await mkdir(resolve(output, '..'), { recursive: true });
  await sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    // Lossy for the colour, but the alpha channel stays exact (alphaQuality
    // 100): the visible pixels are compressed, the mask never is.
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(output);

  const { size } = await stat(output);
  return { source, output, background: rgbToHex(detected), bytes: size };
}

(async () => {
  const reports: BakeReport[] = [];

  for (const source of await dollSources()) {
    if (!existsSync(source)) {
      console.warn(`Falta ${source}, se omite.`);
      continue;
    }
    const output = source.replace(/\.jpg$/, '.webp');
    reports.push(await bake(source, output, SOULDOLL_BACKGROUND.tolerance, SOULDOLL_BACKGROUND.minHoleArea));
  }

  if (existsSync(PLAYER_SOURCE)) {
    reports.push(
      await bake(
        PLAYER_SOURCE,
        PLAYER_SOURCE.replace(/\.jpg$/, '.webp'),
        PLAYER_BACKGROUND.tolerance,
        PLAYER_BACKGROUND.minHoleArea
      )
    );
  }

  console.log('\nHojas cocidas (WebP con alfa):');
  for (const r of reports) {
    console.log(
      `  ${r.output.padEnd(62)} fondo ${r.background}  ${(r.bytes / 1024).toFixed(0)} KB`
    );
  }
})();
