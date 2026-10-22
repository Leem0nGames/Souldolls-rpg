import React, { useState } from 'react';
import { useGameStore, gameStore } from '../game/state/useGameStore';
import { SOULDOLL_SPECIES } from '../game/data/souldolls';
import { TYPE_COLORS } from '../game/data/typesChart';
import { sound } from '../game/audio/SoundEffects';
import { BookOpen, X, CheckCircle2, Eye, Shield, Zap, Heart, Sparkles, Filter } from 'lucide-react';
import { ElementalType } from '../types/game';

export const SoulDexModal: React.FC = () => {
  const state = useGameStore();
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string>('ignisaur');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  if (state.view !== 'SOULDEX') return null;

  const speciesList = Object.values(SOULDOLL_SPECIES);
  const filteredList = typeFilter === 'ALL'
    ? speciesList
    : speciesList.filter(s => s.types.includes(typeFilter as ElementalType));

  const selectedSpecies = SOULDOLL_SPECIES[selectedSpeciesId] || speciesList[0];
  const isCaught = state.caughtSoulDolls.has(selectedSpecies.id);
  const isSeen = state.seenSoulDolls.has(selectedSpecies.id) || isCaught;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4 select-none">
      <div className="relative max-w-4xl w-full bg-slate-900 border-4 border-slate-700 pixel-box rounded-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-slate-950 px-5 py-3 border-b border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <h2 className="font-pixel text-xs md:text-sm text-indigo-300 tracking-wider">
              SOULDEX - REGISTRO DE ALMAS PRIMORDIALES
            </h2>
          </div>
          <button
            onClick={() => {
              sound.playSelect();
              gameStore.setView('OVERWORLD');
            }}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: Left List + Right Detail Inspector */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left: Species Grid */}
          <div className="w-full md:w-1/2 p-3 sm:p-4 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col max-h-[35vh] md:max-h-none overflow-hidden shrink-0 md:shrink">
            {/* Type Filter Buttons */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none">
              <button
                onClick={() => setTypeFilter('ALL')}
                className={`px-2 py-1 rounded font-pixel text-[9px] ${
                  typeFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                TODOS
              </button>
              {(['Fire', 'Water', 'Nature', 'Electric', 'Earth', 'Frost', 'Wind', 'Shadow', 'Light', 'Poison'] as ElementalType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-2 py-1 rounded font-pixel text-[8px] whitespace-nowrap ${
                    typeFilter === t ? 'ring-2 ring-white text-white' : 'opacity-80'
                  }`}
                  style={{ backgroundColor: (TYPE_COLORS as Record<string, { bg: string; text: string }>)[t]?.bg, color: (TYPE_COLORS as Record<string, { bg: string; text: string }>)[t]?.text }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredList.map((species, i) => {
                const caught = state.caughtSoulDolls.has(species.id);
                const seen = state.seenSoulDolls.has(species.id) || caught;
                const isSelected = selectedSpeciesId === species.id;

                return (
                  <button
                    key={species.id}
                    onClick={() => {
                      sound.playSelect();
                      setSelectedSpeciesId(species.id);
                    }}
                    className={`w-full text-left p-2.5 rounded-lg border flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-indigo-950/80 border-indigo-400'
                        : 'bg-slate-850 hover:bg-slate-800 border-slate-700/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center font-pixel text-xs font-bold text-white shadow"
                        style={{
                          backgroundColor: seen ? species.colorTheme.primary : '#334155',
                        }}
                      >
                        {seen ? species.name[0] : '?'}
                      </div>
                      <div>
                        <div className="font-pixel text-[11px] text-white flex items-center gap-2">
                          <span>{seen ? species.name : '???'}</span>
                          {species.stage > 1 && seen && (
                            <span className="text-[8px] font-pixel bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 py-0.2 rounded">
                              {species.stage === 2 ? 'ASCENDIDO' : 'ASCENDIDO II'}
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] text-slate-400 font-pixel mt-0.5">
                          #{String(i + 1).padStart(3, '0')}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {caught && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      {seen && !caught && <Eye className="w-4 h-4 text-sky-400" />}
                      {!seen && <span className="font-pixel text-[10px] text-slate-500">???</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Species Detailed Lore & Stats */}
          <div className="w-full md:w-1/2 p-5 bg-slate-950/60 flex flex-col justify-between overflow-y-auto">
            {isSeen ? (
              <div className="space-y-4">
                {/* Header Card */}
                <div className="flex items-center gap-4 bg-slate-900/90 pixel-box p-4 rounded-xl">
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center font-pixel text-2xl font-bold text-white border-2 border-white/20 shadow-xl"
                    style={{ backgroundColor: selectedSpecies.colorTheme.primary }}
                  >
                    {selectedSpecies.name[0]}
                  </div>

                  <div>
                    <h3 className="font-pixel text-sm text-amber-300 font-bold mb-1">
                      {selectedSpecies.name}
                    </h3>
                    <div className="flex gap-1.5 mb-1">
                      {selectedSpecies.types.map(t => t && (
                        <span
                          key={t}
                          className="font-pixel text-[9px] px-2 py-0.5 rounded font-bold"
                          style={{ backgroundColor: TYPE_COLORS[t].bg, color: TYPE_COLORS[t].text }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="font-pixel text-[9px] text-slate-400">
                      Estado: {isCaught ? 'Capturado y Sintonizado' : 'Avistado en el Ecosistema'}
                    </div>
                  </div>
                </div>

                {/* Lore Description */}
                <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  <div className="font-pixel text-[10px] text-indigo-400 mb-1 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> CRÓNICA DEL ALMA
                  </div>
                  <p className="font-pixel text-[10px] text-slate-300 leading-relaxed">
                    {selectedSpecies.description}
                  </p>
                </div>

                {/* Base Stats Radar/Bars */}
                <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 space-y-2">
                  <div className="font-pixel text-[10px] text-indigo-400 mb-2">
                    ATRIBUTOS BASE DE LA ESPECIE:
                  </div>

                  {[
                    { label: 'HP', val: selectedSpecies.baseStats.hp, max: 130, col: 'bg-emerald-500' },
                    { label: 'ATK', val: selectedSpecies.baseStats.atk, max: 130, col: 'bg-rose-500' },
                    { label: 'DEF', val: selectedSpecies.baseStats.def, max: 130, col: 'bg-blue-500' },
                    { label: 'SP.ATK', val: selectedSpecies.baseStats.spAtk, max: 130, col: 'bg-purple-500' },
                    { label: 'SP.DEF', val: selectedSpecies.baseStats.spDef, max: 130, col: 'bg-cyan-500' },
                    { label: 'SPD', val: selectedSpecies.baseStats.spd, max: 130, col: 'bg-yellow-500' },
                  ].map(stat => (
                    <div key={stat.label} className="flex items-center gap-2">
                      <span className="font-pixel text-[9px] text-slate-400 w-12">{stat.label}</span>
                      <div className="flex-1 bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className={`h-full ${stat.col}`}
                          style={{ width: `${(stat.val / stat.max) * 100}%` }}
                        />
                      </div>
                      <span className="font-pixel text-[9px] text-slate-200 w-8 text-right font-bold">
                        {stat.val}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Evolution Tree info */}
                {selectedSpecies.evolution && (
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="font-pixel text-[9px] text-slate-400">EVOLUCIÓN DIRECTA:</div>
                      <div className="font-pixel text-xs text-amber-300 font-bold mt-0.5">
                        {SOULDOLL_SPECIES[selectedSpecies.evolution.evolvesInto]?.name || 'Forma Ascendida'}
                      </div>
                    </div>
                    <span className="font-pixel text-[9px] bg-indigo-900/60 text-indigo-200 border border-indigo-700/60 px-2 py-1 rounded">
                      Nivel {selectedSpecies.evolution.level}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
                <span className="font-pixel text-4xl mb-4">?</span>
                <p className="font-pixel text-xs">
                  Esta especie aún no ha sido avistada en las praderas ni santuarios del mundo.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
