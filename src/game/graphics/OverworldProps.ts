/**
 * Overworld props
 * ---------------------------------------------------------------------------
 * The trees, bushes, flowers, rocks and signposts of the map are billboards
 * (sprites) instead of being painted into the ground texture, so the player
 * walks behind them and they get the depth of the diorama.
 *
 * The sprites are baked from the Gen 2 inspired tileset
 * (public/assets/props) and are placed where the map says so.
 */
import * as THREE from 'three';
import { DecorationKind, PlacedDecoration, getDecorations } from './OverworldTiles';

interface PropDefinition {
  /** File inside /assets/props. */
  file: string;
  /** Size of the billboard in world units. */
  width: number;
  height: number;
}

const PROP_DEFS: Record<DecorationKind, PropDefinition> = {
  'tree-tall': { file: 'tree-tall.png', width: 3, height: 6 },
  'tree-short': { file: 'tree-short.png', width: 3, height: 3 },
  bush: { file: 'bush.png', width: 2.25, height: 2.25 },
  'flower-a': { file: 'flower-a.png', width: 1.5, height: 1.5 },
  'flower-b': { file: 'flower-b.png', width: 1.5, height: 1.5 },
  rock: { file: 'rock.png', width: 2.25, height: 2.25 },
  'grass-tuft': { file: 'grass-tuft.png', width: 1.5, height: 1.5 },
  sign: { file: 'sign.png', width: 1.5, height: 1.5 },
};

/** Slight lift so the base of the prop does not fight with the ground plane. */
const BASE_LIFT = 0.03;

export class OverworldProps {
  readonly group = new THREE.Group();
  private sprites: THREE.Sprite[] = [];

  constructor(private baseUrl: string) {}

  /** Loads every prop texture and spawns its billboards. */
  public load(): void {
    const loader = new THREE.TextureLoader();
    const byKind = new Map<DecorationKind, PlacedDecoration[]>();
    for (const decor of getDecorations()) {
      const list = byKind.get(decor.kind);
      if (list) list.push(decor);
      else byKind.set(decor.kind, [decor]);
    }

    for (const [kind, placements] of byKind) {
      const def = PROP_DEFS[kind];
      if (!def) continue;
      loader.load(`${this.baseUrl}/${def.file}`, (texture) => {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        this.spawn(kind, def, texture, placements);
      });
    }
  }

  private spawn(
    kind: DecorationKind,
    def: PropDefinition,
    texture: THREE.Texture,
    placements: PlacedDecoration[]
  ): void {
    for (const placement of placements) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.35,
        depthWrite: true,
        fog: true,
      });
      const sprite = new THREE.Sprite(material);
      // The anchor is the bottom of the billboard: the prop stands on the ground.
      sprite.center.set(0.5, 0);
      sprite.scale.set(def.width, def.height, 1);
      sprite.position.set(placement.x, BASE_LIFT, placement.z);
      sprite.userData.kind = kind;
      this.group.add(sprite);
      this.sprites.push(sprite);
    }
  }

  /** Removes every billboard (used when the scene is rebuilt). */
  public dispose(): void {
    for (const sprite of this.sprites) {
      const material = sprite.material as THREE.SpriteMaterial;
      material.map?.dispose();
      material.dispose();
    }
    this.group.clear();
    this.sprites.length = 0;
  }
}
