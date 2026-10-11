// 매물사진 배경지우개: 사진 목록 관리, 합성(배경·그림자·반사·상사 정보), 다듬기 붓, 저장.
import {
  canvas, maskCanvas, findBBox, vgrad, drawBrandStudio, lowerContour, drawShadow, drawReflection, roundRect, SIGN_ZONE, SIGN_FONT,
} from './compose.js';

const $ = (id) => document.getElementById(id);

// 휴대폰·태블릿은 메모리가 작아(아이폰 사파리는 캔버스 메모리를 넘기면 페이지가 꺼진다)
// 사진을 더 작게 다루고, 화면에 없는 사진은 압축해 두었다가 볼 때 다시 푼다.
const MOBILE = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const MAX_SIDE = MOBILE ? 1600 : 2560;   // 원본은 긴 변 기준 이 크기로 줄여서 다룬다
const LIVE_MAX = MOBILE ? 2 : 6;         // 풀어 둔 채로 둘 사진 수
const UNDO_MAX = MOBILE ? 4 : 15;
const OUTPUT = { '4:3': [1600, 1200], '1:1': [1200, 1200], '16:9': [1600, 900] };
const STORE_KEY = 'bgr-settings-v1';

const DEFAULTS = {
  bg: 'studio', bgColor: '#dfe6ee', shadow: 60, reflection: false,
  ratio: '4:3', carSize: 84, floorPos: 86,
  wmOn: false, wmName: '', wmPhone: '', wmLogo: '', wmStyle: 'band', signSub: '',
  prefix: '', format: 'jpg',
};

const state = {
  items: [],
  current: -1,
  settings: { ...DEFAULTS, ...loadSettings() },
  bgImage: null,
  logoImage: null,
  tool: null,            // 'erase' | 'restore' | null
  comparing: false,
  engine: 'idle',
  busy: false,
};

let nextId = 1;

// ---------- 저장된 설정 ----------
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function saveSettings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.settings)); } catch { /* 저장 불가 환경 */ }
}

// ---------- AI 워커 ----------
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
worker.postMessage({ type: 'config', mobile: MOBILE });
const pending = new Map();

worker.onmessage = ({ data }) => {
  if (data.type === 'progress') {
    setEngine('loading', `AI 준비 중 ${Math.round((data.loaded / data.total) * 100)}%`, data.loaded / data.total);
  } else if (data.type === 'ready') {
    setEngine('ready', data.device === 'webgpu' ? 'AI 준비 완료 · 그래픽카드 가속' : 'AI 준비 완료');
  } else if (data.type === 'load-error') {
    setEngine('error', 'AI를 불러오지 못했어요');
    toast('AI 모델을 내려받지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.');
  } else if (data.type === 'mask' || data.type === 'run-error') {
    const done = pending.get(data.id);
    pending.delete(data.id);
    done?.(data);
  }
};

function setEngine(s, text, ratio) {
  state.engine = s;
  $('engine').dataset.state = s;
  $('engineText').textContent = text;
  if (ratio != null) $('engineBar').style.width = `${Math.round(ratio * 100)}%`;
}

function segment(item) {
  return new Promise((resolve) => {
    pending.set(item.id, resolve);
    worker.postMessage({ type: 'run', id: item.id, blob: item.blob });
  });
}

// ---------- 사진 추가 ----------
async function addFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('image/'));
  if (!files.length) { toast('이미지 파일만 올릴 수 있어요.'); return; }
  if (state.engine === 'idle') { setEngine('loading', 'AI 준비 중', 0); worker.postMessage({ type: 'load' }); }
  const wasEmpty = !state.items.length;
  for (const file of files) {
    try {
      state.items.push(await makeItem(file));
    } catch {
      toast(`${file.name} 파일을 열 수 없어요. JPG나 PNG로 바꿔서 올려 주세요.`);
    }
    renderQueue();
    if (wasEmpty && state.current < 0 && state.items.length) select(0);
  }
  runQueue();
}

