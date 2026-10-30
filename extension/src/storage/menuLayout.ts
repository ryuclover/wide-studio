import {z} from 'zod';
export const ids=['split','rippleDelete','undo','silenceRemover','captionsGenerator','addText','exportVideo','exportScreenshot'] as const;
export const nativeMenus=['ProjectMenu','EditMenu','MediaMenu','SmartToolsMenu','HelpMenu','buyCoffee'] as const;
export const nativeMenuLabels:Record<typeof nativeMenus[number],string>={ProjectMenu:'Project',EditMenu:'Edit',MediaMenu:'Media',SmartToolsMenu:'Smart Tools',HelpMenu:'Help',buyCoffee:'Buy Me a Coffee'};
export const folderKey=(id:string)=>'folder:'+id;
export const MenuLayoutSchema=z.object({
 folders:z.array(z.object({id:z.string().min(1).max(60),name:z.string().trim().min(1).max(30),actions:z.array(z.enum(ids)).max(8)}).strict()).min(1).max(10),
 hiddenMenus:z.array(z.enum(nativeMenus)).max(6),
 hiddenFolders:z.array(z.string().min(1).max(60)).max(10).default([]),
 showLanguage:z.boolean().default(true),
 toolbarOrder:z.array(z.string().min(1).max(75)).max(16).optional(),
}).strict().superRefine((data,ctx)=>{
 const folderIds=data.folders.map(f=>f.id),actions=data.folders.flatMap(f=>f.actions);
 if(new Set(folderIds).size!==folderIds.length||new Set(actions).size!==actions.length)ctx.addIssue({code:'custom',message:'Pastas ou ações duplicadas.'});
 if(new Set(data.hiddenFolders).size!==data.hiddenFolders.length||data.hiddenFolders.some(id=>!folderIds.includes(id)))ctx.addIssue({code:'custom',message:'Pasta oculta inválida.'});
 if(data.toolbarOrder){const expected=[...folderIds.map(folderKey),...nativeMenus];if(data.toolbarOrder.length!==expected.length||new Set(data.toolbarOrder).size!==expected.length||data.toolbarOrder.some(id=>!expected.includes(id)))ctx.addIssue({code:'custom',message:'Ordem de menus inválida.'});}
}).transform(data=>({...data,toolbarOrder:data.toolbarOrder??[...data.folders.map(f=>folderKey(f.id)),...nativeMenus]}));
export type MenuLayout=z.infer<typeof MenuLayoutSchema>;
export const defaultMenuLayout:MenuLayout=MenuLayoutSchema.parse({folders:[{id:'edit',name:'Edição',actions:['split','rippleDelete','undo']},{id:'audio',name:'IA & Áudio',actions:['silenceRemover','captionsGenerator','addText']},{id:'export',name:'Exportar',actions:['exportVideo','exportScreenshot']}],hiddenMenus:['buyCoffee']});
