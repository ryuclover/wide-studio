let activeInspector=0;
export function mountAssistedTab(explorer: HTMLElement, heading: HTMLElement) {
  if (heading.querySelector('[role="tablist"]')) return;
  heading.removeAttribute('role'); heading.removeAttribute('aria-level'); heading.textContent = '';
  const tabs = document.createElement('div'); tabs.className = 'ws-inspector-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Inspetor');
  const native = explorer.querySelector<HTMLElement>(':scope > .container');
  if (!native) return;
  const panel = document.createElement('div'); panel.className = 'ws-assisted-panel'; panel.id = 'ws-assisted-panel'; panel.hidden = true;
  panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', 'ws-assisted-tab');
  const frame = document.createElement('iframe'); frame.title = 'Edição assistida — chat'; frame.className = 'ws-assisted-frame';
  panel.append(frame); explorer.append(panel);
  const history=document.createElement('section');history.className='ws-history-panel';history.id='ws-history-panel';history.hidden=true;history.setAttribute('role','tabpanel');history.setAttribute('aria-labelledby','ws-history-tab');explorer.append(history);
  let loading = false;
  const activate = async (selectedIndex: number) => {
    activeInspector=selectedIndex;const assisted=selectedIndex===1;history.hidden=selectedIndex!==2;
    native.hidden = selectedIndex!==0; panel.hidden = !assisted;
    explorer.dataset.wsAssisted = String(selectedIndex!==0);
    for (const [index, tab] of [...tabs.querySelectorAll<HTMLButtonElement>('button')].entries()) {
      const selected = selectedIndex === index; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    }
    if (assisted && !frame.src && !loading) {
      loading = true;
      try {
        const response = await chrome.runtime.sendMessage({ type: 'SW_GET_ASSISTANT_URL' });
        if (!response?.success) throw new Error('Não foi possível abrir o chat. Recarregue a extensão e a página.');
        const url = new URL(response.data.url), own = new URL(chrome.runtime.getURL(''));
        if (url.origin !== own.origin || url.host !== own.host || url.protocol !== 'chrome-extension:' || url.pathname !== '/assistant.html') throw new Error('Endereço do chat inválido.');
        frame.src = url.href;
      } catch (error) {
        const message = document.createElement('p'); message.className = 'ws-assisted-error'; message.textContent = String(error);
        panel.querySelector('.ws-assisted-error')?.remove(); panel.append(message);
      } finally { loading = false; }
    }
    window.dispatchEvent(new Event('resize'));
  };
  for (const [index, label] of ['Propriedades', 'Edição assistida', 'Histórico'].entries()) {
    const tab = document.createElement('button'); tab.type = 'button'; tab.textContent = label;
    tab.id = ['ws-properties-tab','ws-assisted-tab','ws-history-tab'][index]; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(index === 0)); tab.tabIndex = index ? -1 : 0;
    if (index) tab.setAttribute('aria-controls', index===1?panel.id:history.id);
    tab.onclick = () => { void activate(index); };
    tab.onkeydown = event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index+(event.key==='ArrowRight'?1:2))%3;
        tabs.querySelectorAll<HTMLButtonElement>('button')[next].focus(); void activate(next);
      }
    };
    tabs.append(tab);
  }
  heading.append(tabs);void activate(activeInspector);
}