async function makeItem(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const src = canvas(w, h);
  src.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise((r) => src.toBlob(r, 'image/jpeg', 0.95));
  const thumb = canvas(160, Math.round(160 * h / w));
  thumb.getContext('2d').drawImage(src, 0, 0, thumb.width, thumb.height);
  freeCanvas(src);   // 원본은 압축본(blob)으로만 들고 있다가 볼 때 푼다
  return {
    id: nextId++, name: file.name, src: null, w, h, blob,
    thumbUrl: thumb.toDataURL('image/jpeg', 0.8),
    status: 'queued', keep: false, mask: null, maskBlob: null, aiRes: null, cut: null, bbox: null, undo: [], xf: null,
  };
}

async function runQueue() {
  if (state.busy) return;
  state.busy = true;
  for (;;) {
    const item = state.items.find((it) => it.status === 'queued' && !it.keep);
    if (!item) break;
    item.status = 'working';
    renderQueue(); updateStage();
    const res = await segment(item);
    if (!state.items.includes(item)) continue;      // 처리 중에 삭제됨
    if (res.type === 'mask') {
      item.aiRes = { width: res.width, height: res.height, mask: res.mask };   // AI 원본 결과(작음). "AI 결과로"에 쓴다
      if (!item.src) item.src = await decodeCanvas(item.blob);
      item.mask = maskCanvas(item.aiRes, item.w, item.h);
      rebuildCut(item);
      item.status = 'done';
      touch(item);
    } else {
      item.status = 'error';
      item.error = res.message;
    }
    renderQueue();
    if (item === currentItem()) updateStage();
  }
  state.busy = false;
}

// ---------- 메모리 관리 ----------
const live = [];
async function decodeCanvas(blob) {
  const bmp = await createImageBitmap(blob);
  const c = canvas(bmp.width, bmp.height);
  c.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close();
  return c;
}
function freeCanvas(c) { if (c) { c.width = 0; c.height = 0; } }
/** 최근에 본 사진만 풀어 두고 나머지는 압축해 둔다 */
function touch(item) {
  const i = live.indexOf(item);
  if (i >= 0) live.splice(i, 1);
  live.push(item);
  while (live.length > LIVE_MAX) {
    const old = live.find((x) => x !== currentItem() && x.status !== 'working');
    if (!old) break;
    live.splice(live.indexOf(old), 1);
    hibernate(old);
  }
}
async function hibernate(item) {
  const m = item.mask;
  if (m) {
    const blob = await new Promise((r) => m.toBlob(r, 'image/png'));
    if (item.mask !== m || live.includes(item)) return;   // 그 사이에 다시 열었으면 그대로 둔다
    item.maskBlob = blob; item.mask = null; freeCanvas(m);
  }
  if (live.includes(item)) return;
  freeCanvas(item.src); item.src = null;
  freeCanvas(item.cut); item.cut = null;
  item.undo.forEach(freeCanvas); item.undo = [];
}
const needsWake = (item) => !item.src || (!item.mask && item.maskBlob);
async function wake(item) {
  if (!item.src) item.src = await decodeCanvas(item.blob);
  if (!item.mask && item.maskBlob) { item.mask = await decodeCanvas(item.maskBlob); item.maskBlob = null; }
  if (item.mask && !item.cut) rebuildCut(item);
  touch(item);
}

