/**
 * Battle VFX Director
 * ---------------------------------------------------------------------------
 * Owns every visual effect of the battle arena. It is driven by the renderer
 * tick (`update`), so no extra animation loop is introduced and the effects
 * stay in sync with the battle flow.
 *
 * Coordinate space: the arena group lives at Y = -50 and both SoulDolls are
 * sprites parented to `battleArenaPlatform`, therefore every position used in
 * this file is expressed in *arena local space*:
 *
 *   player   anchor -> (-2.8, 1.95,  1.4)   (bottom of the billboard)
 *   opponent anchor -> ( 2.8, 1.95, -1.4)
 *
 * The sprite anchor is the bottom edge of the image (center = 0.5 / 0.0), the
 * billboard is 5.18 units tall, so the chest sits ~2.4 units above the anchor.
 *
 * Everything is pooled: geometries and textures are shared and owned by the
 * director, only materials are created per effect and disposed with it.
 */
import * as THREE from 'three';
import { ElementalType, Move, StatusCondition } from '../../types/game';
import { AttackVfxCommand, BattleSide, BattleVfxSink, FaintVfxRequest } from './BattleVfx';

// ---------------------------------------------------------------------------
// Arena layout
// ---------------------------------------------------------------------------

const ANCHOR_PLAYER = new THREE.Vector3(-2.8, 1.95, 1.4);
const ANCHOR_OPPONENT = new THREE.Vector3(2.8, 1.95, -1.4);
const CHEST_RISE = 2.4;
const UP = new THREE.Vector3(0, 1, 0);

const smooth = (t: number) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

interface Palette {
  core: number;
  edge: number;
  spark: number;
}

const TYPE_PALETTE: Record<ElementalType, Palette> = {
  Fire: { core: 0xff7a18, edge: 0xffd166, spark: 0xef4444 },
  Water: { core: 0x38bdf8, edge: 0xbae6fd, spark: 0x2563eb },
  Nature: { core: 0x4ade80, edge: 0xbbf7d0, spark: 0x15803d },
  Electric: { core: 0xfacc15, edge: 0xfef08a, spark: 0xfbbf24 },
  Earth: { core: 0xb45309, edge: 0xfbbf24, spark: 0x78350f },
  Frost: { core: 0x67e8f9, edge: 0xe0f2fe, spark: 0x06b6d4 },
  Wind: { core: 0xc084fc, edge: 0xf5d0fe, spark: 0x7e22ce },
  Shadow: { core: 0x7c3aed, edge: 0xc084fc, spark: 0x1e1b4b },
  Light: { core: 0xfde68a, edge: 0xffffff, spark: 0xfbbf24 },
  Poison: { core: 0xa21caf, edge: 0xf0abfc, spark: 0x4c1d95 },
};

const STATUS_COLORS: Record<StatusCondition, number> = {
  burn: 0xfb923c,
  freeze: 0x67e8f9,
  paralysis: 0xfacc15,
  poison: 0xa855f7,
  sleep: 0x818cf8,
};

/** Element used to draw the glyph of a status condition. */
const STATUS_ELEMENT: Record<StatusCondition, ElementalType> = {
  burn: 'Fire',
  freeze: 'Frost',
  paralysis: 'Electric',
  poison: 'Poison',
  sleep: 'Shadow',
};

/**
 * Per element behaviour of the elemental particles. This is what makes a Fire
 * hit look like fire and an Earth hit look like rocks, not just a different
 * colour of the same blob.
 */
interface ElementProfile {
  /** Horizontal spread of the burst. */
  spread: number;
  /** Vertical lift of the burst. */
  lift: number;
  /** Gravity applied to the burst (negative floats upwards). */
  gravity: number;
  /** Spin speed of the glyph. */
  spin: number;
  /** Side to side wobble of travelling glyphs. */
  wobble: number;
  /** How fast the glyphs rise. */
  rise: number;
  /** Flicker amount (electricity, shadow, poison shimmer). */
  flicker: number;
}

const ELEMENT_PROFILE: Record<ElementalType, ElementProfile> = {
  Fire: { spread: 1.0, lift: 2.3, gravity: 1.4, spin: 3, wobble: 0.05, rise: 1.5, flicker: 0.1 },
  Water: { spread: 1.5, lift: 0.9, gravity: 3.2, spin: 2, wobble: 0.02, rise: 1.0, flicker: 0.05 },
  Nature: { spread: 1.2, lift: 1.1, gravity: 2.2, spin: 7, wobble: 0.08, rise: 0.9, flicker: 0.08 },
  Electric: { spread: 1.2, lift: 0.6, gravity: 1.1, spin: 10, wobble: 0.22, rise: 0.8, flicker: 0.65 },
  Earth: { spread: 1.3, lift: 0.8, gravity: 5.2, spin: 4, wobble: 0.02, rise: 0.6, flicker: 0.04 },
  Frost: { spread: 1.2, lift: 1.0, gravity: 2.6, spin: 3, wobble: 0.03, rise: 0.8, flicker: 0.12 },
  Wind: { spread: 1.4, lift: 0.5, gravity: 0.4, spin: 9, wobble: 0.18, rise: 1.2, flicker: 0.18 },
  Shadow: { spread: 0.9, lift: 1.3, gravity: 0.7, spin: 2, wobble: 0.14, rise: 1.2, flicker: 0.35 },
  Light: { spread: 1.0, lift: 0.8, gravity: 0.5, spin: 5, wobble: 0.02, rise: 1.0, flicker: 0.15 },
  Poison: { spread: 1.0, lift: 1.7, gravity: -0.7, spin: 3, wobble: 0.16, rise: 1.3, flicker: 0.3 },
};

// ---------------------------------------------------------------------------
// Effect classification (real moves of MOVES_DATABASE)
// ---------------------------------------------------------------------------

type EffectKind =
  | 'projectile'
  | 'multi'
  | 'beam'
  | 'column'
  | 'slash'
  | 'slam'
  | 'nova'
  | 'aura';

const MOVE_KINDS: Record<string, EffectKind> = {
  // Fire
  ember: 'projectile',
  flame_claw: 'slash',
  inferno_surge: 'projectile',
  // Water
  hydro_jet: 'projectile',
  bubble_veil: 'aura',
  aqua_fang: 'slash',
  tidal_maelstrom: 'nova',
  // Nature
  leaf_shuriken: 'multi',
  photosynthesis: 'aura',
  thorn_whip: 'slash',
  verdant_wrath: 'nova',
  // Electric
  volt_spark: 'projectile',
  static_field: 'aura',
  thunder_strike: 'column',
  overcharge: 'slash',
  // Earth
  pebble_barrage: 'multi',
  stone_fortress: 'aura',
  earth_tremor: 'slam',
  avalanche: 'column',
  // Shadow
  shadow_sneak: 'slash',
  night_terror: 'projectile',
  eclipse_strike: 'slash',
  // Light
  astral_beam: 'beam',
  soul_purge: 'beam',
  divine_radiance: 'column',
  // Frost
  frost_nibble: 'slash',
  icicle_lance: 'projectile',
  absolute_zero: 'nova',
  // Poison
  acid_spit: 'projectile',
  toxic_needle: 'projectile',
  venomous_cross: 'slash',
  // Wind
  gust: 'projectile',
  sky_slash: 'slash',
  hurricane_drill: 'slash',
};

function classifyMove(move: Move): EffectKind {
  const known = MOVE_KINDS[move.id];
  if (known) return known;
  if (move.power === 0) return 'aura';
  return move.category === 'Physical' ? 'slash' : 'projectile';
}

// ---------------------------------------------------------------------------
// Shared resources
// ---------------------------------------------------------------------------

