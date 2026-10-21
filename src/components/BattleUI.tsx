import React, { useState, useEffect } from 'react';
import { useGameStore, gameStore } from '../game/state/useGameStore';
import { TYPE_COLORS } from '../game/data/typesChart';
import { combatEngine } from '../game/combat/CombatEngine';
import { sound } from '../game/audio/SoundEffects';
import { Move, Item } from '../types/game';
import { Sword, Briefcase, Users, LogOut, Sparkles, Heart, Zap, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';

export const BattleUI: React.FC = () => {
  const state = useGameStore();
  const battle = state.battleState;

  const [activeMenu, setActiveMenu] = useState<'root' | 'moves' | 'items' | 'switch'>('root');
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentMessage, setCurrentMessage] = useState<string>('');
  const [shakeCount, setShakeCount] = useState<number>(0);

  // Set latest log message - MUST BE CALLED BEFORE EARLY RETURN
  useEffect(() => {
    if (battle?.log && battle.log.length > 0) {
      setCurrentMessage(battle.log[battle.log.length - 1]);
    }
  }, [battle?.log]);

  if (!battle || !battle.isActive) return null;

  const playerDoll = state.playerParty[battle.playerActiveIndex];
  const opponentDoll = battle.opponentDoll;
  if (!playerDoll || !opponentDoll) return null;

  const triggerHaptic = (ms = 15) => {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(ms);
      }
    } catch {
      // Haptics optional
    }
  };

  // Execute Player Move
  const handleSelectMove = async (move: Move) => {
    if (move.currentPp <= 0) {
      gameStore.showToast('¡No te quedan puntos de poder (PP) para esta habilidad!');
      return;
    }
    if (isExecuting) return;

    triggerHaptic(20);
    sound.playSelect();
    setIsExecuting(true);
    setActiveMenu('root');

    // Deduct PP
    move.currentPp--;

    // 1. Determine speed turn priority
    const playerSpeed = playerDoll.stats.spd;
    const opponentSpeed = opponentDoll.stats.spd;
    const playerFirst = (move.priority || 0) > 0 || playerSpeed >= opponentSpeed;

    // Pick random move for opponent
    const eligibleOpponentMoves = opponentDoll.moves.filter(m => m.currentPp > 0);
    const opponentMove = eligibleOpponentMoves.length > 0
      ? eligibleOpponentMoves[Math.floor(Math.random() * eligibleOpponentMoves.length)]
      : opponentDoll.moves[0];

    // Helper for executing attack
    const executeAttack = async (
      attacker: typeof playerDoll,
      defender: typeof opponentDoll,
      selectedMove: Move,
      isAttackerPlayer: boolean
    ): Promise<boolean> => {
      const announce = `¡${attacker.nickname} usó ${selectedMove.name}!`;
      battle.log.push(announce);
      setCurrentMessage(announce);
      gameStore.setState({ battleState: { ...battle } });
      await new Promise(r => setTimeout(r, 1100));

      const res = combatEngine.calculateDamage(attacker, defender, selectedMove);
      defender.currentHp = Math.max(0, defender.currentHp - res.damage);

      if (res.typeMultiplier >= 2.0) {
        sound.playSuperEffective();
      } else if (res.isCrit) {
        sound.playCrit();
      } else {
        sound.playHit();
      }

      if (res.typeMultiplier >= 2.0) {
        battle.log.push('¡Es súper efectivo!');
      } else if (res.typeMultiplier > 0 && res.typeMultiplier < 1.0) {
        battle.log.push('No es muy efectivo...');
      } else if (res.typeMultiplier === 0) {
        battle.log.push('¡No tiene ningún efecto!');
      }

      if (res.isCrit) {
        battle.log.push('¡Un golpe crítico!');
      }

      if (selectedMove.statusEffect && Math.random() * 100 < selectedMove.statusEffect.chance && !defender.status) {
        defender.status = selectedMove.statusEffect.condition;
        battle.log.push(`¡${defender.nickname} sufre de ${selectedMove.statusEffect.condition}!`);
      }

      if (selectedMove.healRatio) {
        const healAmt = Math.floor(attacker.maxHp * selectedMove.healRatio);
        attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + healAmt);
        sound.playHeal();
        battle.log.push(`¡${attacker.nickname} recuperó ${healAmt} puntos de salud!`);
      }

      setCurrentMessage(battle.log[battle.log.length - 1]);
      gameStore.setState({ battleState: { ...battle } });
      await new Promise(r => setTimeout(r, 1200));

      if (defender.currentHp <= 0) {
        sound.playFaint();
        battle.log.push(`¡${defender.nickname} cayó debilitado!`);
        setCurrentMessage(`¡${defender.nickname} cayó debilitado!`);
        gameStore.setState({ battleState: { ...battle } });
        await new Promise(r => setTimeout(r, 1200));
        return true;
      }
      return false;
    };

    if (playerFirst) {
      const oppFainted = await executeAttack(playerDoll, opponentDoll, move, true);
      if (oppFainted) {
        await handleOpponentFainted();
        setIsExecuting(false);
        return;
      }

      if (opponentMove) {
        opponentMove.currentPp = Math.max(0, opponentMove.currentPp - 1);
        const playerFainted = await executeAttack(opponentDoll, playerDoll, opponentMove, false);
        if (playerFainted) {
          handlePlayerFainted();
        }
      }
    } else {
      if (opponentMove) {
        opponentMove.currentPp = Math.max(0, opponentMove.currentPp - 1);
        const playerFainted = await executeAttack(opponentDoll, playerDoll, opponentMove, false);
        if (playerFainted) {
          handlePlayerFainted();
          setIsExecuting(false);
          return;
        }
      }

      const oppFainted = await executeAttack(playerDoll, opponentDoll, move, true);
      if (oppFainted) {
        await handleOpponentFainted();
        setIsExecuting(false);
        return;
      }
    }

    setIsExecuting(false);
  };

  // Opponent defeated
  const handleOpponentFainted = async () => {
    sound.playLevelUp();
    const expRes = combatEngine.awardExp(playerDoll, opponentDoll, battle.isTrainerBattle);
    
    for (const msg of expRes.messages) {
      battle.log.push(msg);
      setCurrentMessage(msg);
      gameStore.setState({ battleState: { ...battle } });
      await new Promise(r => setTimeout(r, 1100));
    }

    if (expRes.evolutionReady) {
      await new Promise(r => setTimeout(r, 500));
      gameStore.endBattle(true);
      gameStore.startEvolutionSequence(playerDoll);
      return;
    }

    await new Promise(r => setTimeout(r, 800));
    gameStore.endBattle(true);
  };

  // Player doll fainted
  const handlePlayerFainted = () => {
    const nextAlive = state.playerParty.find(d => d.currentHp > 0);
    if (nextAlive) {
      setActiveMenu('switch');
      gameStore.showToast(`¡Elige a tu siguiente SoulDoll para continuar el combate!`);
    } else {
      battle.log.push('¡Todos tus SoulDolls han caído! Te retiras al Santuario...');
      setCurrentMessage('¡Todos tus SoulDolls han caído! Te retiras al Santuario...');
      gameStore.setState({ battleState: { ...battle } });
      setTimeout(() => {
        gameStore.healParty();
        gameStore.endBattle(false);
      }, 2500);
    }
  };

  // Attempt Capture
  const handleThrowVial = async (item: Item) => {
    if (battle.isTrainerBattle) {
      gameStore.showToast('¡No puedes capturar el SoulDoll de otro Domador!');
      return;
    }
    if (item.count <= 0) return;
    if (isExecuting) return;

    triggerHaptic(20);
    item.count--;
    sound.playSelect();
    setIsExecuting(true);
    setActiveMenu('root');

    const captureResult = combatEngine.attemptCapture(opponentDoll, item);

    for (let i = 0; i < captureResult.messages.length; i++) {
      const msg = captureResult.messages[i];
      battle.log.push(msg);
      setCurrentMessage(msg);
      if (msg.includes('vibra')) {
        sound.playVialShake();
        triggerHaptic(35);
        setShakeCount(prev => prev + 1);
      }
      gameStore.setState({ battleState: { ...battle } });
      await new Promise(r => setTimeout(r, 1100));
    }

    if (captureResult.success) {
      sound.playVialSuccess();
      await new Promise(r => setTimeout(r, 1000));
      gameStore.addCaughtSoulDoll(opponentDoll);
      gameStore.endBattle(true);
    } else {
      const oppMove = opponentDoll.moves[0];
      if (oppMove) {
        const announce = `¡${opponentDoll.nickname} contraataca furioso con ${oppMove.name}!`;
        battle.log.push(announce);
        setCurrentMessage(announce);
        gameStore.setState({ battleState: { ...battle } });
        await new Promise(r => setTimeout(r, 1000));

        const res = combatEngine.calculateDamage(opponentDoll, playerDoll, oppMove);
        playerDoll.currentHp = Math.max(0, playerDoll.currentHp - res.damage);
        sound.playHit();
        gameStore.setState({ battleState: { ...battle } });
        await new Promise(r => setTimeout(r, 1000));

        if (playerDoll.currentHp <= 0) {
          handlePlayerFainted();
        }
      }
    }

    setShakeCount(0);
    setIsExecuting(false);
  };

  // Switch Active Doll
  const handleSwitchDoll = (index: number) => {
    const target = state.playerParty[index];
    if (target.currentHp <= 0) {
      gameStore.showToast('¡Ese SoulDoll está debilitado y no puede combatir!');
      return;
    }
    if (index === battle.playerActiveIndex) {
      gameStore.showToast('¡Ese SoulDoll ya está en combate!');
      return;
    }

    triggerHaptic(20);
    sound.playSelect();
    battle.playerActiveIndex = index;
    battle.log.push(`¡Regresa, ${playerDoll.nickname}! ¡Adelante, ${target.nickname}!`);
    setCurrentMessage(`¡Adelante, ${target.nickname}!`);
    setActiveMenu('root');
    gameStore.setState({ battleState: { ...battle } });
  };

  // Flee
  const handleFlee = () => {
    if (battle.isTrainerBattle) {
      gameStore.showToast('¡No puedes huir de un duelo oficial de Domadores!');
      return;
    }
    triggerHaptic(20);
    sound.playSelect();
    gameStore.showToast('¡Lograste escapar con éxito del combate salvaje!');
    gameStore.endBattle(false);
  };

  const getHpColor = (cur: number, max: number) => {
    const ratio = cur / max;
    if (ratio > 0.5) return 'bg-emerald-500';
    if (ratio > 0.2) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const toggleTab = (tab: 'moves' | 'items' | 'switch') => {
    triggerHaptic(15);
    sound.playSelect();
    setActiveMenu(prev => (prev === tab ? 'root' : tab));
  };

  return (
    <div
      className="absolute inset-0 w-[100dvw] h-[100dvh] max-w-[100dvw] max-h-[100dvh] overflow-hidden pointer-events-none flex flex-col justify-between z-40 select-none touch-none"
      style={{
        paddingTop: 'max(20px, env(safe-area-inset-top))',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(20px, env(safe-area-inset-left))',
        paddingRight: 'max(20px, env(safe-area-inset-right))',
      }}
    >
      {/* 1. TOP HEADER: Opponent Status Box & Wild / Duel Badge */}
      <div className="flex justify-between items-start pointer-events-auto gap-3 w-full max-w-4xl mx-auto">
        {/* Opponent Status Box (Cryopup / Wild / Trainer) */}
        <div className="battle-status-box p-3 sm:p-3.5 rounded-2xl min-w-[210px] sm:min-w-[280px] max-w-[290px] sm:max-w-xs">
          {/* Row 1: Name and Level */}
          <div className="flex justify-between items-center mb-1.5">
            <span className="font-pixel text-[11px] sm:text-xs text-amber-300 font-bold truncate max-w-[140px] sm:max-w-none tracking-tight">
              {opponentDoll.nickname}
            </span>
            <span className="font-pixel text-[9px] sm:text-[10px] bg-slate-900/95 text-slate-200 px-2 py-0.5 rounded-md border border-slate-700/70 font-semibold shadow-inner">
              Nv.{opponentDoll.level}
            </span>
          </div>

          {/* Row 2: Type Tag and Status Condition */}
          <div className="flex gap-1.5 mb-2 items-center">
            <span
              className="text-[8px] sm:text-[9px] font-pixel px-2 py-0.5 rounded-md font-bold shadow-sm"
              style={{
                backgroundColor: TYPE_COLORS[opponentDoll.moves[0]?.type || 'Fire'].bg,
                color: TYPE_COLORS[opponentDoll.moves[0]?.type || 'Fire'].text,
              }}
            >
              {opponentDoll.moves[0]?.type || 'Fire'}
            </span>
            {opponentDoll.status && (
              <span className="text-[8px] sm:text-[9px] font-pixel uppercase px-1.5 py-0.5 rounded-md bg-rose-600 text-white font-bold animate-pulse">
                {opponentDoll.status}
              </span>
            )}
          </div>

          {/* Row 3: HP Bar */}
          <div className="flex items-center gap-2">
            <span className="font-pixel text-[9px] sm:text-[10px] text-emerald-400 font-bold tracking-wider">
              HP
            </span>
            <div className="flex-1 bg-black/85 h-3 sm:h-3.5 rounded-full overflow-hidden border border-slate-700/80 shadow-[inset_0_1.5px_4px_rgba(0,0,0,0.85)] p-[1px]">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out shadow-sm ${getHpColor(
                  opponentDoll.currentHp,
                  opponentDoll.maxHp
                )}`}
                style={{ width: `${(opponentDoll.currentHp / opponentDoll.maxHp) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Wild / Duel Badge - Aligned cleanly to top right with comfortable padding */}
        <div className="battle-status-box px-3.5 py-2 rounded-full text-indigo-200 font-pixel text-[9px] sm:text-[10px] flex items-center gap-2 shrink-0 border border-indigo-400/30 shadow-md">
          <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
          <span className="font-bold tracking-tight">
            {battle.isTrainerBattle ? `Duelo vs ${battle.trainerName}` : 'SoulDoll Salvaje'}
          </span>
        </div>
      </div>

      {/* 2. MIDDLE AREA: Empty spacer for unobstructed 3D Battle Arena Stage */}
      <div className="flex-1 pointer-events-none min-h-[60px]" />

      {/* 3. BOTTOM SECTION: Player Card + Dialogue + Action Grid */}
      <div className="pointer-events-auto flex flex-col gap-2.5 w-full max-w-4xl mx-auto z-40">
        {/* Player Status Card (Ignisaur) - Positioned nicely above dialogue box on the right */}
        <div className="self-end battle-status-box p-3 sm:p-3.5 rounded-2xl min-w-[220px] sm:min-w-[300px] max-w-[310px] sm:max-w-xs mb-0.5">
          {/* Row 1: Nickname and Level */}
          <div className="flex justify-between items-center mb-1.5">
            <span className="font-pixel text-[11px] sm:text-xs text-sky-300 font-bold truncate max-w-[150px] sm:max-w-none tracking-tight">
              {playerDoll.nickname}
            </span>
            <span className="font-pixel text-[9px] sm:text-[10px] bg-slate-900/95 text-slate-200 px-2 py-0.5 rounded-md border border-slate-700/70 font-semibold shadow-inner">
              Nv.{playerDoll.level}
            </span>
          </div>

          {/* Row 2: HP Bar with readable numbers */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-pixel text-[9px] sm:text-[10px] text-emerald-400 font-bold tracking-wider">
              HP
            </span>
            <div className="flex-1 bg-black/85 h-3 sm:h-3.5 rounded-full overflow-hidden border border-slate-700/80 shadow-[inset_0_1.5px_4px_rgba(0,0,0,0.85)] p-[1px]">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out shadow-sm ${getHpColor(
                  playerDoll.currentHp,
                  playerDoll.maxHp
                )}`}
                style={{ width: `${(playerDoll.currentHp / playerDoll.maxHp) * 100}%` }}
              />
            </div>
            <span className="font-pixel text-[8px] sm:text-[9px] text-slate-200 font-bold shrink-0">
              {playerDoll.currentHp}/{playerDoll.maxHp}
            </span>
          </div>

          {/* Row 3: EXP Bar */}
          <div className="flex items-center gap-2">
            <span className="font-pixel text-[8px] sm:text-[9px] text-sky-400 font-bold tracking-wider">
              EXP
            </span>
            <div className="flex-1 bg-black/85 h-2 rounded-full overflow-hidden border border-slate-700/80 shadow-[inset_0_1px_3px_rgba(0,0,0,0.85)] p-[0.5px]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500 ease-out shadow-sm"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(0, ((playerDoll.currentXp % 100) / 100) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Dialogue Box: Classic RPG Double-Border Box */}
        <div className="rpg-dialogue-box px-4 py-3 sm:py-3.5 rounded-xl flex items-center min-h-[52px] sm:min-h-[64px]">
          <p className="font-pixel text-[10px] sm:text-xs text-slate-100 leading-relaxed pixelated">
            {currentMessage || '¿Qué orden darás a tu SoulDoll?'}
          </p>
        </div>

        {/* Collapsible Menu Drawer (When a tab is open) */}
        {activeMenu !== 'root' && (
          <div className="rpg-dialogue-box p-3 rounded-xl shadow-2xl animate-in slide-in-from-bottom-2 duration-200">
            {/* Header with Title and Collapse Button */}
            <div className="flex justify-between items-center pb-2 mb-2 border-b border-slate-700/70">
              <span className="font-pixel text-[10px] text-amber-300 font-bold flex items-center gap-1.5">
                {activeMenu === 'moves' && '✦ ELIGE UNA HABILIDAD:'}
                {activeMenu === 'items' && '🏺 LANZAR VIAL DE CAPTURA:'}
                {activeMenu === 'switch' && '👥 CAMBIAR SOULDOLL ACTIVO:'}
              </span>
              <button
                onClick={() => {
                  triggerHaptic(15);
                  setActiveMenu('root');
                }}
                className="arcade-btn px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-pixel text-[9px] rounded-lg flex items-center gap-1 border-b-2 border-slate-950 active:border-b-0 active:translate-y-[1px]"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span>PLEGAR</span>
              </button>
            </div>

            {/* TAB: MOVES */}
            {activeMenu === 'moves' && (
              <div className="grid grid-cols-2 gap-2 max-h-44 sm:max-h-56 overflow-y-auto touch-pan-y pr-1">
                {playerDoll.moves.map((move, i) => {
                  const typeTheme = TYPE_COLORS[move.type] || TYPE_COLORS.Fire;
                  return (
                    <button
                      key={move.id + i}
                      disabled={isExecuting || move.currentPp <= 0}
                      onClick={() => handleSelectMove(move)}
                      className="arcade-btn text-left p-2.5 sm:p-3 rounded-xl bg-slate-800 hover:bg-slate-750 border-b-4 border-slate-950 active:border-b-0 active:translate-y-[2px] flex flex-col justify-between min-h-[54px] transition-all disabled:opacity-40"
                    >
                      <div className="font-pixel text-[10px] sm:text-[11px] text-white font-bold truncate mb-1">
                        {move.name}
                      </div>
                      <div className="flex justify-between items-center text-[8px] sm:text-[9px] font-pixel">
                        <span
                          className="px-1.5 py-0.5 rounded font-bold"
                          style={{ backgroundColor: typeTheme.bg, color: typeTheme.text }}
                        >
                          {move.type}
                        </span>
                        <span className="text-slate-300 font-bold">
                          {move.currentPp}/{move.maxPp} PP
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* TAB: VIALS */}
            {activeMenu === 'items' && (
              <div className="flex flex-col gap-2 max-h-44 sm:max-h-56 overflow-y-auto touch-pan-y pr-1">
                {['animus_vial', 'great_vial', 'celestial_vial'].map(vialId => {
                  const vial = state.inventory[vialId];
                  if (!vial || vial.count <= 0) return null;
                  return (
                    <button
                      key={vialId}
                      disabled={isExecuting || battle.isTrainerBattle}
                      onClick={() => handleThrowVial(vial)}
                      className="arcade-btn p-2.5 sm:p-3 rounded-xl bg-slate-800 hover:bg-slate-750 border-b-4 border-amber-950 active:border-b-0 active:translate-y-[2px] flex justify-between items-center text-left min-h-[50px] disabled:opacity-40"
                    >
                      <div>
                        <div className="font-pixel text-[10px] text-amber-300 font-bold">
                          {vial.name}
                        </div>
                        <div className="text-[9px] text-slate-300 mt-0.5">{vial.description}</div>
                      </div>
                      <span className="font-pixel text-xs text-amber-300 bg-slate-950 px-2 py-1 rounded border border-amber-600/40 ml-2 shrink-0">
                        x{vial.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* TAB: SWITCH */}
            {activeMenu === 'switch' && (
              <div className="flex flex-col gap-2 max-h-44 sm:max-h-56 overflow-y-auto touch-pan-y pr-1">
                {state.playerParty.map((doll, idx) => (
                  <button
                    key={doll.uuid}
                    disabled={isExecuting || doll.currentHp <= 0 || idx === battle.playerActiveIndex}
                    onClick={() => handleSwitchDoll(idx)}
                    className={`arcade-btn p-2 sm:p-2.5 rounded-xl flex justify-between items-center text-left border-b-4 active:border-b-0 active:translate-y-[2px] min-h-[50px] ${
                      idx === battle.playerActiveIndex
                        ? 'bg-slate-700/70 border-sky-400 border-b-sky-600'
                        : doll.currentHp <= 0
                        ? 'bg-slate-950/70 border-b-rose-950 opacity-40'
                        : 'bg-slate-800 hover:bg-slate-750 border-b-slate-950'
                    }`}
                  >
                    <div>
                      <span className="font-pixel text-[10px] text-white font-bold">
                        {doll.nickname} (Nv.{doll.level})
                      </span>
                      {idx === battle.playerActiveIndex && (
                        <span className="ml-2 font-pixel text-[8px] text-sky-400 font-bold">[ACTIVO]</span>
                      )}
                    </div>
                    <span className="font-pixel text-[9px] text-slate-200 font-bold">
                      {doll.currentHp}/{doll.maxHp} HP
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. ACTION BUTTONS: 4-Column Grid with Arcade 3D Depth */}
        <div className="grid grid-cols-4 gap-2.5 sm:gap-3 w-full">
          {/* FIGHT BUTTON */}
          <button
            disabled={isExecuting}
            onClick={() => toggleTab('moves')}
            className={`arcade-btn min-h-[52px] sm:min-h-[58px] rounded-xl font-pixel text-[10px] sm:text-xs flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 font-bold transition-all shadow-md ${
              activeMenu === 'moves'
                ? 'bg-red-500 text-white ring-2 ring-red-300 border-b-2 border-red-900 translate-y-[2px]'
                : 'bg-gradient-to-b from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 border-b-4 border-red-950 text-white active:border-b-0 active:translate-y-[2px]'
            }`}
          >
            <Sword className="w-4 h-4 text-amber-200 shrink-0" />
            <span className="tracking-tight">LUCHAR</span>
          </button>

          {/* VIALS BUTTON */}
          <button
            disabled={isExecuting}
            onClick={() => toggleTab('items')}
            className={`arcade-btn min-h-[52px] sm:min-h-[58px] rounded-xl font-pixel text-[10px] sm:text-xs flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 font-bold transition-all shadow-md ${
              activeMenu === 'items'
                ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-200 border-b-2 border-amber-900 translate-y-[2px]'
                : 'bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 border-b-4 border-amber-950 text-slate-950 active:border-b-0 active:translate-y-[2px]'
            }`}
          >
            <Briefcase className="w-4 h-4 text-slate-950 shrink-0" />
            <span className="tracking-tight">VIALES</span>
          </button>

          {/* DOLLS (ALMAS) BUTTON */}
          <button
            disabled={isExecuting}
            onClick={() => toggleTab('switch')}
            className={`arcade-btn min-h-[52px] sm:min-h-[58px] rounded-xl font-pixel text-[10px] sm:text-xs flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 font-bold transition-all shadow-md ${
              activeMenu === 'switch'
                ? 'bg-emerald-500 text-white ring-2 ring-emerald-300 border-b-2 border-emerald-950 translate-y-[2px]'
                : 'bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 border-b-4 border-emerald-950 text-white active:border-b-0 active:translate-y-[2px]'
            }`}
          >
            <Users className="w-4 h-4 text-emerald-200 shrink-0" />
            <span className="tracking-tight">ALMAS</span>
          </button>

          {/* FLEE BUTTON */}
          <button
            disabled={isExecuting}
            onClick={handleFlee}
            className="arcade-btn min-h-[52px] sm:min-h-[58px] rounded-xl font-pixel text-[10px] sm:text-xs flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 font-bold transition-all shadow-md bg-gradient-to-b from-slate-700 to-slate-800 hover:from-slate-650 hover:to-slate-750 border-b-4 border-slate-950 text-slate-200 active:border-b-0 active:translate-y-[2px]"
          >
            <LogOut className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="tracking-tight">HUIR</span>
          </button>
        </div>
      </div>
    </div>
  );
};
