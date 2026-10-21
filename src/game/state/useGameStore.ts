import { useState, useEffect } from 'react';
import { SoulDollInstance, Item, BattleState, GameView, BattleAction, Move } from '../../types/game';
import { createSoulDoll, SOULDOLL_SPECIES } from '../data/souldolls';
import { ITEMS_DATABASE } from '../data/items';
import { combatEngine } from '../combat/CombatEngine';
import { sound } from '../audio/SoundEffects';

export interface GameState {
  view: GameView;
  playerParty: SoulDollInstance[];
  soulBox: SoulDollInstance[];
  inventory: Record<string, Item>;
  soulShards: number;
  seenSoulDolls: Set<string>;
  caughtSoulDolls: Set<string>;
  battleState: BattleState | null;
  evolutionCandidate: SoulDollInstance | null;
  activeDialogue: { speaker: string; text: string; onDismiss?: () => void } | null;
  toastMessage: string | null;
  playerPosition: { x: number; y: number; z: number };
}

// Initial state setup with Ignisaur + Aquafox starter party
const initialParty: SoulDollInstance[] = [
  createSoulDoll('ignisaur', 12),
  createSoulDoll('aquafox', 10),
];

const initialInventory: Record<string, Item> = {
  animus_vial: { ...ITEMS_DATABASE.animus_vial, count: 12 },
  great_vial: { ...ITEMS_DATABASE.great_vial, count: 5 },
  celestial_vial: { ...ITEMS_DATABASE.celestial_vial, count: 1 },
  soul_salve: { ...ITEMS_DATABASE.soul_salve, count: 6 },
  super_salve: { ...ITEMS_DATABASE.super_salve, count: 3 },
  revive_catalyst: { ...ITEMS_DATABASE.revive_catalyst, count: 2 },
  evolution_prism: { ...ITEMS_DATABASE.evolution_prism, count: 1 },
};

let globalState: GameState = {
  view: 'OVERWORLD',
  playerParty: initialParty,
  soulBox: [
    createSoulDoll('florabun', 8),
    createSoulDoll('sparkit', 9),
    createSoulDoll('geotort', 7),
  ],
  inventory: initialInventory,
  soulShards: 1250,
  seenSoulDolls: new Set(['ignisaur', 'aquafox', 'florabun', 'sparkit', 'geotort']),
  caughtSoulDolls: new Set(['ignisaur', 'aquafox', 'florabun', 'sparkit', 'geotort']),
  battleState: null,
  evolutionCandidate: null,
  activeDialogue: null,
  toastMessage: null,
  playerPosition: { x: 0, y: 0.8, z: 0 },
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => fn());
}

