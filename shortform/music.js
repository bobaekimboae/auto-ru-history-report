// 저작권 걱정 없는 배경음악: 브라우저에서 직접 합성한다.
// OfflineAudioContext로 영상 길이만큼 미리 렌더해 AudioBuffer로 돌려준다.

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

// 분위기별 설정. prog는 음계 도수(0부터) 4마디 진행.
export const MOODS = {
  chill:    { name: '산뜻한',     bpm: 96,  key: 53, scale: 'major', prog: [0, 5, 3, 4], kick: 'half',  clap: false, hat: 'off8',  bass: 'root8', lead: 'arp8',  pad: 0.05 },
  drive:    { name: '경쾌한',     bpm: 112, key: 50, scale: 'major', prog: [0, 4, 5, 3], kick: 'four',  clap: true,  hat: 'off8',  bass: 'drive', lead: 'arp8',  pad: 0.04 },
  sport:    { name: '강렬한',     bpm: 126, key: 45, scale: 'minor', prog: [0, 5, 2, 6], kick: 'four',  clap: true,  hat: 'all16', bass: 'drive', lead: 'stab',  pad: 0.035 },
  luxury:   { name: '고급스러운', bpm: 80,  key: 51, scale: 'major', prog: [0, 3, 5, 4], kick: 'none',  clap: false, hat: 'soft',  bass: 'whole', lead: 'keys',  pad: 0.06, seventh: true },
  electric: { name: '미래적인',   bpm: 118, key: 49, scale: 'minor', prog: [0, 6, 5, 3], kick: 'four',  clap: false, hat: 'off8',  bass: 'pulse', lead: 'arp16', pad: 0.045 },
};

// 차종·연료·가격으로 어울리는 분위기를 고른다.
export function suggestMood({ body, fuel, price }) {
  if (fuel === '전기' || fuel === '수소') return 'electric';
  if (body === '스포츠카') return 'sport';
  if (body === 'SUV' || body === 'RV·승합' || body === '트럭') return 'drive';
  if (body === '세단' && Number(price) >= 5000) return 'luxury';
  return 'chill';
}

const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

function chordNotes(mood, degree, octave = 0) {
  const sc = SCALES[mood.scale];
  const note = (d) => mood.key + sc[d % 7] + 12 * Math.floor(d / 7) + 12 * octave;
  const notes = [note(degree), note(degree + 2), note(degree + 4)];
  if (mood.seventh) notes.push(note(degree + 6));
  return notes;
}

/**
 * @param {string} moodId MOODS 키
 * @param {number} duration 초
 * @returns {Promise<AudioBuffer>}
 */
