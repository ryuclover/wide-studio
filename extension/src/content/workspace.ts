import { buildQuickBar, syncQuickBar } from './quickBar';
import {mountDriveTab} from './driveTab';
import { mountAssistedTab } from './assistedTab';
// Keep native components in place: moving them would disconnect their lifecycle.
const regions = [
  ['MediaPanel', 'Biblioteca', 'Importe arquivos ou arraste suas mídias para cá'],
  ['PreviewPanel', 'Prévia', 'Reprodução e enquadramento'],
  ['ExplorerPanel', 'Propriedades', 'Opções do item selecionado'],
  ['TimelinePanel', 'Linha do tempo', 'Organize e ajuste seus clipes'],
] as const;
let enabled = true;
let toolbar: HTMLElement | null = null;
let observer: MutationObserver | null = null;
let pending = false;
const nativeActions = {
  import: '.MediaPanel .Controls button.importFiles',
} as const;

export function setWorkspaceAppearance(simple: boolean) {
  enabled = simple;
  document.documentElement.toggleAttribute('data-wide-studio-workspace', simple && !!document.querySelector('#ProjectApp .TimelinePanel'));
  if (simple) document.documentElement.dataset.wideStudioLayout = 'simple';
  else delete document.documentElement.dataset.wideStudioLayout;
  if (toolbar) toolbar.dataset.original = String(!simple);
  window.dispatchEvent(new Event('resize'));
}

function button(label: string, action: string, run: () => void) {
  const element = document.createElement('button');
  element.type = 'button'; element.textContent = label; element.dataset.action = action;
  element.addEventListener('click', run);
  return element;
}

function sync() {
  const root = document.querySelector<HTMLElement>('#ProjectApp');
  const menu = root?.querySelector<HTMLElement>('.MenuBar > .container');
  const ready = !!root && !!menu && regions.every(([name]) => root.querySelector(`.${name}`));
  if (!ready) {
    document.documentElement.removeAttribute('data-wide-studio-workspace');
    if (toolbar) toolbar.hidden = true;
    return;
  }
  if (!toolbar) {
    toolbar = document.createElement('div'); toolbar.id = 'wide-studio-workspace';
    toolbar.setAttribute('aria-label', 'Ferramentas Wide Studio');
    for (const [action, label] of [['import', '+ Importar mídia']] as const) {
      toolbar.append(button(label, action, () => {
        const target = root.ownerDocument.querySelector<HTMLButtonElement>(nativeActions[action]);
        if (target && !target.disabled) target.click();
      }));
    }
    toolbar.append(buildQuickBar(root));
    setWorkspaceAppearance(enabled);
  }
  if (toolbar.parentElement !== menu) menu!.prepend(toolbar);
  toolbar.hidden = false;
  for (const [name, label, hint] of regions) {
    const region = root!.querySelector<HTMLElement>(`.${name}`)!;
    if (!region.querySelector(':scope > .ws-region-heading')) {
      const heading = document.createElement('div'); heading.className = 'ws-region-heading';
      heading.textContent = label; heading.title = hint;
      heading.setAttribute('role', 'heading'); heading.setAttribute('aria-level', '2');
      // Native containers and their event handlers remain untouched.
      region.prepend(heading);
    }
    if (name === 'ExplorerPanel') mountAssistedTab(region, region.querySelector<HTMLElement>(':scope > .ws-region-heading')!);
    if (name === 'MediaPanel') mountDriveTab(region, region.querySelector<HTMLElement>(':scope > .ws-region-heading')!);
    if (name === 'TimelinePanel') {
      const heading=region.querySelector<HTMLElement>(':scope > .ws-region-heading')!;
      if(!heading.querySelector('[data-ws-marquee-toggle]')){
        const control=document.createElement('button');control.type='button';control.className='ws-marquee-button';control.dataset.wsMarqueeToggle='';control.textContent='Selecionar vários';control.setAttribute('aria-pressed','false');control.title='Clique e arraste um retângulo. Shift + arrastar adiciona à seleção. Esc cancela.';heading.append(control);
      }
    }
  }
  for (const action of Object.keys(nativeActions) as (keyof typeof nativeActions)[]) {
    const target = root!.querySelector<HTMLButtonElement>(nativeActions[action]);
    const control = toolbar.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
    const disabled = !target || target.disabled;
    if (control.disabled !== disabled) control.disabled = disabled;
  }
  syncQuickBar(root!);
  const active = enabled;
  if (document.documentElement.hasAttribute('data-wide-studio-workspace') !== active) {
    document.documentElement.toggleAttribute('data-wide-studio-workspace', active);
    window.dispatchEvent(new Event('resize'));
  }
}

export function mountWorkspace() {
  if (observer) return;
  observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; sync(); });
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  sync();
  void chrome.runtime.sendMessage({ type: 'SW_GET_WORKSPACE_APPEARANCE' }).then(response => {
    if (response?.success && typeof response.data?.simple === 'boolean') setWorkspaceAppearance(response.data.simple);
  }).catch(() => { /* The default layout remains available if storage is unavailable. */ });
  window.addEventListener('pagehide', () => { observer?.disconnect(); observer = null; });
}


