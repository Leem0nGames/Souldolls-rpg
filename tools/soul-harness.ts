/**
 * SoulDoll spritesheet harness
 * ---------------------------------------------------------------------------
 * The artwork folder is dynamic: new sheets can be dropped in at any time.
 * This harness is the single entry point that keeps everything consistent.
 *
 *   npm run soul:harness
 *     1. walks the folder and finds every sheet (jpg or webp)
 *     2. bakes the jpg into a webp with an alpha mask (when needed)
 *     3. renames the sheets to the <speciesId>_<tier>.webp pattern, one
 *        folder per species, and updates the manifest
 *     4. regenerates src/game/data/souldollSheets.ts from the manifest
 *     5. reports what is new, what is unassigned and what data is missing
 *
 *   npm run soul:harness -- --assign <file> <speciesId>
 *     Moves a sheet to its species folder with the canonical name and
 *     registers it in the manifest.
 *
 * The manifest (public/assets/souldolls/manifest.json) is the source of truth
 * of the artwork mapping; the species data lives in src/game/data/souldolls.ts.
 */
import sharp from 'sharp';
import { readdir, readFile, writeFile, mkdir, stat, rename, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import {
  SOULDOLL_BACKGROUND,
  GREEN_SCREEN,
  detectBackgroundColor,
  hasTransparentBackground,
  removeBackground,
  removeChromaKey,
  rgbToHex,
} from '../src/game/graphics/BackgroundKey';
import { SOULDOLL_SPECIES } from '../src/game/data/souldolls';

const DIR = 'public/assets/souldolls';
const MANIFEST = `${DIR}/manifest.json`;
const PREVIEW_DIR = '.harness/preview';
const GENERATED = 'src/game/data/souldollSheets.ts';

interface SheetEntry {
  /** Path inside /assets/souldolls, with the extension. */
  file: string;
  /** Species that owns this sheet. */
  species?: string;
  /** Evolution stage of the species. */
  tier?: number;
  /** Display name of the species. */
  name?: string;
  /** Free note for the agent. */
  note?: string;
}

interface Manifest {
  sheets: SheetEntry[];
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

async function readManifest(): Promise<Manifest> {
  if (!existsSync(MANIFEST)) return { sheets: [] };
  const raw = await readFile(MANIFEST, 'utf8');
  return JSON.parse(raw) as Manifest;
}

async function writeManifest(manifest: Manifest): Promise<void> {
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------

/** Every file of the folder, relative to it. */
async function walk(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

/** Canonical name of a sheet: <speciesId>_<tier>.webp inside its folder. */
function canonicalPath(speciesId: string, tier: number): string {
  return `${speciesId}/${speciesId}_${tier}.webp`;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

interface SheetInfo {
  file: string;
  width: number;
  height: number;
  background: string;
  twoViews: boolean;
  hasMask: boolean;
  chroma: boolean;
  webpBytes: number;
  jpgBytes: number;
}

/** True when the border of the sheet is a green screen. */
function isGreenScreen(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  ring = 4
): boolean {
  let green = 0;
  let total = 0;
  const check = (x: number, y: number) => {
    const pi = (y * width + x) * 4;
    const r = data[pi];
    const g = data[pi + 1];
    const b = data[pi + 2];
    total++;
    if (g >= GREEN_SCREEN.minimum && g > Math.max(r, b) * GREEN_SCREEN.ratio) green++;
  };
  for (let x = 0; x < width; x += ring) {
    check(x, 0);
    check(x, height - 1);
  }
  for (let y = 0; y < height; y += ring) {
    check(0, y);
    check(width - 1, y);
  }
  return total > 0 && green / total > 0.5;
}

/** Analyses a sheet given its path relative to the spritesheet folder. */
async function analyse(relative: string): Promise<SheetInfo | null> {
  const path = `${DIR}/${relative}`;
  if (!existsSync(path)) return null;
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const background = detectBackgroundColor(rgba, info.width, info.height);
  const masked = hasTransparentBackground(rgba, info.width, info.height);
  const chroma = isGreenScreen(rgba, info.width, info.height);

  return {
    file: relative,
    width: info.width,
    height: info.height,
    background: rgbToHex(background),
    twoViews: info.width >= info.height,
    hasMask: masked,
    chroma,
    webpBytes: 0,
    jpgBytes: 0,
  };
}

/** Writes a preview of the sheet so the agent can look at it. */
async function writePreview(info: SheetInfo): Promise<void> {
  await mkdir(PREVIEW_DIR, { recursive: true });
  const name = info.file.replace(/[\\/]/g, '_').replace(/\.[^.]+$/, '');
  const image = await sharp(`${DIR}/${info.file}`).resize({ width: 512, fit: 'inside' }).png().toBuffer();
  await writeFile(resolve(PREVIEW_DIR, `${name}.png`), image);
}

// ---------------------------------------------------------------------------
// Baking
// ---------------------------------------------------------------------------

async function bakeSheet(source: string, target: string): Promise<{ background: string; bytes: number }> {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const detected = detectBackgroundColor(rgba, info.width, info.height);

  if (!hasTransparentBackground(rgba, info.width, info.height)) {
    if (isGreenScreen(rgba, info.width, info.height)) {
      removeChromaKey(rgba, info.width, info.height, GREEN_SCREEN);
    } else {
      removeBackground(rgba, info.width, info.height, {
        color: detected,
        tolerance: SOULDOLL_BACKGROUND.tolerance,
        minHoleArea: SOULDOLL_BACKGROUND.minHoleArea,
      });
    }
  }

  await mkdir(dirname(target), { recursive: true });
  await sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(target);

  return { background: rgbToHex(detected), bytes: (await stat(target)).size };
}

// ---------------------------------------------------------------------------
// Generated mapping
// ---------------------------------------------------------------------------

async function generateMapping(manifest: Manifest): Promise<void> {
  const lines = manifest.sheets.map((sheet) => {
    const parts = [`file: '${sheet.file}'`];
    if (sheet.species) parts.push(`species: '${sheet.species}'`);
    if (sheet.tier !== undefined) parts.push(`tier: ${sheet.tier}`);
    if (sheet.name) parts.push(`name: '${sheet.name.replace(/'/g, "\\'")}'`);
    if (sheet.note) parts.push(`note: '${sheet.note.replace(/'/g, "\\'")}'`);
    return `  { ${parts.join(', ')} },`;
  });

  const content = `/**
 * GENERATED by tools/soul-harness.ts - do not edit by hand.
 *
 * Maps every character sheet to the species that owns it. Species without
 * their own sheet share the generic ones, chosen with a stable hash.
 */
export interface SoulDollSheet {
  /** Path inside /assets/souldolls, with the extension. */
  file: string;
  /** Species that owns this sheet. */
  species?: string;
  /** Evolution stage of the species. */
  tier?: number;
  /** Display name of the species. */
  name?: string;
  /** Free note. */
  note?: string;
}

export const SOULDOLL_SHEETS: SoulDollSheet[] = [
${lines.join('\n')}
];

/** Sheets shared by the species that do not have artwork of their own. */
export const GENERIC_SHEETS: SoulDollSheet[] = SOULDOLL_SHEETS.filter((s) => !s.species);
`;

  await writeFile(GENERATED, content);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function templateFor(speciesId: string): string {
  return `  ${speciesId}: {
    id: '${speciesId}',
    name: 'Nombre',
    stage: 1,
    types: ['Fire'],
    baseStats: { hp: 55, atk: 62, def: 50, spAtk: 65, spDef: 55, spd: 58 },
    description: 'Descripcion en espanol.',
    catchRate: 190,
    baseExpReward: 64,
    evolution: { level: 16, evolvesInto: 'siguiente_tier' },
    learnset: [
      { level: 1, moveId: 'ember' }
    ],
    colorTheme: { primary: '#f97316', secondary: '#ef4444', glow: '#fbbf24' }
  },`;
}

async function report(manifest: Manifest, infos: SheetInfo[]): Promise<void> {
  const speciesSource = await readFile('src/game/data/souldolls.ts', 'utf8');

  console.log('\n=== Hojas ===');
  for (const info of infos) {
    const entry = manifest.sheets.find(s => s.file === info.file);
    const owner = entry ? (entry.species ?? 'generica') : 'NUEVA (sin registrar)';
    const views = info.twoViews ? '2 vistas' : '1 vista';
    const mask = info.chroma ? 'cromakey verde' : info.hasMask ? 'con alfa' : 'pintada';
    console.log(
      `  ${info.file}\n` +
        `    ${info.width}x${info.height} · ${views} · fondo ${info.background} · ${mask} · ${owner}`
    );
  }

  const onDisk = infos.map(i => i.file);
  const unassigned = infos.filter(info => !manifest.sheets.some(s => s.file === info.file));
  const missing = manifest.sheets.filter(s => !onDisk.includes(s.file));

  if (unassigned.length > 0) {
    console.log('\n=== Hojas nuevas sin asignar ===');
    for (const info of unassigned) {
      console.log(`  ${info.file}`);
      console.log(
        `    Asignar:  npm run soul:harness -- --assign ${info.file} <speciesId>\n` +
          `    Previsualizacion: ${PREVIEW_DIR}/`
      );
    }
  }

  if (missing.length > 0) {
    console.log('\n=== El manifiesto espera hojas que no estan ===');
    for (const sheet of missing) console.log(`  ${sheet.file}`);
  }

  // One species must not have two sheets: the first one of the manifest wins.
  const seen = new Set<string>();
  const duplicated: string[] = [];
  for (const sheet of manifest.sheets) {
    if (!sheet.species) continue;
    if (seen.has(sheet.species)) duplicated.push(sheet.species);
    else seen.add(sheet.species);
  }
  if (duplicated.length > 0) {
    console.log('\n=== AVISO: especies con mas de una hoja ===');
    for (const id of duplicated) {
      const files = manifest.sheets.filter(s => s.species === id).map(s => s.file);
      console.log(`  ${id}: ${files.join(', ')} -> se usa la primera`);
    }
  }

  const assigned = manifest.sheets.filter(s => s.species).map(s => s.species!);
  const withData = assigned.filter(id => speciesSource.includes(`${id}: {`));
  const withoutData = assigned.filter(id => !speciesSource.includes(`${id}: {`));
  if (withoutData.length > 0) {
    console.log('\n=== Especies con hoja pero sin datos en souldolls.ts ===');
    for (const id of withoutData) {
      console.log(`  ${id}\n${templateFor(id)}`);
    }
  }

  console.log('\n=== Estado ===');
  console.log(`  especies con hoja propia: ${assigned.length} (${withData.join(', ') || 'ninguna'})`);
  console.log(`  hojas genericas: ${manifest.sheets.filter(s => !s.species).length}`);
  console.log(
    `  especies todavia genericas: ${
      Object.keys(SOULDOLL_SPECIES).filter(id => !assigned.includes(id)).length
    } de ${Object.keys(SOULDOLL_SPECIES).length}`
  );
}

// ---------------------------------------------------------------------------
// Assign
// ---------------------------------------------------------------------------

async function assign(manifest: Manifest, file: string, speciesId: string): Promise<void> {
  const species = SOULDOLL_SPECIES[speciesId];
  if (!species) {
    console.error(`La especie ${speciesId} no existe en souldolls.ts.`);
    process.exit(1);
  }

  const tier = species.stage;
  const target = canonicalPath(speciesId, tier);
  const source = file.includes('.') ? file : `${file}.webp`;
  const sourcePath = source.startsWith(DIR) ? source : `${DIR}/${source}`;

  if (!existsSync(sourcePath)) {
    console.error(`No encuentro la hoja ${sourcePath}`);
    process.exit(1);
  }

  // Bake the jpg if the sheet is still the original.
  let baked = sourcePath;
  if (/\.jpe?g$/i.test(sourcePath)) {
    const tmp = sourcePath.replace(/\.jpe?g$/i, '.webp');
    const result = await bakeSheet(sourcePath, tmp);
    console.log(`Horneada ${sourcePath} (fondo ${result.background}, ${(result.bytes / 1024).toFixed(0)} KB)`);
    baked = tmp;
  }

  // Move it to the canonical path of the species.
  const targetPath = `${DIR}/${target}`;
  await mkdir(dirname(targetPath), { recursive: true });
  if (baked !== targetPath) {
    if (existsSync(targetPath)) await unlink(targetPath);
    await rename(baked, targetPath);
  }

  const entry = manifest.sheets.find(s => s.file === source || s.file === baked);
  if (entry) {
    entry.file = target;
    entry.species = speciesId;
    entry.tier = tier;
    entry.name = species.name;
  } else {
    manifest.sheets.push({ file: target, species: speciesId, tier, name: species.name });
  }

  await writeManifest(manifest);
  console.log(`Hoja asignada: ${target}  (${species.name}, tier ${tier})`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  const args = process.argv.slice(2);
  const assignIndex = args.indexOf('--assign');
  const manifest = await readManifest();

  if (assignIndex >= 0) {
    const file = args[assignIndex + 1];
    const species = args[assignIndex + 2];
    if (!file || !species) {
      console.error('Uso: npm run soul:harness -- --assign <hoja> <speciesId>');
      process.exit(1);
    }
    await assign(manifest, file, species);
  }

  // Any new file in the folder is registered automatically (unassigned).
  const files = await walk(DIR);
  const jpgs = files.filter(f => /\.jpe?g$/i.test(f));
  const webps = files.filter(f => /\.webp$/i.test(f));

  let dirty = false;
  for (const file of [...jpgs, ...webps]) {
    if (file === 'manifest.json') continue;
    if (manifest.sheets.some(s => s.file === file)) continue;
    manifest.sheets.push({ file });
    dirty = true;
    console.log(`Hoja nueva detectada: ${file} (sin asignar).`);
  }
  if (dirty) await writeManifest(manifest);

  // Bake the jpg that has no webp yet.
  for (const jpg of jpgs) {
    const target = jpg.replace(/\.jpe?g$/i, '.webp');
    if (existsSync(`${DIR}/${target}`)) continue;
    const result = await bakeSheet(`${DIR}/${jpg}`, `${DIR}/${target}`);
    console.log(`Horneada ${jpg} (fondo ${result.background}, ${(result.bytes / 1024).toFixed(0)} KB)`);
  }

  // Analyse every sheet.
  const infos: SheetInfo[] = [];
  for (const sheet of manifest.sheets) {
    const path = `${DIR}/${sheet.file}`;
    if (!existsSync(path)) continue;
    const info = await analyse(sheet.file);
    if (!info) continue;
    info.webpBytes = (await stat(path)).size;
    const jpg = path.replace(/\.webp$/i, '.jpg');
    info.jpgBytes = existsSync(jpg) ? (await stat(jpg)).size : 0;
    infos.push(info);
    await writePreview(info);
  }

  await generateMapping(manifest);
  await report(manifest, infos);

  console.log('\nSiguiente paso: revisa las previsualizaciones en ' + PREVIEW_DIR + '/');
  console.log('Las especies sin datos se listan arriba, con una plantilla lista para pegar.\n');
})();