function rebuildCut(item) {
  const cut = item.cut || canvas(item.w, item.h);
  const ctx = cut.getContext('2d');
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(item.src, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(item.mask, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  item.cut = cut;
  item.bbox = findBBox(item.mask);
}

// ---------- 합성 ----------
function outputSize(item) {
  const r = state.settings.ratio;
  if (r === 'orig') return [item.w, item.h];
  return OUTPUT[r];
}

function render(item, target, { compare = false } = {}) {
  const [W, H] = outputSize(item);
  if (target.width !== W || target.height !== H) { target.width = W; target.height = H; }
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';

  if (!item.src) return;   // 아직 풀지 않은 사진
  if (item.mask && !item.cut) rebuildCut(item);
  if (compare || item.keep || !item.cut) {
    drawCover(ctx, item.src, W, H);
    item.xf = null;
    if (!compare && (item.keep || item.status === 'done')) drawWatermark(ctx, W, H);
    return;
  }

  const s = state.settings;
  const b = item.bbox;
  let scale = (W * s.carSize / 100) / b.w;
  scale = Math.min(scale, (H * 0.7) / b.h);
  const floorY = H * s.floorPos / 100;
  // 상사 쇼룸 간판 자리(위쪽 30%)는 비워 두어 사진마다 간판 크기가 같게 한다
  if (s.bg.startsWith('brand') && (s.wmName.trim() || state.logoImage)) scale = Math.min(scale, (floorY - H * SIGN_ZONE) / b.h);
  const carH = b.h * scale;
  const dx = W / 2 - (b.x + b.w / 2) * scale;
  const dy = floorY - (b.y + b.h) * scale;
  item.xf = { scale, dx, dy };
  const horizon = Math.max(H * 0.25, floorY - carH * 0.32);

  drawBackground(ctx, W, H, horizon);
  if (s.bg !== 'transparent' && s.reflection) drawReflection(ctx, item, scale, dx, dy, carH);
  if (s.shadow > 0) drawShadow(ctx, item, scale, dx, dy, carH, s.shadow / 100);
  ctx.drawImage(item.cut, dx, dy, item.w * scale, item.h * scale);
  drawWatermark(ctx, W, H);
}

function drawCover(ctx, img, W, H) {
  const iw = img.width, ih = img.height;
  const k = Math.max(W / iw, H / ih);
  const w = iw * k, h = ih * k;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

function drawBackground(ctx, W, H, horizon) {
  const s = state.settings;
  const room = (wall, floor, light) => {
    ctx.fillStyle = vgrad(ctx, 0, horizon, wall);
    ctx.fillRect(0, 0, W, horizon);
    ctx.fillStyle = vgrad(ctx, horizon, H, floor);
    ctx.fillRect(0, horizon, W, H - horizon);
    // 벽과 바닥이 만나는 선을 부드럽게
    const band = H * 0.035;
    const g = ctx.createLinearGradient(0, horizon - band, 0, horizon + band);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, light.seam);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon - band, W, band * 2);
    if (light.spot) {
      const r = ctx.createRadialGradient(W / 2, horizon, 0, W / 2, horizon, W * 0.62);
      r.addColorStop(0, light.spot);
      r.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, W, H);
    }
  };
  switch (s.bg) {
    case 'studio':
      room(['#ffffff', '#f1f3f5'], ['#e9ecef', '#f8f9fa'], { seam: 'rgba(120,128,138,0.10)', spot: 'rgba(255,255,255,0.55)' });
      break;
    case 'gray':
      room(['#cfd3d8', '#b9bec4'], ['#aeb3b9', '#dcdfe2'], { seam: 'rgba(40,46,54,0.12)', spot: 'rgba(255,255,255,0.32)' });
      break;
    case 'dark':
      room(['#2a2e33', '#191b1e'], ['#34383e', '#0e1012'], { seam: 'rgba(0,0,0,0.35)', spot: 'rgba(255,255,255,0.10)' });
      break;
    case 'white':
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      break;
    case 'color':
      ctx.fillStyle = s.bgColor; ctx.fillRect(0, 0, W, H);
      break;
    case 'brand-light':
    case 'brand-dark':
      drawBrandStudio(ctx, W, H, horizon, s.bg === 'brand-dark', { name: s.wmName, sub: s.signSub, logo: state.logoImage });
      break;
    case 'image':
      if (state.bgImage) drawCover(ctx, state.bgImage, W, H);
      else { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); }
      break;
    default: // transparent
      break;
  }
}


