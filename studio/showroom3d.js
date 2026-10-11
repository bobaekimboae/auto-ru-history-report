// 3D 쇼룸 배경: three.js로 실제 공간(광택 바닥 반사·천장 조명·벽 재질·벽에 붙은 상사 간판)을 렌더링한다.
// 차는 사진에서 잘라낸 그대로 위에 얹으므로, 차를 세울 바닥 위치(floorY)와 차 너비(carW)를 함께 돌려준다.
import { drawSign } from '../bg-remover/compose.js';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';
const REFLECTOR_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/objects/Reflector.js/+esm';
const RECT_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/lights/RectAreaLightUniformsLib.js/+esm';
const ROOM_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/environments/RoomEnvironment.js/+esm';

let libs = null;
const loadLibs = () => (libs ||= Promise.all([import(THREE_URL), import(REFLECTOR_URL), import(RECT_URL), import(ROOM_URL)])
  .then(([THREE, R, A, E]) => { A.RectAreaLightUniformsLib.init(); return { THREE, Reflector: R.Reflector, RoomEnvironment: E.RoomEnvironment }; })
  .catch((err) => { libs = null; throw err; }));

// 공간 종류. wall: 벽 재질, floor: 바닥 색·거칠기, light: 조명 색, signDark: 어두운 벽용 간판
export const STYLES3D = {
  light: { wall: 'slat', wallColor: '#eceef1', floor: '#c9cdd2', rough: 0.18, mirror: 0.32, light: '#ffffff', ambient: 1.1, signDark: false },
  dark: { wall: 'slat', wallColor: '#24272c', floor: '#16181b', rough: 0.12, mirror: 0.42, light: '#fff6ea', ambient: 0.45, signDark: true },
  concrete: { wall: 'concrete', wallColor: '#b9bbbd', floor: '#8f9296', rough: 0.3, mirror: 0.22, light: '#ffffff', ambient: 0.9, signDark: false },
  wood: { wall: 'wood', wallColor: '#7a573c', floor: '#2b2d31', rough: 0.15, mirror: 0.38, light: '#ffe2bd', ambient: 0.55, signDark: true },
  garage: { wall: 'panel', wallColor: '#3a3f46', floor: '#4b4f55', rough: 0.22, mirror: 0.3, light: '#e6f1ff', ambient: 0.6, signDark: true },
};

// ---------- 재질 그림 ----------
function texCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function wallTexture(kind, color) {
  const rnd = seeded(11);
  if (kind === 'concrete') {
    return texCanvas(1024, 1024, (x, w, h) => {
      x.fillStyle = color; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const px = rnd() * w, py = rnd() * h, r = 8 + rnd() * 90;
        const g = x.createRadialGradient(px, py, 0, px, py, r);
        const a = 0.02 + rnd() * 0.05;
        g.addColorStop(0, rnd() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(30,30,30,${a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
      }
      // 거푸집 이음선과 폼타이 구멍
      x.fillStyle = 'rgba(40,40,40,0.25)';
      x.fillRect(0, h / 2, w, 2); x.fillRect(w / 2, 0, 2, h); x.fillRect(0, 0, w, 2); x.fillRect(0, 0, 2, h);
      for (const [px, py] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const g = x.createRadialGradient(px * w, py * h, 0, px * w, py * h, 12);
        g.addColorStop(0, 'rgba(40,40,40,0.6)'); g.addColorStop(1, 'rgba(40,40,40,0)');
        x.fillStyle = g; x.beginPath(); x.arc(px * w, py * h, 12, 0, Math.PI * 2); x.fill();
      }
    });
  }
  if (kind === 'wood') {
    return texCanvas(1024, 1024, (x, w, h) => {
      const n = 16, pw = w / n;
      for (let i = 0; i < n; i++) {
        const k = 0.82 + rnd() * 0.32;
        const c = parseInt(color.slice(1), 16);
        const r = Math.min(255, (c >> 16 & 255) * k), g = Math.min(255, (c >> 8 & 255) * k), b = Math.min(255, (c & 255) * k);
        x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(i * pw, 0, pw, h);
        x.strokeStyle = 'rgba(30,16,8,0.18)'; x.lineWidth = 1.5;
        for (let j = 0; j < 7; j++) {
          const gx = i * pw + pw * (0.1 + rnd() * 0.8);
          x.beginPath(); x.moveTo(gx, 0);
          x.bezierCurveTo(gx + pw * 0.15, h * 0.33, gx - pw * 0.15, h * 0.66, gx + pw * 0.05, h); x.stroke();
        }
        x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(i * pw, 0, pw * 0.1, h);
      }
    });
  }
  if (kind === 'panel') {
    return texCanvas(1024, 1024, (x, w, h) => {
      x.fillStyle = color; x.fillRect(0, 0, w, h);
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.08)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(0,0,0,0.5)';
      x.fillRect(0, 0, w, 4); x.fillRect(0, 0, 4, h);
      x.fillStyle = 'rgba(255,255,255,0.08)';
      x.fillRect(0, 5, w, 2); x.fillRect(5, 0, 2, h);
    });
  }
  // slat: 세로 루버 패널
  return texCanvas(512, 512, (x, w, h) => {
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    const n = 8, pw = w / n;
    for (let i = 0; i < n; i++) {
      const g = x.createLinearGradient(i * pw, 0, (i + 1) * pw, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.16)'); g.addColorStop(0.12, 'rgba(255,255,255,0.10)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.06)');
      x.fillStyle = g; x.fillRect(i * pw, 0, pw, h);
    }
  });
}
function floorTexture(color) {
  const rnd = seeded(5);
  return texCanvas(1024, 1024, (x, w, h) => {
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      const px = rnd() * w, py = rnd() * h, r = 20 + rnd() * 120;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      const a = 0.015 + rnd() * 0.03;
      g.addColorStop(0, rnd() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
    }
    // 큰 타일 줄눈
    x.fillStyle = 'rgba(0,0,0,0.12)';
    x.fillRect(0, 0, w, 2); x.fillRect(0, 0, 2, h);
  });
}

