import { SoulDollInstance, Move, Item, BattleState, BattleAction, StatBlock } from '../../types/game';
import { SOULDOLL_SPECIES, createSoulDoll } from '../data/souldolls';
import { getTypeEffectiveness } from '../data/typesChart';
import { sound } from '../audio/SoundEffects';

export interface TurnExecutionResult {
  playerDamageTaken: number;
  opponentDamageTaken: number;
  playerFainted: boolean;
  opponentFainted: boolean;
  expGained?: number;
  leveledUp?: boolean;
  evolutionReady?: boolean;
  captureSuccess?: boolean;
  captureShakes?: number;
  messages: string[];
}

export class CombatEngine {
  /**
   * Calculates damage dealt from an attacker to a defender using a move
   */
  public calculateDamage(
    attacker: SoulDollInstance,
    defender: SoulDollInstance,
    move: Move
  ): { damage: number; isCrit: boolean; typeMultiplier: number; isStab: boolean } {
    if (move.power === 0) {
      return { damage: 0, isCrit: false, typeMultiplier: 1.0, isStab: false };
    }

    const attackerSpecies = SOULDOLL_SPECIES[attacker.speciesId] || SOULDOLL_SPECIES.ignisaur;
    const defenderSpecies = SOULDOLL_SPECIES[defender.speciesId] || SOULDOLL_SPECIES.ignisaur;

    const isPhysical = move.category === 'Physical';
    const attackStat = isPhysical ? attacker.stats.atk : attacker.stats.spAtk;
    const defenseStat = isPhysical ? defender.stats.def : defender.stats.spDef;

    // Check STAB (Same-Type-Attack-Bonus: 1.5x)
    const isStab = attackerSpecies.types.includes(move.type);
    const stabMultiplier = isStab ? 1.5 : 1.0;

    // Type effectiveness
    const typeMultiplier = getTypeEffectiveness(move.type, defenderSpecies.types);

    // Critical Hit (6.25% standard base chance)
    const isCrit = Math.random() < 0.08;
    const critMultiplier = isCrit ? 1.5 : 1.0;

    // Damage Formula
    const levelFactor = Math.floor((2 * attacker.level) / 5) + 2;
    const baseDamage = Math.floor(((levelFactor * move.power * (attackStat / Math.max(1, defenseStat))) / 50) + 2);

    // Random variance: 85% to 100%
    const randomVariation = (Math.floor(Math.random() * 16) + 85) / 100;

    let finalDamage = Math.floor(baseDamage * stabMultiplier * typeMultiplier * critMultiplier * randomVariation);

    if (typeMultiplier === 0) {
      finalDamage = 0;
    } else {
      finalDamage = Math.max(1, finalDamage);
    }

    return { damage: finalDamage, isCrit, typeMultiplier, isStab };
  }

  /**
   * Resolves capture attempt with a Soul Vial (Animus Capsule)
   */
  public attemptCapture(
    target: SoulDollInstance,
    vial: Item
  ): { success: boolean; shakes: number; messages: string[] } {
    const species = SOULDOLL_SPECIES[target.speciesId] || SOULDOLL_SPECIES.ignisaur;
    const ballMultiplier = vial.catchMultiplier || 1.0;

    // Immediate 100% guarantee for Master/Celestial Vial
    if (ballMultiplier >= 250) {
      return {
        success: true,
        shakes: 3,
        messages: [
          `¡Lanzaste ${vial.name}!`,
          `¡El destello cósmico envuelve el alma de ${target.nickname}!`,
          '¡Tembló una vez!',
          '¡Tembló dos veces!',
          '¡Tembló tres veces!',
          `¡Genial! ¡${target.nickname} ha sido capturado con éxito!`
        ]
      };
    }

    // Status bonus: Freeze/Sleep = 2.0x, Burn/Poison/Paralysis = 1.5x
    let statusBonus = 1.0;
    if (target.status === 'freeze' || target.status === 'sleep') statusBonus = 2.0;
    else if (target.status === 'burn' || target.status === 'poison' || target.status === 'paralysis') statusBonus = 1.5;

    // Pokémon-like modified catch rate formula:
    // a = ((3*MaxHP - 2*CurrentHP) * CatchRate * BallMultiplier * StatusBonus) / (3*MaxHP)
    const maxHp = target.maxHp;
    const curHp = Math.max(1, target.currentHp);
    const hpFactor = (3 * maxHp - 2 * curHp) / (3 * maxHp);
    const modifiedCatchRate = Math.min(255, Math.floor(species.catchRate * ballMultiplier * hpFactor * statusBonus));

    // Calculate shake probability b = 65536 / (255 / a)^0.25
    const b = Math.floor(65536 / Math.pow(255 / Math.max(1, modifiedCatchRate), 0.25));

    let shakes = 0;
    for (let i = 0; i < 3; i++) {
      const roll = Math.floor(Math.random() * 65536);
      if (roll < b) {
        shakes++;
      } else {
        break;
      }
    }

    const success = shakes === 3;
    const msgs: string[] = [`¡Lanzaste ${vial.name} hacia ${target.nickname}!`];

    if (shakes > 0) msgs.push('¡El vial vibra una vez...');
    if (shakes > 1) msgs.push('¡El vial vibra dos veces...');
    if (shakes > 2) msgs.push('¡El vial vibra tres veces...');

    if (success) {
      msgs.push(`¡Clic! ¡El alma resonó en sintonía! ¡${target.nickname} ha sido capturado!`);
    } else {
      msgs.push(`¡Oh, no! ¡${target.nickname} logró liberarse del vial!`);
    }

    return { success, shakes, messages: msgs };
  }