function drawWatermark(ctx, W, H) {
  const s = state.settings;
  if (!s.wmOn || (!s.wmName && !s.wmPhone && !state.logoImage)) return;
  const base = Math.min(W, H * 4 / 3);
  const font = (weight, px) => `${weight} ${px}px "IBM Plex Sans KR", "Malgun Gothic", sans-serif`;
  const logo = state.logoImage;

  if (s.wmStyle === 'band') {
    const bh = Math.round(base * 0.062);
    const y = H - bh;
    ctx.fillStyle = 'rgba(14,16,19,0.78)';
    ctx.fillRect(0, y, W, bh);
    const pad = bh * 0.45;
    let x = pad;
    if (logo) {
      const lh = bh * 0.62, lw = lh * logo.width / logo.height;
      ctx.drawImage(logo, x, y + (bh - lh) / 2, lw, lh);
      x += lw + pad * 0.6;
    }
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    if (s.wmName) { ctx.font = font(700, bh * 0.42); ctx.textAlign = 'left'; ctx.fillText(s.wmName, x, y + bh / 2); }
    if (s.wmPhone) { ctx.font = font(700, bh * 0.42); ctx.textAlign = 'right'; ctx.fillText(s.wmPhone, W - pad, y + bh / 2); }
    ctx.textAlign = 'left';
    return;
  }

  // 오른쪽 아래 라벨
  const fs = base * 0.026;
  const pad = fs * 0.7;
  const lines = [s.wmName && { t: s.wmName, f: font(700, fs) }, s.wmPhone && { t: s.wmPhone, f: font(600, fs * 0.86) }].filter(Boolean);
  let tw = 0;
  for (const l of lines) { ctx.font = l.f; tw = Math.max(tw, ctx.measureText(l.t).width); }
  const lh = logo ? fs * 1.9 : 0;
  const lw = logo ? lh * logo.width / logo.height : 0;
  const boxW = pad * 2 + lw + (lw && tw ? pad * 0.8 : 0) + tw;
  const boxH = pad * 2 + Math.max(lh, lines.length * fs * 1.25);
  const bx = W - boxW - base * 0.025, by = H - boxH - base * 0.025;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  roundRect(ctx, bx, by, boxW, boxH, fs * 0.5);
  ctx.fill();
  if (logo) ctx.drawImage(logo, bx + pad, by + (boxH - lh) / 2, lw, lh);
  const tx = bx + pad + lw + (lw && tw ? pad * 0.8 : 0);
  let ty = by + (boxH - lines.length * fs * 1.25) / 2 + fs * 0.62;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#15181c';
  for (const l of lines) { ctx.font = l.f; ctx.fillText(l.t, tx, ty); ty += fs * 1.25; }
}

// ---------- 화면 갱신 ----------
const preview = $('preview');
let rafId = 0;

function currentItem() { return state.items[state.current] || null; }

function updateStage() {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(drawStage);
}

function drawStage() {
  const item = currentItem();
  const empty = !state.items.length;
  $('workspace').dataset.empty = String(empty);
  $('pagerText').textContent = `${empty ? 0 : state.current + 1} / ${state.items.length}`;
  $('prevBtn').disabled = state.current <= 0;
  $('nextBtn').disabled = state.current >= state.items.length - 1;
  updateSaveButtons();
  if (!item) return;
  if (needsWake(item)) {
    $('stageOverlay').hidden = false;
    $('stageOverlayText').textContent = '사진 불러오는 중';
    wake(item).then(updateStage);
    return;
  }
  touch(item);

  render(item, preview, { compare: state.comparing });

  const working = item.status === 'working' || (item.status === 'queued' && !item.keep);
  $('stageOverlay').hidden = !working;
  $('stageOverlayText').textContent = item.status === 'working' ? '배경을 지우는 중' : '순서를 기다리는 중';

  const note = $('stageNote');
  if (item.status === 'error') { note.hidden = false; note.textContent = '이 사진은 배경을 지우지 못했어요. 다른 사진으로 다시 올려 주세요.'; }
  else if (state.comparing) { note.hidden = false; note.textContent = '원본 사진'; }
  else if (state.settings.bg.startsWith('brand') && !state.settings.wmName.trim() && !state.logoImage) { note.hidden = false; note.textContent = '상사 정보에 상사명을 넣으면 벽에 간판이 들어가요'; }
  else if (item.keep) { note.hidden = false; note.textContent = '배경 유지: 비율과 상사 정보만 적용돼요'; }
  else if (state.settings.bg === 'transparent' && state.settings.format === 'jpg') { note.hidden = false; note.textContent = 'JPG는 투명 배경을 저장할 수 없어 흰색으로 저장돼요'; }
  else note.hidden = true;

  const editable = item.status === 'done' && !item.keep;
  for (const id of ['eraseBtn', 'restoreBtn', 'resetMaskBtn', 'compareBtn']) $(id).disabled = !editable && id !== 'compareBtn';
  $('undoBtn').disabled = !editable || !item.undo.length;
  $('keepOriginal').checked = item.keep;
  if (!editable && state.tool) setTool(null);
}

