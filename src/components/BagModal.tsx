import React, { useState } from 'react';
import { useGameStore, gameStore } from '../game/state/useGameStore';
import { sound } from '../game/audio/SoundEffects';
import { Briefcase, X, Sparkles, Heart, Zap, Check } from 'lucide-react';
import { ItemCategory } from '../types/game';

export const BagModal: React.FC = () => {
  const state = useGameStore();
  const [activeCategory, setActiveCategory] = useState<ItemCategory>('vial');
  const [selectedItemId, setSelectedItemId] = useState<string>('animus_vial');
  const [targetDollUuid, setTargetDollUuid] = useState<string>(state.playerParty[0]?.uuid || '');

  if (state.view !== 'BAG') return null;

  const items = Object.values(state.inventory);
  const filteredItems = items.filter(it => it.category === activeCategory);
  const selectedItem = state.inventory[selectedItemId] || filteredItems[0];

  const handleUseItem = () => {
    if (!selectedItem || selectedItem.count <= 0) return;

    if (selectedItem.category === 'vial') {
      gameStore.showToast('¡Los Viales de Ánima se utilizan directamente durante el combate contra SoulDolls salvajes!');
      return;
    }

    const success = gameStore.useMedicine(selectedItem.id, targetDollUuid);
    if (success) {
      sound.playSelect();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4 select-none">
      <div className="relative max-w-3xl w-full bg-slate-900 border-4 border-slate-700 pixel-box rounded-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="bg-slate-950 px-5 py-3 border-b border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-amber-400" />
            <h2 className="font-pixel text-xs md:text-sm text-amber-300 tracking-wider">
              MOCHILA DEL DOMADOR ({state.soulShards} ✦ Fragmentos de Alma)
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

        {/* Categories Bar */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-2 gap-2">
          {(
            [
              { id: 'vial', label: 'VIALES' },
              { id: 'medicine', label: 'REMEDIOS' },
              { id: 'evolution', label: 'ARTEFACTOS' },
            ] as { id: ItemCategory; label: string }[]
          ).map(cat => (
            <button
              key={cat.id}
              onClick={() => {
                sound.playSelect();
                setActiveCategory(cat.id);
                const first = items.find(it => it.category === cat.id);
                if (first) setSelectedItemId(first.id);
              }}
              className={`px-4 py-2 rounded-lg font-pixel text-[10px] transition-all ${
                activeCategory === cat.id
                  ? 'bg-amber-600 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-750'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Items list */}
          <div className="w-full md:w-1/2 p-3 sm:p-4 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col gap-2 max-h-[35vh] md:max-h-none overflow-y-auto touch-pan-y shrink-0 md:shrink">
            {filteredItems.map(item => {
              const isSelected = selectedItemId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    sound.playSelect();
                    setSelectedItemId(item.id);
                  }}
                  className={`w-full text-left p-3 rounded-lg border flex items-center justify-between transition-all ${
                    isSelected
                      ? 'bg-amber-950/60 border-amber-400'
                      : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700'
                  }`}
                >
                  <div>
                    <div className="font-pixel text-[11px] text-white font-bold">{item.name}</div>
                    <div className="font-pixel text-[9px] text-slate-400 mt-0.5 truncate max-w-[200px]">
                      {item.description}
                    </div>
                  </div>
                  <span className="font-pixel text-xs text-amber-300 bg-slate-900 px-2.5 py-1 rounded border border-slate-700 font-bold">
                    x{item.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Item details & Target Doll selector */}
          <div className="w-full md:w-1/2 p-5 bg-slate-950/60 flex flex-col justify-between overflow-y-auto">
            {selectedItem ? (
              <div className="space-y-4">
                <div className="bg-slate-900 p-4 rounded-xl pixel-box">
                  <h3 className="font-pixel text-sm text-amber-300 font-bold mb-2">
                    {selectedItem.name}
                  </h3>
                  <p className="font-pixel text-[10px] text-slate-300 leading-relaxed">
                    {selectedItem.description}
                  </p>
                  <div className="mt-3 text-[9px] font-pixel text-slate-400">
                    Disponibles en inventario: <span className="text-white font-bold">{selectedItem.count} unidades</span>
                  </div>
                </div>

                {/* Target SoulDoll Selection for Medicine & Artifacts */}
                {selectedItem.category !== 'vial' && (
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <div className="font-pixel text-[10px] text-amber-400 mb-2">
                      APLICAR SOBRE SOULDOLL:
                    </div>
                    <div className="space-y-1.5">
                      {state.playerParty.map(doll => (
                        <button
                          key={doll.uuid}
                          onClick={() => setTargetDollUuid(doll.uuid)}
                          className={`w-full text-left p-2 rounded flex justify-between items-center border ${
                            targetDollUuid === doll.uuid
                              ? 'bg-amber-950/50 border-amber-400 text-white'
                              : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                          }`}
                        >
                          <span className="font-pixel text-[10px] font-bold">
                            {doll.nickname} (Nv.{doll.level})
                          </span>
                          <span className="font-pixel text-[9px] text-slate-400">
                            {doll.currentHp}/{doll.maxHp} HP
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center font-pixel text-xs text-slate-500 py-10">
                Selecciona un objeto de la lista
              </div>
            )}

            {selectedItem && (
              <button
                disabled={selectedItem.count <= 0}
                onClick={handleUseItem}
                className="pixel-btn bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-slate-950 font-pixel text-xs py-3 px-6 rounded-lg flex items-center justify-center gap-2 font-bold disabled:opacity-40"
              >
                <Check className="w-4 h-4 text-slate-950" />
                USAR OBJETO
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
