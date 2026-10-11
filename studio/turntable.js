// 턴테이블 영상: 배경을 지운 외관 사진들을 쇼룸 회전 무대 위에 세우고, 무대가 도는 동안 각도별 사진으로 이어 바꾼다.
// createScene과 같은 모양({ W, H, duration, draw })이라 미리보기·녹화·슬라이드를 그대로 쓴다.
import { canvas, drawBrandStudio, drawShadow, drawReflection } from '../bg-remover/compose.js';
import { FORMATS, fmt } from './render.js';

const BODY_FONT = '"IBM Plex Sans KR", "Gothic A1", "Malgun Gothic", sans-serif';
const TITLE_FONT = '"Gothic A1", "IBM Plex Sans KR", sans-serif';
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fitFont(ctx, text, maxW, size, weight, family) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > size * 0.45) { s -= 2; ctx.font = `${weight} ${s}px ${family}`; }
  return s;
}

/** 턴테이블에 쓸 수 있는 사진인지: 배경을 지웠고 실내가 아닌 사진 */
export const isSpinPhoto = (p) => !!p.maskBlob && !p.keepBg;

/**
 * @param {object} o
 * @param {{cut, mask, w, h, bbox}[]} o.items 각도 순서대로 잘라낸 차량
 * @param {object} o.theme 쇼룸 테마, o.sign 간판 { name, sub, logo }
 */
