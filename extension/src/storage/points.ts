import { z } from 'zod';

export const SavedPointSchema = z.object({
  id: z.string().min(1).max(100), name: z.string().trim().min(1).max(60),
  frame: z.number().int().min(0).max(100000000),
  fpsNumerator: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  fpsDenominator: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
}).strict();
export type SavedPoint = z.infer<typeof SavedPointSchema>;
export const PointListSchema = z.array(SavedPointSchema).max(200).refine(points => new Set(points.map(p=>p.id)).size === points.length, 'IDs de pontos duplicados.');
const BookSchema = z.object({ version: z.number().int().min(0), points: PointListSchema }).strict();
export type PointBook = z.infer<typeof BookSchema>;

function storageKey(projectKey: string) {
  if (!/^[a-f0-9]{64}$/.test(projectKey)) throw new Error('Identidade persistente do projeto indisponível.');
  return `wide-studio:points:v1:${projectKey}`;
}
export async function loadPoints(projectKey: string): Promise<PointBook> {
  const key = storageKey(projectKey), stored = await chrome.storage.local.get(key);
  if (stored[key] === undefined) return { version: 0, points: [] };
  const parsed = BookSchema.safeParse(stored[key]);
  if (!parsed.success) throw new Error('Os pontos salvos estão em formato inválido. Não foram sobrescritos.');
  return parsed.data;
}

// Compare-and-set must run under the background's write lock.
export async function savePoints(projectKey: string, expectedVersion: number, input: unknown): Promise<PointBook> {
  const points = PointListSchema.parse(input), previous = await loadPoints(projectKey);
  if (previous.version !== expectedVersion) throw new Error('Os pontos mudaram em outro painel. Atualize antes de salvar.');
  const book = { version: previous.version + 1, points };
  await chrome.storage.local.set({ [storageKey(projectKey)]: book });
  return book;
}

export const PointBackupSchema = z.object({
  format: z.literal('wide-studio-points'), version: z.literal(1),
  projectName: z.string().max(500), points: PointListSchema
}).strict();