  /**
   * Applies Experience and checks for level-up and evolution readiness
   */
  public awardExp(
    winner: SoulDollInstance,
    defeated: SoulDollInstance,
    isTrainer = false
  ): { expGained: number; leveledUp: boolean; evolutionReady: boolean; messages: string[] } {
    const defeatedSpecies = SOULDOLL_SPECIES[defeated.speciesId] || SOULDOLL_SPECIES.ignisaur;
    const trainerBonus = isTrainer ? 1.5 : 1.0;
    const expGained = Math.floor((defeatedSpecies.baseExpReward * defeated.level * trainerBonus) / 7);

    winner.currentXp += expGained;
    const msgs: string[] = [`¡${winner.nickname} ganó ${expGained} puntos de EXP!`];
    let leveledUp = false;
    let evolutionReady = false;

    // Check for level ups
    while (winner.currentXp >= winner.xpToNext && winner.level < 100) {
      winner.level++;
      leveledUp = true;
      winner.xpToNext = Math.floor(Math.pow(winner.level + 1, 3));

      // Recalculate stats with new level
      const species = SOULDOLL_SPECIES[winner.speciesId] || SOULDOLL_SPECIES.ignisaur;
      const calcHp = Math.floor(((2 * species.baseStats.hp + 15) * winner.level) / 100) + winner.level + 10;
      const calcStat = (base: number) => Math.floor(((2 * base + 15) * winner.level) / 100) + 5;

      const hpGain = calcHp - winner.maxHp;
      winner.maxHp = calcHp;
      winner.currentHp += Math.max(1, hpGain);
      winner.stats = {
        hp: calcHp,
        atk: calcStat(species.baseStats.atk),
        def: calcStat(species.baseStats.def),
        spAtk: calcStat(species.baseStats.spAtk),
        spDef: calcStat(species.baseStats.spDef),
        spd: calcStat(species.baseStats.spd),
      };

      msgs.push(`¡${winner.nickname} subió al Nivel ${winner.level}!`);

      // Check if new move is learned at this level
      const newMoveEntry = species.learnset.find(l => l.level === winner.level);
      if (newMoveEntry) {
        const moveInstance = { ...newMoveEntry, ...species };
        if (winner.moves.length < 4) {
          const moveData = SOULDOLL_SPECIES[winner.speciesId];
          // We can push if less than 4
        }
      }

      // Check if evolution threshold reached
      if (species.evolution?.level && winner.level >= species.evolution.level) {
        evolutionReady = true;
        msgs.push(`¿Qué está pasando? ¡El alma de ${winner.nickname} resuena intensamente!`);
      }
    }

    return { expGained, leveledUp, evolutionReady, messages: msgs };
  }

  /**
   * Evolves a SoulDoll into its target species
   */
  public evolveSoulDoll(doll: SoulDollInstance): { success: boolean; newSpeciesName: string; messages: string[] } {
    const currentSpecies = SOULDOLL_SPECIES[doll.speciesId];
    if (!currentSpecies?.evolution) {
      return { success: false, newSpeciesName: '', messages: ['Este SoulDoll no puede evolucionar.'] };
    }

    const evolvedSpecies = SOULDOLL_SPECIES[currentSpecies.evolution.evolvesInto];
    if (!evolvedSpecies) {
      return { success: false, newSpeciesName: '', messages: ['Especie de evolución desconocida.'] };
    }

    const prevName = doll.nickname === currentSpecies.name ? currentSpecies.name : doll.nickname;
    doll.speciesId = evolvedSpecies.id;
    if (doll.nickname === currentSpecies.name) {
      doll.nickname = evolvedSpecies.name;
    }

    // Recalculate stats based on evolved base stats
    const calcHp = Math.floor(((2 * evolvedSpecies.baseStats.hp + 15) * doll.level) / 100) + doll.level + 10;
    const calcStat = (base: number) => Math.floor(((2 * base + 15) * doll.level) / 100) + 5;

    const hpIncrease = calcHp - doll.maxHp;
    doll.maxHp = calcHp;
    doll.currentHp = Math.min(doll.maxHp, doll.currentHp + Math.max(5, hpIncrease));
    doll.stats = {
      hp: calcHp,
      atk: calcStat(evolvedSpecies.baseStats.atk),
      def: calcStat(evolvedSpecies.baseStats.def),
      spAtk: calcStat(evolvedSpecies.baseStats.spAtk),
      spDef: calcStat(evolvedSpecies.baseStats.spDef),
      spd: calcStat(evolvedSpecies.baseStats.spd),
    };

    return {
      success: true,
      newSpeciesName: evolvedSpecies.name,
      messages: [
        `¡Felicidades! ¡Tu ${prevName} ha evolucionado en ${evolvedSpecies.name}!`,
        `¡Sus estadísticas base y sintonía elemental han aumentado drásticamente!`
      ]
    };
  }
}

export const combatEngine = new CombatEngine();
