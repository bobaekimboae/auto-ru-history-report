// 나레이션 자막, 차량 정보 카드(윈도 스티커), 매물 웹페이지(사진·360° 회전·핫스팟·연락처를 담은 HTML 한 파일).
import { fmt, factCards } from './render.js';
import { SPOT_KINDS } from './spots.js';

const FONT = '"IBM Plex Sans KR", "Gothic A1", "Malgun Gothic", sans-serif';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 자막 ----------
function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
/** 나레이션 문장을 읽는 동안 화면 아래에 자막으로 띄운다. narr: { lines, starts, durs }, delay: 시작 지연 */
export function drawCaption(ctx, W, H, t, narr, delay) {
  if (!narr?.starts?.length) return;
  const lt = t - delay;
  const i = narr.starts.findIndex((s, k) => lt >= s && lt < s + narr.durs[k] + 0.15);
  if (i < 0) return;
  const text = narr.lines[i] || '';
  if (!text) return;
  const u = Math.min(W, H) / 100;
  const fs = u * (H > W ? 4.4 : 3.6);
  ctx.save();
  ctx.font = `800 ${fs}px ${FONT}`;
  const lines = wrap(ctx, text, W * 0.84).slice(0, 2);
  const lh = fs * 1.35;
  const y0 = H * (H > W ? 0.875 : 0.86) - (lines.length - 1) * lh;
  const k = Math.min(1, (lt - narr.starts[i]) / 0.15);
  ctx.globalAlpha = k;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((ln, j) => {
    const w = ctx.measureText(ln).width + fs * 0.9;
    const y = y0 + j * lh;
    ctx.fillStyle = 'rgba(10,12,15,0.72)';
    ctx.beginPath(); ctx.roundRect(W / 2 - w / 2, y - lh / 2, w, lh, fs * 0.3); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(ln, W / 2, y + 1);
  });
  ctx.restore();
}

