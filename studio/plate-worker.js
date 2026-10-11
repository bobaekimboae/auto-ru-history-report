// 사진 판별 워커.
// - 번호판 찾기: YOLOS 번호판 모델(onnx-community/yolos-small-finetuned-license-plate-detection-ONNX)
// - 외관/실내 가리기: ResNet-18(ImageNet) 분류에서 자동차 외관 종류의 점수를 더한다
// 사진은 브라우저 안에서만 처리되고 서버로 전송되지 않는다.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';

const MODEL_ID = 'onnx-community/yolos-small-finetuned-license-plate-detection-ONNX';
env.allowLocalModels = false;

let detector = null;
let loading = null;
let backend = null;

// fp16을 지원하는 GPU면 WebGPU(31MB), 아니면 CPU용 모델(57MB)을 쓴다.
async function pickBackend() {
  try {
    const adapter = self.navigator?.gpu && await navigator.gpu.requestAdapter();
    if (adapter && adapter.features.has('shader-f16')) return { device: 'webgpu', dtype: 'q4f16' };
  } catch { /* WebGPU 미지원 */ }
  return { device: 'wasm', dtype: 'q8' };
}

function progressReporter() {
  const files = new Map();
  return (p) => {
    if (p.status !== 'progress' || !p.total) return;
    files.set(p.file, { loaded: p.loaded, total: p.total });
    let loaded = 0, total = 0;
    for (const f of files.values()) { loaded += f.loaded; total += f.total; }
    postMessage({ type: 'progress', loaded, total });
  };
}

function load(force) {
  if (loading && !force) return loading;
  loading = (async () => {
    backend = force || await pickBackend();
    detector = await pipeline('object-detection', MODEL_ID, { ...backend, progress_callback: progressReporter() });
  })().catch((err) => {
    loading = null;
    postMessage({ type: 'load-error', message: String(err?.message || err) });
    throw err;
  });
  return loading;
}

// ImageNet에서 차 바깥 모습에 해당하는 분류
const EXTERIOR = ['sports car', 'convertible', 'grille', 'beach wagon', 'minivan', 'limousine', 'jeep', 'car wheel', 'racer', 'pickup', 'cab', 'police van', 'moving van', 'tow truck', 'ambulance', 'Model T', 'go-kart', 'golfcart', 'trailer truck', 'fire engine', 'recreational vehicle'];
let classifier = null;
const loadClassifier = () => {
  classifier ||= pipeline('image-classification', 'Xenova/resnet-18', { device: 'wasm', dtype: 'q8', progress_callback: progressReporter() });
  return classifier;
};
async function exteriorScore(blob) {
  const cls = await loadClassifier();
  const url = URL.createObjectURL(blob);
  try {
    const top = await cls(url, { top_k: 5 });
    return top.reduce((s, r) => s + (EXTERIOR.some((n) => r.label.split(',')[0].trim() === n) ? r.score : 0), 0);
  } finally { URL.revokeObjectURL(url); }
}

const run = async (blob) => {
  const url = URL.createObjectURL(blob);
  try { return await detector(url, { threshold: 0.5, percentage: true }); }
  finally { URL.revokeObjectURL(url); }
};

self.onmessage = async ({ data }) => {
  if (data.type === 'classify') {
    try { postMessage({ type: 'exterior', id: data.id, score: await exteriorScore(data.blob) }); }
    catch (err) { classifier = null; postMessage({ type: 'run-error', id: data.id, message: String(err?.message || err) }); }
    return;
  }
  if (data.type !== 'run') return;
  const { id, blob } = data;
  try {
    await load();
    let boxes;
    try {
      boxes = await run(blob);
    } catch (err) {
      if (backend.device !== 'webgpu') throw err;
      await load({ device: 'wasm', dtype: 'q8' });
      boxes = await run(blob);
    }
    postMessage({ type: 'boxes', id, boxes: boxes.map((b) => ({ score: b.score, ...b.box })) });
  } catch (err) {
    postMessage({ type: 'run-error', id, message: String(err?.message || err) });
  }
};
