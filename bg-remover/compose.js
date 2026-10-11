// 배경지우개와 숏폼 스튜디오가 같이 쓰는 합성 도구: 마스크 정리, 차량 위치, 그림자·반사, 상사 쇼룸 배경.

export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// 상사 쇼룸: 슬랫 벽, 천장 LED 바, 벽에 붙은 입체 간판(상사명·로고·문구), 걸레받이 조명, 광택 바닥
export const SIGN_ZONE = 0.31;
export const SIGN_FONT = '"Gothic A1", "IBM Plex Sans KR", "Malgun Gothic", sans-serif';

// 워커가 준 1채널 마스크를 원본 크기의 알파 캔버스로 만든다.
export function maskCanvas({ width, height, mask }, w, h) {
  const small = canvas(width, height);
  const img = small.getContext('2d').createImageData(width, height);
  for (let i = 0; i < mask.length; i++) {
    const o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
    // 희미하게 남은 하늘·바닥 얼룩은 버리고, 거의 확실한 부분은 완전히 채운다
    const a = mask[i];
    img.data[o + 3] = a < 24 ? 0 : a > 232 ? 255 : Math.round((a - 24) * 255 / 208);
  }
  small.getContext('2d').putImageData(img, 0, 0);
  const out = canvas(w, h);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, w, h);
  return keepMainSubject(out);
}

// 차량(가장 큰 덩어리)과 그에 맞먹는 덩어리만 남기고, 떨어져 있는 작은 조각은 지운다.
export function keepMainSubject(mask) {
  const W = mask.width, H = mask.height;
  const k = Math.min(1, 480 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const small = canvas(w, h);
  small.getContext('2d').drawImage(mask, 0, 0, w, h);
  const alpha = small.getContext('2d').getImageData(0, 0, w, h).data;
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const queue = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || alpha[start * 4 + 3] < 128) continue;
    const id = sizes.length;
    let head = 0, tail = 0;
    queue[tail++] = start; label[start] = id;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w, y = (i - x) / w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const n of nb) {
        if (n >= 0 && label[n] === -1 && alpha[n * 4 + 3] >= 128) { label[n] = id; queue[tail++] = n; }
      }
    }
    sizes.push(tail);
  }
  if (!sizes.length) return mask;
  const biggest = Math.max(...sizes);
  const keepIds = new Set(sizes.map((n, id) => (n >= biggest * 0.15 ? id : -1)).filter((id) => id >= 0));
  // 남길 영역을 2px 넓혀서 차체 가장자리의 부드러운 경계는 살린다
  let keep = new Uint8Array(w * h);
  for (let i = 0; i < keep.length; i++) keep[i] = keepIds.has(label[i]) ? 1 : 0;
  for (let pass = 0; pass < 2; pass++) {
    const grown = keep.slice();
    for (let i = 0; i < keep.length; i++) {
      if (keep[i]) continue;
      const x = i % w;
      if ((x > 0 && keep[i - 1]) || (x < w - 1 && keep[i + 1]) || keep[i - w] || keep[i + w]) grown[i] = 1;
    }
    keep = grown;
  }
  const keepImg = small.getContext('2d').createImageData(w, h);
  for (let i = 0; i < keep.length; i++) keepImg.data[i * 4 + 3] = keep[i] ? 255 : 0;
  small.getContext('2d').putImageData(keepImg, 0, 0);
  const ctx = mask.getContext('2d');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  return mask;
}

export function findBBox(mask) {
  const step = 2;
  const w = mask.width, h = mask.height;
  const data = mask.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (data[(y * w + x) * 4 + 3] > 110) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h };
  return { x: x0, y: y0, w: Math.min(w, x1 + step) - x0, h: Math.min(h, y1 + step) - y0 };
}

export function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

