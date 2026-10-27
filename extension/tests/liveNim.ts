// Opt-in authenticated integration test. The key is read only from this process environment.
import { NIMProvider } from '../src/providers/nimProvider';
import type { EditorContext } from '../src/types/context';
import { writeFileSync } from 'node:fs';
const key = process.env.NVIDIA_API_KEY;
const model = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-super-120b-a12b';
if (!key) throw new Error('NVIDIA_API_KEY is required; never put credentials in this file.');
const context: EditorContext = {
  revision: 'synthetic-revision', timestamp: Date.now(),
  project: { id: 'synthetic-project', name: 'Synthetic integration test', storageMode: 'temporary' },
  composition: { width: 1920, height: 1080, fpsNumerator: 30, fpsDenominator: 1, durationFrames: null, currentPlayheadFrame: 0 },
  clips: [], selectedClipIds: [], selectionKnown: false, capabilities: ['get_context', 'seek']
};
const started = Date.now();
const response = await new NIMProvider(key, model).generatePlan('Vá para o segundo 10.', context);
const op = response.plan?.operations[0];
const success = response.type === 'plan' && op?.command === 'seek' && op.args.frame === 300;
const result = { date: new Date().toISOString(), authenticated: true, model, elapsedMs: Date.now() - started, success, responseType: response.type, command: op?.command, frame: op?.args.frame, error: response.type === 'unsupported' ? response.message?.replaceAll(key, '[REDACTED]').replace(/account '[^']*'/g, "account '[REDACTED]'") : undefined };
writeFileSync('../docs/evidence/nim-live-test.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (!success) process.exitCode = 1;