export const gameStore = {
  getState(): GameState {
    return globalState;
  },

  setState(partial: Partial<GameState>) {
    globalState = { ...globalState, ...partial };
    notify();
  },

  setView(view: GameView) {
    sound.playSelect();
    globalState.view = view;
    notify();
  },

  showToast(msg: string) {
    globalState.toastMessage = msg;
    notify();
    setTimeout(() => {
      if (globalState.toastMessage === msg) {
        globalState.toastMessage = null;
        notify();
      }
    }, 2800);
  },

  setDialogue(speaker: string, text: string, onDismiss?: () => void) {
    globalState.activeDialogue = { speaker, text, onDismiss };
    notify();
  },

  clearDialogue() {
    if (globalState.activeDialogue?.onDismiss) {
      globalState.activeDialogue.onDismiss();
    }
    globalState.activeDialogue = null;
    notify();
  },

  // Heal all party members at Sanctuary Shrine
  healParty() {
    sound.playHeal();
    globalState.playerParty.forEach(doll => {
      doll.currentHp = doll.maxHp;
      doll.status = null;
      doll.moves.forEach(m => (m.currentPp = m.maxPp));
    });
    this.showToast('¡Tus SoulDolls han sido sanados y revitalizados por completo!');
    notify();
  },

  // Start Wild or Trainer Battle
  startBattle(opponent: SoulDollInstance, isTrainer = false, trainerName?: string) {
    sound.playEncounter();
    // Register as seen in SoulDex
    globalState.seenSoulDolls.add(opponent.speciesId);

    // Pick first non-fainted doll
    let firstAliveIdx = globalState.playerParty.findIndex(d => d.currentHp > 0);
    if (firstAliveIdx === -1) {
      firstAliveIdx = 0;
      globalState.playerParty[0].currentHp = 10; // safety
    }

    const initialLog: string[] = isTrainer 
      ? [`¡El Domador ${trainerName} te desafía a un duelo!`, `¡${trainerName} envía a ${opponent.nickname}!` ]
      : [`¡Un ${opponent.nickname} salvaje ha aparecido!`, `¡Adelante, ${globalState.playerParty[firstAliveIdx].nickname}!`];

    globalState.battleState = {
      isActive: true,
      isTrainerBattle: isTrainer,
      trainerName,
      phase: 'action_select',
      playerActiveIndex: firstAliveIdx,
      opponentDoll: opponent,
      turnNumber: 1,
      log: initialLog,
    };
    globalState.view = 'BATTLE';
    notify();
  },

  // End battle
  endBattle(won = true) {
    globalState.battleState = null;
    globalState.view = 'OVERWORLD';
    if (won) {
      this.showToast('¡Has triunfado en el combate de almas!');
    }
    notify();
  },

  // Catch wild doll into party or box
  addCaughtSoulDoll(doll: SoulDollInstance) {
    globalState.caughtSoulDolls.add(doll.speciesId);
    globalState.seenSoulDolls.add(doll.speciesId);

    if (globalState.playerParty.length < 6) {
      globalState.playerParty.push(doll);
      this.showToast(`¡${doll.nickname} se unió a tu equipo!`);
    } else {
      globalState.soulBox.push(doll);
      this.showToast(`¡Equipo lleno! ${doll.nickname} fue enviado al Santuario.`);
    }
    notify();
  },

  // Consume item
  consumeItem(itemId: string): boolean {
    const item = globalState.inventory[itemId];
    if (item && item.count > 0) {
      item.count--;
      notify();
      return true;
    }
    return false;
  },

  // Use Medicine on a SoulDoll
  useMedicine(itemId: string, dollUuid: string): boolean {
    const item = globalState.inventory[itemId];
    const doll = globalState.playerParty.find(d => d.uuid === dollUuid);
    if (!item || item.count <= 0 || !doll) return false;

    if (item.healHpAmount) {
      if (doll.currentHp >= doll.maxHp) {
        this.showToast('¡La salud de este SoulDoll ya está al máximo!');
        return false;
      }
      doll.currentHp = Math.min(doll.maxHp, doll.currentHp + item.healHpAmount);
      item.count--;
      sound.playHeal();
      this.showToast(`¡Se restauraron ${item.healHpAmount} HP a ${doll.nickname}!`);
      notify();
      return true;
    }

    if (item.reviveRatio) {
      if (doll.currentHp > 0) {
        this.showToast('¡Este SoulDoll no está debilitado!');
        return false;
      }
      doll.currentHp = Math.floor(doll.maxHp * item.reviveRatio);
      item.count--;
      sound.playHeal();
      this.showToast(`¡${doll.nickname} ha vuelto al combate con fuerza restaurada!`);
      notify();
      return true;
    }

    if (item.evolutionTargetItem) {
      const species = SOULDOLL_SPECIES[doll.speciesId];
      if (species.evolution) {
        item.count--;
        this.startEvolutionSequence(doll);
        return true;
      } else {
        this.showToast('¡Este SoulDoll no posee una metamorfosis ascendida!');
        return false;
      }
    }

    return false;
  },

  // Trigger dynamic evolution screen
  startEvolutionSequence(doll: SoulDollInstance) {
    sound.playEvolution();
    globalState.evolutionCandidate = doll;
    globalState.view = 'EVOLUTION';
    notify();
  },

  // Confirm evolution completed
  completeEvolution() {
    if (!globalState.evolutionCandidate) return;
    const res = combatEngine.evolveSoulDoll(globalState.evolutionCandidate);
    if (res.success) {
      globalState.caughtSoulDolls.add(globalState.evolutionCandidate.speciesId);
      globalState.seenSoulDolls.add(globalState.evolutionCandidate.speciesId);
    }
    notify();
  }
};

export function useGameStore() {
  const [state, setState] = useState(gameStore.getState());

  useEffect(() => {
    const handler = () => setState({ ...gameStore.getState() });
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return state;
}