// ---------- 차량 정보 카드(윈도 스티커) ----------
export function makeInfoCard(v, dealer, logo, cover) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const accent = dealer.color || '#df5419';
  x.fillStyle = '#f4f5f7'; x.fillRect(0, 0, W, H);
  // 위: 대표 사진
  const ph = 560;
  if (cover) {
    const k = Math.max(W / cover.width, ph / cover.height);
    x.save(); x.beginPath(); x.rect(0, 0, W, ph); x.clip();
    x.drawImage(cover, (W - cover.width * k) / 2, (ph - cover.height * k) / 2, cover.width * k, cover.height * k);
    x.restore();
  }
  x.fillStyle = accent; x.fillRect(0, ph, W, 10);
  const pad = 64;
  let y = ph + 90;
  x.fillStyle = '#14181d'; x.textBaseline = 'alphabetic';
  let fs = 58; x.font = `800 ${fs}px ${FONT}`;
  while (x.measureText(fmt.title(v)).width > W - pad * 2 && fs > 34) { fs -= 2; x.font = `800 ${fs}px ${FONT}`; }
  x.fillText(fmt.title(v), pad, y);
  if (v.price) {
    y += 78;
    x.fillStyle = accent; x.font = `800 64px ${FONT}`;
    x.fillText(fmt.price(v.price), pad, y);
  }
  // 사양 표
  y += 50;
  const rows = [...factCards(v).map((f) => [f.k, f.v]), v.color && ['색상', v.color], v.plate && ['차량번호', v.plate]].filter(Boolean).slice(0, 8);
  const colW = (W - pad * 2) / 2;
  rows.forEach(([k, val], i) => {
    const cx = pad + (i % 2) * colW, cy = y + Math.floor(i / 2) * 84;
    x.fillStyle = '#fff'; x.beginPath(); x.roundRect(cx, cy, colW - 16, 70, 14); x.fill();
    x.fillStyle = '#767f8a'; x.font = `600 24px ${FONT}`; x.fillText(k, cx + 22, cy + 30);
    x.fillStyle = '#14181d'; x.font = `800 28px ${FONT}`; x.fillText(String(val).slice(0, 18), cx + 22, cy + 60);
  });
  y += Math.ceil(rows.length / 2) * 84 + 24;
  const hl = String(v.highlights || '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 4);
  hl.forEach((h) => {
    x.fillStyle = accent; x.beginPath(); x.arc(pad + 12, y - 10, 9, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#14181d'; x.font = `700 30px ${FONT}`; x.fillText(h.slice(0, 30), pad + 36, y);
    y += 46;
  });
  // 아래: 상사 띠
  const by = H - 150;
  x.fillStyle = '#14181d'; x.fillRect(0, by, W, 150);
  let lx = pad;
  if (logo) { const lh = 72, lw = lh * logo.width / logo.height; x.drawImage(logo, lx, by + 39, lw, lh); lx += lw + 24; }
  x.fillStyle = '#fff'; x.font = `800 40px ${FONT}`; x.fillText(dealer.name || '', lx, by + 70);
  x.fillStyle = 'rgba(255,255,255,0.7)'; x.font = `600 26px ${FONT}`; x.fillText(dealer.region || '', lx, by + 112);
  if (dealer.phone) { x.textAlign = 'right'; x.fillStyle = '#fff'; x.font = `800 44px ${FONT}`; x.fillText(dealer.phone, W - pad, by + 92); }
  return c;
}

// ---------- 매물 웹페이지 ----------
/**
 * @param {{ v, dealer, photos: string[] (data URL), spin: string[] (외관 순서 data URL), spots: {photo:number, kind, title, desc}[], caption: string }} o
 */
export function buildListingPage({ v, dealer, photos, spin, spots, caption }) {
  const accent = dealer.color || '#df5419';
  const facts = [...factCards(v).map((f) => [f.k, f.v]), v.color && ['색상', v.color]].filter(Boolean);
  const tel = (dealer.phone || '').replace(/[^\d+]/g, '');
  const title = fmt.title(v);
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | ${esc(dealer.name || '매물')}</title>
<meta property="og:title" content="${esc(title)} ${esc(v.price ? fmt.price(v.price) : '')}">
<style>
:root{--a:${accent};--ink:#15181c;--mut:#6b7480;--bg:#f2f3f5;--card:#fff}
@media (prefers-color-scheme:dark){:root{--ink:#eceff2;--mut:#9aa3ad;--bg:#0f1114;--card:#181b1f}}
*{box-sizing:border-box}body{margin:0;font-family:"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;background:var(--bg);color:var(--ink)}
main{max-width:860px;margin:0 auto;padding:0 0 96px}
.hero{position:relative;background:#000}.hero img{display:block;width:100%;height:auto}
.spin{position:relative;touch-action:pan-y;cursor:grab;user-select:none}.spin img{display:block;width:100%;height:auto;pointer-events:none}
.spin .hint{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);padding:6px 14px;border-radius:99px;background:rgba(0,0,0,.6);color:#fff;font-size:14px;font-weight:700}
.tabs{display:flex;gap:8px;padding:12px 16px}.tabs button{flex:1;height:40px;border:1px solid #0002;border-radius:10px;background:var(--card);color:var(--ink);font-weight:700}.tabs button[aria-pressed=true]{background:var(--a);color:#fff;border-color:var(--a)}
section{background:var(--card);margin:12px 16px;padding:18px;border-radius:16px}
h1{font-size:24px;margin:0 0 6px}.price{font-size:28px;font-weight:800;color:var(--a);margin:4px 0 0}
.facts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0;padding:0;list-style:none}.facts li{background:var(--bg);border-radius:10px;padding:10px 12px}.facts b{display:block;font-size:12px;color:var(--mut);font-weight:600}.facts span{font-weight:800}
h2{font-size:17px;margin:0 0 10px}.hl li{margin:4px 0}
.spots{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.spots li{display:flex;gap:10px;align-items:flex-start}.spots i{flex:none;margin-top:4px;width:12px;height:12px;border-radius:50%}
.gallery{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 16px}.gallery img{width:100%;border-radius:8px;display:block;cursor:zoom-in}
.cta{position:fixed;left:0;right:0;bottom:0;display:flex;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:var(--card);box-shadow:0 -4px 20px #0002}
.cta a{flex:1;display:flex;align-items:center;justify-content:center;height:52px;border-radius:12px;font-weight:800;text-decoration:none;color:#fff;background:var(--a)}.cta a.sub{background:var(--ink);color:var(--card)}
.zoom{position:fixed;inset:0;background:#000e;display:none;align-items:center;justify-content:center;z-index:9}.zoom img{max-width:100%;max-height:100%}
pre{white-space:pre-wrap;font:inherit;margin:0;color:var(--mut)}
footer{text-align:center;color:var(--mut);font-size:12px;margin:18px}
</style></head><body><main>
${spin.length > 1 ? `<div class="tabs"><button type="button" data-v="spin" aria-pressed="true">360° 돌려보기</button><button type="button" data-v="photo" aria-pressed="false">대표 사진</button></div>
<div class="spin" id="spin"><img id="spinImg" src="${spin[0]}" alt="${esc(title)} 360°"><span class="hint">← 손가락으로 끌어 돌려보세요 →</span></div>
<div class="hero" id="hero" hidden><img src="${photos[0]}" alt="${esc(title)}"></div>`
    : `<div class="hero"><img src="${photos[0] || ''}" alt="${esc(title)}"></div>`}
<section><h1>${esc(title)}</h1>${v.price ? `<p class="price">${esc(fmt.price(v.price))}</p>` : ''}</section>
${facts.length ? `<section><ul class="facts">${facts.map(([k, val]) => `<li><b>${esc(k)}</b><span>${esc(val)}</span></li>`).join('')}</ul></section>` : ''}
${v.highlights ? `<section><h2>강조 포인트</h2><ul class="hl">${String(v.highlights).split('\n').filter((s) => s.trim()).map((h) => `<li>${esc(h)}</li>`).join('')}</ul></section>` : ''}
${spots.length ? `<section><h2>특징·흠집 안내</h2><ul class="spots">${spots.map((s) => `<li><i style="background:${(SPOT_KINDS[s.kind] || SPOT_KINDS.feature).color}"></i><div><b>${esc((SPOT_KINDS[s.kind] || SPOT_KINDS.feature).label)} · ${esc(s.title || '표시')}</b>${s.desc ? `<br><span>${esc(s.desc)}</span>` : ''} <a href="#p${s.photo}">사진 보기</a></div></li>`).join('')}</ul></section>` : ''}
${v.description ? `<section><h2>설명</h2><pre>${esc(v.description)}</pre></section>` : ''}
<div class="gallery">${photos.map((p, i) => `<img id="p${i}" src="${p}" alt="사진 ${i + 1}" loading="lazy">`).join('')}</div>
<section><h2>${esc(dealer.name || '판매처')}</h2><pre>${esc([dealer.region, dealer.phone].filter(Boolean).join('\n'))}</pre></section>
<footer>${caption ? '' : ''}이 페이지는 매물 숏폼 스튜디오로 만들었어요.</footer>
</main>
${tel ? `<nav class="cta"><a class="sub" href="sms:${tel}">문자 문의</a><a href="tel:${tel}">전화 문의</a></nav>` : ''}
<div class="zoom" id="zoom"><img alt=""></div>
<script>
const frames=${JSON.stringify(spin.length > 1 ? spin : [])};
if(frames.length){const el=document.getElementById('spin'),img=document.getElementById('spinImg');let i=0,x0=null,i0=0;
frames.forEach(s=>{const p=new Image();p.src=s});
const show=k=>{i=((k%frames.length)+frames.length)%frames.length;img.src=frames[i]};
el.addEventListener('pointerdown',e=>{x0=e.clientX;i0=i;el.setPointerCapture(e.pointerId)});
el.addEventListener('pointermove',e=>{if(x0==null)return;show(i0-Math.round((e.clientX-x0)/Math.max(40,el.clientWidth/frames.length/1.2)))});
el.addEventListener('pointerup',()=>{x0=null});el.addEventListener('pointercancel',()=>{x0=null});
let auto=setInterval(()=>show(i+1),1200);el.addEventListener('pointerdown',()=>clearInterval(auto),{once:true});
document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tabs button').forEach(x=>x.setAttribute('aria-pressed',x===b));const s=b.dataset.v==='spin';el.hidden=!s;document.getElementById('hero').hidden=s}));}
const z=document.getElementById('zoom');document.querySelectorAll('.gallery img').forEach(im=>im.addEventListener('click',()=>{z.firstElementChild.src=im.src;z.style.display='flex'}));z.addEventListener('click',()=>{z.style.display='none'});
</script></body></html>`;
}
