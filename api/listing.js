// 매물 링크 가져오기 중계 함수(Vercel 서버리스).
// 브라우저는 다른 사이트의 매물 페이지를 직접 읽을 수 없어서(CORS), 이 함수가 대신 읽어 차량 정보와 사진 주소만 돌려준다.
// 열린 프록시가 되지 않도록 지원하는 매물 사이트 주소만 받고, 허용한 사이트에서 온 요청에만 답한다.
import { normalizeChutcha, chutchaImage } from '../lib/chutcha.js';

const ALLOWED_ORIGINS = [
  /^https:\/\/bobaekimboae\.github\.io$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];
const UA = 'Mozilla/5.0 (compatible; DealerShortformImporter/1.0)';
const CHUTCHA_API = 'https://wapigw.chutcha.net/web001';

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  // 같은 사이트(이 저장소를 Vercel 등에 올린 경우)에서 온 요청도 허용한다
  const sameSite = origin && req.headers.host && origin.replace(/^https?:\/\//, '') === req.headers.host;
  const allowed = sameSite || ALLOWED_ORIGINS.some((re) => re.test(origin));
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (origin && !allowed) { send(res, 403, { error: '허용되지 않은 사이트에서 온 요청이에요.' }); return; }

  const raw = String((req.query && req.query.url) || '').trim();
  let url;
  try { url = new URL(raw); } catch { send(res, 400, { error: '매물 링크를 확인해 주세요.' }); return; }
  try {
    if (/(^|\.)chutcha\.(net|kr)$/.test(url.hostname)) send(res, 200, await chutcha(url));
    else send(res, 422, { error: '아직 지원하지 않는 사이트예요. 지금은 첫차(chutcha.net) 매물 링크를 쓸 수 있어요.' });
  } catch (err) {
    send(res, 502, { error: err.message || '매물을 가져오지 못했어요.' });
  }
}

function send(res, status, body) {
  res.setHeader('Cache-Control', status === 200 ? 's-maxage=300' : 'no-store');
  res.status(status).json(body);
}

async function getJson(u) {
  const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`매물 사이트가 응답하지 않아요 (${r.status}).`);
  return JSON.parse(await r.text());
}

async function getHtml(u) {
  const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`매물 페이지를 열 수 없어요 (${r.status}).`);
  return { html: await r.text(), finalUrl: r.url };
}

function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// ---------- 첫차 ----------
async function chutcha(url) {
  let key = chutchaKey(url);
  if (!key && /\/bmc\/search/.test(url.pathname)) return chutchaSearch(url);
  if (!key) {
    // 공유 링크 등은 실제 페이지로 따라가서 매물 키를 찾는다
    const { html, finalUrl } = await getHtml(url.href);
    key = chutchaKey(new URL(finalUrl)) || nextData(html)?.props?.pageProps?.keys || (html.match(/\/bmc\/detail\/([A-Za-z0-9%=+]+)/) || [])[1];
    if (!key) throw new Error('이 링크에서 매물을 찾지 못했어요. 매물 상세 페이지 주소를 붙여넣어 주세요.');
  }
  const api = await getJson(`${CHUTCHA_API}/car/getDetail/?keys=${encodeURIComponent(key)}`);
  const d = api && api.data;
  if (!d || !d.base_info) throw new Error('판매가 끝났거나 없는 매물이에요.');
  return { type: 'listing', listing: normalizeChutcha(d, key) };
}

function chutchaKey(url) {
  const m = url.pathname.match(/\/detail\/([A-Za-z0-9%=+]+)/);
  if (m) return decodeURIComponent(m[1]);
  return url.searchParams.get('keys') || null;
}

async function chutchaSearch(url) {
  const { html } = await getHtml(url.href);
  const data = nextData(html);
  const groups = data?.props?.pageProps?.generalCarListData || {};
  const items = Object.values(groups).flat().filter((c) => c && c.detail_link_hash).slice(0, 60).map((c) => ({
    title: c.car_name || [c.brand_name, c.sub_model_name, c.grade_name].filter(Boolean).join(' '),
    price: c.price,
    year: c.year_str,
    mileage: c.mileage_str,
    thumb: c.list_img_path ? chutchaImage(c.list_img_path, '480x360&t=crop') : '',
    url: `https://web.chutcha.net/bmc/detail/${c.detail_link_hash}`,
  }));
  if (!items.length) throw new Error('이 목록에서 매물을 찾지 못했어요.');
  return { type: 'list', items };
}
