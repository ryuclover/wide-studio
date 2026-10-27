import { z } from 'zod';
export const MAX_BRIDGE_CHARS=2_000_000;
export function withinMessageLimit(value:unknown):boolean {
  try {const text=JSON.stringify(value);return typeof text==='string' && text.length<=MAX_BRIDGE_CHARS;}catch{return false;}
}
export const HandshakeSchema=z.object({bridgeReady:z.literal(true),hasAppElement:z.boolean(),hasProject:z.boolean(),version:z.string(),sessionId:z.string().min(1)}).strict();
export const ProbeSchema=z.object({appElementFound:z.boolean(),projectObjectFound:z.boolean(),hasPresentation:z.boolean(),hasSelection:z.boolean(),version:z.string().nullable()}).strict();
export const SelectionSchema=z.object({kind:z.string(),hasValue:z.boolean()}).strict();
export const SmartToolResponseSchema=z.object({tool:z.string(),triggered:z.boolean()}).strict();

