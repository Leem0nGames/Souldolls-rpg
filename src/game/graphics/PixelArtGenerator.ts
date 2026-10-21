import * as THREE from 'three';
import { SOULDOLL_SPECIES } from '../data/souldolls';
import {
  BackgroundKey,
  PLAYER_BACKGROUND,
  SOULDOLL_BACKGROUND,
  detectBackgroundColor,
  hexToRgb,
  removeBackground,
  rgbToHex,
} from './BackgroundKey';

/**
 * PixelArtGenerator
 * Generates crisp 32x32 and 48x48 pixel art canvas textures procedurally.
 */
class PixelArtGenerator {
  private cache: Map<string, THREE.CanvasTexture> = new Map();
  private playerSpritesheetLoaded = false;
  private onPlayerLoadedListeners: Array<() => void> = [];

  /**
   * Colour keys used to cut the backdrop of the character sheets.
   * Change them here (or call setBackgroundKey) when new artwork is exported
   * with a different flat colour.
   */
  private loggedBackground = false;
  public soulDollBackground: BackgroundKey = { ...SOULDOLL_BACKGROUND };
  public playerBackground: BackgroundKey = { ...PLAYER_BACKGROUND };

  /**
   * Sets the exact backdrop colour of the SoulDoll sheets.
   * @param hex e.g. '#19191e'
   */
  public setSoulDollBackground(hex: string, tolerance = SOULDOLL_BACKGROUND.tolerance): void {
    this.soulDollBackground = { ...this.soulDollBackground, color: hexToRgb(hex), tolerance };
  }

  private soulDollSpritesheetLoaded = false;
  private loadedSheets: Array<{
    frontTexture: THREE.CanvasTexture;
    backTexture: THREE.CanvasTexture;
    frontAspect: number;
    backAspect: number;
    avatarUrl: string;
  }> = [];
  private onSoulDollLoadedListeners: Array<() => void> = [];

  constructor() {
    this.initPlayerSpritesheet();
    this.initSoulDollSpritesheet();
  }

  public onPlayerSpritesheetLoaded(cb: () => void): () => void {
    if (this.playerSpritesheetLoaded) {
      cb();
    }
    this.onPlayerLoadedListeners.push(cb);
    return () => {
      this.onPlayerLoadedListeners = this.onPlayerLoadedListeners.filter(l => l !== cb);
    };
  }

  public onSoulDollSpritesheetLoaded(cb: () => void): () => void {
    if (this.soulDollSpritesheetLoaded) {
      cb();
    }
    this.onSoulDollLoadedListeners.push(cb);
    return () => {
      this.onSoulDollLoadedListeners = this.onSoulDollLoadedListeners.filter(l => l !== cb);
    };
  }

  public getSoulDollAvatarUrl(): string | null {
    if (this.loadedSheets.length > 0) {
      return this.loadedSheets[0].avatarUrl;
    }
    return null;
  }

  private getSheetIndex(speciesId: string): number {
    if (this.loadedSheets.length === 0) return 0;
    let hash = 0;
    for (let i = 0; i < speciesId.length; i++) {
      hash = (hash * 31 + speciesId.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % this.loadedSheets.length;
  }

  public getSoulDollAspect(speciesId: string, isBackView = false): number {
    if (this.loadedSheets.length > 0) {
      const idx = this.getSheetIndex(speciesId) % this.loadedSheets.length;
      const sheet = this.loadedSheets[idx] || this.loadedSheets[0];
      if (sheet) {
        return isBackView ? sheet.backAspect : sheet.frontAspect;
      }
    }
    return 1.0;
  }

  private initSoulDollSpritesheet() {
    if (typeof window === 'undefined') return;

    const paths = [
      '/assets/souldolls/493519213_1792589298660327.jpg',
      '/assets/souldolls/647390299_1792589248743036.jpg',
      '/assets/souldolls/837023740_1792589339474861.jpg'
    ];

    let loadedCount = 0;
    const validSheets: Array<{
      frontTexture: THREE.CanvasTexture;
      backTexture: THREE.CanvasTexture;
      frontAspect: number;
      backAspect: number;
      avatarUrl: string;
    }> = [];

    paths.forEach((path, idx) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const w = img.width;
        const h = img.height;
        const halfW = Math.floor(w / 2);

        const frontResult = this.extractDollSprite(img, halfW, 0, halfW, h);
        const backResult = this.extractDollSprite(img, 0, 0, halfW, h);

        const frontAspect = frontResult.canvas.width / frontResult.canvas.height;
        const backAspect = backResult.canvas.width / backResult.canvas.height;

        const frontTexture = this.makeTexture(`sheet_${idx}_front`, frontResult.canvas);
        const backTexture = this.makeTexture(`sheet_${idx}_back`, backResult.canvas);
        const avatarUrl = frontResult.canvas.toDataURL();

        validSheets[idx] = {
          frontTexture,
          backTexture,
          frontAspect,
          backAspect,
          avatarUrl
        };

        loadedCount++;
        if (loadedCount === paths.length) {
          this.loadedSheets = validSheets.filter(Boolean);
          if (this.loadedSheets.length > 0) {
            this.soulDollSpritesheetLoaded = true;
            this.onSoulDollLoadedListeners.forEach(listener => {
              try {
                listener();
              } catch (e) {
                console.error(e);
              }
            });
          }
        }
      };

      img.onerror = (err) => {
        console.warn(`Could not load SoulDoll spritesheet from ${path}`, err);
        loadedCount++;
        if (loadedCount === paths.length) {
          this.loadedSheets = validSheets.filter(Boolean);
          if (this.loadedSheets.length > 0) {
            this.soulDollSpritesheetLoaded = true;
            this.onSoulDollLoadedListeners.forEach(listener => listener());
          }
        }
      };

      img.src = path;
    });
  }

