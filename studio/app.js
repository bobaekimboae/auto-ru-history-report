// 매물 숏폼 스튜디오: 대시보드 · 차량 등록(사진 정렬) · 영상 만들기 · 상사 설정
import { db } from './db.js';
import { FORMATS, TEMPLATES, createScene, recordScene, fmt, factCards, usedPhotoIndices, slidePlan, renderSlides } from './render.js';
import { playMusic, playBuffer, MUSIC_TRACKS } from './music.js';
import { makeMask, loadCutout, composeShowroom, looksLikeInterior } from './showroom.js';
import { detectPlate, isExterior, applyPlate, dealerPlateCanvas, PLATE_MODES } from './plate.js';
import { openPlateEditor } from './plate-ui.js';
import { STUDIO_THEMES, brandTheme, drawBrandStudio } from '../bg-remover/compose.js';
import { createTurntableScene, isSpinPhoto } from './turntable.js';
import { LISTING_SIZES, autoToneFilter, sharpen, drawCover, drawBanner } from './enhance.js';
import { fetchListing, downloadPhotos, apiBase, bookmarkletHref, receiveFromBookmarklet } from './importer.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const DEALER_DEFAULTS = { name: '', phone: '', region: '', color: '#df5419', logo: '', cta: '지금 바로 문의하세요', hashtags: '중고차 중고차매물 중고차추천', signSub: '' };
const STUDIO_DEFAULTS = { format: '9:16', template: 'clean', duration: 15, showPrice: true, music: true, cta: '', bg: 'orig', output: 'video', musicTrack: 'auto', musicOffset: 0, plate: 'off', photoSize: '4:3', enhance: true, sharpen: true, banner: true };
const BACKGROUNDS = {
  orig: { label: '원본 사진', hint: '찍은 사진 그대로' },
  'brand-light': { label: '화이트 쇼룸', hint: '밝고 깨끗한 기본', theme: 'light' },
  'brand-dark': { label: '블랙 쇼룸', hint: '고급차·야간 느낌', theme: 'dark' },
  'brand-concrete': { label: '콘크리트 갤러리', hint: '노출 콘크리트 전시장', theme: 'concrete' },
  'brand-wood': { label: '우드 라운지', hint: '따뜻한 원목 벽', theme: 'wood' },
  'brand-garage': { label: '모던 차고', hint: '금속 패널·차가운 조명', theme: 'garage' },
  'brand-color': { label: '상사 컬러 월', hint: '상사 대표 색으로 칠한 벽', theme: 'brand' },
};
const themeOf = (bg) => (BACKGROUNDS[bg]?.theme === 'brand' ? brandTheme(dealer.color) : STUDIO_THEMES[BACKGROUNDS[bg]?.theme] || STUDIO_THEMES.light);
const MAKERS = ['현대', '기아', '제네시스', '쉐보레', '르노코리아', 'KG모빌리티', 'BMW', '벤츠', '아우디', '폭스바겐', '볼보', '포르쉐', '렉서스', '토요타', '혼다', '테슬라', '미니', '랜드로버', '지프', '포드'];

let dealer = { ...DEALER_DEFAULTS };
let cleanup = null;          // 화면을 떠날 때 정리할 작업(미리보기 루프·음악 등)

// ---------- 공통 ----------
let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
}

const urlCache = new Map();
function photoUrl(p) {
  if (!urlCache.has(p.id)) urlCache.set(p.id, URL.createObjectURL(p.blob));
  return urlCache.get(p.id);
}

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

// 사진은 긴 변 1920px JPEG로 줄여 저장한다
async function shrinkPhoto(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  return { id: uid(), blob, w: c.width, h: c.height };
}

function metaLine(v) {
  return [v.year, fmt.km(v.mileage), v.fuel].filter(Boolean).join(' · ');
}

function setNav(key) {
  document.querySelectorAll('[data-nav]').forEach((a) => a.toggleAttribute('aria-current', a.dataset.nav === key));
}

// ---------- 라우터 ----------
async function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const path = location.hash.replace(/^#/, '') || '/';
  let m;
  if (path === '/') await renderDashboard();
  else if (path === '/vehicle/new') await renderEditor(null);
  else if ((m = path.match(/^\/vehicle\/([\w-]+)\/video$/))) await renderStudio(m[1]);
  else if ((m = path.match(/^\/vehicle\/([\w-]+)$/))) await renderEditor(m[1]);
  else if (path === '/settings') await renderSettings();
  else if (path === '/import') await renderImportReceiver();
  else location.hash = '#/';
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ---------- 대시보드 ----------
async function renderDashboard() {
  setNav('dashboard');
  const list = await db.listVehicles();
  const done = list.filter((v) => v.videoAt).length;
  const ready = list.filter((v) => !v.videoAt && (v.photos?.length || 0) > 0).length;
  view.innerHTML = `
    <header class="page-head">
      <div>
        <p class="eyebrow">대시보드</p>
        <h1>${dealer.name ? `${esc(dealer.name)} 매물 영상` : '매물 영상'}</h1>
      </div>
      <a class="btn btn-primary" href="#/vehicle/new"><svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12"/></svg>차량 등록</a>
    </header>
    <form class="import" id="importForm" novalidate>
      <div class="import-head">
        <strong>첫차 매물로 바로 만들기</strong>
        <span>매물 사진과 차량 정보를 그대로 가져와 영상 화면까지 바로 열어요.</span>
      </div>
      ${apiBase() ? `
      <div class="import-row">
        <label class="sr-only" for="importUrl">매물 링크</label>
        <input id="importUrl" type="url" inputmode="url" placeholder="첫차 매물 링크 또는 검색 목록 링크 붙여넣기" autocomplete="off" required>
        <button class="btn btn-primary" id="importBtn" type="submit">가져오기</button>
      </div>
      <p class="import-status" id="importStatus" role="status" aria-live="polite"></p>
      <ul class="import-list" id="importList" hidden></ul>` : ''}
      <details class="bm" ${apiBase() ? '' : 'open'}>
        <summary>${apiBase() ? '다른 방법: 첫차 화면에서 버튼 한 번으로 보내기' : '첫차 화면에서 버튼 한 번으로 보내기'}</summary>
        <ol class="bm-steps">
          <li><span>이 버튼을 브라우저 즐겨찾기 막대로 끌어다 놓으세요. 한 번만 하면 돼요.</span>
            <a class="bm-btn" id="bmLink" href="#" title="즐겨찾기 막대로 끌어다 놓으세요">첫차 → 숏폼 보내기</a></li>
          <li><span>첫차에서 매물 상세 페이지를 열고 즐겨찾기 막대의 <b>첫차 → 숏폼 보내기</b>를 누르세요.</span></li>
          <li><span>새 창에 이 스튜디오가 열리면서 사진·정보를 가져오고 영상 화면이 열려요.</span></li>
        </ol>
        ${apiBase() ? '' : '<p class="hint">링크를 붙여넣어 가져오려면 가져오기 서버가 필요해요. 이 저장소를 Vercel에 연결하면 자동으로 켜져요.</p>'}
      </details>
      <p class="hint">우리 상사가 올린 매물만 가져와 쓰세요. 다른 상사의 사진과 문구는 허락 없이 쓸 수 없어요.</p>
    </form>
    ${!dealer.name ? `<a class="notice" href="#/settings"><b>상사 정보를 먼저 넣어 주세요.</b> 모든 영상에 상사명·로고·연락처가 자동으로 들어가요. <span>설정하기 →</span></a>` : ''}
    <section class="stats" aria-label="요약">
      <div class="stat"><span class="stat-k">등록 차량</span><span class="stat-v num">${list.length}</span></div>
      <div class="stat"><span class="stat-k">영상 완료</span><span class="stat-v num">${done}</span></div>
      <div class="stat" data-tone="${ready ? 'warn' : ''}"><span class="stat-k">영상 대기</span><span class="stat-v num">${ready}</span></div>
    </section>
    ${list.length ? `
      <div class="list-head"><h2>내 차량</h2><div class="seg" role="tablist" id="filterSeg">
        <button role="tab" data-f="all" aria-selected="true">전체 ${list.length}</button>
        <button role="tab" data-f="todo" aria-selected="false">영상 대기 ${list.length - done}</button>
        <button role="tab" data-f="done" aria-selected="false">영상 완료 ${done}</button>
      </div></div>
      <div class="vgrid" id="vgrid">${list.map(vehicleCard).join('')}</div>` : `
      <section class="empty">
        <h2>사진만 있으면 15초 숏폼이 완성돼요</h2>
        <ol class="steps">
          <li><b>1</b><div><strong>차량 등록</strong><span>차량번호, 연식, 주행거리, 가격을 입력해요</span></div></li>
          <li><b>2</b><div><strong>사진 정렬</strong><span>사진을 올리고 순서와 대표 사진을 정해요</span></div></li>
          <li><b>3</b><div><strong>영상 만들기</strong><span>형식·템플릿·음악을 고르고 MP4로 저장해요</span></div></li>
        </ol>
        <div class="empty-actions">
          <a class="btn btn-primary btn-lg" href="#/vehicle/new">첫 차량 등록하기</a>
          <button class="btn btn-quiet btn-lg" id="sampleBtn" type="button">예시 차량으로 둘러보기</button>
        </div>
      </section>`}
  `;
  setupImport();
  $('sampleBtn')?.addEventListener('click', async () => {
    const v = await makeSampleVehicle();
    location.hash = `#/vehicle/${v.id}/video`;
  });
  $('filterSeg')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    document.querySelectorAll('#filterSeg [data-f]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    document.querySelectorAll('#vgrid .vcard').forEach((c) => { c.hidden = b.dataset.f !== 'all' && c.dataset.s !== b.dataset.f; });
  });
}

