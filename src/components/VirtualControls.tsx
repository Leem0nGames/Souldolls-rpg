import React, { useState } from 'react';
import { useGameStore } from '../game/state/useGameStore';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Zap, Check, Lock, Unlock } from 'lucide-react';

interface VirtualControlsProps {
  onDirectionPress: (dir: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight', isDown: boolean) => void;
  onActionPress: () => void;
  onSprintToggle: (sprint: boolean) => void;
}

export const VirtualControls: React.FC<VirtualControlsProps> = ({
  onDirectionPress,
  onActionPress,
  onSprintToggle,
}) => {
  const state = useGameStore();
  const [sprintLocked, setSprintLocked] = useState(false);
  const [activeDirs, setActiveDirs] = useState<Record<string, boolean>>({});

  if (state.view !== 'OVERWORLD') return null;

  const triggerHaptic = (ms = 15) => {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(ms);
      }
    } catch {
      // Haptics optional
    }
  };

  const handlePointerDownDir = (dir: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') => {
    triggerHaptic(10);
    setActiveDirs(prev => ({ ...prev, [dir]: true }));
    onDirectionPress(dir, true);
  };

  const handlePointerUpDir = (dir: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') => {
    setActiveDirs(prev => ({ ...prev, [dir]: false }));
    onDirectionPress(dir, false);
  };

  const toggleSprintLock = () => {
    triggerHaptic(20);
    const next = !sprintLocked;
    setSprintLocked(next);
    onSprintToggle(next);
  };

  return (
    <div className="absolute bottom-2.5 inset-x-2.5 pointer-events-none flex justify-between items-end z-20 select-none touch-none">
      {/* Compact Floating D-Pad (Bottom-Left) */}
      <div className="pointer-events-auto bg-slate-950/85 p-1 rounded-xl pixel-box flex flex-col items-center shadow-xl backdrop-blur-sm border border-slate-700/80">
        {/* Up Button */}
        <button
          onPointerDown={() => handlePointerDownDir('ArrowUp')}
          onPointerUp={() => handlePointerUpDir('ArrowUp')}
          onPointerLeave={() => handlePointerUpDir('ArrowUp')}
          onPointerCancel={() => handlePointerUpDir('ArrowUp')}
          aria-label="Mover arriba"
          className={`w-8 h-8 sm:w-8 sm:h-8 rounded-md flex items-center justify-center pixel-btn transition-colors ${
            activeDirs['ArrowUp']
              ? 'bg-indigo-600 text-white shadow-inner shadow-indigo-400'
              : 'bg-slate-850 text-slate-200 hover:bg-slate-800'
          }`}
        >
          <ArrowUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        {/* Middle row: Left, Center Pivot, Right */}
        <div className="flex gap-0.5 my-0.5">
          <button
            onPointerDown={() => handlePointerDownDir('ArrowLeft')}
            onPointerUp={() => handlePointerUpDir('ArrowLeft')}
            onPointerLeave={() => handlePointerUpDir('ArrowLeft')}
            onPointerCancel={() => handlePointerUpDir('ArrowLeft')}
            aria-label="Mover izquierda"
            className={`w-8 h-8 sm:w-8 sm:h-8 rounded-md flex items-center justify-center pixel-btn transition-colors ${
              activeDirs['ArrowLeft']
                ? 'bg-indigo-600 text-white shadow-inner shadow-indigo-400'
                : 'bg-slate-850 text-slate-200 hover:bg-slate-800'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          {/* Center Pivot Indicator */}
          <div className="w-8 h-8 sm:w-8 sm:h-8 bg-slate-900/60 rounded-md flex items-center justify-center border border-slate-800">
            <div className="w-2 h-2 rounded-full bg-slate-700/90 shadow" />
          </div>

          <button
            onPointerDown={() => handlePointerDownDir('ArrowRight')}
            onPointerUp={() => handlePointerUpDir('ArrowRight')}
            onPointerLeave={() => handlePointerUpDir('ArrowRight')}
            onPointerCancel={() => handlePointerUpDir('ArrowRight')}
            aria-label="Mover derecha"
            className={`w-8 h-8 sm:w-8 sm:h-8 rounded-md flex items-center justify-center pixel-btn transition-colors ${
              activeDirs['ArrowRight']
                ? 'bg-indigo-600 text-white shadow-inner shadow-indigo-400'
                : 'bg-slate-850 text-slate-200 hover:bg-slate-800'
            }`}
          >
            <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Down Button */}
        <button
          onPointerDown={() => handlePointerDownDir('ArrowDown')}
          onPointerUp={() => handlePointerUpDir('ArrowDown')}
          onPointerLeave={() => handlePointerUpDir('ArrowDown')}
          onPointerCancel={() => handlePointerUpDir('ArrowDown')}
          aria-label="Mover abajo"
          className={`w-8 h-8 sm:w-8 sm:h-8 rounded-md flex items-center justify-center pixel-btn transition-colors ${
            activeDirs['ArrowDown']
              ? 'bg-indigo-600 text-white shadow-inner shadow-indigo-400'
              : 'bg-slate-850 text-slate-200 hover:bg-slate-800'
          }`}
        >
          <ArrowDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>

      {/* Action Controls & Sprint Lock (Bottom-Right) */}
      <div className="pointer-events-auto flex flex-col sm:flex-row items-end sm:items-center gap-2">
        {/* Sprint Lock Toggle Button */}
        <button
          onClick={toggleSprintLock}
          aria-label="Alternar carrera automática"
          className={`h-8 sm:h-9 px-2 sm:px-2.5 rounded-xl flex items-center gap-1 font-pixel text-[8px] sm:text-[9px] pixel-btn border transition-all ${
            sprintLocked
              ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md shadow-amber-500/30 font-bold'
              : 'bg-slate-950/85 text-amber-300 border-slate-700/80 hover:bg-slate-800'
          }`}
        >
          <Zap className={`w-3.5 h-3.5 ${sprintLocked ? 'fill-slate-950' : 'text-amber-400'}`} />
          <span>{sprintLocked ? 'RUN: ON' : 'CORRER'}</span>
          {sprintLocked ? <Lock className="w-3 h-3 ml-0.5" /> : <Unlock className="w-3 h-3 ml-0.5 text-slate-400" />}
        </button>

        {/* Action / A Button (Talk / Inspect) */}
        <button
          onClick={() => {
            triggerHaptic(25);
            onActionPress();
          }}
          aria-label="Botón de acción hablar o interactuar"
          className="w-12 h-12 sm:w-13 sm:h-13 bg-emerald-600 active:bg-emerald-500 rounded-full flex flex-col items-center justify-center text-white font-pixel pixel-btn border-2 border-emerald-300 shadow-lg shadow-emerald-950/60"
        >
          <Check className="w-5 h-5 stroke-[2.5]" />
          <span className="text-[8px] sm:text-[9px] font-bold mt-0.5">A</span>
        </button>
      </div>
    </div>
  );
};
