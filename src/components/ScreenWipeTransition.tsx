import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../game/state/useGameStore';
import { GameView } from '../types/game';
import { Sparkles } from 'lucide-react';

export const ScreenWipeTransition: React.FC = () => {
  const state = useGameStore();
  const currentView = state.view;
  const prevViewRef = useRef<GameView>(currentView);

  const [isWiping, setIsWiping] = useState(false);
  const [wipeType, setWipeType] = useState<'enter-battle' | 'exit-battle'>('enter-battle');

  useEffect(() => {
    const prev = prevViewRef.current;
    prevViewRef.current = currentView;

    // Trigger on Overworld -> Battle or Battle -> Overworld
    if (prev === 'OVERWORLD' && currentView === 'BATTLE') {
      setWipeType('enter-battle');
      setIsWiping(true);
      const timer = setTimeout(() => {
        setIsWiping(false);
      }, 1100);
      return () => clearTimeout(timer);
    } else if (prev === 'BATTLE' && currentView === 'OVERWORLD') {
      setWipeType('exit-battle');
      setIsWiping(true);
      const timer = setTimeout(() => {
        setIsWiping(false);
      }, 1050);
      return () => clearTimeout(timer);
    }
  }, [currentView]);

  if (!isWiping) return null;

  // 10 staggered horizontal shutter bars for authentic retro screen-wipe
  const barCount = 10;
  const bars = Array.from({ length: barCount }, (_, i) => i);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none select-none overflow-hidden flex flex-col">
      {/* 1. Dramatic Battle Flash Overlay (Active on battle encounter) */}
      {wipeType === 'enter-battle' && (
        <div className="absolute inset-0 bg-white z-20 animate-battle-flash pointer-events-none" />
      )}

      {/* 2. Staggered Horizontal Shutter Bars */}
      <div className="relative w-full h-full flex flex-col z-10">
        {bars.map(i => {
          // Alternating left/right directions and subtle color variance
          const isOdd = i % 2 === 1;
          const delay = (i * 0.035).toFixed(3);
          const barBg = isOdd
            ? 'bg-slate-950 border-y border-indigo-900/40'
            : 'bg-indigo-950 border-y border-purple-900/40';

          return (
            <div
              key={i}
              className={`flex-1 w-full ${barBg} animate-wipe-bar shadow-lg`}
              style={{
                animationDelay: `${delay}s`,
                transformOrigin: isOdd ? 'left' : 'right',
              }}
            />
          );
        })}
      </div>

      {/* 3. Central Soul Crystal Sigil flash at midpoint */}
      <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/80 border-2 border-amber-300 flex items-center justify-center shadow-2xl shadow-amber-400/50 pixel-box animate-spin">
            <Sparkles className="w-8 h-8 text-amber-300" />
          </div>
          <span className="font-pixel text-[10px] text-amber-300 mt-2 font-bold tracking-widest drop-shadow-md">
            {wipeType === 'enter-battle' ? '¡COMBATE!' : 'VICTORIA'}
          </span>
        </div>
      </div>
    </div>
  );
};