// ---------- 즐겨찾기 버튼으로 받기 ----------
async function renderImportReceiver() {
  setNav('');
  view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">첫차에서 가져오기</p><h1>매물을 받는 중이에요</h1></div></header>
    <section class="card receive">
      <div class="spinner" id="rcvSpin"></div>
      <p class="receive-status" id="rcvStatus" role="status" aria-live="polite">첫차 페이지에서 매물 정보를 받는 중…</p>
      <a class="btn btn-quiet" href="#/" id="rcvBack" hidden>대시보드로</a>
    </section>`;
  const setStatus = (msg, tone) => { $('rcvStatus').textContent = msg; $('rcvStatus').dataset.tone = tone || ''; };
  try {
    const l = await receiveFromBookmarklet();
    setStatus(`${fmt.title(l)} 정보를 받았어요.`);
    await createFromListing(l, setStatus);
  } catch (err) {
    setStatus(err.message, 'error');
    $('rcvSpin').hidden = true;
    $('rcvBack').hidden = false;
  }
}

// ---------- 매물 링크 가져오기 ----------
// 가져온 매물로 차량을 만들고 영상 화면으로 간다
async function createFromListing(l, setStatus) {
  setStatus(`사진 내려받는 중 0 / ${Math.min(20, l.photos.length)}`);
  const photos = await downloadPhotos(l.photos, shrinkPhoto, {
    fallbacks: l.photoFallbacks,
    onProgress: (n, total) => setStatus(`사진 내려받는 중 ${n} / ${total}`),
  });
  if (!photos.length) throw new Error('사진을 내려받지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  const v = {
    id: uid(), createdAt: Date.now(), photos, source: { site: l.source, url: l.sourceUrl, importedAt: Date.now() },
    plate: l.plate, maker: l.maker, model: l.model, trim: l.trim, year: l.year, mileage: l.mileage,
    fuel: l.fuel, transmission: l.transmission, color: l.color, accident: l.accident, price: l.price,
    highlights: (l.highlights || []).join('\n'), description: l.description,
  };
  await db.putVehicle(v);
  toast(`${fmt.title(v)} 매물을 가져왔어요. 사진 ${photos.length}장`);
  location.hash = `#/vehicle/${v.id}/video`;
}

function setupImport() {
  const bm = $('bmLink');
  bm.href = bookmarkletHref(new URL('.', location.href.split('#')[0]).href.split('?')[0]);
  bm.addEventListener('click', (e) => { e.preventDefault(); toast('누르지 말고 즐겨찾기 막대로 끌어다 놓으세요.'); });
  const form = $('importForm');
  if (!$('importUrl')) { form.addEventListener('submit', (e) => e.preventDefault()); return; }
  const status = $('importStatus');
  const listEl = $('importList');
  const btn = $('importBtn');
  let busy = false;
  const setStatus = (msg, tone = '') => { status.textContent = msg; status.dataset.tone = tone; };

  const importListing = async (url) => {
    busy = true; btn.disabled = true;
    try {
      setStatus('매물 정보를 가져오는 중…');
      const data = await fetchListing(url);
      if (data.type === 'list') { showList(data.items); return; }
      await createFromListing(data.listing, setStatus);
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      busy = false; btn.disabled = false;
    }
  };

  const showList = (items) => {
    setStatus(`매물 ${items.length}대를 찾았어요. 영상으로 만들 매물을 고르세요.`);
    listEl.hidden = false;
    listEl.innerHTML = items.map((it, i) => `
      <li><button type="button" class="pick" data-i="${i}">
        ${it.thumb ? `<img src="${esc(it.thumb)}" alt="" loading="lazy">` : '<span class="nophoto">사진 없음</span>'}
        <span class="pick-body"><strong>${esc(it.title)}</strong><small>${esc([it.year, it.mileage].filter(Boolean).join(' · '))}</small><b class="num">${esc(fmt.price(it.price))}</b></span>
      </button></li>`).join('');
    listEl.onclick = (e) => {
      const b = e.target.closest('.pick');
      if (!b || busy) return;
      listEl.querySelectorAll('.pick').forEach((x) => x.classList.toggle('is-loading', x === b));
      importListing(items[Number(b.dataset.i)].url);
    };
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) return;
    const url = $('importUrl').value.trim();
    if (!/^https?:\/\//.test(url)) { setStatus('매물 링크(https://로 시작하는 주소)를 붙여넣어 주세요.', 'error'); return; }
    listEl.hidden = true;
    importListing(url);
  });
}