  /**
   * Extracts, removes the backdrop via an exact colour key, and crops a
   * SoulDoll half.
   */
  private extractDollSprite(
    img: HTMLImageElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    // Process at 452x672 for ultra-crisp pixel art and fast 60fps BFS flood fill
    const workW = Math.floor(sw / 2);
    const workH = Math.floor(sh / 2);
    const { canvas: workCanvas, ctx: workCtx } = this.createPixelCanvas(workW, workH);

    workCtx.drawImage(img, sx, sy, sw, sh, 0, 0, workW, workH);

    const imgData = workCtx.getImageData(0, 0, workW, workH);
    const data = imgData.data;

    // Key on the exact backdrop colour: only the pixels that really match it
    // are removed, so the dark parts of the character survive.
    const key: BackgroundKey = {
      ...this.soulDollBackground,
      color: detectBackgroundColor(data, workW, workH),
    };
    if (!this.loggedBackground) {
      this.loggedBackground = true;
      console.info(
        `[PixelArt] Fondo detectado: ${rgbToHex(key.color)} (tolerancia ${key.tolerance}). ` +
          'Para exportar nuevas hojas usa ese color plano de fondo.'
      );
    }
    removeBackground(data, workW, workH, key);
    workCtx.putImageData(imgData, 0, 0);

    // Find character bounding box
    let minX = workW;
    let maxX = 0;
    let minY = workH;
    let maxY = 0;

    for (let y = 0; y < workH; y++) {
      for (let x = 0; x < workW; x++) {
        const pi = (y * workW + x) * 4;
        if (data[pi + 3] > 20) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (minX > maxX || minY > maxY) {
      minX = 0;
      maxX = workW;
      minY = 0;
      maxY = workH;
    }

    const charW = maxX - minX;
    const charH = maxY - minY;

    // Centered sprite canvas with proportional padding and feet grounded at bottom
    const padX = Math.round(charW * 0.06);
    const padTop = Math.round(charH * 0.05);
    const padBottom = Math.round(charH * 0.02);

    const outW = charW + padX * 2;
    const outH = charH + padTop + padBottom;

    const { canvas: outCanvas, ctx: outCtx } = this.createPixelCanvas(outW, outH);
    outCtx.drawImage(
      workCanvas,
      minX,
      minY,
      charW,
      charH,
      padX,
      padTop,
      charW,
      charH
    );

    return { canvas: outCanvas, ctx: outCtx };
  }

  private initPlayerSpritesheet() {
    if (typeof window === 'undefined') return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cols = 6;
      const rows = 4;
      const frameWidth = Math.floor(img.width / cols);
      const frameHeight = Math.floor(img.height / rows);
      const rowDirections: Array<'down' | 'right' | 'left' | 'up'> = ['down', 'right', 'left', 'up'];

      for (let r = 0; r < rowDirections.length; r++) {
        const dir = rowDirections[r];
        for (let c = 0; c < cols; c++) {
          const { canvas } = this.extractPlayerFrame(
            img,
            c * frameWidth,
            r * frameHeight,
            frameWidth,
            frameHeight
          );
          const key = `player_${dir}_${c}`;
          this.makeTexture(key, canvas);
        }
      }

      this.playerSpritesheetLoaded = true;
      this.onPlayerLoadedListeners.forEach(listener => {
        try {
          listener();
        } catch (e) {
          console.error(e);
        }
      });
    };

    img.onerror = (err) => {
      console.warn('Could not load custom player spritesheet from /assets/831706773_1792592438332202.jpg, fallback active', err);
    };

    img.src = '/assets/831706773_1792592438332202.jpg';
  }

  private extractPlayerFrame(
    img: HTMLImageElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const { canvas, ctx } = this.createPixelCanvas(sw, sh);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    const imgData = ctx.getImageData(0, 0, sw, sh);
    const data = imgData.data;

    // The backdrop colour is measured from the frame border, so white, black
    // or any other flat colour works without touching the code.
    const detected = detectBackgroundColor(data, sw, sh, 2);
    const key: BackgroundKey = { ...this.playerBackground, color: detected };
    removeBackground(data, sw, sh, key);
    ctx.putImageData(imgData, 0, 0);

    return { canvas, ctx };
  }

  /**
   * Helper to draw a pixel grid onto a 2D canvas
   */
  private createPixelCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
  }

