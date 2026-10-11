// AI 나레이션 음성 워커. Supertonic 2(Supertone, OpenRAIL-M)로 한국어 문장을 읽어 44.1kHz 음성을 만든다.
// 대본과 음성은 브라우저 안에서만 처리되고 서버로 전송되지 않는다.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';

const MODEL_ID = 'onnx-community/Supertonic-TTS-2-ONNX';
const VOICE_URL = (id) => `https://huggingface.co/${MODEL_ID}/resolve/main/voices/${id}.bin`;
env.allowLocalModels = false;

let tts = null;
let loading = null;

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

async function hasWebGPU() {
  try { return !!(self.navigator?.gpu && await navigator.gpu.requestAdapter()); } catch { return false; }
}

function load(device) {
  if (loading && !device) return loading;
  loading = (async () => {
    const dev = device || (await hasWebGPU() ? 'webgpu' : 'wasm');
    tts = await pipeline('text-to-speech', MODEL_ID, { device: dev, progress_callback: progressReporter() });
    tts.device = dev;
  })().catch((err) => { loading = null; throw err; });
  return loading;
}

const say = (text, voice, speed, steps) => tts(`<ko>${text}</ko>`, { speaker_embeddings: VOICE_URL(voice), num_inference_steps: steps, speed });

self.onmessage = async ({ data }) => {
  if (data.type !== 'speak') return;
  const { id, sentences, voice = 'F1', speed = 1.05, steps = 8, gap = 0.3 } = data;
  try {
    await load();
    const parts = [];
    const times = [];
    let sr = 44100;
    for (let i = 0; i < sentences.length; i++) {
      postMessage({ type: 'sentence', id, i, n: sentences.length });
      let out;
      try { out = await say(sentences[i], voice, speed, steps); }
      catch (err) {
        if (tts.device !== 'webgpu') throw err;
        await load('wasm');          // 일부 그래픽카드에서 WebGPU가 실패하면 CPU로 다시
        out = await say(sentences[i], voice, speed, steps);
      }
      sr = out.sampling_rate;
      parts.push(out.audio);
      times.push(out.audio.length / sr);
    }
    // 문장 사이에 짧은 쉼을 넣어 이어 붙인다
    const gapN = Math.round(gap * sr);
    const total = parts.reduce((s, a) => s + a.length, 0) + gapN * Math.max(0, parts.length - 1);
    const pcm = new Float32Array(total);
    const starts = [];
    let o = 0;
    parts.forEach((a, i) => { starts.push(o / sr); pcm.set(a, o); o += a.length + (i < parts.length - 1 ? gapN : 0); });
    postMessage({ type: 'audio', id, pcm, sr, starts, durs: times }, [pcm.buffer]);
  } catch (err) {
    postMessage({ type: 'error', id, message: String(err?.message || err) });
  }
};
