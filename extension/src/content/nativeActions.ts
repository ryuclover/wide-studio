export const actionLabels:Record<string,string>={split:'Dividir clipe',rippleDelete:'Excluir e fechar espaço',undo:'Desfazer',silenceRemover:'Remover silêncios',captionsGenerator:'Gerar legendas',addText:'Inserir texto',exportVideo:'Exportar vídeo',exportScreenshot:'Capturar imagem'};
const delay=()=>new Promise(r=>setTimeout(r,40));
export async function runNativeAction(root:HTMLElement,id:string){
  if(!actionLabels[id])throw new Error('Ação desconhecida.');
  const direct=id==='split'?'.TimelinePanel .Controls button.split':id==='exportScreenshot'?'.PreviewPanel .Controls button.exportScreenshot':null;
  let target:HTMLButtonElement|null=null;
  if(direct)target=root.querySelector(direct);
  else {
    const menuClass=id==='exportVideo'?'ProjectMenu':id==='undo'||id==='rippleDelete'?'EditMenu':id==='addText'?'MediaMenu':'SmartToolsMenu';
    const menu=root.querySelector<HTMLElement>(`.MenuBar .${menuClass}`);
    if(!menu)throw new Error('Menu nativo indisponível.');
    // Close stale context menus before asking the native component to create its current items.
    root.ownerDocument.body.click();menu.click();await delay();
    const popup=root.ownerDocument.querySelector<HTMLDialogElement>('dialog.ContextMenu.menuBarMenu[open]');
    if(!popup)throw new Error('O menu nativo não abriu.');
    const selector=id==='exportVideo'?'button.icon.export':id==='addText'?'button.icon.addText':id==='silenceRemover'?'button.icon.silenceRemover':id==='captionsGenerator'?'button.icon.captionsGenerator':null;
    if(selector)target=popup.querySelector(selector);
    else if(id==='undo')target=popup.querySelector('button');
    else target=[...popup.querySelectorAll<HTMLButtonElement>('button')].find(b=>/^Ripple Delete(?: Clip| Clips| Gap)?$/i.test(b.querySelector('.label')?.textContent?.trim()||''))||null;
  }
  if(!target || target.closest('#wide-studio-workspace') || target.disabled || target.classList.contains('disabled'))throw new Error('Ação indisponível para a seleção atual. Selecione um clipe ou use o menu nativo.');
  target.click();await delay();
  if(['silenceRemover','captionsGenerator','exportVideo','addText'].includes(id) && !root.ownerDocument.querySelector('dialog[open]:not(.ContextMenu)'))throw new Error('O diálogo nativo não foi confirmado. Confira o editor.');
}
