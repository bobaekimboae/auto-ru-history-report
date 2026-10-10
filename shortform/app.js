// 딜러 숏폼 메이커: 사진 → 차량 정보 → 스타일 3단계로 입력받아 브라우저 안에서 숏폼 영상을 녹화한다.
import { RATIOS, STYLES, FONT, buildTimeline, bakePhoto, drawFrame, makeScene } from './render.js';
import { MOODS, suggestMood, renderMusic, fitCustomAudio } from './music.js';
import { vehicleInfo, buildCallouts, buildCaption, formatPrice } from './text.js';

const $ = (id) => document.getElementById(id);

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 10;
const STORE_KEY = 'shortform-settings-v1';
const BGR_STORE_KEY = 'bgr-settings-v1';   // 배경지우개에 입력한 상사 정보
const LABELS = ['전면', '측면', '후면', '실내', '운전석', '계기판', '2열', '트렁크', '엔진룸', '휠·타이어', '외관'];
const DEFAULT_LABELS = ['전면', '측면', '후면', '실내', '계기판', '엔진룸', '2열', '트렁크', '휠·타이어', '외관'];

const DEFAULTS = {
  template: 'bold', ratio: '9:16', fit: 'smart', length: 'auto', music: 'auto', volume: 80,
  brand: { name: '', phone: '', logo: '', color: '', cta: '지금 바로 문의하세요' },
};

const state = {
  step: 0,
  photos: [],          // { id, name, url, img, label, masks, baked }
  car: { make: '', model: '', trim: '', year: '', mileage: '', price: '', color: '', fuel: '가솔린', transmission: '오토', body: '', highlights: [], plate: '' },
  settings: loadSettings(),
  logoImg: null,
  customAudio: null,   // { name, data: ArrayBuffer }
  result: null,        // { url, blob, mime, ratio, thumb }
};
let nextId = 1;

function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { /* 저장 불가 환경 */ }
  const s = { ...DEFAULTS, ...saved, brand: { ...DEFAULTS.brand, ...(saved.brand || {}) } };
  if (s.music === 'custom') s.music = 'auto';
  return s;
}
function saveSettings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.settings)); } catch { /* 용량 초과 등 */ }
}
function setSetting(patch) {
  Object.assign(state.settings, patch);
  saveSettings();
  invalidate();
}
function setBrand(patch) {
  Object.assign(state.settings.brand, patch);
  saveSettings();
  invalidate();
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 2600);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 열 수 없어요'));
    img.src = src;
  });
}

// ---------- 사진 ----------
async function addFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  if (!list.length) return;
  // 처음 사진을 넣으면 제목이 다 나온 순간을 미리보기로 보여준다
  if (!state.photos.length && pv.t === 0) pv.t = 1.6;
  const room = MAX_PHOTOS - state.photos.length;
  if (room <= 0) { toast(`사진은 ${MAX_PHOTOS}장까지 넣을 수 있어요.`); return; }
  if (list.length > room) toast(`${MAX_PHOTOS}장까지만 넣었어요.`);
  for (const file of list.slice(0, room)) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const used = new Set(state.photos.map((p) => p.label));
      const label = DEFAULT_LABELS.find((l) => !used.has(l)) || '';
      const ph = { id: nextId++, name: file.name, url, img, label, masks: [], baked: null };
      ph.baked = bakePhoto(img, ph.masks);
      state.photos.push(ph);
    } catch {
      URL.revokeObjectURL(url);
      toast(`${file.name}: 열 수 없는 사진이에요.`);
    }
  }
  hideError();
  renderPhotos();
  invalidate();
}

function removePhoto(id) {
  const i = state.photos.findIndex((p) => p.id === id);
  if (i < 0) return;
  URL.revokeObjectURL(state.photos[i].url);
  state.photos.splice(i, 1);
  renderPhotos();
  invalidate();
}

function movePhoto(id, toIndex) {
  const from = state.photos.findIndex((p) => p.id === id);
  if (from < 0) return;
  const [p] = state.photos.splice(from, 1);
  state.photos.splice(Math.max(0, Math.min(state.photos.length, toIndex)), 0, p);
  renderPhotos();
  invalidate();
}

const ICON_X = '<svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8"/></svg>';

