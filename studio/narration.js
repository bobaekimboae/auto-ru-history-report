// AI 나레이션: 매물 정보로 읽기 좋은 한국어 대본을 쓰고, 음성 워커로 읽힌다.
import { fmt } from './render.js';

export const VOICES = [
  ['F1', '여성 1'], ['F2', '여성 2'], ['F3', '여성 3'], ['F4', '여성 4'], ['F5', '여성 5'],
  ['M1', '남성 1'], ['M2', '남성 2'], ['M3', '남성 3'], ['M4', '남성 4'], ['M5', '남성 5'],
];
export const NARR_DELAY = 0.5;        // 영상 시작 후 나레이션이 시작되는 시점(초)

// ---------- 숫자를 한글로 읽기 ----------
const DIGIT = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
function under10000(n) {
  let s = '';
  [[1000, '천'], [100, '백'], [10, '십'], [1, '']].forEach(([u, name]) => {
    const d = Math.floor(n / u) % 10;
    if (!d) return;
    s += (d === 1 && u > 1 ? '' : DIGIT[d]) + name;
  });
  return s;
}
/** 2021 → 이천이십일, 48000 → 사만 팔천, 0 → 영 */
export function koreanNumber(num) {
  let n = Math.floor(Math.abs(Number(num) || 0));
  if (!n) return '영';
  const units = ['', '만', '억', '조'];
  const out = [];
  for (let i = 0; n > 0; i++, n = Math.floor(n / 10000)) {
    const chunk = n % 10000;
    if (!chunk) continue;
    // 만 앞의 1은 "일만" 대신 "만"으로 읽는다
    const words = chunk === 1 && i === 1 ? '' : under10000(chunk);
    out.unshift(words + units[i]);
  }
  return out.join(' ');
}
const MONTH = { 6: '유', 10: '시' };
/** 문장 속 숫자를 소리 나는 대로 바꾼다(연식·월·km·만원·인승 등). */
export function readNumbers(text) {
  return String(text)
    .replace(/(\d+)\s*월/g, (_, m) => `${MONTH[+m] || koreanNumber(m)}월`)
    .replace(/(\d[\d,]*)\s*(km|㎞|키로)/gi, (_, n) => `${koreanNumber(n.replace(/,/g, ''))} 킬로미터`)
    .replace(/(\d[\d,]*)\s*cc/gi, (_, n) => `${koreanNumber(n.replace(/,/g, ''))} 씨씨`)
    .replace(/(\d[\d,]*)\s*%/g, (_, n) => `${koreanNumber(n.replace(/,/g, ''))} 퍼센트`)
    .replace(/(\d[\d,]*)\s*만\s*원/g, (_, n) => `${koreanNumber(Number(n.replace(/,/g, '')) * 10000)} 원`)
    // DN8·X5처럼 영문 모델명에 붙은 숫자는 그대로 둔다(음성이 알아서 읽는다)
    .replace(/(?<![A-Za-z\d.])(\d+)\.(\d+)(?![\d.]*[A-Za-z])/g, (_, a, b) => `${koreanNumber(a)} 점 ${[...b].map((d) => (d === '0' ? '영' : DIGIT[+d])).join('')}`)
    .replace(/(?<![A-Za-z\d])\d[\d,]*(?![\d,]*[A-Za-z])/g, (n) => koreanNumber(n.replace(/,/g, '')));
}
const readPhone = (p) => String(p).replace(/[^\d-]/g, '').split('-').filter(Boolean)
  .map((g) => [...g].map((d) => (d === '0' ? '공' : DIGIT[+d])).join('')).join(', ');

// 같은 차는 같은 대본이 나오고, "다시 쓰기"를 누르면 다른 표현을 고른다
function picker(seed) {
  let s = 0;
  for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return (arr) => { s = (s * 1664525 + 1013904223) >>> 0; return arr[s % arr.length]; };
}

