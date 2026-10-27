import { EditorAdapter, EditorDetectionResult } from '../types/adapter';
import { EditorContext, ObservedClip } from '../types/context';
import { EditPlan, PreparedPlan, PreparedOperation, OperationResult, VerificationResult, UndoReceipt, UndoResult } from '../types/commands';
import { EditPlanSchema, validateCommandArgs } from '../commands/schemas';
import { framesToSeconds, secondsToFrames } from '../commands/temporal';
import { parseTimeString } from './selectors';
import { ContentBridgeClient } from '../bridge/contentBridge';

// Observed on 1.7.12. Unknown versions and missing data fail closed.
export class WideVideoAdapter implements EditorAdapter {
  private static instance: WideVideoAdapter;
  private roots = new WeakMap<Element, string>();
  private projectKeys = new Map<string, Promise<string>>();
  private metadata = new WeakMap<Element, { folder: string; created: string; scene: string; breadcrumb: Element | null }>();
  private prepared = new Map<string, { op: PreparedOperation; revision: string; projectId: string }>();
  private consumed = new Set<string>();
  private receipts = new Map<string, { receipt: UndoReceipt; revision: string; projectId: string }>();
  private bridgeClient: ContentBridgeClient | null = null;
  static getInstance() { return this.instance ||= new WideVideoAdapter(); }

  setBridgeClient(client: ContentBridgeClient | null) {
    this.bridgeClient = client;
  }

  getBridgeClient(): ContentBridgeClient | null {
    return this.bridgeClient;
  }

  rememberProjectMetadata() {
    const root = document.querySelector('.ProjectApp'), view = root?.querySelector('.ProjectMetadataView');
    if (!root || !view) return;
    const folder = view.querySelector('[title="Folder"] .value')?.textContent?.trim();
    const created = view.querySelector('[title="Created"] .value')?.textContent?.trim();
    const scene = Array.from(root.querySelectorAll('.ExplorerButton .extra')).map(e=>e.textContent).find(t=>/^\d+×\d+@\d/.test(t || ''));
    if (folder && created && scene) this.metadata.set(root, {folder,created,scene,breadcrumb:root.querySelector('.SelectionBreadcrumbs .project')});
  }

