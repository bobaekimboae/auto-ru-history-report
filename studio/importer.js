// 매물 가져오기
// 1) 링크 붙여넣기: 중계 함수(api/listing.js)가 있을 때. 이 저장소를 Vercel 등에 올리면 같은 사이트의 /api/listing을 쓴다.
// 2) 즐겨찾기 버튼: 첫차 매물 페이지에서 누르면 그 페이지가 직접 데이터를 읽어 이 스튜디오로 보낸다(서버 없이 동작).
import { normalizeChutcha } from '../lib/chutcha.js';

const SOURCE_ORIGINS = ['https://web.chutcha.net', 'https://www.chutcha.net', 'https://m.chutcha.net'];

/** 링크 붙여넣기에 쓸 중계 주소. 없으면 null(GitHub Pages처럼 서버가 없는 곳). */
export function apiBase() {
  const fromQuery = new URLSearchParams(location.search).get('api');
  if (fromQuery) { try { localStorage.setItem('importApi', fromQuery); } catch { /* 저장 불가 */ } return fromQuery; }
  try { const saved = localStorage.getItem('importApi'); if (saved) return saved; } catch { /* 저장 불가 */ }
  if (/\.github\.io$/.test(location.hostname) || location.protocol === 'file:') return null;
  return new URL('../api/listing', location.href).pathname;
}

export async function fetchListing(url) {
  const base = apiBase();
  if (!base) throw new Error('링크 붙여넣기는 가져오기 서버를 연결해야 쓸 수 있어요. 아래 즐겨찾기 버튼을 써 주세요.');
  let res;
  try {
    res = await fetch(`${base}?url=${encodeURIComponent(url)}`);
  } catch {
    throw new Error('매물 가져오기 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `매물을 가져오지 못했어요 (${res.status}).`);
  return body;
}

/** 즐겨찾기 막대에 끌어다 놓을 버튼의 코드. 첫차 매물 상세 페이지에서 실행된다. */
export function bookmarkletHref(studioUrl) {
  // 1) 페이지에 들어 있는 __NEXT_DATA__ 를 그대로 읽는다(사이트 안에서 이동해 온 경우 매물 키가 다르면 건너뜀)
  // 2) 안 되면 첫차 페이지가 쓰는 매물 API를 같은 사이트 권한으로 부른다
  const code = `(async()=>{const S=${JSON.stringify(studioUrl)};const k=decodeURIComponent((location.pathname.match(/\\/detail\\/([^/?#]+)/)||[])[1]||'');`
    + `if(!k){alert('첫차 매물 상세 페이지에서 눌러 주세요.');return}const w=window.open(S+'#/import','_blank');let d=null;`
    + `try{const p=JSON.parse(document.getElementById('__NEXT_DATA__').textContent).props.pageProps;if(p.keys===k){const q=p.dehydratedState.queries.find(x=>String(x.queryHash).includes('carDetailData'));d=q&&q.state.data}}catch(e){}`
    + `if(!d||!d.base_info){try{const r=await fetch('https://wapigw.chutcha.net/web001/car/getDetail/?keys='+encodeURIComponent(k));d=(await r.json()).data}catch(e){}}`
    + `if(!d||!d.base_info){alert('매물 정보를 읽지 못했어요. 페이지를 새로고침한 뒤 다시 눌러 주세요.');w&&w.close();return}`
    + `const msg={type:'listing-import',site:'chutcha',key:k,data:d};`
    + `const f=e=>{if(e.source===w&&e.data==='studio-ready'){w.postMessage(msg,new URL(S).origin);removeEventListener('message',f)}};addEventListener('message',f)})()`;
  return `javascript:${encodeURIComponent(code)}`;
}

/** 즐겨찾기 버튼이 연 창에서 매물 데이터를 기다린다. */
export function receiveFromBookmarklet(timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (!window.opener) { reject(new Error('첫차 매물 페이지에서 즐겨찾기 버튼을 눌러 이 화면을 열어 주세요.')); return; }
    const ping = setInterval(() => { try { window.opener.postMessage('studio-ready', '*'); } catch { /* 창이 닫힘 */ } }, 400);
    const timer = setTimeout(() => { cleanup(); reject(new Error('매물 정보를 받지 못했어요. 첫차 페이지에서 버튼을 다시 눌러 주세요.')); }, timeoutMs);
    const onMsg = (e) => {
      if (!SOURCE_ORIGINS.includes(e.origin) || !e.data || e.data.type !== 'listing-import') return;
      cleanup();
      try { resolve(normalizeChutcha(e.data.data, e.data.key)); } catch { reject(new Error('매물 정보를 읽지 못했어요.')); }
    };
    const cleanup = () => { clearInterval(ping); clearTimeout(timer); removeEventListener('message', onMsg); };
    addEventListener('message', onMsg);
  });
}

/** 사진 주소들을 내려받아 shrink(파일) 결과 배열로 돌려준다. 실패한 사진은 건너뛴다.
 *  사진 서버가 한꺼번에 많이 받으면 503으로 거절해서, 두 장씩 받고 거절되면 조금 기다렸다 다시 받는다. */
export async function downloadPhotos(urls, shrink, { max = 20, fallbacks = [], onProgress } = {}) {
  const list = urls.slice(0, max);
  const out = new Array(list.length).fill(null);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tryFetch = async (u) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(u, { mode: 'cors', signal: ctl.signal });
      return r.ok ? await shrink(await r.blob()) : null;
    } catch { return null; } finally { clearTimeout(timer); }
  };
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      for (let attempt = 0; attempt < 3 && !out[i]; attempt++) {
        if (attempt) await sleep(1200 * attempt);
        out[i] = await tryFetch(list[i]);
      }
      if (!out[i] && fallbacks[i]) out[i] = await tryFetch(fallbacks[i]);
      onProgress?.(++done, list.length);
    }
  };
  await Promise.all([worker(), worker()]);
  return out.filter(Boolean);
}
