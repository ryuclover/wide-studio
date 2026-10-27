import { ProjectSnapshot } from '../types/snapshot.js';

function freezeDeep<T>(value:T):T {
  if(value && typeof value==='object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);Object.freeze(value);
  }return value;
}
export type SnapshotSubscriber = (snapshot: ProjectSnapshot | null) => void;

export class ProjectStore {
  private currentSnapshot: ProjectSnapshot | null = null;
  private subscribers: Set<SnapshotSubscriber> = new Set();

  public getSnapshot(): ProjectSnapshot | null {
    return this.currentSnapshot;
  }

  public setSnapshot(newSnapshot: ProjectSnapshot): boolean {
    // Deduplicação estrita: só ignora se for MESMA sessão, MESMO projeto E MESMA revisão
    if (
      this.currentSnapshot &&
      this.currentSnapshot.sessionId === newSnapshot.sessionId &&
      this.currentSnapshot.projectId === newSnapshot.projectId &&
      this.currentSnapshot.revision === newSnapshot.revision
    ) {
      return false;
    }

    // Congelar objeto para garantir imutabilidade para assinantes
    const frozen = freezeDeep(structuredClone(newSnapshot));
    this.currentSnapshot = frozen;
    this.notifySubscribers();
    return true;
  }

  public subscribe(subscriber: SnapshotSubscriber): () => void {
    this.subscribers.add(subscriber);
    if (this.currentSnapshot) {
      subscriber(this.currentSnapshot);
    }
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  public clear(): void {
    this.currentSnapshot = null;
    this.notifySubscribers();
    this.subscribers.clear();
  }

  public resetProject(): void {
    this.currentSnapshot = null;
    this.notifySubscribers();
  }

  private notifySubscribers(): void {
    for (const sub of this.subscribers) {
      try {
        sub(this.currentSnapshot);
      } catch (err) {
        console.error('Erro ao notificar assinante do ProjectStore:', err);
      }
    }
  }
}

export const globalProjectStore = new ProjectStore();
