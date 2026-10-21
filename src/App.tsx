import React, { useEffect, useRef } from 'react';
import { LuminatiRenderer } from './game/graphics/LuminatiRenderer';
import { useGameStore, gameStore } from './game/state/useGameStore';
import { TopHUD } from './components/TopHUD';
import { BattleUI } from './components/BattleUI';
import { EvolutionModal } from './components/EvolutionModal';
import { PartyModal } from './components/PartyModal';
import { BagModal } from './components/BagModal';
import { SoulDexModal } from './components/SoulDexModal';
import { DialogueBox } from './components/DialogueBox';
import { VirtualControls } from './components/VirtualControls';
import { ScreenWipeTransition } from './components/ScreenWipeTransition';
import { sound } from './game/audio/SoundEffects';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<LuminatiRenderer | null>(null);
  const state = useGameStore();

  useEffect(() => {
    if (!canvasMountRef.current) return;

    // Initialize the Three.js 2.5D Luminati Engine
    const renderer = new LuminatiRenderer(canvasMountRef.current);
    rendererRef.current = renderer;

    // Keyboard handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      renderer.keys[e.code] = true;
      renderer.keys[e.key] = true;

      // Interaction key (E / Space / Enter)
      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
        renderer.handleInteraction();
      }

      // Quick menu keys
      if (state.view === 'OVERWORLD') {
        if (e.code === 'KeyP') gameStore.setView('PARTY');
        if (e.code === 'KeyI' || e.code === 'KeyB') gameStore.setView('BAG');
        if (e.code === 'KeyX') gameStore.setView('SOULDEX');
      } else {
        if (e.code === 'Escape') {
          sound.playSelect();
          gameStore.setView('OVERWORLD');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      renderer.keys[e.code] = false;
      renderer.keys[e.key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      renderer.destroy();
    };
  }, []);

  // Direction press from on-screen virtual d-pad
  const handleVirtualDirection = (
    dir: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
    isDown: boolean
  ) => {
    if (rendererRef.current) {
      rendererRef.current.keys[dir] = isDown;
    }
  };

  const handleVirtualAction = () => {
    if (rendererRef.current) {
      rendererRef.current.handleInteraction();
    }
  };

  const handleVirtualSprint = (sprint: boolean) => {
    if (rendererRef.current) {
      rendererRef.current.keys['ShiftLeft'] = sprint;
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans">
      {/* 3D WebGL Canvas Viewport */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Retro scanline & subtle vignette overlay */}
      <div className="scanlines absolute inset-0 pointer-events-none z-10 opacity-30" />

      {/* Top HUD */}
      <TopHUD />

      {/* Battle UI Overlay */}
      <BattleUI />

      {/* Screen-Wipe Transition Overlay */}
      <ScreenWipeTransition />

      {/* Dynamic Evolution Sequence Modal */}
      <EvolutionModal />

      {/* Party Inspector Modal */}
      <PartyModal />

      {/* Bag / Items Modal */}
      <BagModal />

      {/* SoulDex Modal */}
      <SoulDexModal />

      {/* Dialogue Overlay */}
      <DialogueBox />

      {/* Virtual Touch Gamepad */}
      <VirtualControls
        onDirectionPress={handleVirtualDirection}
        onActionPress={handleVirtualAction}
        onSprintToggle={handleVirtualSprint}
      />

      {/* Floating Toast Notification */}
      {state.toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-slate-900/95 border-2 border-amber-400 text-amber-200 pixel-box px-4 py-2.5 rounded-xl font-pixel text-xs shadow-2xl flex items-center gap-2">
            <span>{state.toastMessage}</span>
          </div>
        </div>
      )}

      {/* Minimal Bottom Controls Guide (Overworld only) */}
      {state.view === 'OVERWORLD' && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none hidden md:flex items-center gap-4 bg-slate-900/80 px-4 py-1.5 rounded-full border border-slate-700/60 text-[10px] font-pixel text-slate-400 z-10">
          <span>WASD / Flechas: Mover</span>
          <span>•</span>
          <span>Shift: Correr</span>
          <span>•</span>
          <span>E / Espacio: Hablar / Investigar</span>
          <span>•</span>
          <span className="text-emerald-400">Hierba Alta: Almas Salvajes</span>
        </div>
      )}
    </div>
  );
}
