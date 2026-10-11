// 핫스팟 편집 창: 사진을 눌러 점을 찍고, 특징/흠집 종류와 이름·설명을 적는다. 점은 끌어서 옮긴다.
import { SPOT_KINDS } from './spots.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_SPOTS = 6;

/** photos[i].spots = [{ x, y, kind, title, desc }] 를 직접 고친다. */
export function openSpotEditor({ photos, urls, start = 0, onDone }) {
  let pos = start;
  let sel = 0;
  const dlg = document.createElement('dialog');
  dlg.className = 'plate-dlg spot-dlg';
  dlg.innerHTML = `
    <form method="dialog" class="pd-head">
      <h2>핫스팟 · 특징과 흠집 표시</h2>
      <button class="icon-btn" value="close" aria-label="닫기">✕</button>
    </form>
    <div class="sd-body">
      <div class="pd-stage" id="sdStage"><img id="sdImg" alt=""><div class="sd-layer" id="sdLayer"></div></div>
      <div class="sd-side">
        <p class="hint">사진에서 보여줄 곳을 누르면 점이 생겨요. 옵션·장점은 <b style="color:${SPOT_KINDS.feature.color}">특징</b>, 스크래치·찍힘은 <b style="color:${SPOT_KINDS.damage.color}">흠집</b>으로 표시하세요. 흠집을 미리 보여주면 신뢰가 올라가요.</p>
        <ol class="sd-list" id="sdList"></ol>
      </div>
    </div>
    <div class="pd-actions">
      <button type="button" class="btn btn-quiet btn-sm" id="sdPrev">◀ 이전 사진</button>
      <button type="button" class="btn btn-quiet btn-sm" id="sdNext">다음 사진 ▶</button>
    </div>
    <ol class="pd-strip" id="sdStrip">${photos.map((p, i) => `<li><button type="button" data-k="${i}"><img src="${esc(urls[i])}" alt="사진 ${i + 1}"><span class="num">${i + 1}</span></button></li>`).join('')}</ol>
    <div class="pd-foot"><button type="button" class="btn btn-primary" id="sdDone">완료</button></div>`;
  document.body.append(dlg);
  const $ = (id) => dlg.querySelector(`#${id}`);
  const spotsOf = () => (photos[pos].spots ||= []);

  const drawLayer = () => {
    $('sdLayer').innerHTML = spotsOf().map((s, i) => `<button type="button" class="sd-dot" data-i="${i}" data-kind="${s.kind}" aria-current="${i === sel}" style="left:${s.x * 100}%;top:${s.y * 100}%" aria-label="${i + 1}번 핫스팟">${i + 1}</button>`).join('');
  };
  const drawList = () => {
    const list = spotsOf();
    $('sdList').innerHTML = list.length ? list.map((s, i) => `
      <li data-i="${i}" aria-current="${i === sel}">
        <div class="sd-top"><span class="sd-num" data-kind="${s.kind}">${i + 1}</span>
          <div class="seg">${Object.entries(SPOT_KINDS).map(([k, d]) => `<button type="button" data-kind="${k}" aria-selected="${s.kind === k}">${d.label}</button>`).join('')}</div>
          <button type="button" class="sd-del" aria-label="${i + 1}번 지우기">지우기</button></div>
        <input class="sd-title" maxlength="24" placeholder="${s.kind === 'damage' ? '예: 뒷범퍼 스크래치' : '예: 파노라마 썬루프'}" value="${esc(s.title)}">
        <input class="sd-desc" maxlength="60" placeholder="설명(선택) 예: ${s.kind === 'damage' ? '손톱 크기, 광택으로 지워짐' : '앞뒤 좌석 모두 열림'}" value="${esc(s.desc)}">
      </li>`).join('') : '<li class="sd-empty">이 사진에는 아직 핫스팟이 없어요.</li>';
  };
  const draw = () => {
    $('sdImg').src = urls[pos];
    drawLayer(); drawList();
    $('sdPrev').disabled = pos === 0;
    $('sdNext').disabled = pos === photos.length - 1;
    dlg.querySelectorAll('#sdStrip button').forEach((b) => {
      const k = Number(b.dataset.k);
      b.setAttribute('aria-current', String(k === pos));
      b.dataset.has = photos[k].spots?.length ? '1' : '0';
    });
  };

  const ptOf = (e) => {
    const r = $('sdImg').getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  // 점 끌기 / 빈 곳 눌러 새 점
  let drag = null;
  $('sdStage').addEventListener('pointerdown', (e) => {
    const dot = e.target.closest('.sd-dot');
    if (dot) {
      sel = Number(dot.dataset.i);
      drag = { i: sel, moved: false };
      $('sdStage').setPointerCapture(e.pointerId);
      drawLayer(); drawList();
      return;
    }
    if (e.target !== $('sdImg') && e.target !== $('sdLayer')) return;
    const list = spotsOf();
    if (list.length >= MAX_SPOTS) { alert(`사진 한 장에 ${MAX_SPOTS}개까지 넣을 수 있어요.`); return; }
    e.preventDefault();   // 누른 곳으로 포커스가 옮겨가지 않게(바로 이름을 칠 수 있게)
    const [x, y] = ptOf(e);
    list.push({ x, y, kind: 'feature', title: '', desc: '' });
    sel = list.length - 1;
    draw();
    const focus = () => dlg.querySelector(`#sdList li[data-i="${sel}"] .sd-title`)?.focus();
    focus(); setTimeout(focus, 0);
  });
  $('sdStage').addEventListener('pointermove', (e) => {
    if (!drag) return;
    const [x, y] = ptOf(e);
    Object.assign(spotsOf()[drag.i], { x, y });
    drag.moved = true;
    drawLayer();
  });
  const end = () => { drag = null; };
  $('sdStage').addEventListener('pointerup', end);
  $('sdStage').addEventListener('pointercancel', end);

  $('sdList').addEventListener('input', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    const s = spotsOf()[Number(li.dataset.i)];
    if (e.target.classList.contains('sd-title')) s.title = e.target.value;
    if (e.target.classList.contains('sd-desc')) s.desc = e.target.value;
  });
  $('sdList').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    const i = Number(li.dataset.i);
    const kindBtn = e.target.closest('[data-kind]');
    if (e.target.closest('.sd-del')) { spotsOf().splice(i, 1); sel = Math.max(0, i - 1); draw(); return; }
    if (kindBtn && kindBtn.tagName === 'BUTTON') { spotsOf()[i].kind = kindBtn.dataset.kind; sel = i; draw(); return; }
    if (sel !== i) { sel = i; drawLayer(); li.parentElement.querySelectorAll('li').forEach((x) => x.setAttribute('aria-current', String(x === li))); }
  });
  const go = (k) => { pos = Math.min(photos.length - 1, Math.max(0, k)); sel = 0; draw(); };
  $('sdPrev').addEventListener('click', () => go(pos - 1));
  $('sdNext').addEventListener('click', () => go(pos + 1));
  $('sdStrip').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) go(Number(b.dataset.k)); });
  $('sdDone').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => {
    // 이름 없는 점은 영상에 라벨 없이 점만 나온다. 완전히 빈 목록은 지운다
    photos.forEach((p) => { if (p.spots && !p.spots.length) delete p.spots; });
    dlg.remove();
    onDone?.();
  });
  draw();
  dlg.showModal();
}
