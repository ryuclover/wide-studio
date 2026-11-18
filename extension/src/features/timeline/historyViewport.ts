const regions=['.Timeline','.MediaListView','.ExplorerPanel','.ws-history-panel'];
type ScrollState={region:string;index:number;left:number;top:number};
export function captureHistoryViewport(root:HTMLElement,project:any){
 const scroll:ScrollState[]=[];
 for(const region of regions){const container=root.querySelector<HTMLElement>(region);if(!container)continue;
  for(const [index,node]of [container,...container.querySelectorAll<HTMLElement>('*')].entries())if(node.scrollLeft||node.scrollTop)scroll.push({region,index,left:node.scrollLeft,top:node.scrollTop});
 }
 return {time:Number.isFinite(project.activity?.time)?project.activity.time:null,scroll};
}
export function restoreHistoryViewport(root:HTMLElement,project:any,saved:ReturnType<typeof captureHistoryViewport>){
 if(saved.time!==null&&Math.abs((project.activity?.time??0)-saved.time)>.001){
  const control=root.querySelector('.ProjectTime') as any;
  const duration=project.presentation?.scene?.duration,time=Number.isFinite(duration)?Math.min(saved.time,duration):saved.time;
  if(typeof control?.timeView?.updateValue==='function'&&typeof control?.onTimeViewChange==='function'){control.timeView.updateValue(time);control.onTimeViewChange();}
 }
 for(const item of saved.scroll){const container=root.querySelector<HTMLElement>(item.region);if(!container)continue;const node=[container,...container.querySelectorAll<HTMLElement>('*')][item.index];if(node){node.scrollLeft=item.left;node.scrollTop=item.top;}}
}
