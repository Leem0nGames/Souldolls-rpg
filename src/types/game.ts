/**
 * SoulDolls - Core Game Types & Interfaces
 */

export type ElementalType = 
  | 'Fire'
  | 'Water'
  | 'Nature'
  | 'Electric'
  | 'Earth'
  | 'Frost'
  | 'Wind'
  | 'Shadow'
  | 'Light'
  | 'Poison';

export type MoveCategory = 'Physical' | 'Special' | 'Status';

export type StatusCondition = 'burn' | 'freeze' | 'paralysis' | 'poison' | 'sleep';

export interface StatBlock {
  hp: number;
  atk: number;
  def: number;
  spAtk: number;
  spDef: number;
  spd: number;
}

export interface Move {
  id: string;
  name: string;
  type: ElementalType;
  category: MoveCategory;
  power: number; // 0 for pure status
  accuracy: number; // 0-100
  maxPp: number;
  currentPp: number;
  description: string;
  priority?: number;
  statusEffect?: {
    condition: StatusCondition;
    chance: number; // 0-100
  };
  statModifier?: {
    target: 'self' | 'enemy';
    stat: keyof StatBlock;
    stages: number; // e.g. +1 or -1
    chance: number;
  };
  healRatio?: number; // e.g. 0.5 heals 50% max HP
}

export interface EvolutionCondition {
  level?: number;
  itemRequired?: string;
  evolvesInto: string; // speciesId of next stage
}

export interface SoulDollSpecies {
  id: string;
  name: string;
  stage: number; // 1: Basic, 2: Ascended/Evolved
  types: [ElementalType, ElementalType?];
  baseStats: StatBlock;
  description: string;
  catchRate: number; // 30-255
  baseExpReward: number;
  evolution?: EvolutionCondition;
  learnset: { level: number; moveId: string }[];
  colorTheme: {
    primary: string;
    secondary: string;
    glow: string;
  };
}

export interface SoulDollInstance {
  uuid: string;
  speciesId: string;
  nickname: string;
  level: number;
  currentXp: number;
  xpToNext: number;
  currentHp: number;
  maxHp: number;
  stats: StatBlock;
  moves: Move[];
  status: StatusCondition | null;
  statusDuration?: number;
  isWild?: boolean;
}

export type ItemCategory = 'vial' | 'medicine' | 'evolution' | 'special';

export interface Item {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  count: number;
  price: number;
  catchMultiplier?: number;
  healHpAmount?: number;
  reviveRatio?: number;
  curesStatus?: boolean;
  evolutionTargetItem?: boolean;
}

export interface BattleAction {
  type: 'move' | 'item' | 'switch' | 'run' | 'vial';
  moveIndex?: number;
  itemId?: string;
  switchIndex?: number;
}

export interface BattleState {
  isActive: boolean;
  isTrainerBattle: boolean;
  trainerName?: string;
  phase: 
    | 'intro'
    | 'action_select' 
    | 'move_select' 
    | 'item_select' 
    | 'switch_select' 
    | 'executing_turn' 
    | 'capturing' 
    | 'level_up'
    | 'battle_end';
  playerActiveIndex: number;
  opponentDoll: SoulDollInstance;
  turnNumber: number;
  log: string[];
  pendingPlayerAction?: BattleAction;
  vialShakes?: number;
  vialSuccess?: boolean;
  turnMessageIndex?: number;
}

export type GameView = 'OVERWORLD' | 'BATTLE' | 'EVOLUTION' | 'PARTY' | 'BAG' | 'SOULDEX' | 'BOX';
