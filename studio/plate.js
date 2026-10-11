// 번호판 가리기: 사진에서 번호판 위치를 찾고, 상사 번호판이나 모자이크로 덮는다.
// 위치는 사진 크기에 대한 비율로 된 네 꼭짓점(왼위·오른위·오른아래·왼아래)으로 저장한다.

export const PLATE_MODES = {
  off: { label: '가리지 않음' },
  dealer: { label: '상사 번호판' },
  blur: { label: '모자이크' },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let worker = null;
const pending = new Map();
let nextId = 1;
let onModelProgress = null;

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./plate-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') onModelProgress?.(data.loaded / data.total);
    else if (data.type === 'boxes' || data.type === 'run-error') {
      pending.get(data.id)?.(data);
      pending.delete(data.id);
    } else if (data.type === 'load-error') {
      for (const [id, done] of pending) done({ type: 'run-error', id, message: data.message });
      pending.clear();
    }
  };
  return worker;
}

/** 사진 Blob에서 번호판을 찾는다. 찾으면 네 꼭짓점(0~1 비율), 못 찾으면 null.
 *  계기판 숫자 같은 것을 번호판으로 잘못 잡지 않게 확신이 높은 것만 쓴다. */
export async function detectPlate(blob, { onProgress } = {}) {
  onModelProgress = onProgress;
  const id = nextId++;
  const res = await new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage({ type: 'run', id, blob });
  });
  if (res.type !== 'boxes') throw new Error(res.message || '번호판을 찾지 못했어요');
  const best = res.boxes.filter((b) => b.score >= 0.9).sort((a, b) => b.score - a.score)[0];
  if (!best) return null;
  // 모델 상자는 글자에 딱 맞는 편이라 테두리까지 조금 넓힌다
  const w = best.xmax - best.xmin, h = best.ymax - best.ymin;
  const x0 = clamp(best.xmin - w * 0.04, 0, 1), x1 = clamp(best.xmax + w * 0.04, 0, 1);
  const y0 = clamp(best.ymin - h * 0.12, 0, 1), y1 = clamp(best.ymax + h * 0.12, 0, 1);
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

/** 찾지 못했을 때 손으로 맞출 시작 위치(아래 가운데). */
export function defaultQuad() {
  return [[0.42, 0.66], [0.58, 0.66], [0.58, 0.71], [0.42, 0.71]];
}

const quadPath = (ctx, pts) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
};

/** 상사 번호판 그림(가로 520 : 세로 110 비율). */
export function dealerPlateCanvas(dealer, scale = 4) {
  const W = 520 * scale / 2, H = 110 * scale / 2;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const color = dealer.color || '#1f2a37';
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, H * 0.1); ctx.fill();
  ctx.lineWidth = H * 0.06; ctx.strokeStyle = '#1b1f24';
  ctx.beginPath(); ctx.roundRect(H * 0.05, H * 0.05, W - H * 0.1, H - H * 0.1, H * 0.08); ctx.stroke();
  // 왼쪽 상사 색 띠
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(H * 0.12, H * 0.14, H * 0.32, H * 0.72, H * 0.05); ctx.fill();
  const name = (dealer.name || '').trim() || '판매 중';
  const phone = (dealer.phone || '').trim();
  const font = '"Gothic A1", "IBM Plex Sans KR", sans-serif';
  const left = H * 0.6, maxW = W - left - H * 0.2;
  ctx.fillStyle = '#14181d';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const cx = left + maxW / 2;
  let fs = H * (phone ? 0.46 : 0.62);
  ctx.font = `800 ${fs}px ${font}`;
  const nw = ctx.measureText(name).width;
  if (nw > maxW) { fs *= maxW / nw; ctx.font = `800 ${fs}px ${font}`; }
  ctx.fillText(name, cx, phone ? H * 0.38 : H * 0.53);
  if (phone) {
    let ps = H * 0.24;
    ctx.font = `700 ${ps}px ${font}`;
    const pw = ctx.measureText(phone).width;
    if (pw > maxW) { ps *= maxW / pw; ctx.font = `700 ${ps}px ${font}`; }
    ctx.fillStyle = '#3a4250';
    ctx.fillText(phone, cx, H * 0.75);
  }
  return c;
}

/** 사진에 번호판 가리기를 적용한 캔버스를 돌려준다. quad는 비율 좌표. */
export function applyPlate(img, quad, mode, dealer, plateArt = null) {
  const W = img.width, H = img.height;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d');
  ctx.drawImage(img, 0, 0);
  if (!quad || mode === 'off') return out;
  const pts = quad.map(([x, y]) => [x * W, y * H]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const bx = Math.min(...xs), by = Math.min(...ys), bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
  if (bw < 2 || bh < 2) return out;
  if (mode === 'blur') {
    // 큰 모자이크 칸으로 글자를 알아볼 수 없게 한다
    const cell = Math.max(4, bh / 3);
    const sw = Math.max(1, Math.round(bw / cell)), sh = Math.max(1, Math.round(bh / cell));
    const small = document.createElement('canvas');
    small.width = sw; small.height = sh;
    small.getContext('2d').drawImage(img, bx, by, bw, bh, 0, 0, sw, sh);
    ctx.save();
    quadPath(ctx, pts);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, sw, sh, bx, by, bw, bh);
    ctx.restore();
    return out;
  }
  // 상사 번호판: 위·아래 변을 따라 세로 띠로 나눠 그려 사선으로 찍힌 번호판에도 맞춘다
  const art = plateArt || dealerPlateCanvas(dealer);
  const [tl, tr, br, bl] = pts;
  const strips = Math.max(8, Math.round(bw / 3));
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = bh * 0.15;
  quadPath(ctx, pts); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.restore();
  for (let i = 0; i < strips; i++) {
    const u0 = i / strips, u1 = (i + 1) / strips;
    const top0 = lerp2(tl, tr, u0), bot0 = lerp2(bl, br, u0);
    const top1 = lerp2(tl, tr, u1);
    const x = top0[0], y = top0[1], sw = top1[0] - top0[0] + 0.6, sh = bot0[1] - top0[1];
    if (sh <= 0) continue;
    ctx.drawImage(art, u0 * art.width, 0, (u1 - u0) * art.width, art.height, x, y, sw, sh);
  }
  return out;
}

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
