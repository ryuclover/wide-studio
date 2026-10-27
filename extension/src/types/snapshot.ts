import { z } from 'zod';

export interface RationalFps {
  numerator: number;
  denominator: number;
  value?: number;
}

export const RationalFpsSchema = z.object({
  numerator: z.number().int().positive(),
  denominator: z.number().int().positive(),
  value: z.number().positive().optional(),
});

export interface CompositionSnapshot {
  width: number | null;
  height: number | null;
  fps: RationalFps | null;
  durationFrames: number | null;
  playheadFrame: number | null;
}

export const CompositionSnapshotSchema = z.object({
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  fps: RationalFpsSchema.nullable(),
  durationFrames: z.number().int().nonnegative().nullable(),
  playheadFrame: z.number().int().nonnegative().nullable(),
});

export interface TrackSnapshot {
  id: string;
  index: number;
  kind: 'video' | 'audio' | 'overlay' | 'unknown';
  name: string;
  muted: boolean | null;
  locked: boolean | null;
  visible: boolean | null;
}

export const TrackSnapshotSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  kind: z.enum(['video', 'audio', 'overlay', 'unknown']),
  name: z.string(),
  muted: z.boolean().nullable(),
  locked: z.boolean().nullable(),
  visible: z.boolean().nullable(),
});

export interface ClipSnapshot {
  id: string;
  trackId: string;
  kind: 'video' | 'audio' | 'image' | 'text' | 'unknown';
  name: string;
  startFrame: number | null;
  durationFrames: number | null;
  sourceTrimStartFrames?: number;
  gainDb?: number;
  text?: string;
  nativeRefId?: string;
}

export const ClipSnapshotSchema = z.object({
  id: z.string().min(1),
  trackId: z.string().min(1),
  kind: z.enum(['video', 'audio', 'image', 'text', 'unknown']),
  name: z.string(),
  startFrame: z.number().int().nonnegative().nullable(),
  durationFrames: z.number().int().positive().nullable(),
  sourceTrimStartFrames: z.number().int().nonnegative().optional(),
  gainDb: z.number().optional(),
  text: z.string().optional(),
  nativeRefId: z.string().optional(),
});

export interface SelectionSnapshot {
  kind: 'none' | 'track' | 'clip' | 'multiple';
  clipIds: string[];
  trackIds: string[];
  playheadFrame?: number | null;
}

export const SelectionSnapshotSchema = z.object({
  kind: z.enum(['none', 'track', 'clip', 'multiple']),
  clipIds: z.array(z.string()),
  trackIds: z.array(z.string()),
  playheadFrame: z.number().int().nonnegative().optional().nullable(),
});

export type CapabilityConfidence = 'documented' | 'static' | 'observed' | 'exercised' | 'verified';

export interface CapabilityState {
  id: string;
  available: boolean;
  reason?: string;
  confidence: CapabilityConfidence;
}

export const CapabilityStateSchema = z.object({
  id: z.string(),
  available: z.boolean(),
  reason: z.string().optional(),
  confidence: z.enum(['documented', 'static', 'observed', 'exercised', 'verified']),
});

export interface ProjectSnapshot {
  schemaVersion: 1;
  sessionId: string;
  projectId: string;
  revision: string;
  editorVersion: string;
  composition: CompositionSnapshot;
  tracks: TrackSnapshot[];
  clips: ClipSnapshot[];
  selection: SelectionSnapshot;
  capabilities: CapabilityState[];
  identity?: {name:string;createdLabel:string;storageMode:'temporary'|'directory'|'unknown'};
  collectedAt: number;
}

export const ProjectSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  revision: z.string().min(1),
  editorVersion: z.string(),
  composition: CompositionSnapshotSchema,
  tracks: z.array(TrackSnapshotSchema),
  clips: z.array(ClipSnapshotSchema),
  selection: SelectionSnapshotSchema,
  capabilities: z.array(CapabilityStateSchema),
  identity: z.object({name:z.string().min(1),createdLabel:z.string().min(1),storageMode:z.enum(['temporary','directory','unknown'])}).strict().optional(),
  collectedAt: z.number().int().positive(),
});

export type BridgeMessageType = 
  | 'WIDE_BRIDGE_HANDSHAKE'
  | 'WIDE_BRIDGE_HANDSHAKE_ACK'
  | 'WIDE_BRIDGE_PROBE'
  | 'WIDE_BRIDGE_READ_SNAPSHOT'
  | 'WIDE_BRIDGE_READ_SELECTION'
  | 'WIDE_BRIDGE_DROP_TARGET'
  | 'WIDE_BRIDGE_OPEN_SMART_TOOL'
  | 'WIDE_BRIDGE_RESPONSE'
  | 'WIDE_BRIDGE_ERROR';

export const BridgeMessageTypeSchema = z.enum([
  'WIDE_BRIDGE_HANDSHAKE',
  'WIDE_BRIDGE_HANDSHAKE_ACK',
  'WIDE_BRIDGE_PROBE',
  'WIDE_BRIDGE_READ_SNAPSHOT',
  'WIDE_BRIDGE_READ_SELECTION',
  'WIDE_BRIDGE_DROP_TARGET',
  'WIDE_BRIDGE_OPEN_SMART_TOOL',
  'WIDE_BRIDGE_RESPONSE',
  'WIDE_BRIDGE_ERROR',
]);

export interface BridgeRequest<T = unknown> {
  source: 'wide-studio-content';
  target: 'wide-studio-main';
  requestId: string;
  type: BridgeMessageType;
  sessionId: string;
  payload?: T;
}

export const BridgeRequestSchema = z.object({
  source: z.literal('wide-studio-content'),
  target: z.literal('wide-studio-main'),
  requestId: z.string().min(1),
  type: z.enum([
    'WIDE_BRIDGE_HANDSHAKE',
    'WIDE_BRIDGE_PROBE',
    'WIDE_BRIDGE_READ_SNAPSHOT',
    'WIDE_BRIDGE_READ_SELECTION',
    'WIDE_BRIDGE_DROP_TARGET',
  'WIDE_BRIDGE_OPEN_SMART_TOOL',
  ]),
  sessionId: z.string().min(1),
  payload: z.unknown().optional(),
});

export interface BridgeResponse<T = unknown> {
  source: 'wide-studio-main';
  target: 'wide-studio-content';
  requestId: string;
  type: BridgeMessageType;
  sessionId: string;
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export const BridgeResponseSchema = z.object({
  source: z.literal('wide-studio-main'),
  target: z.literal('wide-studio-content'),
  requestId: z.string().min(1),
  type: BridgeMessageTypeSchema,
  sessionId: z.string().min(1),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }).optional(),
});

