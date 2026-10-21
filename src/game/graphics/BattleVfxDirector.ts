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

  return { glowTex, ringTex, arcTex, starTex, geoPlane, geoSphere, geoCylinder };
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

  constructor(res: VfxResources, chest: THREE.Vector3, feet: THREE.Vector3, private pal: Palette) {
    super(0.34, res);

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
  }

  protected tick(): void {
    const t = Math.min(1, this.age / this.duration);
    const pulse = Math.sin(t * Math.PI);
    const scale = 0.5 + t * 1.7;
    this.glow.scale.set(scale, scale, 1);
    this.glow.material.opacity = pulse * 0.8;

    const ringScale = 0.9 + t * 2.1;
    this.ring.scale.set(ringScale, ringScale, 1);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = pulse * 0.5;
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
  private shard: THREE.Mesh;
  private trailSprites: THREE.Sprite[] = [];
  private trailAges: number[] = [];

  constructor(
    res: VfxResources,
    private from: THREE.Vector3,
    private to: THREE.Vector3,
    private pal: Palette,
    private opts: ProjectileOptions
  ) {
    super(opts.travel, res);
    this.root.add(this.body);

    const coreMat = new THREE.SpriteMaterial({
      map: res.glowTex,
      color: pal.core,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.core = new THREE.Sprite(coreMat);
    this.core.scale.set(opts.size * 2.3, opts.size * 2.3, 1);
    this.body.add(this.core);

    const shardMat = new THREE.MeshBasicMaterial({
      color: pal.edge,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.shard = new THREE.Mesh(res.geoSphere, shardMat);
    this.shard.scale.setScalar(opts.size * 0.5);
    this.body.add(this.shard);

    for (let i = 0; i < opts.trail; i++) {
      const trailMat = new THREE.SpriteMaterial({
        map: res.glowTex,
        color: pal.spark,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const sprite = new THREE.Sprite(trailMat);
      sprite.scale.setScalar(opts.size * 1.5);
      sprite.position.copy(this.from);
      this.root.add(sprite);
      this.trailSprites.push(sprite);
      this.trailAges.push(99);
    }
  }

  protected tick(delta: number): void {
    const t = Math.min(1, this.age / this.duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    this.body.position.lerpVectors(this.from, this.to, eased);
    this.body.position.y += Math.sin(t * Math.PI) * this.opts.arc;

    this.core.material.rotation += this.opts.spin * delta;
    this.shard.rotation.x += this.opts.spin * 0.9 * delta;
    this.shard.rotation.y += this.opts.spin * 0.7 * delta;

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
      const fade = Math.max(0, 0.5 - age * 2.4) * (1 - (i / this.trailSprites.length) * 0.5);
      sprite.material.opacity = fade;
      const scale = this.opts.size * 1.5 * (1 - Math.min(0.65, age * 0.8));
      sprite.scale.set(scale, scale, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Beam (focused light attacks)
// ---------------------------------------------------------------------------

class BeamEffect extends VfxEffect {
  private beam: THREE.Mesh;
  private flash: THREE.Sprite;
  private dir = new THREE.Vector3();

  constructor(res: VfxResources, from: THREE.Vector3, to: THREE.Vector3, private pal: Palette, private radius: number) {
    super(0.4, res);

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
    const grow = Math.min(1, t / 0.45);
    this.beam.scale.x = this.radius * grow;
    this.beam.scale.z = this.radius * grow;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - smooth(t)) + 0.2;

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
  private streaks: THREE.Sprite[] = [];
  private streakSpeeds: number[] = [];

  constructor(res: VfxResources, target: THREE.Vector3, private pal: Palette, streakCount: number) {
    super(0.55, res);

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

    for (let i = 0; i < streakCount; i++) {
      const streakMat = new THREE.SpriteMaterial({
        map: res.glowTex,
        color: pal.spark,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const streak = new THREE.Sprite(streakMat);
      streak.scale.set(0.28, 2.4, 1);
      const angle = (i / Math.max(1, streakCount)) * Math.PI * 2 + Math.random() * 0.4;
      streak.position.set(
        target.x + Math.cos(angle) * 1.1,
        target.y + 4 + Math.random() * 1.5,
        target.z + Math.sin(angle) * 1.1
      );
      this.root.add(streak);
      this.streaks.push(streak);
      this.streakSpeeds.push(7 + Math.random() * 4);
    }
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

    for (let i = 0; i < this.streaks.length; i++) {
      const streak = this.streaks[i];
      streak.position.y -= this.streakSpeeds[i] * delta;
      streak.material.opacity = Math.max(0, 0.8 - t * 1.4);
    }
  }
}

// ---------------------------------------------------------------------------
// Melee slash (physical attacks)
// ---------------------------------------------------------------------------

class SlashEffect extends VfxEffect {
  private arcs: THREE.Sprite[] = [];

  constructor(res: VfxResources, private target: THREE.Vector3, private pal: Palette, arcCount: number, private reach: number) {
    super(0.34, res);

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
  private motes: THREE.Sprite[] = [];
  private moteSpeeds: number[] = [];

  constructor(res: VfxResources, private feet: THREE.Vector3, private pal: Palette, moteCount: number) {
    super(0.6, res);

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

    for (let i = 0; i < moteCount; i++) {
      const moteMat = new THREE.SpriteMaterial({
        map: res.glowTex,
        color: pal.spark,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const mote = new THREE.Sprite(moteMat);
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.5 + Math.random() * 1.1;
      mote.position.set(
        this.feet.x + Math.cos(angle) * radius,
        this.feet.y + 0.1,
        this.feet.z + Math.sin(angle) * radius
      );
      this.root.add(mote);
      this.motes.push(mote);
      this.moteSpeeds.push(1.2 + Math.random() * 1.6);
    }
  }

  protected tick(delta: number): void {
    const t = Math.min(1, this.age / this.duration);

    const ringScale = 0.7 + t * 5.2;
    this.ring.scale.set(ringScale, ringScale, 1);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - t * 1.25);

    const innerScale = 0.6 + t * 2.2;
    this.inner.scale.set(innerScale, innerScale, 1);
    (this.inner.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.75 - t * 1.6);

    for (let i = 0; i < this.motes.length; i++) {
      const mote = this.motes[i];
      mote.position.y += this.moteSpeeds[i] * delta;
      mote.material.opacity = Math.max(0, 0.8 - t * 1.3);
    }
  }
}

// ---------------------------------------------------------------------------
// Nova (expanding elemental burst)
// ---------------------------------------------------------------------------

class NovaEffect extends VfxEffect {
  private shell: THREE.Mesh;
  private flash: THREE.Sprite;
  private ring: THREE.Mesh;

  constructor(res: VfxResources, private target: THREE.Vector3, private pal: Palette, private power: number) {
    super(0.7, res);

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
  }

  protected tick(): void {
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
  }
}

// ---------------------------------------------------------------------------
// Aura (status moves: shields, buffs, healing, status fields)
// ---------------------------------------------------------------------------

type AuraMode = 'heal' | 'shield' | 'buff' | 'status';

class AuraEffect extends VfxEffect {
  private motes: THREE.Sprite[] = [];
  private moteData: { speed: number; drift: number; phase: number }[] = [];
  private ring: THREE.Mesh;
  private bubble: THREE.Mesh | null = null;
  private glow: THREE.Sprite;

  constructor(
    res: VfxResources,
    private target: THREE.Vector3,
    private pal: Palette,
    private mode: AuraMode,
    moteCount: number
  ) {
    super(0.9, res);

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

    for (let i = 0; i < moteCount; i++) {
      const moteMat = new THREE.SpriteMaterial({
        map: res.glowTex,
        color: i % 3 === 0 ? pal.edge : pal.core,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const mote = new THREE.Sprite(moteMat);
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.4 + Math.random() * 1.15;
      mote.position.set(
        this.target.x + Math.cos(angle) * radius,
        this.target.y - CHEST_RISE + Math.random() * 1.6,
        this.target.z + Math.sin(angle) * radius
      );
      mote.scale.setScalar(0.45 + Math.random() * 0.4);
      this.root.add(mote);
      this.motes.push(mote);
      this.moteData.push({
        speed: 0.7 + Math.random() * 1.4,
        drift: 0.4 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  protected tick(delta: number): void {
    const t = Math.min(1, this.age / this.duration);
    const pulse = Math.sin(Math.min(1, t * 1.2) * Math.PI);

    const glowScale = 1 + pulse * 1.3;
    this.glow.scale.set(glowScale, glowScale, 1);
    this.glow.material.opacity = pulse * 0.55;

    const ringScale = 0.7 + t * 3.2;
    this.ring.scale.set(ringScale, ringScale, 1);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.7 - t * 0.9);

    if (this.bubble) {
      const bubbleScale = 0.6 + smooth(Math.min(1, t * 1.4)) * 1.1;
      this.bubble.scale.set(bubbleScale, bubbleScale * 1.1, bubbleScale);
      (this.bubble.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.4 - t * 0.5);
      this.bubble.rotation.y += delta * 0.8;
    }

    for (let i = 0; i < this.motes.length; i++) {
      const mote = this.motes[i];
      const data = this.moteData[i];
      const rise = this.mode === 'heal' || this.mode === 'status' ? 1 : 0.35;
      mote.position.y += data.speed * rise * delta;
      mote.position.x += Math.sin(this.age * 2 + data.phase) * data.drift * delta;
      mote.position.z += Math.cos(this.age * 1.7 + data.phase) * data.drift * delta;
      mote.material.opacity = Math.max(0, 0.85 - t * 1.1);
    }
  }
}

// ---------------------------------------------------------------------------
// Impact (damage lands here)
// ---------------------------------------------------------------------------

class ImpactEffect extends VfxEffect {
  private flash: THREE.Sprite;
  private shock: THREE.Sprite;
  private star: THREE.Sprite | null = null;
  private shards: THREE.Sprite[] = [];
  private shardVel: THREE.Vector3[] = [];

  constructor(
    res: VfxResources,
    private target: THREE.Vector3,
    private pal: Palette,
    private opts: {
      heavy: boolean;
      crit: boolean;
      channel: SpriteChannel;
      push: THREE.Vector3;
      power: number;
    }
  ) {
    super(opts.crit ? 0.66 : 0.5, res);

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

    const shardCount = opts.heavy ? 7 : 5;
    for (let i = 0; i < shardCount; i++) {
      const shardMat = new THREE.SpriteMaterial({
        map: res.glowTex,
        color: i % 2 === 0 ? pal.edge : pal.spark,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const shard = new THREE.Sprite(shardMat);
      shard.position.copy(target);
      shard.scale.setScalar(0.35 + Math.random() * 0.3);
      this.root.add(shard);
      this.shards.push(shard);

      const angle = (i / shardCount) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 2.6 + Math.random() * 2.6;
      this.shardVel.push(
        new THREE.Vector3(Math.cos(angle) * speed, 0.6 + Math.random() * 1.8, Math.sin(angle) * speed)
      );
    }
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

    for (let i = 0; i < this.shards.length; i++) {
      const shard = this.shards[i];
      const vel = this.shardVel[i];
      vel.y -= 4.5 * delta;
      shard.position.addScaledVector(vel, delta);
      shard.material.opacity = Math.max(0, 0.9 - t * 1.5);
    }

    // Recoil: the target is pushed back and settles again.
    const shake = Math.sin(t * 42) * Math.max(0, 1 - t) * 0.45 * power;
    this.opts.channel.offset.copy(this.opts.push).multiplyScalar(shake);
  }
}

// ---------------------------------------------------------------------------
// Block (type immunity: the move has no effect)
// ---------------------------------------------------------------------------

class BlockEffect extends VfxEffect {
  private shield: THREE.Sprite;
  private ripple: THREE.Sprite;
  private hex: THREE.Mesh;

  constructor(res: VfxResources, private target: THREE.Vector3, private pal: Palette) {
    super(0.55, res);

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
  }

  protected tick(): void {
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
  }
}

// ---------------------------------------------------------------------------
// Status condition burst (burn / freeze / paralysis / poison / sleep)
// ---------------------------------------------------------------------------

class StatusEffect extends VfxEffect {
  private motes: THREE.Sprite[] = [];
  private speeds: number[] = [];

  constructor(res: VfxResources, private target: THREE.Vector3, color: number, moteCount: number) {
    super(0.7, res);

    for (let i = 0; i < moteCount; i++) {
      const moteMat = new THREE.SpriteMaterial({
        map: res.glowTex,
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const mote = new THREE.Sprite(moteMat);
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.3 + Math.random() * 0.9;
      mote.position.set(
        this.target.x + Math.cos(angle) * radius,
        this.target.y + Math.random() * 1.4,
        this.target.z + Math.sin(angle) * radius
      );
      mote.scale.setScalar(0.4 + Math.random() * 0.35);
      this.root.add(mote);
      this.motes.push(mote);
      this.speeds.push(0.8 + Math.random() * 1.5);
    }
  }

  protected tick(delta: number): void {
    const t = Math.min(1, this.age / this.duration);
    for (let i = 0; i < this.motes.length; i++) {
      const mote = this.motes[i];
      mote.position.y += this.speeds[i] * delta;
      mote.material.opacity = Math.max(0, 0.9 - t * 1.2);
    }
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

    for (let i = 0; i < moteCount; i++) {
      const moteMat = new THREE.SpriteMaterial({
        map: res.glowTex,
        color,
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
    const pal = TYPE_PALETTE[move.type] ?? TYPE_PALETTE.Light;
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
      this.addEffect(new AuraEffect(this.res, target, pal, mode, moteCount), 0.05);
      impactDelay = 0.45;
    } else {
      this.addEffect(new ChargeEffect(this.res, attackerChest, attackerFeet, pal), 0);

      switch (kind) {
        case 'projectile': {
          const travel = heavy ? 0.5 : 0.42;
          this.addEffect(
            new ProjectileEffect(this.res, attackerChest, defenderChest, pal, {
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
              new ProjectileEffect(this.res, from, to, pal, {
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
          this.addEffect(new BeamEffect(this.res, attackerChest, defenderChest, pal, heavy ? 0.42 : 0.3), 0.3);
          impactDelay = 0.52;
          break;
        }
        case 'column': {
          this.addEffect(
            new ColumnEffect(this.res, defenderChest, pal, this.lowQuality ? 3 : 7),
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
            new SlashEffect(this.res, defenderChest, pal, arcCount, heavy ? 3.6 : 2.8),
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
          this.addEffect(new SlamEffect(this.res, defenderFeet, pal, moteCount), 0.32);
          impactDelay = 0.36;
          break;
        }
        case 'nova': {
          this.addEffect(new NovaEffect(this.res, defenderChest, pal, heavy ? 2.4 : 1.9), 0.3);
          impactDelay = 0.36;
          break;
        }
          case 'aura':
          default: {
            // Status moves are handled above; a non status move with an unknown
            // shape still travels as a projectile.
            this.addEffect(
              new ProjectileEffect(this.res, attackerChest, defenderChest, pal, {
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
          const color = STATUS_COLORS[command.statusApplied];
          this.addEffect(new StatusEffect(this.res, defenderChest, color, moteCount), 0);
        }
        return;
      }

      if (isImmune) {
        // The move has no effect: the target resists, nothing is damaged.
        this.addEffect(new BlockEffect(this.res, defenderChest, pal), 0);
        return;
      }

      this.addEffect(
        new ImpactEffect(this.res, defenderChest, pal, {
          heavy,
          crit: command.isCrit,
          channel: defenderChannel,
          push: pushDir,
          power: effectiveness,
        }),
        0
      );

      if (command.statusApplied) {
        const color = STATUS_COLORS[command.statusApplied];
        this.addEffect(new StatusEffect(this.res, defenderChest, color, moteCount), 0.08);
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
