import { ObservedClip } from './context';

export type CommandName =
  | 'get_context'
  | 'seek'
  | 'add_text'
  | 'set_clip_gain'
  | 'split_clip'
  | 'trim_clip'
  | 'set_scene';

export interface PlanOperation {
  operationId: string;
  command: CommandName;
  targetId?: string;
  args: Record<string, unknown>;
  preconditions?: Record<string, unknown>;
}

export interface EditPlan {
  schemaVersion: '0.1';
  planId: string;
  projectId: string;
  expectedRevision: string;
  summary: string;
  operations: PlanOperation[];
}

export interface ComputedDiffItem {
  field: string;
  before: unknown;
  after: unknown;
}

export interface PreparedOperation extends PlanOperation {
  resolvedTarget: ObservedClip | null;
  computedDiff: ComputedDiffItem[];
}

export interface PreparedPlan {
  planId: string;
  operations: PreparedOperation[];
  valid: boolean;
  validationError?: string;
}

export interface VerificationResult {
  operationId: string;
  verified: boolean;
  observedChanges: Record<string, unknown>;
  error?: string;
}

export interface UndoReceipt {
  receiptId: string;
  operationId: string;
  inverseCommand: CommandName;
  inverseArgs: Record<string, unknown>;
  createdAt: number;
}

export interface OperationResult {
  operationId: string;
  status: 'verified' | 'failed' | 'unknown' | 'rolled_back';
  observed?: Record<string, unknown>;
  undoAvailable: boolean;
  undoReceipt?: UndoReceipt;
  error?: string;
}

export interface UndoResult {
  receiptId: string;
  success: boolean;
  error?: string;
}
