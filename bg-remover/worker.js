// 배경 제거 추론 워커. ISNet(onnx-community/ISNet-ONNX)으로 차량 마스크를 만든다.
// 사진은 브라우저 안에서만 처리되고 서버로 전송되지 않는다.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';

const MODEL_ID = 'onnx-community/ISNet-ONNX';
env.allowLocalModels = false;

let segmenter = null;
let loading = null;
let backend = null;

// fp16을 지원하는 GPU면 WebGPU(84MB), 아니면 CPU용 경량 모델(42MB)을 쓴다.
async function pickBackend() {
  try {
    const adapter = self.navigator?.gpu && await navigator.gpu.requestAdapter();
    if (adapter && adapter.features.has('shader-f16')) return { device: 'webgpu', dtype: 'fp16' };
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
    segmenter = await pipeline('background-removal', MODEL_ID, { ...backend, progress_callback: progressReporter() });
    postMessage({ type: 'ready', device: backend.device });
  })().catch((err) => {
    loading = null;
    postMessage({ type: 'load-error', message: String(err?.message || err) });
    throw err;
  });
  return loading;
}

async function segment(blob) {
  const [out] = await segmenter(blob);
  // RGBA 결과에서 알파 채널만 뽑아 마스크로 돌려준다.
  const { width, height, data, channels } = out;
  const mask = new Uint8Array(width * height);
  for (let i = 0, j = channels - 1; i < mask.length; i++, j += channels) mask[i] = data[j];
  return { width, height, mask };
}

self.onmessage = async ({ data }) => {
  if (data.type === 'load') { load().catch(() => {}); return; }
  if (data.type !== 'run') return;
  const { id, blob } = data;
  try {
    await load();
    let result;
    try {
      result = await segment(blob);
    } catch (err) {
      if (backend.device !== 'webgpu') throw err;
      // 일부 그래픽카드에서 WebGPU가 실패하면 CPU로 다시 시도한다.
      await load({ device: 'wasm', dtype: 'q8' });
      result = await segment(blob);
    }
    postMessage({ type: 'mask', id, ...result }, [result.mask.buffer]);
  } catch (err) {
    postMessage({ type: 'run-error', id, message: String(err?.message || err) });
  }
};