/** 매물 정보로 나레이션 대본(문장 목록)을 쓴다. 화면에 보이는 그대로의 글이고, 읽을 때 숫자를 한글로 바꾼다. */
export function writeScript(v, dealer, { showPrice = true, cta = '', variant = 0 } = {}) {
  const pick = picker(`${v.id}|${variant}`);
  const title = fmt.title(v);
  const year = (v.year || '').match(/\d{4}/)?.[0];
  const lines = [];
  lines.push(year
    ? pick([`${year}년식 ${title}, 지금 소개합니다.`, `오늘 소개할 차량은 ${year}년식 ${title}입니다.`, `${title}, ${year}년식 매물입니다.`])
    : pick([`${title}, 지금 소개합니다.`, `오늘 소개할 차량은 ${title}입니다.`]));
  const km = Number(v.mileage);
  if (v.mileage !== '' && v.mileage != null && !Number.isNaN(km)) {
    const kmText = `${km.toLocaleString('ko-KR')}km`;
    lines.push(km < 30000
      ? pick([`주행거리는 ${kmText}로 아직 짧습니다.`, `${kmText}밖에 타지 않은 차량입니다.`])
      : pick([`주행거리는 ${kmText}입니다.`, `${kmText}를 주행한 차량입니다.`]));
  }
  const spec = [v.fuel, v.transmission && `${v.transmission} 변속기`].filter(Boolean).join(', ');
  if (spec || v.color) lines.push([spec && `${spec} 모델`, v.color && `색상은 ${v.color}`].filter(Boolean).join('이고, ') + '입니다.');
  if (v.accident === '무사고') lines.push(pick(['사고 이력 없는 무사고 차량입니다.', '무사고 차량이라 더 안심하실 수 있습니다.']));
  else if (v.accident === '단순교환') lines.push('단순 교환 이력만 있는 차량입니다.');
  const hl = String(v.highlights || '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 3);
  if (hl.length) lines.push(`${pick(['이 차의 강점은', '눈여겨보실 점은', '특히 자랑할 만한 점은'])} ${hl.join(', ')}입니다.`);
  if (showPrice && v.price) lines.push(pick([`판매가는 ${Number(v.price).toLocaleString('ko-KR')}만 원입니다.`, `가격은 ${Number(v.price).toLocaleString('ko-KR')}만 원입니다.`]));
  const ctaLine = (cta || '').trim() || '지금 바로 문의하세요';
  lines.push(dealer.name ? `${dealer.name}, ${ctaLine.replace(/[.!]$/, '')}.` : `${ctaLine.replace(/[.!]$/, '')}.`);
  if (dealer.phone) lines.push(`전화번호는 ${dealer.phone}입니다.`);
  return lines;
}

/** 화면용 대본(한 줄에 한 문장)을 읽기용 문장 목록으로 바꾼다. */
export function toSpoken(text) {
  return String(text).split('\n').map((s) => s.trim()).filter(Boolean)
    .map((s) => s.replace(/(01[016789]|0\d{1,2})-?\d{3,4}-?\d{4}/g, (m) => readPhone(m)))
    .map((s) => readNumbers(s));
}

// ---------- 음성 만들기 ----------
let worker = null;
const pending = new Map();
let nextId = 1;
let onModel = null;
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./tts-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') onModel?.({ kind: 'model', ratio: data.loaded / data.total });
    else if (data.type === 'sentence') onModel?.({ kind: 'sentence', i: data.i, n: data.n });
    else if (data.type === 'audio' || data.type === 'error') { pending.get(data.id)?.(data); pending.delete(data.id); }
  };
  return worker;
}

/** 대본을 읽어 { pcm: Float32Array, sr, starts, durs } 를 돌려준다. */
export async function speak(text, { voice = 'F1', speed = 1.05, onProgress } = {}) {
  const sentences = toSpoken(text);
  if (!sentences.length) throw new Error('대본이 비어 있어요.');
  onModel = onProgress;
  const id = nextId++;
  const res = await new Promise((resolve) => { pending.set(id, resolve); getWorker().postMessage({ type: 'speak', id, sentences, voice, speed }); });
  if (res.type !== 'audio') throw new Error(res.message || '음성을 만들지 못했어요.');
  return { pcm: res.pcm, sr: res.sr, starts: res.starts, durs: res.durs, lines: String(text).split('\n').map((s) => s.trim()).filter(Boolean) };
}

/** 저장해 둔 음성을 AudioBuffer로 */
export function toBuffer(n) {
  const b = new AudioBuffer({ length: n.pcm.length, sampleRate: n.sr, numberOfChannels: 1 });
  b.copyToChannel(n.pcm, 0);
  return b;
}
