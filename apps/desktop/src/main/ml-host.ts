import * as ort from 'onnxruntime-node';

/*
 * ML host: a utility process that runs on-device models (blueprint RENDERING/04 → Background removal).
 * Kept apart from main and the core host so a model's memory and any native crash stay here; main
 * starts it on demand and ends it when idle.
 *
 * In:  { type: 'segment', id, model: <path>, rgb: Uint8Array (1024×1024×3) }
 * Out: { type: 'segment-result', id, mask?: Uint8Array (1024×1024, 0-255), error? }
 */

const SIZE = 1024;
// BiRefNet is trained on ImageNet-normalised input.
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

type Request = { type: 'segment'; id: number; model: string; rgb: Uint8Array };

let session: { path: string; s: Promise<ort.InferenceSession> } | null = null;

function load(path: string) {
  if (session?.path !== path) {
    // No arena or memory pattern: peak memory drops from ~6 GB to well under 1 GB, at a small speed cost.
    session = { path, s: ort.InferenceSession.create(path, { executionProviders: ['cpu'], graphOptimizationLevel: 'all', enableCpuMemArena: false, enableMemPattern: false, logSeverityLevel: 3 }) };
  }
  return session.s;
}

async function segment(model: string, rgb: Uint8Array): Promise<Uint8Array> {
  if (rgb.length !== SIZE * SIZE * 3) throw new Error('Expected a 1024×1024 RGB image');
  const sess = await load(model);
  const plane = SIZE * SIZE;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) input[c * plane + i] = (rgb[i * 3 + c]! / 255 - MEAN[c]!) / STD[c]!;
  }
  const out = await sess.run({ [sess.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });
  const logits = out[sess.outputNames[0]!]!.data as Float32Array;
  const mask = new Uint8Array(plane);
  for (let i = 0; i < plane; i++) mask[i] = Math.round(255 / (1 + Math.exp(-logits[i]!)));
  return mask;
}

process.parentPort.on('message', (e: { data: unknown }) => {
  const msg = e.data as Request;
  if (msg?.type !== 'segment') return;
  segment(msg.model, msg.rgb).then(
    (mask) => process.parentPort.postMessage({ type: 'segment-result', id: msg.id, mask }),
    (err: Error) => {
      session = null;
      process.parentPort.postMessage({ type: 'segment-result', id: msg.id, error: err.message });
    },
  );
});