  /**
   * Converts a canvas into a cached Three.js Texture configured for pixel art
   */
  private makeTexture(key: string, canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.cache.set(key, texture);
    return texture;
  }

  /**
   * Generates or retrieves the sprite texture for a SoulDoll species
   */
  public getSoulDollTexture(speciesId: string, isBackView = false): THREE.CanvasTexture {
    // If user's multiple spritesheets are loaded, distribute across species
    if (this.loadedSheets.length > 0) {
      const idx = this.getSheetIndex(speciesId);
      const sheet = this.loadedSheets[idx] || this.loadedSheets[0];
      if (sheet) {
        return isBackView ? sheet.backTexture : sheet.frontTexture;
      }
    }

    const cacheKey = `doll_${speciesId}_${isBackView ? 'back' : 'front'}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const species = SOULDOLL_SPECIES[speciesId] || SOULDOLL_SPECIES.ignisaur;
    const size = species.stage === 2 ? 48 : 36;
    const { canvas, ctx } = this.createPixelCanvas(size, size);

    const primary = species.colorTheme.primary;
    const secondary = species.colorTheme.secondary;
    const glow = species.colorTheme.glow;
    const cx = size / 2;
    const cy = size / 2;

    // Outer Aura Glow for Soul essence
    const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, size / 2);
    grad.addColorStop(0, glow + '66');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Pixel dimensions unit
    const p = Math.floor(size / 16);

    ctx.save();
    ctx.translate(cx, cy + p);

    // 1. Shadow beneath doll
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, p * 5.5, p * 4, p * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Draw creature anatomy based on elemental archetype
    const type = species.types[0];

    // Main silhouette body
    ctx.fillStyle = secondary;
    ctx.fillRect(-p * 3.5, -p * 3, p * 7, p * 7);

    ctx.fillStyle = primary;
    ctx.fillRect(-p * 3, -p * 2.5, p * 6, p * 6);

    // Elemental specific features
    if (type === 'Fire') {
      // Fire crest / horns / flame tail
      ctx.fillStyle = glow;
      ctx.fillRect(-p * 1.5, -p * 6, p * 3, p * 3.5);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-p * 1, -p * 7, p * 2, p * 2);
      // Flame tail
      ctx.fillStyle = glow;
      ctx.fillRect(p * 2.5, p * 1, p * 2.5, p * 2);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(p * 4, p * 0.5, p * 2, p * 2.5);
    } else if (type === 'Water') {
      // Fox / fish fins & water crest
      ctx.fillStyle = '#67e8f9';
      ctx.fillRect(-p * 4, -p * 4.5, p * 2, p * 3);
      ctx.fillRect(p * 2, -p * 4.5, p * 2, p * 3);
      // Flowing tail
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-p * 5, p * 1, p * 3, p * 4);
    } else if (type === 'Nature') {
      // Long leaf ears or flower bulb
      ctx.fillStyle = '#86efac';
      ctx.fillRect(-p * 3.5, -p * 6.5, p * 2, p * 4.5);
      ctx.fillRect(p * 1.5, -p * 6.5, p * 2, p * 4.5);
      // Flower center
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(-p * 1, -p * 4, p * 2, p * 2);
    } else if (type === 'Electric') {
      // Lightning bolt ears
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-p * 4.5, -p * 6, p * 2, p * 4);
      ctx.fillRect(-p * 3.5, -p * 4, p * 2, p * 2);
      ctx.fillRect(p * 2.5, -p * 6, p * 2, p * 4);
      ctx.fillRect(p * 1.5, -p * 4, p * 2, p * 2);
      // Zigzag tail
      ctx.fillStyle = '#ca8a04';
      ctx.fillRect(p * 3, 0, p * 2, p * 4);
    } else if (type === 'Earth') {
      // Stone shell plates
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-p * 4, -p * 2, p * 8, p * 6);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(-p * 2, -p * 1, p * 4, p * 4);
    } else if (type === 'Shadow') {
      // Dark ghostly horns and mist
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(-p * 4, -p * 6, p * 2.5, p * 4);
      ctx.fillRect(p * 1.5, -p * 6, p * 2.5, p * 4);
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(-p * 3, -p * 5, p * 1, p * 2);
      ctx.fillRect(p * 2, -p * 5, p * 1, p * 2);
    } else if (type === 'Light') {
      // Halo and angel feathers
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = p;
      ctx.strokeRect(-p * 3, -p * 6, p * 6, p * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-p * 5, -p * 2, p * 2, p * 5);
      ctx.fillRect(p * 3, -p * 2, p * 2, p * 5);
    } else if (type === 'Frost') {
      // Crystal horn / icicles
      ctx.fillStyle = '#cffafe';
      ctx.fillRect(-p * 1, -p * 6.5, p * 2, p * 4.5);
      ctx.fillRect(-p * 3, -p * 4, p * 1.5, p * 3);
      ctx.fillRect(p * 1.5, -p * 4, p * 1.5, p * 3);
    } else if (type === 'Poison') {
      // Toxic mantis scythes
      ctx.fillStyle = '#a21caf';
      ctx.fillRect(-p * 4.5, -p * 1, p * 2, p * 5);
      ctx.fillRect(p * 2.5, -p * 1, p * 2, p * 5);
      ctx.fillStyle = '#f0abfc';
      ctx.fillRect(-p * 1, -p * 5, p * 2, p * 2);
    } else if (type === 'Wind') {
      // Feather crest and wings
      ctx.fillStyle = '#e9d5ff';
      ctx.fillRect(-p * 5, -p * 3, p * 2.5, p * 4);
      ctx.fillRect(p * 2.5, -p * 3, p * 2.5, p * 4);
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(-p * 1, -p * 6, p * 2, p * 3);
    }

    // Stage 2 Wings or Grand Crown expansion
    if (species.stage === 2) {
      ctx.fillStyle = glow;
      ctx.fillRect(-p * 6, -p * 3, p * 2, p * 6);
      ctx.fillRect(p * 4, -p * 3, p * 2, p * 6);
    }

    // Eyes (Only on front view)
    if (!isBackView) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-p * 2, -p * 1, p * 1.5, p * 1.5);
      ctx.fillRect(p * 0.5, -p * 1, p * 1.5, p * 1.5);

      // Iris
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-p * 1.5, -p * 0.7, p * 1, p * 1.2);
      ctx.fillRect(p * 0.5, -p * 0.7, p * 1, p * 1.2);

      // Eye glimmer
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-p * 1.5, -p * 0.7, p * 0.5, p * 0.5);
      ctx.fillRect(p * 0.5, -p * 0.7, p * 0.5, p * 0.5);

      // Soul chest core (glowing crystal heart)
      ctx.fillStyle = glow;
      ctx.fillRect(-p * 0.75, p * 1.2, p * 1.5, p * 1.5);
    } else {
      // Back view markings
      ctx.fillStyle = secondary;
      ctx.fillRect(-p * 1.5, -p * 1.5, p * 3, p * 4);
      ctx.fillStyle = glow;
      ctx.fillRect(-p * 0.5, -p * 0.5, p * 1, p * 2);
    }

    // Feet / Base
    ctx.fillStyle = secondary;
    ctx.fillRect(-p * 2.5, p * 3.5, p * 1.8, p * 1.5);
    ctx.fillRect(p * 0.7, p * 3.5, p * 1.8, p * 1.5);

    ctx.restore();

    return this.makeTexture(cacheKey, canvas);
  }

  /**
   * Generates or retrieves Player Character sprite in 4 directions (6 frames each from spritesheet)
   */
  public getPlayerTexture(facing: 'down' | 'up' | 'left' | 'right' = 'down', step = 0): THREE.CanvasTexture {
    const frame = Math.abs(step) % 6;
    const key = `player_${facing}_${frame}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    // Fallback procedural texture while spritesheet finishes loading
    const { canvas, ctx } = this.createPixelCanvas(64, 64);
    const p = 3;
    ctx.save();
    ctx.translate(32, 32);

    // Face / Head
    ctx.fillStyle = '#fed7aa';
    ctx.fillRect(-p * 2.5, -p * 3.5, p * 5, p * 3.5);

    // Eyes
    if (facing === 'down') {
      ctx.fillStyle = '#10b981';
      ctx.fillRect(-p * 1.8, -p * 2, p * 1.2, p * 1.2);
      ctx.fillRect(p * 0.8, -p * 2, p * 1.2, p * 1.2);
    } else if (facing === 'left') {
      ctx.fillStyle = '#10b981';
      ctx.fillRect(-p * 2, -p * 2, p * 1.2, p * 1.2);
    } else if (facing === 'right') {
      ctx.fillStyle = '#10b981';
      ctx.fillRect(p * 0.8, -p * 2, p * 1.2, p * 1.2);
    }

    // Body
    ctx.fillStyle = '#d4a373';
    ctx.fillRect(-p * 2, 0, p * 4, p * 3.5);

    // Feet
    ctx.fillStyle = '#b08968';
    ctx.fillRect(-p * 1.8, p * 3.5, p * 1.5, p * 1.5);
    ctx.fillRect(p * 0.5, p * 3.5, p * 1.5, p * 1.5);

    ctx.restore();
    return this.makeTexture(key, canvas);
  }

