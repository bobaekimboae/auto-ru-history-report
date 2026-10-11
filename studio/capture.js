// 촬영 가이드: 휴대폰 카메라로 정해진 각도를 순서대로 찍게 안내한다.
// 화면에 차 윤곽선·차 둘레 위치 지도·수평계를 띄우고, 찍은 사진이 어둡거나 흔들리면 다시 찍게 한다.

export const SHOTS = [
  // 외관 8컷: 왼쪽 앞 사선(대표 사진)부터 차를 시계 방향으로 한 바퀴 돈다(턴테이블·360° 순서)
  { id: 'fl', name: '왼쪽 앞 사선', tip: '대표 사진이에요. 차 앞모서리에서 비스듬히, 앞바퀴가 보이게', deg: 45, sil: null },
  { id: 'f', name: '정면', tip: '차 정면 가운데에서 번호판 높이로', deg: 0, sil: 'front' },
  { id: 'fr', name: '오른쪽 앞 사선', tip: '오른쪽 앞모서리에서 비스듬히', deg: 315, sil: null },
  { id: 'r', name: '오른쪽 옆', tip: '차 옆 가운데에서 차 전체가 들어오게', deg: 270, sil: 'side' },
  { id: 'rr', name: '오른쪽 뒤 사선', tip: '오른쪽 뒷모서리에서 비스듬히', deg: 225, sil: null },
  { id: 'b', name: '후면', tip: '차 뒤 가운데에서 번호판 높이로', deg: 180, sil: 'front' },
  { id: 'rl', name: '왼쪽 뒤 사선', tip: '왼쪽 뒷모서리에서 비스듬히', deg: 135, sil: null },
  { id: 'l', name: '왼쪽 옆', tip: '차 옆 가운데에서 차 전체가 들어오게', deg: 90, sil: 'sideL' },
  // 실내·디테일
  { id: 'seat', name: '운전석·앞좌석', tip: '운전석 문을 열고 좌석과 핸들이 보이게', interior: true },
  { id: 'cluster', name: '계기판', tip: '시동을 켜고 주행거리가 보이게', interior: true },
  { id: 'center', name: '센터페시아·내비', tip: '화면과 공조 버튼이 보이게', interior: true },
  { id: 'rear', name: '뒷좌석', tip: '뒷문을 열고 좌석 전체가 보이게', interior: true },
  { id: 'trunk', name: '트렁크', tip: '트렁크를 열고 안쪽 전체', interior: true },
  { id: 'engine', name: '엔진룸', tip: '보닛을 열고 위에서', interior: true },
  { id: 'wheel', name: '휠·타이어', tip: '앞바퀴를 가까이, 타이어 홈이 보이게', interior: true },
];

const SIL = {
  side: '<path d="M14 118c0-18 10-26 40-30l66-6c20-20 50-36 90-38h60c30 2 50 18 70 36l30 6c15 4 20 14 20 32z"/><circle cx="95" cy="120" r="22"/><circle cx="315" cy="120" r="22"/>',
  front: '<path d="M60 170v-50c0-15 10-22 20-24l20-36c5-10 15-14 30-14h140c15 0 25 4 30 14l20 36c10 2 20 9 20 24v50z" transform="translate(-20 -10) scale(1 1)"/><rect x="48" y="160" width="40" height="30" rx="6"/><rect x="312" y="160" width="40" height="30" rx="6"/><rect x="150" y="128" width="100" height="22" rx="3"/>',
};
SIL.sideL = `<g transform="translate(410 0) scale(-1 1)">${SIL.side}</g>`;

