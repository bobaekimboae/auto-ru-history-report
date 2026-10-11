// 숏폼 영상 엔진: 차량 사진과 매물 정보를 템플릿에 맞춰 캔버스에 그리고, MediaRecorder로 MP4/WebM을 만든다.
import { playMusic } from './music.js';

export const FORMATS = {
  '9:16': { w: 1080, h: 1920, label: '세로 9:16', hint: '릴스·쇼츠·틱톡' },
  '1:1': { w: 1080, h: 1080, label: '정사각 1:1', hint: '인스타 피드' },
  '16:9': { w: 1920, h: 1080, label: '가로 16:9', hint: '유튜브·매물 상세' },
};

export const TEMPLATES = {
  clean: { label: '클린', hint: '밝고 깔끔한 기본형', font: '"Gothic A1", "IBM Plex Sans KR", sans-serif' },
  dynamic: { label: '다이나믹', hint: '빠른 컷과 강한 비트', font: '"Gothic A1", "IBM Plex Sans KR", sans-serif' },
  luxury: { label: '럭셔리', hint: '느린 전환과 골드 포인트', font: '"Nanum Myeongjo", "Gothic A1", serif' },
};

const BODY_FONT = '"IBM Plex Sans KR", "Gothic A1", "Malgun Gothic", sans-serif';
const GOLD = '#c8a45c';

export const fmt = {
  price: (v) => (v ? `${Number(v).toLocaleString('ko-KR')}만원` : '가격 문의'),
  km: (v) => (v || v === 0 ? `${Number(v).toLocaleString('ko-KR')}km` : ''),
  title: (v) => [v.maker, v.model, v.trim].filter(Boolean).join(' ') || '차량명 미입력',
};

/** 매물에서 영상에 보여줄 정보 카드 목록을 만든다. */
export function factCards(v) {
  const cards = [];
  if (v.year) cards.push({ k: '연식', v: v.year });
  if (v.mileage || v.mileage === 0) cards.push({ k: '주행거리', v: fmt.km(v.mileage) });
  if (v.fuel) cards.push({ k: '연료', v: v.fuel + (v.transmission ? ` · ${v.transmission}` : '') });
  if (v.accident) cards.push({ k: '사고 이력', v: v.accident });
  if (v.color) cards.push({ k: '색상', v: v.color });
  for (const h of (v.highlights || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean)) cards.push({ k: '포인트', v: h });
  return cards;
}

const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};
const clamp01 = (t) => Math.max(0, Math.min(1, t));

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxW, size, weight, family) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > size * 0.45) { s -= 2; ctx.font = `${weight} ${s}px ${family}`; }
  return s;
}

function hexToRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [223, 84, 25];
}
const rgba = (hex, a) => `rgba(${hexToRgb(hex).join(',')},${a})`;

/** 사진마다 흐린 배경을 미리 만들어 둔다(매 프레임 blur는 너무 느림). */
function makeBlurred(img, W, H) {
  const k = 0.25;
  const c = document.createElement('canvas');
  c.width = Math.round(W * k); c.height = Math.round(H * k);
  const x = c.getContext('2d');
  const s = Math.max(c.width / img.width, c.height / img.height) * 1.1;
  x.filter = 'blur(14px) brightness(0.55) saturate(1.1)';
  x.drawImage(img, (c.width - img.width * s) / 2, (c.height - img.height * s) / 2, img.width * s, img.height * s);
  return c;
}

// 템플릿·길이·사진 수로 장면 길이와 사진 컷 수를 정한다.
function timeline(template, D, nImages) {
  const introD = template === 'dynamic' ? 1.8 : 2.4;
  const outroD = template === 'luxury' ? 3.4 : 3.0;
  const shotsSpan = Math.max(1, D - introD - outroD);
  const poolLen = nImages > 1 ? nImages - 1 : 1;
  const perShot = template === 'dynamic' ? 1.15 : template === 'luxury' ? 2.2 : 1.6;
  const count = Math.max(1, Math.min(Math.round(shotsSpan / perShot), Math.max(poolLen, Math.ceil(shotsSpan / 3))));
  return { introD, outroD, shotD: shotsSpan / count, count };
}

/** 영상에 실제로 나오는 사진 번호들(대표 사진 포함). 배경 지우기를 이 사진들에만 하려고 쓴다. */
export function usedPhotoIndices(template, duration, nImages) {
  const { count } = timeline(template, duration, nImages);
  const used = new Set([0]);
  for (let i = 0; i < count; i++) used.add(nImages > 1 ? 1 + (i % (nImages - 1)) : 0);
  return [...used].sort((a, b) => a - b);
}

