// 차량 정보 → 영상 자막 문구, 게시글 문구, 해시태그

const nf = new Intl.NumberFormat('ko-KR');

/** 만원 단위 가격 → "2,890만원", "1억 2,000만원" */
export function formatPrice(manwon) {
  const v = Math.round(Number(manwon));
  if (!v || v < 0) return '';
  if (v < 10000) return `${nf.format(v)}만원`;
  const eok = Math.floor(v / 10000);
  const rest = v % 10000;
  return rest ? `${eok}억 ${nf.format(rest)}만원` : `${eok}억원`;
}

/** km → 짧게 "3.2만km", 길게 "32,000km" */
export function formatKm(km, short = false) {
  const v = Math.round(Number(km));
  if (!Number.isFinite(v) || v < 0 || km === '' || km == null) return '';
  if (short && v >= 10000) return `${(v / 10000).toFixed(1).replace(/\.0$/, '')}만km`;
  return `${nf.format(v)}km`;
}

export function vehicleInfo(car) {
  const make = car.make.trim();
  const model = car.model.trim();
  const trim = car.trim.trim();
  const year = car.year ? `${car.year}년식` : '';
  const kmShort = formatKm(car.mileage, true);
  const price = formatPrice(car.price);
  const sub = [year, kmShort, car.fuel].filter(Boolean).join(' · ');
  const highlights = car.highlights.map((h) => h.trim()).filter(Boolean).slice(0, 6);
  return { make, model, trim, year, kmShort, price, sub, highlights, title: [make, model].filter(Boolean).join(' ') };
}

/** 2번째 사진부터 한 장에 하나씩 띄울 강조 문구. 사양과 특장점을 번갈아 섞는다. */
export function buildCallouts(car) {
  const info = vehicleInfo(car);
  const specs = [];
  if (car.mileage !== '' && car.mileage != null) specs.push({ k: '주행거리', v: formatKm(car.mileage) });
  if (car.year) specs.push({ k: '연식', v: `${car.year}년식` });
  const ft = [car.fuel, car.transmission].filter(Boolean).join(' · ');
  if (ft) specs.push({ k: '연료 · 변속기', v: ft });
  if (car.color.trim()) specs.push({ k: '색상', v: car.color.trim() });
  const hl = info.highlights.map((v) => ({ check: true, v }));
  const out = [];
  while (specs.length || hl.length) {
    if (specs.length) out.push(specs.shift());
    if (hl.length) out.push(hl.shift());
  }
  return out;
}

const tag = (s) => `#${String(s).replace(/[^\p{L}\p{N}_]/gu, '')}`;

export function buildHashtags(car) {
  const info = vehicleInfo(car);
  const model = info.model.replace(/\s+/g, '');
  const list = [
    '중고차', '중고차매매',
    info.make, model, info.make && model && `${info.make}${model}`, model && `${model}중고`,
    car.year && model && `${car.year}${model}`,
    car.body && car.body !== '기타' && car.body.split('·')[0],
    car.fuel === '전기' && '전기차', car.fuel === '하이브리드' && '하이브리드',
    ...info.highlights.slice(0, 3).map((h) => h.replace(/\s+/g, '')).filter((h) => h.length <= 10),
    '중고차추천', '카스타그램', '릴스', '쇼츠',
  ];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (!raw) continue;
    const t = tag(raw);
    if (t.length < 2 || seen.has(t)) continue;
    seen.add(t); out.push(t);
    if (out.length >= 15) break;
  }
  return out;
}

export function buildCaption(car, brand) {
  const info = vehicleInfo(car);
  const lines = [];
  lines.push(`🚗 ${[car.year && `${car.year}`, info.title, info.trim].filter(Boolean).join(' ')}`);
  const spec = [formatKm(car.mileage), car.fuel, car.transmission, car.color.trim()].filter(Boolean).join(' · ');
  if (spec) lines.push(`📍 ${spec}`);
  if (info.price) lines.push(`💰 ${info.price}`);
  if (info.highlights.length) lines.push(info.highlights.map((h) => `✔ ${h}`).join('  '));
  const contact = [brand.phone && `📞 ${brand.phone}`, brand.name && `(${brand.name})`].filter(Boolean).join(' ');
  if (contact) lines.push(contact);
  if (brand.cta) lines.push(brand.cta);
  lines.push('');
  lines.push(buildHashtags(car).join(' '));
  return lines.join('\n');
}