export function createTurntableScene(o) {
  const { items, theme, sign, vehicle: v, dealer, format } = o;
  const { w: W, h: H } = FORMATS[format];
  const D = o.duration;
  const vertical = H > W;
  const u = Math.min(W, H) / 100;
  const accent = dealer.color || '#df5419';
  const dark = !!theme.signDark;
  const showPrice = o.showPrice !== false;
  const introD = 1.1, outroD = Math.min(2.8, D * 0.2);
  const spinStart = 0.3, spinEnd = D - outroD;

  // 무대와 차 크기: 모든 사진의 차가 같은 높이로 보이게 너비·높이 한도 중 작은 쪽을 쓴다
  const bg3d = o.bg3d || null;
  const floorY = bg3d ? bg3d.floorY : H * (vertical ? 0.66 : 0.74);
  const maxW = bg3d ? bg3d.carW : W * (vertical ? 0.9 : 0.6);
  const maxH = maxW * 0.44;
  const pod = bg3d?.podium;
  const rx = pod ? pod.rx : maxW * 0.6, ry = pod ? pod.ry : rx * 0.17;
  const cx = W / 2, cy = pod ? pod.cy : floorY - ry * 0.25;
  const horizon = Math.max(H * 0.3, floorY - maxH * 0.62);

  // 배경(벽·바닥·간판)은 한 번만 그린다
  const bg = canvas(W, H);
  if (bg3d) bg.getContext('2d').drawImage(bg3d.canvas, 0, 0);
  else drawBrandStudio(bg.getContext('2d'), W, H, horizon, theme, sign);

  // 사진마다 차·그림자·반사를 미리 그린 층
  const layers = items.map((item) => {
    const b = item.bbox;
    const scale = Math.min(maxW / b.w, maxH / b.h);
    const carH = b.h * scale;
    const dx = cx - (b.x + b.w / 2) * scale;
    const dy = floorY - (b.y + b.h) * scale;
    const c = canvas(W, H);
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    drawReflection(x, item, scale, dx, dy, carH);
    drawShadow(x, item, scale, dx, dy, carH, 0.75);
    x.drawImage(item.cut, dx, dy, item.w * scale, item.h * scale);
    return c;
  });
  const N = layers.length;

  function drawDisk(ctx, rot) {
    const thick = ry * 0.22;
    ctx.save();
    if (pod) { drawGrooves(ctx, rot); ctx.restore(); return; }
    // 바닥 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.filter = `blur(${ry * 0.25}px)`;
    ctx.beginPath(); ctx.ellipse(cx, cy + thick * 1.4, rx * 1.02, ry * 1.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.filter = 'none';
    // 옆면(두께)
    ctx.fillStyle = dark ? '#0b0c0e' : '#9ea3a9';
    ctx.beginPath(); ctx.ellipse(cx, cy + thick, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(cx - rx, cy, rx * 2, thick);
    // 윗면
    const g = ctx.createRadialGradient(cx, cy - ry * 0.3, rx * 0.05, cx, cy, rx);
    g.addColorStop(0, dark ? '#3a3e44' : '#f2f3f5');
    g.addColorStop(1, dark ? '#16181b' : '#c9cdd2');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    drawGrooves(ctx, rot);
    ctx.restore();
  }

  // 도는 홈과 테두리 위를 도는 빛(3D 무대 위에도 겹쳐 그린다)
  function drawGrooves(ctx, rot) {
    ctx.save();
    // 도는 홈: 앞쪽(아래)이 더 잘 보인다
    ctx.lineWidth = Math.max(1, u * 0.18);
    for (let k = 0; k < 36; k++) {
      const a = rot + (k / 36) * Math.PI * 2;
      const s = Math.sin(a);
      ctx.strokeStyle = dark ? `rgba(255,255,255,${0.04 + 0.08 * Math.max(0, s)})` : `rgba(40,46,54,${0.05 + 0.1 * Math.max(0, s)})`;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * rx * 0.3, cy + s * ry * 0.3);
      ctx.lineTo(cx + Math.cos(a) * rx * 0.94, cy + s * ry * 0.94);
      ctx.stroke();
    }
    // 테두리 LED
    ctx.shadowColor = accent; ctx.shadowBlur = u * 2.2;
    ctx.strokeStyle = accent; ctx.lineWidth = Math.max(2, u * 0.45);
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.985, ry * 0.985, 0, 0, Math.PI * 2); ctx.stroke();
    // 테두리 위를 도는 빛 한 점
    const la = rot * 1.0 + Math.PI / 2;
    ctx.shadowColor = '#fff'; ctx.shadowBlur = u * 3;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(la) * rx * 0.985, cy + Math.sin(la) * ry * 0.985, u * 0.9, u * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawCar(ctx, idx, sx, alpha, offX) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx + offX, floorY);
    ctx.scale(sx, 1);
    ctx.translate(-cx, -floorY);
    ctx.drawImage(layers[idx], 0, 0);
    ctx.restore();
  }

  function drawInfo(ctx, a) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const ink = dark ? '#ffffff' : '#15181c';
    const sub = dark ? 'rgba(255,255,255,0.72)' : 'rgba(21,24,28,0.66)';
    const top = cy + ry + (vertical ? H * 0.06 : H * 0.07);
    ctx.fillStyle = ink;
    const ts = fitFont(ctx, fmt.title(v), W * 0.86, u * (vertical ? 6.2 : 5), 800, TITLE_FONT);
    ctx.fillText(fmt.title(v), cx, top + ts * 0.4);
    const line = [v.year, fmt.km(v.mileage), v.fuel].filter(Boolean).join(' · ');
    if (line) {
      ctx.fillStyle = sub;
      ctx.font = `600 ${u * 3.2}px ${BODY_FONT}`;
      ctx.fillText(line, cx, top + ts * 0.4 + u * 6);
    }
    if (showPrice) {
      const price = fmt.price(v.price);
      ctx.font = `800 ${u * 4.4}px ${BODY_FONT}`;
      const pw = ctx.measureText(price).width + u * 6, ph = u * 7.6;
      const py = top + ts * 0.4 + (line ? u * 10 : u * 4);
      ctx.fillStyle = accent;
      rr(ctx, cx - pw / 2, py, pw, ph, ph / 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(price, cx, py + ph / 2 + 1);
    }
    ctx.restore();
  }

  function drawOutro(ctx, p) {
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p * 1.4) * 0.82;
    ctx.fillStyle = dark ? '#000' : '#f4f5f7';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = Math.min(1, p * 1.6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ink = dark ? '#fff' : '#15181c';
    let y = H * 0.42;
    if (dealer.name) {
      ctx.fillStyle = ink;
      fitFont(ctx, dealer.name, W * 0.8, u * 7, 800, TITLE_FONT);
      ctx.fillText(dealer.name, cx, y);
      y += u * 9;
    }
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.75)' : 'rgba(21,24,28,0.7)';
    fitFont(ctx, fmt.title(v), W * 0.8, u * 3.6, 600, BODY_FONT);
    ctx.fillText(fmt.title(v), cx, y);
    y += u * 9;
    const cta = (dealer.cta || '지금 바로 문의하세요').trim();
    ctx.font = `800 ${u * 4}px ${BODY_FONT}`;
    const bw = Math.min(W * 0.8, ctx.measureText(cta).width + u * 12), bh = u * 9;
    ctx.fillStyle = accent;
    rr(ctx, cx - bw / 2, y, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(cta, cx, y + bh / 2 + 1);
    if (dealer.phone) {
      ctx.fillStyle = ink;
      ctx.font = `800 ${u * 5}px ${BODY_FONT}`;
      ctx.fillText(dealer.phone, cx, y + bh + u * 8);
    }
    ctx.restore();
  }

  /** 시간 t의 회전 상태: 지금 사진, 다음 사진, 넘어가는 정도 */
  function spinState(t) {
    const span = Math.max(0.5, spinEnd - spinStart);
    const ph = Math.max(0, Math.min(0.9999, (t - spinStart) / span)) * N;
    const i = Math.floor(ph), f = ph - i;
    return { i: i % N, j: (i + 1) % N, e: N > 1 ? ease((f - 0.6) / 0.4) : 0, rot: (t / span) * Math.PI * 2 * (N > 1 ? 1 : 0.6) };
  }

  return {
    W, H, duration: D, template: 'turntable',
    spinRange: [spinStart, spinEnd],
    draw(ctx, t) {
      ctx.save();
      ctx.drawImage(bg, 0, 0);
      // 천천히 다가가는 카메라
      const z = 1 + 0.035 * Math.min(1, t / D);
      ctx.translate(cx, floorY); ctx.scale(z, z); ctx.translate(-cx, -floorY);
      const s = spinState(t);
      drawDisk(ctx, s.rot);
      if (N) {
        const push = W * 0.035;
        drawCar(ctx, s.i, 1 - 0.16 * s.e, 1 - s.e, -push * s.e);
        if (s.e > 0) drawCar(ctx, s.j, 0.84 + 0.16 * s.e, s.e, push * (1 - s.e));
      }
      ctx.restore();
      drawInfo(ctx, ease((t - 0.2) / 0.8) * (1 - ease((t - (D - outroD)) / 0.5)));
      // 시작은 어둠에서 밝아진다
      if (t < introD * 0.5) { ctx.fillStyle = `rgba(0,0,0,${1 - t / (introD * 0.5)})`; ctx.fillRect(0, 0, W, H); }
      drawOutro(ctx, (t - (D - outroD)) / 0.8);
    },
  };
}
