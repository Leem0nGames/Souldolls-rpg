import React from 'react';
import { useGameStore, gameStore } from '../game/state/useGameStore';
import { sound } from '../game/audio/SoundEffects';
import { MessageSquare, ArrowRight } from 'lucide-react';

export const DialogueBox: React.FC = () => {
  const state = useGameStore();
  const dialogue = state.activeDialogue;

  if (!dialogue) return null;

  const handleAdvance = () => {
    sound.playSelect();
    gameStore.clearDialogue();
  };

  return (
    <div
      onClick={handleAdvance}
      className="fixed inset-x-4 bottom-6 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[680px] z-50 pointer-events-auto cursor-pointer select-none"
    >
      <div className="bg-slate-950/95 pixel-box rounded-xl p-4 md:p-5 border-4 border-indigo-500/80 shadow-2xl">
        {/* Speaker Name Tag */}
        <div className="inline-block bg-indigo-900 border border-indigo-400 px-3 py-1 rounded font-pixel text-xs text-amber-300 font-bold mb-2">
          {dialogue.speaker}
        </div>

        {/* Message Content */}
        <p className="font-pixel text-xs md:text-sm text-slate-100 leading-relaxed min-h-[48px] whitespace-pre-line">
          {dialogue.text}
        </p>

        {/* Advance Prompt */}
        <div className="flex justify-end items-center gap-1.5 mt-2 text-[10px] font-pixel text-amber-400">
          <span>PULSA PARA CONTINUAR</span>
          <ArrowRight className="w-3.5 h-3.5 animate-pulse" />
        </div>
      </div>
    </div>
  );
};
