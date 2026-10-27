/**
 * Seletores semânticos e utilitários de inspeção do DOM do wide.video
 * Foco em acessibilidade (aria-label, data-*, papéis semânticos) para resiliência a atualizações
 */

export const SELECTORS = {
  // Container principal e versão
  appRoot: '#app, [data-app-root], body',
  versionIndicator: 'meta[name="version"], [data-version], footer, header',
  smallScreenWarning: '.small-screen-warning, [data-small-screen]',

  // Transporte e Tempo
  timeDisplay: '[aria-label*="time" i], [aria-label*="tempo" i], [data-testid="timecode"], .timecode, input[type="text"][value*=":"]',
  playhead: '[role="slider"][aria-label*="playhead" i], [data-testid="playhead"], .playhead',
  playPauseButton: 'button[aria-label*="play" i], button[aria-label*="reproduzir" i], button[aria-label*="pause" i]',
  seekInput: 'input[aria-label*="timecode" i], input[aria-label*="tempo" i], [data-testid="time-input"]',

  // Timeline e Camadas
  timeline: '[role="region"][aria-label*="timeline" i], .timeline, [data-testid="timeline"]',
  track: '[role="row"], .track, [data-track-id]',
  trackLock: 'button[aria-label*="lock" i], button[aria-label*="bloquear" i]',
  trackMute: 'button[aria-label*="mute" i], button[aria-label*="silenciar" i]',

  // Clipes
  clip: '[role="gridcell"], .clip, [data-clip-id]',
  selectedClip: '[aria-selected="true"], .clip.selected, [data-selected="true"]',

  // Criação de Elementos e Diálogos
  addButton: 'button[aria-label*="add" i], button[aria-label*="adicionar" i], [data-testid="add-btn"]',
  addTextOption: 'button[aria-label*="text" i], [data-menu-item="text"], [role="menuitem"]:has(svg, span)',
  modalDialog: '[role="dialog"], .dialog, .modal',
  modalInput: 'input[type="text"], textarea',
  modalConfirm: 'button[type="submit"]',

  // Inspetor de Propriedades (Ganho, Volume, etc.)
  gainSlider: 'input[type="range"][aria-label*="gain" i], input[type="range"][aria-label*="volume" i]',
  gainInput: 'input[type="number"][aria-label*="gain" i], input[type="number"][aria-label*="volume" i]'
};

export function findElement<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

export function findElements<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/**
 * Tenta converter uma string de tempo no formato HH:MM:SS ou MM:SS ou SS para segundos
 */
export function parseTimeString(timeStr: string): number | null {
  if (!timeStr) return null;
  const cleaned = timeStr.trim();
  if (!/^\d+(?:\.\d+)?(?::\d+(?:\.\d+)?){0,2}$/.test(cleaned)) return null;
  const parts = cleaned.split(':').map(Number);
  if (parts.some(n => !Number.isFinite(n)) || parts.slice(1).some(n => n >= 60)) return null;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return null;
}
