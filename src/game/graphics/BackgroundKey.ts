/**
 * Background keying
 * ---------------------------------------------------------------------------
 * Removes the flat background of the character sheets without eating the
 * character's own dark colours.
 *
 * The old approach tested the luminance of every pixel ("anything darker than
 * 75 is background") and flood filled it from the borders. That removed the
 * black collar, the belt, the boot soles and the dark straps of the
 * characters, because they are just as dark as the backdrop.
 *
 * This module keys on the *exact background colour* instead:
 *   1. the background colour is measured (or configured) once,
 *   2. only pixels within a small colour distance of it are removed,
 *   3. the removal is flood filled from the borders, so dark details inside
 *      the character are never touched,
 *   4. the 1px matte is choked back with the character's colour, which
 *      restores the silhouette width and removes the dark halo,
 *   5. big enclosed holes (the gap between the legs) are cleared too.
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface BackgroundKey {
  /** Exact colour of the backdrop. */
  color: RgbColor;
  /** Maximum colour distance (0 - 441) that still counts as backdrop. */
  tolerance: number;
  /** Enclosed holes bigger than this (in pixels) are cleared as well. */
  minHoleArea: number;
}

/**
 * Backdrop of the SoulDoll sheets (/assets/souldolls/*.jpg).
 * Measured from 9216 border samples: R 18-43, G 19-41, B 25-47.
 */
export const SOULDOLL_BACKGROUND: BackgroundKey = {
  color: { r: 25, g: 25, b: 30 },
  tolerance: 26,
  minHoleArea: 400,
};

/** Backdrop of the player sheet (/assets/831706773_*.jpg). */
export const PLAYER_BACKGROUND: BackgroundKey = {
  color: { r: 255, g: 255, b: 255 },
  tolerance: 34,
  minHoleArea: 300,
};

export function hexToRgb(hex: string): RgbColor {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map(c => c + c)
          .join('')
      : clean;
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

export function rgbToHex(color: RgbColor): string {
  const part = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}

export function colorDistance(a: RgbColor, b: RgbColor): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Measures the backdrop colour from a ring of pixels around the border.
 * The median is used so a stray bright pixel does not shift the result.
 */
export function detectBackgroundColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  ring = 3
): RgbColor {
  const samples: number[] = [];
  const push = (x: number, y: number) => {
    const pi = (y * width + x) * 4;
    samples.push(data[pi], data[pi + 1], data[pi + 2]);
  };

  for (let y = 0; y < height; y++) {
    for (let k = 0; k < ring; k++) {
      if (x0(k, width)) push(k, y);
      if (x0(width - 1 - k, width)) push(width - 1 - k, y);
    }
  }
  for (let x = 0; x < width; x++) {
    for (let k = 0; k < ring; k++) {
      if (y0(k, height)) push(x, k);
      if (y0(height - 1 - k, height)) push(x, height - 1 - k);
    }
  }

  if (samples.length === 0) return { r: 0, g: 0, b: 0 };
  const median = (offset: number) => {
    const channel: number[] = [];
    for (let i = offset; i < samples.length; i += 3) channel.push(samples[i]);
    channel.sort((a, b) => a - b);
    return channel[Math.floor(channel.length / 2)];
  };
  return { r: median(0), g: median(1), b: median(2) };
}

const x0 = (v: number, w: number) => v >= 0 && v < w;
const y0 = (v: number, h: number) => v >= 0 && v < h;

/**
 * True when the source already carries a mask (a baked WebP or a PNG with
 * alpha). In that case no keying is needed at all: the pixels are used as
 * they come.
 *
 * The whole image is sampled instead of only its border, so a frame whose
 * character touches the edge is still detected as already masked.
 */
export function hasTransparentBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sample = 4
): boolean {
  let transparent = 0;
  let total = 0;
  for (let y = 0; y < height; y += sample) {
    for (let x = 0; x < width; x += sample) {
      total++;
      if (data[(y * width + x) * 4 + 3] < 250) transparent++;
    }
  }
  // A real mask leaves a good part of the sheet empty.
  return total > 0 && transparent / total > 0.01;
}

/**
 * Removes a set of flat colours (the grass, the path...) by flooding them
 * from the borders. Pixels of the same colour that are enclosed by the
 * character (the light green highlights of the foliage) are kept.
 */
