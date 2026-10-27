export interface ProjectIdentity {
  persistentId?: string;           // SHA-256 de pasta + criação; separado do ID da instância
  id: string;                      // Hash do diretório ou ID temporário
  name: string;                    // Nome do projeto observado
  storageMode: 'directory' | 'temporary' | 'unknown';
}

export interface CompositionState {
  width: number | null;
  height: number | null;
  fpsNumerator: number;
  fpsDenominator: number;          // Ex: 30000 / 1001 ou 30 / 1
  durationFrames: number | null;
  currentPlayheadFrame: number;
}

export interface ObservedClip {
  clipId: string;
  trackId: string;
  name: string;
  type: 'video' | 'audio' | 'text' | 'shape' | 'emoji' | 'image' | 'unknown';
  startFrame: number | null;              // Início na timeline [inclusivo]
  endFrame: number | null;                // Fim na timeline [exclusivo]
  sourceOffsetFrame: number | null;
  locked: boolean | null;
  gainDb?: number;                 // Presente se clipe possui áudio
}

export interface EditorContext {
  observedGraph?: {
    editorVersion: string;
    tracks: import('./snapshot').TrackSnapshot[];
    clips: import('./snapshot').ClipSnapshot[];
    selection: import('./snapshot').SelectionSnapshot;
    capabilities: import('./snapshot').CapabilityState[];
    truncated: boolean;
  };
  simpleAppearance?: boolean;
  selectionKnown?: boolean;
  revision: string;                // Hash incremental das propriedades visíveis
  timestamp: number;
  project: ProjectIdentity;
  composition: CompositionState;
  selectedClipIds: string[];
  clips: ObservedClip[];
  capabilities: string[];          // Lista de comandos atualmente funcionais
}
