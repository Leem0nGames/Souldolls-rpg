import { SoulDollSpecies, SoulDollInstance } from '../../types/game';
import { createMoveInstance } from './moves';

export const SOULDOLL_SPECIES: Record<string, SoulDollSpecies> = {
  // 1. Tomo -> Tomoe -> Tomoe Musashi
  ignisaur: {
    id: 'ignisaur',
    name: 'Tomo',
    stage: 1,
    types: ['Fire'],
    baseStats: { hp: 55, atk: 62, def: 50, spAtk: 65, spDef: 55, spd: 58 },
    description: 'Una lagartija de brasa que porta una gema ardiente en el pecho. Sus llamas crecen según el fervor de su alma.',
    catchRate: 190,
    baseExpReward: 64,
    evolution: { level: 16, evolvesInto: 'pyrodrake' },
    learnset: [
      { level: 1, moveId: 'ember' },
      { level: 6, moveId: 'flame_claw' },
      { level: 12, moveId: 'inferno_surge' }
    ],
    colorTheme: { primary: '#f97316', secondary: '#ef4444', glow: '#fbbf24' }
  },
  pyrodrake: {
    id: 'pyrodrake',
    name: 'Tomoe',
    stage: 2,
    types: ['Fire', 'Wind'],
    baseStats: { hp: 80, atk: 95, def: 75, spAtk: 105, spDef: 80, spd: 90 },
    description: 'Forma ascendida de Tomo. Ha despertado alas de fuego astral capaces de evaporar lagos con un solo aleteo.',
    catchRate: 45,
    baseExpReward: 180,
    evolution: { level: 26, evolvesInto: 'tomomusashi' },
    learnset: [
      { level: 1, moveId: 'ember' },
      { level: 6, moveId: 'flame_claw' },
      { level: 12, moveId: 'inferno_surge' },
      { level: 18, moveId: 'sky_slash' },
      { level: 24, moveId: 'hurricane_drill' }
    ],
    colorTheme: { primary: '#dc2626', secondary: '#ea580c', glow: '#fde047' }
  },
  tomomusashi: {
    id: 'tomomusashi',
    name: 'Tomoe Musashi',
    stage: 3,
    types: ['Fire', 'Light'],
    baseStats: { hp: 108, atk: 122, def: 98, spAtk: 138, spDef: 108, spd: 116 },
    description: 'Forma final de la linea de Tomo. Su hoja astral corta el aire y deja una estela de luz alli donde pasa.',
    catchRate: 32,
    baseExpReward: 320,
    learnset: [
      { level: 1, moveId: 'ember' },
      { level: 6, moveId: 'flame_claw' },
      { level: 12, moveId: 'inferno_surge' },
      { level: 18, moveId: 'sky_slash' },
      { level: 22, moveId: 'astral_beam' },
      { level: 26, moveId: 'hurricane_drill' },
      { level: 30, moveId: 'soul_purge' },
      { level: 36, moveId: 'divine_radiance' }
    ],
    colorTheme: { primary: '#f59e0b', secondary: '#b91c1c', glow: '#fef3c7' }
  },

  // 2. Aquafox -> Tidewraith
  aquafox: {
    id: 'aquafox',
    name: 'Aquafox',
    stage: 1,
    types: ['Water'],
    baseStats: { hp: 50, atk: 52, def: 55, spAtk: 68, spDef: 65, spd: 65 },
    description: 'Un zorro místico con colas de agua cristalina. Puede purificar fuentes contaminadas con su presencia.',
    catchRate: 190,
    baseExpReward: 63,
    evolution: { level: 16, evolvesInto: 'tidewraith' },
    learnset: [
      { level: 1, moveId: 'hydro_jet' },
      { level: 5, moveId: 'bubble_veil' },
      { level: 11, moveId: 'aqua_fang' },
      { level: 15, moveId: 'tidal_maelstrom' }
    ],
    colorTheme: { primary: '#38bdf8', secondary: '#0284c7', glow: '#7dd3fc' }
  },
  tidewraith: {
    id: 'tidewraith',
    name: 'Tidewraith',
    stage: 2,
    types: ['Water', 'Shadow'],
    baseStats: { hp: 75, atk: 75, def: 75, spAtk: 110, spDef: 95, spd: 95 },
    description: 'Espíritu de las profundidades abisales. Se desplaza a través de la niebla oceánica como un espectro.',
    catchRate: 45,
    baseExpReward: 182,
    learnset: [
      { level: 1, moveId: 'hydro_jet' },
      { level: 5, moveId: 'bubble_veil' },
      { level: 11, moveId: 'aqua_fang' },
      { level: 15, moveId: 'tidal_maelstrom' },
      { level: 20, moveId: 'night_terror' },
      { level: 25, moveId: 'eclipse_strike' }
    ],
    colorTheme: { primary: '#0369a1', secondary: '#1e1b4b', glow: '#38bdf8' }
  },

  // 3. Florabun -> Chlorosage
  florabun: {
    id: 'florabun',
    name: 'Florabun',
    stage: 1,
    types: ['Nature'],
    baseStats: { hp: 60, atk: 48, def: 60, spAtk: 62, spDef: 65, spd: 50 },
    description: 'Una criatura botánica de orejas florales. Emite un aroma dulce que serena el corazón de los viajeros.',
    catchRate: 190,
    baseExpReward: 64,
    evolution: { level: 16, evolvesInto: 'chlorosage' },
    learnset: [
      { level: 1, moveId: 'leaf_shuriken' },
      { level: 6, moveId: 'photosynthesis' },
      { level: 11, moveId: 'thorn_whip' },
      { level: 15, moveId: 'verdant_wrath' }
    ],
    colorTheme: { primary: '#4ade80', secondary: '#16a34a', glow: '#bbf7d0' }
  },
  chlorosage: {
    id: 'chlorosage',
    name: 'Chlorosage',
    stage: 2,
    types: ['Nature', 'Earth'],
    baseStats: { hp: 90, atk: 75, def: 95, spAtk: 95, spDef: 100, spd: 70 },
    description: 'Chamán vegetal coronado por un loto milenario. Canaliza la savia primordial del bosque para sanar y defender.',
    catchRate: 45,
    baseExpReward: 185,
    learnset: [
      { level: 1, moveId: 'leaf_shuriken' },
      { level: 6, moveId: 'photosynthesis' },
      { level: 11, moveId: 'thorn_whip' },
      { level: 15, moveId: 'verdant_wrath' },
      { level: 20, moveId: 'earth_tremor' },
      { level: 26, moveId: 'avalanche' }
    ],
    colorTheme: { primary: '#15803d', secondary: '#854d0e', glow: '#86efac' }
  },

  // 4. Sparkit -> Voltaglyph
  sparkit: {
    id: 'sparkit',
    name: 'Sparkit',
    stage: 1,
    types: ['Electric'],
    baseStats: { hp: 45, atk: 55, def: 40, spAtk: 70, spDef: 50, spd: 90 },
    description: 'Un pequeño felino eléctrico que almacena rayos en sus almohadillas. Es travieso y siempre vibra de energía.',
    catchRate: 180,
    baseExpReward: 65,
    evolution: { level: 18, evolvesInto: 'voltaglyph' },
    learnset: [
      { level: 1, moveId: 'volt_spark' },
      { level: 6, moveId: 'static_field' },
      { level: 12, moveId: 'thunder_strike' },
      { level: 17, moveId: 'overcharge' }
    ],
    colorTheme: { primary: '#facc15', secondary: '#ca8a04', glow: '#fef08a' }
  },
  voltaglyph: {
    id: 'voltaglyph',
    name: 'Voltaglyph',
    stage: 2,
    types: ['Electric', 'Light'],
    baseStats: { hp: 70, atk: 80, def: 65, spAtk: 115, spDef: 75, spd: 120 },
    description: 'Forma electromagnética pura rodeada de glifos de relámpago flotantes. Se teletransporta a la velocidad del rayo.',
    catchRate: 45,
    baseExpReward: 188,
    learnset: [
      { level: 1, moveId: 'volt_spark' },
      { level: 6, moveId: 'static_field' },
      { level: 12, moveId: 'thunder_strike' },
      { level: 17, moveId: 'overcharge' },
      { level: 22, moveId: 'astral_beam' },
      { level: 28, moveId: 'divine_radiance' }
    ],
    colorTheme: { primary: '#eab308', secondary: '#3b82f6', glow: '#ffffff' }
  },

  // 5. Geotort -> Titancrust
  geotort: {
    id: 'geotort',
    name: 'Geotort',
    stage: 1,
    types: ['Earth'],
    baseStats: { hp: 65, atk: 60, def: 85, spAtk: 40, spDef: 60, spd: 30 },
    description: 'Tortuga con caparazón de granito pulido. Puede soportar la caída de peñascos sin inmutarse.',
    catchRate: 170,
    baseExpReward: 62,
    evolution: { level: 20, evolvesInto: 'titancrust' },
    learnset: [
      { level: 1, moveId: 'pebble_barrage' },
      { level: 5, moveId: 'stone_fortress' },
      { level: 12, moveId: 'earth_tremor' },
      { level: 18, moveId: 'avalanche' }
    ],
    colorTheme: { primary: '#b45309', secondary: '#78350f', glow: '#d97706' }
  },
  titancrust: {
    id: 'titancrust',
    name: 'Titancrust',
    stage: 2,
    types: ['Earth', 'Fire'],
    baseStats: { hp: 95, atk: 100, def: 130, spAtk: 65, spDef: 85, spd: 45 },
    description: 'Un titán acorazado con fisuras de magma en su armadura de basalto. Su pisada hace temblar valles enteros.',
    catchRate: 45,
    baseExpReward: 190,
    learnset: [
      { level: 1, moveId: 'pebble_barrage' },
      { level: 5, moveId: 'stone_fortress' },
      { level: 12, moveId: 'earth_tremor' },
      { level: 18, moveId: 'avalanche' },
      { level: 23, moveId: 'flame_claw' },
      { level: 29, moveId: 'inferno_surge' }
    ],
    colorTheme: { primary: '#78350f', secondary: '#b91c1c', glow: '#f97316' }
  },

  // 6. Umbraling -> Nyxwing
  umbraling: {
    id: 'umbraling',
    name: 'Umbraling',
    stage: 1,
    types: ['Shadow'],
    baseStats: { hp: 45, atk: 65, def: 45, spAtk: 60, spDef: 45, spd: 75 },
    description: 'Un duende de sombras que habita en los rincones oscuros del bosque. Se alimenta de dudas y temores fugaces.',
    catchRate: 180,
    baseExpReward: 63,
    evolution: { level: 18, evolvesInto: 'nyxwing' },
    learnset: [
      { level: 1, moveId: 'shadow_sneak' },
      { level: 6, moveId: 'acid_spit' },
      { level: 12, moveId: 'night_terror' },
      { level: 17, moveId: 'eclipse_strike' }
    ],
    colorTheme: { primary: '#475569', secondary: '#1e1b4b', glow: '#a855f7' }
  },
  nyxwing: {
    id: 'nyxwing',
    name: 'Nyxwing',
    stage: 2,
    types: ['Shadow', 'Wind'],
    baseStats: { hp: 70, atk: 105, def: 65, spAtk: 90, spDef: 70, spd: 115 },
    description: 'Gárgola alada nacida de la medianoche eterna. Sus garras desvanecen la luz de las antorchas a su paso.',
    catchRate: 45,
    baseExpReward: 186,
    learnset: [
      { level: 1, moveId: 'shadow_sneak' },
      { level: 6, moveId: 'acid_spit' },
      { level: 12, moveId: 'night_terror' },
      { level: 17, moveId: 'eclipse_strike' },
      { level: 21, moveId: 'sky_slash' },
      { level: 27, moveId: 'hurricane_drill' }
    ],
    colorTheme: { primary: '#312e81', secondary: '#0f172a', glow: '#818cf8' }
  },

  // 7. Lumiwisp -> Seraphina
  lumiwisp: {
    id: 'lumiwisp',
    name: 'Lumiwisp',
    stage: 1,
    types: ['Light'],
    baseStats: { hp: 50, atk: 40, def: 50, spAtk: 72, spDef: 70, spd: 65 },
    description: 'Orbe etéreo resplandeciente que guía a las almas extraviadas. Nunca proyecta sombra propia.',
    catchRate: 175,
    baseExpReward: 65,
    evolution: { level: 18, evolvesInto: 'seraphina' },
    learnset: [
      { level: 1, moveId: 'astral_beam' },
      { level: 7, moveId: 'bubble_veil' },
      { level: 12, moveId: 'soul_purge' },
      { level: 17, moveId: 'divine_radiance' }
    ],
    colorTheme: { primary: '#fef08a', secondary: '#facc15', glow: '#ffffff' }
  },
  seraphina: {
    id: 'seraphina',
    name: 'Seraphina',
    stage: 2,
    types: ['Light', 'Nature'],
    baseStats: { hp: 75, atk: 65, def: 75, spAtk: 118, spDef: 110, spd: 90 },
    description: 'Valquiria angélica con seis alas de prisma solar. Su cántico devuelve la vida a la tierra marchita.',
    catchRate: 40,
    baseExpReward: 192,
    learnset: [
      { level: 1, moveId: 'astral_beam' },
      { level: 7, moveId: 'bubble_veil' },
      { level: 12, moveId: 'soul_purge' },
      { level: 17, moveId: 'divine_radiance' },
      { level: 22, moveId: 'photosynthesis' },
      { level: 28, moveId: 'verdant_wrath' }
    ],
    colorTheme: { primary: '#eab308', secondary: '#15803d', glow: '#fef9c3' }
  },

  // 8. Cryopup -> Blizzardworg
  cryopup: {
    id: 'cryopup',
    name: 'Cryopup',
    stage: 1,
    types: ['Frost'],
    baseStats: { hp: 55, atk: 65, def: 50, spAtk: 45, spDef: 50, spd: 68 },
    description: 'Cachorro de pelaje escarchado nativo de las cumbres nevadas. Puede crear cristales de hielo al respirar.',
    catchRate: 185,
    baseExpReward: 64,
    evolution: { level: 16, evolvesInto: 'blizzardworg' },
    learnset: [
      { level: 1, moveId: 'frost_nibble' },
      { level: 6, moveId: 'icicle_lance' },
      { level: 14, moveId: 'absolute_zero' }
    ],
    colorTheme: { primary: '#67e8f9', secondary: '#06b6d4', glow: '#cffafe' }
  },
  blizzardworg: {
    id: 'blizzardworg',
    name: 'Blizzardworg',
    stage: 2,
    types: ['Frost', 'Earth'],
    baseStats: { hp: 85, atk: 110, def: 85, spAtk: 70, spDef: 75, spd: 95 },
    description: 'Lobo glacial de colmillos de estalactita. Lidera manadas aullando tempestades de nieve eterna.',
    catchRate: 45,
    baseExpReward: 185,
    learnset: [
      { level: 1, moveId: 'frost_nibble' },
      { level: 6, moveId: 'icicle_lance' },
      { level: 14, moveId: 'absolute_zero' },
      { level: 19, moveId: 'earth_tremor' },
      { level: 25, moveId: 'avalanche' }
    ],
    colorTheme: { primary: '#0891b2', secondary: '#78350f', glow: '#a5f3fc' }
  },

  // 9. Venomantis -> Toxiscythe
  venomantis: {
    id: 'venomantis',
    name: 'Venomantis',
    stage: 1,
    types: ['Poison'],
    baseStats: { hp: 50, atk: 70, def: 55, spAtk: 50, spDef: 50, spd: 65 },
    description: 'Mantis venenosa camuflada entre hongos ponzoñosos. Sus cuchillas gotean una toxina paralizante.',
    catchRate: 180,
    baseExpReward: 63,
    evolution: { level: 18, evolvesInto: 'toxiscythe' },
    learnset: [
      { level: 1, moveId: 'acid_spit' },
      { level: 6, moveId: 'toxic_needle' },
      { level: 13, moveId: 'venomous_cross' }
    ],
    colorTheme: { primary: '#c026d3', secondary: '#701a75', glow: '#f0abfc' }
  },
  toxiscythe: {
    id: 'toxiscythe',
    name: 'Toxiscythe',
    stage: 2,
    types: ['Poison', 'Shadow'],
    baseStats: { hp: 75, atk: 115, def: 80, spAtk: 70, spDef: 75, spd: 105 },
    description: 'Asesino silencioso de guadañas bio-metálicas. Su neurotoxina corroe incluso aleaciones blindadas.',
    catchRate: 45,
    baseExpReward: 187,
    learnset: [
      { level: 1, moveId: 'acid_spit' },
      { level: 6, moveId: 'toxic_needle' },
      { level: 13, moveId: 'venomous_cross' },
      { level: 20, moveId: 'shadow_sneak' },
      { level: 26, moveId: 'eclipse_strike' }
    ],
    colorTheme: { primary: '#86198f', secondary: '#1e1b4b', glow: '#d946ef' }
  },

  // 10. Aerochick -> Zephyrion
  aerochick: {
    id: 'aerochick',
    name: 'Aerochick',
    stage: 1,
    types: ['Wind'],
    baseStats: { hp: 45, atk: 55, def: 45, spAtk: 55, spDef: 50, spd: 80 },
    description: 'Pichón celeste que atrapa corrientes térmicas para planear sobre praderas antes de aprender a volar.',
    catchRate: 190,
    baseExpReward: 60,
    evolution: { level: 16, evolvesInto: 'zephyrion' },
    learnset: [
      { level: 1, moveId: 'gust' },
      { level: 6, moveId: 'sky_slash' },
      { level: 14, moveId: 'hurricane_drill' }
    ],
    colorTheme: { primary: '#c084fc', secondary: '#7e22ce', glow: '#e9d5ff' }
  },
  zephyrion: {
    id: 'zephyrion',
    name: 'Zephyrion',
    stage: 2,
    types: ['Wind', 'Electric'],
    baseStats: { hp: 75, atk: 90, def: 70, spAtk: 105, spDef: 75, spd: 115 },
    description: 'Halcón de tempestad envuelto en vórtices de trueno. Desciende en picada rasgando nubes a velocidad supersónica.',
    catchRate: 45,
    baseExpReward: 186,
    learnset: [
      { level: 1, moveId: 'gust' },
      { level: 6, moveId: 'sky_slash' },
      { level: 14, moveId: 'hurricane_drill' },
      { level: 19, moveId: 'thunder_strike' },
      { level: 25, moveId: 'overcharge' }
    ],
    colorTheme: { primary: '#9333ea', secondary: '#ca8a04', glow: '#facc15' }
  }
};