const cache = new Map();

/**
 * @param {{ style: string, W: number, H: number, sign: { name, sub, logo }, accent?: string, wallColor?: string }} o
 * @returns {Promise<{ canvas: HTMLCanvasElement, floorY: number, carW: number }>}
 */
export function renderShowroom3D(o) {
  const key = [o.style, o.W, o.H, o.sign?.name, o.sign?.sub, o.sign?.logo?.src, o.accent, o.wallColor].join('|');
  if (!cache.has(key)) cache.set(key, build(o).catch((err) => { cache.delete(key); throw err; }));
  return cache.get(key);
}

async function build({ style, W, H, sign = {}, accent = '#df5419', wallColor }) {
  const { THREE, Reflector, RoomEnvironment } = await loadLibs();
  const S = { ...(STYLES3D[style] || STYLES3D.light) };
  if (wallColor) {
    S.wallColor = wallColor;
    const n = parseInt(wallColor.slice(1), 16);
    S.signDark = (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255 < 0.6;
  }
  const aspect = W / H;
  const vertical = H > W;

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.background = new THREE.Color(S.wallColor);

  // 카메라: 차(길이 4.8m, 원점)가 화면 너비의 일정 비율을 차지하도록 거리를 정한다
  const vfov = vertical ? 50 : aspect < 1.2 ? 46 : 36;
  const carFrac = vertical ? 0.84 : aspect < 1.2 ? 0.8 : 0.7;
  const tanH = Math.tan(THREE.MathUtils.degToRad(vfov / 2)) * aspect;
  const dist = 2.4 / (carFrac * tanH);
  const camera = new THREE.PerspectiveCamera(vfov, aspect, 0.1, 200);
  camera.position.set(0, 1.15, dist);
  camera.lookAt(0, vertical ? 1.75 : 1.15, 0);
  camera.updateMatrixWorld();

  const wallZ = -3.2;
  const roomW = 60, roomH = 30;
  // 바닥: 거울 반사 + 그 위에 반투명 광택 바닥
  const mirror = new Reflector(new THREE.PlaneGeometry(roomW, 60), {
    textureWidth: Math.min(2048, W), textureHeight: Math.min(2048, H), color: new THREE.Color(0x888888),
  });
  mirror.rotation.x = -Math.PI / 2;
  scene.add(mirror);
  const ft = new THREE.CanvasTexture(floorTexture(S.floor));
  ft.colorSpace = THREE.SRGBColorSpace;
  ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(8, 8); ft.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomW, 60), new THREE.MeshStandardMaterial({
    map: ft, roughness: S.rough, metalness: 0, transparent: true, opacity: 1 - S.mirror,
  }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002;
  scene.add(floor);

  // 뒷벽과 옆벽
  const wt = new THREE.CanvasTexture(wallTexture(S.wall, S.wallColor));
  wt.colorSpace = THREE.SRGBColorSpace;
  wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
  wt.repeat.set(S.wall === 'slat' ? 14 : S.wall === 'wood' ? 4 : 8, S.wall === 'slat' ? 3 : S.wall === 'wood' ? 2 : 4);
  wt.anisotropy = 8;
  const wallMat = new THREE.MeshStandardMaterial({ map: wt, roughness: S.wall === 'panel' ? 0.45 : 0.85, metalness: S.wall === 'panel' ? 0.35 : 0 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), wallMat);
  back.position.set(0, roomH / 2, wallZ);
  scene.add(back);
  for (const side of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(40, roomH), wallMat);
    sw.position.set(side * 9.5, roomH / 2, wallZ + 20);
    sw.rotation.y = -side * Math.PI / 2;
    scene.add(sw);
  }
  // 걸레받이 간접 조명(벽 아래 빛줄)
  const cove = new THREE.Mesh(new THREE.BoxGeometry(roomW, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: S.light }));
  cove.position.set(0, 0.06, wallZ + 0.03);
  scene.add(cove);
  const coveLight = new THREE.RectAreaLight(S.light, S.signDark ? 4 : 2, roomW, 0.3);
  coveLight.position.set(0, 0.1, wallZ + 0.05); coveLight.lookAt(0, 3, wallZ);
  scene.add(coveLight);

  // 천장 조명: 줄 조명(보이는 빛 막대) + 면광원
  const ceilY = vertical ? 7.5 : 5.2;
  for (let i = 0; i < 4; i++) {
    const z = wallZ + 1.5 + i * 3.2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(7, 0.05, 0.22), new THREE.MeshBasicMaterial({ color: S.light }));
    bar.position.set(0, ceilY, z);
    scene.add(bar);
    const rl = new THREE.RectAreaLight(S.light, 6 * S.ambient, 7, 0.6);
    rl.position.set(0, ceilY - 0.05, z); rl.lookAt(0, 0, z);
    scene.add(rl);
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(roomW, 60), new THREE.MeshStandardMaterial({ color: S.wallColor, roughness: 1 }));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = vertical ? 16 : ceilY + 0.1;
  scene.add(ceiling);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.35 * S.ambient));
  // 차 자리를 비추는 조명(바닥에 밝은 원)
  const spot = new THREE.SpotLight(S.light, 60 * S.ambient, 20, Math.PI / 6, 0.6, 1.4);
  spot.position.set(0, ceilY, 1.5); spot.target.position.set(0, 0, 0);
  scene.add(spot, spot.target);

  // 낮은 원형 무대와 상사 색 LED 테두리
  const podium = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.35, 0.06, 96), new THREE.MeshStandardMaterial({ color: S.signDark ? '#1d2024' : '#e9ebee', roughness: 0.25, metalness: 0.1 }));
  podium.position.y = 0.03;
  scene.add(podium);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.32, 0.012, 8, 160), new THREE.MeshBasicMaterial({ color: accent }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.062;
  scene.add(ring);

  // 벽 간판: 상사명·로고를 그린 판을 벽에서 띄워 붙이고, 뒤에 은은한 후광
  if (sign.name || sign.logo) {
    const sh0 = vertical ? 1100 : 640;
    const sc = texCanvas(2048, sh0, (x, w, h) => drawSign(x, w, h, h, S.signDark, sign));
    const st = new THREE.CanvasTexture(sc);
    st.colorSpace = THREE.SRGBColorSpace; st.anisotropy = 8;
    // 화면 위쪽(세로 16%, 가로 18%)에 오도록 벽 위 위치를 구한다
    const ndcY = 1 - 2 * (vertical ? 0.17 : 0.2);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, ndcY), camera);
    const hit = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -wallZ - 0.05), hit);
    const depth = camera.position.z - wallZ;
    const viewW = 2 * depth * tanH;
    const sw = viewW * (vertical ? 1.15 : 0.8), sh = sw * sh0 / 2048;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: st, transparent: true, toneMapped: false }));
    plate.position.set(0, hit.y, wallZ + 0.06);
    scene.add(plate);
    if (S.signDark) {
      const halo = new THREE.PointLight(S.light, 8, sw * 0.6);
      halo.position.set(0, hit.y, wallZ + 0.4);
      scene.add(halo);
    }
  }

  renderer.render(scene, camera);
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  out.getContext('2d').drawImage(renderer.domElement, 0, 0);

  // 차를 세울 곳: 원점의 화면 위치, 차 길이 4.8m의 화면 너비
  const p0 = new THREE.Vector3(0, 0.06, 0.6).project(camera);
  const pl = new THREE.Vector3(-2.4, 0.06, 0.6).project(camera), pr = new THREE.Vector3(2.4, 0.06, 0.6).project(camera);
  const floorY = (1 - p0.y) / 2 * H;
  const carW = (pr.x - pl.x) / 2 * W;
  // 무대 윗면 타원(턴테이블 영상에서 도는 홈을 겹쳐 그릴 자리)
  const toPx = (v) => { const q = v.project(camera); return [(q.x + 1) / 2 * W, (1 - q.y) / 2 * H]; };
  const [fx, fy] = toPx(new THREE.Vector3(0, 0.062, 3.32)), [bx, by] = toPx(new THREE.Vector3(0, 0.062, -3.32));
  const [rxp] = toPx(new THREE.Vector3(3.32, 0.062, 0));
  const podiumEl = { cx: W / 2, cy: (fy + by) / 2, rx: rxp - W / 2, ry: (fy - by) / 2 };

  pmrem.dispose(); renderer.dispose(); renderer.forceContextLoss?.();
  scene.traverse((m) => { m.geometry?.dispose?.(); m.material?.map?.dispose?.(); m.material?.dispose?.(); });
  return { canvas: out, floorY, carW, podium: podiumEl };
}
