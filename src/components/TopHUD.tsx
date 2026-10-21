import React, { useState } from 'react';
import { useGameStore, gameStore } from '../game/state/useGameStore';
import { sound } from '../game/audio/SoundEffects';
import { BookOpen, Users, Briefcase, Heart, Volume2, VolumeX, Sparkles, MapPin } from 'lucide-react';

export const TopHUD: React.FC = () => {
  const state = useGameStore();
  const [audioMuted, setAudioMuted] = useState(false);

  // In battle or evolution, overworld HUD is hidden
  if (state.view === 'BATTLE' || state.view === 'EVOLUTION') return null;

  const toggleAudio = () => {
    sound.enabled = !sound.enabled;
    setAudioMuted(!sound.enabled);
  };

  const getZoneName = () => {
    const px = state.playerPosition.x;
    const pz = state.playerPosition.z;
    if (px < -6 && pz > -3 && pz < 7) return 'Claro Silvestre';
    if (px > 6 && pz > -3 && pz < 7) return 'Pradera del Susurro';
    if (Math.hypot(px, pz + 4) < 5) return 'Santuario de Almas';
    return 'Valle Luminati';
  };

  return (
    <div className="absolute top-0 inset-x-0 p-2 sm:p-3 pointer-events-none flex flex-wrap justify-between items-center gap-2 z-30 select-none">
      {/* Left: Zone & Status Spec Badge */}
      <div className="pointer-events-auto flex items-center gap-2 bg-slate-900/90 pixel-box px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl backdrop-blur-sm border border-slate-700/80">
        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-400 shrink-0" />
        <div>
          <div className="font-pixel text-[10px] sm:text-[11px] text-amber-300 font-bold flex items-center gap-1">
            <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
            <span className="truncate max-w-[130px] sm:max-w-none">{getZoneName()}</span>
          </div>
          <div className="font-pixel text-[7px] sm:text-[8px] text-slate-400 hidden sm:block">
            SOULDOLLS • LUMINATI 2.5D
          </div>
        </div>
      </div>

      {/* Right: Quick Menu Controls Dock with 44px+ touch targets */}
      <div className="pointer-events-auto flex items-center gap-1.5 bg-slate-900/90 pixel-box p-1 sm:p-1.5 rounded-xl backdrop-blur-sm border border-slate-700/80">
        {/* Currency badge */}
        <div className="px-2 py-1 bg-slate-950 rounded-lg flex items-center gap-1 font-pixel text-[9px] sm:text-[10px] text-amber-400 border border-amber-500/30">
          <Sparkles className="w-3 h-3 shrink-0" />
          <span>{state.soulShards}</span>
        </div>

        {/* Quick Sanctuary Heal */}
        <button
          onClick={() => gameStore.healParty()}
          title="Sanar equipo en el Santuario"
          aria-label="Sanar equipo"
          className="pixel-btn bg-emerald-700 hover:bg-emerald-600 text-white min-w-[42px] min-h-[42px] sm:min-w-0 sm:min-h-0 sm:p-2 rounded-lg font-pixel text-[10px] flex items-center justify-center gap-1"
        >
          <Heart className="w-4 h-4 text-rose-300 fill-rose-300" />
          <span className="hidden md:inline">SANAR</span>
        </button>

        {/* Party Button */}
        <button
          onClick={() => gameStore.setView('PARTY')}
          title="Ver equipo de SoulDolls"
          aria-label="Equipo"
          className="pixel-btn bg-indigo-700 hover:bg-indigo-600 text-white min-w-[42px] min-h-[42px] sm:min-w-0 sm:min-h-0 sm:p-2 rounded-lg font-pixel text-[10px] flex items-center justify-center gap-1"
        >
          <Users className="w-4 h-4 text-indigo-200" />
          <span className="hidden md:inline">EQUIPO ({state.playerParty.length})</span>
          <span className="md:hidden text-[9px]">({state.playerParty.length})</span>
        </button>

        {/* Bag Button */}
        <button
          onClick={() => gameStore.setView('BAG')}
          title="Mochila e inventario"
          aria-label="Mochila"
          className="pixel-btn bg-amber-700 hover:bg-amber-600 text-slate-950 min-w-[42px] min-h-[42px] sm:min-w-0 sm:min-h-0 sm:p-2 rounded-lg font-pixel text-[10px] flex items-center justify-center gap-1 font-bold"
        >
          <Briefcase className="w-4 h-4 text-slate-950" />
          <span className="hidden md:inline">MOCHILA</span>
        </button>

        {/* SoulDex Button */}
        <button
          onClick={() => gameStore.setView('SOULDEX')}
          title="Registro SoulDex"
          aria-label="SoulDex"
          className="pixel-btn bg-purple-700 hover:bg-purple-600 text-white min-w-[42px] min-h-[42px] sm:min-w-0 sm:min-h-0 sm:p-2 rounded-lg font-pixel text-[10px] flex items-center justify-center gap-1"
        >
          <BookOpen className="w-4 h-4 text-purple-200" />
          <span className="hidden md:inline">SOULDEX</span>
        </button>

        {/* Audio Mute Toggle */}
        <button
          onClick={toggleAudio}
          className="min-w-[42px] min-h-[42px] sm:min-w-0 sm:min-h-0 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
          title={audioMuted ? 'Activar sonido' : 'Silenciar'}
          aria-label={audioMuted ? 'Activar sonido' : 'Silenciar'}
        >
          {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
