// 매물 숏폼 스튜디오: 대시보드 · 차량 등록(사진 정렬) · 영상 만들기 · 상사 설정
import { db } from './db.js';
import { FORMATS, TEMPLATES, createScene, recordScene, fmt, factCards } from './render.js';
import { playMusic } from './music.js';
import { makeMask, loadCutout, composeShowroom } from './showroom.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const DEALER_DEFAULTS = { name: '', phone: '', region: '', color: '#df5419', logo: '', cta: '지금 바로 문의하세요', hashtags: '중고차 중고차매물 중고차추천', signSub: '' };
const STUDIO_DEFAULTS = { format: '9:16', template: 'clean', duration: 15, showPrice: true, music: true, cta: '', bg: 'orig' };
const BACKGROUNDS = { orig: { label: '원본 사진', hint: '찍은 사진 그대로' }, 'brand-light': { label: '상사 쇼룸', hint: '배경을 지우고 흰 쇼룸에 간판' }, 'brand-dark': { label: '상사 쇼룸 블랙', hint: '배경을 지우고 블랙 쇼룸에 간판' } };
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
        <div class="ptools">
          <button type="button" data-act="left" aria-label="앞으로" ${i === 0 ? 'disabled' : ''}>◀</button>
          ${i ? '<button type="button" data-act="cover">대표로</button>' : ''}
          <button type="button" data-act="right" aria-label="뒤로" ${i === photos.length - 1 ? 'disabled' : ''}>▶</button>
          <button type="button" data-act="keep" aria-pressed="${!!p.keepBg}" title="상사 쇼룸 배경을 쓸 때 이 사진은 배경을 지우지 않아요">실내</button>
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
  const images = await Promise.all(v.photos.map((p) => createImageBitmap(p.blob)));
  const logo = dealer.logo ? await loadImage(dealer.logo).catch(() => null) : null;
  await Promise.all(['800 40px "Gothic A1"', '700 40px "Nanum Myeongjo"', '600 40px "IBM Plex Sans KR"'].map((f) => document.fonts.load(f).catch(() => null)));

  const facts = factCards(v);
  view.innerHTML = `
    <header class="page-head">
      <div>
        <p class="eyebrow"><a href="#/">대시보드</a> / <a href="#/vehicle/${v.id}">${esc(fmt.title(v))}</a> / 영상 만들기</p>
        <h1>영상 만들기</h1>
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
          <h3>형식</h3>
          <div class="opts" id="formatOpts">${Object.entries(FORMATS).map(([k, f]) => `
            <button type="button" class="opt" data-format="${k}" aria-pressed="${k === st.format}">
              <span class="ratio r${k.replace(':', '-')}"></span><span><strong>${f.label}</strong><small>${f.hint}</small></span>
            </button>`).join('')}</div>
        </div>
        <div class="group">
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
              <span class="tpl-swatch bgsw-${k}"></span><span><strong>${b.label}</strong><small>${b.hint}</small></span>
            </button>`).join('')}</div>
          <p class="hint" id="bgHint">${st.bg === 'orig' ? '' : '처음 한 번은 AI가 사진마다 배경을 지워요. 결과는 저장돼서 다음부터는 바로 나와요.'}</p>
        </div>
        <div class="group">
          <h3>길이</h3>
          <div class="seg seg-wide" id="durSeg">
            ${[15, 30].map((d) => `<button type="button" data-d="${d}" aria-selected="${d === st.duration}">${d}초</button>`).join('')}
          </div>
        </div>
        <div class="group">
          <h3>내용</h3>
          <label class="switch"><input type="checkbox" id="showPrice" ${st.showPrice ? 'checked' : ''}><span class="track"></span>가격 보여주기</label>
          <label class="switch"><input type="checkbox" id="music" ${st.music ? 'checked' : ''}><span class="track"></span>배경음악 넣기 <small>템플릿마다 다른 자체 음원</small></label>
          <div class="field"><label for="cta">마지막 장면 문구</label><input id="cta" value="${esc(st.cta)}" maxlength="24" placeholder="예: 지금 바로 문의하세요"></div>
        </div>
        <button class="btn btn-primary btn-lg btn-block" id="renderBtn" type="button">영상 만들기</button>
        <p class="hint">만드는 동안 영상 길이만큼 시간이 걸려요. 이 탭을 그대로 두세요.</p>
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

  // 상사 쇼룸 배경: 사진마다 배경을 지운 마스크를 만들어 저장하고, 영상 비율에 맞는 쇼룸 사진으로 합성한다
  let sceneImages = images;
  let studioSet = new Set();
  const cutouts = new Map();
  const composites = new Map();
  const veilShow = (text, ratio) => { $('veil').hidden = false; $('veilText').textContent = text; $('veilBar').style.width = `${Math.round((ratio || 0) * 100)}%`; };
  const ensureMasks = async () => {
    const todo = v.photos.map((p, i) => [p, i]).filter(([p]) => !p.keepBg && !p.maskBlob);
    if (!todo.length) return;
    try {
      for (let k = 0; k < todo.length; k++) {
        const [p, i] = todo[k];
        veilShow(`배경 지우는 중 ${k + 1} / ${todo.length}`, k / todo.length);
        p.maskBlob = await makeMask(p.blob, images[i].width, images[i].height, {
          onProgress: (r) => veilShow(`AI 준비 중 ${Math.round(r * 100)}% (처음 한 번만 내려받아요)`, r),
        });
      }
      await db.putVehicle({ ...v, studio: { ...st } });
    } finally {
      $('veil').hidden = true;
    }
  };
  const prepareImages = async () => {
    if (st.bg === 'orig') { sceneImages = images; studioSet = new Set(); return; }
    await ensureMasks();
    const dark = st.bg === 'brand-dark';
    const { w, h } = FORMATS[st.format];
    const sign = { name: dealer.name, sub: dealer.signSub, logo };
    const set = new Set();
    sceneImages = await Promise.all(v.photos.map(async (p, i) => {
      if (p.keepBg || !p.maskBlob) return images[i];
      set.add(i);
      const key = `${p.id}|${st.bg}|${st.format}`;
      if (!composites.has(key)) {
        if (!cutouts.has(p.id)) cutouts.set(p.id, await loadCutout(images[i], p.maskBlob));
        composites.set(key, composeShowroom(cutouts.get(p.id), w, h, dark, sign));
      }
      return composites.get(key);
    }));
    studioSet = set;
  };
  const sceneOpts = () => ({ vehicle: v, images: sceneImages, studio: studioSet, dealer: { ...dealer, cta: st.cta }, logo, template: st.template, format: st.format, duration: st.duration, showPrice: st.showPrice });
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
    $('bgHint').textContent = st.bg === 'orig' ? '' : '배경을 지운 결과는 저장돼서 다음부터는 바로 나와요. 실내 사진은 차량 편집에서 "실내"를 눌러 두세요.';
    scene = createScene(sceneOpts());
    canvas.width = scene.W * PREVIEW_SCALE; canvas.height = scene.H * PREVIEW_SCALE;
    $('stage').dataset.format = st.format;
    if (playing) restart();
    else pausedAt = Math.min(pausedAt, st.duration - 0.01);
  };
  const stopAudio = () => { audio?.track.stop(); audio?.ctx.close(); audio = null; };
  const startAudio = () => {
    stopAudio();
    if (!soundOn || !st.music || !playing) return;
    const ac = new AudioContext();
    const offset = currentTime();
    audio = { ctx: ac, track: playMusic(ac, ac.destination, st.template, Math.max(0.5, st.duration - offset)) };
  };
  const currentTime = () => (playing ? ((performance.now() - t0) / 1000) % st.duration : pausedAt);
  const restart = () => { t0 = performance.now(); pausedAt = 0; startAudio(); };
  let lastLoop = 0;
  const loop = () => {
    const t = currentTime();
    if (playing && t < lastLoop) startAudio();   // 한 바퀴 돌면 음악도 처음부터
    lastLoop = t;
    ctx.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
    scene.draw(ctx, t);
    $('scrub').value = String(Math.round((t / st.duration) * 1000));
    $('timeText').textContent = `${t.toFixed(1)} / ${st.duration}초`;
    raf = requestAnimationFrame(loop);
  };
  await build();
  raf = requestAnimationFrame(loop);
  cleanup = () => { cancelAnimationFrame(raf); stopAudio(); images.forEach((b) => b.close?.()); };

  const setPlaying = (on) => {
    if (on === playing) return;
    if (on) { t0 = performance.now() - pausedAt * 1000; playing = true; startAudio(); }
    else { pausedAt = currentTime(); playing = false; stopAudio(); }
    $('playIcon').innerHTML = playing ? '<path d="M6 4h3v12H6zM11 4h3v12h-3z"/>' : '<path d="M6 4l10 6-10 6z"/>';
    $('playBtn').setAttribute('aria-label', playing ? '일시정지' : '재생');
  };
  $('playBtn').addEventListener('click', () => setPlaying(!playing));
  $('scrub').addEventListener('input', (e) => {
    setPlaying(false);
    pausedAt = (Number(e.target.value) / 1000) * st.duration;
  });
  $('soundBtn').addEventListener('click', (e) => {
    soundOn = !soundOn;
    e.currentTarget.setAttribute('aria-pressed', String(soundOn));
    if (soundOn && !st.music) toast('배경음악이 꺼져 있어요.');
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
  pick('bgOpts', 'bg', 'bg');
  pick('durSeg', 'd', 'duration', Number);
  $('showPrice').addEventListener('change', (e) => { st.showPrice = e.target.checked; save(); build(); });
  $('music').addEventListener('change', (e) => { st.music = e.target.checked; save(); startAudio(); });
  $('cta').addEventListener('input', (e) => { st.cta = e.target.value; save(); build(); });

  $('renderBtn').addEventListener('click', async () => {
    if (!window.MediaRecorder) { toast('이 브라우저는 영상 저장을 지원하지 않아요. 크롬에서 열어 주세요.'); return; }
    setPlaying(false);
    const veil = $('veil');
    veil.hidden = false;
    try {
      const fresh = createScene(sceneOpts());
      const { blob, ext } = await recordScene(fresh, {
        music: st.music,
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
  cleanup = () => { prevCleanup(); if (resultUrl) URL.revokeObjectURL(resultUrl); };
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
