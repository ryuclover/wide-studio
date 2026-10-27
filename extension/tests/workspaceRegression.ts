import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const win = new Window({ url: 'https://wide.video/app/1.7.12/' });
for (const key of ['window', 'document', 'Event', 'MutationObserver', 'requestAnimationFrame']) {
  const value = key === 'window' ? win : (win as any)[key];
  Object.defineProperty(globalThis, key, { value: typeof value === 'function' && key === 'requestAnimationFrame' ? value.bind(win) : value, configurable: true });
}
Object.defineProperty(globalThis, 'chrome', { value: { runtime: { sendMessage: async () => ({ success:true, data: { simple:true } }) } }, configurable: true });
const { mountWorkspace, setWorkspaceAppearance } = await import('../src/content/workspace');
mountWorkspace();
assert.equal(win.document.documentElement.hasAttribute('data-wide-studio-workspace'), false, 'start page stays native');
win.document.body.innerHTML = '<div id="ProjectApp"><div class="MenuBar"><div class="container"><button>Project</button></div></div><section class="MediaPanel"><div class="container"><div class="Controls"><button class="importFiles">Import</button><button class="addClip">Clip</button></div></div></section><section class="PreviewPanel"><div class="container"><canvas></canvas></div></section><section class="ExplorerPanel"><div class="container"><input value="native value"></div></section><section class="TimelinePanel"><div class="container"><button class="split">Split</button></div></section></div>';
const canvas = win.document.querySelector('canvas');
const input = win.document.querySelector('input');
let imports = 0;
win.document.querySelector<HTMLButtonElement>('.importFiles')!.onclick = () => { imports++; };
const settle = () => new Promise(resolve => setTimeout(resolve, 50));
await settle();
assert.equal(win.document.documentElement.hasAttribute('data-wide-studio-workspace'), true);
assert.equal(win.document.querySelectorAll('.ws-region-heading').length, 4);
win.document.querySelector<HTMLButtonElement>('[data-action="import"]')!.click();
assert.equal(imports, 1, 'toolbar invokes the existing native handler once');
win.document.querySelector<HTMLButtonElement>('.importFiles')!.disabled = true;
await settle();
assert.equal(win.document.querySelector<HTMLButtonElement>('[data-action="import"]')!.disabled, true);
setWorkspaceAppearance(false);
assert.equal(win.document.documentElement.hasAttribute('data-wide-studio-workspace'), false);
assert.equal(win.document.documentElement.dataset.wideStudioLayout, undefined);
setWorkspaceAppearance(true);
mountWorkspace();
assert.equal(win.document.querySelectorAll('#wide-studio-workspace').length, 1);
assert.equal(win.document.querySelector('canvas'), canvas, 'renderer is never detached or recreated');
assert.equal(win.document.querySelector('input'), input, 'native fields retain identity and value');
assert.equal(input!.value, 'native value');
win.document.querySelector('#ProjectApp')!.remove();
await settle();
assert.equal(win.document.documentElement.hasAttribute('data-wide-studio-workspace'), false);
assert.equal(win.document.querySelector('#wide-studio-workspace'), null);
win.dispatchEvent(new win.Event('pagehide'));
await win.happyDOM.close();
console.log('Workspace lifecycle regression passed (simulated DOM; native controls preserved).');

