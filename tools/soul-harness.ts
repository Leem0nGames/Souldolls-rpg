/**
 * SoulDoll spritesheet harness
 * ---------------------------------------------------------------------------
 * The artwork folder is dynamic: JPGs can be dropped in at any time. This
 * harness is the single entry point that keeps everything consistent.
 *
 *   npm run soul:harness
 *     1. analyses every sheet (size, backdrop colour, two view layout)
 *     2. bakes the WebP with the alpha mask when it is missing or outdated
 *     3. regenerates src/game/data/souldollSheets.ts from the manifest
 *     4. reports what is new, what is unassigned and what data is missing
 *
 *   npm run soul:harness -- --assign <fileBase> <speciesId>
 *     Registers a sheet for a species (and redoes the steps above).
 *
 * The manifest (public/assets/souldolls/manifest.json) is the source of truth
 * of the artwork mapping; the species data lives in src/game/data/souldolls.ts.
 */
import sharp from 'sharp';
import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  SOULDOLL_BACKGROUND,
  PLAYER_BACKGROUND,
  detectBackgroundColor,
  hasTransparentBackground,
  removeBackground,
  rgbToHex,
} from '../src/game/graphics/BackgroundKey';

const DIR = 'public/assets/souldolls';
const MANIFEST = `${DIR}/manifest.json`;
const PREVIEW_DIR = '.harness/preview';
const GENERATED = 'src/game/data/souldollSheets.ts';