/** 사진 품질: 평균 밝기와 선명도(라플라시안 분산) */
export function photoQuality(canvas) {
  const s = 256;
  const k = s / Math.max(canvas.width, canvas.height);
  const w = Math.round(canvas.width * k), h = Math.round(canvas.height * k);
  const c = new OffscreenCanvas(w, h);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(canvas, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < g.length; i++) { g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; sum += g[i]; }
  let m = 0, m2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let xx = 1; xx < w - 1; xx++) {
    const i = y * w + xx;
    const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
    m += l; m2 += l * l; n++;
  }
  const mean = m / n;
  return { brightness: sum / g.length, sharpness: m2 / n - mean * mean };
}

/**
 * @param {HTMLElement} view
 * @param {{ vehicle, onPhoto: (file: Blob, shot) => Promise<void>, onDone: () => void, toast }} o
 */
export async function renderCapture(view, { vehicle: v, onPhoto, onDone, toast }) {
  const done = new Set(v.captured || []);
  let idx = Math.max(0, SHOTS.findIndex((s) => !done.has(s.id)));
  view.innerHTML = `
    <div class="cap" id="cap">
      <video id="capVideo" playsinline muted autoplay></video>
      <div class="cap-frame" id="capFrame"><svg viewBox="0 0 410 200" id="capSil" aria-hidden="true"></svg></div>
      <div class="cap-level" id="capLevel" hidden><span></span></div>
      <header class="cap-top">
        <button class="cap-btn" id="capClose" type="button">완료</button>
        <div class="cap-title"><strong id="capName"></strong><span id="capTip"></span></div>
        <span class="cap-count num" id="capCount"></span>
      </header>
      <svg class="cap-map" id="capMap" viewBox="-60 -60 120 120" aria-hidden="true"></svg>
      <p class="cap-rotate" id="capRotate" hidden>휴대폰을 가로로 돌려 주세요</p>
      <div class="cap-check" id="capCheck" hidden>
        <img id="capShot" alt="찍은 사진">
        <p id="capWarn"></p>
        <div><button class="cap-btn" id="capRetake" type="button">다시 찍기</button><button class="cap-btn cap-primary" id="capUse" type="button">이 사진 쓰기</button></div>
      </div>
      <footer class="cap-bottom">
        <button class="cap-btn" id="capPrev" type="button">이전</button>
        <button class="cap-shutter" id="capShutter" type="button" aria-label="찍기"></button>
        <button class="cap-btn" id="capSkip" type="button">건너뛰기</button>
      </footer>
      <input type="file" id="capFile" accept="image/*" capture="environment" hidden>
    </div>`;
  const $ = (id) => view.querySelector(`#${id}`);
  const video = $('capVideo');
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
    video.srcObject = stream;
  } catch {
    // 카메라를 못 쓰면(PC·권한 거부) 휴대폰 카메라 앱으로 찍어 올리게 한다
    $('cap').classList.add('no-cam');
  }

  const drawMap = () => {
    const parts = ['<rect x="-11" y="-22" width="22" height="44" rx="7" class="car"/><path d="M-8 -18h16" class="nose"/>'];
    SHOTS.forEach((s, i) => {
      if (s.interior) return;
      const a = (s.deg * Math.PI) / 180;
      const x = -Math.sin(a) * 44, y = -Math.cos(a) * 44;
      parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === idx ? 7 : 4.5}" class="${i === idx ? 'cur' : done.has(s.id) ? 'ok' : 'todo'}"/>`);
      if (i === idx) parts.push(`<path d="M${x.toFixed(1)} ${y.toFixed(1)}L${(x * 0.62).toFixed(1)} ${(y * 0.62).toFixed(1)}" class="ray"/>`);
    });
    $('capMap').innerHTML = parts.join('');
  };
  const draw = () => {
    const s = SHOTS[idx];
    $('capName').textContent = `${idx + 1}. ${s.name}`;
    $('capTip').textContent = s.tip;
    $('capCount').textContent = `${done.size} / ${SHOTS.length}`;
    $('capSil').innerHTML = s.sil ? SIL[s.sil] : '';
    $('capFrame').dataset.kind = s.interior ? 'interior' : s.sil ? 'sil' : 'diag';
    $('capMap').hidden = !!s.interior;
    $('capPrev').disabled = idx === 0;
    drawMap();
  };

  // 가로 방향·수평 안내
  const orient = () => { $('capRotate').hidden = !(window.innerHeight > window.innerWidth && !SHOTS[idx].interior); };
  addEventListener('resize', orient);
  const onTilt = (e) => {
    if (e.gamma == null) return;
    $('capLevel').hidden = false;
    // 가로로 든 휴대폰의 좌우 기울기
    const roll = (screen.orientation?.angle === 90 ? -1 : 1) * (e.beta || 0);
    const el = $('capLevel').firstElementChild;
    el.style.transform = `rotate(${Math.max(-20, Math.min(20, roll))}deg)`;
    $('capLevel').dataset.ok = String(Math.abs(roll) < 3);
  };
  addEventListener('deviceorientation', onTilt);

  let pending = null;
  const check = async (canvasOrBlob) => {
    let cv = canvasOrBlob;
    if (cv instanceof Blob) {
      const bmp = await createImageBitmap(cv, { imageOrientation: 'from-image' });
      cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
      cv.getContext('2d').drawImage(bmp, 0, 0); bmp.close();
    }
    const q = photoQuality(cv);
    const warn = [];
    if (q.brightness < 55) warn.push('사진이 어두워요. 밝은 곳에서 찍거나 조명을 켜 주세요.');
    if (q.brightness > 225) warn.push('사진이 너무 밝아요. 역광을 피해 주세요.');
    if (q.sharpness < 60) warn.push('사진이 흔들렸어요. 휴대폰을 두 손으로 잡고 다시 찍어 보세요.');
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.92));
    pending = blob;
    $('capShot').src = URL.createObjectURL(blob);
    $('capWarn').textContent = warn.join(' ') || '잘 찍혔어요.';
    $('capWarn').dataset.ok = String(!warn.length);
    $('capCheck').hidden = false;
  };
  $('capShutter').addEventListener('click', () => {
    if (!stream) { $('capFile').click(); return; }
    const cv = document.createElement('canvas');
    cv.width = video.videoWidth; cv.height = video.videoHeight;
    cv.getContext('2d').drawImage(video, 0, 0);
    $('cap').classList.add('flash');
    setTimeout(() => $('cap').classList.remove('flash'), 180);
    check(cv);
  });
  $('capFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) check(f); });
  $('capRetake').addEventListener('click', () => { $('capCheck').hidden = true; pending = null; });
  $('capUse').addEventListener('click', async () => {
    if (!pending) return;
    const s = SHOTS[idx];
    $('capUse').disabled = true;
    try {
      await onPhoto(pending, s);
      done.add(s.id);
      $('capCheck').hidden = true; pending = null;
      const next = SHOTS.findIndex((x, i) => i > idx && !done.has(x.id));
      if (next < 0 && done.size >= SHOTS.length) { toast('모든 사진을 찍었어요.'); finish(); return; }
      idx = next >= 0 ? next : Math.min(SHOTS.length - 1, idx + 1);
      draw(); orient();
    } finally { $('capUse').disabled = false; }
  });
  $('capSkip').addEventListener('click', () => { idx = Math.min(SHOTS.length - 1, idx + 1); draw(); orient(); });
  $('capPrev').addEventListener('click', () => { idx = Math.max(0, idx - 1); draw(); orient(); });
  const finish = () => onDone([...done]);
  $('capClose').addEventListener('click', finish);
  // iOS는 기울기 센서를 쓰려면 한 번 허락을 받아야 한다
  if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
    $('cap').addEventListener('click', () => DeviceOrientationEvent.requestPermission().catch(() => {}), { once: true });
  }
  draw(); orient();
  return () => {
    stream?.getTracks().forEach((t) => t.stop());
    removeEventListener('resize', orient);
    removeEventListener('deviceorientation', onTilt);
  };
}
