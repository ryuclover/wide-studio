export function mountDriveTab(media:HTMLElement,heading:HTMLElement){
 if(heading.querySelector('[role=tablist]'))return;
 const native=media.querySelector<HTMLElement>(':scope > .container');if(!native)return;
 heading.replaceChildren();heading.removeAttribute('role');heading.removeAttribute('aria-level');
 const tabs=document.createElement('div');tabs.className='ws-inspector-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Mídias');
 const labels=['Biblioteca','Drive','Extrair'];
 const external=labels.slice(1).map((label,index)=>{const panel=document.createElement('div');panel.className=index===0?'ws-drive-panel':'ws-extract-panel';panel.hidden=true;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-label',label);const frame=document.createElement('iframe');frame.className='ws-assisted-frame';frame.title=label==='Drive'?'Drive — mídias públicas':'Extrair — importar por link';panel.append(frame);media.append(panel);return {panel,frame,loading:false};});
 let selected=0;
 const activate=async(index:number)=>{selected=index;native.hidden=index!==0;media.dataset.wsDrive=String(index!==0);external.forEach((p,i)=>p.panel.hidden=index!==i+1);tabs.querySelectorAll('button').forEach((b,i)=>{b.setAttribute('aria-selected',String(index===i));b.tabIndex=index===i?0:-1;});
  const p=external[index-1];if(p&&!p.frame.src&&!p.loading){p.loading=true;try{const file=index===1?'drive.html':'extract.html';const response=await chrome.runtime.sendMessage({type:index===1?'SW_GET_DRIVE_URL':'SW_GET_EXTRACT_URL'});if(!response?.success)throw new Error('Recarregue a extensão e a página para abrir esta aba.');const u=new URL(response.data.url);if(u.protocol!=='chrome-extension:'||u.host!==new URL(chrome.runtime.getURL('')).host||u.pathname!=='/'+file)throw new Error('Endereço inválido.');p.frame.src=u.href;}catch(e){const error=document.createElement('p');error.textContent=String(e);p.panel.append(error);}finally{p.loading=false;}}
  window.dispatchEvent(new Event('resize'));
 };
 labels.forEach((label,i)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(i===0));b.tabIndex=i?-1:0;b.onclick=()=>void activate(i);b.onkeydown=e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?2:(selected+(e.key==='ArrowRight'?1:2))%3;tabs.querySelectorAll<HTMLButtonElement>('button')[next].focus();void activate(next);}};tabs.append(b);});heading.append(tabs);
}
