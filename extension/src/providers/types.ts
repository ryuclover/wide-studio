import { EditorContext } from '../types/context';
import { EditPlan, CommandName } from '../types/commands';

export interface ToolCallItem {
  name: CommandName;
  args: Record<string, unknown>;
}

export interface ProviderResponse {
  type: 'plan' | 'clarification' | 'unsupported';
  plan?: EditPlan;
  question?: string;
  options?: string[];
  message?: string;
  rawResponse?: unknown;
}

export interface LLMProvider {
  name: string;
  generatePlan(prompt: string, context: EditorContext, history?: {role:'user'|'assistant';content:string}[]): Promise<ProviderResponse>;
}
