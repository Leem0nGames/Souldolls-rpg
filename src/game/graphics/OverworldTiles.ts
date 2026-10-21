/**
 * Overworld tilemap
 * ---------------------------------------------------------------------------
 * The overworld ground is baked from the Gen 2 inspired tileset
 * (nikouu/Pokemon-gen-2-style-tilemap, MIT licence) into a single canvas
 * that is used as the texture of one plane: one draw call for the whole map.
 *
 * The tiles are 8x8 pixels and the world is 60x60 units, so one tile covers
 * 1.5 world units (the same pixel density as the rest of the art, which is
 * ~10.7 px per world unit).
 *
 * The layout keeps the coordinates used by the ECS: the wild grass patches,
 * the sanctuary, the crossroads and the plaza stay exactly where the game
 * logic expects them.
 */
import * as THREE from 'three';

/** Source size of a tile in the tileset (Game Boy tiles are 8x8). */
const TILE_PX = 8;
/** Pixel scale used when the map is baked. */
const SCALE = 2;
/** World units covered by one tile. */
export const TILE_UNITS = 1.5;
/** Map size in tiles (40 * 1.5 = 60 world units, the size of the terrain). */
export const MAP_TILES = 40;
/** Tiles of void framing the playable area. */
const BORDER_TILES = 2;

const TILE_BASE = `${import.meta.env?.BASE_URL ?? '/'}tilesets/overworld`.replace('//tilesets', '/tilesets');

export type TileKind = 'void' | 'grass' | 'tallgrass' | 'path' | 'gravel';

const TILE_FILES: Record<TileKind, string> = {
  void: 'Void.png',
  grass: 'Grass-flat.png',
  tallgrass: 'Grass-tall.png',
  path: 'Path.png',
  gravel: 'Path-Gravel.png',
};

/** Patches of spirit grass where wild SoulDolls appear. */
const WILD_ZONES = [
  { minX: -16, maxX: -6, minZ: -3, maxZ: 7 },
  { minX: 6, maxX: 16, minZ: -3, maxZ: 7 },
];
/** Radius of the sanctuary plaza. */
const PLAZA_RADIUS = 5.5;
/** Half width of the crossroads. */
const PATH_HALF_WIDTH = 1.75;

/** Places that must stay clear (shrine, tamers, spawn). */
const CLEAR_POINTS = [
  { x: 0, z: -4, r: 3.4 },
  { x: -3.5, z: -8, r: 3.4 },
  { x: 7.5, z: -7, r: 3.4 },
  { x: 0, z: 2.5, r: 2.2 },
];

type DecorationKind = 'tree-short' | 'tree-tall' | 'flower-a' | 'flower-b' | 'sign';

interface Decoration {
  kind: DecorationKind;
  /** Tile coordinates (top left of the sprite). */
  col: number;
  row: number;
}

/** Tiles occupied by a tree, the player cannot walk through them. */
const BLOCKED = new Set<string>();

const DECOR_FILES: Record<DecorationKind, string> = {
  'tree-short': 'construct-Tree-short.png',
  'tree-tall': 'construct-Tree-talle.png',
  'flower-a': 'Flower-johto-00.png',
  'flower-b': 'Flower-johto-01.png',
  sign: 'Sign-metal-00.png',
};