function renderPhotos() {
  const grid = $('photoGrid');
  grid.textContent = '';
  state.photos.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'tile';
    li.draggable = true;
    li.dataset.id = p.id;

    const box = document.createElement('div');
    box.className = 'tile-img';
    const img = document.createElement('img');
    img.src = p.url; img.alt = `${i + 1}번 사진`;
    box.append(img);
    for (const m of p.masks) {
      const mk = document.createElement('span');
      mk.className = 'tile-mask';
      Object.assign(mk.style, { left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` });
      box.append(mk);
    }
    const idx = document.createElement('span');
    idx.className = i === 0 ? 'tile-index first' : 'tile-index';
    idx.textContent = i === 0 ? '첫 장면' : String(i + 1);
    const rm = document.createElement('button');
    rm.type = 'button'; rm.className = 'tile-remove'; rm.innerHTML = ICON_X;
    rm.setAttribute('aria-label', `${i + 1}번 사진 빼기`);
    rm.addEventListener('click', () => removePhoto(p.id));
    box.append(idx, rm);

    const sel = document.createElement('select');
    sel.setAttribute('aria-label', `${i + 1}번 사진 자막`);
    sel.title = '영상에 작게 나오는 부위 이름';
    sel.innerHTML = '<option value="">부위 표시 없음</option>' + LABELS.map((l) => `<option>${l}</option>`).join('');
    sel.value = p.label;
    sel.disabled = i === 0;
    if (i === 0) sel.title = '첫 장면에는 차량 이름과 가격이 크게 나와요';
    sel.addEventListener('change', () => { p.label = sel.value; invalidate(); });

    const row = document.createElement('div');
    row.className = 'tile-row';
    const left = document.createElement('button');
    left.type = 'button'; left.className = 'btn btn-quiet btn-sm btn-move'; left.textContent = '‹';
    left.setAttribute('aria-label', '앞으로'); left.disabled = i === 0;
    left.addEventListener('click', () => movePhoto(p.id, i - 1));
    const mask = document.createElement('button');
    mask.type = 'button'; mask.className = 'btn btn-quiet btn-sm';
    mask.textContent = p.masks.length ? `번호판 ${p.masks.length}곳` : '번호판 가리기';
    mask.addEventListener('click', () => openMask(p));
    const right = document.createElement('button');
    right.type = 'button'; right.className = 'btn btn-quiet btn-sm btn-move'; right.textContent = '›';
    right.setAttribute('aria-label', '뒤로'); right.disabled = i === state.photos.length - 1;
    right.addEventListener('click', () => movePhoto(p.id, i + 1));
    row.append(left, mask, right);

    li.append(box, i === 0 ? firstNote() : sel, row);
    grid.append(li);
  });
  $('photoCount').textContent = `${state.photos.length}/${MAX_PHOTOS}`;
  $('photoAdd').hidden = state.photos.length >= MAX_PHOTOS;
  $('phoneEmpty').hidden = state.photos.length > 0;
}

function firstNote() {
  const s = document.createElement('select');
  s.disabled = true;
  s.innerHTML = '<option>차량 이름·가격</option>';
  s.title = '첫 장면에는 차량 이름과 가격이 크게 나와요';
  return s;
}

// 끌어서 순서 바꾸기
let dragId = null;
$('photoGrid').addEventListener('dragstart', (e) => {
  const li = e.target.closest('.tile');
  if (!li) return;
  dragId = Number(li.dataset.id);
  li.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/x-photo', String(dragId));
});
$('photoGrid').addEventListener('dragend', () => {
  dragId = null;
  document.querySelectorAll('.tile').forEach((t) => t.classList.remove('dragging', 'drop-before', 'drop-after'));
});
$('photoGrid').addEventListener('dragover', (e) => {
  if (dragId == null) return;
  const li = e.target.closest('.tile');
  if (!li) return;
  e.preventDefault();
  const r = li.getBoundingClientRect();
  const after = e.clientX > r.left + r.width / 2;
  document.querySelectorAll('.tile').forEach((t) => t.classList.remove('drop-before', 'drop-after'));
  li.classList.add(after ? 'drop-after' : 'drop-before');
});
$('photoGrid').addEventListener('drop', (e) => {
  if (dragId == null) return;
  const li = e.target.closest('.tile');
  if (!li) return;
  e.preventDefault();
  e.stopPropagation();
  const r = li.getBoundingClientRect();
  const after = e.clientX > r.left + r.width / 2;
  const targetId = Number(li.dataset.id);
  const id = dragId;
  const without = state.photos.filter((p) => p.id !== id);
  let to = without.findIndex((p) => p.id === targetId);
  if (to < 0) return;
  if (after) to += 1;
  movePhoto(id, to);
});

$('photoInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });

// 파일을 창 어디에든 끌어다 놓기
let dragDepth = 0;
const isFileDrag = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => { if (!isFileDrag(e)) return; dragDepth++; $('dragVeil').hidden = false; });
window.addEventListener('dragleave', (e) => { if (!isFileDrag(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('dragVeil').hidden = true; });
window.addEventListener('dragover', (e) => { if (isFileDrag(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dragDepth = 0; $('dragVeil').hidden = true;
  if (typeof state.step !== 'number') return;
  addFiles(e.dataTransfer.files);
  if (state.step !== 0) toast('사진을 추가했어요. 1단계에서 순서를 바꿀 수 있어요.');
});

// ---------- 번호판 가리기 ----------
const maskUI = { photo: null, rects: [], drawing: null, scale: 1 };

function openMask(p) {
  maskUI.photo = p;
  maskUI.rects = p.masks.map((m) => ({ ...m }));
  const c = $('maskCanvas');
  const iw = p.img.naturalWidth, ih = p.img.naturalHeight;
  const k = Math.min(1, 1400 / Math.max(iw, ih));
  c.width = Math.round(iw * k); c.height = Math.round(ih * k);
  drawMask();
  $('maskDialog').showModal();
}

function drawMask() {
  const c = $('maskCanvas');
  const x = c.getContext('2d');
  x.drawImage(maskUI.photo.img, 0, 0, c.width, c.height);
  const all = maskUI.drawing ? [...maskUI.rects, maskUI.drawing] : maskUI.rects;
  for (const r of all) {
    const rx = r.x * c.width, ry = r.y * c.height, rw = r.w * c.width, rh = r.h * c.height;
    x.fillStyle = 'rgb(223 84 25 / 35%)';
    x.fillRect(rx, ry, rw, rh);
    x.strokeStyle = '#ffffff'; x.lineWidth = Math.max(2, c.width / 400);
    x.setLineDash([8, 6]);
    x.strokeRect(rx, ry, rw, rh);
    x.setLineDash([]);
  }
}

function maskPoint(e) {
  const c = $('maskCanvas');
  const r = c.getBoundingClientRect();
  return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
}
$('maskCanvas').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  $('maskCanvas').setPointerCapture(e.pointerId);
  const p = maskPoint(e);
  maskUI.start = p;
  maskUI.drawing = { x: p.x, y: p.y, w: 0, h: 0 };
});
$('maskCanvas').addEventListener('pointermove', (e) => {
  if (!maskUI.drawing) return;
  const p = maskPoint(e);
  const s = maskUI.start;
  maskUI.drawing = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
  drawMask();
});
const endMask = () => {
  const d = maskUI.drawing;
  maskUI.drawing = null;
  if (d && d.w > 0.01 && d.h > 0.005) maskUI.rects.push(d);
  drawMask();
};
$('maskCanvas').addEventListener('pointerup', endMask);
$('maskCanvas').addEventListener('pointercancel', endMask);
$('maskUndo').addEventListener('click', () => { maskUI.rects.pop(); drawMask(); });
$('maskClear').addEventListener('click', () => { maskUI.rects = []; drawMask(); });
$('maskDialog').addEventListener('close', () => {
  const p = maskUI.photo;
  if (!p) return;
  p.masks = maskUI.rects;
  p.baked = bakePhoto(p.img, p.masks);
  maskUI.photo = null;
  renderPhotos();
  invalidate();
});

// ---------- 차량 정보 ----------
function initCarForm() {
  const y = new Date().getFullYear();
  const sel = $('year');
  sel.innerHTML = '<option value="">선택</option>' + Array.from({ length: y + 2 - 1995 }, (_, i) => y + 1 - i).map((v) => `<option value="${v}">${v}년</option>`).join('');
  for (const id of ['make', 'model', 'trim', 'year', 'mileage', 'price', 'color', 'fuel', 'transmission', 'plate']) {
    $(id).addEventListener('input', () => {
      state.car[id] = $(id).value;
      $(id).classList.remove('invalid');
      if (id === 'price') $('pricePreview').textContent = formatPrice(state.car.price);
      invalidate();
    });
  }
  $('highlights').addEventListener('input', () => { readHighlights(); invalidate(); });
  $('quickHighlights').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const word = b.textContent.trim();
    const lines = $('highlights').value.split('\n').map((s) => s.trim()).filter(Boolean);
    const i = lines.indexOf(word);
    if (i >= 0) lines.splice(i, 1);
    else if (lines.length >= 6) { toast('특장점은 6개까지 넣을 수 있어요.'); return; }
    else lines.push(word);
    $('highlights').value = lines.join('\n');
    readHighlights();
    invalidate();
  });
  $('bodySeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-body]');
    if (!b) return;
    state.car.body = state.car.body === b.dataset.body ? '' : b.dataset.body;
    syncBody();
    invalidate();
  });
}
function readHighlights() {
  state.car.highlights = $('highlights').value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6);
  $('quickHighlights').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(state.car.highlights.includes(b.textContent.trim()))));
}
function syncBody() {
  $('bodySeg').querySelectorAll('[data-body]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.body === state.car.body)));
}

// ---------- 스타일·상사 정보 ----------
function initStyleForm() {
  const cards = $('styleCards');
  for (const [id, st] of Object.entries(STYLES)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'style-card'; b.setAttribute('role', 'radio'); b.dataset.template = id;
    b.innerHTML = `<span class="style-swatch" style="background:${st.swatch}"></span><b>${st.name}</b><small>${st.desc}</small>`;
    cards.append(b);
  }
  cards.addEventListener('click', (e) => { const b = e.target.closest('[data-template]'); if (b) { setSetting({ template: b.dataset.template }); syncStyleForm(); } });
  $('ratioSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-ratio]'); if (b) { setSetting({ ratio: b.dataset.ratio }); syncStyleForm(); } });
  $('fitSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-fit]'); if (b) { setSetting({ fit: b.dataset.fit }); syncStyleForm(); } });
  $('lengthSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-length]'); if (b) { setSetting({ length: b.dataset.length }); syncStyleForm(); } });

  $('music').addEventListener('change', () => {
    const v = $('music').value;
    if (v === 'custom') {
      $('audioInput').click();
      if (!state.customAudio) { $('music').value = state.settings.music; return; }
    }
    state.settings.music = v;
    if (v !== 'custom') saveSettings();
    invalidate();
    syncStyleForm();
  });
  $('audioInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = await f.arrayBuffer();
      await fitCustomAudio(data, 1); // 열 수 있는 파일인지 미리 확인
      state.customAudio = { name: f.name, data };
      state.settings.music = 'custom';
      musicCache.clear();
      invalidate();
      syncStyleForm();
    } catch {
      toast('이 음악 파일은 열 수 없어요. MP3·M4A·WAV를 써 주세요.');
    }
  });
  $('volume').addEventListener('input', () => {
    state.settings.volume = Number($('volume').value);
    $('volumeOut').textContent = state.settings.volume;
    if (pv.gain) pv.gain.gain.value = state.settings.volume / 100;
    saveSettings();
  });

  $('dealerName').addEventListener('input', (e) => setBrand({ name: e.target.value }));
  $('dealerPhone').addEventListener('input', (e) => setBrand({ phone: e.target.value }));
  $('cta').addEventListener('input', (e) => setBrand({ cta: e.target.value }));
  $('brandColor').addEventListener('input', (e) => { setBrand({ color: e.target.value }); syncStyleForm(); });
  $('brandColorReset').addEventListener('click', () => { setBrand({ color: '' }); syncStyleForm(); });
  $('logoInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const url = URL.createObjectURL(f);
      const img = await loadImage(url);
      URL.revokeObjectURL(url);
      // 브라우저에 기억해 두려고 적당한 크기의 PNG로 줄인다
      const k = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/png');
      state.logoImg = await loadImage(data);
      setBrand({ logo: data });
      syncStyleForm();
    } catch {
      toast('로고 이미지를 열 수 없어요.');
    }
  });
  $('logoClear').addEventListener('click', () => { state.logoImg = null; setBrand({ logo: '' }); syncStyleForm(); });
}

function syncStyleForm() {
  const s = state.settings;
  const check = (root, attr, val) => root.querySelectorAll(`[data-${attr}]`).forEach((b) => b.setAttribute('aria-checked', String(b.dataset[attr] === val)));
  check($('styleCards'), 'template', s.template);
  check($('ratioSeg'), 'ratio', s.ratio);
  check($('fitSeg'), 'fit', s.fit);
  check($('lengthSeg'), 'length', s.length);
  $('music').value = s.music;
  $('volume').value = s.volume;
  $('volumeOut').textContent = s.volume;
  const b = s.brand;
  if ($('dealerName').value !== b.name) $('dealerName').value = b.name;
  if ($('dealerPhone').value !== b.phone) $('dealerPhone').value = b.phone;
  if ($('cta').value !== b.cta) $('cta').value = b.cta;
  $('brandColor').value = b.color || STYLES[s.template].accent;
  $('brandColorText').textContent = b.color ? '내 브랜드 색' : '스타일 기본색';
  $('brandColorReset').hidden = !b.color;
  const lp = $('logoPreview');
  lp.textContent = '';
  if (b.logo) { const im = document.createElement('img'); im.src = b.logo; im.alt = '로고'; lp.append(im); } else lp.textContent = '없음';
  $('logoClear').hidden = !b.logo;
  $('phone').dataset.ratio = s.ratio;
  updateMusicHint();
}

function moodId() {
  const m = state.settings.music;
  if (m === 'auto') return suggestMood(state.car);
  return MOODS[m] ? m : null;
}

function updateMusicHint() {
  const m = state.settings.music;
  let text = '';
  if (m === 'auto') {
    const id = suggestMood(state.car);
    const why = state.car.fuel === '전기' || state.car.fuel === '수소' ? `${state.car.fuel}차라서` : state.car.body ? `${state.car.body}라서` : '차종을 고르면 바뀌어요 ·';
    text = `${why} '${MOODS[id].name}' 음악을 골랐어요`;
  } else if (m === 'custom' && state.customAudio) text = `${state.customAudio.name} · 영상 길이에 맞춰 자르고 끝을 줄여요`;
  else if (m === 'none') text = '소리 없이 만들어요';
  $('musicHint').textContent = text;
}

// ---------- 장면 구성 ----------
let sceneCache = null;

function invalidate() {
  sceneCache = null;
  updateMusicHint();
  updateAutoLength();
  requestDraw();
  if (pv.playing) syncPreviewAudio();
}

function beatOf() {
  const id = moodId();
  return id ? 60 / MOODS[id].bpm : 0.5;
}

function currentTimeline() {
  return buildTimeline(Math.max(1, state.photos.length), state.settings.length, beatOf());
}

function updateAutoLength() {
  if (!state.photos.length) { $('autoLen').textContent = '사진 수'; return; }
  const tl = buildTimeline(state.photos.length, 'auto', beatOf());
  $('autoLen').textContent = `약 ${Math.round(tl.total)}초`;
}

function buildScene(W, H, { preview = false, safe = false } = {}) {
  const car = state.car;
  const info = vehicleInfo(car);
  if (preview && !info.model && !info.make) { info.model = '차량 모델'; info.title = '차량 모델'; }
  const b = state.settings.brand;
  return makeScene({
    W, H,
    photos: state.photos.map((p) => p.baked),
    timeline: currentTimeline(),
    info,
    callouts: buildCallouts(car),
    labels: state.photos.map((p) => p.label),
    brand: { name: b.name.trim(), phone: b.phone.trim(), cta: b.cta.trim(), color: b.color, logoImg: state.logoImg },
    styleId: state.settings.template,
    fit: state.settings.fit,
    safe,
  });
}

// 캔버스 글꼴은 미리 내려받아 둬야 첫 프레임부터 제대로 그려진다
const loadedText = new Set();
async function ensureFonts() {
  const info = vehicleInfo(state.car);
  const b = state.settings.brand;
  const text = [info.title, info.trim, info.sub, info.price, ...info.highlights, b.name, b.phone, b.cta, ...state.photos.map((p) => p.label),
    '매물 문의 연식 주행거리 연료 변속기 색상 차량 모델 ✓ 0123456789,.·km만원억년식']
    .filter(Boolean).join(' ');
  if (loadedText.has(text) || !document.fonts?.load) return;
  try {
    await Promise.race([
      Promise.all([800, 700, 600].map((w) => document.fonts.load(`${w} 40px ${FONT}`, text))),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
    loadedText.add(text);
  } catch { /* 글꼴을 못 받으면 기본 글꼴로 그린다 */ }
}

// ---------- 배경음악 ----------
const musicCache = new Map();
async function getMusic(total) {
  const m = state.settings.music;
  if (m === 'none') return null;
  if (m === 'custom') {
    if (!state.customAudio) return null;
    const key = `custom|${total.toFixed(3)}`;
    if (!musicCache.has(key)) musicCache.set(key, fitCustomAudio(state.customAudio.data, total));
    return musicCache.get(key);
  }
  const id = moodId();
  const key = `${id}|${total.toFixed(3)}`;
  if (!musicCache.has(key)) {
    if (musicCache.size > 8) musicCache.clear();
    musicCache.set(key, renderMusic(id, total));
  }
  return musicCache.get(key);
}
function musicKey(total) {
  const m = state.settings.music;
  return `${m === 'auto' ? moodId() : m}|${total.toFixed(3)}`;
}

// ---------- 미리보기 재생 ----------
const pv = { playing: false, t: 0, base: 0, ac: null, src: null, gain: null, key: '', raf: 0, token: 0 };
const pctx = $('previewCanvas').getContext('2d');
let drawQueued = false;

function previewScene() {
  if (!sceneCache) {
    const [W, H] = RATIOS[state.settings.ratio];
    const c = $('previewCanvas');
    if (c.width !== W / 2 || c.height !== H / 2) { c.width = W / 2; c.height = H / 2; }
    sceneCache = buildScene(W / 2, H / 2, { preview: true, safe: $('safeToggle').checked });
    ensureFonts().then(() => requestDraw());
  }
  return sceneCache;
}

function requestDraw() {
  if (drawQueued || pv.playing) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; drawPreview(); });
}

function drawPreview() {
  if (!state.photos.length) { updateTime(0, 0); return; }
  const sc = previewScene();
  pv.t = Math.min(pv.t, sc.timeline.total);
  drawFrame(pctx, sc, pv.t);
  updateTime(pv.t, sc.timeline.total);
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function updateTime(t, total) {
  $('timeText').textContent = `${fmt(t)} / ${fmt(total)}`;
  if (!scrubbing) $('scrub').value = total ? Math.round((t / total) * 1000) : 0;
}

function play() {
  if (!state.photos.length) { toast('사진을 먼저 올려 주세요.'); return; }
  // 오디오는 누른 순간 바로 만들어야 브라우저가 소리를 허락한다
  if (!pv.ac) { pv.ac = new AudioContext(); pv.gain = pv.ac.createGain(); pv.gain.connect(pv.ac.destination); }
  pv.ac.resume();
  pv.gain.gain.value = state.settings.volume / 100;
  const total = previewScene().timeline.total;
  if (pv.t >= total - 0.05) pv.t = 0;
  pv.playing = true;
  pv.base = performance.now() - pv.t * 1000;
  $('player').dataset.playing = 'true';
  $('playBtn').setAttribute('aria-label', '일시정지');
  syncPreviewAudio(true);
  const loop = () => {
    if (!pv.playing) return;
    const sc = previewScene();
    pv.t = (performance.now() - pv.base) / 1000;
    if (pv.t >= sc.timeline.total) { pv.t = sc.timeline.total; drawFrame(pctx, sc, pv.t); pause(); return; }
    drawFrame(pctx, sc, pv.t);
    updateTime(pv.t, sc.timeline.total);
    pv.raf = requestAnimationFrame(loop);
  };
  pv.raf = requestAnimationFrame(loop);
}

function pause() {
  pv.playing = false;
  cancelAnimationFrame(pv.raf);
  stopPreviewAudio();
  $('player').dataset.playing = 'false';
  $('playBtn').setAttribute('aria-label', '재생');
  requestDraw();
}

function stopPreviewAudio() {
  pv.token++;
  if (pv.src) { try { pv.src.stop(); } catch { /* 이미 멈춤 */ } pv.src.disconnect(); pv.src = null; }
  pv.key = '';
}

// 음악이 바뀌었거나 위치를 옮겼으면 지금 위치부터 다시 튼다
async function syncPreviewAudio(force = false) {
  const total = previewScene().timeline.total;
  const key = musicKey(total);
  if (!force && key === pv.key) return;
  stopPreviewAudio();
  pv.key = key;
  const token = pv.token;
  let buf = null;
  try { buf = await getMusic(total); } catch { buf = null; }
  if (!buf || token !== pv.token || !pv.playing) return;
  const src = pv.ac.createBufferSource();
  src.buffer = buf;
  src.connect(pv.gain);
  const offset = (performance.now() - pv.base) / 1000;
  if (offset >= buf.duration) return;
  src.start(0, Math.max(0, offset));
  pv.src = src;
}

$('playBtn').addEventListener('click', () => (pv.playing ? pause() : play()));
let scrubbing = false;
$('scrub').addEventListener('input', () => {
  scrubbing = true;
  const total = previewScene().timeline.total;
  pv.t = (Number($('scrub').value) / 1000) * total;
  if (pv.playing) { pv.base = performance.now() - pv.t * 1000; syncPreviewAudio(true); }
  else { drawFrame(pctx, previewScene(), pv.t); updateTime(pv.t, total); }
});
$('scrub').addEventListener('change', () => { scrubbing = false; });
$('safeToggle').addEventListener('change', () => { sceneCache = null; requestDraw(); });

// ---------- 단계 이동 ----------
let maxStep = 0;

function showError(msg) { $('formError').textContent = msg; $('formError').hidden = false; }
function hideError() { $('formError').hidden = true; }

function validate(step) {
  if (step === 0 && state.photos.length < MIN_PHOTOS) return { msg: `사진을 ${MIN_PHOTOS}장 이상 올려 주세요.` };
  if (step === 1) {
    const miss = ['make', 'model', 'year'].filter((k) => !String(state.car[k]).trim());
    if (miss.length) return { msg: '제조사·모델·연식을 채워 주세요.', fields: miss };
  }
  return null;
}

function goTo(step) {
  hideError();
  if (typeof step === 'number') maxStep = Math.max(maxStep, step);
  state.step = step;
  document.querySelectorAll('.step').forEach((s) => { s.hidden = s.dataset.step !== String(step); });
  const numeric = typeof step === 'number';
  $('nav').hidden = !numeric;
  $('backBtn').style.visibility = step === 0 ? 'hidden' : 'visible';
  $('nextBtn').textContent = step === 2 ? '영상 만들기' : '다음 →';
  const shown = numeric ? step : 3;
  $('stepper').querySelectorAll('button').forEach((b) => {
    const i = Number(b.dataset.goto);
    b.dataset.state = i === shown ? 'current' : i < shown ? 'done' : '';
    b.disabled = !numeric || i > maxStep;
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('wizard').addEventListener('submit', (e) => {
  e.preventDefault();
  if (typeof state.step !== 'number') return;
  const err = validate(state.step);
  if (err) {
    showError(err.msg);
    (err.fields || []).forEach((f) => $(f).classList.add('invalid'));
    if (err.fields) $(err.fields[0]).focus();
    return;
  }
  if (state.step < 2) goTo(state.step + 1);
  else startRender();
});
$('backBtn').addEventListener('click', () => { if (typeof state.step === 'number' && state.step > 0) goTo(state.step - 1); });
$('stepper').addEventListener('click', (e) => {
  const b = e.target.closest('[data-goto]');
  if (!b || b.disabled) return;
  const to = Number(b.dataset.goto);
  // 앞 단계가 채워져 있어야 뒤 단계로 건너뛸 수 있다
  for (let i = 0; i < to; i++) { const err = validate(i); if (err) { goTo(i); showError(err.msg); return; } }
  goTo(to);
});

// ---------- 녹화 ----------
let job = null;

function pickMime() {
  const list = [
    'video/mp4;codecs="avc1.640028,mp4a.40.2"',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return list.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

async function startRender() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    showError('이 브라우저는 영상 녹화를 지원하지 않아요. 최신 Chrome·Edge·Safari에서 열어 주세요.');
    return;
  }
  pause();
  const ac = new AudioContext();   // 클릭한 순간 만들어야 소리가 녹음된다
  const ratio = state.settings.ratio;
  const [W, H] = RATIOS[ratio];
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.className = 'recording';
  const ctx = canvas.getContext('2d');
  const scene = buildScene(W, H);
  const total = scene.timeline.total;
  const myJob = { cancelled: false, ac };
  job = myJob;

  goTo('render');
  $('renderTitle').textContent = '영상을 만드는 중이에요';
  $('renderBar').style.width = '0%';
  $('renderText').textContent = '글꼴과 배경음악 준비 중';

  try {
    await ensureFonts();
    let music = null;
    try { music = await getMusic(total); } catch { toast('배경음악을 만들지 못해 소리 없이 녹화해요.'); }
    if (myJob.cancelled) return;

    const dest = ac.createMediaStreamDestination();
    const gain = ac.createGain();
    gain.gain.value = state.settings.volume / 100;
    const src = ac.createBufferSource();
    src.buffer = music || ac.createBuffer(2, Math.ceil(ac.sampleRate * (total + 0.2)), ac.sampleRate);
    src.connect(gain).connect(dest);

    const mime = pickMime();
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { ...(mime && { mimeType: mime }), videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 192_000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    myJob.rec = rec;

    // 녹화되는 화면을 미리보기 자리에 그대로 보여준다
    $('previewCanvas').hidden = true;
    $('phone').append(canvas);
    $('phone').dataset.ratio = ratio;

    drawFrame(ctx, scene, 0);
    await ac.resume();
    rec.start(500);
    const t0 = ac.currentTime + 0.15;
    src.start(t0);

    // 다른 탭으로 가면 화면 그리기가 멈추므로 녹화와 소리도 같이 멈춘다
    const onVis = () => {
      if (rec.state === 'inactive') return;
      if (document.hidden) { rec.pause(); ac.suspend(); }
      else { ac.resume(); rec.resume(); }
    };
    document.addEventListener('visibilitychange', onVis);
    myJob.cleanup = () => document.removeEventListener('visibilitychange', onVis);

    await new Promise((resolve) => {
      const loop = () => {
        if (myJob.cancelled) { resolve(); return; }
        const t = Math.max(0, ac.currentTime - t0);
        drawFrame(ctx, scene, Math.min(t, total));
        $('renderBar').style.width = `${Math.min(100, (t / total) * 100)}%`;
        $('renderText').textContent = `${Math.min(total, t).toFixed(1)} / ${total.toFixed(1)}초 녹화 중`;
        if (t >= total + 0.1) { resolve(); return; }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });

    myJob.cleanup();
    if (rec.state !== 'inactive') rec.stop();
    try { src.stop(); } catch { /* 이미 끝남 */ }
    await stopped;
    if (myJob.cancelled) return;

    $('renderText').textContent = '썸네일 만드는 중';
    const blob = new Blob(chunks, { type: (rec.mimeType || mime || 'video/webm').split(';')[0] });
    const thumb = await makeThumbnail(scene, W, H);
    finishRender({ blob, mime: blob.type, ratio, thumb, total });
  } catch (err) {
    console.error(err);
    if (!myJob.cancelled) { goTo(2); showError('영상을 만들지 못했어요. 다시 시도해 주세요. 계속 안 되면 Chrome 최신 버전을 써 주세요.'); }
  } finally {
    myJob.cleanup?.();
    canvas.remove();
    if (state.step !== 'done') {
      $('previewCanvas').hidden = false;
      $('phone').dataset.ratio = state.settings.ratio;
    }
    ac.close().catch(() => {});
    if (job === myJob) job = null;
  }
}

$('cancelRender').addEventListener('click', () => {
  if (!job) return;
  job.cancelled = true;
  try { if (job.rec && job.rec.state !== 'inactive') job.rec.stop(); } catch { /* 무시 */ }
  goTo(2);
  toast('영상 만들기를 취소했어요.');
});

function makeThumbnail(scene, W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const seg = scene.timeline.segs[0];
  drawFrame(c.getContext('2d'), scene, Math.max(0.1, Math.min(seg.dur - 0.3, 1.9)));
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
}

// ---------- 완성 ----------
function fileBase() {
  const raw = state.car.plate.trim() || [state.car.year, state.car.model].filter(Boolean).join('_') || 'car';
  return raw.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
}
const extOf = (mime) => (mime.includes('mp4') ? 'mp4' : 'webm');

function finishRender(r) {
  if (state.result) URL.revokeObjectURL(state.result.url);
  state.result = { ...r, url: URL.createObjectURL(r.blob) };
  const v = $('resultVideo');
  v.src = state.result.url;
  v.hidden = false;
  $('previewCanvas').hidden = true;
  $('phone').dataset.ratio = r.ratio;
  document.querySelector('.preview').dataset.mode = 'video';

  const mb = (r.blob.size / 1024 / 1024).toFixed(1);
  $('doneMeta').textContent = `${r.ratio} · ${r.total.toFixed(0)}초 · ${extOf(r.mime).toUpperCase()} · ${mb}MB`;
  $('saveVideo').textContent = `영상 저장 (${extOf(r.mime).toUpperCase()})`;
  $('formatNote').textContent = extOf(r.mime) === 'webm'
    ? '이 브라우저는 WebM으로 저장해요. 유튜브·틱톡에는 그대로 올라가요. 인스타그램용 MP4가 필요하면 최신 Chrome·Edge·Safari에서 만들어 주세요.'
    : '';
  const file = new File([r.blob], `${fileBase()}.${extOf(r.mime)}`, { type: r.mime });
  $('shareVideo').hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
  $('caption').value = buildCaption(state.car, state.settings.brand);
  $('againRatios').querySelectorAll('[data-ratio]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.ratio === r.ratio)));
  goTo('done');
}

function leaveResult() {
  $('resultVideo').pause();
  $('resultVideo').hidden = true;
  $('previewCanvas').hidden = false;
  $('phone').dataset.ratio = state.settings.ratio;
  delete document.querySelector('.preview').dataset.mode;
  requestDraw();
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

$('saveVideo').addEventListener('click', () => {
  const r = state.result;
  if (r) download(r.blob, `${fileBase()}_${r.ratio.replace(':', 'x')}.${extOf(r.mime)}`);
});
$('saveThumb').addEventListener('click', () => {
  const r = state.result;
  if (r?.thumb) download(r.thumb, `${fileBase()}_${r.ratio.replace(':', 'x')}_thumb.jpg`);
});
$('shareVideo').addEventListener('click', async () => {
  const r = state.result;
  if (!r) return;
  const file = new File([r.blob], `${fileBase()}.${extOf(r.mime)}`, { type: r.mime });
  try { await navigator.share({ files: [file], text: $('caption').value }); } catch { /* 공유 창을 닫음 */ }
});
$('copyCaption').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('caption').value); toast('문구를 복사했어요.'); }
  catch { $('caption').select(); document.execCommand('copy'); toast('문구를 복사했어요.'); }
});
$('againRatios').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ratio]');
  if (!b) return;
  leaveResult();
  setSetting({ ratio: b.dataset.ratio });
  syncStyleForm();
  startRender();
});
$('editAgain').addEventListener('click', () => { leaveResult(); goTo(2); });
$('newVideo').addEventListener('click', () => {
  leaveResult();
  state.photos.forEach((p) => URL.revokeObjectURL(p.url));
  state.photos = [];
  state.car = { make: '', model: '', trim: '', year: '', mileage: '', price: '', color: '', fuel: '가솔린', transmission: '오토', body: '', highlights: [], plate: '' };
  for (const id of ['make', 'model', 'trim', 'year', 'mileage', 'price', 'color', 'plate', 'highlights']) $(id).value = '';
  $('fuel').value = '가솔린'; $('transmission').value = '오토';
  $('pricePreview').textContent = '';
  readHighlights(); syncBody();
  maxStep = 0;
  pv.t = 0;   // 다음 사진을 넣을 때 다시 제목 장면으로 맞춘다
  renderPhotos();
  invalidate();
  goTo(0);
});

// ---------- 시작 ----------
async function init() {
  // 처음 쓰는 경우 배경지우개에 입력해 둔 상사 정보를 가져온다
  const b = state.settings.brand;
  if (!b.name && !b.phone && !b.logo) {
    try {
      const bgr = JSON.parse(localStorage.getItem(BGR_STORE_KEY)) || {};
      if (bgr.wmName || bgr.wmPhone || bgr.wmLogo) {
        setBrand({ name: bgr.wmName || '', phone: bgr.wmPhone || '', logo: bgr.wmLogo || '' });
        $('brandImported').hidden = false;
      }
    } catch { /* 없음 */ }
  }
  if (state.settings.brand.logo) {
    try { state.logoImg = await loadImage(state.settings.brand.logo); } catch { setBrand({ logo: '' }); }
  }
  initCarForm();
  initStyleForm();
  syncStyleForm();
  readHighlights();
  syncBody();
  renderPhotos();
  goTo(0);
  invalidate();
}
init();