  async detect(): Promise<EditorDetectionResult> {
    const version = window.location.pathname.match(/^\/app\/(\d+\.\d+\.\d+)\//)?.[1] || null;
    const supported = window.location.hostname === 'wide.video' && version === '1.7.12' && !!document.querySelector('.ProjectApp');
    return { version, supported, message: supported ? 'Editor observado; navegação experimental' : 'Abra um projeto no wide.video 1.7.12.' };
  }
  async capabilities(): Promise<string[]> { try { await this.snapshot(); return ['get_context', 'seek']; } catch { return []; } }

  private async snapshot(): Promise<EditorContext> {
    if (!(await this.detect()).supported) throw new Error('UNSUPPORTED_EDITOR');

    // 1. Tentar ler diretamente do bridge no contexto MAIN se disponível
    if (this.bridgeClient) {
      try {
        const bridgeSnap = await this.bridgeClient.readSnapshot();
        if (bridgeSnap && bridgeSnap.composition.fps && bridgeSnap.composition.playheadFrame !== null) {
          const fps = bridgeSnap.composition.fps;
          const id = `${bridgeSnap.projectId}:${bridgeSnap.sessionId}`;
          const observedClips: ObservedClip[] = bridgeSnap.clips.map(c => ({
            clipId: c.id,
            trackId: c.trackId,
            name: c.name,
            type: c.kind,
            startFrame: c.startFrame,
            endFrame: c.startFrame !== null && c.durationFrames !== null ? c.startFrame + c.durationFrames : null,
            sourceOffsetFrame: c.sourceTrimStartFrames ?? null,
            locked: null,
          }));

          const identity=bridgeSnap.identity;
          let persistentId:string|undefined;
          if(identity){
            const seed=JSON.stringify([window.location.hostname,identity.name,identity.createdLabel]);
            persistentId=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(seed)).then(buffer=>Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join(''));
          }
          return {
            revision: bridgeSnap.revision,
            timestamp: bridgeSnap.collectedAt,
            simpleAppearance: document.documentElement.dataset.wideStudioLayout === 'simple',
            project: {
              id,
              persistentId,
              name: identity?.name || 'Projeto conectado',
              storageMode: identity?.storageMode || 'unknown',
            },
            composition: {
              width: bridgeSnap.composition.width,
              height: bridgeSnap.composition.height,
              fpsNumerator: fps.numerator,
              fpsDenominator: fps.denominator,
              durationFrames: bridgeSnap.composition.durationFrames,
              currentPlayheadFrame: bridgeSnap.composition.playheadFrame,
            },
            clips: observedClips,
            selectedClipIds: bridgeSnap.selection.clipIds,
            capabilities: ['get_context', 'seek'],
            selectionKnown: true,
          };
        }
      } catch {
        // Fallback silencioso para o método DOM se a ponte falhar
      }
    }
    const root = document.querySelector('.ProjectApp')!;
    const metadata = root.querySelector('.ProjectMetadataView');
    const value = (title: string) => metadata?.querySelector(`[title="${title}"] .value`)?.textContent?.trim();
    let folder = value('Folder'), created = value('Created');
    let scene = Array.from(root.querySelectorAll('.ExplorerButton .extra')).map(e => e.textContent).find(t => /^\d+×\d+@\d/.test(t || ''));
    const breadcrumb = root.querySelector('.SelectionBreadcrumbs .project');
    if (folder && created && scene) this.metadata.set(root, { folder, created, scene, breadcrumb });
    else {
      const cached = this.metadata.get(root);
      // Selection replaces the properties view. Retain observed metadata only while
      // both the editor root and its project breadcrumb remain the same DOM objects.
      if (cached?.breadcrumb && breadcrumb === cached.breadcrumb && breadcrumb.textContent?.trim() === cached.folder) {
        folder = cached.folder; created = cached.created; scene = cached.scene;
      }
    }
    const match = scene?.match(/^(\d+)×(\d+)@(\d+(?:\.\d+)?)(?:\/(\d+))?$/);
    const times = Array.from(root.querySelectorAll<HTMLInputElement>('.ProjectTime .TimeView input'));
    const labels = Array.from(root.querySelectorAll('.ProjectTime .frame')).map(e => e.textContent?.trim());
    const frame = labels[0]?.match(/^(\d+)\s*\(/);
    if (!folder || !created || !match || times.length !== 2 || !frame || labels[0] !== labels[1]) throw new Error('CONTEXT_UNAVAILABLE: mantenha propriedades do projeto visíveis e pause a reprodução.');
    if (!match[4] && !Number.isInteger(Number(match[3]))) throw new Error('FPS_UNSUPPORTED: razão exata indisponível.');
    const fps = { numerator: Number(match[3]), denominator: Number(match[4] || 1) };
    if (labels.some(label => Number(label?.match(/\(([\d.]+)\)/)?.[1]) !== Number((fps.numerator/fps.denominator).toFixed(3)))) throw new Error('CONTEXT_UNAVAILABLE: taxa de quadros mudou; abra as propriedades do projeto.');
    const currentPlayheadFrame = Number(frame[1]);
    if (!Number.isSafeInteger(currentPlayheadFrame) || times.some(t => { const s = parseTimeString(t.value); return s === null || secondsToFrames(s, fps) !== currentPlayheadFrame; })) throw new Error('CONTEXT_UNAVAILABLE: transportes fora de sincronia.');
    let rootId = this.roots.get(root);
    if (!rootId) { rootId = crypto.randomUUID(); this.roots.set(root, rootId); }
    const id = `${rootId}:${folder}:${created}`;
    const identity = JSON.stringify([window.location.hostname, folder, created]);
    if (!this.projectKeys.has(identity)) this.projectKeys.set(identity, crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity)).then(buffer => Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('')));
    const persistentId = await this.projectKeys.get(identity)!;
    // Observable fingerprint, not a claim of access to the editor's internal revision.
    const revision = JSON.stringify([id, root.textContent, times.map(t => t.value)]);
    return { revision, timestamp: Date.now(), simpleAppearance: document.documentElement.dataset.wideStudioLayout === 'simple', project: { id, persistentId, name: folder, storageMode: folder === 'Temporary (virtual) project' ? 'temporary' : 'directory' }, composition: { width: Number(match[1]), height: Number(match[2]), fpsNumerator: fps.numerator, fpsDenominator: fps.denominator, durationFrames: null, currentPlayheadFrame }, clips: [], selectedClipIds: [], capabilities: ['get_context', 'seek'], selectionKnown: false };
  }
  async readContext() { return this.snapshot(); }

  async prepare(input: EditPlan): Promise<PreparedPlan> {
    const fail = (error: string): PreparedPlan => ({ planId: input?.planId || '', operations: [], valid: false, validationError: error });
    const parsed = EditPlanSchema.safeParse(input);
    if (!parsed.success) return fail('INVALID_PLAN: estrutura inválida ou mais de uma operação.');
    try {
      const plan = parsed.data, ctx = await this.snapshot();
      if (plan.projectId !== ctx.project.id || plan.expectedRevision !== ctx.revision) return fail('STALE_CONTEXT: projeto ou estado mudou; gere outro plano.');
      const op = plan.operations[0];
      if (op.command !== 'seek' || op.targetId || op.preconditions) return fail('UNSUPPORTED_CAPABILITY: apenas navegação temporal está implementada.');
      const valid = validateCommandArgs(op.command, op.args);
      if (!valid.success) return fail('INVALID_ARGUMENT');
      const prepared: PreparedOperation = { ...op, args: valid.data!, resolvedTarget: null, computedDiff: [{ field: 'Playhead (frame)', before: ctx.composition.currentPlayheadFrame, after: op.args.frame }] };
      this.prepared.clear();
      this.prepared.set(op.operationId, { op: prepared, revision: ctx.revision, projectId: ctx.project.id });
      return { planId: plan.planId, operations: [prepared], valid: true };
    } catch (e) { return fail(String(e)); }
  }

  private async seek(frame: number, ctx: EditorContext): Promise<void> {
    const input = document.querySelector<HTMLInputElement>('.ProjectTime .TimeView input');
    if (!input) throw new Error('CONTROL_UNAVAILABLE');
    const seconds = framesToSeconds(frame, { numerator: ctx.composition.fpsNumerator, denominator: ctx.composition.fpsDenominator });
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('CONTROL_UNAVAILABLE');
    input.focus(); setter.call(input, seconds.toFixed(6));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.blur();
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  async execute(operation: PreparedOperation): Promise<OperationResult> {
    let dispatched = false;
    try {
      const saved = this.prepared.get(operation.operationId);
      if (!saved || JSON.stringify(saved.op) !== JSON.stringify(operation) || this.consumed.has(operation.operationId)) throw new Error('UNPREPARED_OR_DUPLICATE_OPERATION');
      const before = await this.snapshot();
      if (before.project.id !== saved.projectId || before.revision !== saved.revision) throw new Error('STALE_CONTEXT');
      this.consumed.add(operation.operationId); this.prepared.delete(operation.operationId);
      dispatched = true; await this.seek(operation.args.frame as number, before);
      const verification = await this.verify(operation);
      if (!verification.verified) throw new Error(verification.error || 'VERIFY_FAILED');
      const after = await this.snapshot();
      const receipt: UndoReceipt = { receiptId: crypto.randomUUID(), operationId: operation.operationId, inverseCommand: 'seek', inverseArgs: { frame: before.composition.currentPlayheadFrame }, createdAt: Date.now() };
      this.receipts.set(receipt.receiptId, { receipt, revision: after.revision, projectId: after.project.id });
      return { operationId: operation.operationId, status: 'verified', observed: verification.observedChanges, undoAvailable: true, undoReceipt: receipt };
    } catch (e) { return { operationId: operation.operationId, status: dispatched ? 'unknown' : 'failed', undoAvailable: false, error: String(e) }; }
  }
  async verify(operation: PreparedOperation): Promise<VerificationResult> {
    try {
      const ctx = await this.snapshot();
      const verified = operation.command === 'seek' && ctx.composition.currentPlayheadFrame === operation.args.frame;
      return { operationId: operation.operationId, verified, observedChanges: { frame: ctx.composition.currentPlayheadFrame }, error: verified ? undefined : 'VERIFY_FAILED' };
    } catch (e) { return { operationId: operation.operationId, verified: false, observedChanges: {}, error: String(e) }; }
  }
  async undo(receipt: UndoReceipt): Promise<UndoResult> {
    try {
      const saved = this.receipts.get(receipt.receiptId);
      if (!saved || JSON.stringify(saved.receipt) !== JSON.stringify(receipt)) throw new Error('UNDO_UNAVAILABLE');
      const ctx = await this.snapshot();
      if (ctx.project.id !== saved.projectId || ctx.revision !== saved.revision) throw new Error('STALE_CONTEXT');
      this.receipts.delete(receipt.receiptId);
      await this.seek(receipt.inverseArgs.frame as number, ctx);
      const after = await this.snapshot();
      if (after.project.id !== ctx.project.id || after.composition.currentPlayheadFrame !== receipt.inverseArgs.frame) throw new Error('VERIFY_FAILED');
      return { receiptId: receipt.receiptId, success: true };
    } catch (e) { return { receiptId: receipt.receiptId, success: false, error: String(e) }; }
  }
}
