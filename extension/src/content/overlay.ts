let host: HTMLElement | null = null;
let panel: HTMLElement;
let frame: HTMLIFrameElement;
let launcher: HTMLButtonElement;
let open = false;

export function toggleOverlay(url?: string, mountOnly=false) {
  if (!host?.isConnected) {
    host = document.createElement('div');
    host.id = 'wide-studio-overlay';
    const shadow = host.attachShadow({mode:'closed'});
    const style = document.createElement('style');
    style.textContent = `:host{all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;font:12px system-ui;color:#e6eadf}
      button{font:inherit;color:inherit;cursor:pointer;border:1px solid #576747;background:#252b22;border-radius:5px;padding:7px 12px}
      button:focus-visible{outline:2px solid #a1cd73;outline-offset:2px}
      .launcher{position:absolute;right:12px;top:4px;pointer-events:auto;background:#33462a}
      section{position:absolute;right:0;top:0;bottom:0;width:min(360px,100vw);background:#22271f;border-left:1px solid #526046;pointer-events:auto;display:flex;flex-direction:column;box-shadow:-5px 0 18px #0005}
      :host-context(html[data-wide-studio-workspace]) .launcher{display:none}
      :host-context(html[data-wide-studio-workspace]) section{top:0}
      section[hidden]{display:none}header{height:36px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid #414a39}header button{padding:2px 9px;font-size:18px}iframe{border:0;width:100%;flex:1;min-height:0;background:#262b23}`;
    launcher = document.createElement('button'); launcher.className='launcher'; launcher.textContent='W · Studio'; launcher.title='Abrir Wide Studio'; launcher.setAttribute('aria-expanded','false');
    panel = document.createElement('section'); panel.setAttribute('aria-label','Wide Studio'); panel.hidden=true;
    const header = document.createElement('header'), label=document.createElement('span'), close=document.createElement('button');
    label.textContent='Controles do editor'; close.textContent='×'; close.setAttribute('aria-label','Recolher Wide Studio');
    frame=document.createElement('iframe'); frame.title='Wide Studio — controles do editor'; frame.allow='';
    header.append(label,close);panel.append(header,frame);shadow.append(style,launcher,panel);document.documentElement.append(host);
    launcher.onclick=()=>toggleOverlay(); close.onclick=()=>{toggleOverlay();launcher.focus();};
    open=false;
    document.documentElement.removeAttribute('data-wide-studio-docked');
  }
  if (url) {
    const parsed=new URL(url);
    if ((parsed.protocol!=='chrome-extension:' || parsed.host!==new URL(chrome.runtime.getURL('')).host) || parsed.pathname!=='/sidepanel.html') throw new Error('Endereço do painel inválido.');
    if (frame.src!==url) frame.src=url;
  }
  // The first toolbar click supplies the bound tab URL. Page buttons only toggle it.
  if (mountOnly) return {open:false};
  if (!frame.getAttribute('src')) { void chrome.runtime.sendMessage({type:'SW_OPEN_OVERLAY'}); return; }
  open=!open; panel.hidden=!open;launcher.hidden=open;launcher.setAttribute('aria-expanded',String(open));
  document.documentElement.toggleAttribute('data-wide-studio-docked',open);
  window.dispatchEvent(new Event('resize'));
  return {open};
}

export function mountOverlayLauncher() { toggleOverlay(undefined,true); }