function renderQueue() {
  const list = $('queueList');
  const labels = { queued: '대기 중', working: '지우는 중', done: '완료', error: '실패', keep: '배경 유지' };
  list.replaceChildren(...state.items.map((it, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'q-item';
    btn.setAttribute('aria-current', String(i === state.current));
    btn.title = it.name;
    const s = it.keep ? 'keep' : it.status;
    btn.innerHTML = `<span class="q-thumb"><img alt=""><span class="q-index">${String(i + 1).padStart(2, '0')}</span></span>
      <span class="q-meta"><span class="q-name"></span><span class="chip" data-s="${s}">${labels[s]}</span></span>`;
    btn.querySelector('img').src = it.thumbUrl;
    btn.querySelector('.q-name').textContent = it.name;
    btn.addEventListener('click', () => select(i));
    li.append(btn);
    return li;
  }));
  $('queueCount').textContent = state.items.length;
  const remaining = state.items.filter((i) => !i.keep && (i.status === 'queued' || i.status === 'working')).length;
  $('queueProgress').textContent = remaining ? `${remaining}장 남음` : state.items.length ? '모두 끝남' : '';
  updateSaveButtons();
}

function updateSaveButtons() {
  const ready = readyItems();
  $('saveAllCount').textContent = ready.length ? `${ready.length}장` : '';
  $('saveAll').disabled = !ready.length;
  $('mSave').disabled = !ready.length;
  $('mSave').textContent = ready.length ? `${ready.length}장 저장` : '저장';
  const item = currentItem();
  $('saveOne').disabled = !item || !(item.keep || item.status === 'done');
  const prefix = cleanName(state.settings.prefix) || 'car';
  const ext = state.settings.format;
  $('namePreview').textContent = `${prefix}_01.${ext}, ${prefix}_02.${ext} …`;
}

function readyItems() { return state.items.filter((i) => i.keep || i.status === 'done'); }