/**
 * 장면 객체를 만든다. draw(ctx, t)로 t초 시점의 프레임을 그린다.
 * opts: { vehicle, images:[ImageBitmap], dealer:{name,phone,color,cta}, logo, template, format, duration, showPrice }
 */
export function createScene(opts) {
  const { vehicle: v, images, dealer, logo, template, format } = opts;
  const { w: W, h: H } = FORMATS[format];
  const D = opts.duration;
  const accent = dealer.color || '#df5419';
  const u = Math.min(W, H) / 100;                 // 화면 짧은 변의 1%
  const vertical = H > W;
  const titleFont = TEMPLATES[template].font;
  const blurred = images.map((img) => makeBlurred(img, W, H));
  const facts = factCards(v);
  const title = fmt.title(v);
  const price = fmt.price(v.price);
  const showPrice = opts.showPrice !== false;
  // 상사 쇼룸으로 합성한 사진(화면 비율과 같고 위쪽에 간판이 있음)은 확대를 줄이고 글자를 간판 아래로 내린다
  const studio = opts.studio || new Set();
  const studioCover = studio.has(0);
  const L = {
    introY: studioCover ? (vertical ? 0.79 : 0.7) : (vertical ? 0.62 : 0.6),
    factY: studio.size ? (vertical ? 0.76 : 0.82) : (vertical ? 0.64 : null),
    tagY: studio.size && vertical ? H * 0.335 : (vertical ? H * 0.075 : u * 4),
    tagBottom: studio.size > 0 && !vertical,     // 가로 쇼룸 화면은 간판을 가리지 않게 가격표를 오른쪽 아래로
    badge: !studio.size,
  };

  const { introD, outroD, shotD, count } = timeline(template, D, images.length);
  const pool = images.length > 1 ? images.slice(1) : images;
  const fade = template === 'dynamic' ? 0.22 : template === 'luxury' ? 0.8 : 0.45;
  const shots = Array.from({ length: count }, (_, i) => {
    const imgIdx = images.length > 1 ? 1 + (i % pool.length) : 0;
    return { start: introD + i * shotD, imgIdx, fact: facts.length ? facts[i % facts.length] : null, dir: i % 2 ? -1 : 1 };
  });

  // 사진 한 장을 Ken Burns 효과로 그린다(세로 화면에서는 흐린 배경 위에 가로 사진을 띄움).
  function drawPhoto(ctx, idx, p, dir, alpha = 1, offsetX = 0, zoomBoost = 0) {
    const img = images[idx];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(blurred[idx], offsetX, 0, W, H);
    const isStudio = studio.has(idx);
    const landscape = !isStudio && img.width / img.height > W / H;
    let base;
    if (landscape && vertical) base = (W / img.width) * (template === 'dynamic' ? 1.45 : 1.18);
    else base = Math.max(W / img.width, H / img.height);
    const zoom = base * (1 + (isStudio ? 0.035 : template === 'luxury' ? 0.06 : 0.1) * p + zoomBoost);
    const dw = img.width * zoom, dh = img.height * zoom;
    const panRoom = Math.max(0, dw - W);
    const pan = template === 'dynamic' || (landscape && vertical) ? (dir > 0 ? p : 1 - p) : 0.5;
    const x = -panRoom * (0.15 + 0.7 * pan) + (panRoom ? 0 : (W - dw) / 2) + offsetX;
    const y = isStudio ? (H - dh) * 0.85 : (H - dh) / 2 + (vertical ? -H * 0.04 : 0);
    if (landscape && vertical) {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = u * 4;
    }
    ctx.drawImage(img, x, y, dw, dh);
    ctx.restore();
  }

  function drawLetterbox(ctx) {
    const bar = vertical ? H * 0.06 : H * (studio.size ? 0.045 : 0.08);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);
    ctx.fillStyle = GOLD;
    ctx.fillRect(W * 0.08, bar - 2, W * 0.84, 2);
    ctx.fillRect(W * 0.08, H - bar, W * 0.84, 2);
  }

  function drawBadge(ctx, a) {
    if (!L.badge || (!dealer.name && !logo)) return;
    ctx.save();
    ctx.globalAlpha = a;
    const pad = u * 1.6, h = u * 6.2;
    const x = u * 4, y = vertical ? H * 0.075 : u * 4;
    ctx.font = `700 ${u * 2.6}px ${BODY_FONT}`;
    const tw = dealer.name ? ctx.measureText(dealer.name).width : 0;
    const lw = logo ? (h - pad) * logo.width / logo.height : 0;
    const w = pad * 2 + lw + (lw && tw ? pad : 0) + tw;
    ctx.fillStyle = template === 'luxury' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.92)';
    rr(ctx, x, y, w, h, h / 2);
    ctx.fill();
    if (logo) ctx.drawImage(logo, x + pad, y + pad / 2, lw, h - pad);
    ctx.fillStyle = template === 'luxury' ? GOLD : '#15181c';
    ctx.textBaseline = 'middle';
    if (dealer.name) ctx.fillText(dealer.name, x + pad + lw + (lw ? pad : 0), y + h / 2 + 1);
    ctx.restore();
  }

  function drawPriceTag(ctx, a) {
    if (!showPrice) return;
    ctx.save();
    ctx.globalAlpha = a;
    const size = u * 4.4;
    ctx.font = `800 ${size}px ${titleFont}`;
    const tw = ctx.measureText(price).width;
    const padX = u * 2.4, h = size * 1.7;
    const x = W - tw - padX * 2 - u * 4, y = L.tagBottom ? H - h - u * 6 : L.tagY;
    if (template === 'luxury') {
      ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      rr(ctx, x, y, tw + padX * 2, h, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = GOLD;
    } else {
      ctx.fillStyle = accent;
      if (template === 'dynamic') { ctx.save(); ctx.translate(x, y); ctx.transform(1, 0, -0.18, 1, 0, 0); ctx.fillRect(0, 0, tw + padX * 2, h); ctx.restore(); }
      else { rr(ctx, x, y, tw + padX * 2, h, h / 2); ctx.fill(); }
      ctx.fillStyle = '#fff';
    }
    ctx.textBaseline = 'middle';
    ctx.fillText(price, x + padX, y + h / 2 + 2);
    ctx.restore();
  }

  // 정보 카드: 화면 아래쪽(앱 버튼에 가리지 않도록 세로 화면은 하단 22% 위)에 하나씩
  function drawFact(ctx, fact, p) {
    if (!fact) return;
    const inP = ease.out(clamp01(p / 0.25));
    const outP = clamp01((p - 0.82) / 0.18);
    const a = inP * (1 - outP);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    const boxW = vertical ? W * 0.84 : W * 0.42;
    const x = vertical ? (W - boxW) / 2 : u * 5;
    const yBase = L.factY != null ? H * L.factY : H - u * 26;
    const y = yBase + (1 - inP) * u * 4;
    const kSize = u * 2.8, vSize = u * 6.2;
    const h = kSize + vSize + u * 6;
    if (template === 'clean') {
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      rr(ctx, x, y, boxW, h, u * 2.4); ctx.fill();
      ctx.fillStyle = accent; ctx.fillRect(x, y + u * 2.4, u * 0.8, h - u * 4.8);
      ctx.fillStyle = '#6b7480'; ctx.font = `600 ${kSize}px ${BODY_FONT}`;
      ctx.fillText(fact.k, x + u * 4, y + u * 2.6 + kSize);
      ctx.fillStyle = '#15181c';
      fitText(ctx, fact.v, boxW - u * 8, vSize, 800, titleFont);
      ctx.fillText(fact.v, x + u * 4, y + u * 3.6 + kSize + vSize);
    } else if (template === 'dynamic') {
      ctx.translate(x + (1 - inP) * -W * 0.3, y);
      ctx.transform(1, 0, -0.12, 1, 0, 0);
      ctx.fillStyle = accent; ctx.fillRect(0, 0, boxW * 0.42, kSize + u * 2.4);
      ctx.fillStyle = '#fff'; ctx.font = `800 ${kSize}px ${BODY_FONT}`;
      ctx.fillText(fact.k, u * 2, kSize + u * 0.6);
      ctx.fillStyle = '#0d0f12'; ctx.fillRect(0, kSize + u * 2.4, boxW, vSize + u * 3.4);
      ctx.fillStyle = '#fff';
      fitText(ctx, fact.v, boxW - u * 4, vSize, 900, titleFont);
      ctx.fillText(fact.v, u * 2, kSize + u * 2.4 + vSize + u * 0.9);
    } else {
      ctx.textAlign = 'center';
      const cx = W / 2;
      const yy = studio.size ? H * (vertical ? 0.79 : 0.84) : vertical ? H * 0.7 : H * 0.74;
      ctx.fillStyle = GOLD; ctx.font = `500 ${kSize}px ${BODY_FONT}`;
      ctx.letterSpacing = `${kSize * 0.3}px`;
      ctx.fillText(fact.k, cx, yy);
      ctx.letterSpacing = '0px';
      ctx.fillStyle = '#fff';
      fitText(ctx, fact.v, W * 0.84, vSize * 1.05, 700, titleFont);
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = u * 2;
      ctx.fillText(fact.v, cx, yy + vSize * 1.3);
      ctx.fillStyle = GOLD;
      ctx.fillRect(cx - u * 6, yy + vSize * 1.3 + u * 2.4, u * 12, 2);
    }
    ctx.restore();
  }

  function drawIntro(ctx, t) {
    const p = clamp01(t / introD);
    drawPhoto(ctx, 0, p * 0.6, 1, 1, 0, template === 'dynamic' ? 0.15 * (1 - ease.out(clamp01(t / 0.5))) : 0);
    ctx.save();
    const g = ctx.createLinearGradient(0, H * 0.35, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const a = ease.out(clamp01((t - 0.15) / 0.6));
    ctx.globalAlpha = a;
    const cx = vertical ? u * 6 : u * 5;
    const ty = H * L.introY;
    ctx.fillStyle = template === 'luxury' ? GOLD : '#fff';
    ctx.font = `600 ${u * 3}px ${BODY_FONT}`;
    ctx.fillText([v.year, v.plate].filter(Boolean).join(' · '), cx, ty + (1 - a) * u * 3);
    ctx.fillStyle = '#fff';
    const size = fitText(ctx, title, W - cx * 2, u * (vertical ? 8.4 : 7), template === 'luxury' ? 700 : 900, titleFont);
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = u * 2;
    ctx.fillText(title, cx, ty + size * 1.15 + (1 - a) * u * 4);
    ctx.shadowBlur = 0;
    if (showPrice) {
      const pa = ease.out(clamp01((t - 0.55) / 0.5));
      ctx.globalAlpha = pa;
      ctx.font = `800 ${u * 6}px ${titleFont}`;
      ctx.fillStyle = template === 'luxury' ? GOLD : template === 'dynamic' ? accent : '#fff';
      ctx.fillText(price, cx, ty + size * 1.15 + u * 9);
    }
    ctx.restore();
  }

  function drawShots(ctx, t) {
    let cur = 0;
    for (let i = 0; i < shots.length; i++) if (t >= shots[i].start) cur = i;
    const s = shots[cur];
    const local = (t - s.start) / shotD;
    const prev = shots[cur - 1];
    const tIn = t - s.start;
    if (prev && tIn < fade) {
      const k = ease.inOut(tIn / fade);
      if (template === 'dynamic') {
        drawPhoto(ctx, prev.imgIdx, 1, prev.dir, 1, -W * k);
        drawPhoto(ctx, s.imgIdx, local, s.dir, 1, W * (1 - k), 0.08 * (1 - k));
        // 컷이 바뀔 때 짧은 플래시
        ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - k)})`;
        ctx.fillRect(0, 0, W, H);
      } else if (template === 'luxury') {
        if (k < 0.5) drawPhoto(ctx, prev.imgIdx, 1, prev.dir, 1 - k * 2);
        else drawPhoto(ctx, s.imgIdx, local, s.dir, (k - 0.5) * 2);
      } else {
        drawPhoto(ctx, prev.imgIdx, 1, prev.dir, 1);
        drawPhoto(ctx, s.imgIdx, local, s.dir, k);
      }
    } else {
      drawPhoto(ctx, s.imgIdx, local, s.dir, 1);
    }
    drawFact(ctx, s.fact, local);
    const a = clamp01((t - introD) / 0.4);
    drawBadge(ctx, a);
    drawPriceTag(ctx, a);
  }

  function drawOutro(ctx, t) {
    const p = clamp01((t - (D - outroD)) / outroD);
    const a = ease.out(clamp01(p / 0.3));
    ctx.drawImage(blurred[0], 0, 0, W, H);
    ctx.fillStyle = template === 'clean' ? 'rgba(255,255,255,0.86)' : 'rgba(0,0,0,0.55)';
    ctx.globalAlpha = a; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    const cx = W / 2;
    const dark = template === 'clean';
    let y = H * (vertical ? 0.34 : 0.22);
    if (logo) {
      const lh = u * 12, lw = lh * logo.width / logo.height;
      ctx.drawImage(logo, cx - lw / 2, y - lh, lw, lh);
      y += u * 4;
    }
    if (dealer.name) {
      ctx.fillStyle = dark ? '#15181c' : template === 'luxury' ? GOLD : '#fff';
      fitText(ctx, dealer.name, W * 0.86, u * 6.4, 800, titleFont);
      ctx.fillText(dealer.name, cx, y + u * 6);
      y += u * 12;
    }
    ctx.fillStyle = dark ? '#49525c' : 'rgba(255,255,255,0.85)';
    fitText(ctx, title, W * 0.86, u * 4, 600, BODY_FONT);
    ctx.fillText(title, cx, y + u * 3);
    if (showPrice) {
      ctx.fillStyle = template === 'luxury' ? GOLD : accent;
      ctx.font = `900 ${u * 8}px ${titleFont}`;
      ctx.fillText(price, cx, y + u * 13);
    }
    y += u * 22;
    const cta = dealer.cta || '지금 바로 문의하세요';
    const btnW = Math.min(W * 0.82, u * 70), btnH = u * 10;
    const pulse = 1 + 0.03 * Math.sin(t * 6);
    ctx.save();
    ctx.translate(cx, y + btnH / 2); ctx.scale(pulse, pulse);
    ctx.fillStyle = template === 'luxury' ? GOLD : accent;
    rr(ctx, -btnW / 2, -btnH / 2, btnW, btnH, template === 'luxury' ? 6 : btnH / 2); ctx.fill();
    ctx.fillStyle = template === 'luxury' ? '#111' : '#fff';
    fitText(ctx, cta, btnW - u * 6, u * 4, 800, BODY_FONT);
    ctx.textBaseline = 'middle';
    ctx.fillText(cta, 0, 2);
    ctx.restore();
    if (dealer.phone) {
      ctx.fillStyle = dark ? '#15181c' : '#fff';
      ctx.font = `800 ${u * 5}px ${BODY_FONT}`;
      ctx.fillText(dealer.phone, cx, y + btnH + u * 9);
    }
    ctx.restore();
  }

  return {
    W, H, duration: D, template,
    draw(ctx, t) {
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      if (t < introD) drawIntro(ctx, t);
      else if (t < D - outroD) drawShots(ctx, t);
      else {
        // 마지막 컷에서 아웃트로로 부드럽게 넘어간다
        drawShots(ctx, Math.min(t, D - outroD - 0.001));
        drawOutro(ctx, t);
      }
      if (template === 'luxury') drawLetterbox(ctx);
      ctx.restore();
    },
  };
}

/** 지원하는 녹화 형식 중 가장 호환성 좋은 것(MP4 우선)을 고른다. */
export function pickMime() {
  const cands = [
    'video/mp4;codecs=avc1.4D0028,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    // H.264를 못 쓰는 브라우저는 VP9 MP4 대신 WebM으로 저장한다(일부 SNS가 VP9 MP4를 거부함)
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return cands.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

/** 장면을 실제 시간으로 재생하며 녹화한다. 탭을 다른 곳으로 옮기면 녹화가 멈출 수 있다. */
export async function recordScene(scene, { music = true, onProgress } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = scene.W; canvas.height = scene.H;
  const ctx = canvas.getContext('2d');
  scene.draw(ctx, 0);
  const stream = canvas.captureStream(30);
  let ac = null, track = null;
  if (music) {
    ac = new AudioContext();
    await ac.resume();
    const dest = ac.createMediaStreamDestination();
    track = playMusic(ac, dest, scene.template, scene.duration, ac.currentTime + 0.05);
    stream.addTrack(dest.stream.getAudioTracks()[0]);
  }
  const mimeType = pickMime();
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 9_000_000, audioBitsPerSecond: 160_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((resolve) => { rec.onstop = resolve; });
  rec.start(250);
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      scene.draw(ctx, Math.min(t, scene.duration));
      onProgress?.(Math.min(1, t / scene.duration));
      if (t >= scene.duration + 0.15) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await done;
  track?.stop();
  stream.getTracks().forEach((tr) => tr.stop());
  await ac?.close();
  const type = (mimeType || 'video/webm').split(';')[0];
  return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' };
}