function vehicleCard(v) {
  const cover = v.photos?.[0];
  const when = v.videoAt ? new Date(v.videoAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '';
  return `
    <article class="vcard" data-s="${v.videoAt ? 'done' : 'todo'}">
      <a class="vthumb" href="#/vehicle/${v.id}">
        ${cover ? `<img src="${photoUrl(cover)}" alt="" loading="lazy">` : '<span class="nophoto">사진 없음</span>'}
        <span class="vcount num">사진 ${v.photos?.length || 0}</span>
        ${v.plate ? `<span class="vplate">${esc(v.plate)}</span>` : ''}
      </a>
      <div class="vbody">
        <h3>${esc(fmt.title(v))}</h3>
        <p class="vmeta">${esc(metaLine(v)) || '&nbsp;'}</p>
        <p class="vprice num">${esc(fmt.price(v.price))}</p>
        <p class="vstatus" data-s="${v.videoAt ? 'done' : 'todo'}">${v.videoAt ? `영상 완료 · ${when} · ${esc(v.videoFormat || '')}` : (v.photos?.length ? '영상 대기' : '사진을 올려 주세요')}</p>
        <div class="vactions">
          <a class="btn btn-quiet btn-sm" href="#/vehicle/${v.id}">편집</a>
          <a class="btn btn-primary btn-sm" href="#/vehicle/${v.id}/video">${v.videoAt ? '다시 만들기' : '영상 만들기'}</a>
        </div>
      </div>
    </article>`;
}

// ---------- 차량 등록/편집 ----------
async function renderEditor(id) {
  setNav(id ? '' : 'new');
  const existing = id ? await db.getVehicle(id) : null;
  if (id && !existing) { toast('차량을 찾을 수 없어요.'); location.hash = '#/'; return; }
  const v = existing || { id: uid(), photos: [], createdAt: Date.now() };
  let photos = [...(v.photos || [])];

  const sel = (name, opts, cur) => `<select id="${name}" name="${name}">${opts.map((o) => `<option ${o === (cur || '') ? 'selected' : ''} value="${esc(o)}">${o || '선택'}</option>`).join('')}</select>`;
  view.innerHTML = `
    <header class="page-head">
      <div>
        <p class="eyebrow"><a href="#/">대시보드</a> / ${existing ? '차량 편집' : '차량 등록'}</p>
        <h1>${existing ? esc(fmt.title(v)) : '새 차량 등록'}</h1>
      </div>
    </header>
    <form class="editor" id="editor" novalidate>
      <section class="card">
        <h2 class="card-title"><b>1</b>매물 정보</h2>
        <div class="grid2">
          <div class="field"><label for="plate">차량번호 또는 상사 관리번호</label><input id="plate" name="plate" placeholder="예: 12가3456" value="${esc(v.plate)}" autocomplete="off"></div>
          <div class="field"><label for="maker">제조사</label><input id="maker" name="maker" list="makers" placeholder="예: 현대" value="${esc(v.maker)}" autocomplete="off"><datalist id="makers">${MAKERS.map((m) => `<option value="${m}">`).join('')}</datalist></div>
          <div class="field"><label for="model">모델 <em>필수</em></label><input id="model" name="model" placeholder="예: 그랜저" value="${esc(v.model)}" required></div>
          <div class="field"><label for="trim">세부모델·등급</label><input id="trim" name="trim" placeholder="예: 2.5 캘리그래피" value="${esc(v.trim)}"></div>
          <div class="field"><label for="year">연식</label><input id="year" name="year" placeholder="예: 2021년 4월" value="${esc(v.year)}"></div>
          <div class="field"><label for="mileage">주행거리 (km)</label><input id="mileage" name="mileage" inputmode="numeric" placeholder="예: 42000" value="${esc(v.mileage)}"></div>
          <div class="field"><label for="fuel">연료</label>${sel('fuel', ['', '가솔린', '디젤', '하이브리드', '전기', 'LPG'], v.fuel)}</div>
          <div class="field"><label for="transmission">변속기</label>${sel('transmission', ['', '자동', '수동'], v.transmission)}</div>
          <div class="field"><label for="color">색상</label><input id="color" name="color" placeholder="예: 흰색" value="${esc(v.color)}"></div>
          <div class="field"><label for="accident">사고 이력</label>${sel('accident', ['', '무사고', '단순교환', '사고 있음'], v.accident)}</div>
          <div class="field"><label for="price">판매가 (만원)</label><input id="price" name="price" inputmode="numeric" placeholder="예: 3250" value="${esc(v.price)}"></div>
        </div>
        <div class="field"><label for="highlights">강조 포인트</label><textarea id="highlights" name="highlights" rows="3" placeholder="한 줄에 하나씩. 예: 1인 신조&#10;파노라마 썬루프&#10;정비 이력 완비">${esc(v.highlights)}</textarea><p class="hint">영상에서 한 장면에 하나씩 크게 보여줘요. 짧게 쓸수록 잘 읽혀요.</p></div>
        <div class="field"><label for="description">설명</label><textarea id="description" name="description" rows="3" placeholder="게시 문구에 들어갈 설명">${esc(v.description)}</textarea></div>
      </section>

      <section class="card">
        <h2 class="card-title"><b>2</b>사진 정렬 <span class="card-sub" id="photoCount"></span></h2>
        <label class="drop" id="drop" for="photoInput">
          <strong>사진을 끌어다 놓거나 눌러서 고르세요</strong>
          <span>외관·실내·옵션 사진 7~20장을 추천해요. 첫 번째 사진이 대표 사진이 되고 영상 첫 장면에 나와요.</span>
        </label>
        <input type="file" id="photoInput" accept="image/*" multiple hidden>
        <ol class="pgrid" id="pgrid"></ol>
        <p class="hint">사진을 끌어서 순서를 바꿀 수 있어요. 휴대폰에서는 화살표 버튼을 쓰세요. 실내·계기판 사진은 "실내"를 눌러 두면 상사 쇼룸 배경을 쓸 때도 원본 그대로 나와요.</p>
      </section>

      <div class="editor-actions">
        ${existing ? '<button type="button" class="btn btn-danger" id="delBtn">차량 삭제</button>' : '<span></span>'}
        <div class="right">
          <button type="submit" class="btn btn-quiet" data-next="list">저장</button>
          <button type="submit" class="btn btn-primary" data-next="video">저장하고 영상 만들기</button>
        </div>
      </div>
    </form>`;

  const grid = $('pgrid');
  const drawPhotos = () => {
    $('photoCount').textContent = photos.length ? `${photos.length}장` : '';
    grid.innerHTML = photos.map((p, i) => `
      <li class="ptile" draggable="true" data-i="${i}">
        <img src="${photoUrl(p)}" alt="사진 ${i + 1}">
        <span class="pnum num">${i + 1}</span>
        ${i === 0 ? '<span class="pcover">대표</span>' : ''}
        ${p.keepBg ? '<span class="pkeep">실내 · 배경 유지</span>' : ''}
        ${p.plate ? '<span class="pplate">번호판 표시됨</span>' : ''}
        <div class="ptools">
          <button type="button" data-act="left" aria-label="앞으로" ${i === 0 ? 'disabled' : ''}>◀</button>
          ${i ? '<button type="button" data-act="cover">대표로</button>' : ''}
          <button type="button" data-act="right" aria-label="뒤로" ${i === photos.length - 1 ? 'disabled' : ''}>▶</button>
          <button type="button" data-act="keep" aria-pressed="${!!p.keepBg}" title="상사 쇼룸 배경을 쓸 때 이 사진은 배경을 지우지 않아요">실내</button>
          <button type="button" data-act="plate" title="번호판 위치를 맞춰요">번호판</button>
          <button type="button" data-act="del" aria-label="삭제">삭제</button>
        </div>
      </li>`).join('');
  };
  drawPhotos();

  const addFiles = async (files) => {
    const imgs = [...files].filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    for (const f of imgs) {
      try { photos.push(await shrinkPhoto(f)); } catch { toast(`${f.name} 파일을 열 수 없어요.`); }
    }
    drawPhotos();
  };
  $('photoInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  const drop = $('drop');
  drop.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); drop.classList.add('over'); } });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const i = Number(b.closest('.ptile').dataset.i);
    const move = (from, to) => { const [p] = photos.splice(from, 1); photos.splice(to, 0, p); };
    if (b.dataset.act === 'left' && i > 0) move(i, i - 1);
    if (b.dataset.act === 'right' && i < photos.length - 1) move(i, i + 1);
    if (b.dataset.act === 'cover') move(i, 0);
    if (b.dataset.act === 'del') photos.splice(i, 1);
    if (b.dataset.act === 'keep') photos[i] = { ...photos[i], keepBg: !photos[i].keepBg };
    if (b.dataset.act === 'plate') {
      const p = photos[i];
      const open = () => openPlateEditor({ photos, urls: photos.map((x) => photoUrl(x)), start: i, onDone: () => drawPhotos() });
      if (p.plate !== undefined) { open(); return; }
      // 처음 여는 사진은 AI로 먼저 찾아 둔다
      b.disabled = true; b.textContent = '찾는 중…';
      detectPlate(p.blob, { onProgress: (r) => { b.textContent = `AI ${Math.round(r * 100)}%`; } })
        .then((q) => { p.plate = q; p.plateAuto = true; })
        .catch(() => { p.plate = null; toast('번호판을 자동으로 찾지 못했어요. 직접 넣어 주세요.'); })
        .finally(() => { drawPhotos(); open(); });
      return;
    }
    drawPhotos();
  });
  let dragFrom = -1;
  grid.addEventListener('dragstart', (e) => { const t = e.target.closest('.ptile'); if (t) { dragFrom = Number(t.dataset.i); t.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; } });
  grid.addEventListener('dragover', (e) => { if (dragFrom >= 0) e.preventDefault(); });
  grid.addEventListener('drop', (e) => {
    const t = e.target.closest('.ptile');
    if (dragFrom < 0 || !t) return;
    e.preventDefault();
    const to = Number(t.dataset.i);
    const [p] = photos.splice(dragFrom, 1); photos.splice(to, 0, p);
    dragFrom = -1; drawPhotos();
  });
  grid.addEventListener('dragend', () => { dragFrom = -1; grid.querySelectorAll('.dragging').forEach((x) => x.classList.remove('dragging')); });

  $('delBtn')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = '한 번 더 누르면 삭제돼요'; return; }
    await db.deleteVehicle(v.id);
    toast('차량을 삭제했어요.');
    location.hash = '#/';
  });

  $('editor').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = Object.fromEntries(['plate', 'maker', 'model', 'trim', 'year', 'mileage', 'fuel', 'transmission', 'color', 'accident', 'price', 'highlights', 'description'].map((k) => [k, String(f.get(k) || '').trim()]));
    data.mileage = data.mileage.replace(/[^\d]/g, '');
    data.price = data.price.replace(/[^\d]/g, '');
    if (!data.model) { $('model').focus(); toast('모델명을 입력해 주세요.'); return; }
    const next = e.submitter?.dataset.next;
    if (next === 'video' && !photos.length) { toast('영상을 만들려면 사진을 한 장 이상 올려 주세요.'); return; }
    await db.putVehicle({ ...v, ...data, photos });
    toast('저장했어요.');
    location.hash = next === 'video' ? `#/vehicle/${v.id}/video` : '#/';
  });
}