interface SheetEntry {
  /** File base name (without extension). */
  file: string;
  /** Species that owns this sheet. */
  species?: string;
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
// Analysis
// ---------------------------------------------------------------------------

interface SheetInfo {
  file: string;
  width: number;
  height: number;
  /** The measured backdrop colour. */
  background: string;
  /** True when the sheet shows two views (back on the left, front on the right). */
  twoViews: boolean;
  /** True when the source already carries an alpha mask. */
  hasMask: boolean;
  /** Size of the webp, 0 when it is not baked. */
  webpBytes: number;
  jpgBytes: number;
}

async function analyse(file: string): Promise<SheetInfo | null> {
  const jpg = `${DIR}/${file}.jpg`;
  if (!existsSync(jpg)) return null;

  const { data, info } = await sharp(jpg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const background = detectBackgroundColor(rgba, info.width, info.height);
  const masked = hasTransparentBackground(rgba, info.width, info.height);

  let webpBytes = 0;
  if (existsSync(`${DIR}/${file}.webp`)) {
    webpBytes = (await stat(`${DIR}/${file}.webp`)).size;
  }

  return {
    file,
    width: info.width,
    height: info.height,
    background: rgbToHex(background),
    twoViews: info.width >= info.height,
    hasMask: masked,
    webpBytes,
    jpgBytes: (await stat(jpg)).size,
  };
}

/** Writes a preview of the sheet so the agent can look at it. */
async function writePreview(info: SheetInfo): Promise<void> {
  await mkdir(PREVIEW_DIR, { recursive: true });
  const source = existsSync(`${DIR}/${info.file}.webp`)
    ? `${DIR}/${info.file}.webp`
    : `${DIR}/${info.file}.jpg`;
  const image = await sharp(source).resize({ width: 512, fit: 'inside' }).png().toBuffer();
  await writeFile(resolve(PREVIEW_DIR, `${info.file}.png`), image);
}

// ---------------------------------------------------------------------------
// Baking
// ---------------------------------------------------------------------------

async function bakeSheet(file: string): Promise<{ background: string; bytes: number }> {
  const jpg = `${DIR}/${file}.jpg`;
  const { data, info } = await sharp(jpg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const detected = detectBackgroundColor(rgba, info.width, info.height);

  if (!hasTransparentBackground(rgba, info.width, info.height)) {
    removeBackground(rgba, info.width, info.height, {
      color: detected,
      tolerance: SOULDOLL_BACKGROUND.tolerance,
      minHoleArea: SOULDOLL_BACKGROUND.minHoleArea,
    });
  }

  await sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(`${DIR}/${file}.webp`);

  return { background: rgbToHex(detected), bytes: (await stat(`${DIR}/${file}.webp`)).size };
}

// ---------------------------------------------------------------------------
// Generated mapping
// ---------------------------------------------------------------------------

async function generateMapping(manifest: Manifest): Promise<void> {
  const lines = manifest.sheets.map((sheet) => {
    const species = sheet.species ? `, species: '${sheet.species}'` : '';
    const note = sheet.note ? `, note: '${sheet.note.replace(/'/g, "\\'")}'` : '';
    return `  { file: '${sheet.file}'${species}${note} },`;
  });

  const content = `/**
 * GENERATED by tools/soul-harness.ts - do not edit by hand.
 *
 * Maps every character sheet to the species that owns it. Species without
 * their own sheet share the generic ones, chosen with a stable hash.
 */
export interface SoulDollSheet {
  /** File base name inside /assets/souldolls. */
  file: string;
  /** Species that owns this sheet. */
  species?: string;
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

  console.log('\n=== Hojas de personajes ===');
  for (const info of infos) {
    const entry = manifest.sheets.find(s => s.file === info.file);
    const owner = entry ? (entry.species ?? 'generica') : 'NUEVA (sin registrar)';
    const views = info.twoViews ? '2 vistas' : '1 vista';
    const mask = info.hasMask ? 'con alfa' : 'pintada';
    console.log(
      `  ${info.file}\n` +
        `    ${info.width}x${info.height} · ${views} · fondo ${info.background} · ${mask}\n` +
        `    ${(info.jpgBytes / 1024).toFixed(0)} KB jpg -> ${(info.webpBytes / 1024).toFixed(0)} KB webp · especie: ${owner}`
    );
  }

  // Una hoja "sin asignar" es la que esta en disco pero no en el manifiesto.
  const onDisk = infos.map(i => i.file);
  const unassigned = infos.filter(info => !manifest.sheets.some(s => s.file === info.file));
  const missing = manifest.sheets.filter(s => !onDisk.includes(s.file));
  const generic = manifest.sheets.filter(s => !s.species);

  if (unassigned.length > 0) {
    console.log('\n=== Hojas nuevas sin asignar ===');
    for (const info of unassigned) {
      console.log(`  ${info.file}`);
      console.log(
        `    Asignar:  npm run soul:harness -- --assign ${info.file} <speciesId>\n` +
          `    Previsualizacion: ${PREVIEW_DIR}/${info.file}.png`
      );
    }
  }

  if (missing.length > 0) {
    console.log('\n=== El manifiesto espera hojas que no estan ===');
    for (const sheet of missing) console.log(`  ${sheet.file}`);
  }

  // Una especie no deberia tener dos hojas: la primera del manifiesto gana.
  const seenSpecies = new Set<string>();
  const duplicated: string[] = [];
  for (const sheet of manifest.sheets) {
    if (!sheet.species) continue;
    if (seenSpecies.has(sheet.species)) duplicated.push(sheet.species);
    else seenSpecies.add(sheet.species);
  }
  if (duplicated.length > 0) {
    console.log('\n=== AVISO: especies con mas de una hoja ===');
    for (const id of duplicated) {
      const files = manifest.sheets.filter(s => s.species === id).map(s => s.file);
      console.log(`  ${id}: ${files.join(', ')} -> se usa la primera`);
    }
  }

  const assigned = manifest.sheets.filter(s => s.species).map(s => s.species!);
  const withoutData = assigned.filter(id => !speciesSource.includes(`${id}: {`));
  if (withoutData.length > 0) {
    console.log('\n=== Especies con hoja pero sin datos en souldolls.ts ===');
    for (const id of withoutData) {
      console.log(`  ${id}\n${templateFor(id)}`);
    }
  }

  const withData = assigned.filter(id => speciesSource.includes(`${id}: {`));
  console.log('\n=== Estado ===');
  console.log(`  especies con hoja: ${assigned.length} (${withData.join(', ') || 'ninguna'})`);
  console.log(`  hojas genericas: ${generic.length} (${generic.map(g => g.file).join(', ') || 'ninguna'})`);
  console.log(`  total horneado: ${infos.reduce((sum, i) => sum + i.webpBytes, 0) / 1024 | 0} KB de webp`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  const args = process.argv.slice(2);
  const assignIndex = args.indexOf('--assign');
  if (assignIndex >= 0) {
    const file = args[assignIndex + 1];
    const species = args[assignIndex + 2];
    if (!file || !species) {
      console.error('Uso: npm run soul:harness -- --assign <fileBase> <speciesId>');
      process.exit(1);
    }
    const manifest = await readManifest();
    const entry = manifest.sheets.find(s => s.file === file);
    if (!entry) {
      manifest.sheets.push({ file, species });
    } else {
      entry.species = species;
    }
    await writeManifest(manifest);
    console.log(`Asignada la hoja ${file} a la especie ${species}.`);
  }

  const manifest = await readManifest();

  // Any new JPG in the folder is registered automatically (unassigned) so the
  // dynamic folder never needs manual bookkeeping.
  const onDisk = (await readdir(DIR))
    .filter(f => /\.jpe?g$/i.test(f))
    .map(f => f.replace(/\.jpe?g$/i, ''));
  let dirty = false;
  for (const file of onDisk) {
    if (manifest.sheets.some(s => s.file === file)) continue;
    manifest.sheets.push({ file });
    dirty = true;
    console.log(`Hoja nueva detectada: ${file} (sin asignar).`);
  }
  if (dirty) await writeManifest(manifest);

  // Bake the sheets that are missing or older than their source.
  const infos: SheetInfo[] = [];
  for (const entry of manifest.sheets) {
    const jpg = `${DIR}/${entry.file}.jpg`;
    if (!existsSync(jpg)) continue;
    const webp = `${DIR}/${entry.file}.webp`;
    const needsBake = !existsSync(webp) || (await stat(webp)).mtimeMs < (await stat(jpg)).mtimeMs;
    if (needsBake) {
      const result = await bakeSheet(entry.file);
      console.log(`Horneada ${entry.file} (fondo ${result.background}, ${(result.bytes / 1024).toFixed(0)} KB)`);
    }
    const info = await analyse(entry.file);
    if (info) {
      infos.push(info);
      await writePreview(info);
    }
  }

  await generateMapping(manifest);
  await report(manifest, infos);

  console.log('\nSiguiente paso: revisa las previsualizaciones en ' + PREVIEW_DIR + '/');
  console.log('Las especies sin datos se listan arriba, con una plantilla lista para pegar.\n');
})();
