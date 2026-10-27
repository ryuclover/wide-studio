import { z } from 'zod';

export const GetContextArgsSchema = z.object({
  scope: z.enum(['full', 'summary']).default('full')
}).strict();

export const SeekArgsSchema = z.object({
  frame: z.number().int().min(0, 'Frame deve ser um inteiro não negativo').max(100000000)
}).strict();

export const AddTextStyleSchema = z.object({
  fontSize: z.number().min(8).max(200).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar no formato hexadecimal #RRGGBB').optional()
}).strict().optional();

export const AddTextArgsSchema = z.object({
  text: z.string().min(1, 'Texto não pode ser vazio').max(200, 'Texto não pode exceder 200 caracteres'),
  startFrame: z.number().int().min(0, 'Frame inicial deve ser >= 0'),
  endFrame: z.number().int().min(1, 'Frame final deve ser >= 1'),
  style: AddTextStyleSchema
}).strict().refine((data) => data.endFrame > data.startFrame, {
  message: 'Frame final deve ser estritamente maior que o frame inicial',
  path: ['endFrame']
});

export const SetClipGainArgsSchema = z.object({
  targetId: z.string().min(1, 'Identificador de clipe obrigatório'),
  gainDb: z.number().min(-60.0, 'Ganho mínimo é -60 dB').max(12.0, 'Ganho máximo é +12 dB')
}).strict();

export const SplitClipArgsSchema = z.object({
  targetId: z.string().min(1, 'Identificador de clipe obrigatório'),
  splitFrame: z.number().int().min(0, 'Frame de divisão deve ser >= 0')
}).strict();

export const TrimClipArgsSchema = z.object({
  targetId: z.string().min(1, 'Identificador de clipe obrigatório'),
  newStartFrame: z.number().int().min(0, 'Novo frame inicial deve ser >= 0'),
  newEndFrame: z.number().int().min(1, 'Novo frame final deve ser >= 1')
}).strict().refine((data) => data.newEndFrame > data.newStartFrame, {
  message: 'Novo frame final deve ser estritamente maior que o frame inicial',
  path: ['newEndFrame']
});

export const SetSceneArgsSchema = z.object({
  width: z.number().int().min(16).max(7680),
  height: z.number().int().min(16).max(7680),
  fpsNumerator: z.number().int().min(1).max(240),
  fpsDenominator: z.number().int().min(1).max(1001).default(1)
}).strict();

export const CommandArgsSchemas = {
  get_context: GetContextArgsSchema,
  seek: SeekArgsSchema,
  add_text: AddTextArgsSchema,
  set_clip_gain: SetClipGainArgsSchema,
  split_clip: SplitClipArgsSchema,
  trim_clip: TrimClipArgsSchema,
  set_scene: SetSceneArgsSchema
} as const;

export const EditPlanSchema = z.object({
  schemaVersion: z.literal('0.1'), planId: z.string().min(1).max(200),
  projectId: z.string().min(1).max(2000), expectedRevision: z.string().min(1).max(2000000), summary: z.string().max(2000),
  operations: z.array(z.object({
    operationId: z.string().min(1).max(200), command: z.enum(['get_context', 'seek', 'add_text', 'set_clip_gain', 'split_clip', 'trim_clip', 'set_scene']),
    targetId: z.string().min(1).optional(), args: z.record(z.string(), z.unknown()), preconditions: z.record(z.string(), z.unknown()).optional()
  }).strict()).length(1)
}).strict();

export function validateCommandArgs(command: keyof typeof CommandArgsSchemas, args: unknown) {
  const schema = CommandArgsSchemas[command];
  if (!schema) {
    return { success: false, error: `Comando desconhecido: ${command}` };
  }
  const result = schema.safeParse(args);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
    };
  }
  return { success: true, data: result.data };
}
