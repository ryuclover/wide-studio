import { EditorContext } from './context';
import {
  EditPlan,
  PreparedPlan,
  PreparedOperation,
  OperationResult,
  VerificationResult,
  UndoReceipt,
  UndoResult
} from './commands';

export interface EditorDetectionResult {
  version: string | null;
  supported: boolean;
  message?: string;
}

export interface EditorAdapter {
  detect(): Promise<EditorDetectionResult>;
  capabilities(): Promise<string[]>;
  readContext(): Promise<EditorContext>;
  prepare(plan: EditPlan): Promise<PreparedPlan>;
  execute(operation: PreparedOperation): Promise<OperationResult>;
  verify(operation: PreparedOperation): Promise<VerificationResult>;
  undo(receipt: UndoReceipt): Promise<UndoResult>;
}
