export interface RationalFps {
  numerator: number;
  denominator: number;
}

export const FPS_30: RationalFps = { numerator: 30, denominator: 1 };
export const FPS_29_97: RationalFps = { numerator: 30000, denominator: 1001 };
export const FPS_60: RationalFps = { numerator: 60, denominator: 1 };

/**
 * Converte tempo em segundos para frame inteiro com arredondamento half-up para não negativos.
 */
export function secondsToFrames(seconds: number, fps: RationalFps = FPS_30): number {
  if (seconds < 0) return 0;
  const rawFrames = seconds * (fps.numerator / fps.denominator);
  return Math.floor(rawFrames + 0.5);
}

/**
 * Converte frame inteiro para segundos em ponto flutuante.
 */
export function framesToSeconds(frames: number, fps: RationalFps = FPS_30): number {
  if (frames < 0) return 0;
  return (frames * fps.denominator) / fps.numerator;
}

/**
 * Formata frames no padrão digital HH:MM:SS:FF
 */
export function formatTimecode(frames: number, fps: RationalFps = FPS_30): string {
  const fpsValue = Math.round(fps.numerator / fps.denominator);
  const totalSeconds = Math.floor(frames / fpsValue);
  const remainingFrames = frames % fpsValue;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number, digits = 2) => String(n).padStart(digits, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(remainingFrames)}`;
}

/**
 * Valida se um intervalo temporal [startFrame, endFrame) é válido.
 */
export function isValidFrameRange(startFrame: number, endFrame: number, maxDuration?: number): boolean {
  if (!Number.isInteger(startFrame) || !Number.isInteger(endFrame)) return false;
  if (startFrame < 0 || endFrame <= startFrame) return false;
  if (maxDuration !== undefined && endFrame > maxDuration) return false;
  return true;
}