/** Size in tiles of every decoration. */
const DECOR_SIZE: Record<DecorationKind, [number, number]> = {
  'tree-short': [2, 2],
  'tree-tall': [2, 4],
  'flower-a': [1, 1],
  'flower-b': [1, 1],
  sign: [1, 1],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic RNG so the map is always the same. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const tileCenter = (index: number): number => (index - MAP_TILES / 2 + 0.5) * TILE_UNITS;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar el tile: ${url}`));
    img.src = url;
  });
}

/** Kind of tile at the given tile coordinates. */
function kindAt(col: number, row: number): TileKind {
  if (
    col < BORDER_TILES ||
    row < BORDER_TILES ||
    col >= MAP_TILES - BORDER_TILES ||
    row >= MAP_TILES - BORDER_TILES
  ) {
    return 'void';
  }

  const wx = tileCenter(col);
  const wz = tileCenter(row);

  for (const zone of WILD_ZONES) {
    if (wx >= zone.minX && wx <= zone.maxX && wz >= zone.minZ && wz <= zone.maxZ) {
      return 'tallgrass';
    }
  }

  if (Math.hypot(wx, wz) <= PLAZA_RADIUS) return 'gravel';
  if (Math.abs(wx) <= PATH_HALF_WIDTH || Math.abs(wz) <= PATH_HALF_WIDTH) return 'path';

  return 'grass';
}

/**
 * Copies a tile keeping only the pixels selected by the mask, so a border can
 * be dithered over the neighbour tile (the classic Pokemon grass/path edge).
 */
function maskedTile(
  img: HTMLImageElement,
  size: number,
  mask: (x: number, y: number) => boolean
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const source = document.createElement('canvas');
  source.width = TILE_PX;
  source.height = TILE_PX;
  const sctx = source.getContext('2d');
  if (!sctx) return canvas;
  sctx.drawImage(img, 0, 0, TILE_PX, TILE_PX);

  const data = sctx.getImageData(0, 0, TILE_PX, TILE_PX);
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      if (!mask(x, y)) data.data[(y * TILE_PX + x) * 4 + 3] = 0;
    }
  }
  sctx.putImageData(data, 0, 0);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, TILE_PX, TILE_PX, 0, 0, size, size);
  return canvas;
}

// ---------------------------------------------------------------------------
// Map generation
// ---------------------------------------------------------------------------

/** The map is deterministic, so it is computed once and shared. */
const GRID = buildTileGrid();
const DECORATIONS = buildDecorations(GRID);

/** True when a world position is inside a tree. */
export function isBlocked(worldX: number, worldZ: number): boolean {
  const col = Math.floor(worldX / TILE_UNITS + MAP_TILES / 2);
  const row = Math.floor(worldZ / TILE_UNITS + MAP_TILES / 2);
  return BLOCKED.has(`${col},${row}`);
}

function buildTileGrid(): TileKind[][] {
  const grid: TileKind[][] = [];
  for (let row = 0; row < MAP_TILES; row++) {
    const line: TileKind[] = [];
    for (let col = 0; col < MAP_TILES; col++) line.push(kindAt(col, row));
    grid.push(line);
  }
  return grid;
}

function buildDecorations(grid: TileKind[][]): Decoration[] {
  const random = makeRandom(0x5eed1234);
  const decorations: Decoration[] = [];
  const taken = new Set<string>();
  const key = (col: number, row: number) => `${col},${row}`;

  const isFree = (col: number, row: number, width: number, height: number) => {
    for (let c = col; c < col + width; c++) {
      for (let r = row; r < row + height; r++) {
        if (c < 0 || r < 0 || c >= MAP_TILES || r >= MAP_TILES) return false;
        if (grid[r][c] !== 'grass') return false;
        if (taken.has(key(c, r))) return false;
      }
    }
    // Keep the important places free.
    const cx = tileCenter(col + (width - 1) / 2);
    const cz = tileCenter(row + (height - 1) / 2);
    for (const clear of CLEAR_POINTS) {
      if (Math.hypot(cx - clear.x, cz - clear.z) < clear.r) return false;
    }
    return true;
  };

  const place = (kind: DecorationKind, width: number, height: number) => {
    for (let attempt = 0; attempt < 400; attempt++) {
      const col = BORDER_TILES + Math.floor(random() * (MAP_TILES - BORDER_TILES * 2 - width));
      const row = BORDER_TILES + Math.floor(random() * (MAP_TILES - BORDER_TILES * 2 - height));
      if (!isFree(col, row, width, height)) continue;
      for (let c = col; c < col + width; c++) {
        for (let r = row; r < row + height; r++) taken.add(key(c, r));
      }
      if (kind === 'tree-short' || kind === 'tree-tall') {
        for (let c = col; c < col + width; c++) {
          for (let r = row; r < row + height; r++) BLOCKED.add(key(c, r));
        }
      }
      decorations.push({ kind, col, row });
      return true;
    }
    return false;
  };

  // A forest belt on the north side and around the edges.
  for (let i = 0; i < 22; i++) place('tree-tall', 2, 4);
  for (let i = 0; i < 28; i++) place('tree-short', 2, 2);
  for (let i = 0; i < 30; i++) place(random() < 0.5 ? 'flower-a' : 'flower-b', 1, 1);

  // Signposts next to the crossroads.
  const signSpots: [number, number][] = [
    [MAP_TILES / 2 + 2, MAP_TILES / 2 - 3],
    [MAP_TILES / 2 - 3, MAP_TILES / 2 + 2],
    [MAP_TILES / 2 - 12, MAP_TILES / 2 + 2],
    [MAP_TILES / 2 + 11, MAP_TILES / 2 - 3],
  ];
  for (const [col, row] of signSpots) {
    if (col < 0 || row < 0 || col >= MAP_TILES || row >= MAP_TILES) continue;
    if (grid[row][col] !== 'grass' || taken.has(key(col, row))) continue;
    taken.add(key(col, row));
    decorations.push({ kind: 'sign', col, row });
  }

  return decorations;
}

// ---------------------------------------------------------------------------
// Baking
// ---------------------------------------------------------------------------

export interface OverworldMap {
  /** Texture of the whole baked map. */
  texture: THREE.CanvasTexture;
  /** Size of the map in world units. */
  worldSize: number;
}

/**
 * Builds the whole overworld: loads the tiles, bakes the ground with its
 * transitions and the decorations into a single texture.
 */
export async function buildOverworldMap(): Promise<OverworldMap> {
  const grid = GRID;
  const decorations = DECORATIONS;

  const tileImages: Partial<Record<TileKind, HTMLImageElement>> = {};
  await Promise.all(
    (Object.keys(TILE_FILES) as TileKind[]).map(async (kind) => {
      tileImages[kind] = await loadImage(`${TILE_BASE}/${TILE_FILES[kind]}`);
    })
  );

  const decorImages: Partial<Record<DecorationKind, HTMLImageElement>> = {};
  await Promise.all(
    (Object.keys(DECOR_FILES) as DecorationKind[]).map(async (kind) => {
      decorImages[kind] = await loadImage(`${TILE_BASE}/${DECOR_FILES[kind]}`);
    })
  );

  const px = TILE_PX * SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = MAP_TILES * px;
  canvas.height = MAP_TILES * px;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el contexto 2D del mapa');
  ctx.imageSmoothingEnabled = false;

  // 1. Base layer.
  for (let row = 0; row < MAP_TILES; row++) {
    for (let col = 0; col < MAP_TILES; col++) {
      const img = tileImages[grid[row][col]];
      if (img) ctx.drawImage(img, 0, 0, TILE_PX, TILE_PX, col * px, row * px, px, px);
    }
  }

  // 2. Transitions: the neighbour "eats" into the tile with a 50% dither.
  const BAND = 2;
  const neighbours: { dc: number; dr: number; edge: 'n' | 's' | 'e' | 'w' }[] = [
    { dc: 0, dr: -1, edge: 'n' },
    { dc: 0, dr: 1, edge: 's' },
    { dc: -1, dr: 0, edge: 'w' },
    { dc: 1, dr: 0, edge: 'e' },
  ];

  for (let row = 0; row < MAP_TILES; row++) {
    for (let col = 0; col < MAP_TILES; col++) {
      const current = grid[row][col];
      if (current === 'void') continue;

      for (const n of neighbours) {
        const nCol = col + n.dc;
        const nRow = row + n.dr;
        if (nCol < 0 || nRow < 0 || nCol >= MAP_TILES || nRow >= MAP_TILES) continue;
        const other = grid[nRow][nCol];
        if (other === current || other === 'void') continue;
        // Only grass grows over its neighbours.
        if (other !== 'grass' && other !== 'tallgrass') continue;

        const img = tileImages[other];
        if (!img) continue;

        const mask = (x: number, y: number) => {
          const inBand =
            n.edge === 'n'
              ? y < BAND
              : n.edge === 's'
              ? y >= TILE_PX - BAND
              : n.edge === 'w'
              ? x < BAND
              : x >= TILE_PX - BAND;
          return inBand && (x + y) % 2 === 0;
        };

        const masked = maskedTile(img, px, mask);
        ctx.drawImage(masked, col * px, row * px);
      }
    }
  }

  // 3. Decorations (trees, flowers, signposts).
  for (const decor of decorations) {
    const img = decorImages[decor.kind];
    if (!img) continue;
    const [w, h] = DECOR_SIZE[decor.kind];
    ctx.drawImage(
      img,
      0,
      0,
      w * TILE_PX,
      h * TILE_PX,
      decor.col * px,
      decor.row * px,
      w * px,
      h * px
    );
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 1;

  return { texture, worldSize: MAP_TILES * TILE_UNITS };
}
