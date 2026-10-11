// 매물 사진 보정·내보내기: 자동 밝기·대비, 선명하게, 상사 배너, 매물 등록용 4:3 사진.
import { fmt } from './render.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FONT = '"IBM Plex Sans KR", "Gothic A1", "Malgun Gothic", sans-serif';

export const LISTING_SIZES = {
  '4:3': { w: 1600, h: 1200, label: '4:3 (1600×1200)', hint: '보배드림·엔카·첫차 등록' },
  '1:1': { w: 1200, h: 1200, label: '1:1 (1200×1200)', hint: '인스타·당근' },
};

/** 사진 밝기 분포를 보고 어둡거나 뿌연 사진을 펴 주는 CSS 필터 값을 고른다. */
export function autoToneFilter(img) {
  const s = 64;
  const c = new OffscreenCanvas(s, s);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, s, s);
  const d = x.getImageData(0, 0, s, s).data;
  const lum = [];
  let sat = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (d[i + 3] < 128) continue;   // 잘라낸 차는 투명한 곳을 빼고 잰다
    lum.push(0.299 * r + 0.587 * g + 0.114 * b);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat += mx ? (mx - mn) / mx : 0;
  }
  if (lum.length < 50) return 'none';
  lum.sort((a, b) => a - b);
  const p = (q) => lum[Math.floor((lum.length - 1) * q)];
  const lo = p(0.02), hi = p(0.98), mid = p(0.5);
  const contrast = clamp(225 / Math.max(40, hi - lo), 1, 1.3);
  const brightness = clamp(120 / Math.max(30, mid), 0.95, 1.28);
  const saturate = clamp(0.32 / Math.max(0.05, sat / lum.length), 1, 1.18);
  return `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturate.toFixed(3)})`;
}

/** 가벼운 언샤프 마스크: 원본에서 흐린 사진을 빼 경계를 살린다. */
export function sharpen(cv, amount = 0.45) {
  const { width: w, height: h } = cv;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const src = ctx.getImageData(0, 0, w, h);
  const blur = new OffscreenCanvas(w, h);
  const bx = blur.getContext('2d', { willReadFrequently: true });
  bx.filter = 'blur(1.2px)';
  bx.drawImage(cv, 0, 0);
  const bd = bx.getImageData(0, 0, w, h).data;
  const s = src.data;
  for (let i = 0; i < s.length; i += 4) {
    s[i] = clamp(s[i] + (s[i] - bd[i]) * amount, 0, 255);
    s[i + 1] = clamp(s[i + 1] + (s[i + 1] - bd[i + 1]) * amount, 0, 255);
    s[i + 2] = clamp(s[i + 2] + (s[i + 2] - bd[i + 2]) * amount, 0, 255);
  }
  ctx.putImageData(src, 0, 0);
  return cv;
}

/** 사진을 W×H에 꽉 차게(넘치는 곳은 잘라) 그린다. */
export function drawCover(ctx, img, W, H, filter = 'none') {
  const k = Math.max(W / img.width, H / img.height);
  const dw = img.width * k, dh = img.height * k;
  ctx.save();
  ctx.filter = filter;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  ctx.restore();
}

/** 사진 아래에 상사 배너(로고·상사명·차량·가격·연락처)를 그린다. */
export function drawBanner(ctx, W, H, { dealer, logo, vehicle, showPrice }) {
  const bh = Math.round(H * 0.105);
  const y = H - bh;
  const color = dealer.color || '#df5419';
  ctx.save();
  ctx.fillStyle = 'rgba(14,16,19,0.86)';
  ctx.fillRect(0, y, W, bh);
  ctx.fillStyle = color;
  ctx.fillRect(0, y, W, Math.max(3, bh * 0.06));
  const pad = bh * 0.32;
  let x = pad;
  const cy = y + bh * 0.54;
  ctx.textBaseline = 'middle';
  if (logo) {
    const lh = bh * 0.56, lw = lh * logo.width / logo.height;
    ctx.drawImage(logo, x, cy - lh / 2, lw, lh);
    x += lw + pad * 0.6;
  }
  const name = dealer.name || '';
  if (name) {
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${bh * 0.34}px ${FONT}`;
    ctx.fillText(name, x, cy);
    x += ctx.measureText(name).width + pad;
  }
  // 오른쪽: 연락처와 가격
  let rx = W - pad;
  ctx.textAlign = 'right';
  if (dealer.phone) {
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${bh * 0.32}px ${FONT}`;
    ctx.fillText(dealer.phone, rx, cy);
    rx -= ctx.measureText(dealer.phone).width + pad;
  }
  if (showPrice && vehicle.price) {
    const price = fmt.price(vehicle.price);
    ctx.font = `800 ${bh * 0.3}px ${FONT}`;
    const pw = ctx.measureText(price).width + bh * 0.4, ph = bh * 0.5;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.roundRect(rx - pw, cy - ph / 2, pw, ph, ph / 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(price, rx - pw / 2, cy + 1);
    rx -= pw + pad;
  }
  // 가운데 남는 자리에 차량명
  const title = fmt.title(vehicle);
  const room = rx - x;
  if (room > bh * 2) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    let fs = bh * 0.26;
    ctx.font = `600 ${fs}px ${FONT}`;
    while (ctx.measureText(title).width > room && fs > bh * 0.16) { fs -= 1; ctx.font = `600 ${fs}px ${FONT}`; }
    if (ctx.measureText(title).width <= room) ctx.fillText(title, x, cy);
  }
  ctx.restore();
}
