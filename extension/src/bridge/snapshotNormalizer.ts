import {
  ProjectSnapshot,
  TrackSnapshot,
  ClipSnapshot,
  SelectionSnapshot,
  CapabilityState,
  RationalFps,
} from '../types/snapshot.js';

export interface RawNativeProject {
  metadata?: {
    appVersion?: string;
    version?: number;
    createdTime?: string | number | { getTime?: () => number };
    updatedTime?: string | number | { getTime?: () => number };
  };
  activity?: {
    time?: number;
  };
  presentation?: {
    scene?: {
      duration?: number;
      frameRate?: number;
      canvas?: {
        width?: number;
        height?: number;
        background?: string;
      };
      smartDuration?: boolean;
    };
    layer?: Array<{
      name?: string;
      muted?: boolean;
      locked?: boolean;
      visible?: boolean;
      clip?: Array<{
        timing?: {
          presentation?: {
            start?: number;
            end?: number;
            span?: number;
          };
          media?: {
            start?: number;
            end?: number;
            span?: number;
          };
        };
        load?: {
          kind?: string;
          source?: string;
          text?: string;
          width?: number;
          height?: number;
          trim?: {
            start?: number;
            duration?: number;
          };
        };
        filter?: Array<{
          kind?: string;
          value?: number;
          start?: number;
          x?: number;
          y?: number;
        }>;
      }>;
    }>;
  };
  selection?: {
    kind?: string;
    value?: unknown;
  };
  directory?: {
    setup?: {
      path?: string;
    };
  };
}

export function parseRationalFps(rawFps: unknown): RationalFps | null {
  if (typeof rawFps !== 'number' || !Number.isFinite(rawFps) || rawFps <= 0) {
    return null;
  }

  // Preserve the observed numeric rate; do not infer NTSC from a rounded decimal.
  const [digits, exponent='0'] = rawFps.toString().toLowerCase().split('e');
  const decimals = digits.split('.')[1]?.length || 0;
  const scale = decimals - Number(exponent);
  let numerator = Number(digits.replace('.', '')), denominator = 1;
  if (scale >= 0) denominator = 10 ** scale; else numerator *= 10 ** -scale;
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) return null;
  const gcd = (a:number,b:number):number => b ? gcd(b,a%b) : a;
  const divisor=gcd(numerator,denominator);
  return {numerator:numerator/divisor,denominator:denominator/divisor,value:rawFps};
}

