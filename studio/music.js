// 템플릿별 배경음악을 Web Audio로 직접 합성한다(저작권 걱정 없는 자체 음원).
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI 번호 → Hz

// 코드 진행(MIDI 근음 기준 3화음)
const PROGRESSIONS = {
  clean: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]],      // C G Am F
  dynamic: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]],    // Am F C G
  luxury: [[50, 53, 57, 60], [46, 50, 53, 57], [43, 46, 50, 53], [45, 49, 52, 55]], // Dm7 Bbmaj7 Gm7 A7
  lofi: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],      // Fmaj7 Em7 Dm7 Cmaj7
  hiphop: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]],                     // Am F G Em
  edm: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],                        // Am F C G
  cinematic: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]],                  // Dm Bb C A
};
const BPM = { clean: 96, dynamic: 124, luxury: 70, lofi: 78, hiphop: 88, edm: 126, cinematic: 64 };

/** 고를 수 있는 배경음악(모두 이 브라우저에서 직접 만드는 음원이라 저작권 걱정이 없다). */
export const MUSIC_TRACKS = [
  { id: 'clean', name: '산뜻한 팝', mood: '밝고 깔끔한 기본 음악' },
  { id: 'dynamic', name: '파워 비트', mood: '빠르고 힘찬 리듬' },
  { id: 'luxury', name: '럭셔리 라운지', mood: '느리고 고급스러운 분위기' },
  { id: 'lofi', name: '로파이 칠', mood: '편안하고 잔잔한 분위기' },
  { id: 'hiphop', name: '힙합 그루브', mood: '묵직한 베이스와 붐뱁 드럼' },
  { id: 'edm', name: '하우스 EDM', mood: '신나는 클럽 비트' },
  { id: 'cinematic', name: '시네마틱', mood: '웅장한 예고편 느낌' },
].map((t) => ({ ...t, bpm: BPM[t.id] }));

/** 직접 올린 음악(AudioBuffer)을 offset초부터 duration만큼 틀고 끝에 서서히 줄인다. */
export function playBuffer(ctx, dest, buffer, duration, offset = 0, startAt = ctx.currentTime + 0.05) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = buffer.duration - offset < duration;
  if (src.loop) { src.loopStart = 0; src.loopEnd = buffer.duration; }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, startAt);
  g.gain.exponentialRampToValueAtTime(0.95, startAt + 0.3);
  g.gain.setValueAtTime(0.95, startAt + Math.max(0.4, duration - 1.4));
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  src.connect(g); g.connect(dest);
  src.start(startAt, Math.min(Math.max(0, offset), Math.max(0, buffer.duration - 0.1)));
  src.stop(startAt + duration + 0.05);
  return { stop() { try { src.stop(); } catch { /* 이미 끝남 */ } try { g.disconnect(); } catch { /* 무시 */ } } };
}

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
  const snare = (t, level = 0.35, len = 0.18) => {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + len + 0.02); nodes.push(s);
    tone('triangle', 190, t, 0.09, level * 0.4, { attack: 0.002, release: 0.06 });
  };
  const sub = (t, freq, dur, level = 0.4) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq * 1.5, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02); nodes.push(o);
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
    } else if (template === 'lofi') {
      chord.forEach((n) => tone('triangle', NOTE(n), t, bar * 0.98, 0.045, { attack: 0.08, release: 0.5, cutoff: 1400 }));
      for (let b = 0; b < 4; b++) {
        const bt = t + b * beat;
        if (b === 0) kick(bt, 0.5);
        if (b === 1 || b === 3) snare(bt, 0.16, 0.14);
        hat(bt, 0.035); hat(bt + beat * 0.62, 0.025);   // 스윙
      }
      kick(t + beat * 2.5, 0.42);
      tone('sine', NOTE(chord[0] - 24), t, bar * 0.9, 0.11, { attack: 0.04, release: 0.4 });
      tone('sine', NOTE(chord[3 % chord.length] + 12), t + beat * 1.5, beat, 0.03, { release: 0.5 });
    } else if (template === 'hiphop') {
      kick(t, 1); kick(t + beat * 1.5, 0.8); kick(t + beat * 2.75, 0.7);
      snare(t + beat, 0.4); snare(t + beat * 3, 0.4);
      for (let e = 0; e < 8; e++) hat(t + e * beat / 2, e % 2 ? 0.05 : 0.09);
      sub(t, NOTE(chord[0] - 24), beat * 1.4, 0.5);
      sub(t + beat * 2, NOTE(chord[0] - 24), beat * 1.2, 0.45);
      chord.forEach((n) => tone('square', NOTE(n), t + beat * 0.5, beat * 0.4, 0.02, { cutoff: 1600, release: 0.1 }));
    } else if (template === 'edm') {
      for (let b = 0; b < 4; b++) {
        const bt = t + b * beat;
        kick(bt, 1);
        hat(bt + beat / 2, 0.16, 0.12);
        if (b % 2) snare(bt, 0.28, 0.12);
        // 킥 사이에서 숨 쉬듯 커지는 베이스(사이드체인 느낌)
        tone('sawtooth', NOTE(chord[0] - 24), bt + beat * 0.25, beat * 0.7, 0.08, { attack: 0.12, release: 0.08, cutoff: 700 });
      }
      for (let e = 0; e < 8; e++) tone('sawtooth', NOTE(chord[e % chord.length] + 12), t + e * beat / 2, beat * 0.3, 0.025, { cutoff: 3000, release: 0.1 });
    } else if (template === 'cinematic') {
      chord.forEach((n) => {
        tone('sawtooth', NOTE(n - 12), t, bar, 0.03, { attack: 1.2, release: 1, cutoff: 700, detune: -8 });
        tone('sawtooth', NOTE(n), t, bar, 0.025, { attack: 1.2, release: 1, cutoff: 1100, detune: 8 });
      });
      sub(t, NOTE(chord[0] - 24), bar * 0.8, 0.6);           // 큰북처럼 울리는 저음
      kick(t + beat * 2, 0.6); kick(t + beat * 2.5, 0.45);
      tone('sine', NOTE(chord[2] + 12), t + beat * 3, beat, 0.04, { attack: 0.3, release: 0.6 });
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