function select(i) {
  if (i < 0 || i >= state.items.length) return;
  state.current = i;
  renderQueue();
  updateStage();
  document.querySelector('.q-item[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ---------- 다듬기 붓 ----------
function setTool(tool) {
  state.tool = state.tool === tool ? null : tool;
  $('eraseBtn').setAttribute('aria-pressed', String(state.tool === 'erase'));
  $('restoreBtn').setAttribute('aria-pressed', String(state.tool === 'restore'));
  preview.classList.toggle('brushing', !!state.tool);
  if (!state.tool) hideCursor();
}

const cursor = document.createElement('div');
cursor.style.cssText = 'position:fixed;pointer-events:none;border-radius:50%;border:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.6);z-index:5;display:none;transform:translate(-50%,-50%)';
document.body.append(cursor);
function hideCursor() { cursor.style.display = 'none'; }

function toSource(e) {
  const item = currentItem();
  const r = preview.getBoundingClientRect();
  const px = (e.clientX - r.left) * preview.width / r.width;
  const py = (e.clientY - r.top) * preview.height / r.height;
  const { scale, dx, dy } = item.xf;
  return { x: (px - dx) / scale, y: (py - dy) / scale, k: preview.width / r.width };
}

let stroke = null;
preview.addEventListener('pointerdown', (e) => {
  const item = currentItem();
  if (!state.tool || !item?.xf) return;
  preview.setPointerCapture(e.pointerId);
  item.undo.push(cloneCanvas(item.mask));
  if (item.undo.length > UNDO_MAX) freeCanvas(item.undo.shift());
  stroke = { last: toSource(e) };
  paint(item, stroke.last, stroke.last);
});
preview.addEventListener('pointermove', (e) => {
  if (state.tool) {
    const r = preview.getBoundingClientRect();
    const size = $('brushSize').value * r.width / preview.width * 1.6;
    Object.assign(cursor.style, { display: 'block', left: `${e.clientX}px`, top: `${e.clientY}px`, width: `${size}px`, height: `${size}px` });
  }
  if (!stroke) return;
  const p = toSource(e);
  paint(currentItem(), stroke.last, p);
  stroke.last = p;
});
const endStroke = () => {
  if (!stroke) return;
  stroke = null;
  const item = currentItem();
  if (item) { item.bbox = findBBox(item.mask); updateStage(); }
};
preview.addEventListener('pointerup', endStroke);
preview.addEventListener('pointercancel', endStroke);
preview.addEventListener('pointerleave', hideCursor);

function paint(item, a, b) {
  const ctx = item.mask.getContext('2d');
  const radius = ($('brushSize').value * 0.8) / item.xf.scale;
  ctx.save();
  ctx.globalCompositeOperation = state.tool === 'erase' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = ctx.fillStyle = '#fff';
  ctx.lineWidth = radius * 2;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.restore();
  // 붓질 중에는 차량 위치가 흔들리지 않게 bbox는 붓을 뗄 때 다시 계산한다
  const bbox = item.bbox;
  rebuildCut(item);
  item.bbox = bbox;
  updateStage();
}

// ---------- 저장 ----------
function cleanName(s) { return (s || '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_'); }

async function renderBlob(item) {
  await document.fonts.ready;
  if (needsWake(item)) await wake(item);
  const out = canvas(1, 1);
  render(item, out);
  const s = state.settings;
  if (s.format === 'jpg') {
    // JPG는 투명을 못 담으므로 흰 바탕 위에 얹는다
    const flat = canvas(out.width, out.height);
    const c = flat.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, flat.width, flat.height);
    c.drawImage(out, 0, 0);
    return new Promise((r) => flat.toBlob(r, 'image/jpeg', 0.92));
  }
  return new Promise((r) => out.toBlob(r, 'image/png'));
}

function fileName(index) {
  return `${cleanName(state.settings.prefix) || 'car'}_${String(index + 1).padStart(2, '0')}.${state.settings.format}`;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function saveOne() {
  const item = currentItem();
  if (!item) return;
  const idx = readyItems().indexOf(item);
  download(await renderBlob(item), fileName(idx < 0 ? state.current : idx));
  toast('저장했어요.');
}

async function saveAll() {
  const items = readyItems();
  if (!items.length) return;
  const waiting = state.items.length - items.length;
  const status = $('saveStatus');
  $('saveAll').disabled = true;
  try {
    if (items.length === 1) { download(await renderBlob(items[0]), fileName(0)); }
    else {
      const zip = new JSZip();
      for (let i = 0; i < items.length; i++) {
        status.textContent = `사진 만드는 중 ${i + 1} / ${items.length}`;
        zip.file(fileName(i), await renderBlob(items[i]));
      }
      status.textContent = '압축하는 중';
      const blob = await zip.generateAsync({ type: 'blob' });
      download(blob, `${cleanName(state.settings.prefix) || 'car'}_photos.zip`);
    }
    status.textContent = waiting ? `${items.length}장을 저장했어요. 아직 처리 중이거나 실패한 ${waiting}장은 빠졌어요.` : `${items.length}장을 저장했어요.`;
  } catch (err) {
    status.textContent = `저장하지 못했어요: ${err.message}`;
  } finally {
    updateSaveButtons();
  }
}

// ---------- 유틸 ----------
function cloneCanvas(src) { const c = canvas(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0); return c; }
function loadImage(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }
let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
function fileToDataUrl(file, maxSide) {
  return createImageBitmap(file).then((bmp) => {
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = canvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  });
}

// ---------- 설정 패널 연결 ----------
function setRadio(groupId, attr, value) {
  for (const b of $(groupId).querySelectorAll(`[data-${attr}]`)) b.setAttribute('aria-checked', String(b.dataset[attr] === value));
}

function applySettingsToUI() {
  const s = state.settings;
  setRadio('bgSwatches', 'bg', s.bg);
  setRadio('ratioSeg', 'ratio', s.ratio);
  setRadio('wmStyleSeg', 'wm', s.wmStyle);
  setRadio('formatSeg', 'format', s.format);
  $('bgColor').value = s.bgColor; $('swColor').style.background = s.bgColor;
  $('shadow').value = s.shadow; $('shadowOut').textContent = s.shadow;
  $('reflection').checked = s.reflection;
  $('carSize').value = s.carSize; $('carSizeOut').textContent = `${s.carSize}%`;
  $('floorPos').value = s.floorPos; $('floorPosOut').textContent = `${s.floorPos}%`;
  $('wmOn').checked = s.wmOn; $('wmFields').dataset.off = String(!s.wmOn);
  $('wmName').value = s.wmName; $('wmPhone').value = s.wmPhone; $('signSub').value = s.signSub;
  $('prefix').value = s.prefix;
  const lp = $('logoPreview');
  if (state.logoImage) { lp.replaceChildren(state.logoImage.cloneNode()); $('logoClear').hidden = false; }
  else { lp.textContent = '없음'; $('logoClear').hidden = true; }
}

function set(patch) {
  Object.assign(state.settings, patch);
  saveSettings();
  applySettingsToUI();
  updateStage();
}

$('bgSwatches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bg]');
  if (!b) return;
  if (b.dataset.bg === 'image' && !state.bgImage) { $('bgImageInput').click(); return; }
  const patch = { bg: b.dataset.bg };
  if (b.dataset.bg === 'transparent' && state.settings.format === 'jpg') { patch.format = 'png'; toast('투명 배경은 PNG로 저장돼요.'); }
  set(patch);
});
$('bgColor').addEventListener('input', (e) => set({ bg: 'color', bgColor: e.target.value }));
$('bgImageInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const bmp = await createImageBitmap(f);
    const c = canvas(Math.min(bmp.width, 2400), Math.round(Math.min(bmp.width, 2400) * bmp.height / bmp.width));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    state.bgImage = c;
    $('swImage').style.backgroundImage = `url(${c.toDataURL('image/jpeg', 0.6)})`;
    set({ bg: 'image' });
  } catch { toast('배경 사진을 열 수 없어요.'); }
});
$('swImage').addEventListener('click', (e) => {
  // 이미 고른 배경 사진이 있을 때 썸네일을 누르면 다른 사진으로 바꾼다
  if (state.bgImage && state.settings.bg === 'image') { e.stopPropagation(); $('bgImageInput').click(); }
});