  /**
   * Generates NPC Tamer sprite (Challengers in overworld)
   */
  public getTamerTexture(tamerType: 'apprentice' | 'master' | 'sage'): THREE.CanvasTexture {
    const key = `tamer_${tamerType}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const { canvas, ctx } = this.createPixelCanvas(32, 32);
    const p = 2;
    ctx.save();
    ctx.translate(16, 16);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 11, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Robe / Coat color based on rank
    const robeColor = tamerType === 'sage' ? '#7e22ce' : tamerType === 'master' ? '#b91c1c' : '#059669';
    const hairColor = tamerType === 'sage' ? '#e2e8f0' : '#d97706';

    // Hair
    ctx.fillStyle = hairColor;
    ctx.fillRect(-p * 3, -p * 6, p * 6, p * 3);

    // Face
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(-p * 2.5, -p * 3.5, p * 5, p * 3.5);

    // Eyes
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-p * 1.8, -p * 2, p * 1, p * 1.2);
    ctx.fillRect(p * 0.8, -p * 2, p * 1, p * 1.2);

    // Robe
    ctx.fillStyle = robeColor;
    ctx.fillRect(-p * 3, 0, p * 6, p * 6);
    // Gold sash
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-p * 3, p * 2.5, p * 6, p * 1);

    // Exclamation badge for active challenger
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-p * 0.8, -p * 9.5, p * 1.6, p * 2.5);
    ctx.fillRect(-p * 0.8, -p * 6.5, p * 1.6, p * 1);

    ctx.restore();
    return this.makeTexture(key, canvas);
  }

  /**
   * Generates Spirit Grass tuft sprite for wild encounters
   */
  public getSpiritGrassTexture(): THREE.CanvasTexture {
    const key = 'spirit_grass';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const { canvas, ctx } = this.createPixelCanvas(32, 32);
    const p = 2;

    // Glowing mystical purple-emerald spirit grass
    ctx.fillStyle = '#047857';
    ctx.fillRect(4 * p, 10 * p, 8 * p, 4 * p);

    // Blades
    const blades = [
      { x: 3, h: 7, col: '#10b981' },
      { x: 5, h: 9, col: '#34d399' },
      { x: 7, h: 11, col: '#a855f7' },
      { x: 9, h: 10, col: '#c084fc' },
      { x: 11, h: 8, col: '#10b981' }
    ];

    blades.forEach(b => {
      ctx.fillStyle = b.col;
      ctx.fillRect(b.x * p, (14 - b.h) * p, 1.8 * p, b.h * p);
      // Sparkle tip
      ctx.fillStyle = '#fef08a';
      ctx.fillRect((b.x + 0.4) * p, (14 - b.h - 1) * p, 1 * p, 1 * p);
    });

    return this.makeTexture(key, canvas);
  }
}

export const pixelGenerator = new PixelArtGenerator();
