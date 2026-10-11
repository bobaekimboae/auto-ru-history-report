// 번호판 위치 확인 창: 사진마다 찾은 번호판 상자를 보여주고, 꼭짓점을 끌어 맞추거나 지우거나 새로 넣는다.
import { defaultQuad } from './plate.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @param {{ photos: object[], urls: string[], start?: number, indices?: number[], onDone: (changed: boolean) => void }} o
 *  photos[i].plate 를 직접 고친다(null = 번호판 없음).
 */
export function openPlateEditor({ photos, urls, start = 0, indices = null, onDone }) {
  const list = indices || photos.map((_, i) => i);
  let pos = Math.max(0, list.indexOf(start));
  let changed = false;
  const dlg = document.createElement('dialog');
  dlg.className = 'plate-dlg';
  dlg.innerHTML = `
    <form method="dialog" class="pd-head">
      <h2>번호판 위치 확인</h2>
      <button class="icon-btn" value="close" aria-label="닫기">✕</button>
    </form>
    <div class="pd-stage" id="pdStage">
      <img id="pdImg" alt="">
      <svg id="pdSvg" preserveAspectRatio="none"></svg>
    </div>
    <p class="pd-status" id="pdStatus" role="status"></p>
    <div class="pd-actions">
      <button type="button" class="btn btn-quiet btn-sm" id="pdPrev">◀ 이전</button>
      <button type="button" class="btn btn-quiet btn-sm" id="pdToggle"></button>
      <button type="button" class="btn btn-quiet btn-sm" id="pdNext">다음 ▶</button>
    </div>
    <ol class="pd-strip" id="pdStrip">${list.map((i, k) => `<li><button type="button" data-k="${k}"><img src="${esc(urls[i])}" alt="사진 ${i + 1}"><span class="num">${i + 1}</span></button></li>`).join('')}</ol>
    <p class="hint">빨간 상자의 네 모서리를 끌어 번호판에 맞추세요. 상자 가운데를 끌면 통째로 옮겨져요. 사진에 번호판이 없으면 "번호판 없음"을 누르세요.</p>
    <div class="pd-foot"><button type="button" class="btn btn-primary" id="pdDone">완료</button></div>`;
  document.body.append(dlg);
  const $ = (id) => dlg.querySelector(`#${id}`);
  const svg = $('pdSvg');
  const img = $('pdImg');

  const cur = () => photos[list[pos]];
  const draw = () => {
    const p = cur();
    img.src = urls[list[pos]];
    const q = p.plate;
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.innerHTML = q ? `
      <polygon points="${q.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')}" class="pd-poly" data-h="move"/>
      ${q.map(([x, y], i) => `<circle cx="${x * 1000}" cy="${y * 1000}" r="14" class="pd-handle" data-h="${i}"/>`).join('')}` : '';
    $('pdStatus').textContent = q ? `${list[pos] + 1}번 사진 · 번호판을 ${p.plateAuto === false ? '직접 맞췄어요' : 'AI가 찾았어요'}` : `${list[pos] + 1}번 사진 · 번호판 없음`;
    $('pdToggle').textContent = q ? '번호판 없음' : '번호판 상자 넣기';
    $('pdPrev').disabled = pos === 0;
    $('pdNext').disabled = pos === list.length - 1;
    dlg.querySelectorAll('#pdStrip button').forEach((b) => {
      const k = Number(b.dataset.k);
      b.setAttribute('aria-current', String(k === pos));
      b.dataset.has = photos[list[k]].plate ? '1' : '0';
    });
  };

  $('pdPrev').addEventListener('click', () => { pos = Math.max(0, pos - 1); draw(); });
  $('pdNext').addEventListener('click', () => { pos = Math.min(list.length - 1, pos + 1); draw(); });
  $('pdStrip').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) { pos = Number(b.dataset.k); draw(); } });
  $('pdToggle').addEventListener('click', () => {
    const p = cur();
    p.plate = p.plate ? null : defaultQuad();
    p.plateAuto = false;
    changed = true; draw();
  });

  // 끌기: 모서리 하나 또는 상자 전체
  let drag = null;
  const pt = (e) => {
    const r = svg.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  svg.addEventListener('pointerdown', (e) => {
    const h = e.target.dataset?.h;
    if (h == null || !cur().plate) return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    drag = { h, start: pt(e), orig: cur().plate.map((c) => [...c]) };
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const [x, y] = pt(e);
    const p = cur();
    if (drag.h === 'move') {
      const dx = x - drag.start[0], dy = y - drag.start[1];
      p.plate = drag.orig.map(([a, b]) => [Math.min(1, Math.max(0, a + dx)), Math.min(1, Math.max(0, b + dy))]);
    } else {
      p.plate = drag.orig.map((c, i) => (i === Number(drag.h) ? [x, y] : c));
    }
    p.plateAuto = false;
    changed = true;
    draw();
  });
  const end = () => { drag = null; };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  const finish = () => { dlg.close(); };
  $('pdDone').addEventListener('click', finish);
  dlg.addEventListener('close', () => { dlg.remove(); onDone?.(changed); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') $('pdPrev').click();
    if (e.key === 'ArrowRight') $('pdNext').click();
  });
  draw();
  dlg.showModal();
}
