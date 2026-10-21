import React, { useState, useEffect } from 'react';
import { useGameStore, gameStore } from '../game/state/useGameStore';
import { SOULDOLL_SPECIES } from '../game/data/souldolls';
import { TYPE_COLORS } from '../game/data/typesChart';
import { sound } from '../game/audio/SoundEffects';
import confetti from 'canvas-confetti';
import { Sparkles, ArrowRight, CheckCircle, Shield, Zap, Heart } from 'lucide-react';

export const EvolutionModal: React.FC = () => {
  const state = useGameStore();
  const doll = state.evolutionCandidate;

  const [step, setStep] = useState<'anticipation' | 'ascending' | 'complete'>('anticipation');
  const [pulse, setPulse] = useState(0);

  // MUST BE CALLED UNCONDITIONALLY BEFORE EARLY RETURNS
  useEffect(() => {
    if (state.view !== 'EVOLUTION' || !doll) return;

    sound.playEvolution();
    setStep('anticipation');

    // Sequence timing
    const t1 = setTimeout(() => {
      setStep('ascending');
    }, 2000);

    const t2 = setTimeout(() => {
      setStep('complete');
      sound.playLevelUp();
      // Trigger festive confetti
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#38bdf8', '#facc15', '#a855f7', '#4ade80', '#f43f5e']
      });
      gameStore.completeEvolution();
    }, 4500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [state.view, doll?.uuid]);

  if (state.view !== 'EVOLUTION' || !doll) return null;

  const currentSpecies = SOULDOLL_SPECIES[doll.speciesId];
  const targetSpeciesId = currentSpecies?.evolution?.evolvesInto;
  const targetSpecies = targetSpeciesId ? SOULDOLL_SPECIES[targetSpeciesId] : null;

  if (!currentSpecies || !targetSpecies) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-sm p-4 select-none">
      <div className="relative max-w-xl w-full bg-slate-900 border-4 border-indigo-500/60 pixel-box rounded-2xl p-6 flex flex-col items-center text-center overflow-hidden">
        {/* Ambient Astral Aura */}
        <div className="absolute inset-0 bg-radial from-indigo-600/20 via-transparent to-transparent pointer-events-none" />

        {/* Title */}
        <div className="flex items-center gap-2 mb-4 z-10">
          <Sparkles className="w-5 h-5 text-amber-300 animate-spin" />
          <h2 className="font-pixel text-sm md:text-base text-amber-300 tracking-wider">
            {step === 'complete' ? '¡METAMORFOSIS COMPLETADA!' : '¡ASCENSIÓN DEL ALMA EN PROCESO!'}
          </h2>
          <Sparkles className="w-5 h-5 text-amber-300 animate-spin" />
        </div>

        {/* Dynamic Visual Transformation Stage */}
        <div className="relative w-64 h-56 flex items-center justify-center my-4 z-10">
          {/* Glowing Aura Rings */}
          <div
            className={`absolute inset-0 rounded-full bg-gradient-to-r from-sky-400/30 to-purple-500/30 blur-xl transition-all duration-1000 ${
              step === 'ascending' ? 'scale-125 opacity-90 animate-pulse' : 'scale-90 opacity-40'
            }`}
          />

          {/* Creature Transformation Display */}
          <div className="relative flex items-center justify-center">
            {step === 'anticipation' && (
              <div className="flex flex-col items-center animate-bounce">
                <div
                  className="w-28 h-28 rounded-full flex items-center justify-center border-4 border-amber-400/80 shadow-lg shadow-amber-500/40"
                  style={{ backgroundColor: currentSpecies.colorTheme.primary }}
                >
                  <span className="font-pixel text-2xl text-white font-bold">
                    {currentSpecies.name[0]}
                  </span>
                </div>
                <span className="font-pixel text-xs text-slate-200 mt-3 font-bold">
                  {currentSpecies.name}
                </span>
              </div>
            )}

            {step === 'ascending' && (
              <div className="relative flex items-center justify-center">
                <div className="w-36 h-36 rounded-full bg-white animate-ping opacity-60 absolute" />
                <div
                  className="w-32 h-32 rounded-full flex items-center justify-center border-4 border-white shadow-2xl shadow-indigo-400 filter brightness-150 animate-pulse"
                  style={{ backgroundColor: targetSpecies.colorTheme.primary }}
                >
                  <span className="font-pixel text-3xl text-white font-bold animate-spin">
                    ✦
                  </span>
                </div>
              </div>
            )}

            {step === 'complete' && (
              <div className="flex flex-col items-center animate-in zoom-in-75 duration-700">
                <div
                  className="w-36 h-36 rounded-full flex items-center justify-center border-4 border-amber-300 shadow-2xl shadow-purple-500/60 ring-4 ring-indigo-400"
                  style={{ backgroundColor: targetSpecies.colorTheme.primary }}
                >
                  <span className="font-pixel text-3xl text-white font-bold">
                    {targetSpecies.name[0]}
                  </span>
                </div>
                <span className="font-pixel text-sm text-amber-300 mt-3 font-bold">
                  {targetSpecies.name} (Fase 2)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Lore / Description */}
        <p className="font-pixel text-xs text-slate-300 leading-relaxed max-w-md my-2 z-10">
          {step === 'complete'
            ? `¡Tu alma compañera ha trascendido a su forma legendaria! Ha despertado un poder elemental insondable.`
            : `El núcleo espiritual de ${doll.nickname} está sintonizándose con los armónicos cósmicos...`}
        </p>

        {/* Stat Growth Comparison Grid */}
        {step === 'complete' && (
          <div className="w-full bg-slate-950/80 pixel-box p-3 rounded-lg my-3 z-10">
            <div className="text-[10px] font-pixel text-slate-400 mb-2">
              MEJORA DE ATRIBUTOS BASE:
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px] font-pixel">
              <div className="bg-slate-900 p-1.5 rounded flex justify-between items-center border border-slate-700">
                <span className="text-emerald-400">HP</span>
                <span className="text-white font-bold">
                  {currentSpecies.baseStats.hp} → <span className="text-amber-300">{targetSpecies.baseStats.hp}</span>
                </span>
              </div>
              <div className="bg-slate-900 p-1.5 rounded flex justify-between items-center border border-slate-700">
                <span className="text-rose-400">ATK</span>
                <span className="text-white font-bold">
                  {currentSpecies.baseStats.atk} → <span className="text-amber-300">{targetSpecies.baseStats.atk}</span>
                </span>
              </div>
              <div className="bg-slate-900 p-1.5 rounded flex justify-between items-center border border-slate-700">
                <span className="text-blue-400">DEF</span>
                <span className="text-white font-bold">
                  {currentSpecies.baseStats.def} → <span className="text-amber-300">{targetSpecies.baseStats.def}</span>
                </span>
              </div>
              <div className="bg-slate-900 p-1.5 rounded flex justify-between items-center border border-slate-700">
                <span className="text-purple-400">SP.ATK</span>
                <span className="text-white font-bold">
                  {currentSpecies.baseStats.spAtk} → <span className="text-amber-300">{targetSpecies.baseStats.spAtk}</span>
                </span>
              </div>
              <div className="bg-slate-900 p-1.5 rounded flex justify-between items-center border border-slate-700">
                <span className="text-cyan-400">SP.DEF</span>
                <span className="text-white font-bold">
                  {currentSpecies.baseStats.spDef} → <span className="text-amber-300">{targetSpecies.baseStats.spDef}</span>
                </span>
              </div>
              <div className="bg-slate-900 p-1.5 rounded flex justify-between items-center border border-slate-700">
                <span className="text-yellow-400">SPD</span>
                <span className="text-white font-bold">
                  {currentSpecies.baseStats.spd} → <span className="text-amber-300">{targetSpecies.baseStats.spd}</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        {step === 'complete' && (
          <button
            onClick={() => {
              sound.playSelect();
              gameStore.setView('OVERWORLD');
            }}
            className="pixel-btn mt-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-pixel text-xs py-3 px-8 rounded-lg flex items-center gap-2 z-10"
          >
            <CheckCircle className="w-4 h-4 text-emerald-200" />
            ¡CONTINUAR LA AVENTURA!
          </button>
        )}
      </div>
    </div>
  );
};
