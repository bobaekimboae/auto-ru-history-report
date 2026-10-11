// 상사 쇼룸 합성: 배경지우개의 AI 워커와 합성 도구를 그대로 써서, 차량을 가상 쇼룸에 세운 사진을 영상 비율로 만든다.
import {
  canvas, maskCanvas, findBBox, drawBrandStudio, drawShadow, drawReflection, SIGN_ZONE,
} from '../bg-remover/compose.js';

let worker = null;
const pending = new Map();
let nextId = 1;
let onModelProgress = null;

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('../bg-remover/worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') onModelProgress?.(data.loaded / data.total);
    else if (data.type === 'mask' || data.type === 'run-error') {
      pending.get(data.id)?.(data);
      pending.delete(data.id);
    } else if (data.type === 'load-error') {
      for (const [id, done] of pending) done({ type: 'run-error', id, message: data.message });
      pending.clear();
    }
  };
  return worker;
}

/** 사진 Blob의 배경을 지운 알파 마스크(PNG Blob)를 만든다. */
export async function makeMask(blob, w, h, { onProgress } = {}) {
  onModelProgress = onProgress;
  const id = nextId++;
  const res = await new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage({ type: 'run', id, blob });
  });
  if (res.type !== 'mask') throw new Error(res.message || '배경을 지우지 못했어요');
  const m = maskCanvas(res, w, h);
  return new Promise((r) => m.toBlob(r, 'image/png'));
}

/** 저장된 마스크 PNG와 원본으로 잘라낸 차량 객체를 만든다. */
export async function loadCutout(photoBitmap, maskBlob) {
  const w = photoBitmap.width, h = photoBitmap.height;
  const mask = canvas(w, h);
  const mb = await createImageBitmap(maskBlob);
  mask.getContext('2d').drawImage(mb, 0, 0, w, h);
  mb.close();
  const cut = canvas(w, h);
  const c = cut.getContext('2d');
  c.drawImage(photoBitmap, 0, 0);
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(mask, 0, 0);
  return { w, h, mask, cut, bbox: findBBox(mask) };
}

/** 영상 한 장면 크기(W×H)의 쇼룸 사진을 그린다. sign: { name, sub, logo } */
export function composeShowroom(item, W, H, dark, sign) {
  const out = canvas(W, H);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const vertical = H > W;
  const b = item.bbox;
  // 가로·정사각은 아래쪽에 글자 자리를 남기려고 차를 조금 작게, 바닥을 조금 높게 둔다
  const floorY = H * (vertical ? 0.72 : 0.8);
  let scale = (W * (vertical ? 0.94 : 0.72)) / b.w;
  scale = Math.min(scale, (H * 0.7) / b.h, (floorY - H * SIGN_ZONE) / b.h);
  const carH = b.h * scale;
  const dx = W / 2 - (b.x + b.w / 2) * scale;
  const dy = floorY - (b.y + b.h) * scale;
  const horizon = Math.max(H * 0.25, floorY - carH * 0.32);
  drawBrandStudio(ctx, W, H, horizon, dark, sign);
  drawReflection(ctx, item, scale, dx, dy, carH);
  drawShadow(ctx, item, scale, dx, dy, carH, 0.6);
  ctx.drawImage(item.cut, dx, dy, item.w * scale, item.h * scale);
  return out;
}