function extractTimestamp(rawTime: unknown): number | null {
  if (typeof rawTime === 'number' && Number.isFinite(rawTime)) {
    return rawTime;
  }
  if (typeof rawTime === 'string') {
    const parsed = Date.parse(rawTime);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (rawTime && typeof rawTime === 'object' && 'getTime' in rawTime) {
    try {
      const ms = (rawTime as any).getTime();
      return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  return null;
}

const projectIds = new WeakMap<object,string>();
const nativeIds = new WeakMap<object,string>();
let sequence=0;
const objectId=(map:WeakMap<object,string>,value:object,prefix:string) => {
  let id=map.get(value);if(!id){id=prefix+'-'+(++sequence);map.set(value,id);}return id;
};
type NativeTiming = {presentation?:{start?:number;span?:number}};
const nonnegative=(value:unknown):value is number => typeof value==='number' && Number.isFinite(value) && value>=0;
export function normalizeNativeProject(
  raw: RawNativeProject | null | undefined,
  sessionId: string = 'session-default',
  clipIdMap: WeakMap<object, string> = nativeIds,
  timingByClip?: WeakMap<object,NativeTiming>
): ProjectSnapshot {
  if (!raw) {
    throw new Error('raw native project is null or undefined');
  }

  const editorVersion = String(raw.metadata?.appVersion || 'unknown');
  const fps = parseRationalFps(raw.presentation?.scene?.frameRate);

  // Duração em frames: depende de cena E de fps válido
  let durationFrames: number | null = null;
  if (nonnegative(raw.presentation?.scene?.duration) && fps) {
    durationFrames = Math.round(raw.presentation.scene.duration * (fps.numerator / fps.denominator));
  }

  // Playhead em frames: depende de activity.time E de fps válido
  let playheadFrame: number | null = null;
  if (nonnegative(raw.activity?.time) && fps) {
    playheadFrame = Math.round(raw.activity.time * (fps.numerator / fps.denominator));
  }

  // Resolução: NÃO inventar 1920x1080 se ausente
  const canvasWidth = raw.presentation?.scene?.canvas?.width;
  const canvasHeight = raw.presentation?.scene?.canvas?.height;
  const width = Number.isSafeInteger(canvasWidth) && canvasWidth! > 0 ? canvasWidth : null;
  const height = Number.isSafeInteger(canvasHeight) && canvasHeight! > 0 ? canvasHeight : null;

  const rawLayers = Array.isArray(raw.presentation?.layer) ? raw.presentation.layer : [];
  const tracks: TrackSnapshot[] = [];
  const clips: ClipSnapshot[] = [];

  const rawSelection = raw.selection;
  let selectedClipRef: unknown = null;
  if (rawSelection && typeof rawSelection === 'object' && 'value' in rawSelection) {
    selectedClipRef = rawSelection.value;
  }

  const selectedClipIds: string[] = [];
  const selectedClipRefs=rawSelection?.kind==='clips'&&selectedClipRef instanceof Set?selectedClipRef:new Set([selectedClipRef]);

  rawLayers.forEach((layerObj, layerIdx) => {
    const trackId = objectId(nativeIds,layerObj,'track');
    tracks.push({
      id: trackId,
      index: layerIdx,
      kind: 'unknown',
      name: layerObj.name || `Track ${layerIdx + 1}`,
      muted: typeof layerObj.muted === 'boolean' ? layerObj.muted : null,
      locked: typeof layerObj.locked === 'boolean' ? layerObj.locked : null,
      visible: typeof layerObj.visible === 'boolean' ? layerObj.visible : null,
    });

    const rawClips = Array.isArray(layerObj.clip) ? layerObj.clip : [];

    rawClips.forEach((clipObj, clipIdx) => {
      const clipId = objectId(clipIdMap,clipObj,'clip');

      const sourceKind = clipObj.load?.source || clipObj.load?.kind || 'unknown';
      let normalizedKind: 'video' | 'audio' | 'image' | 'text' | 'unknown' = 'unknown';

      if (sourceKind === 'text') {
        normalizedKind = 'text';
      } else if (sourceKind === 'video') {
        normalizedKind = 'video';
      } else if (sourceKind === 'audio') {
        normalizedKind = 'audio';
      } else if (sourceKind === 'image') {
        normalizedKind = 'image';
      }

      const timing = timingByClip?.get(clipObj) || clipObj.timing;
      const startSec=timing?.presentation?.start, durationSec=timing?.presentation?.span;
      const startFrame = nonnegative(startSec) && fps ? Math.round(startSec*fps.numerator/fps.denominator) : null;
      const durationFramesClip = nonnegative(durationSec) && durationSec>0 && fps ? Math.round(durationSec*fps.numerator/fps.denominator) || null : null;
      const trimStartSec = clipObj.load?.trim?.start;
      const sourceTrimStartFrames = (nonnegative(trimStartSec) && fps)
        ? Math.round(trimStartSec * (fps.numerator / fps.denominator))
        : undefined;

      const clipSnap: ClipSnapshot = {
        id: clipId,
        trackId,
        kind: normalizedKind,
        name: clipObj.load?.text || `${normalizedKind} ${clipIdx + 1}`,
        startFrame,
        durationFrames: durationFramesClip,
        sourceTrimStartFrames,
        text: clipObj.load?.text,
      };

      clips.push(clipSnap);

      if (selectedClipRefs.has(clipObj)) {
        selectedClipIds.push(clipId);
      }
    });
  });

  const rawSelectionKind = raw.selection?.kind;
  let selectionKind: SelectionSnapshot['kind'] = 'none';

  if (rawSelectionKind === 'clip' || selectedClipIds.length > 0) {
    selectionKind = selectedClipIds.length > 1 ? 'multiple' : 'clip';
  } else if (rawSelectionKind === 'track' || rawSelectionKind === 'layer') {
    selectionKind = 'track';
  }

  const selection: SelectionSnapshot = {
    kind: selectionKind,
    clipIds: selectedClipIds,
    trackIds: rawSelectionKind==='layer' || rawSelectionKind==='track' ? tracks.filter((_,i)=>rawLayers[i]===selectedClipRef).map(t=>t.id) : [],
    playheadFrame,
  };

  // Identidade de projeto única: combina path e createdTime para evitar colisão entre múltiplos projetos no mesmo path OPFS
  const projectVersion = raw.metadata?.version ?? null;
  const createdTimeMs = extractTimestamp(raw.metadata?.createdTime);
  const dirPath = raw.directory?.setup?.path || '/widevideo/';
  const identitySeed = createdTimeMs ? `${dirPath}_${createdTimeMs}` : dirPath;
  const projectId = objectId(projectIds,raw,'project')+'-'+identitySeed;

  // Revisão: DEVE mudar quando seleção muda, quando playhead muda ou quando versão muda!
  const selSignature = `${selection.kind}_${selection.clipIds.join(',')}`;
  const revision = JSON.stringify([projectVersion,raw.activity?.time,raw.presentation?.scene,tracks,clips,selSignature,selection.trackIds]);

  // Capacidades estritas baseadas em requisitos comprovados
  const canSeek = editorVersion==='1.7.12' && playheadFrame !== null && fps !== null;
  const capabilities: CapabilityState[] = [
    {
      id: 'transport.seek',
      available: canSeek,
      reason: canSeek ? undefined : 'FPS ou playhead desconhecidos',
      confidence: 'observed',
    },
    {
      id: 'clip.read',
      available: Array.isArray(raw.presentation?.layer),
      confidence: 'observed',
    },
    {
      id: 'clip.split',
      available: false,
      reason: 'Pendente de validação de mutação pelo adaptador M2',
      confidence: 'observed',
    },
    {
      id: 'clip.addText',
      available: false,
      reason: 'Pendente de integração M2 com fluxo de criação nativo',
      confidence: 'observed',
    },
  ];

  return {
    schemaVersion: 1,
    sessionId,
    projectId,
    revision,
    editorVersion,
    composition: {
      width:width ?? null,
      height:height ?? null,
      fps,
      durationFrames,
      playheadFrame,
    },
    tracks,
    clips,
    selection,
    capabilities,
    collectedAt: Date.now(),
  };
}
