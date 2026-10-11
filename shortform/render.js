// 영상 한 프레임을 캔버스에 그린다. 미리보기와 녹화가 같은 함수를 쓴다.
// 모든 크기는 짧은 변 1080px 기준 단위(u)로 잡아 해상도와 비율이 바뀌어도 같은 구도가 나온다.

export const FONT = '"Pretendard Variable", Pretendard, "IBM Plex Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

export const RATIOS = {
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '16:9': [1920, 1080],
};

export const STYLES = {
  bold:    { name: '강렬하게',   desc: '어두운 화면에 굵은 글씨, 장면마다 확 들어오는 줌', accent: '#6366f1', swatch: 'linear-gradient(135deg,#09090b,#6366f1)', transition: 'punch', dark: true },
  clean:   { name: '깔끔하게',   desc: '밝은 카드 자막과 부드러운 전환, 고급 매물에 어울려요', accent: '#0d9488', swatch: 'linear-gradient(135deg,#fafafa,#0d9488)', transition: 'fade', dark: false },
  dynamic: { name: '역동적으로', desc: '박자에 맞춰 밀려나는 전환과 상단 진행 막대', accent: '#f59e0b', swatch: 'linear-gradient(135deg,#0c0a09,#f59e0b)', transition: 'whip', dark: true },
};

// 사진 한 장마다 다른 움직임을 줘서 단조롭지 않게 한다
const MOTIONS = ['zoomIn', 'panRight', 'zoomOut', 'panLeft'];

/** 사진 수·길이·박자로 장면 시간을 정한다. 장면 전환이 박자에 떨어지도록 박 단위로 맞춘다. */
export function buildTimeline(count, length, beat) {
  const outroBeats = Math.max(4, Math.round(3 / beat));
  const outro = outroBeats * beat;
  let per;
  if (length === 'auto') per = 2.3;
  else per = Math.max(1.2, (Number(length) - outro) / (count + 0.5));
  const q = (sec, min) => Math.max(min, Math.round(sec / beat)) * beat;
  const segs = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    const dur = i === 0 ? q(per * 1.5, 4) : q(per, 2);
    segs.push({ index: i, start: t, dur });
    t += dur;
  }
  return { segs, outro: { start: t, dur: outro }, total: t + outro, beat };
}

/** 원본 사진을 영상용으로 굽는다: 크기 줄이기 + 번호판 모자이크 + 흐린 배경 */
export function bakePhoto(img, masks, maxSide = 2160) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const k = Math.min(1, maxSide / Math.max(iw, ih));
  const w = Math.round(iw * k), h = Math.round(ih * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, w, h);
  for (const m of masks) pixelate(x, c, m.x * w, m.y * h, m.w * w, m.h * h);

  // 작은 크기로 줄였다가 두 번에 걸쳐 키우면 어느 브라우저에서나 부드럽게 흐려진다
  const tiny = document.createElement('canvas');
  tiny.width = 24; tiny.height = Math.max(1, Math.round(24 * h / w));
  tiny.getContext('2d').drawImage(c, 0, 0, tiny.width, tiny.height);
  const bg = document.createElement('canvas');
  bg.width = 192; bg.height = Math.max(1, Math.round(192 * h / w));
  const bx = bg.getContext('2d');
  bx.imageSmoothingQuality = 'high';
  bx.drawImage(tiny, 0, 0, bg.width, bg.height);
  return { canvas: c, bg };
}

function pixelate(ctx, src, x, y, w, h) {
  if (w < 2 || h < 2) return;
  const block = Math.max(6, Math.round(Math.max(w, h) / 9));
  const tw = Math.max(1, Math.round(w / block)), th = Math.max(1, Math.round(h / block));
  const t = document.createElement('canvas');
  t.width = tw; t.height = th;
  t.getContext('2d').drawImage(src, x, y, w, h, 0, 0, tw, th);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(t, 0, 0, tw, th, x, y, w, h);
  ctx.restore();
}

// ---------- 그리기 도우미 ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (p) => 1 - (1 - clamp(p)) ** 3;
const easeInOut = (p) => { p = clamp(p); return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2; };
const backOut = (p) => { p = clamp(p); const c = 1.7; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; };
const font = (w, px) => `${w} ${Math.round(px)}px ${FONT}`;

function hexToRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [99, 102, 241];
}
function readableOn(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#0b0c0e' : '#ffffff';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

/** 폭에 맞을 때까지 글자 크기를 줄인다 */
function fitFont(ctx, text, weight, size, maxW, min = size * 0.55) {
  let s = size;
  ctx.font = font(weight, s);
  while (s > min && ctx.measureText(text).width > maxW) { s -= 2; ctx.font = font(weight, s); }
  return s;
}

/** 단어 단위로 최대 두 줄까지 나눈다 */
function wrap2(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return [text];
  const words = text.split(/\s+/);
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(next).width > maxW && line) return [line, words.slice(i).join(' ')];
    line = next;
  }
  return [line];
}

export function layoutFor(W, H) {
  const u = Math.min(W, H) / 1080;
  const tall = H / W > 1.3;
  const wide = W / H > 1.3;
  return {
    W, H, u, tall, wide,
    padX: (wide ? 96 : 72) * u,
    // 릴스·쇼츠는 위아래에 앱 버튼과 설명이 덮이므로 그만큼 비운다
    top: tall ? H * 0.085 : 56 * u,
    bottom: tall ? H * 0.79 : H - 64 * u,
    photoCY: tall ? H * 0.45 : H * 0.5,
  };
}

// ---------- 사진 ----------
function drawPhoto(ctx, scene, idx, local, dur, { dx = 0, extra = 1, alpha = 1 } = {}) {
  const { W, H } = scene.L;
  const ph = scene.photos[idx];
  if (!ph) return;
  const img = ph.canvas;
  const iw = img.width, ih = img.height;
  const p = clamp(local / dur, 0, 1.25);
  const motion = MOTIONS[idx % MOTIONS.length];
  let zoom = 1, pan = 0;
  if (motion === 'zoomIn') zoom = 1 + 0.12 * p;
  if (motion === 'zoomOut') zoom = 1.12 - 0.12 * p;
  if (motion === 'panRight') { zoom = 1.1; pan = -1 + 2 * p; }
  if (motion === 'panLeft') { zoom = 1.1; pan = 1 - 2 * p; }
  zoom *= extra;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(dx, 0);
  const cover = Math.max(W / iw, H / ih);
  const contain = Math.min(W / iw, H / ih);
  const smart = scene.fit === 'smart' && Math.abs(iw / ih - W / H) > 0.15;

  if (smart) {
    // 흐린 배경 위에 사진 전체를 보여준다
    const bs = Math.max(W / ph.bg.width, H / ph.bg.height) * 1.15;
    ctx.drawImage(ph.bg, (W - ph.bg.width * bs) / 2, (H - ph.bg.height * bs) / 2, ph.bg.width * bs, ph.bg.height * bs);
    ctx.fillStyle = scene.style.dark ? 'rgb(0 0 0 / 38%)' : 'rgb(255 255 255 / 30%)';
    ctx.fillRect(0, 0, W, H);
    const base = scene.L.tall ? Math.max(contain, (W * 1.06) / iw) : contain;
    const s = base * zoom;
    const dw = iw * s, dh = ih * s;
    const slack = Math.max(0, dw - W) / 2;
    const cy = scene.L.tall ? scene.L.photoCY : H / 2;
    ctx.drawImage(img, (W - dw) / 2 + pan * slack * 0.9, cy - dh / 2, dw, dh);
  } else {
    const s = cover * zoom;
    const dw = iw * s, dh = ih * s;
    const slackX = (dw - W) / 2, slackY = (dh - H) / 2;
    ctx.drawImage(img, (W - dw) / 2 + pan * slackX * 0.95, (H - dh) / 2, dw, dh);
    void slackY;
  }
  ctx.restore();
}

// ---------- 글자 요소 ----------
function drawHeader(ctx, scene, t) {
  const { L, brand } = scene;
  const { u } = L;
  if (!brand.name && !brand.logoImg) return;
  const a = clamp(t / 0.5);
  ctx.save();
  ctx.globalAlpha = a;
  const h = 64 * u;
  let x = L.padX;
  const y = L.top;
  if (brand.logoImg) {
    const li = brand.logoImg;
    const lw = Math.min(200 * u, (li.width / li.height) * h);
    const lh = lw * (li.height / li.width);
    ctx.shadowColor = 'rgb(0 0 0 / 35%)'; ctx.shadowBlur = 12 * u;
    ctx.drawImage(li, x, y + (h - lh) / 2, lw, lh);
    ctx.shadowBlur = 0;
    x += lw + 16 * u;
  }
  if (brand.name) {
    ctx.font = font(700, 32 * u);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgb(0 0 0 / 55%)'; ctx.shadowBlur = 10 * u;
    ctx.fillText(brand.name, x, y + h / 2);
  }
  ctx.restore();
}