export async function renderMusic(moodId, duration) {
  const mood = MOODS[moodId];
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * (duration + 0.1)), sr);
  const beat = 60 / mood.bpm;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
  comp.connect(ctx.destination);
  const master = ctx.createGain();
  master.connect(comp);
  // 시작은 살짝 키우고, 끝은 1.8초 동안 줄인다
  const fadeOut = Math.min(1.8, duration / 4);
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(0.9, 0.25);
  master.gain.setValueAtTime(0.9, Math.max(0.3, duration - fadeOut));
  master.gain.linearRampToValueAtTime(0, duration);

  const noise = ctx.createBuffer(1, sr, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const reverbSend = makeEcho(ctx, master, beat * 0.75);

  const env = (g, t, a, peak, d) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  };

  const kick = (t) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    env(g, t, 0.003, 0.9, 0.32);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.4);
  };
  const noiseHit = (t, type, freq, peak, dec) => {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); env(g, t, 0.002, peak, dec);
    s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dec + 0.05);
  };
  const tone = (t, hz, dur, type, peak, cutoff, dest = master, attack = 0.005) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = ctx.createGain(); env(g, t, attack, peak, dur);
    o.connect(f).connect(g); g.connect(dest);
    if (dest !== reverbSend) g.connect(reverbSend);
    o.start(t); o.stop(t + attack + dur + 0.05);
  };
  const pad = (t, dur, notes) => {
    for (const n of notes) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiToHz(n + 12); o.detune.value = det;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; f.Q.value = 0.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(mood.pad / notes.length * 2, t + Math.min(0.5, dur / 3));
        g.gain.setValueAtTime(mood.pad / notes.length * 2, t + dur - 0.25);
        g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
        o.connect(f).connect(g); g.connect(master); g.connect(reverbSend);
        o.start(t); o.stop(t + dur + 0.15);
      }
    }
  };

  const bar = beat * 4;
  const bars = Math.ceil(duration / bar);
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const deg = mood.prog[b % mood.prog.length];
    const notes = chordNotes(mood, deg);
    const root = notes[0] - 12;
    const last = b === bars - 1;
    pad(t0, bar, notes);

    for (let s = 0; s < 16; s++) {
      const t = t0 + (s * beat) / 4;
      if (t >= duration - 0.05) break;
      const onBeat = s % 4 === 0;
      const beatIdx = s / 4;
      // 첫 마디는 드럼 없이 열고, 마지막 마디는 비워 여운을 남긴다
      const drums = b > 0 && !last;

      if (drums && onBeat) {
        if (mood.kick === 'four') kick(t);
        else if (mood.kick === 'half' && (beatIdx === 0 || beatIdx === 2)) kick(t);
      }
      if (drums && mood.clap && (s === 4 || s === 12)) noiseHit(t, 'bandpass', 1700, 0.35, 0.16);
      if (b > 0) {
        if (mood.hat === 'off8' && s % 4 === 2) noiseHit(t, 'highpass', 7500, 0.12, 0.05);
        if (mood.hat === 'all16') noiseHit(t, 'highpass', 8000, s % 2 ? 0.05 : 0.1, 0.035);
        if (mood.hat === 'soft' && s % 4 === 2) noiseHit(t, 'highpass', 9000, 0.04, 0.08);
      }

      // 베이스
      if (mood.bass === 'root8' && s % 2 === 0 && b > 0) tone(t, midiToHz(root), beat * 0.4, 'triangle', 0.32, 900);
      if (mood.bass === 'drive' && s % 2 === 0) tone(t, midiToHz(root + (s % 8 === 6 ? 12 : 0)), beat * 0.35, 'sawtooth', 0.22, 600);
      if (mood.bass === 'pulse' && s % 2 === 0) tone(t, midiToHz(root), beat * 0.3, 'square', 0.12, 500);
      if (mood.bass === 'whole' && s === 0) tone(t, midiToHz(root), bar * 0.9, 'sine', 0.35, 400, master, 0.08);

      // 멜로디·아르페지오
      const arp = [notes[0], notes[1], notes[2], notes[1] + 12, notes[2], notes[1], notes[0] + 12, notes[2]];
      if (mood.lead === 'arp8' && s % 2 === 0) tone(t, midiToHz(arp[(s / 2) % 8] + 12), beat * 0.45, 'triangle', 0.09, 3200);
      if (mood.lead === 'arp16') tone(t, midiToHz(arp[s % 8] + 12), beat * 0.22, 'square', 0.035, 2600);
      if (mood.lead === 'stab' && (s === 0 || s === 3 || s === 6 || s === 10)) {
        for (const n of notes) tone(t, midiToHz(n + 12), beat * 0.3, 'sawtooth', 0.045, 2400);
      }
      if (mood.lead === 'keys' && (s === 0 || s === 6 || s === 10)) {
        for (const n of notes) tone(t, midiToHz(n + 12), beat * 1.6, 'sine', 0.06, 2000, master, 0.01);
      }
    }
  }
  return ctx.startRendering();
}

// 박자에 맞춘 짧은 메아리로 공간감을 준다
function makeEcho(ctx, out, time) {
  const input = ctx.createGain(); input.gain.value = 0.22;
  const delay = ctx.createDelay(2); delay.delayTime.value = time;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500;
  input.connect(delay); delay.connect(lp).connect(fb).connect(delay); lp.connect(out);
  return input;
}

/** 사용자가 올린 음악 파일을 영상 길이에 맞춰 자르고 끝을 줄인다. */
export async function fitCustomAudio(arrayBuffer, duration) {
  const tmp = new OfflineAudioContext(2, 44100, 44100);
  const decoded = await tmp.decodeAudioData(arrayBuffer.slice(0));
  const sr = decoded.sampleRate;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * (duration + 0.1)), sr);
  const src = ctx.createBufferSource(); src.buffer = decoded; src.loop = decoded.duration < duration;
  const g = ctx.createGain();
  const fadeOut = Math.min(1.8, duration / 4);
  g.gain.setValueAtTime(1, Math.max(0, duration - fadeOut));
  g.gain.linearRampToValueAtTime(0, duration);
  src.connect(g).connect(ctx.destination);
  src.start(0);
  return ctx.startRendering();
}
