import { ElementalType } from '../../types/game';

export const TYPE_COLORS: Record<ElementalType, { bg: string; text: string; border: string }> = {
  Fire: { bg: '#ef4444', text: '#ffffff', border: '#b91c1c' },
  Water: { bg: '#3b82f6', text: '#ffffff', border: '#1d4ed8' },
  Nature: { bg: '#22c55e', text: '#ffffff', border: '#15803d' },
  Electric: { bg: '#eab308', text: '#000000', border: '#a16207' },
  Earth: { bg: '#d97706', text: '#ffffff', border: '#92400e' },
  Frost: { bg: '#06b6d4', text: '#ffffff', border: '#0e7490' },
  Wind: { bg: '#a855f7', text: '#ffffff', border: '#7e22ce' },
  Shadow: { bg: '#64748b', text: '#ffffff', border: '#334155' },
  Light: { bg: '#fef08a', text: '#854d0e', border: '#eab308' },
  Poison: { bg: '#a21caf', text: '#ffffff', border: '#701a75' }
};

// Attacker -> Defender -> Multiplier
const EFFECTIVENESS_MATRIX: Record<ElementalType, Partial<Record<ElementalType, number>>> = {
  Fire: {
    Nature: 2.0,
    Frost: 2.0,
    Water: 0.5,
    Fire: 0.5,
    Earth: 0.5,
  },
  Water: {
    Fire: 2.0,
    Earth: 2.0,
    Water: 0.5,
    Nature: 0.5,
  },
  Nature: {
    Water: 2.0,
    Earth: 2.0,
    Fire: 0.5,
    Nature: 0.5,
    Poison: 0.5,
    Wind: 0.5,
  },
  Electric: {
    Water: 2.0,
    Wind: 2.0,
    Electric: 0.5,
    Earth: 0.0, // Immunity
    Nature: 0.5,
  },
  Earth: {
    Fire: 2.0,
    Electric: 2.0,
    Poison: 2.0,
    Frost: 2.0,
    Wind: 0.0, // Flying/Wind is immune to ground
    Nature: 0.5,
  },
  Frost: {
    Nature: 2.0,
    Earth: 2.0,
    Wind: 2.0,
    Fire: 0.5,
    Water: 0.5,
    Frost: 0.5,
  },
  Wind: {
    Nature: 2.0,
    Electric: 0.5,
    Earth: 1.0,
    Frost: 0.5,
  },
  Shadow: {
    Light: 2.0,
    Shadow: 0.5,
    Poison: 1.0,
  },
  Light: {
    Shadow: 2.0,
    Poison: 2.0,
    Light: 0.5,
  },
  Poison: {
    Nature: 2.0,
    Light: 0.5,
    Poison: 0.5,
    Earth: 0.5,
  }
};

export function getTypeEffectiveness(
  attackType: ElementalType, 
  targetTypes: [ElementalType, ElementalType?]
): number {
  let multiplier = 1.0;
  
  const mult1 = EFFECTIVENESS_MATRIX[attackType]?.[targetTypes[0]];
  if (mult1 !== undefined) multiplier *= mult1;

  if (targetTypes[1]) {
    const mult2 = EFFECTIVENESS_MATRIX[attackType]?.[targetTypes[1]];
    if (mult2 !== undefined) multiplier *= mult2;
  }

  return multiplier;
}