// ---------- 영상 만들기 ----------
async function renderStudio(id) {
  setNav('');
  const v = await db.getVehicle(id);
  if (!v) { location.hash = '#/'; return; }
  if (!v.photos?.length) { toast('사진을 먼저 올려 주세요.'); location.hash = `#/vehicle/${id}`; return; }
  const st = { ...STUDIO_DEFAULTS, cta: dealer.cta, ...(v.studio || {}) };
  if (v.studio && v.studio.music === false && !v.studio.musicTrack) st.musicTrack = 'none';
  if (!BACKGROUNDS[st.bg]) st.bg = 'orig';
  // 직접 올린 음악은 차량에 저장해 두고, 열 때 한 번 풀어 둔다
  let customBuffer = null;
  if (v.customMusic?.blob) {
    try { customBuffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await v.customMusic.blob.arrayBuffer()); } catch { customBuffer = null; }
  }
  if (st.musicTrack === 'custom' && !customBuffer) st.musicTrack = 'auto';
  const images = await Promise.all(v.photos.map((p) => createImageBitmap(p.blob)));
  const logo = dealer.logo ? await loadImage(dealer.logo).catch(() => null) : null;
  await Promise.all(['800 40px "Gothic A1"', '700 40px "Nanum Myeongjo"', '600 40px "IBM Plex Sans KR"'].map((f) => document.fonts.load(f).catch(() => null)));

  const facts = factCards(v);
  view.innerHTML = `
    <header class="page-head">
      <div>
        <p class="eyebrow"><a href="#/">대시보드</a> / <a href="#/vehicle/${v.id}">${esc(fmt.title(v))}</a> / 영상 만들기</p>
        <h1>영상 만들기</h1>
        ${v.source ? `<p class="hint">첫차 매물에서 가져온 정보예요. 가격·주행거리가 맞는지 확인해 주세요 · <a href="${esc(v.source.url)}" target="_blank" rel="noopener">원본 매물 보기</a></p>` : ''}
      </div>
      <a class="btn btn-quiet" href="#/vehicle/${v.id}">사진·정보 수정</a>
    </header>
    <div class="studio">
      <section class="stage-card">
        <div class="stage" id="stage" data-format="${st.format}">
          <canvas id="preview"></canvas>
        </div>
        <div class="player">
          <button class="icon-btn" id="playBtn" type="button" aria-label="일시정지"><svg viewBox="0 0 20 20" id="playIcon"><path d="M6 4h3v12H6zM11 4h3v12h-3z"/></svg></button>
          <input type="range" id="scrub" min="0" max="1000" value="0" aria-label="재생 위치">
          <span class="num time" id="timeText">0.0 / ${st.duration}초</span>
          <button class="icon-btn" id="soundBtn" type="button" aria-pressed="false" title="미리보기 소리 켜기"><svg viewBox="0 0 20 20"><path d="M3 8v4h3l4 3V5L6 8zM13.5 7.5a3.5 3.5 0 0 1 0 5"/></svg></button>
        </div>
        ${facts.length ? '' : '<p class="hint warn">연식·주행거리·강조 포인트를 넣으면 영상 중간에 정보 카드가 나와요. <a href="#/vehicle/' + v.id + '">정보 넣기</a></p>'}
      </section>

      <aside class="controls">
        <div class="group">
          <h3>만들 것</h3>
          <div class="seg seg-wide" id="outSeg">
            <button type="button" data-out="video" aria-selected="${st.output === 'video'}">영상</button>
            <button type="button" data-out="turntable" aria-selected="${st.output === 'turntable'}">턴테이블</button>
            <button type="button" data-out="slides" aria-selected="${st.output === 'slides'}">슬라이드</button>
            <button type="button" data-out="photos" aria-selected="${st.output === 'photos'}">매물 사진</button>
          </div>
          <p class="hint" id="outHint"></p>
          <div class="spin-pick" id="spinPick" hidden></div>
        </div>
        <div class="group" id="photoGroup">
          <h3>매물 사진</h3>
          <div class="seg seg-wide" id="sizeSeg">
            ${Object.entries(LISTING_SIZES).map(([k, z]) => `<button type="button" data-size="${k}" aria-selected="${k === st.photoSize}" title="${z.hint}">${z.label}</button>`).join('')}
          </div>
          <label class="switch"><input type="checkbox" id="enhanceSw" ${st.enhance ? 'checked' : ''}><span class="track"></span>자동 보정 (밝기·대비·색감)</label>
          <label class="switch"><input type="checkbox" id="sharpenSw" ${st.sharpen ? 'checked' : ''}><span class="track"></span>선명하게</label>
          <label class="switch"><input type="checkbox" id="bannerSw" ${st.banner ? 'checked' : ''}><span class="track"></span>상사 배너 (상사명·가격·연락처)</label>
        </div>
        <div class="group" id="fmtGroup">
          <h3>형식</h3>
          <div class="opts" id="formatOpts">${Object.entries(FORMATS).map(([k, f]) => `
            <button type="button" class="opt" data-format="${k}" aria-pressed="${k === st.format}">
              <span class="ratio r${k.replace(':', '-')}"></span><span><strong>${f.label}</strong><small>${f.hint}</small></span>
            </button>`).join('')}</div>
        </div>
        <div class="group" id="tplGroup">
          <h3>템플릿</h3>
          <div class="opts opts-tpl" id="tplOpts">${Object.entries(TEMPLATES).map(([k, t]) => `
            <button type="button" class="opt tpl tpl-${k}" data-template="${k}" aria-pressed="${k === st.template}">
              <span class="tpl-swatch"></span><span><strong>${t.label}</strong><small>${t.hint}</small></span>
            </button>`).join('')}</div>
        </div>
        <div class="group">
          <h3>배경</h3>
          <div class="opts" id="bgOpts">${Object.entries(BACKGROUNDS).map(([k, b]) => `
            <button type="button" class="opt" data-bg="${k}" aria-pressed="${k === st.bg}">
              ${b.theme ? `<canvas class="tpl-swatch bg-thumb" data-theme-bg="${k}" width="96" height="72"></canvas>` : `<span class="tpl-swatch bgsw-${k}"></span>`}<span><strong>${b.label}</strong><small>${b.hint}</small></span>
            </button>`).join('')}</div>
          <p class="hint" id="bgHint">${st.bg === 'orig' ? '' : '처음 한 번은 AI가 사진마다 배경을 지워요. 결과는 저장돼서 다음부터는 바로 나와요.'}</p>
        </div>
        <div class="group">
          <h3>번호판 가리기</h3>
          <div class="seg seg-wide" id="plateSeg">
            ${Object.entries(PLATE_MODES).map(([k, m]) => `<button type="button" data-plate="${k}" aria-selected="${k === st.plate}">${m.label}</button>`).join('')}
          </div>
          <p class="hint" id="plateHint"></p>
          <button type="button" class="btn btn-quiet btn-sm" id="plateEditBtn" hidden>번호판 위치 확인·수정</button>
        </div>
        <div class="group" id="durGroup">
          <h3>길이</h3>
          <div class="seg seg-wide" id="durSeg">
            ${[15, 30].map((d) => `<button type="button" data-d="${d}" aria-selected="${d === st.duration}">${d}초</button>`).join('')}
          </div>
        </div>
        <div class="group">
          <h3>내용</h3>
          <label class="switch"><input type="checkbox" id="showPrice" ${st.showPrice ? 'checked' : ''}><span class="track"></span>가격 보여주기</label>
          <div class="field"><label for="cta">마지막 장면 문구</label><input id="cta" value="${esc(st.cta)}" maxlength="24" placeholder="예: 지금 바로 문의하세요"></div>
        </div>
        <div class="group" id="musicGroup">
          <h3>배경음악</h3>
          <ul class="music-list" id="musicList"></ul>
          <div class="music-upload">
            <label class="btn btn-quiet btn-sm" for="musicFile">내 음악 파일 올리기</label>
            <input type="file" id="musicFile" accept="audio/*" hidden>
            <span class="hint">MP3·M4A·WAV</span>
          </div>
          <div class="field" id="offsetField" hidden>
            <label for="musicOffset">음악 시작 위치 <output class="num" id="musicOffsetOut"></output></label>
            <input type="range" id="musicOffset" min="0" max="0" step="1" value="0">
          </div>
          <p class="hint">기본 음악은 이 도구가 직접 만든 음원이라 저작권 걱정이 없어요. 직접 올린 음악은 저작권이 있으면 틱톡·인스타에서 소리가 꺼질 수 있어요.</p>
        </div>
        <button class="btn btn-primary btn-lg btn-block" id="renderBtn" type="button">영상 만들기</button>
        <p class="hint" id="renderHint">만드는 동안 영상 길이만큼 시간이 걸려요. 이 탭을 그대로 두세요.</p>
        <section class="result" id="result" hidden></section>
      </aside>
    </div>
    <div class="render-veil" id="veil" hidden>
      <div class="render-box">
        <div class="spinner"></div>
        <strong id="veilText">영상 만드는 중 0%</strong>
        <div class="bar"><span id="veilBar"></span></div>
        <p>다른 탭으로 옮기거나 창을 내리면 영상이 끊길 수 있어요.</p>
      </div>
    </div>`;

  const canvas = $('preview');
  const ctx = canvas.getContext('2d');
  let scene = null;
  let playing = true;
  let soundOn = false;
  let audio = null;
  let t0 = performance.now();
  let pausedAt = 0;
  let raf = 0;
  const PREVIEW_SCALE = 0.5;

  const save = () => db.putVehicle({ ...v, studio: { ...st } });
  // 사진 슬라이드는 사진을 모두 한 번씩 보여주는 길이로 미리보기·배경 지우기를 한다
  const slides = () => slidePlan(st.template, v.photos.length);
  const PHOTO_HOLD = 1.6;
  const effD = () => (st.output === 'slides' ? slides().duration : st.output === 'photos' ? Math.max(2, listing.length * PHOTO_HOLD) : st.duration);
  let listing = [];
  // 턴테이블은 배경을 지운 차가 있어야 해서 "원본 사진"을 골라도 화이트 쇼룸으로 만든다
  const bgNow = () => (st.output === 'turntable' && st.bg === 'orig' ? 'brand-light' : st.bg);
  const MAX_SPIN = 12;
  const syncOutputUI = () => {
    const isSlides = st.output === 'slides';
    const isSpin = st.output === 'turntable';
    $('durGroup').hidden = isSlides;
    $('musicGroup').hidden = isSlides;
    const isPhotos = st.output === 'photos';
    $('tplGroup').hidden = isSpin || isPhotos;
    $('fmtGroup').hidden = isPhotos;
    $('photoGroup').hidden = !isPhotos;
    if (isPhotos) { $('durGroup').hidden = true; $('musicGroup').hidden = true; }
    // 턴테이블에 쓸 사진 고르기(계기판처럼 잘못 들어간 사진을 뺀다)
    $('spinPick').hidden = !isSpin;
    if (isSpin) {
      $('spinPick').innerHTML = v.photos.map((p, i) => (isSpinPhoto(p) ? `<button type="button" data-spin="${i}" aria-pressed="${!p.noSpin}" title="눌러서 턴테이블에서 빼거나 넣기"><img src="${photoUrl(p)}" alt="사진 ${i + 1}"><span class="num">${i + 1}</span></button>` : '')).join('');
    }
    $('renderBtn').textContent = isSlides ? `사진 슬라이드 만들기 (${slides().times.length}장)` : isSpin ? '턴테이블 영상 만들기' : isPhotos ? `매물 사진 ${listing.length}장 저장` : '영상 만들기';
    $('renderHint').textContent = isSlides
      ? '표지·사진마다 한 장·마무리 한 장으로 만들어요. 틱톡 사진 게시물은 최대 35장이고 음악은 틱톡에서 고르면 돼요.'
      : '만드는 동안 영상 길이만큼 시간이 걸려요. 이 탭을 그대로 두세요.';
    if (isPhotos) $('renderHint').textContent = '매물 등록용 사진을 보정해 한 번에 ZIP으로 저장해요. 실내 사진은 배경을 그대로 두고 보정만 해요.';
    $('outHint').textContent = isPhotos ? '보배드림·엔카·첫차에 올릴 매물 사진을 보정·쇼룸 배경·번호판 가리기·상사 배너까지 한 번에 만들어요.' : isSlides ? '넘겨 보는 사진 게시물(틱톡 사진 모드·인스타 캐러셀)용 이미지를 만들어요.'
      : isSpin ? `쇼룸 회전 무대 위에서 차가 돌아가는 영상이에요. 외관 사진 ${spinCount}장을 사진 순서대로 돌려요(앞 → 사선 → 옆 → 뒤 순서로 놓으면 자연스러워요). 미리보기를 손으로 끌면 360°로 돌려볼 수 있어요.` : '';
  };

  // 상사 쇼룸 배경: 사진마다 배경을 지운 마스크를 만들어 저장하고, 영상 비율에 맞는 쇼룸 사진으로 합성한다
  let sceneImages = images;
  let studioSet = new Set();
  const cutouts = new Map();
  const composites = new Map();
  const veilShow = (text, ratio) => { $('veil').hidden = false; $('veilText').textContent = text; $('veilBar').style.width = `${Math.round((ratio || 0) * 100)}%`; };
  // 영상에 나오는 사진. 턴테이블은 외관 사진을 모두 쓴다
  const usedSet = () => new Set(st.output === 'turntable' || st.output === 'photos' ? v.photos.map((_, i) => i).slice(0, MAX_SPIN * 2) : usedPhotoIndices(st.template, effD(), v.photos.length));
  let spinCount = 0;
  let spinItems = [];
  const photoIsInterior = async (p) => {
    if (p.exterior === undefined) {
      try { p.exterior = await isExterior(p.blob, { onProgress: (r) => veilShow(`사진 판별 AI 준비 중 ${Math.round(r * 100)}%`, r) }); }
      catch { p.exterior = null; }
    }
    if (p.exterior === false) return true;
    if (p.exterior === true) return false;
    return p.maskBlob ? looksLikeInterior(p.maskBlob) : false;
  };
  const ensureMasks = async () => {
    // 영상에 나오는 사진만 배경을 지운다(사진이 많은 매물도 빨리 끝나게)
    const used = usedSet();
    const todo = v.photos.map((p, i) => [p, i]).filter(([p, i]) => used.has(i) && !p.keepBg && !p.maskBlob);
    if (!todo.length) return;
    try {
      for (let k = 0; k < todo.length; k++) {
        const [p, i] = todo[k];
        veilShow(`배경 지우는 중 ${k + 1} / ${todo.length}`, k / todo.length);
        p.maskBlob = await makeMask(p.blob, images[i].width, images[i].height, {
          onProgress: (r) => veilShow(`AI 준비 중 ${Math.round(r * 100)}% (처음 한 번만 내려받아요)`, r),
        });
        // 실내·엔진룸·계기판 사진은 원본을 쓴다(AI 분류, 안 되면 잘라낸 모양으로 판단)
        if (await photoIsInterior(p)) { p.keepBg = true; p.autoKeep = true; }
      }
      await db.putVehicle({ ...v, studio: { ...st } });
    } finally {
      $('veil').hidden = true;
    }
  };
  // 번호판 가리기: 영상에 나오는 사진에서 처음 한 번 번호판을 찾아 저장한다
  const ensurePlates = async () => {
    if (st.plate === 'off') return;
    const used = usedSet();
    const todo = v.photos.map((p, i) => [p, i]).filter(([p, i]) => used.has(i) && p.plate === undefined && !p.keepBg);
    if (!todo.length) return;
    try {
      for (let k = 0; k < todo.length; k++) {
        const [p] = todo[k];
        veilShow(`번호판 찾는 중 ${k + 1} / ${todo.length}`, k / todo.length);
        // 실내 사진(계기판 숫자 등)은 번호판으로 잘못 잡지 않게 건너뛴다
        if (await photoIsInterior(p)) { p.plate = null; continue; }
        p.plate = await detectPlate(p.blob, { onProgress: (r) => veilShow(`번호판 AI 준비 중 ${Math.round(r * 100)}% (처음 한 번만 내려받아요)`, r) });
        p.plateAuto = true;
      }
      await db.putVehicle({ ...v, studio: { ...st } });
    } finally {
      $('veil').hidden = true;
    }
  };
  let plateArt = null;
  const plateKey = (p) => (st.plate !== 'off' && p.plate ? `${st.plate}:${p.plate.map((c) => c.map((n) => n.toFixed(4)).join(',')).join(';')}` : '');
  const based = new Map();
  const baseOf = (p, i) => {
    const pk = plateKey(p);
    if (!pk) return images[i];
    const key = `${p.id}|${pk}`;
    if (!based.has(key)) {
      if (st.plate === 'dealer' && !plateArt) plateArt = dealerPlateCanvas(dealer);
      based.set(key, applyPlate(images[i], p.plate, st.plate, dealer, plateArt));
    }
    return based.get(key);
  };
  const syncPlateUI = () => {
    const found = v.photos.filter((p) => p.plate).length;
    const checked = v.photos.filter((p) => p.plate !== undefined).length;
    $('plateEditBtn').hidden = st.plate === 'off';
    $('plateHint').textContent = st.plate === 'off' ? '번호판을 상사 번호판이나 모자이크로 덮어요. AI가 사진마다 위치를 찾아요.'
      : `${checked}장 중 ${found}장에서 번호판을 찾았어요. 틀린 곳은 "위치 확인·수정"에서 고치세요.${st.plate === 'dealer' && !dealer.name ? ' 상사 설정에 상사명을 넣으면 번호판에 들어가요.' : ''}`;
  };
  const prepareImages = async () => {
    // 쇼룸 배경이면 배경 지우기를 먼저 해서 실내 사진을 가려낸 뒤 번호판을 찾는다
    if (bgNow() !== 'orig') await ensureMasks();
    await ensurePlates();
    syncPlateUI();
    if (bgNow() === 'orig') {
      sceneImages = v.photos.map((p, i) => baseOf(p, i)); studioSet = new Set();
      if (st.output === 'photos') listing = await buildListing();
      return;
    }
    const theme = themeOf(bgNow());
    if (st.output === 'photos') { listing = await buildListing(); return; }
    if (st.output === 'turntable') {
      const idx = v.photos.map((p, i) => i).filter((i) => isSpinPhoto(v.photos[i]) && !v.photos[i].noSpin).slice(0, MAX_SPIN);
      spinItems = await Promise.all(idx.map(async (i) => {
        const p = v.photos[i];
        const ck = `${p.id}|${plateKey(p)}`;
        if (!cutouts.has(ck)) cutouts.set(ck, await loadCutout(baseOf(p, i), p.maskBlob));
        return cutouts.get(ck);
      }));
      spinCount = spinItems.length;
      return;
    }
    const { w, h } = FORMATS[st.format];
    const sign = { name: dealer.name, sub: dealer.signSub, logo };
    const set = new Set();
    sceneImages = await Promise.all(v.photos.map(async (p, i) => {
      if (p.keepBg || !p.maskBlob) return baseOf(p, i);
      set.add(i);
      const pk = plateKey(p);
      const key = `${p.id}|${bgNow()}|${st.format}|${pk}|${dealer.color}`;
      if (!composites.has(key)) {
        const ck = `${p.id}|${pk}`;
        if (!cutouts.has(ck)) cutouts.set(ck, await loadCutout(baseOf(p, i), p.maskBlob));
        composites.set(key, composeShowroom(cutouts.get(ck), w, h, theme, sign));
      }
      return composites.get(key);
    }));
    studioSet = set;
  };
  // 매물 사진: 사진마다 보정·배경·번호판·배너를 적용한 등록용 사진
  const MAX_LISTING = 30;
  const listingCache = new Map();
  const listingPhoto = async (p, i) => {
    const { w: W, h: H } = LISTING_SIZES[st.photoSize] || LISTING_SIZES['4:3'];
    const showroom = bgNow() !== 'orig' && p.maskBlob && !p.keepBg;
    const key = [p.id, plateKey(p), showroom ? bgNow() : 'orig', st.photoSize, st.enhance, st.sharpen, st.banner, st.showPrice, dealer.color, dealer.name, dealer.phone].join('|');
    if (listingCache.has(key)) return listingCache.get(key);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    if (showroom) {
      const ck = `${p.id}|${plateKey(p)}`;
      if (!cutouts.has(ck)) cutouts.set(ck, await loadCutout(baseOf(p, i), p.maskBlob));
      let item = cutouts.get(ck);
      const f = st.enhance ? autoToneFilter(item.cut) : 'none';
      if (f !== 'none') {
        const e = document.createElement('canvas');
        e.width = item.w; e.height = item.h;
        const ex = e.getContext('2d'); ex.filter = f; ex.drawImage(item.cut, 0, 0);
        item = { ...item, cut: e };
      }
      x.drawImage(composeShowroom(item, W, H, themeOf(bgNow()), { name: dealer.name, sub: dealer.signSub, logo }), 0, 0);
    } else {
      const base = baseOf(p, i);
      drawCover(x, base, W, H, st.enhance ? autoToneFilter(base) : 'none');
    }
    if (st.sharpen) sharpen(c, 0.4);
    if (st.banner) drawBanner(x, W, H, { dealer, logo, vehicle: v, showPrice: st.showPrice });
    listingCache.set(key, c);
    return c;
  };
  const buildListing = async () => {
    const out = [];
    const n = Math.min(v.photos.length, MAX_LISTING);
    try {
      for (let i = 0; i < n; i++) {
        if (n > 4) veilShow(`매물 사진 보정 중 ${i + 1} / ${n}`, i / n);
        out.push(await listingPhoto(v.photos[i], i));
      }
    } finally { $('veil').hidden = true; }
    return out;
  };
  const listingScene = () => {
    const { w: W, h: H } = LISTING_SIZES[st.photoSize] || LISTING_SIZES['4:3'];
    return {
      W, H, duration: effD(), template: 'photos',
      draw(ctx, t) {
        if (!listing.length) return;
        const i = Math.min(listing.length - 1, Math.floor(t / PHOTO_HOLD));
        ctx.drawImage(listing[i], 0, 0);
        const u = W / 100;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath(); ctx.roundRect(u * 2, u * 2, u * 9, u * 4.4, u * 2.2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `700 ${u * 2.4}px ${'"IBM Plex Sans KR", sans-serif'}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${i + 1} / ${listing.length}`, u * 6.5, u * 4.3);
      },
    };
  };
  const makeScene = () => (st.output === 'photos' ? listingScene() : st.output === 'turntable' && spinItems.length
    ? createTurntableScene({ items: spinItems, theme: themeOf(bgNow()), sign: { name: dealer.name, sub: dealer.signSub, logo }, vehicle: v, dealer: { ...dealer, cta: st.cta }, format: st.format, duration: effD(), showPrice: st.showPrice })
    : createScene(sceneOpts()));
  const sceneOpts = () => ({ vehicle: v, images: sceneImages, studio: studioSet, dealer: { ...dealer, cta: st.cta }, logo, template: st.template, format: st.format, duration: effD(), showPrice: st.showPrice });
  let buildToken = 0;
  const build = async () => {
    const token = ++buildToken;
    try { await prepareImages(); }
    catch (err) {
      toast(`배경을 지우지 못했어요: ${err.message}`);
      st.bg = 'orig'; save();
      $('bgOpts').querySelectorAll('[data-bg]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.bg === 'orig')));
      sceneImages = images; studioSet = new Set();
    }
    if (token !== buildToken) return;
    $('bgHint').textContent = bgNow() === 'orig' ? '' : st.bg === 'orig' ? '턴테이블은 배경을 지운 차가 필요해서 화이트 쇼룸으로 만들어요. 다른 쇼룸을 골라도 돼요.' : '배경을 지운 결과는 저장돼서 다음부터는 바로 나와요. 실내 사진은 차량 편집에서 "실내"를 눌러 두세요.';
    if (st.output === 'turntable' && !spinItems.length) toast('턴테이블에 쓸 외관 사진이 없어요. 실내가 아닌 차 외관 사진을 올려 주세요.');
    scene = makeScene();
    canvas.width = scene.W * PREVIEW_SCALE; canvas.height = scene.H * PREVIEW_SCALE;
    $('stage').dataset.format = st.format;
    if (playing) restart();
    else pausedAt = Math.min(pausedAt, effD() - 0.01);
    syncOutputUI();
  };
  // 고른 배경음악을 dest로 튼다. offset은 영상 안에서의 시작 시점(미리보기 중간부터 들을 때)
  const styleOf = (id) => (id === 'auto' || id === 'custom' ? st.template : id);
  const playSelected = (ac, dest, duration, offset = 0) => {
    if (st.musicTrack === 'none') return null;
    if (st.musicTrack === 'custom' && customBuffer) return playBuffer(ac, dest, customBuffer, duration, st.musicOffset + offset);
    return playMusic(ac, dest, styleOf(st.musicTrack), duration);
  };
  let sample = null;
  const stopSample = () => { clearTimeout(sample?.timer); sample?.track?.stop(); sample?.ac.close(); sample = null; document.querySelectorAll('.mplay[aria-pressed="true"]').forEach((b) => { b.setAttribute('aria-pressed', 'false'); b.textContent = '▶'; }); };
  const playSample = (id, btn) => {
    const same = sample && sample.id === id;
    stopSample();
    if (same) return;
    const ac = new AudioContext();
    const track = id === 'custom' ? playBuffer(ac, ac.destination, customBuffer, 10, st.musicOffset) : playMusic(ac, ac.destination, styleOf(id), 10);
    sample = { id, ac, track, timer: setTimeout(stopSample, 10000) };
    btn.setAttribute('aria-pressed', 'true'); btn.textContent = '■';
  };
  const drawMusicList = () => {
    const rows = [
      { id: 'auto', name: '템플릿에 맞춤', mood: `${TEMPLATES[st.template].label} 템플릿 기본 음악` },
      ...MUSIC_TRACKS.map((t) => ({ ...t, mood: `${t.mood} · ${t.bpm} BPM` })),
      ...(customBuffer ? [{ id: 'custom', name: v.customMusic.name, mood: `내 음악 · ${Math.round(customBuffer.duration)}초` }] : []),
      { id: 'none', name: '음악 없음', mood: '소리 없이 만들어요' },
    ];
    $('musicList').innerHTML = rows.map((r) => `
      <li>
        <button type="button" class="mtrack" data-track="${r.id}" aria-pressed="${r.id === st.musicTrack}"><strong>${esc(r.name)}</strong><small>${esc(r.mood)}</small></button>
        ${r.id === 'none' ? '' : `<button type="button" class="mplay" data-play="${r.id}" aria-pressed="false" aria-label="${esc(r.name)} 미리 듣기">▶</button>`}
      </li>`).join('');
    const showOffset = st.musicTrack === 'custom' && customBuffer;
    $('offsetField').hidden = !showOffset;
    if (showOffset) {
      const max = Math.max(0, Math.floor(customBuffer.duration - 5));
      $('musicOffset').max = String(max);
      $('musicOffset').value = String(Math.min(st.musicOffset, max));
      $('musicOffsetOut').textContent = `${Math.floor(st.musicOffset / 60)}:${String(Math.floor(st.musicOffset % 60)).padStart(2, '0')}`;
    }
  };
  const stopAudio = () => { audio?.track?.stop(); audio?.ctx.close(); audio = null; };
  const startAudio = () => {
    stopAudio();
    if (!soundOn || !playing) return;
    const ac = new AudioContext();
    const offset = currentTime();
    audio = { ctx: ac, track: playSelected(ac, ac.destination, Math.max(0.5, effD() - offset), offset) };
  };
  const currentTime = () => (playing ? ((performance.now() - t0) / 1000) % effD() : pausedAt);
  const restart = () => { t0 = performance.now(); pausedAt = 0; startAudio(); };
  let lastLoop = 0;
  const loop = () => {
    const t = currentTime();
    if (playing && t < lastLoop) startAudio();   // 한 바퀴 돌면 음악도 처음부터
    lastLoop = t;
    ctx.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
    scene.draw(ctx, t);
    $('scrub').value = String(Math.round((t / effD()) * 1000));
    $('timeText').textContent = `${t.toFixed(1)} / ${Math.round(effD())}초`;
    raf = requestAnimationFrame(loop);
  };
  await build();
  raf = requestAnimationFrame(loop);
  cleanup = () => { cancelAnimationFrame(raf); stopAudio(); stopSample?.(); images.forEach((b) => b.close?.()); };

  const setPlaying = (on) => {
    if (on === playing) return;
    if (on) { t0 = performance.now() - pausedAt * 1000; playing = true; startAudio(); }
    else { pausedAt = currentTime(); playing = false; stopAudio(); }
    $('playIcon').innerHTML = playing ? '<path d="M6 4h3v12H6zM11 4h3v12h-3z"/>' : '<path d="M6 4l10 6-10 6z"/>';
    $('playBtn').setAttribute('aria-label', playing ? '일시정지' : '재생');
  };
  $('playBtn').addEventListener('click', () => setPlaying(!playing));
  // 턴테이블 미리보기는 손으로 끌어 360°로 돌려볼 수 있다
  let spinDrag = null;
  $('stage').addEventListener('pointerdown', (e) => {
    if (st.output !== 'turntable' || !scene?.spinRange) return;
    setPlaying(false);
    $('stage').setPointerCapture(e.pointerId);
    spinDrag = { x: e.clientX, t: Math.min(Math.max(pausedAt, scene.spinRange[0]), scene.spinRange[1] - 0.01) };
  });
  $('stage').addEventListener('pointermove', (e) => {
    if (!spinDrag) return;
    const [a, b] = scene.spinRange;
    const span = b - a, w = $('stage').clientWidth || 1;
    let t = spinDrag.t - ((e.clientX - spinDrag.x) / w) * span * 0.8;
    t = a + ((((t - a) % span) + span) % span);
    pausedAt = Math.min(t, b - 0.01);
  });
  const endSpin = () => { spinDrag = null; };
  $('stage').addEventListener('pointerup', endSpin);
  $('stage').addEventListener('pointercancel', endSpin);
  $('scrub').addEventListener('input', (e) => {
    setPlaying(false);
    pausedAt = (Number(e.target.value) / 1000) * effD();
  });
  $('soundBtn').addEventListener('click', (e) => {
    soundOn = !soundOn;
    e.currentTarget.setAttribute('aria-pressed', String(soundOn));
    if (soundOn && st.musicTrack === 'none') toast('배경음악을 "음악 없음"으로 골랐어요.');
    startAudio();
  });

  const pick = (groupId, attr, key, cast = (x) => x) => $(groupId).addEventListener('click', (e) => {
    const b = e.target.closest(`[data-${attr}]`);
    if (!b) return;
    st[key] = cast(b.dataset[attr]);
    $(groupId).querySelectorAll(`[data-${attr}]`).forEach((x) => x.setAttribute(x.classList.contains('opt') ? 'aria-pressed' : 'aria-selected', String(x === b)));
    save(); build();
  });
  pick('formatOpts', 'format', 'format');
  pick('tplOpts', 'template', 'template');
  $('tplOpts').addEventListener('click', () => drawMusicList());
  pick('bgOpts', 'bg', 'bg');
  pick('plateSeg', 'plate', 'plate');
  $('plateEditBtn').addEventListener('click', () => {
    const urls = v.photos.map((p) => photoUrl(p));
    const indices = v.photos.map((p, i) => i).filter((i) => !v.photos[i].keepBg);
    openPlateEditor({ photos: v.photos, urls, indices, start: indices.find((i) => v.photos[i].plate) ?? indices[0],
      onDone: async (changed) => { if (changed) { await db.putVehicle({ ...v, studio: { ...st } }); build(); } } });
  });
  // 쇼룸 배경 고르기 칸에 실제 배경을 작게 그려 보여준다
  document.querySelectorAll('[data-theme-bg]').forEach((c) => {
    const x = c.getContext('2d');
    x.save(); x.scale(c.width / 480, c.height / 360);
    drawBrandStudio(x, 480, 360, 360 * 0.62, themeOf(c.dataset.themeBg), { name: dealer.name || 'SHOWROOM' });
    x.restore();
  });
  pick('durSeg', 'd', 'duration', Number);
  pick('outSeg', 'out', 'output');
  pick('sizeSeg', 'size', 'photoSize');
  [['enhanceSw', 'enhance'], ['sharpenSw', 'sharpen'], ['bannerSw', 'banner']].forEach(([id, k]) => $(id).addEventListener('change', (e) => { st[k] = e.target.checked; save(); build(); }));
  $('spinPick').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-spin]');
    if (!b) return;
    const p = v.photos[Number(b.dataset.spin)];
    p.noSpin = !p.noSpin;
    await db.putVehicle({ ...v, studio: { ...st } });
    build();
  });
  $('showPrice').addEventListener('change', (e) => { st.showPrice = e.target.checked; save(); build(); });
  drawMusicList();
  $('musicList').addEventListener('click', (e) => {
    const play = e.target.closest('[data-play]');
    if (play) { playSample(play.dataset.play, play); return; }
    const b = e.target.closest('[data-track]');
    if (!b) return;
    st.musicTrack = b.dataset.track;
    save(); drawMusicList(); startAudio();
  });
  $('musicFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 30 * 1048576) { toast('30MB보다 작은 음악 파일을 올려 주세요.'); return; }
    try {
      customBuffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await f.arrayBuffer());
    } catch { toast('이 음악 파일을 열 수 없어요. MP3나 M4A로 올려 주세요.'); return; }
    v.customMusic = { name: f.name.replace(/\.[^.]+$/, ''), blob: f };
    st.musicTrack = 'custom'; st.musicOffset = 0;
    await db.putVehicle({ ...v, studio: { ...st } });
    drawMusicList(); startAudio();
    toast('음악을 넣었어요. 시작 위치를 정할 수 있어요.');
  });
  $('musicOffset').addEventListener('input', (e) => { st.musicOffset = Number(e.target.value); drawMusicList(); });
  $('musicOffset').addEventListener('change', () => { save(); startAudio(); });
  $('cta').addEventListener('input', (e) => { st.cta = e.target.value; save(); build(); });

  $('renderBtn').addEventListener('click', async () => {
    if (st.output === 'slides') { await makeSlides(); return; }
    if (st.output === 'photos') { await makeListing(); return; }
    if (!window.MediaRecorder) { toast('이 브라우저는 영상 저장을 지원하지 않아요. 크롬에서 열어 주세요.'); return; }
    setPlaying(false);
    const veil = $('veil');
    veil.hidden = false;
    try {
      const fresh = makeScene();
      const { blob, ext } = await recordScene(fresh, {
        audio: st.musicTrack === 'none' ? null : (ac, dest, d) => playSelected(ac, dest, d, 0),
        onProgress: (p) => { $('veilText').textContent = `영상 만드는 중 ${Math.round(p * 100)}%`; $('veilBar').style.width = `${p * 100}%`; },
      });
      await db.putVehicle({ ...v, studio: { ...st }, videoAt: Date.now(), videoFormat: st.format });
      showResult(blob, ext);
    } catch (err) {
      toast(`영상을 만들지 못했어요: ${err.message}`);
    } finally {
      veil.hidden = true;
    }
  });

  const makeListing = async () => {
    setPlaying(false);
    if (!listing.length) { toast('사진을 먼저 올려 주세요.'); return; }
    try {
      const blobs = [];
      for (let i = 0; i < listing.length; i++) {
        veilShow(`매물 사진 저장 준비 ${i + 1} / ${listing.length}`, i / listing.length);
        blobs.push(await new Promise((r) => listing[i].toBlob(r, 'image/jpeg', 0.92)));
      }
      await db.putVehicle({ ...v, studio: { ...st }, videoAt: Date.now(), videoFormat: `매물 사진 ${blobs.length}장` });
      showSlides(blobs, { kind: 'listing' });
    } finally { $('veil').hidden = true; }
  };
  let slideUrls = [];
  const makeSlides = async () => {
    setPlaying(false);
    const plan = slides();
    try {
      const blobs = await renderSlides(createScene(sceneOpts()), plan.times, {
        onProgress: (n, total) => veilShow(`사진 슬라이드 만드는 중 ${n} / ${total}`, n / total),
      });
      await db.putVehicle({ ...v, studio: { ...st }, videoAt: Date.now(), videoFormat: `${st.format} 슬라이드` });
      showSlides(blobs);
    } catch (err) {
      toast(`사진 슬라이드를 만들지 못했어요: ${err.message}`);
    } finally {
      $('veil').hidden = true;
    }
  };
  const showSlides = (blobs, { kind = 'slides' } = {}) => {
    const isListing = kind === 'listing';
    slideUrls.forEach((u) => URL.revokeObjectURL(u));
    slideUrls = blobs.map((b) => URL.createObjectURL(b));
    const base = `${(v.plate || fmt.title(v)).replace(/[\\/:*?"<>|\s]+/g, '_')}_${(isListing ? st.photoSize : st.format).replace(':', 'x')}`;
    const files = blobs.map((b, i) => new File([b], `${base}_${String(i + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }));
    const canShare = !!(navigator.canShare && navigator.canShare({ files: files.slice(0, 1) }));
    const r = $('result');
    r.hidden = false;
    r.innerHTML = `
      <h3>${isListing ? '완성된 매물 사진' : '완성된 사진 슬라이드'} <span class="num">${blobs.length}장</span></h3>
      <ol class="slide-grid" data-format="${isListing ? '16:9' : st.format}">${slideUrls.map((u, i) => `<li><img src="${u}" alt="슬라이드 ${i + 1}"><span class="num">${i + 1}</span></li>`).join('')}</ol>
      ${canShare ? `<button class="btn btn-primary btn-block" id="shareBtn" type="button">${isListing ? '휴대폰에서 바로 공유' : '휴대폰에서 바로 공유 (틱톡·인스타)'}</button>` : ''}
      <button class="btn ${canShare ? 'btn-quiet' : 'btn-primary'} btn-block" id="zipBtn" type="button">사진 ${blobs.length}장 저장 (ZIP)</button>
      <div class="field"><label for="caption">게시 문구</label><textarea id="caption" rows="8">${esc(buildCaption(v))}</textarea></div>
      <button class="btn btn-quiet btn-block" id="copyBtn" type="button">게시 문구 복사</button>
      ${isListing ? `<p class="hint">파일 이름 순서가 사진 순서예요. 매물 등록 화면에서 한꺼번에 골라 올리세요.</p>
      <div class="channels">
        <a href="https://www.bobaedream.co.kr/" target="_blank" rel="noopener">보배드림</a>
        <a href="https://www.encar.com/" target="_blank" rel="noopener">엔카</a>
        <a href="https://web.chutcha.net/" target="_blank" rel="noopener">첫차</a>
      </div>` : `<p class="hint">틱톡 스튜디오의 "사진 올리기"에서 순서대로 고르면 넘겨 보는 사진 게시물이 돼요. 음악은 틱톡에서 고르세요.</p>
      <div class="channels">
        <a href="https://www.tiktok.com/tiktokstudio/upload" target="_blank" rel="noopener">틱톡 사진 올리기</a>
        <a href="https://www.instagram.com/" target="_blank" rel="noopener">인스타 캐러셀</a>
        <a href="https://www.youtube.com/upload" target="_blank" rel="noopener">유튜브 커뮤니티</a>
      </div>`}`;
    $('zipBtn').addEventListener('click', async () => {
      if (!window.JSZip) { toast('압축 도구를 불러오지 못했어요. 새로고침해 주세요.'); return; }
      const zip = new JSZip();
      files.forEach((f) => zip.file(f.name, f));
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `${base}_${isListing ? 'photos' : 'slides'}.zip`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
    $('shareBtn')?.addEventListener('click', async () => {
      try { await navigator.share({ files, title: fmt.title(v), text: buildCaption(v) }); }
      catch (err) { if (err.name !== 'AbortError') toast('공유하지 못했어요. ZIP으로 저장해 올려 주세요.'); }
    });
    $('copyBtn').addEventListener('click', async () => {
      const ta = $('caption');
      try { await navigator.clipboard.writeText(ta.value); toast('게시 문구를 복사했어요.'); }
      catch { ta.select(); toast('문구를 선택했어요. Ctrl+C로 복사하세요.'); }
    });
    r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  let resultUrl = '';
  const showResult = (blob, ext) => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    const name = `${(v.plate || fmt.title(v)).replace(/[\\/:*?"<>|\s]+/g, '_')}_${st.template}_${st.format.replace(':', 'x')}.${ext}`;
    const caption = buildCaption(v);
    const r = $('result');
    r.hidden = false;
    r.innerHTML = `
      <h3>완성된 영상</h3>
      <video src="${resultUrl}" controls playsinline class="result-video" data-format="${st.format}"></video>
      <p class="hint"><span class="num">${esc(name)} · ${(blob.size / 1048576).toFixed(1)}MB</span>${ext === 'webm' ? '<br>이 브라우저는 MP4로 저장할 수 없어 WebM으로 만들었어요. 인스타·틱톡에 올리려면 최신 크롬이나 엣지에서 다시 만들어 주세요(유튜브는 WebM도 올라가요).' : ''}</p>
      <a class="btn btn-primary btn-block" href="${resultUrl}" download="${esc(name)}">영상 저장하기</a>
      <div class="field"><label for="caption">게시 문구</label><textarea id="caption" rows="8">${esc(caption)}</textarea></div>
      <button class="btn btn-quiet btn-block" id="copyBtn" type="button">게시 문구 복사</button>
      <p class="hint">저장한 영상을 아래에서 올리세요.</p>
      <div class="channels">
        <a href="https://www.youtube.com/upload" target="_blank" rel="noopener">유튜브 쇼츠</a>
        <a href="https://www.instagram.com/" target="_blank" rel="noopener">인스타 릴스</a>
        <a href="https://www.tiktok.com/upload" target="_blank" rel="noopener">틱톡</a>
      </div>`;
    $('copyBtn').addEventListener('click', async () => {
      const ta = $('caption');
      try { await navigator.clipboard.writeText(ta.value); toast('게시 문구를 복사했어요.'); }
      catch { ta.select(); toast('문구를 선택했어요. Ctrl+C로 복사하세요.'); }
    });
    r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const prevCleanup = cleanup;
  cleanup = () => { prevCleanup(); if (resultUrl) URL.revokeObjectURL(resultUrl); slideUrls.forEach((u) => URL.revokeObjectURL(u)); };
}

function buildCaption(v) {
  const tag = (s) => `#${String(s).replace(/[^\p{L}\p{N}_]/gu, '')}`;
  const lines = [`🚗 ${fmt.title(v)}${v.year ? ` | ${v.year}` : ''}`];
  const facts = [v.price ? fmt.price(v.price) : '', fmt.km(v.mileage), v.fuel, v.accident].filter(Boolean);
  if (facts.length) lines.push(`💰 ${facts.join(' · ')}`);
  (v.highlights || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean).forEach((h) => lines.push(`✔ ${h}`));
  if (v.description) lines.push('', v.description.slice(0, 300));
  if (dealer.name || dealer.phone) lines.push('', `📞 ${[dealer.name, dealer.phone].filter(Boolean).join(' ')}`);
  if (dealer.region) lines.push(`📍 ${dealer.region}`);
  const tags = new Set([...(dealer.hashtags || '').split(/\s+/).filter(Boolean).map(tag), v.maker && tag(v.maker), v.model && tag(v.model), v.maker && v.model && tag(v.maker + v.model)].filter(Boolean));
  lines.push('', [...tags].join(' '));
  return lines.join('\n');
}

// ---------- 상사 설정 ----------
async function renderSettings() {
  setNav('settings');
  const swatches = ['#df5419', '#1f6feb', '#0f8a5f', '#7c3aed', '#c8a45c', '#15181c'];
  view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">상사 설정</p><h1>상사 정보</h1></div></header>
    <form class="card settings" id="settingsForm">
      <p class="hint">한 번 넣어 두면 모든 영상의 배지·마지막 장면·게시 문구에 자동으로 들어가요.</p>
      <div class="grid2">
        <div class="field"><label for="sName">상사명</label><input id="sName" value="${esc(dealer.name)}" placeholder="예: 한빛모터스" maxlength="24"></div>
        <div class="field"><label for="sPhone">연락처</label><input id="sPhone" type="tel" value="${esc(dealer.phone)}" placeholder="예: 010-1234-5678" maxlength="20"></div>
        <div class="field"><label for="sRegion">지역</label><input id="sRegion" value="${esc(dealer.region)}" placeholder="예: 서울 강서구 오토랜드" maxlength="40"></div>
        <div class="field"><label for="sCta">마지막 장면 기본 문구</label><input id="sCta" value="${esc(dealer.cta)}" maxlength="24"></div>
        <div class="field"><label for="sSignSub">쇼룸 간판 아래 문구</label><input id="sSignSub" value="${esc(dealer.signSub)}" placeholder="예: 수입차 전문 · 무사고 보증" maxlength="30"></div>
      </div>
      <div class="field">
        <span class="label">브랜드 색</span>
        <div class="swatch-row" id="swRow">
          ${swatches.map((c) => `<button type="button" class="csw" data-c="${c}" style="--c:${c}" aria-pressed="${c === dealer.color}" aria-label="${c}"></button>`).join('')}
          <label class="csw csw-custom" title="직접 고르기"><input type="color" id="sColor" value="${esc(dealer.color)}"></label>
        </div>
      </div>
      <div class="field">
        <span class="label">로고</span>
        <div class="logo-row">
          <span class="logo-box" id="logoBox">${dealer.logo ? `<img src="${dealer.logo}" alt="로고">` : '없음'}</span>
          <label class="btn btn-quiet btn-sm" for="logoInput">로고 올리기</label>
          <button type="button" class="btn btn-quiet btn-sm" id="logoClear" ${dealer.logo ? '' : 'hidden'}>빼기</button>
          <input type="file" id="logoInput" accept="image/*" hidden>
        </div>
      </div>
      <div class="field"><label for="sTags">기본 해시태그</label><input id="sTags" value="${esc(dealer.hashtags)}" placeholder="띄어쓰기로 구분"><p class="hint"># 없이 띄어쓰기로 구분해서 쓰세요. 제조사·모델 해시태그는 자동으로 붙어요.</p></div>
      <div class="brand-preview" id="brandPreview"></div>
      <div class="editor-actions"><span></span><button class="btn btn-primary" type="submit">저장</button></div>
    </form>`;
  let logo = dealer.logo;
  let color = dealer.color;
  const preview = () => {
    $('brandPreview').innerHTML = `
      <span class="bp-badge">${logo ? `<img src="${logo}" alt="">` : ''}${esc($('sName').value || '상사명')}</span>
      <span class="bp-btn" style="background:${esc(color)}">${esc($('sCta').value || '지금 바로 문의하세요')}</span>
      <span class="bp-phone num">${esc($('sPhone').value || '010-0000-0000')}</span>`;
  };
  preview();
  ['sName', 'sPhone', 'sCta'].forEach((id) => $(id).addEventListener('input', preview));
  $('swRow').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    color = b.dataset.c; $('sColor').value = color;
    document.querySelectorAll('#swRow [data-c]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    preview();
  });
  $('sColor').addEventListener('input', (e) => {
    color = e.target.value;
    document.querySelectorAll('#swRow [data-c]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    preview();
  });
  $('logoInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    logo = c.toDataURL('image/png');
    $('logoBox').innerHTML = `<img src="${logo}" alt="로고">`;
    $('logoClear').hidden = false;
    preview();
  });
  $('logoClear').addEventListener('click', () => { logo = ''; $('logoBox').textContent = '없음'; $('logoClear').hidden = true; preview(); });
  $('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    dealer = { ...dealer, name: $('sName').value.trim(), phone: $('sPhone').value.trim(), region: $('sRegion').value.trim(), cta: $('sCta').value.trim() || DEALER_DEFAULTS.cta, hashtags: $('sTags').value.trim(), signSub: $('sSignSub').value.trim(), color, logo };
    await db.putSettings(dealer);
    toast('상사 정보를 저장했어요.');
    location.hash = '#/';
  });
}

// ---------- 예시 차량 ----------
// 실제 매물 사진 대신 그림으로 만든 예시 사진 6장
async function makeSampleVehicle() {
  const scenes = [
    ['전면 3/4', '#e9edf2', '#2b3a55', 1], ['측면', '#dfe6ee', '#2b3a55', 0], ['후면 3/4', '#e7e3dc', '#2b3a55', -1],
    ['실내', '#2a2d33', '#c8a45c', 2], ['계기판', '#1b1d21', '#4ea1ff', 3], ['휠·타이어', '#d9dde3', '#2b3a55', 4],
  ];
  const photos = [];
  for (const [label, bg, body, kind] of scenes) {
    const c = document.createElement('canvas');
    c.width = 1600; c.height = 1200;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 1200);
    g.addColorStop(0, bg); g.addColorStop(0.62, bg); g.addColorStop(0.63, '#00000022'); g.addColorStop(1, '#00000044');
    x.fillStyle = g; x.fillRect(0, 0, 1600, 1200);
    x.save();
    x.translate(800, 760);
    if (kind <= 1 && kind >= -1) {
      x.scale(kind === 0 ? 1.15 : 1, 1);
      x.fillStyle = 'rgba(0,0,0,0.25)';
      x.beginPath(); x.ellipse(0, 150, 620, 46, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = body;
      x.beginPath();
      x.moveTo(-600, 110); x.lineTo(-580, -10); x.quadraticCurveTo(-540, -70, -420, -90);
      x.lineTo(-240, -110); x.quadraticCurveTo(-120, -260, 80, -262); x.quadraticCurveTo(260, -260, 360, -120);
      x.lineTo(520, -96); x.quadraticCurveTo(600, -80, 610, 0); x.lineTo(612, 110); x.closePath(); x.fill();
      x.fillStyle = '#9fb3c8';
      x.beginPath(); x.moveTo(-200, -112); x.quadraticCurveTo(-100, -232, 70, -236); x.lineTo(60, -112); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(100, -112); x.lineTo(110, -236); x.quadraticCurveTo(250, -230, 320, -112); x.closePath(); x.fill();
      for (const wx of [-380, 380]) {
        x.fillStyle = '#111'; x.beginPath(); x.arc(wx, 110, 118, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#b8c0c9'; x.beginPath(); x.arc(wx, 110, 66, 0, Math.PI * 2); x.fill();
      }
    } else if (kind === 2) {
      x.fillStyle = '#3a3e45'; x.fillRect(-700, -360, 1400, 240);
      x.fillStyle = body; x.lineWidth = 26; x.strokeStyle = '#111';
      x.beginPath(); x.arc(-250, 40, 210, 0, Math.PI * 2); x.stroke();
      x.fillStyle = '#4a4f57'; x.fillRect(100, -220, 520, 300);
      x.fillStyle = '#7fb2ff33'; x.fillRect(130, -190, 460, 240);
    } else if (kind === 3) {
      for (const cx of [-330, 330]) {
        x.strokeStyle = body; x.lineWidth = 16;
        x.beginPath(); x.arc(cx, -60, 240, Math.PI * 0.8, Math.PI * 2.2); x.stroke();
        x.strokeStyle = '#ff5a3c'; x.lineWidth = 10;
        x.beginPath(); x.moveTo(cx, -60); x.lineTo(cx + 150, -190); x.stroke();
      }
    } else {
      x.fillStyle = '#111'; x.beginPath(); x.arc(0, -100, 380, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#c3cad3'; x.beginPath(); x.arc(0, -100, 240, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#8b939d';
      for (let i = 0; i < 5; i++) { x.save(); x.rotate((i * Math.PI * 2) / 5); x.fillRect(-26, -330, 52, 220); x.restore(); }
      x.fillStyle = '#d0362b'; x.fillRect(150, -260, 70, 150);
    }
    x.restore();
    x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(40, 40, 380, 90);
    x.fillStyle = '#fff'; x.font = '700 44px "IBM Plex Sans KR", sans-serif';
    x.fillText(`예시 · ${label}`, 70, 102);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    photos.push({ id: uid(), blob, w: 1600, h: 1200 });
  }
  const v = {
    id: uid(), createdAt: Date.now(), plate: '예시차량', maker: '현대', model: '그랜저', trim: '2.5 캘리그래피',
    year: '2021년 4월', mileage: '42000', fuel: '가솔린', transmission: '자동', color: '흰색', accident: '무사고', price: '3250',
    highlights: '1인 신조\n파노라마 썬루프\n정비 이력 완비', description: '예시로 만든 차량입니다. 실제 매물 사진으로 바꿔서 써 보세요.', photos,
  };
  await db.putVehicle(v);
  return v;
}

// ---------- 시작 ----------
(async () => {
  try { dealer = { ...DEALER_DEFAULTS, ...(await db.getSettings()) }; } catch { toast('이 브라우저에서는 저장 기능을 쓸 수 없어요. 시크릿 창이 아닌지 확인해 주세요.'); }
  window.addEventListener('hashchange', route);
  route();
})();