/**
 * Factory to create a customized SoulDoll instance for a given species and level
 */
export function createSoulDoll(speciesId: string, level: number, isWild = false): SoulDollInstance {
  const species = SOULDOLL_SPECIES[speciesId] || SOULDOLL_SPECIES.ignisaur;
  
  // Calculate scaled stats based on base stats & level
  const calcHp = Math.floor(((2 * species.baseStats.hp + 15) * level) / 100) + level + 10;
  const calcStat = (base: number) => Math.floor(((2 * base + 15) * level) / 100) + 5;

  const stats = {
    hp: calcHp,
    atk: calcStat(species.baseStats.atk),
    def: calcStat(species.baseStats.def),
    spAtk: calcStat(species.baseStats.spAtk),
    spDef: calcStat(species.baseStats.spDef),
    spd: calcStat(species.baseStats.spd),
  };

  // Determine moves learned up to this level
  const eligibleMoves = species.learnset.filter(l => l.level <= level);
  const selectedMoves = eligibleMoves.slice(-4).map(l => createMoveInstance(l.moveId));
  if (selectedMoves.length === 0 && species.learnset.length > 0) {
    selectedMoves.push(createMoveInstance(species.learnset[0].moveId));
  }

  // XP progression: level^3 formula
  const currentXp = Math.floor(Math.pow(level, 3));
  const xpToNext = Math.floor(Math.pow(level + 1, 3));

  return {
    uuid: `doll_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    speciesId: species.id,
    nickname: species.name,
    level,
    currentXp,
    xpToNext,
    currentHp: stats.hp,
    maxHp: stats.hp,
    stats,
    moves: selectedMoves,
    status: null,
    isWild
  };
}