export function removeColorSet(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  colors: RgbColor[],
  tolerance = 12
): void {
  const total = width * height;
  const removed = new Uint8Array(total);
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const tolSq = tolerance * tolerance;

  const matches = (idx: number): boolean => {
    const pi = idx * 4;
    const r = data[pi];
    const g = data[pi + 1];
    const b = data[pi + 2];
    for (let c = 0; c < colors.length; c++) {
      const dr = r - colors[c].r;
      const dg = g - colors[c].g;
      const db = b - colors[c].b;
      if (dr * dr + dg * dg + db * db <= tolSq) return true;
    }
    return false;
  };

  let head = 0;
  let tail = 0;
  for (let x = 0; x < width; x++) {
    queue[tail++] = x;
    queue[tail++] = (height - 1) * width + x;
  }
  for (let y = 0; y < height; y++) {
    queue[tail++] = y * width;
    queue[tail++] = y * width + width - 1;
  }

  while (head < tail) {
    const idx = queue[head++];
    if (visited[idx]) continue;
    visited[idx] = 1;
    if (!matches(idx)) continue;

    removed[idx] = 1;
    const x = idx % width;
    const y = (idx / width) | 0;
    if (x > 0) queue[tail++] = idx - 1;
    if (x < width - 1) queue[tail++] = idx + 1;
    if (y > 0) queue[tail++] = idx - width;
    if (y < height - 1) queue[tail++] = idx + width;
  }

  for (let idx = 0; idx < total; idx++) {
    if (removed[idx]) data[idx * 4 + 3] = 0;
  }
}

/**
 * Removes the backdrop from an RGBA buffer (in place).
 * The alpha channel is written: 0 for the backdrop, 255 for the character.
 */