export function drawBrandStudio(ctx, W, H, horizon, dark, sign) {
  const c = dark
    ? { wall: ['#202328', '#131417'], slat: 'rgba(255,255,255,0.035)', slatShade: 'rgba(0,0,0,0.22)', floor: ['#2b2e33', '#0a0b0d'],
        led: '#ffffff', ledGlow: 'rgba(255,255,255,0.55)', cove: 'rgba(255,244,228,0.55)', sheen: 'rgba(255,255,255,0.10)' }
    : { wall: ['#f6f7f8', '#e6e8eb'], slat: 'rgba(255,255,255,0.7)', slatShade: 'rgba(30,36,44,0.05)', floor: ['#d9dce0', '#f4f5f6'],
        led: '#ffffff', ledGlow: 'rgba(255,255,255,0.9)', cove: 'rgba(255,255,255,0.95)', sheen: 'rgba(255,255,255,0.45)' };

  // 벽과 세로 슬랫 패널
  ctx.fillStyle = vgrad(ctx, 0, horizon, c.wall);
  ctx.fillRect(0, 0, W, horizon);
  const slatW = W / 44;
  for (let x = 0; x < W; x += slatW) {
    ctx.fillStyle = c.slatShade;
    ctx.fillRect(Math.round(x), 0, Math.max(1, slatW * 0.08), horizon);
    ctx.fillStyle = c.slat;
    ctx.fillRect(Math.round(x + slatW * 0.08), 0, 1, horizon);
  }
  // 벽 가장자리를 어둡게 해 가운데로 시선을 모은다
  const vig = ctx.createRadialGradient(W / 2, horizon * 0.55, W * 0.15, W / 2, horizon * 0.55, W * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, dark ? 'rgba(0,0,0,0.45)' : 'rgba(40,46,54,0.10)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, horizon);

  // 바닥
  ctx.fillStyle = vgrad(ctx, horizon, H, c.floor);
  ctx.fillRect(0, horizon, W, H - horizon);
  const sheen = ctx.createRadialGradient(W / 2, horizon + (H - horizon) * 0.35, 0, W / 2, horizon + (H - horizon) * 0.35, W * 0.55);
  sheen.addColorStop(0, c.sheen);
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.translate(0, horizon);
  ctx.scale(1, 0.45);
  ctx.translate(0, -horizon);
  ctx.fillStyle = sheen;
  ctx.fillRect(0, horizon, W, (H - horizon) / 0.45);
  ctx.restore();

  // 천장 LED 바
  const ledY = H * 0.035, ledH = Math.max(3, H * 0.007);
  ctx.save();
  ctx.shadowColor = c.ledGlow;
  ctx.shadowBlur = H * 0.04;
  ctx.fillStyle = c.led;
  roundRect(ctx, W * 0.16, ledY, W * 0.68, ledH, ledH / 2);
  ctx.fill();
  ctx.restore();

  // 걸레받이 간접 조명
  ctx.save();
  ctx.shadowColor = c.cove;
  ctx.shadowBlur = H * 0.03;
  ctx.fillStyle = c.cove;
  ctx.fillRect(0, horizon - Math.max(1, H * 0.003), W, Math.max(1.5, H * 0.003));
  ctx.restore();

  drawSign(ctx, W, H, Math.min(horizon - H * 0.05, H * (SIGN_ZONE - 0.025)), dark, sign);
}

// sign: { name, sub, logo } 상사명·간판 아래 문구·로고 이미지
export function drawSign(ctx, W, H, bottom, dark, sign = {}) {
  const name = (sign.name || '').trim();
  const sub = (sign.sub || '').trim();
  const logo = sign.logo || null;
  if (!name && !logo) return;
  const top = H * 0.085;
  const avail = bottom - top;
  if (avail < H * 0.05) return;

  let fs = Math.min(W * 0.08, avail * (sub ? 0.56 : 0.78));
  ctx.font = `800 ${fs}px ${SIGN_FONT}`;
  ctx.letterSpacing = `${fs * 0.04}px`;
  const logoH = fs * 1.05;
  const logoW = logo ? logoH * logo.width / logo.height : 0;
  const gap = logo && name ? fs * 0.35 : 0;
  let nameW = name ? ctx.measureText(name).width : 0;
  const maxW = W * 0.64;
  if (nameW + logoW + gap > maxW) {
    const k = maxW / (nameW + logoW + gap);
    fs *= k;
    ctx.font = `800 ${fs}px ${SIGN_FONT}`;
    ctx.letterSpacing = `${fs * 0.04}px`;
    nameW = name ? ctx.measureText(name).width : 0;
  }
  const lh = logo ? fs * 1.05 : 0;
  const lw = logo ? lh * logo.width / logo.height : 0;
  const g = logo && name ? fs * 0.35 : 0;
  const subFs = fs * 0.27;
  const blockH = fs + (sub ? subFs * 2.2 : 0);
  const y0 = top + (avail - blockH) / 2;
  const cy = y0 + fs / 2;
  let x = (W - (lw + g + nameW)) / 2;

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  if (logo) {
    if (dark) { ctx.shadowColor = 'rgba(255,255,255,0.35)'; ctx.shadowBlur = fs * 0.5; }
    else { ctx.shadowColor = 'rgba(20,24,30,0.28)'; ctx.shadowBlur = fs * 0.12; ctx.shadowOffsetX = fs * 0.04; ctx.shadowOffsetY = fs * 0.06; }
    ctx.drawImage(logo, x, cy - lh / 2, lw, lh);
    ctx.shadowColor = 'transparent';
    x += lw + g;
  }

  if (name) {
    if (dark) {
      // 뒤에서 벽을 비추는 헤일로 조명
      ctx.save();
      ctx.shadowColor = 'rgba(255,240,220,0.9)';
      ctx.shadowBlur = fs * 0.55;
      ctx.fillStyle = 'rgba(255,240,220,0.35)';
      ctx.fillText(name, x, cy);
      ctx.restore();
      const face = ctx.createLinearGradient(0, cy - fs / 2, 0, cy + fs / 2);
      face.addColorStop(0, '#ffffff');
      face.addColorStop(1, '#d9dde3');
      ctx.fillStyle = face;
      ctx.fillText(name, x, cy);
    } else {
      // 벽에서 띄운 금속 글자: 측면 두께 + 벽 그림자 + 브러시드 면
      ctx.save();
      ctx.shadowColor = 'rgba(20,24,30,0.32)';
      ctx.shadowBlur = fs * 0.14;
      ctx.shadowOffsetX = fs * 0.05;
      ctx.shadowOffsetY = fs * 0.08;
      ctx.fillStyle = '#1d2126';
      ctx.fillText(name, x, cy);
      ctx.restore();
      const depth = Math.max(1, fs * 0.035);
      ctx.fillStyle = '#0f1215';
      for (let d = depth; d > 0; d -= 1) ctx.fillText(name, x + d * 0.6, cy + d);
      const face = ctx.createLinearGradient(0, cy - fs / 2, 0, cy + fs / 2);
      face.addColorStop(0, '#4a525c');
      face.addColorStop(0.5, '#2a3037');
      face.addColorStop(1, '#1a1e23');
      ctx.fillStyle = face;
      ctx.fillText(name, x, cy);
    }
  }

  if (sub) {
    ctx.font = `600 ${subFs}px ${SIGN_FONT}`;
    ctx.letterSpacing = `${subFs * 0.32}px`;
    ctx.textAlign = 'center';
    const sy = y0 + fs + subFs * 1.25;
    const tw = ctx.measureText(sub).width;
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.78)' : 'rgba(30,35,42,0.72)';
    ctx.fillText(sub, W / 2 + subFs * 0.16, sy);
    // 문구 양옆 가는 선
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(30,35,42,0.3)';
    const lineW = Math.min(W * 0.08, fs * 1.2);
    ctx.fillRect(W / 2 - tw / 2 - subFs - lineW, sy - 0.5, lineW, 1.5);
    ctx.fillRect(W / 2 + tw / 2 + subFs * 0.5, sy - 0.5, lineW, 1.5);
  }
  ctx.restore();
}

