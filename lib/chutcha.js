// 첫차(chutcha.net) 매물 데이터를 숏폼 도구의 차량 정보로 바꾼다. 중계 함수(api/listing.js)와 스튜디오(즐겨찾기 버튼으로 받은 데이터)가 같이 쓴다.
export const CHUTCHA_IMG = 'https://imgsc.chutcha.kr';

const NOTABLE_OPTIONS = ['썬루프', '헤드업디스플레이', '어라운드뷰', '통풍시트', '전동 트렁크', '크루즈컨트롤', '가죽시트', '열선시트', '스마트키', '후방카메라', '내비게이션'];

export function normalizeChutcha(d, key) {
  const b = d.base_info || {};
  const perf = d.perform_summary || {};
  const hist = d.carhistory_summary || {};
  const opts = (d.options || []).filter((o) => o.val === 'Y').map((o) => o.kor_name);
  const highlights = [];
  if (perf.accident_history === '무사고') highlights.push('무사고');
  if (hist.owner_change_num === '없음') highlights.push('1인 소유');
  if (hist.flooded_num === '없음' && hist.total_loss_num === '없음') highlights.push('침수·전손 이력 없음');
  NOTABLE_OPTIONS.filter((o) => opts.includes(o)).slice(0, 3).forEach((o) => highlights.push(o));
  const trans = b.transmission_name || '';
  return {
    source: 'chutcha',
    sourceUrl: `https://web.chutcha.net/bmc/detail/${key}`,
    plate: b.number_plate || '',
    maker: b.brand_name || '',
    model: b.sub_model_name || b.model_name || '',
    trim: [b.grade_name, b.sub_grade_name].filter(Boolean).join(' '),
    year: b.year_str || (b.first_reg_year ? `${b.first_reg_year}년` : ''),
    mileage: String(b.plain_mileage || '').replace(/[^\d]/g, ''),
    fuel: b.fuel_name || '',
    transmission: /수동/.test(trans) ? '수동' : trans ? '자동' : '',
    color: b.color || '',
    accident: perf.accident_history === '무사고' ? '무사고' : perf.accident_history ? '사고 있음' : '',
    price: String((d.price_info && d.price_info.int_price) || b.plain_price || '').replace(/[^\d]/g, ''),
    highlights: highlights.slice(0, 5),
    options: opts,
    description: String(d.infor_desc || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600),
    photos: (d.img_list || []).map((i) => i.img_path).filter(Boolean).map((path) => chutchaImage(path)),
    // 크기 조절 서버가 바쁠 때 쓸 원본 사진(작지만 늘 열림)
    photoFallbacks: (d.img_list || []).map((i) => i.img_path).filter(Boolean).map((path) => `https://img.chutcha.kr${path}`),
    seller: d.call_dealer_info ? { shop: d.call_dealer_info.shop_name || '', name: d.call_dealer_info.user_name || '' } : null,
  };
}

// 원본 비율 그대로 1280px 사진(이 주소는 다른 사이트에서도 읽을 수 있게 열려 있음)
export function chutchaImage(path, size = '1280x960') {
  return `${CHUTCHA_IMG}${path.replace(/\.(jpe?g|png|webp)$/i, '_ori.$1')}?s=${size}`;
}
