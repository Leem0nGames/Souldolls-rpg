import * as THREE from 'three';
import { SoulDollInstance, BattleAction } from '../../types/game';

export type EntityId = number;

export interface PositionComponent {
  x: number;
  y: number;
  z: number;
}

export interface VelocityComponent {
  vx: number;
  vy: number;
  vz: number;
}

export interface BillboardSpriteComponent {
  sprite: THREE.Sprite;
  baseScale: number;
  facing: 'down' | 'up' | 'left' | 'right';
  animTimer: number;
  stepFrame: number;
  bobOffset: number;
  flashColor?: string;
  flashTimer: number;
}

export interface PlayerControlComponent {
  speed: number;
  isMoving: boolean;
  facing: 'down' | 'up' | 'left' | 'right';
  isSprinting: boolean;
  stepDistanceAccumulator: number;
}

export interface SoulDollDataComponent {
  doll: SoulDollInstance;
}

export interface WildZoneComponent {
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  encounterRate: number; // e.g. 0.08 per step
  speciesPool: { speciesId: string; minLevel: number; maxLevel: number; weight: number }[];
}

export interface TamerChallengerComponent {
  name: string;
  title: string;
  tamerType: 'apprentice' | 'master' | 'sage';
  party: SoulDollInstance[];
  defeated: boolean;
  dialogueIntro: string;
  dialogueDefeated: string;
  triggerDistance: number;
}

export interface ShrineComponent {
  type: 'heal' | 'evolution_monument' | 'ancient_totem';
  name: string;
  prompt: string;
}

export interface TurnCombatantComponent {
  role: 'player' | 'opponent';
  activeDoll: SoulDollInstance;
  queuedAction?: BattleAction;
  isCharging?: boolean;
}