// 차량 아랫선(각 열에서 가장 아래 불투명 지점). 3/4 각도 사진도 바퀴마다 높이가 달라 이 선을 따라 그림자를 깐다.
export function lowerContour(item) {
  if (item._contourFor === item.bbox && item._contour) return item._contour;
  const { mask, bbox: b } = item;
  const k = Math.min(1, 400 / b.w);
  const w = Math.max(2, Math.round(b.w * k)), h = Math.max(2, Math.round(b.h * k));
  const c = canvas(w, h);
  c.getContext('2d').drawImage(mask, b.x, b.y, b.w, b.h, 0, 0, w, h);
  const a = c.getContext('2d').getImageData(0, 0, w, h).data;
  const raw = new Float32Array(w).fill(NaN);
  for (let x = 0; x < w; x++) {
    for (let y = h - 1; y >= 0; y--) {
      if (a[(y * w + x) * 4 + 3] > 128) { raw[x] = b.y + (y + 1) / k; break; }
    }
  }
  // 튀는 값은 이웃 중앙값으로 눌러 준다
  const ys = raw.map((v, i) => {
    if (Number.isNaN(v)) return v;
    const near = [...raw.slice(Math.max(0, i - 3), i + 4)].filter((n) => !Number.isNaN(n)).sort((m, n) => m - n);
    return near[near.length >> 1];
  });
  const step = 1 / k;
  const pts = [];
  ys.forEach((y, i) => { if (!Number.isNaN(y)) pts.push({ x: b.x + (i + 0.5) * step, y }); });
  // 반사용으로 더 매끈하게 다듬은 선
  const r = Math.max(3, Math.round(w * 0.03));
  const smooth = ys.map((v, i) => {
    if (Number.isNaN(v)) return v;
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(w - 1, i + r); j++) if (!Number.isNaN(ys[j])) { sum += ys[j]; n++; }
    return sum / n;
  });
  item._contour = { pts, smooth, step, x0: b.x };
  item._contourFor = b;
  return item._contour;
}

