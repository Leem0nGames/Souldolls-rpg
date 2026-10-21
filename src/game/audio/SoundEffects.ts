/**
 * SoulDolls - Procedural Web Audio Engine
 * Zero external audio files: generates authentic 8-bit / 16-bit sound effects & chiptune melodies.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Play a single synthesized note
  public playTone(freq: number, duration: number, type: OscillatorType = 'sine', gainVal = 0.1, pitchBend?: number) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      if (pitchBend !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(10, pitchBend), this.ctx.currentTime + duration);
      }

      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {
      // Audio context might be restricted before first click
    }
  }

  // Menu cursor blip
  public playSelect() {
    this.playTone(600, 0.06, 'square', 0.05, 900);
  }

  // Combat attack impact
  public playHit() {
    this.playTone(180, 0.12, 'sawtooth', 0.15, 40);
  }

  // Super effective hit
  public playSuperEffective() {
    this.playTone(400, 0.1, 'square', 0.12);
    setTimeout(() => this.playTone(600, 0.1, 'square', 0.15), 50);
    setTimeout(() => this.playTone(850, 0.2, 'sawtooth', 0.18, 1200), 110);
  }

  // Critical hit impact
  public playCrit() {
    this.playTone(250, 0.08, 'triangle', 0.15);
    setTimeout(() => this.playTone(520, 0.15, 'sawtooth', 0.2, 100), 40);
  }

  // Wild soul encounter screech/jingle
  public playEncounter() {
    const notes = [440, 554, 659, 880, 784, 880, 1046];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 0.08, 'sawtooth', 0.12);
      }, idx * 60);
    });
  }

  // Soul Vial capture shake wobble
  public playVialShake() {
    this.playTone(240, 0.08, 'sine', 0.1, 180);
    setTimeout(() => this.playTone(220, 0.08, 'sine', 0.1, 260), 100);
  }

  // Soul Vial capture success fanfare!
  public playVialSuccess() {
    const fanfare = [
      { f: 523, d: 0.12 },
      { f: 659, d: 0.12 },
      { f: 784, d: 0.12 },
      { f: 1046, d: 0.35 }
    ];
    let time = 0;
    fanfare.forEach(({ f, d }) => {
      setTimeout(() => this.playTone(f, d, 'square', 0.15), time);
      time += d * 1000 + 40;
    });
  }

  // Level up melody
  public playLevelUp() {
    const melody = [523, 587, 659, 698, 784, 880, 987, 1046];
    melody.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 0.1, 'triangle', 0.15);
      }, i * 70);
    });
  }

  // Dynamic evolution ascending cosmic arpeggio
  public playEvolution() {
    const evoSteps = [330, 392, 493, 587, 659, 784, 987, 1174, 1318];
    evoSteps.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 0.14, 'square', 0.12, freq * 1.05);
      }, i * 80);
    });
  }

  // Heal at Sanctuary shrine
  public playHeal() {
    const healNotes = [440, 554, 659, 880];
    healNotes.forEach((f, idx) => {
      setTimeout(() => {
        this.playTone(f, 0.25, 'sine', 0.1);
      }, idx * 100);
    });
  }

  // SoulDoll faints
  public playFaint() {
    this.playTone(300, 0.35, 'sawtooth', 0.12, 60);
  }
}

export const sound = new SoundEngine();