export function removeBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  key: BackgroundKey
): void {
  const total = width * height;
  const removed = new Uint8Array(total);
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const tolSq = key.tolerance * key.tolerance;

  const matchesBackground = (idx: number): boolean => {
    const pi = idx * 4;
    const dr = data[pi] - key.color.r;
    const dg = data[pi + 1] - key.color.g;
    const db = data[pi + 2] - key.color.b;
    return dr * dr + dg * dg + db * db <= tolSq;
  };

  // 1. Flood fill the backdrop starting from the borders.
  let head = 0;
  let tail = 0;
  for (let x = 0; x < width; x++) {
    queue[tail++] = x;
    queue[tail++] = (height - 1) * width + x;
  }
  for (let y = 0; y < height; y++) {
    queue[tail++] = y * width;
    queue[tail++] = y * width + width - 1;
  }

  while (head < tail) {
    const idx = queue[head++];
    if (visited[idx]) continue;
    visited[idx] = 1;
    if (!matchesBackground(idx)) continue;

    removed[idx] = 1;
    const x = idx % width;
    const y = (idx / width) | 0;
    if (x > 0) queue[tail++] = idx - 1;
    if (x < width - 1) queue[tail++] = idx + 1;
    if (y > 0) queue[tail++] = idx - width;
    if (y < height - 1) queue[tail++] = idx + width;
  }

  // 2. Clear big holes that the border fill could not reach (gap between the
  //    legs, spaces between the arms). Small dark details stay untouched.
  const holeSeen = new Uint8Array(total);
  const region = new Int32Array(total);
  for (let start = 0; start < total; start++) {
    if (removed[start] || holeSeen[start] || !matchesBackground(start)) continue;
    // Collect the region.
    let hHead = 0;
    let hTail = 0;
    region[hTail++] = start;
    holeSeen[start] = 1;
    while (hHead < hTail) {
      const idx = region[hHead++];
      const x = idx % width;
      const y = (idx / width) | 0;
      if (x > 0 && !removed[idx - 1] && !holeSeen[idx - 1] && matchesBackground(idx - 1)) {
        holeSeen[idx - 1] = 1;
        region[hTail++] = idx - 1;
      }
      if (x < width - 1 && !removed[idx + 1] && !holeSeen[idx + 1] && matchesBackground(idx + 1)) {
        holeSeen[idx + 1] = 1;
        region[hTail++] = idx + 1;
      }
      if (y > 0 && !removed[idx - width] && !holeSeen[idx - width] && matchesBackground(idx - width)) {
        holeSeen[idx - width] = 1;
        region[hTail++] = idx - width;
      }
      if (y < height - 1 && !removed[idx + width] && !holeSeen[idx + width] && matchesBackground(idx + width)) {
        holeSeen[idx + width] = 1;
        region[hTail++] = idx + width;
      }
    }
    if (hTail >= key.minHoleArea) {
      for (let i = 0; i < hTail; i++) removed[region[i]] = 1;
    }
  }

  // 3. Boundary pass: one single scan classifies the pixels that touch the
  //    backdrop, so the two expensive passes below only work on the thin
  //    outline of the silhouette instead of the whole image.
  const kept = (idx: number) => removed[idx] === 0;
  const edge = new Uint8Array(total);
  const matte = new Int32Array(total);
  let matteCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const hereRemoved = removed[idx] === 1;
      let neighbourRemoved = false;
      let neighbourKept = false;

      if (x > 0) {
        const n = removed[idx - 1] === 1;
        if (n) neighbourRemoved = true;
        else neighbourKept = true;
      }
      if (x < width - 1) {
        const n = removed[idx + 1] === 1;
        if (n) neighbourRemoved = true;
        else neighbourKept = true;
      }
      if (y > 0) {
        const n = removed[idx - width] === 1;
        if (n) neighbourRemoved = true;
        else neighbourKept = true;
      }
      if (y < height - 1) {
        const n = removed[idx + width] === 1;
        if (n) neighbourRemoved = true;
        else neighbourKept = true;
      }

      if (hereRemoved) {
        if (neighbourKept) matte[matteCount++] = idx;
      } else if (neighbourRemoved) {
        edge[idx] = 1;
      }
    }
  }

  // 4. Choke: the matte between the character and the backdrop is taken back
  //    with the character's own colour, so the silhouette keeps its width and
  //    the dark fringe disappears.
  const bgR = key.color.r;
  const bgG = key.color.g;
  const bgB = key.color.b;

  for (let i = 0; i < matteCount; i++) {
    const mIdx = matte[i];
    const mpi = mIdx * 4;
    const mR = data[mpi];
    const mG = data[mpi + 1];
    const mB = data[mpi + 2];
    const dBgR = mR - bgR;
    const dBgG = mG - bgG;
    const dBgB = mB - bgB;
    const bgSq = dBgR * dBgR + dBgG * dBgG + dBgB * dBgB;

    const mx = mIdx % width;
    const my = (mIdx / width) | 0;
    let bestSq = Infinity;
    let bestIdx = -1;

    for (let dy = -1; dy <= 1; dy++) {
      const ny = my + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = mx + dx;
        if (nx < 0 || nx >= width) continue;
        const nIdx = ny * width + nx;
        if (!kept(nIdx)) continue;
        const npi = nIdx * 4;
        const dR = data[npi] - mR;
        const dG = data[npi + 1] - mG;
        const dB = data[npi + 2] - mB;
        const sq = dR * dR + dG * dG + dB * dB;
        if (sq < bestSq) {
          bestSq = sq;
          bestIdx = nIdx;
        }
      }
    }

    // The matte pixel joins the character when it is closer to the character
    // colour than to the backdrop colour.
    if (bestIdx >= 0 && bestSq < bgSq) {
      const bpi = bestIdx * 4;
      data[mpi] = data[bpi];
      data[mpi + 1] = data[bpi + 1];
      data[mpi + 2] = data[bpi + 2];
      removed[mIdx] = 0;
    }
  }

  // 5. De-fringe: the outermost pixel of the character still carries a bit of
  //    the backdrop. Bleed the solid colour inwards so the edge is clean.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!edge[idx]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const nIdx = ny * width + nx;
          if (!kept(nIdx) || edge[nIdx]) continue;
          const pi = idx * 4;
          const npi = nIdx * 4;
          data[pi] = data[npi];
          data[pi + 1] = data[npi + 1];
          data[pi + 2] = data[npi + 2];
          dy = 2;
          break;
        }
      }
    }
  }

  // 5. Write the alpha channel.
  for (let idx = 0; idx < total; idx++) {
    data[idx * 4 + 3] = removed[idx] ? 0 : 255;
  }
}
