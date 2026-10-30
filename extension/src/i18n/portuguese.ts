import {portugueseEntries} from './pt-BR';
const normalize=(value:string)=>value.trim().replace(/\s+/g,' ').toLocaleLowerCase();
const exact=new Map<string,string>();
const templates:{pattern:RegExp;target:string;names:string[];prefix:string}[]=[];
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
for(const [source,target]of portugueseEntries){
 if(!source.includes('{')){exact.set(normalize(source),target);continue;}
 const plainSource=source.replace(/<[^>]*>/g,''),plainTarget=target.replace(/<[^>]*>/g,'');
 const names:string[]=[];let offset=0,pattern='^';
 for(const match of plainSource.matchAll(/\{(\w+)\}/g)){
  pattern+=escape(plainSource.slice(offset,match.index));names.push(match[1]);
  pattern+=['count','index','n','scale','showing','total'].includes(match[1])?'(\\d+(?:[.,]\\d+)?)':'([\\s\\S]{1,400}?)';offset=match.index!+match[0].length;
 }
 pattern+=escape(plainSource.slice(offset))+'$';
 templates.push({pattern:new RegExp(pattern,'i'),target:plainTarget,names,prefix:plainSource.split('{')[0].toLocaleLowerCase()});
}
const cache=new Map<string,string|null>();
export const portuguesePhraseCount=portugueseEntries.length;
export function translatePortuguese(text:string,allowTemplates=true):string|undefined{
 const normalized=normalize(text),literal=exact.get(normalized);
 if(literal!==undefined)return text.replace(text.trim(),literal);
 if(!allowTemplates)return;
 if(text.length>2000)return;
 if(cache.has(text))return cache.get(text)??undefined;
 const trimmed=text.trim();let result:string|undefined;
 for(const template of templates){
  if(!trimmed.toLocaleLowerCase().startsWith(template.prefix))continue;
  const match=trimmed.match(template.pattern);if(!match)continue;
  result=text.replace(trimmed,template.target.replace(/\{(\w+)\}/g,(_token,name)=>match[template.names.indexOf(name)+1]));break;
 }
 cache.set(text,result??null);if(cache.size>1024)cache.delete(cache.keys().next().value!);
 return result;
}