interface VfxResources {
  glowTex: THREE.Texture;
  ringTex: THREE.Texture;
  arcTex: THREE.Texture;
  starTex: THREE.Texture;
  /** One silhouette per element, used by every elemental particle. */
  glyphs: Record<ElementalType, THREE.Texture>;
  geoPlane: THREE.PlaneGeometry;
  geoSphere: THREE.IcosahedronGeometry;
  geoCylinder: THREE.CylinderGeometry;
}

function buildTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    draw(ctx, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Draws the silhouette of an element. Every glyph is drawn in white and
 * tinted later, so one texture per element is enough for the whole game.
 */
function drawGlyph(ctx: CanvasRenderingContext2D, size: number, type: ElementalType): void {
  const c = size / 2;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (type) {
    case 'Fire': {
      // Flame with licking tongues (must not read like a water droplet).
      ctx.beginPath();
      ctx.moveTo(size * 0.54, size * 0.05);
      ctx.bezierCurveTo(size * 0.78, size * 0.34, size * 0.84, size * 0.56, size * 0.74, size * 0.7);
      ctx.quadraticCurveTo(size * 0.67, size * 0.85, size * 0.57, size * 0.75);
      ctx.quadraticCurveTo(size * 0.5, size * 0.9, size * 0.42, size * 0.73);
      ctx.quadraticCurveTo(size * 0.33, size * 0.9, size * 0.25, size * 0.71);
      ctx.bezierCurveTo(size * 0.15, size * 0.5, size * 0.4, size * 0.3, size * 0.54, size * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(size * 0.5, size * 0.33);
      ctx.quadraticCurveTo(size * 0.63, size * 0.5, size * 0.58, size * 0.63);
      ctx.quadraticCurveTo(size * 0.5, size * 0.77, size * 0.43, size * 0.62);
      ctx.quadraticCurveTo(size * 0.39, size * 0.5, size * 0.5, size * 0.33);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'Water': {
      // Droplet.
      ctx.beginPath();
      ctx.moveTo(c, size * 0.08);
      ctx.quadraticCurveTo(size * 0.84, size * 0.52, size * 0.72, size * 0.72);
      ctx.quadraticCurveTo(size * 0.6, size * 0.95, c, size * 0.9);
      ctx.quadraticCurveTo(size * 0.4, size * 0.95, size * 0.28, size * 0.72);
      ctx.quadraticCurveTo(size * 0.16, size * 0.52, c, size * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.ellipse(size * 0.38, size * 0.6, size * 0.08, size * 0.13, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'Electric': {
      // Lightning bolt.
      ctx.beginPath();
      ctx.moveTo(size * 0.6, size * 0.05);
      ctx.lineTo(size * 0.28, size * 0.52);
      ctx.lineTo(size * 0.48, size * 0.52);
      ctx.lineTo(size * 0.38, size * 0.95);
      ctx.lineTo(size * 0.74, size * 0.42);
      ctx.lineTo(size * 0.53, size * 0.42);
      ctx.lineTo(size * 0.74, size * 0.05);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'Nature': {
      // Leaf with a midrib.
      ctx.beginPath();
      ctx.moveTo(size * 0.18, size * 0.88);
      ctx.quadraticCurveTo(size * 0.14, size * 0.22, size * 0.84, size * 0.16);
      ctx.quadraticCurveTo(size * 0.88, size * 0.8, size * 0.18, size * 0.88);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = size * 0.045;
      ctx.beginPath();
      ctx.moveTo(size * 0.22, size * 0.86);
      ctx.quadraticCurveTo(size * 0.5, size * 0.5, size * 0.82, size * 0.18);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'Earth': {
      // Boulder.
      const pts = [0.5, 0.08, 0.8, 0.24, 0.9, 0.56, 0.72, 0.88, 0.4, 0.93, 0.12, 0.66, 0.2, 0.26];
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i] * size;
        const y = pts[i + 1] * size;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(size * 0.5, size * 0.08);
      ctx.lineTo(size * 0.8, size * 0.24);
      ctx.lineTo(size * 0.55, size * 0.56);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'Frost': {
      // Snowflake.
      ctx.lineWidth = size * 0.055;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(c + Math.cos(a) * size * 0.4, c + Math.sin(a) * size * 0.4);
        ctx.stroke();
        const bx = c + Math.cos(a) * size * 0.27;
        const by = c + Math.sin(a) * size * 0.27;
        for (const d of [-0.7, 0.7]) {
          const a2 = a + d;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(a2) * size * 0.12, by + Math.sin(a2) * size * 0.12);
          ctx.stroke();
        }
      }
      ctx.beginPath();
      ctx.arc(c, c, size * 0.075, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'Wind': {
      // Spiral gust.
      ctx.lineWidth = size * 0.085;
      ctx.beginPath();
      ctx.arc(c, c, size * 0.27, Math.PI * 0.1, Math.PI * 1.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c, c, size * 0.15, Math.PI * 1.15, Math.PI * 0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c + size * 0.27, c);
      ctx.quadraticCurveTo(size * 0.94, c - size * 0.14, size * 0.9, c + size * 0.18);
      ctx.stroke();
      break;
    }
    case 'Shadow': {
      // Crescent of an eclipse with a smoky tail.
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(size * 0.46, size * 0.5, size * 0.31, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(size * 0.6, size * 0.42, size * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = size * 0.05;
      ctx.beginPath();
      ctx.moveTo(size * 0.42, size * 0.74);
      ctx.quadraticCurveTo(size * 0.18, size * 0.88, size * 0.27, size * 0.64);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'Light': {
      // Radiant sun.
      ctx.lineWidth = size * 0.06;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * size * 0.17, c + Math.sin(a) * size * 0.17);
        ctx.lineTo(c + Math.cos(a) * size * 0.45, c + Math.sin(a) * size * 0.45);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(c, c, size * 0.145, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'Poison': {
      // Bubbling blob.
      ctx.lineWidth = size * 0.07;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(c, c, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(c, c, size * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(size * 0.4, size * 0.4, size * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(size * 0.8, size * 0.74, size * 0.085, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(size * 0.2, size * 0.78, size * 0.055, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
  }
}

function buildGlyphTextures(): Record<ElementalType, THREE.Texture> {
  const types: ElementalType[] = [
    'Fire', 'Water', 'Nature', 'Electric', 'Earth',
    'Frost', 'Wind', 'Shadow', 'Light', 'Poison',
  ];
  const glyphs = {} as Record<ElementalType, THREE.Texture>;
  for (const type of types) {
    glyphs[type] = buildTexture(128, (ctx, size) => drawGlyph(ctx, size, type));
  }
  return glyphs;
}

function createResources(): VfxResources {
  const glowTex = buildTexture(128, (ctx, size) => {
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });

  const ringTex = buildTexture(128, (ctx, size) => {
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.addColorStop(0.74, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.86, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });

  const arcTex = buildTexture(128, (ctx, size) => {
    const c = size / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c, c * 0.92, c * 0.78, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(c * 1.3, c * 0.72, c * 0.74, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  });

  const starTex = buildTexture(128, (ctx, size) => {
    const c = size / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const radius = i % 2 === 0 ? c * 0.95 : c * 0.16;
      const x = c + Math.cos(angle) * radius;
      const y = c + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  });

  const geoPlane = new THREE.PlaneGeometry(1, 1);
  const geoSphere = new THREE.IcosahedronGeometry(1, 1);
  const geoCylinder = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  geoCylinder.translate(0, 0.5, 0);

  return { glowTex, ringTex, arcTex, starTex, glyphs: buildGlyphTextures(), geoPlane, geoSphere, geoCylinder };
}

function disposeMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const material = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    if (Array.isArray(material)) material.forEach(m => m.dispose());
    else material.dispose();
  });
}

// ---------------------------------------------------------------------------
// Sprite channel: lets an effect push a SoulDoll sprite around.
// A single owner (the director) applies the offsets every frame, so the
// sprites can never be left in a broken position.
// ---------------------------------------------------------------------------

class SpriteChannel {
  readonly offset = new THREE.Vector3();
}

function paletteOf(type: ElementalType): Palette {
  return TYPE_PALETTE[type] ?? TYPE_PALETTE.Light;
}

// ---------------------------------------------------------------------------
// Elemental particles: the silhouette of the element itself (flame, droplet,
// bolt, leaf, rock, snowflake, gust, wisp, ray, bubble).
// ---------------------------------------------------------------------------

type MoteLayout = 'orbit' | 'burst' | 'rise' | 'fall';

interface MoteOptions {
  radius?: number;
  height?: number;
  size?: number;
  speed?: number;
  opacity?: number;
  lifetime?: number;
}

class ElementalMotes {
  readonly root = new THREE.Group();
  private sprites: THREE.Sprite[] = [];
  private angle: number[] = [];
  private radius: number[] = [];
  private height: number[] = [];
  private speed: number[] = [];
  private spin: number[] = [];
  private baseScale: number[] = [];
  private phase: number[] = [];
  private age = 0;
  private lifetime: number;
  private maxOpacity: number;

  constructor(
    res: VfxResources,
    private type: ElementalType,
    private layout: MoteLayout,
    count: number,
    private opts: MoteOptions = {}
  ) {
    const profile = ELEMENT_PROFILE[type];
    const palette = paletteOf(type);
    const radius = opts.radius ?? 1.1;
    const height = opts.height ?? 0;
    const size = opts.size ?? 0.5;
    const speed = opts.speed ?? 1;
    const opacity = opts.opacity ?? 0.9;
    const lifetime = opts.lifetime ?? 1;

    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: res.glyphs[type],
        color: i % 3 === 0 ? palette.edge : palette.core,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const sprite = new THREE.Sprite(mat);
      const scale = size * (0.65 + Math.random() * 0.7);
      sprite.scale.setScalar(scale);
      this.root.add(sprite);

      this.sprites.push(sprite);
      this.angle.push(Math.random() * Math.PI * 2);
      this.radius.push(radius * (0.55 + Math.random() * 0.6));
      this.height.push(height + (Math.random() - 0.5) * 0.7);
      this.speed.push(speed * (0.6 + Math.random() * 0.9));
      this.spin.push((Math.random() - 0.5) * profile.spin * 2);
      this.baseScale.push(scale);
      this.phase.push(Math.random() * Math.PI * 2);
    }

    this.lifetime = lifetime;
    this.maxOpacity = opacity;
  }

  update(delta: number): void {
    this.age += delta;
    const profile = ELEMENT_PROFILE[this.type];
    const t = Math.min(1, this.age / this.lifetime);
    const fade = Math.sin(Math.min(1, t * 1.15) * Math.PI) * this.maxOpacity;

    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      const a = this.angle[i] + this.age * profile.spin * 0.6;
      const flick =
        1 - profile.flicker * 0.5 * (1 + Math.sin(this.age * 18 + this.phase[i])) * 0.5;

      switch (this.layout) {
        case 'orbit': {
          const r = this.radius[i] * (0.85 + 0.15 * Math.sin(this.age * 2.4 + this.phase[i]));
          sprite.position.set(
            Math.cos(a) * r,
            this.height[i] + this.age * profile.rise * 0.5,
            Math.sin(a) * r
          );
          break;
        }
        case 'burst': {
          const d = this.speed[i] * this.age * 2.4;
          sprite.position.set(
            Math.cos(a) * d * profile.spread,
            this.height[i] + profile.lift * this.age * 1.6 - profile.gravity * this.age * this.age * 2.2,
            Math.sin(a) * d * profile.spread
          );
          break;
        }
        case 'rise': {
          sprite.position.set(
            Math.cos(a) * this.radius[i] * 0.8,
            this.height[i] + this.age * profile.rise * this.speed[i],
            Math.sin(a) * this.radius[i] * 0.8
          );
          break;
        }
        case 'fall': {
          sprite.position.set(
            Math.cos(a) * this.radius[i] * 0.7,
            this.height[i] - this.age * this.speed[i] * 3.2,
            Math.sin(a) * this.radius[i] * 0.7
          );
          break;
        }
      }

      sprite.material.opacity = Math.max(0, fade * flick);
      sprite.material.rotation += this.spin[i] * delta;
      const s = this.baseScale[i] * (0.75 + 0.35 * (1 - t));
      sprite.scale.set(s, s, 1);
    }
  }

  dispose(): void {
    disposeMaterials(this.root);
    this.root.clear();
  }
}

// ---------------------------------------------------------------------------
// Base effect
// ---------------------------------------------------------------------------

abstract class VfxEffect {
  readonly root = new THREE.Group();
  protected age = 0;

  constructor(readonly duration: number, protected readonly res: VfxResources) {}

  get finished(): boolean {
    return this.age >= this.duration;
  }

  update(delta: number): void {
    this.age += delta;
    this.tick(delta);
  }

  protected abstract tick(delta: number): void;

  dispose(): void {
    disposeMaterials(this.root);
    this.root.clear();
    // Detach the (now empty) root so the VFX group never accumulates objects.
    this.root.removeFromParent();
  }
}

// ---------------------------------------------------------------------------
// Anticipation: the caster gathers energy before releasing the move
// ---------------------------------------------------------------------------

class ChargeEffect extends VfxEffect {
  private glow: THREE.Sprite;
  private ring: THREE.Mesh;
  private motes: ElementalMotes;

  constructor(res: VfxResources, chest: THREE.Vector3, feet: THREE.Vector3, private type: ElementalType, moteCount: number) {
    super(0.34, res);
    const pal = paletteOf(type);

    const glowMat = new THREE.SpriteMaterial({
      map: res.glowTex,
      color: pal.core,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.glow = new THREE.Sprite(glowMat);
    this.glow.position.copy(chest);
    this.root.add(this.glow);

    const ringMat = new THREE.MeshBasicMaterial({
      map: res.ringTex,
      color: pal.edge,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.ring = new THREE.Mesh(res.geoPlane, ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.copy(feet).setY(feet.y + 0.06);
    this.root.add(this.ring);

    // Elemental motes gather around the caster while it charges.
    this.motes = new ElementalMotes(res, type, 'orbit', moteCount, {
      radius: 1.25,
      height: 0,
      size: 0.52,
      speed: 1,
      opacity: 0.95,
      lifetime: 0.34,
    });
    this.motes.root.position.copy(chest);
    this.root.add(this.motes.root);
  }

  protected tick(delta: number): void {
    const t = Math.min(1, this.age / this.duration);
    const pulse = Math.sin(t * Math.PI);
    const scale = 0.5 + t * 1.7;
    this.glow.scale.set(scale, scale, 1);
    this.glow.material.opacity = pulse * 0.55;

    const ringScale = 0.9 + t * 2.1;
    this.ring.scale.set(ringScale, ringScale, 1);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = pulse * 0.5;

    this.motes.update(delta);
  }

  dispose(): void {
    this.motes.dispose();
    super.dispose();
  }
}

// ---------------------------------------------------------------------------
// Projectile (single / multiple)
// ---------------------------------------------------------------------------

interface ProjectileOptions {
  size: number;
  spin: number;
  trail: number;
  arc: number;
  travel: number;
}

class ProjectileEffect extends VfxEffect {
  private body = new THREE.Group();
  private core: THREE.Sprite;
  private aura: THREE.Sprite;
  private shard: THREE.Mesh;
  private trailSprites: THREE.Sprite[] = [];
  private trailAges: number[] = [];
  private profile: ElementProfile;

  constructor(
    res: VfxResources,
    private from: THREE.Vector3,
    private to: THREE.Vector3,
    private type: ElementalType,
    private opts: ProjectileOptions
  ) {
    super(opts.travel, res);
    const pal = paletteOf(type);
    const profile = ELEMENT_PROFILE[type];
    this.root.add(this.body);

    // The element silhouette is the projectile itself.
    const coreMat = new THREE.SpriteMaterial({
      map: res.glyphs[type],
      color: pal.core,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.core = new THREE.Sprite(coreMat);
    this.core.scale.set(opts.size * 2.1, opts.size * 2.1, 1);
    this.body.add(this.core);

    // Soft aura behind the glyph so it reads at any distance.
    const auraMat = new THREE.SpriteMaterial({
      map: res.glowTex,
      color: pal.edge,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.aura = new THREE.Sprite(auraMat);
    this.aura.scale.set(opts.size * 3.1, opts.size * 3.1, 1);
    this.body.add(this.aura);

    const shardMat = new THREE.MeshBasicMaterial({
      color: pal.spark,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.shard = new THREE.Mesh(res.geoSphere, shardMat);
    this.shard.scale.setScalar(opts.size * 0.42);
    this.body.add(this.shard);

    for (let i = 0; i < opts.trail; i++) {
      const trailMat = new THREE.SpriteMaterial({
        map: res.glyphs[type],
        color: pal.spark,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const sprite = new THREE.Sprite(trailMat);
      sprite.scale.setScalar(opts.size * 1.4);
      sprite.position.copy(this.from);
      this.root.add(sprite);
      this.trailSprites.push(sprite);
      this.trailAges.push(99);
    }
    this.profile = profile;
  }

  protected tick(delta: number): void {
    const t = Math.min(1, this.age / this.duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    this.body.position.lerpVectors(this.from, this.to, eased);
    this.body.position.y += Math.sin(t * Math.PI) * this.opts.arc;

    // Elemental wobble (water drops, shadow wisps, poison bubbles...).
    const wobble = this.profile.wobble * Math.sin(t * 18);
    this.body.position.x += wobble;
    this.body.position.y += wobble * 0.6;

    this.core.material.rotation += this.opts.spin * delta;
    this.shard.rotation.x += this.opts.spin * 0.9 * delta;
    this.shard.rotation.y += this.opts.spin * 0.7 * delta;

    const flicker = 1 - this.profile.flicker * 0.5 * (1 + Math.sin(this.age * 22)) * 0.5;
    this.core.material.opacity = 0.95 * flicker;
    this.aura.material.opacity = 0.6 * flicker;

    if (this.trailSprites.length === 0) return;

    for (let i = this.trailSprites.length - 1; i > 0; i--) {
      this.trailSprites[i].position.copy(this.trailSprites[i - 1].position);
      this.trailAges[i] = this.trailAges[i - 1] + delta;
    }
    this.trailSprites[0].position.copy(this.body.position);
    this.trailAges[0] = 0;

    for (let i = 0; i < this.trailSprites.length; i++) {
      const age = this.trailAges[i];
      const sprite = this.trailSprites[i];
      const fade = Math.max(0, 0.55 - age * 2.4) * (1 - (i / this.trailSprites.length) * 0.5);
      sprite.material.opacity = fade;
      const scale = this.opts.size * 1.4 * (1 - Math.min(0.65, age * 0.8));
      sprite.scale.set(scale, scale, 1);
      sprite.material.rotation += delta * this.profile.spin * 0.4;
    }
  }
}

// ---------------------------------------------------------------------------
// Beam (focused light attacks)
// ---------------------------------------------------------------------------

class BeamEffect extends VfxEffect {
  private beam: THREE.Mesh | null = null;
  private flash: THREE.Sprite;
  private chain: THREE.Sprite[] = [];
  private dir = new THREE.Vector3();

  constructor(res: VfxResources, from: THREE.Vector3, to: THREE.Vector3, private type: ElementalType, private radius: number) {
    super(0.4, res);
    const pal = paletteOf(type);

    // Electricity, wind and shadow travel as a jagged chain of glyphs.
    const jagged = type === 'Electric' || type === 'Wind' || type === 'Shadow';

    if (jagged) {
      const count = 9;
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const chainMat = new THREE.SpriteMaterial({
          map: res.glyphs[type],
          color: i % 2 === 0 ? pal.core : pal.edge,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        });
        const sprite = new THREE.Sprite(chainMat);
        const pos = from.clone().lerp(to, t);
        const amp = Math.sin(t * Math.PI) * 0.85;
        pos.x += (Math.random() - 0.5) * amp;
        pos.y += (Math.random() - 0.5) * amp * 0.8;
        pos.z += (Math.random() - 0.5) * amp * 0.5;
        sprite.position.copy(pos);
        sprite.scale.setScalar(radius * 3.4);
        this.root.add(sprite);
        this.chain.push(sprite);
      }
    } else {
      const beamMat = new THREE.MeshBasicMaterial({
        color: pal.edge,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      this.beam = new THREE.Mesh(res.geoCylinder, beamMat);
      this.dir.subVectors(to, from);
      const length = this.dir.length();
      this.beam.position.copy(from);
      this.beam.quaternion.setFromUnitVectors(UP, this.dir.clone().normalize());
      this.beam.scale.set(this.radius, length, this.radius);
      this.root.add(this.beam);
    }

    const flashMat = new THREE.SpriteMaterial({
      map: res.glowTex,
      color: pal.core,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.flash = new THREE.Sprite(flashMat);
    this.flash.position.copy(to);
    this.root.add(this.flash);
  }

  protected tick(): void {
    const t = Math.min(1, this.age / this.duration);
    const profile = ELEMENT_PROFILE[this.type];

    if (this.beam) {
      const grow = Math.min(1, t / 0.45);
      this.beam.scale.x = this.radius * grow;
      this.beam.scale.z = this.radius * grow;
      (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - smooth(t)) + 0.2;
    }

    // The jagged chain lights up progressively and flickers.
    for (let i = 0; i < this.chain.length; i++) {
      const sprite = this.chain[i];
      const local = i / Math.max(1, this.chain.length - 1);
      const lit = Math.max(0, Math.min(1, (t * 1.35 - local * 0.9) * 4));
      const flick = 1 - profile.flicker * 0.6 * (1 + Math.sin(this.age * 26 + i)) * 0.5;
      sprite.material.opacity = lit * 0.95 * Math.max(0.2, flick);
    }

    const flashScale = 0.6 + t * 3.4;
    this.flash.scale.set(flashScale, flashScale, 1);
    this.flash.material.opacity = Math.max(0, 0.9 - t * 1.2);
  }
}

// ---------------------------------------------------------------------------
// Column (strikes that fall from above)
// ---------------------------------------------------------------------------

class ColumnEffect extends VfxEffect {
  private column: THREE.Mesh;
  private ring: THREE.Mesh;
  private flash: THREE.Sprite;
  private fall: ElementalMotes;

  constructor(res: VfxResources, target: THREE.Vector3, private type: ElementalType, streakCount: number) {
    super(0.55, res);
    const pal = paletteOf(type);

    const columnMat = new THREE.MeshBasicMaterial({
      color: pal.core,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.column = new THREE.Mesh(res.geoCylinder, columnMat);
    // The column starts on the ground plane of the arena and falls from above.
    this.column.position.copy(target).setY(target.y - CHEST_RISE + 0.2);
    this.column.scale.set(0.7, 6.5, 0.7);
    this.root.add(this.column);

    const ringMat = new THREE.MeshBasicMaterial({
      map: res.ringTex,
      color: pal.edge,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.ring = new THREE.Mesh(res.geoPlane, ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.copy(target).setY(target.y - CHEST_RISE + 0.06);
    this.root.add(this.ring);

    const flashMat = new THREE.SpriteMaterial({
      map: res.glowTex,
      color: pal.edge,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.flash = new THREE.Sprite(flashMat);
    this.flash.position.copy(target);
    this.root.add(this.flash);

    // Elemental payload raining down (boulders, bolts, light shards...).
    this.fall = new ElementalMotes(res, type, 'fall', streakCount, {
      radius: 1.05,
      height: 6.2,
      size: 0.85,
      speed: 1.1,
      opacity: 0.95,
      lifetime: 0.55,
    });
    this.fall.root.position.copy(target);
    this.root.add(this.fall.root);
  }

  protected tick(delta: number): void {
    const t = Math.min(1, this.age / this.duration);

    const columnOpacity = Math.max(0, 0.85 - t * 1.4);
    (this.column.material as THREE.MeshBasicMaterial).opacity = columnOpacity;
    this.column.scale.x = 0.7 * (1 + t * 0.35);
    this.column.scale.z = 0.7 * (1 + t * 0.35);

    const ringScale = 0.6 + t * 4.2;
    this.ring.scale.set(ringScale, ringScale, 1);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 - t * 1.3);

    const flashScale = 0.8 + Math.min(1, t * 3) * 2.6;
    this.flash.scale.set(flashScale, flashScale, 1);
    this.flash.material.opacity = Math.max(0, 0.95 - t * 1.6);

    this.fall.update(delta);
  }

  dispose(): void {
    this.fall.dispose();
    super.dispose();
  }
}

// ---------------------------------------------------------------------------
// Melee slash (physical attacks)
// ---------------------------------------------------------------------------

class SlashEffect extends VfxEffect {
  private arcs: THREE.Sprite[] = [];

  constructor(res: VfxResources, private target: THREE.Vector3, private type: ElementalType, arcCount: number, private reach: number) {
    super(0.34, res);
    const pal = paletteOf(type);

    for (let i = 0; i < arcCount; i++) {
      const arcMat = new THREE.SpriteMaterial({
        map: res.arcTex,
        color: i % 2 === 0 ? pal.edge : pal.core,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const arc = new THREE.Sprite(arcMat);
      arc.position.copy(target);
      arc.position.x += (i % 2 === 0 ? -1 : 1) * 0.35 * (reach / 3);
      arc.position.z += (i % 2 === 0 ? 0.25 : -0.25) * (reach / 3);
      arc.material.rotation = (i * Math.PI) / 2 + 0.4;
      this.root.add(arc);
      this.arcs.push(arc);
    }
  }

  protected tick(): void {
    const t = Math.min(1, this.age / this.duration);
    for (let i = 0; i < this.arcs.length; i++) {
      const arc = this.arcs[i];
      const local = Math.max(0, Math.min(1, t * 1.4 - i * 0.18));
      const scale = (1.1 + local * 2.6) * (this.reach / 3);
      arc.scale.set(scale, scale, 1);
      arc.material.rotation += 0.05;
      arc.material.opacity = Math.sin(local * Math.PI) * 0.95;
    }
  }
}

// ---------------------------------------------------------------------------
// Ground slam (earth attacks)
// ---------------------------------------------------------------------------

class SlamEffect extends VfxEffect {
  private ring: THREE.Mesh;
  private inner: THREE.Mesh;
  private burst: ElementalMotes;

  constructor(res: VfxResources, private feet: THREE.Vector3, private type: ElementalType, moteCount: number) {
    super(0.6, res);
    const pal = paletteOf(type);

    const ringMat = new THREE.MeshBasicMaterial({
      map: res.ringTex,
      color: pal.edge,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.ring = new THREE.Mesh(res.geoPlane, ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.copy(feet).setY(feet.y + 0.05);
    this.root.add(this.ring);

    const innerMat = new THREE.MeshBasicMaterial({
      map: res.glowTex,
      color: pal.core,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.inner = new THREE.Mesh(res.geoPlane, innerMat);
    this.inner.rotation.x = -Math.PI / 2;
    this.inner.position.copy(feet).setY(feet.y + 0.04);
    this.root.add(this.inner);

    // Debris thrown up by the impact.
    this.burst = new ElementalMotes(res, type, 'burst', moteCount, {
      radius: 0.8,
      height: 0.1,
      size: 0.52,
      speed: 0.9,
      opacity: 0.95,
      lifetime: 0.6,
    });
    this.burst.root.position.copy(feet);
    this.root.add(this.burst.root);
  }

  protected tick(delta: number): void {
    const t = Math.min(1, this.age / this.duration);

    const ringScale = 0.7 + t * 5.2;
    this.ring.scale.set(ringScale, ringScale, 1);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - t * 1.25);

    const innerScale = 0.6 + t * 2.2;
    this.inner.scale.set(innerScale, innerScale, 1);
    (this.inner.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.75 - t * 1.6);

    this.burst.update(delta);
  }

  dispose(): void {
    this.burst.dispose();
    super.dispose();
  }
}

// ---------------------------------------------------------------------------
// Nova (expanding elemental burst)
// ---------------------------------------------------------------------------

class NovaEffect extends VfxEffect {
  private shell: THREE.Mesh;
  private flash: THREE.Sprite;
  private ring: THREE.Mesh;
  private burst: ElementalMotes;

  constructor(res: VfxResources, private target: THREE.Vector3, private type: ElementalType, private power: number, moteCount: number) {
    super(0.7, res);
    const pal = paletteOf(type);

    const shellMat = new THREE.MeshBasicMaterial({
      color: pal.core,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.shell = new THREE.Mesh(res.geoSphere, shellMat);
    this.shell.position.copy(target);
    this.shell.scale.setScalar(0.2);
    this.root.add(this.shell);

    const flashMat = new THREE.SpriteMaterial({
      map: res.glowTex,
      color: pal.edge,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.flash = new THREE.Sprite(flashMat);
    this.flash.position.copy(target);
    this.root.add(this.flash);

    const ringMat = new THREE.MeshBasicMaterial({
      map: res.ringTex,
      color: pal.core,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.ring = new THREE.Mesh(res.geoPlane, ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.copy(target).setY(target.y - CHEST_RISE + 0.07);
    this.root.add(this.ring);

    this.burst = new ElementalMotes(res, type, 'burst', moteCount, {
      radius: 0.7,
      height: 0,
      size: 0.66,
      speed: 1.1,
      opacity: 1,
      lifetime: 0.7,
    });
    this.burst.root.position.copy(target);
    this.root.add(this.burst.root);
  }

  protected tick(delta: number): void {
    const t = Math.min(1, this.age / this.duration);
    const eased = smooth(t);

    const shellScale = 0.2 + eased * this.power;
    this.shell.scale.setScalar(shellScale);
    (this.shell.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.55 - t * 0.8);
    this.shell.rotation.y += 0.03;

    const flashScale = 0.8 + eased * 2.6;
    this.flash.scale.set(flashScale, flashScale, 1);
    this.flash.material.opacity = Math.max(0, 0.85 - t * 1.3);

    const ringScale = 0.6 + eased * 5;
    this.ring.scale.set(ringScale, ringScale, 1);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - t * 1.15);

    this.burst.update(delta);
  }

  dispose(): void {
    this.burst.dispose();
    super.dispose();
  }
}

// ---------------------------------------------------------------------------
// Aura (status moves: shields, buffs, healing, status fields)
// ---------------------------------------------------------------------------

type AuraMode = 'heal' | 'shield' | 'buff' | 'status';

class AuraEffect extends VfxEffect {
  private motes: ElementalMotes;
  private ring: THREE.Mesh;
  private bubble: THREE.Mesh | null = null;
  private glow: THREE.Sprite;

  constructor(
    res: VfxResources,
    private target: THREE.Vector3,
    private type: ElementalType,
    private mode: AuraMode,
    moteCount: number
  ) {
    super(0.9, res);
    const pal = paletteOf(type);

    const glowMat = new THREE.SpriteMaterial({
      map: res.glowTex,
      color: pal.core,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.glow = new THREE.Sprite(glowMat);
    this.glow.position.copy(target);
    this.root.add(this.glow);

    const ringMat = new THREE.MeshBasicMaterial({
      map: res.ringTex,
      color: pal.edge,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.ring = new THREE.Mesh(res.geoPlane, ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.copy(target).setY(target.y - CHEST_RISE + 0.06);
    this.root.add(this.ring);

    if (mode === 'shield' || mode === 'buff') {
      const bubbleMat = new THREE.MeshBasicMaterial({
        color: pal.core,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      this.bubble = new THREE.Mesh(res.geoSphere, bubbleMat);
      this.bubble.position.copy(target);
      this.bubble.scale.setScalar(0.6);
      this.root.add(this.bubble);
    }

    // Healing and status fields rise, shields and buffs orbit the caster.
    const layout: MoteLayout = mode === 'heal' || mode === 'status' ? 'rise' : 'orbit';
    this.motes = new ElementalMotes(res, type, layout, moteCount, {
      radius: 1.05,
      height: layout === 'rise' ? 0 : 0.2,
      size: 0.55,
      speed: 1,
      opacity: 0.95,
      lifetime: 0.9,
    });
    this.motes.root.position.copy(target);
    this.root.add(this.motes.root);
  }

  protected tick(delta: number): void {
    const t = Math.min(1, this.age / this.duration);
    const pulse = Math.sin(Math.min(1, t * 1.2) * Math.PI);

    const glowScale = 1 + pulse * 1.3;
    this.glow.scale.set(glowScale, glowScale, 1);
    this.glow.material.opacity = pulse * 0.5;

    const ringScale = 0.7 + t * 3.2;
    this.ring.scale.set(ringScale, ringScale, 1);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.7 - t * 0.9);

    if (this.bubble) {
      const bubbleScale = 0.6 + smooth(Math.min(1, t * 1.4)) * 1.1;
      this.bubble.scale.set(bubbleScale, bubbleScale * 1.1, bubbleScale);
      (this.bubble.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.4 - t * 0.5);
      this.bubble.rotation.y += delta * 0.8;
    }

    this.motes.update(delta);
  }

  dispose(): void {
    this.motes.dispose();
    super.dispose();
  }
}

// ---------------------------------------------------------------------------
// Impact (damage lands here)
// ---------------------------------------------------------------------------

class ImpactEffect extends VfxEffect {
  private flash: THREE.Sprite;
  private shock: THREE.Sprite;
  private star: THREE.Sprite | null = null;
  private burst: ElementalMotes;

  constructor(
    res: VfxResources,
    private target: THREE.Vector3,
    private type: ElementalType,
    private opts: {
      heavy: boolean;
      crit: boolean;
      channel: SpriteChannel;
      push: THREE.Vector3;
      power: number;
      count: number;
    }
  ) {
    super(opts.crit ? 0.66 : 0.5, res);
    const pal = paletteOf(type);

    const flashMat = new THREE.SpriteMaterial({
      map: res.glowTex,
      color: opts.crit ? 0xffffff : pal.edge,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.flash = new THREE.Sprite(flashMat);
    this.flash.position.copy(target);
    this.root.add(this.flash);

    const shockMat = new THREE.SpriteMaterial({
      map: res.ringTex,
      color: pal.core,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.shock = new THREE.Sprite(shockMat);
    this.shock.position.copy(target);
    this.root.add(this.shock);

    if (opts.crit) {
      const starMat = new THREE.SpriteMaterial({
        map: res.starTex,
        color: 0xfff3b0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      this.star = new THREE.Sprite(starMat);
      this.star.position.copy(target);
      this.root.add(this.star);
    }

    // The element itself bursts out of the target.
    this.burst = new ElementalMotes(res, type, 'burst', opts.count, {
      radius: 0.55,
      height: 0,
      size: 0.6,
      speed: 1,
      opacity: 1,
      lifetime: opts.crit ? 0.66 : 0.5,
    });
    this.burst.root.position.copy(target);
    this.root.add(this.burst.root);
  }

  protected tick(delta: number): void {
    const t = Math.min(1, this.age / this.duration);
    const power = this.opts.power;

    const flashScale = (0.7 + t * (this.opts.crit ? 3.6 : 2.5) * (this.opts.heavy ? 1.15 : 1)) * power;
    this.flash.scale.set(flashScale, flashScale, 1);
    this.flash.material.opacity = Math.max(0, 0.9 - t * 1.5);

    const shockScale = (0.5 + t * (this.opts.crit ? 3.4 : 2.4)) * power;
    this.shock.scale.set(shockScale, shockScale, 1);
    this.shock.material.opacity = Math.max(0, 0.75 - t * 1.25);
    this.shock.material.rotation += 0.04;

    if (this.star) {
      const starScale = (0.6 + t * 2.6) * power;
      this.star.scale.set(starScale, starScale, 1);
      this.star.material.opacity = Math.max(0, 0.9 - t * 1.15);
      this.star.material.rotation += 0.12;
    }

    this.burst.update(delta);

    // Recoil: the target is pushed back and settles again.
    const shake = Math.sin(t * 42) * Math.max(0, 1 - t) * 0.45 * power;
    this.opts.channel.offset.copy(this.opts.push).multiplyScalar(shake);
  }

  dispose(): void {
    this.burst.dispose();
    super.dispose();
  }
}

// ---------------------------------------------------------------------------
// Block (type immunity: the move has no effect)
// ---------------------------------------------------------------------------

class BlockEffect extends VfxEffect {
  private shield: THREE.Sprite;
  private ripple: THREE.Sprite;
  private hex: THREE.Mesh;
  private reflect: ElementalMotes;

  constructor(res: VfxResources, private target: THREE.Vector3, private type: ElementalType) {
    super(0.55, res);
    const pal = paletteOf(type);

    const shieldMat = new THREE.SpriteMaterial({
      map: res.ringTex,
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.shield = new THREE.Sprite(shieldMat);
    this.shield.position.copy(target);
    this.root.add(this.shield);

    const rippleMat = new THREE.SpriteMaterial({
      map: res.glowTex,
      color: pal.edge,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.ripple = new THREE.Sprite(rippleMat);
    this.ripple.position.copy(target);
    this.root.add(this.ripple);

    const hexMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.hex = new THREE.Mesh(res.geoSphere, hexMat);
    this.hex.position.copy(target);
    this.hex.scale.setScalar(1.1);
    this.root.add(this.hex);

    // The element is deflected instead of landing.
    this.reflect = new ElementalMotes(res, type, 'burst', 5, {
      radius: 0.6,
      height: 0,
      size: 0.5,
      speed: 0.7,
      opacity: 0.8,
      lifetime: 0.55,
    });
    this.reflect.root.position.copy(target);
    this.root.add(this.reflect.root);
  }

  protected tick(delta: number): void {
    const t = Math.min(1, this.age / this.duration);

    const shieldScale = 1.4 + t * 1.8;
    this.shield.scale.set(shieldScale, shieldScale, 1);
    this.shield.material.opacity = Math.max(0, 0.9 - t * 1.2);

    const rippleScale = 0.4 + t * 3.6;
    this.ripple.scale.set(rippleScale, rippleScale, 1);
    this.ripple.material.opacity = Math.max(0, 0.7 - t * 1.4);

    const hexScale = 1.1 + Math.sin(t * Math.PI) * 0.45;
    this.hex.scale.setScalar(hexScale);
    (this.hex.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.45 - t * 0.8);
    this.hex.rotation.y += 0.04;
    this.hex.rotation.x += 0.02;

    this.reflect.update(delta);
  }

  dispose(): void {
    this.reflect.dispose();
    super.dispose();
  }
}

// ---------------------------------------------------------------------------
// Status condition burst (burn / freeze / paralysis / poison / sleep)
// ---------------------------------------------------------------------------

class StatusEffect extends VfxEffect {
  private motes: ElementalMotes;
  private halo: THREE.Sprite;

  constructor(res: VfxResources, target: THREE.Vector3, condition: StatusCondition, moteCount: number) {
    super(0.7, res);
    const type = STATUS_ELEMENT[condition];
    const color = STATUS_COLORS[condition];

    // The glyph matches the condition (flames for burn, snow for freeze...).
    this.motes = new ElementalMotes(res, type, 'rise', moteCount, {
      radius: 0.95,
      height: 0,
      size: 0.55,
      speed: 0.9,
      opacity: 1,
      lifetime: 0.7,
    });
    this.motes.root.position.copy(target);
    this.root.add(this.motes.root);

    // A coloured halo keeps the status readable at a glance.
    const haloMat = new THREE.SpriteMaterial({
      map: res.glowTex,
      color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.halo = new THREE.Sprite(haloMat);
    this.halo.position.copy(target);
    this.root.add(this.halo);
  }

  protected tick(delta: number): void {
    const t = Math.min(1, this.age / this.duration);
    this.motes.update(delta);
    const scale = 1.2 + t * 1.6;
    this.halo.scale.set(scale, scale, 1);
    this.halo.material.opacity = Math.max(0, 0.5 - t * 0.7);
  }

  dispose(): void {
    this.motes.dispose();
    super.dispose();
  }
}

// ---------------------------------------------------------------------------
// Soul dissolve (a SoulDoll faints / is recalled)
// ---------------------------------------------------------------------------

class SoulEffect extends VfxEffect {
  private motes: THREE.Sprite[] = [];
  private speeds: number[] = [];
  private sprite: THREE.Sprite | null;
  private startOpacity: number;
  private converge: boolean;

  constructor(
    res: VfxResources,
    private target: THREE.Vector3,
    color: number,
    moteCount: number,
    sprite: THREE.Sprite | null,
    converge: boolean
  ) {
    super(converge ? 0.7 : 0.9, res);
    this.sprite = sprite;
    this.converge = converge;
    this.startOpacity = sprite ? sprite.material.opacity : 1;

    // Soul motes use the light glyph: the soul of the doll dissolving.
    for (let i = 0; i < moteCount; i++) {
      const moteMat = new THREE.SpriteMaterial({
        map: res.glyphs.Light,
        color: i % 3 === 0 ? 0xffffff : color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const mote = new THREE.Sprite(moteMat);
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.4 + Math.random() * 1.3;
      mote.position.set(
        this.target.x + Math.cos(angle) * radius,
        this.target.y + Math.random() * 2.2,
        this.target.z + Math.sin(angle) * radius
      );
      mote.scale.setScalar(0.35 + Math.random() * 0.4);
      this.root.add(mote);
      this.motes.push(mote);
      this.speeds.push(0.6 + Math.random() * 1.2);
    }
  }

  protected tick(delta: number): void {
    const t = Math.min(1, this.age / this.duration);

    for (let i = 0; i < this.motes.length; i++) {
      const mote = this.motes[i];
      if (this.converge) {
        // Motes fly back into the doll (recall).
        mote.position.lerp(this.target, delta * 3.2);
      } else {
        mote.position.y += this.speeds[i] * delta;
      }
      mote.material.opacity = Math.max(0, 0.9 - t * 1.1);
    }

    if (this.sprite) {
      const opacity = this.converge
        ? Math.min(1, this.startOpacity * (0.25 + t * 0.9))
        : this.startOpacity * (1 - smooth(t));
      this.sprite.material.opacity = Math.max(0, Math.min(1, opacity));
      this.sprite.material.transparent = true;
    }
  }

  dispose(): void {
    if (this.sprite) {
      this.sprite.material.opacity = 1;
      this.sprite.material.transparent = true;
    }
    super.dispose();
  }
}

// ---------------------------------------------------------------------------
// Lunge (melee attacker steps into the target)
// ---------------------------------------------------------------------------

class LungeEffect extends VfxEffect {
  constructor(
    res: VfxResources,
    private channel: SpriteChannel,
    private dir: THREE.Vector3,
    private distance: number,
    duration: number
  ) {
    super(duration, res);
  }

  protected tick(): void {
    const t = Math.min(1, this.age / this.duration);
    const push = t < 0.45 ? smooth(t / 0.45) : 1 - smooth((t - 0.45) / 0.55);
    this.channel.offset.copy(this.dir).multiplyScalar(this.distance * push);
  }
}

// ---------------------------------------------------------------------------
// Director
// ---------------------------------------------------------------------------

interface EffectEntry {
  effect: VfxEffect;
  delay: number;
  elapsed: number;
  started: boolean;
}

interface TimerEntry {
  delay: number;
  elapsed: number;
  fired: boolean;
  /** Critical timers are resolved even when the battle is interrupted. */
  critical: boolean;
  fn: () => void;
}

export class BattleVfxDirector implements BattleVfxSink {
  private res: VfxResources;
  private effects: EffectEntry[] = [];
  private timers: TimerEntry[] = [];
  private playerChannel = new SpriteChannel();
  private opponentChannel = new SpriteChannel();
  private lowQuality: boolean;

  constructor(
    private group: THREE.Group,
    private playerSprite: THREE.Sprite,
    private opponentSprite: THREE.Sprite,
    lowQuality = false
  ) {
    this.lowQuality = lowQuality;
    this.res = createResources();
  }

  // -- helpers ------------------------------------------------------------

  private anchorOf(side: BattleSide): THREE.Vector3 {
    return side === 'player' ? ANCHOR_PLAYER : ANCHOR_OPPONENT;
  }

  private channelOf(side: BattleSide): SpriteChannel {
    return side === 'player' ? this.playerChannel : this.opponentChannel;
  }

  private spriteOf(side: BattleSide): THREE.Sprite {
    return side === 'player' ? this.playerSprite : this.opponentSprite;
  }

  private addEffect(effect: VfxEffect, delay = 0): void {
    this.effects.push({ effect, delay, elapsed: 0, started: false });
  }

  private addTimer(delay: number, fn: () => void, critical = false): void {
    this.timers.push({ delay, elapsed: 0, fired: false, critical, fn });
  }

  // -- public API ---------------------------------------------------------

  /**
   * Builds the whole sequence of a move: anticipation -> travel -> impact.
   * `command.onImpact` is fired exactly on the impact frame, which is where
   * the battle logic applies the HP change.
   */
  public playAttack(command: AttackVfxCommand): void {
    const move = command.move;
    const kind = classifyMove(move);

    const attackerFeet = this.anchorOf(command.attacker);
    const defenderFeet = this.anchorOf(command.defender);
    const attackerChest = attackerFeet.clone().setY(attackerFeet.y + CHEST_RISE);
    const defenderChest = defenderFeet.clone().setY(defenderFeet.y + CHEST_RISE);
    const attackerChannel = this.channelOf(command.attacker);
    const defenderChannel = this.channelOf(command.defender);

    const pushDir = new THREE.Vector3().subVectors(defenderChest, attackerChest);
    pushDir.y = 0;
    if (pushDir.lengthSq() < 0.0001) pushDir.set(1, 0, 0);
    pushDir.normalize();

    const isStatusMove = move.power === 0;
    const isImmune = command.typeMultiplier === 0;
    const heavy = move.category === 'Special' || move.power >= 80;
    // The impact reacts to the type effectiveness: a super effective hit looks
    // heavier, a resisted one looks weaker. It never contradicts the combat.
    const effectiveness =
      command.typeMultiplier >= 2 ? 1.4 : command.typeMultiplier > 0 && command.typeMultiplier < 1 ? 0.72 : 1;
    const trail = this.lowQuality ? 2 : 5;
    const moteCount = this.lowQuality ? 5 : 11;

    // --- Anticipation ----------------------------------------------------
    let impactDelay = 0;

    if (isStatusMove) {
      // Status / healing moves: the aura builds around its target and no
      // projectile is ever launched.
      const auraTarget = move.healRatio || move.statModifier?.target === 'self' ? command.attacker : command.defender;
      const mode: AuraMode = move.healRatio
        ? 'heal'
        : move.statModifier?.target === 'self'
        ? 'buff'
        : 'status';
      const target = auraTarget === command.attacker ? attackerChest : defenderChest;
      this.addEffect(new AuraEffect(this.res, target, move.type, mode, moteCount), 0.05);
      impactDelay = 0.45;
    } else {
      this.addEffect(new ChargeEffect(this.res, attackerChest, attackerFeet, move.type, moteCount), 0);

      switch (kind) {
        case 'projectile': {
          const travel = heavy ? 0.5 : 0.42;
          this.addEffect(
            new ProjectileEffect(this.res, attackerChest, defenderChest, move.type, {
              size: heavy ? 0.85 : 0.6,
              spin: heavy ? 4 : 7,
              trail,
              arc: heavy ? 1.1 : 0.6,
              travel,
            }),
            0.32
          );
          impactDelay = 0.32 + travel;
          break;
        }
        case 'multi': {
          const count = this.lowQuality ? 3 : 5;
          const travel = 0.4;
          for (let i = 0; i < count; i++) {
            const spread = (i - (count - 1) / 2) * 0.55;
            const from = attackerChest.clone().add(new THREE.Vector3(0, spread * 0.35, spread * 0.25));
            const to = defenderChest.clone().add(new THREE.Vector3(0, spread * 0.4, spread * 0.3));
            this.addEffect(
              new ProjectileEffect(this.res, from, to, move.type, {
                size: 0.4,
                spin: 9,
                trail: this.lowQuality ? 1 : 3,
                arc: 0.35,
                travel,
              }),
              0.3 + i * 0.07
            );
          }
          impactDelay = 0.3 + travel;
          break;
        }
        case 'beam': {
          this.addEffect(new BeamEffect(this.res, attackerChest, defenderChest, move.type, heavy ? 0.42 : 0.3), 0.3);
          impactDelay = 0.52;
          break;
        }
        case 'column': {
          this.addEffect(
            new ColumnEffect(this.res, defenderChest, move.type, this.lowQuality ? 3 : 7),
            0.34
          );
          impactDelay = 0.4;
          break;
        }
        case 'slash': {
          this.addEffect(
            new LungeEffect(this.res, attackerChannel, pushDir, heavy ? 1.5 : 1.15, 0.62),
            0
          );
          const arcCount = move.id === 'venomous_cross' ? 2 : 1;
          this.addEffect(
            new SlashEffect(this.res, defenderChest, move.type, arcCount, heavy ? 3.6 : 2.8),
            0.3
          );
          impactDelay = 0.33;
          break;
        }
        case 'slam': {
          this.addEffect(
            new LungeEffect(this.res, attackerChannel, pushDir, 0.9, 0.6),
            0
          );
          this.addEffect(new SlamEffect(this.res, defenderFeet, move.type, moteCount), 0.32);
          impactDelay = 0.36;
          break;
        }
        case 'nova': {
          this.addEffect(new NovaEffect(this.res, defenderChest, move.type, heavy ? 2.4 : 1.9, moteCount), 0.3);
          impactDelay = 0.36;
          break;
        }
          case 'aura':
          default: {
            // Status moves are handled above; a non status move with an unknown
            // shape still travels as a projectile.
            this.addEffect(
              new ProjectileEffect(this.res, attackerChest, defenderChest, move.type, {
                size: 0.6,
                spin: 5,
                trail,
                arc: 0.8,
                travel: 0.45,
              }),
              0.32
            );
            impactDelay = 0.77;
            break;
          }
      }
    }

    // --- Impact ----------------------------------------------------------
    // The impact callback is critical: it must run even if the battle is
    // interrupted, otherwise the combat flow would wait for the watchdog.
    this.addTimer(impactDelay, () => command.onImpact(), true);

    this.addTimer(impactDelay, () => {
      if (isStatusMove) {
        // Status / healing moves never deal damage: no impact burst.
        if (command.statusApplied) {
          this.addEffect(new StatusEffect(this.res, defenderChest, command.statusApplied, moteCount), 0);
        }
        return;
      }

      if (isImmune) {
        // The move has no effect: the target resists, nothing is damaged.
        this.addEffect(new BlockEffect(this.res, defenderChest, move.type), 0);
        return;
      }

      this.addEffect(
        new ImpactEffect(this.res, defenderChest, move.type, {
          heavy,
          crit: command.isCrit,
          channel: defenderChannel,
          push: pushDir,
          power: effectiveness,
          count: moteCount,
        }),
        0
      );

      if (command.statusApplied) {
        this.addEffect(new StatusEffect(this.res, defenderChest, command.statusApplied, moteCount), 0.08);
      }
    });
  }

  /** Soul dissolve when a SoulDoll falls. */
  public playFaint(request: FaintVfxRequest): void {
    const feet = this.anchorOf(request.side);
    const chest = feet.clone().setY(feet.y + CHEST_RISE);
    this.addEffect(new SoulEffect(this.res, chest, 0xc7d2fe, this.lowQuality ? 6 : 14, this.spriteOf(request.side), false), 0);
  }

  /** Motes returning to the doll when the player switches it. */
  public playRecall(side: BattleSide): void {
    const feet = this.anchorOf(side);
    const chest = feet.clone().setY(feet.y + CHEST_RISE);
    this.addEffect(new SoulEffect(this.res, chest, 0x7dd3fc, this.lowQuality ? 5 : 10, null, true), 0);
  }

  /** Called from the renderer tick. */
  public update(delta: number): void {
    // Timers (impact callbacks).
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const timer = this.timers[i];
      if (timer.fired) {
        this.timers.splice(i, 1);
        continue;
      }
      timer.elapsed += delta;
      if (timer.elapsed >= timer.delay) {
        timer.fired = true;
        timer.fn();
      }
    }

    // Sprite offsets are rebuilt every frame (single writer).
    this.playerChannel.offset.set(0, 0, 0);
    this.opponentChannel.offset.set(0, 0, 0);

    // Effects.
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const entry = this.effects[i];
      if (!entry.started) {
        entry.elapsed += delta;
        if (entry.elapsed < entry.delay) continue;
        entry.started = true;
        this.group.add(entry.effect.root);
      }
      entry.effect.update(delta);
      if (entry.effect.finished) {
        entry.effect.dispose();
        this.effects.splice(i, 1);
      }
    }

    // Push the sprites (lunge / recoil) - single writer, always consistent.
    this.playerSprite.position.copy(ANCHOR_PLAYER).add(this.playerChannel.offset);
    this.opponentSprite.position.copy(ANCHOR_OPPONENT).add(this.opponentChannel.offset);
  }

  /** Removes every running effect (battle exit / reset). */
  public clear(): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].effect.dispose();
    }
    this.effects.length = 0;

    // Pending impacts must still be delivered so the combat flow keeps going.
    for (let i = 0; i < this.timers.length; i++) {
      const timer = this.timers[i];
      if (!timer.fired && timer.critical) {
        timer.fired = true;
        timer.fn();
      }
    }
    this.timers.length = 0;

    this.playerChannel.offset.set(0, 0, 0);
    this.opponentChannel.offset.set(0, 0, 0);
    this.playerSprite.position.copy(ANCHOR_PLAYER);
    this.opponentSprite.position.copy(ANCHOR_OPPONENT);
    this.playerSprite.material.opacity = 1;
    this.opponentSprite.material.opacity = 1;
  }

  /** Releases every owned resource. */
  public dispose(): void {
    this.clear();
    this.res.glowTex.dispose();
    this.res.ringTex.dispose();
    this.res.arcTex.dispose();
    this.res.starTex.dispose();
    this.res.geoPlane.dispose();
    this.res.geoSphere.dispose();
    this.res.geoCylinder.dispose();
  }
}