const rangeBinds = [['shadow', 'shadow', ''], ['carSize', 'carSize', '%'], ['floorPos', 'floorPos', '%']];
for (const [id, key] of rangeBinds) $(id).addEventListener('input', (e) => set({ [key]: Number(e.target.value) }));
$('reflection').addEventListener('change', (e) => set({ reflection: e.target.checked }));
$('ratioSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-ratio]'); if (b) set({ ratio: b.dataset.ratio }); });
$('wmStyleSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-wm]'); if (b) set({ wmStyle: b.dataset.wm, wmOn: true }); });
$('formatSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-format]'); if (b) set({ format: b.dataset.format }); });
$('wmOn').addEventListener('change', (e) => set({ wmOn: e.target.checked }));
const isBrandBg = () => state.settings.bg.startsWith('brand');
$('wmName').addEventListener('input', (e) => set({ wmName: e.target.value, wmOn: state.settings.wmOn || !isBrandBg() }));
$('wmPhone').addEventListener('input', (e) => set({ wmPhone: e.target.value, wmOn: state.settings.wmOn || !isBrandBg() }));
$('signSub').addEventListener('input', (e) => set({ signSub: e.target.value }));
$('prefix').addEventListener('input', (e) => set({ prefix: e.target.value }));
$('logoInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const url = await fileToDataUrl(f, 600);
    state.logoImage = await loadImage(url);
    set({ wmLogo: url, wmOn: state.settings.wmOn || !isBrandBg() });
  } catch { toast('로고 이미지를 열 수 없어요.'); }
});
$('logoClear').addEventListener('click', () => { state.logoImage = null; set({ wmLogo: '' }); });

