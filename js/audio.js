// Motore audio 100% procedurale v3.0:
// - Musichetta chill/lo-fi (~75 BPM) fuori partita che sfuma nei match
// - Controlli separati Musica ON/OFF e Effetti (SFX) ON/OFF
// - Brusio stadio, SFX partita, Walkout segreti, Elicottero e VAR

const CHILL_CHORDS = [
  // Cmaj7
  { bass: 130.81, notes: [261.63, 329.63, 392.0, 493.88], arp: [523.25, 659.25, 587.33] },
  // Am7
  { bass: 110.0, notes: [220.0, 261.63, 329.63, 392.0], arp: [493.88, 523.25, 659.25] },
  // Fmaj7
  { bass: 87.31, notes: [174.61, 220.0, 261.63, 329.63], arp: [440.0, 523.25, 493.88] },
  // G6
  { bass: 98.0, notes: [196.0, 246.94, 293.66, 329.63], arp: [392.0, 493.88, 587.33] },
];

class ProceduralAudio {
  constructor() {
    this.ctx = null;
    this.musicEnabled = true;
    this.sfxEnabled = true;
    this.noiseBuffer = null;
    this.ambience = null;

    // Loop musicale lo-fi (~75 BPM -> 1 battuta da 4/4 = 3.2s)
    this.musicBus = null;
    this.musicTimer = null;
    this.chordIndex = 0;
    this.inMatch = false;
  }

  setMusicEnabled(flag) {
    this.musicEnabled = Boolean(flag);
    if (!this.musicEnabled) {
      this.stopMusic();
    } else if (this.ctx && this.ctx.state === 'running') {
      this.startMusic();
    }
  }

