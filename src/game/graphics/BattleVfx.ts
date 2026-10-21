/**
 * Battle VFX Bridge
 * ---------------------------------------------------------------------------
 * Small, typed contract between the battle logic (React / CombatEngine) and the
 * Three.js visual layer (LuminatiRenderer).
 *
 * Design rules:
 *  - Combat rules (damage, crits, immunities, status) stay in CombatEngine /
 *    BattleUI. This module never computes anything about the fight.
 *  - The UI asks for an effect and awaits the `impact` signal. The signal is
 *    emitted by the renderer exactly on the impact frame, so HP is applied at
 *    the moment the player sees the hit land.
 *  - A watchdog guarantees the promise always resolves, even if WebGL is not
 *    available, the tab is backgrounded (rAF paused) or the renderer is gone.
 *    The battle can therefore never stall because of the visual layer.
 */
import { Move, StatusCondition } from '../../types/game';

export type BattleSide = 'player' | 'opponent';

/** Information the visual layer needs to build a truthful effect. */
export interface AttackVfxRequest {
  /** Move being used (drives type / category behaviour). */
  move: Move;
  /** Who is attacking. */
  attacker: BattleSide;
  /** Who receives the move. */
  defender: BattleSide;
  /** Damage that was rolled (0 for status / healing moves). */
  damage: number;
  /** Whether the attack rolled a critical hit. */
  isCrit: boolean;
  /** Type effectiveness multiplier (0 means immunity). */
  typeMultiplier: number;
  /** Status condition that was actually applied (null when none). */
  statusApplied?: StatusCondition | null;
  /** Amount of HP restored by the move (0 when it is not a heal). */
  healedAmount?: number;
}

/** Command handed to the renderer: the impact callback must be invoked once. */
export interface AttackVfxCommand extends AttackVfxRequest {
  /** Called by the renderer on the impact frame. */
  onImpact: () => void;
}

export interface FaintVfxRequest {
  side: BattleSide;
}

/** Implemented by the renderer (the only sink of visual effects). */
export interface BattleVfxSink {
  playAttack(command: AttackVfxCommand): void;
  playFaint(request: FaintVfxRequest): void;
  playRecall(side: BattleSide): void;
}

/** Fallback used when the renderer cannot paint (no WebGL / destroyed). */
const NO_SINK_DELAY_MS = 260;
/** Hard watchdog so a paused rAF loop can never freeze the battle. */
const IMPACT_WATCHDOG_MS = 1600;

class BattleVfxBridge {
  private sink: BattleVfxSink | null = null;

  /** The renderer registers itself here while it is alive. */
  public registerSink(sink: BattleVfxSink): void {
    this.sink = sink;
  }

  /** The renderer unregisters itself on destroy / battle exit. */
  public unregisterSink(sink: BattleVfxSink): void {
    if (this.sink === sink) this.sink = null;
  }

  /**
   * Plays the attack effect and resolves when the impact frame happens.
   * The caller applies the HP change inside the awaited continuation.
   */
  public playAttack(request: AttackVfxRequest): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      let watchdog = 0;

      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(watchdog);
        resolve();
      };

      watchdog = window.setTimeout(finish, IMPACT_WATCHDOG_MS);

      if (this.sink) {
        this.sink.playAttack({ ...request, onImpact: finish });
      } else {
        // No renderer available: keep the pacing roughly the same and move on.
        window.setTimeout(finish, NO_SINK_DELAY_MS);
      }
    });
  }

  /** Soul dissolve played when a SoulDoll falls. */
  public playFaint(side: BattleSide): void {
    this.sink?.playFaint({ side });
  }

  /** Soul motes returning to the doll when the player switches it. */
  public playRecall(side: BattleSide): void {
    this.sink?.playRecall(side);
  }
}

export const battleVfx = new BattleVfxBridge();