// 작업대
$('fileInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
$('prevBtn').addEventListener('click', () => select(state.current - 1));
$('nextBtn').addEventListener('click', () => select(state.current + 1));
$('eraseBtn').addEventListener('click', () => setTool('erase'));
$('restoreBtn').addEventListener('click', () => setTool('restore'));
$('undoBtn').addEventListener('click', undo);
$('resetMaskBtn').addEventListener('click', () => {
  const item = currentItem();
  if (!item?.aiRes || !item.mask) return;
  item.undo.push(cloneCanvas(item.mask));
  if (item.undo.length > UNDO_MAX) freeCanvas(item.undo.shift());
  item.mask = maskCanvas(item.aiRes, item.w, item.h);
  rebuildCut(item);
  updateStage();
});
$('keepOriginal').addEventListener('change', (e) => {
  const item = currentItem();
  if (!item) return;
  item.keep = e.target.checked;
  renderQueue(); updateStage();
  if (!item.keep) runQueue();
});
$('clearAll').addEventListener('click', () => {
  state.items.forEach((it) => { freeCanvas(it.src); freeCanvas(it.mask); freeCanvas(it.cut); it.undo.forEach(freeCanvas); });
  live.length = 0;
  state.items = []; state.current = -1;
  renderQueue(); updateStage();
});
$('saveOne').addEventListener('click', saveOne);
$('saveAll').addEventListener('click', saveAll);
// 휴대폰: 설정은 아래에서 올라오는 시트로, 저장은 아래 고정 버튼으로
const setSheet = (on) => document.body.classList.toggle('sheet-open', on);
$('mSettings').addEventListener('click', () => setSheet(!document.body.classList.contains('sheet-open')));
$('sheetClose').addEventListener('click', () => setSheet(false));
$('sheetBackdrop').addEventListener('click', () => setSheet(false));
$('mSave').addEventListener('click', () => { setSheet(false); saveAll(); });

function undo() {
  const item = currentItem();
  if (!item?.undo.length) return;
  item.mask = item.undo.pop();
  rebuildCut(item);
  updateStage();
}

const compareBtn = $('compareBtn');
const compareOn = () => { if (!currentItem()) return; state.comparing = true; compareBtn.classList.add('is-holding'); updateStage(); };
const compareOff = () => { if (!state.comparing) return; state.comparing = false; compareBtn.classList.remove('is-holding'); updateStage(); };
compareBtn.addEventListener('pointerdown', compareOn);
compareBtn.addEventListener('pointerup', compareOff);
compareBtn.addEventListener('pointerleave', compareOff);

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea')) return;
  if (e.key === 'ArrowLeft') select(state.current - 1);
  else if (e.key === 'ArrowRight') select(state.current + 1);
  else if (e.key === ' ' && !e.repeat) { e.preventDefault(); compareOn(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  else if (e.key === 'e') setTool('erase');
  else if (e.key === 'r') setTool('restore');
  else if (e.key === 'Escape') setTool(null);
});
document.addEventListener('keyup', (e) => { if (e.key === ' ') compareOff(); });

// 창 어디에 끌어다 놓아도 추가
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $('dragVeil').hidden = false; });
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('dragVeil').hidden = true; });
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; $('dragVeil').hidden = true;
  addFiles(e.dataTransfer.files);
});
window.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) addFiles(files);
});
window.addEventListener('resize', updateStage);

// ---------- 시작 ----------
(async () => {
  if (state.settings.wmLogo) {
    try { state.logoImage = await loadImage(state.settings.wmLogo); } catch { state.settings.wmLogo = ''; }
  }
  applySettingsToUI();
  renderQueue();
  updateStage();
  document.fonts.ready.then(updateStage);
  document.fonts.load(`800 40px ${SIGN_FONT}`).then(updateStage).catch(() => {});
})();