export function drawShadow(ctx, item, scale, dx, dy, carH, k) {
  const pts = lowerContour(item).pts.map((p) => ({ x: dx + p.x * scale, y: dy + p.y * scale }));
  if (pts.length < 2) return;
  const band = (down, up) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y + down) : ctx.moveTo(p.x, p.y + down)));
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y - up);
    ctx.closePath();
    ctx.fill();
  };
  ctx.save();
  ctx.fillStyle = '#000';
  // 넓게 퍼지는 바닥 그림자
  ctx.globalAlpha = 0.38 * k;
  ctx.filter = `blur(${carH * 0.045}px)`;
  band(carH * 0.05, carH * 0.06);
  // 타이어가 닿는 곳의 진한 접지 그림자
  ctx.globalAlpha = 0.8 * k;
  ctx.filter = `blur(${Math.max(1.5, carH * 0.01)}px)`;
  band(carH * 0.012, carH * 0.03);
  ctx.restore();
}

// 바닥 반사: 2px 열마다 아랫선을 기준으로 뒤집어 붙이고 아래로 갈수록 옅게
export function drawReflection(ctx, item, scale, dx, dy, carH) {
  const b = item.bbox;
  const { smooth, step, x0: cx0 } = lowerContour(item);
  const x0 = Math.floor(dx + b.x * scale), x1 = Math.ceil(dx + (b.x + b.w) * scale);
  const RW = x1 - x0, RH = Math.ceil(carH * 0.45);
  if (RW < 2 || RH < 2) return;
  const tmp = canvas(RW, RH);
  const t = tmp.getContext('2d');
  const colW = 2, cols = [];
  for (let X = 0; X < RW; X += colW) {
    const srcX = (x0 + X - dx) / scale;
    const idx = Math.min(smooth.length - 1, Math.max(0, Math.floor((srcX + colW / (2 * scale) - cx0) / step)));
    const yb = smooth[idx];
    if (Number.isNaN(yb) || yb <= b.y) continue;
    const dh = (yb - b.y) * scale;
    t.save();
    t.translate(X, 0);
    t.scale(1, -1);
    t.drawImage(item.cut, srcX, b.y, colW / scale, yb - b.y, 0, -dh, colW, dh);
    t.restore();
    cols.push({ X, y: dy + yb * scale });
  }
  t.globalCompositeOperation = 'destination-in';
  const g = t.createLinearGradient(0, 0, 0, RH);
  g.addColorStop(0, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  t.fillStyle = g;
  t.fillRect(0, 0, RW, RH);
  for (const c of cols) ctx.drawImage(tmp, c.X, 0, colW, RH, x0 + c.X, c.y, colW, RH);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