function drawProgress(ctx, scene, t) {
  const { L, timeline, accent } = scene;
  const { u } = L;
  const n = timeline.segs.length;
  const gap = 8 * u;
  const y = L.top - 28 * u;
  const w = (L.W - L.padX * 2 - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const s = timeline.segs[i];
    const p = clamp((t - s.start) / s.dur);
    const x = L.padX + i * (w + gap);
    ctx.fillStyle = 'rgb(255 255 255 / 30%)';
    roundRect(ctx, x, y, w, 7 * u, 4 * u); ctx.fill();
    if (p > 0) { ctx.fillStyle = accent; roundRect(ctx, x, y, w * p, 7 * u, 4 * u); ctx.fill(); }
  }
}

/** 아래쪽을 어둡게 깔아 흰 글씨가 읽히게 한다 */
function shade(ctx, L, from, alpha = 0.8) {
  const g = ctx.createLinearGradient(0, from, 0, L.H);
  g.addColorStop(0, 'rgb(0 0 0 / 0%)');
  g.addColorStop(0.45, `rgb(0 0 0 / ${alpha * 0.7})`);
  g.addColorStop(1, `rgb(0 0 0 / ${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, from, L.W, L.H - from);
}

function drawIntro(ctx, scene, local) {
  const { L, info, style, accent, accentInk } = scene;
  const { u } = L;
  const maxW = L.W - L.padX * 2;
  const enter = (i) => {
    const p = style.transition === 'whip' ? backOut((local - 0.15 - i * 0.12) / 0.45) : easeOut((local - 0.15 - i * 0.12) / 0.5);
    return { a: clamp((local - 0.15 - i * 0.12) / 0.3), dy: (1 - p) * 40 * u };
  };

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // 블록 높이를 먼저 재고 아래 기준선에 맞춰 쌓는다
  const titleSize = (L.tall ? 104 : L.wide ? 92 : 88) * u;
  ctx.font = font(800, titleSize);
  let lines = wrap2(ctx, info.model || info.title, maxW);
  const tSize = lines.map((ln) => fitFont(ctx, ln, 800, titleSize, maxW)).reduce((a, b) => Math.min(a, b), titleSize);
  ctx.font = font(800, tSize);
  lines = wrap2(ctx, info.model || info.title, maxW);
  const lineH = tSize * 1.12;
  const priceH = info.price ? 108 * u : 0;
  const subH = info.sub ? 54 * u : 0;
  const makeH = info.make && info.model ? 50 * u : 0;
  const blockH = makeH + lines.length * lineH + subH + priceH + 24 * u;
  const bottom = L.bottom;
  let y = bottom - blockH;

  if (style.dark) shade(ctx, L, Math.max(0, y - 220 * u), 0.82);
  else {
    const e = enter(0);
    ctx.globalAlpha = e.a * 0.94;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, L.padX - 36 * u, y - 40 * u + e.dy, maxW + 72 * u, blockH + 64 * u, 36 * u);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const ink = style.dark ? '#ffffff' : '#0b0c0e';
  const ink2 = style.dark ? 'rgb(255 255 255 / 82%)' : '#4b5563';

  if (makeH) {
    const e = enter(0);
    ctx.globalAlpha = e.a;
    ctx.font = font(700, 40 * u);
    ctx.fillStyle = style.dark ? accentOn(accent) : accent;
    const label = [info.make, info.trim].filter(Boolean).join(' · ');
    fitFont(ctx, label, 700, 40 * u, maxW);
    ctx.fillText(label, L.padX, y + 38 * u + e.dy);
    y += makeH;
  }
  lines.forEach((ln, i) => {
    const e = enter(1 + i * 0.5);
    ctx.globalAlpha = e.a;
    ctx.font = font(800, tSize);
    ctx.fillStyle = ink;
    ctx.fillText(ln, L.padX, y + tSize * 0.95 + e.dy);
    y += lineH;
  });
  if (subH) {
    const e = enter(2);
    ctx.globalAlpha = e.a;
    ctx.fillStyle = ink2;
    fitFont(ctx, info.sub, 600, 40 * u, maxW);
    ctx.fillText(info.sub, L.padX, y + 46 * u + e.dy);
    y += subH;
  }
  if (priceH) {
    const e = enter(3);
    const pop = style.transition === 'punch' ? 1 + 0.25 * (1 - easeOut((local - 0.6) / 0.35)) : 1;
    ctx.globalAlpha = e.a;
    ctx.font = font(800, 72 * u);
    const tw = ctx.measureText(info.price).width;
    const ph = 96 * u, pw = tw + 56 * u;
    const px = L.padX, py = y + 20 * u + e.dy;
    ctx.save();
    ctx.translate(px, py + ph / 2);
    ctx.scale(pop, pop);
    ctx.fillStyle = accent;
    roundRect(ctx, 0, -ph / 2, pw, ph, 20 * u); ctx.fill();
    ctx.fillStyle = accentInk;
    ctx.textBaseline = 'middle';
    ctx.fillText(info.price, 28 * u, 4 * u);
    ctx.restore();
  }
  ctx.restore();
}

// 어두운 바탕 위 강조색 글씨가 너무 어두우면 밝게 띄운다
function accentOn(accent) {
  return readableOn(accent) === '#ffffff' ? '#ffffff' : accent;
}

function drawLabel(ctx, scene, text, local, dur) {
  if (!text) return;
  const { L } = scene;
  const { u } = L;
  const a = clamp(local / 0.3) * clamp((dur - local) / 0.25);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = font(700, 30 * u);
  const tw = ctx.measureText(text).width;
  const x = L.W - L.padX - tw - 36 * u;
  const y = L.top + 4 * u;
  ctx.fillStyle = 'rgb(0 0 0 / 55%)';
  roundRect(ctx, x, y, tw + 36 * u, 56 * u, 28 * u); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 18 * u, y + 29 * u);
  ctx.restore();
}

function drawCallout(ctx, scene, c, local, dur) {
  const { L, style, accent, accentInk } = scene;
  const { u } = L;
  const inP = style.transition === 'whip' ? backOut((local - 0.2) / 0.4) : easeOut((local - 0.2) / 0.45);
  const outA = clamp((dur - local) / 0.25);
  const a = clamp((local - 0.2) / 0.25) * outA;
  if (a <= 0) return;
  const maxW = L.W - L.padX * 2;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  const vSize = fitFont(ctx, c.check ? `✓ ${c.v}` : c.v, 800, (L.tall ? 92 : 80) * u, maxW - 60 * u);
  const keyH = c.k ? 52 * u : 0;
  const boxH = keyH + vSize * 1.25 + 56 * u;
  const y = L.bottom - boxH;

  if (style.dark) {
    ctx.globalAlpha = a;
    shade(ctx, L, Math.max(0, y - 200 * u), 0.75);
  }
  const dx = style.transition === 'whip' ? (1 - inP) * -120 * u : 0;
  const dy = style.transition === 'whip' ? 0 : (1 - inP) * 36 * u;
  ctx.globalAlpha = a;
  ctx.translate(dx, dy);

  if (!style.dark) {
    ctx.font = font(800, vSize);
    const w = Math.max(ctx.measureText(c.check ? `✓ ${c.v}` : c.v).width, c.k ? 260 * u : 0) + 72 * u;
    ctx.fillStyle = 'rgb(255 255 255 / 95%)';
    roundRect(ctx, L.padX - 8 * u, y, Math.min(maxW + 16 * u, w), boxH, 32 * u); ctx.fill();
    ctx.fillStyle = accent;
    roundRect(ctx, L.padX - 8 * u, y, 12 * u, boxH, 6 * u); ctx.fill();
  }
  const x = L.padX + (style.dark ? 0 : 36 * u);
  let yy = y + 28 * u;
  if (c.k) {
    ctx.font = font(700, 36 * u);
    ctx.fillStyle = style.dark ? accentOn(accent) : accent;
    ctx.fillText(c.k, x, yy + 34 * u);
    yy += keyH;
  }
  ctx.font = font(800, vSize);
  if (c.check) {
    // 특장점은 강조색 동그라미 체크와 함께
    const r = vSize * 0.42;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(x + r, yy + vSize * 0.55, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = accentInk; ctx.lineWidth = 8 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + r * 0.55, yy + vSize * 0.57); ctx.lineTo(x + r * 0.9, yy + vSize * 0.55 + r * 0.38); ctx.lineTo(x + r * 1.5, yy + vSize * 0.55 - r * 0.35);
    ctx.stroke();
    ctx.fillStyle = style.dark ? '#fff' : '#0b0c0e';
    ctx.fillText(c.v, x + r * 2 + 22 * u, yy + vSize * 0.92);
  } else {
    ctx.fillStyle = style.dark ? '#fff' : '#0b0c0e';
    ctx.fillText(c.v, x, yy + vSize * 0.92);
  }
  ctx.restore();
}

function drawOutro(ctx, scene, local, dur) {
  const { L, info, brand, style, accent, accentInk } = scene;
  const { W, H, u } = L;
  const last = scene.photos[scene.photos.length - 1];
  const a = easeOut(local / 0.5);

  // 배경: 마지막 사진을 흐리게 + 어둡게 덮고 강조색을 은은하게
  if (last) {
    const bs = Math.max(W / last.bg.width, H / last.bg.height) * 1.2;
    ctx.drawImage(last.bg, (W - last.bg.width * bs) / 2, (H - last.bg.height * bs) / 2, last.bg.width * bs, last.bg.height * bs);
  }
  ctx.fillStyle = style.dark ? `rgb(6 7 9 / ${0.55 + 0.25 * a})` : `rgb(250 250 250 / ${0.6 + 0.3 * a})`;
  ctx.fillRect(0, 0, W, H);
  const [r, g, b] = hexToRgb(accent);
  const rg = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, Math.max(W, H) * 0.7);
  rg.addColorStop(0, `rgb(${r} ${g} ${b} / ${0.32 * a})`);
  rg.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);

  const ink = style.dark ? '#ffffff' : '#0b0c0e';
  const ink2 = style.dark ? 'rgb(255 255 255 / 78%)' : '#4b5563';
  const maxW = W - L.padX * 2;
  const items = [];
  if (brand.logoImg) items.push({ type: 'logo', h: 120 * u });
  items.push({ type: 'text', text: info.title, w: 800, size: 72 * u, color: ink, h: 92 * u });
  if (info.price) items.push({ type: 'price', text: info.price, h: 132 * u });
  items.push({ type: 'gap', h: 28 * u });
  if (brand.phone) {
    items.push({ type: 'text', text: '매물 문의', w: 700, size: 36 * u, color: ink2, h: 52 * u });
    items.push({ type: 'text', text: brand.phone, w: 800, size: 84 * u, color: ink, h: 104 * u });
  }
  if (brand.name) items.push({ type: 'text', text: brand.name, w: 700, size: 42 * u, color: ink, h: 64 * u });
  if (brand.cta) items.push({ type: 'cta', text: brand.cta, h: 104 * u });

  const total = items.reduce((s, it) => s + it.h, 0);
  const center = L.tall ? H * 0.47 : H / 2;
  let y = center - total / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  items.forEach((it, i) => {
    const p = style.transition === 'whip' ? backOut((local - 0.1 - i * 0.08) / 0.45) : easeOut((local - 0.1 - i * 0.08) / 0.5);
    ctx.globalAlpha = clamp((local - 0.1 - i * 0.08) / 0.3);
    const cy = y + it.h / 2 + (1 - p) * 30 * u;
    if (it.type === 'logo') {
      const li = brand.logoImg;
      const lh = Math.min(96 * u, (240 * u) * (li.height / li.width));
      const lw = lh * (li.width / li.height);
      ctx.drawImage(li, W / 2 - lw / 2, cy - lh / 2, lw, lh);
    } else if (it.type === 'text') {
      ctx.fillStyle = it.color;
      fitFont(ctx, it.text, it.w, it.size, maxW);
      ctx.fillText(it.text, W / 2, cy);
    } else if (it.type === 'price') {
      fitFont(ctx, it.text, 800, 80 * u, maxW - 60 * u);
      const tw = ctx.measureText(it.text).width;
      ctx.fillStyle = accent;
      roundRect(ctx, W / 2 - tw / 2 - 36 * u, cy - 52 * u, tw + 72 * u, 104 * u, 24 * u); ctx.fill();
      ctx.fillStyle = accentInk;
      ctx.fillText(it.text, W / 2, cy + 4 * u);
    } else if (it.type === 'cta') {
      fitFont(ctx, it.text, 700, 40 * u, maxW - 80 * u);
      const tw = ctx.measureText(it.text).width;
      ctx.strokeStyle = ink; ctx.lineWidth = 3 * u;
      roundRect(ctx, W / 2 - tw / 2 - 40 * u, cy - 38 * u, tw + 80 * u, 76 * u, 38 * u); ctx.stroke();
      ctx.fillStyle = ink;
      ctx.fillText(it.text, W / 2, cy + 2 * u);
    }
    y += it.h;
  });
  ctx.restore();
  void dur;
}

/** 안전 영역(앱 버튼이 덮는 곳) 안내선. 미리보기에서만 그린다. */
function drawSafeGuide(ctx, L) {
  ctx.save();
  ctx.fillStyle = 'rgb(255 0 80 / 14%)';
  ctx.fillRect(0, 0, L.W, L.top - 36 * L.u);
  ctx.fillRect(0, L.bottom + 16 * L.u, L.W, L.H - L.bottom);
  if (L.tall) ctx.fillRect(L.W - 130 * L.u, L.H * 0.45, 130 * L.u, L.bottom - L.H * 0.45);
  ctx.restore();
}

/**
 * @param scene { L, timeline, photos[], info, callouts[], labels[], brand, style, accent, accentInk, fit, safe }
 */
export function drawFrame(ctx, scene, t) {
  const { L, timeline, style } = scene;
  const { W, H } = L;
  ctx.save();
  ctx.fillStyle = style.dark ? '#000' : '#fff';
  ctx.fillRect(0, 0, W, H);

  const { segs, outro } = timeline;
  if (t >= outro.start) {
    const local = t - outro.start;
    // 마지막 사진에서 마무리 화면으로 부드럽게 넘어간다
    if (local < 0.45 && segs.length) {
      const s = segs[segs.length - 1];
      drawPhoto(ctx, scene, s.index, t - s.start, s.dur);
      ctx.globalAlpha = easeInOut(local / 0.45);
    }
    drawOutro(ctx, scene, local, outro.dur);
    ctx.globalAlpha = 1;
  } else {
    let i = segs.findIndex((s) => t < s.start + s.dur);
    if (i < 0) i = segs.length - 1;
    const s = segs[i];
    const local = t - s.start;
    const trDur = style.transition === 'fade' ? 0.45 : 0.3;
    if (i > 0 && local < trDur) {
      const prev = segs[i - 1];
      const pl = t - prev.start;
      const p = local / trDur;
      if (style.transition === 'fade') {
        drawPhoto(ctx, scene, prev.index, pl, prev.dur);
        drawPhoto(ctx, scene, s.index, local, s.dur, { alpha: easeInOut(p) });
      } else if (style.transition === 'whip') {
        const e = easeInOut(p);
        drawPhoto(ctx, scene, prev.index, pl, prev.dur, { dx: -e * W });
        // 빠르게 미는 느낌을 위해 잔상을 겹친다
        for (const k of [0.06, 0.03]) drawPhoto(ctx, scene, s.index, local, s.dur, { dx: (1 - e + k) * W, alpha: 0.35 });
        drawPhoto(ctx, scene, s.index, local, s.dur, { dx: (1 - e) * W });
      } else {
        drawPhoto(ctx, scene, s.index, local, s.dur, { extra: 1 + 0.16 * (1 - easeOut(p)) });
      }
    } else {
      let extra = 1;
      if (style.transition === 'whip') {
        const sinceBeat = t % timeline.beat;
        extra = 1 + 0.012 * Math.exp(-sinceBeat / 0.1);
      }
      drawPhoto(ctx, scene, s.index, local, s.dur, { extra });
    }
    // 강렬하게: 장면이 바뀔 때 번쩍
    if (style.transition === 'punch' && i > 0 && local < 0.18) {
      ctx.fillStyle = `rgb(255 255 255 / ${0.55 * (1 - local / 0.18)})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (style.transition === 'whip') drawProgress(ctx, scene, t);
    drawHeader(ctx, scene, t);
    if (i === 0) drawIntro(ctx, scene, local);
    else {
      drawLabel(ctx, scene, scene.labels[s.index], local, s.dur);
      const c = scene.callouts[i - 1];
      if (c) drawCallout(ctx, scene, c, local, s.dur);
    }
  }
  if (scene.safe) drawSafeGuide(ctx, L);
  ctx.restore();
}

export function makeScene({ W, H, photos, timeline, info, callouts, labels, brand, styleId, fit, safe = false }) {
  const style = STYLES[styleId];
  const accent = /^#[\da-f]{6}$/i.test(brand.color || '') ? brand.color : style.accent;
  return {
    L: layoutFor(W, H), photos, timeline, info, callouts, labels, brand, style, fit, safe,
    accent, accentInk: readableOn(accent),
  };
}