  setSfxEnabled(flag) {
    this.sfxEnabled = Boolean(flag);
    if (!this.sfxEnabled) {
      this.stopStadiumAmbience();
    }
  }

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      try {
        this.ctx = new AudioCtx();
      } catch {
        return;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        if (this.musicEnabled) this.startMusic();
      }).catch(() => {});
    } else if (this.ctx && this.ctx.state === 'running' && this.musicEnabled && !this.musicTimer) {
      this.startMusic();
    }
  }

  _readySfx() {
    if (!this.sfxEnabled) return null;
    if (!this.ctx) this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  _getNoiseBuffer(ctx) {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = ctx.sampleRate * 2.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.992 * b0 + white * 0.045;
      b1 = 0.96 * b1 + white * 0.13;
      data[i] = Math.max(-1, Math.min(1, b0 + b1 + white * 0.18));
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  // --- MUSICA CHILL LO-FI (~75 BPM) ---

  startMusic() {
    if (!this.musicEnabled || !this.ctx || this.ctx.state !== 'running') return;
    if (this.musicTimer) return;

    if (!this.musicBus) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1150, this.ctx.currentTime);
      lp.Q.value = 0.6;

      const gain = this.ctx.createGain();
      const targetVol = this.inMatch ? 0.008 : 0.055;
      gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(targetVol, this.ctx.currentTime + 0.9);

      lp.connect(gain);
      gain.connect(this.ctx.destination);
      this.musicBus = { input: lp, gain };
    }

    this._playChillBar();
    this.musicTimer = setInterval(() => {
      if (!this.musicEnabled || !this.ctx || this.ctx.state !== 'running') return;
      this._playChillBar();
    }, 3200); // 75 BPM -> 0.8s/beat * 4 beats = 3.2s
  }

  _playChillBar() {
    if (!this.ctx || !this.musicBus) return;
    const now = this.ctx.currentTime + 0.04;
    const chord = CHILL_CHORDS[this.chordIndex % CHILL_CHORDS.length];
    this.chordIndex += 1;

    // 1. Pad morbido / piano elettrico filtrato
    chord.notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime((idx - 1.5) * 4, now);

      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.14, now + 0.14);
      g.gain.exponentialRampToValueAtTime(0.04, now + 2.4);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 3.15);

      osc.connect(g);
      g.connect(this.musicBus.input);
      osc.start(now);
      osc.stop(now + 3.2);
    });

    // 2. Basso caldo morbido sul battere 1 e 3
    [0, 1.6].forEach((offset, i) => {
      const t = now + offset;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(chord.bass * (i === 1 ? 1.5 : 1), t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
      osc.connect(g);
      g.connect(this.musicBus.input);
      osc.start(t);
      osc.stop(t + 1.4);
    });

    // 3. Tocchi discreti di Rhodes arpeggiati in stile lo-fi
    chord.arp.forEach((freq, i) => {
      const t = now + 0.8 + i * 0.8;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.075, t + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      osc.connect(g);
      g.connect(this.musicBus.input);
      osc.start(t);
      osc.stop(t + 0.7);
    });
  }

  fadeMusicForMatch(inMatch) {
    this.inMatch = Boolean(inMatch);
    if (!this.musicBus || !this.ctx || !this.musicEnabled) return;
    const now = this.ctx.currentTime;
    const target = this.inMatch ? 0.006 : 0.055;
    this.musicBus.gain.gain.setTargetAtTime(target, now, 0.35);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.musicBus && this.ctx) {
      try {
        this.musicBus.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.12);
      } catch {
        // ignore
      }
    }
    this.musicBus = null;
  }

  // --- BRUSIO STADIO DURANTE LE PARTITE ---

  startStadiumAmbience() {
    const ctx = this._readySfx();
    if (!ctx || this.ambience) return;

    const src = ctx.createBufferSource();
    src.buffer = this._getNoiseBuffer(ctx);
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, ctx.currentTime);
    filter.Q.value = 0.85;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.032, ctx.currentTime + 0.6);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();

    this.ambience = { src, filter, gain };
  }

  setAmbienceIntensity(intensity = 0) {
    if (!this.ambience || !this.ctx || !this.sfxEnabled) return;
    const now = this.ctx.currentTime;
    const clamped = Math.max(0, Math.min(1, intensity));
    const targetGain = 0.03 + clamped * 0.055;
    const targetFreq = 500 + clamped * 440;
    this.ambience.gain.gain.setTargetAtTime(targetGain, now, 0.14);
    this.ambience.filter.frequency.setTargetAtTime(targetFreq, now, 0.18);
  }

  stopStadiumAmbience() {
    if (!this.ambience) return;
    const { src, gain } = this.ambience;
    this.ambience = null;
    try {
      if (this.ctx) {
        const now = this.ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(0.0001, now, 0.08);
        setTimeout(() => {
          try { src.stop(); } catch { /* ignore */ }
        }, 260);
      } else {
        src.stop();
      }
    } catch {
      // ignore
    }
  }

  // --- EFFETTI SONORI PROCEDURALI (SFX) ---

  playTap(isCrit = false) {
    const ctx = this._readySfx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isCrit ? 220 : 165, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.075);

    gain.gain.setValueAtTime(isCrit ? 0.22 : 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);

    if (isCrit) {
      const ping = ctx.createOscillator();
      const pingGain = ctx.createGain();
      ping.type = 'sine';
      ping.frequency.setValueAtTime(880, now);
      ping.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
      pingGain.gain.setValueAtTime(0.12, now);
      pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      ping.connect(pingGain);
      pingGain.connect(ctx.destination);
      ping.start(now);
      ping.stop(now + 0.15);
    }
  }

  playBuy() {
    const ctx = this._readySfx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const t = now + idx * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.14);
    });
  }

  playWhistle(kind = 'short') {
    const ctx = this._readySfx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const bursts =
      kind === 'fulltime'
        ? [
            { offset: 0, dur: 0.16 },
            { offset: 0.21, dur: 0.16 },
            { offset: 0.42, dur: 0.42 },
          ]
        : [{ offset: 0, dur: 0.3 }];

    for (const b of bursts) {
      const t = now + b.offset;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const master = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(2720, t);
      osc2.frequency.setValueAtTime(2870, t);

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(34, t);
      lfoGain.gain.setValueAtTime(95, t);
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfoGain.connect(osc2.frequency);

      master.gain.setValueAtTime(0.001, t);
      master.gain.linearRampToValueAtTime(0.14, t + 0.02);
      master.gain.setValueAtTime(0.13, t + Math.max(0.03, b.dur - 0.05));
      master.gain.exponentialRampToValueAtTime(0.001, t + b.dur);

      osc1.connect(master);
      osc2.connect(master);
      master.connect(ctx.destination);
      osc1.start(t);
      osc2.start(t);
      lfo.start(t);
      osc1.stop(t + b.dur + 0.02);
      osc2.stop(t + b.dur + 0.02);
      lfo.stop(t + b.dur + 0.02);
    }
  }

  playPackOpen(rarity = 'comune') {
    const ctx = this._readySfx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const sweep = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(220, now);
    sweep.frequency.exponentialRampToValueAtTime(
      rarity === 'segreto' ? 1320 : rarity === 'leggenda' ? 1100 : rarity === 'epico' ? 880 : 620,
      now + 0.28
    );

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);
    sweepGain.gain.setValueAtTime(0.075, now);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    sweep.connect(filter);
    filter.connect(sweepGain);
    sweepGain.connect(ctx.destination);
    sweep.start(now);
    sweep.stop(now + 0.31);

    const chords = {
      comune: [392.0, 493.88, 587.33],
      raro: [440.0, 554.37, 659.25, 880.0],
      epico: [523.25, 659.25, 783.99, 1046.5],
      leggenda: [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98],
      segreto: [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093.0],
    };
    const notes = chords[rarity] || chords.comune;

    notes.forEach((freq, i) => {
      const t = now + 0.25 + i * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = rarity === 'segreto' || rarity === 'leggenda' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.115, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  // Riser drammatico + battito cardiaco per il Walkout dei Giocatori Segreti!
  playWalkoutRiser() {
    const ctx = this._readySfx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 4 battiti cardiaci in accelerazione
    [0, 0.55, 1.0, 1.38].forEach((off, idx) => {
      const t = now + off;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(92 + idx * 14, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.16);
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });

    // Riser ascendente filtrato
    const riser = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const rg = ctx.createGain();
    riser.type = 'sawtooth';
    riser.frequency.setValueAtTime(110, now);
    riser.frequency.exponentialRampToValueAtTime(880, now + 1.85);
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(320, now);
    filt.frequency.exponentialRampToValueAtTime(3200, now + 1.85);
    rg.gain.setValueAtTime(0.001, now);
    rg.gain.linearRampToValueAtTime(0.11, now + 1.7);
    rg.gain.exponentialRampToValueAtTime(0.001, now + 1.9);

    riser.connect(filt);
    filt.connect(rg);
    rg.connect(ctx.destination);
    riser.start(now);
    riser.stop(now + 1.92);
  }

  playWalkoutBurst(aura = 'fire') {
    const ctx = this._readySfx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Esplosione d'impatto personalizzata per aura (fire / electric / granite / emerald)
    const src = ctx.createBufferSource();
    src.buffer = this._getNoiseBuffer(ctx);
    const f = ctx.createBiquadFilter();
    f.type = aura === 'electric' || aura === 'emerald' ? 'highpass' : aura === 'granite' ? 'lowpass' : 'bandpass';
    const freqMap = { fire: 480, electric: 1400, granite: 280, emerald: 1050 };
    f.frequency.setValueAtTime(freqMap[aura] || 520, now);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(aura === 'granite' ? 0.28 : 0.24, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    src.connect(f);
    f.connect(ng);
    ng.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.7);

    // Extra colpo basso di granito per Tumas Pscon / sweep turbo per Vavelocino
    if (aura === 'granite') {
      const thump = ctx.createOscillator();
      const tg = ctx.createGain();
      thump.type = 'triangle';
      thump.frequency.setValueAtTime(125, now);
      thump.frequency.exponentialRampToValueAtTime(36, now + 0.34);
      tg.gain.setValueAtTime(0.28, now);
      tg.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      thump.connect(tg);
      tg.connect(ctx.destination);
      thump.start(now);
      thump.stop(now + 0.38);
    } else if (aura === 'emerald') {
      const whoosh = ctx.createOscillator();
      const wg = ctx.createGain();
      whoosh.type = 'sine';
      whoosh.frequency.setValueAtTime(420, now);
      whoosh.frequency.exponentialRampToValueAtTime(1960, now + 0.22);
      wg.gain.setValueAtTime(0.14, now);
      wg.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      whoosh.connect(wg);
      wg.connect(ctx.destination);
      whoosh.start(now);
      whoosh.stop(now + 0.28);
    }

    // Fanfara trionfale segreta
    const notes =
      aura === 'granite'
        ? [392.0, 493.88, 587.33, 783.99, 1174.66]
        : aura === 'emerald'
          ? [587.33, 739.99, 880.0, 1174.66, 1760.0]
          : [523.25, 659.25, 783.99, 1046.5, 1567.98];
    const step = aura === 'emerald' ? 0.052 : 0.065;
    notes.forEach((freq, i) => {
      const t = now + i * step;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.68);
    });
  }

  // Squittio dolcissimo della mascotte criceto Polpetta!
  playHamsterSqueak() {
    const ctx = this._readySfx();
    if (!ctx) return;
    const now = ctx.currentTime;

    [
      { off: 0, start: 1550, peak: 2380, end: 1820, dur: 0.085 },
      { off: 0.095, start: 1750, peak: 2620, end: 2050, dur: 0.075 },
    ].forEach((c) => {
      const t = now + c.off;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(c.start, t);
      osc.frequency.exponentialRampToValueAtTime(c.peak, t + c.dur * 0.45);
      osc.frequency.exponentialRampToValueAtTime(c.end, t + c.dur);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + c.dur + 0.01);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + c.dur + 0.02);
    });
  }

  playHelicopter() {
    const ctx = this._readySfx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this._getNoiseBuffer(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(340, now);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.001, now);
    amp.gain.linearRampToValueAtTime(0.14, now + 0.5);
    amp.gain.setValueAtTime(0.14, now + 1.7);
    amp.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

    // Modulazione pale rotore (~11Hz)
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(11, now);
    lfoGain.gain.setValueAtTime(0.06, now);
    lfo.connect(lfoGain);
    lfoGain.connect(amp.gain);

    src.connect(lp);
    lp.connect(amp);
    amp.connect(ctx.destination);
    src.start(now);
    lfo.start(now);
    src.stop(now + 2.55);
    lfo.stop(now + 2.55);
  }

  playVarBeep() {
    const ctx = this._readySfx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [980, 1318].forEach((f, i) => {
      const t = now + i * 0.14;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  }

  playPowerOn() {
    const ctx = this._readySfx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.35);
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.44);
  }

  playGoal() {
    const ctx = this._readySfx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this._getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650, now);
    filter.frequency.linearRampToValueAtTime(1180, now + 0.35);
    filter.frequency.linearRampToValueAtTime(520, now + 1.25);
    filter.Q.value = 1.05;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.24, now + 0.16);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

    src.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 1.35);

    const fanfare = [
      { f: 523.25, t: 0.0, d: 0.14 },
      { f: 659.25, t: 0.12, d: 0.14 },
      { f: 783.99, t: 0.24, d: 0.18 },
      { f: 1046.5, t: 0.4, d: 0.48 },
    ];
    for (const n of fanfare) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.f, now + n.t);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2200, now + n.t);
      g.gain.setValueAtTime(0.08, now + n.t);
      g.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);
      osc.connect(lp);
      lp.connect(g);
      g.connect(ctx.destination);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d + 0.02);
    }
  }

  playFlashEvent(hit = false) {
    const ctx = this._readySfx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = hit ? [783.99, 1046.5, 1318.5, 1567.98] : [698.46, 880.0];
    freqs.forEach((f, i) => {
      const t = now + i * 0.055;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(hit ? 0.13 : 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  playSave() {
    const ctx = this._readySfx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.11);
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);

    const chime = ctx.createOscillator();
    const cg = ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(587.33, now + 0.05);
    chime.frequency.setValueAtTime(880, now + 0.11);
    cg.gain.setValueAtTime(0.11, now + 0.05);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    chime.connect(cg);
    cg.connect(ctx.destination);
    chime.start(now + 0.05);
    chime.stop(now + 0.26);
  }

  playCrossbar() {
    const ctx = this._readySfx();
    if (!ctx) return;
    const now = ctx.currentTime;

    [415, 987, 1520].forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.96, now + 0.36);
      g.gain.setValueAtTime(idx === 0 ? 0.18 : 0.09, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    });

    const src = ctx.createBufferSource();
    src.buffer = this._getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(780, now + 0.06);
    filter.frequency.exponentialRampToValueAtTime(340, now + 0.6);
    filter.Q.value = 1.6;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.001, now + 0.05);
    ng.gain.linearRampToValueAtTime(0.14, now + 0.15);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    src.connect(filter);
    filter.connect(ng);
    ng.connect(ctx.destination);
    src.start(now + 0.05);
    src.stop(now + 0.68);
  }

  playMiss() {
    const ctx = this._readySfx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.28);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, now);
    g.gain.setValueAtTime(0.11, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  }
}

export const audio = new ProceduralAudio();
