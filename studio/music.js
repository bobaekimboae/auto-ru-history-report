// 템플릿별 배경음악을 Web Audio로 직접 합성한다(저작권 걱정 없는 자체 음원).
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI 번호 → Hz

// 코드 진행(MIDI 근음 기준 3화음)
const PROGRESSIONS = {
  clean: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]],      // C G Am F
  dynamic: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]],    // Am F C G
  luxury: [[50, 53, 57, 60], [46, 50, 53, 57], [43, 46, 50, 53], [45, 49, 52, 55]], // Dm7 Bbmaj7 Gm7 A7
};
const BPM = { clean: 96, dynamic: 124, luxury: 70 };

function noiseBuffer(ctx) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * 음악을 예약 재생한다. dest는 AudioNode(스피커 또는 녹음용 MediaStreamDestination).
 * 반환값의 stop()으로 중단한다.
 */
export function playMusic(ctx, dest, template, duration, startAt = ctx.currentTime + 0.05) {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, startAt);
  master.gain.exponentialRampToValueAtTime(0.9, startAt + 0.4);
  master.gain.setValueAtTime(0.9, startAt + Math.max(0.5, duration - 1.4));
  master.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  master.connect(dest);
  const nodes = [master];
  const noise = noiseBuffer(ctx);
  const beat = 60 / BPM[template];
  const bar = beat * 4;
  const prog = PROGRESSIONS[template];

  const tone = (type, freq, t, dur, gain, { attack = 0.01, release = 0.12, cutoff = null, detune = 0 } = {}) => {
    if (t > startAt + duration) return;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let head = o;
    if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); head = f; }
    head.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
    nodes.push(o);
  };
  const kick = (t, level = 0.9) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.3); nodes.push(o);
  };
  const hat = (t, level = 0.12, len = 0.05) => {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + len + 0.02); nodes.push(s);
  };

  for (let t = startAt, i = 0; t < startAt + duration; t += bar, i++) {
    const chord = prog[i % prog.length];
    if (template === 'clean') {
      chord.forEach((n) => tone('triangle', NOTE(n), t, bar * 0.95, 0.06, { attack: 0.03, release: 0.4 }));
      for (let b = 0; b < 4; b++) {
        const bt = t + b * beat;
        if (b % 2 === 0) kick(bt, 0.55);
        hat(bt + beat / 2, 0.05);
        tone('sine', NOTE(chord[(b + 1) % 3] + 12), bt, beat * 0.5, 0.035, { release: 0.2 });
      }
      tone('sine', NOTE(chord[0] - 24), t, bar * 0.9, 0.12, { attack: 0.02, release: 0.3 });
    } else if (template === 'dynamic') {
      for (let b = 0; b < 4; b++) {
        const bt = t + b * beat;
        kick(bt, 0.95);
        hat(bt + beat / 2, 0.14, 0.09);
        hat(bt + beat / 4, 0.04); hat(bt + beat * 3 / 4, 0.04);
        for (let e = 0; e < 2; e++) tone('sawtooth', NOTE(chord[0] - 24), bt + e * beat / 2, beat * 0.45, 0.09, { cutoff: 520, release: 0.05 });
      }
      [0, 1.5, 2.5].forEach((off) => chord.forEach((n) => tone('square', NOTE(n + 12), t + off * beat, beat * 0.3, 0.025, { cutoff: 2400, release: 0.08 })));
    } else {
      chord.forEach((n, k) => {
        tone('sawtooth', NOTE(n), t, bar, 0.022, { attack: 0.6, release: 0.8, cutoff: 900, detune: -6 });
        tone('sawtooth', NOTE(n), t, bar, 0.022, { attack: 0.6, release: 0.8, cutoff: 900, detune: 7 });
        tone('sine', NOTE(n + 12), t + k * beat * 0.75, beat * 1.6, 0.05, { attack: 0.005, release: 0.9 });
      });
      tone('sine', NOTE(chord[0] - 12), t, bar, 0.1, { attack: 0.05, release: 0.6 });
      kick(t, 0.35);
    }
  }

  return {
    stop() {
      for (const n of nodes) { try { n.stop?.(); } catch { /* 이미 끝남 */ } try { n.disconnect(); } catch { /* 무시 */ } }
    },
  };
}
