// 핫스팟: 사진 위에 찍은 특징(옵션·장점)과 흠집(스크래치·찍힘) 표시.
// 위치는 원본 사진에 대한 비율(x, y)이고, 쇼룸 합성 사진이면 합성할 때의 배치(xf)로 옮겨 그린다.

export const SPOT_KINDS = {
  feature: { label: '특징', color: '#1f8fff', hint: '옵션·장점' },
  damage: { label: '흠집', color: '#f5a524', hint: '스크래치·찍힘' },
};
const FONT = '"IBM Plex Sans KR", "Gothic A1", "Malgun Gothic", sans-serif';

/** 원본 비율 좌표를 이미지(합성 사진이면 합성 캔버스) 픽셀로 */
export function spotToImage(img, s) {
  const xf = img.xf;
  if (!xf) return [s.x * img.width, s.y * img.height];
  return [xf.dx + s.x * xf.sw * xf.scale, xf.dy + s.y * xf.sh * xf.scale];
}

/**
 * 핫스팟 하나를 그린다. (x, y)는 화면 좌표, u는 화면 짧은 변의 1%, p는 나타나는 정도(0~1), t는 깜빡임용 시간.
 * side: 라벨을 오른쪽(1)·왼쪽(-1) 어느 쪽에 둘지
 */
export function drawSpot(ctx, x, y, spot, u, { p = 1, t = 0, side = 1, W = Infinity } = {}) {
  if (p <= 0) return;
  const color = (SPOT_KINDS[spot.kind] || SPOT_KINDS.feature).color;
  ctx.save();
  ctx.globalAlpha = Math.min(1, p * 1.5);
  // 퍼지는 고리
  const pulse = (t * 1.2) % 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = u * 0.5;
  ctx.globalAlpha *= 1 - pulse;
  ctx.beginPath(); ctx.arc(x, y, u * (1.4 + pulse * 2.6), 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = Math.min(1, p * 1.5);
  // 점
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x, y, u * 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, u * 1.05, 0, Math.PI * 2); ctx.fill();
  const title = (spot.title || '').trim();
  if (title) {
    const e = Math.min(1, Math.max(0, (p - 0.2) / 0.8));
    const fs = u * 2.9;
    ctx.font = `700 ${fs}px ${FONT}`;
    const tw = Math.min(ctx.measureText(title).width, u * 48);
    const bw = tw + u * 3.2, bh = fs * 1.75;
    let s = side;
    let lx = x + s * u * 6;
    if (s > 0 && lx + bw > W - u * 2) s = -1;
    if (s < 0 && x - u * 6 - bw < u * 2) s = 1;
    lx = s > 0 ? x + u * 6 : x - u * 6 - bw;
    const ly = y - u * 7 - bh / 2;
    // 이음선
    ctx.globalAlpha = e;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = u * 0.35;
    ctx.beginPath(); ctx.moveTo(x + s * u * 1.5, y - u * 1.2); ctx.lineTo(s > 0 ? lx : lx + bw, ly + bh / 2); ctx.stroke();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = u * 1.5;
    ctx.fillStyle = 'rgba(16,18,22,0.86)';
    ctx.beginPath(); ctx.roundRect(lx, ly, bw, bh, bh / 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(lx + u * 1.6, ly + bh / 2, u * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(title, lx + u * 2.6, ly + bh / 2 + 1, tw);
  }
  ctx.restore();
}
