import React, { useState } from 'react';
import { useGameStore, gameStore } from '../game/state/useGameStore';
import { SOULDOLL_SPECIES } from '../game/data/souldolls';
import { TYPE_COLORS } from '../game/data/typesChart';
import { sound } from '../game/audio/SoundEffects';
import { Users, X, Heart, Shield, Sparkles, ArrowUpCircle, Zap } from 'lucide-react';

export const PartyModal: React.FC = () => {
  const state = useGameStore();
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  if (state.view !== 'PARTY') return null;

  const party = state.playerParty;
  const currentDoll = party[selectedIdx] || party[0];
  const species = SOULDOLL_SPECIES[currentDoll.speciesId] || SOULDOLL_SPECIES.ignisaur;

  // Move doll to first position (Party Leader)
  const handleMakeLeader = () => {
    if (selectedIdx === 0) return;
    sound.playSelect();
    const newParty = [...party];
    const [moved] = newParty.splice(selectedIdx, 1);
    newParty.unshift(moved);
    gameStore.setState({ playerParty: newParty });
    setSelectedIdx(0);
    gameStore.showToast(`¡${moved.nickname} es ahora el líder de tu equipo!`);
  };

  // Trigger dynamic evolution test directly from party modal
  const handleTriggerEvolution = () => {
    if (!species.evolution) {
      gameStore.showToast('¡Este SoulDoll ya se encuentra en su fase máxima de ascensión!');
      return;
    }
    sound.playSelect();
    gameStore.startEvolutionSequence(currentDoll);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4 select-none">
      <div className="relative max-w-4xl w-full bg-slate-900 border-4 border-slate-700 pixel-box rounded-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-slate-950 px-5 py-3 border-b border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            <h2 className="font-pixel text-xs md:text-sm text-emerald-300 tracking-wider">
              EQUIPO DE SOULDOLLS ({party.length}/6)
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

        {/* Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left: Party Member Slots */}
          <div className="w-full md:w-1/2 p-3 sm:p-4 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col gap-2 max-h-[35vh] md:max-h-none overflow-y-auto touch-pan-y shrink-0 md:shrink">
            {party.map((doll, idx) => {
              const dollSpecies = SOULDOLL_SPECIES[doll.speciesId] || SOULDOLL_SPECIES.ignisaur;
              const isSelected = selectedIdx === idx;
              const hpPct = Math.floor((doll.currentHp / doll.maxHp) * 100);

              return (
                <button
                  key={doll.uuid}
                  onClick={() => {
                    sound.playSelect();
                    setSelectedIdx(idx);
                  }}
                  className={`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-all ${
                    isSelected
                      ? 'bg-emerald-950/80 border-emerald-400 ring-2 ring-emerald-500/30'
                      : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center font-pixel text-sm font-bold text-white shadow"
                      style={{ backgroundColor: dollSpecies.colorTheme.primary }}
                    >
                      {doll.nickname[0]}
                    </div>

                    <div>
                      <div className="font-pixel text-xs text-white flex items-center gap-2">
                        <span>{doll.nickname}</span>
                        {idx === 0 && (
                          <span className="font-pixel text-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 py-0.2 rounded">
                            LÍDER
                          </span>
                        )}
                      </div>
                      <div className="font-pixel text-[9px] text-slate-400 mt-0.5">
                        Nv. {doll.level} • {dollSpecies.types[0]}
                      </div>
                    </div>
                  </div>

                  {/* HP Indicator */}
                  <div className="w-28 flex flex-col items-end gap-1">
                    <span className="font-pixel text-[9px] text-slate-300">
                      {doll.currentHp}/{doll.maxHp} HP
                    </span>
                    <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-700">
                      <div
                        className={`h-full ${
                          hpPct > 50 ? 'bg-emerald-500' : hpPct > 20 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${hpPct}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Selected Doll Inspector & Actions */}
          <div className="w-full md:w-1/2 p-5 bg-slate-950/60 flex flex-col justify-between overflow-y-auto space-y-4">
            <div>
              {/* Header profile */}
              <div className="flex items-center gap-4 bg-slate-900 p-4 rounded-xl pixel-box mb-4">
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center font-pixel text-2xl font-bold text-white border-2 border-white/20 shadow-xl"
                  style={{ backgroundColor: species.colorTheme.primary }}
                >
                  {currentDoll.nickname[0]}
                </div>
                <div>
                  <h3 className="font-pixel text-sm text-emerald-300 font-bold mb-1">
                    {currentDoll.nickname}
                  </h3>
                  <div className="flex gap-1.5 mb-1">
                    {species.types.map(t => t && (
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
                    Fase: {species.stage === 1 ? 'Básica' : `Ascendida (Fase ${species.stage})`} • EXP: {currentDoll.currentXp}
                  </div>
                </div>
              </div>

              {/* Stats Box */}
              <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-800 mb-4">
                <div className="font-pixel text-[10px] text-emerald-400 mb-2">ESTADÍSTICAS ACTUALES:</div>
                <div className="grid grid-cols-3 gap-2 font-pixel text-[9px]">
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-400">HP:</span> <span className="text-white font-bold">{currentDoll.maxHp}</span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-400">ATK:</span> <span className="text-white font-bold">{currentDoll.stats.atk}</span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-400">DEF:</span> <span className="text-white font-bold">{currentDoll.stats.def}</span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-400">SP.ATK:</span> <span className="text-white font-bold">{currentDoll.stats.spAtk}</span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-400">SP.DEF:</span> <span className="text-white font-bold">{currentDoll.stats.spDef}</span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-400">SPD:</span> <span className="text-white font-bold">{currentDoll.stats.spd}</span>
                  </div>
                </div>
              </div>

              {/* Moveset */}
              <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-800 mb-4">
                <div className="font-pixel text-[10px] text-emerald-400 mb-2">HABILIDADES EQUIPADAS:</div>
                <div className="grid grid-cols-2 gap-2">
                  {currentDoll.moves.map((move, i) => (
                    <div key={move.id + i} className="bg-slate-950 p-2 rounded border border-slate-800">
                      <div className="font-pixel text-[9px] text-white font-bold truncate mb-0.5">
                        {move.name}
                      </div>
                      <div className="flex justify-between items-center text-[8px] font-pixel">
                        <span
                          className="px-1 py-0.2 rounded"
                          style={{ backgroundColor: TYPE_COLORS[move.type].bg, color: TYPE_COLORS[move.type].text }}
                        >
                          {move.type}
                        </span>
                        <span className="text-slate-400">
                          {move.currentPp}/{move.maxPp} PP
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
              {selectedIdx !== 0 && (
                <button
                  onClick={handleMakeLeader}
                  className="pixel-btn bg-slate-800 hover:bg-slate-700 text-white font-pixel text-[10px] py-2 px-4 rounded border border-slate-700 flex items-center justify-center gap-1.5"
                >
                  <ArrowUpCircle className="w-3.5 h-3.5 text-amber-400" />
                  NOMBRAR LÍDER DE EQUIPO
                </button>
              )}

              {species.evolution && (
                <button
                  onClick={handleTriggerEvolution}
                  className="pixel-btn bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-pixel text-[10px] py-2.5 px-4 rounded flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  DESPERTAR METAMORFOSIS ASCENDIDA
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
