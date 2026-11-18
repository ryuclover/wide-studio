import type {Language} from './languages';
export {languages,validLanguage,type Language} from './languages';
import {translateUiText as translateCommon} from './common';
import {translatePortuguese} from './portuguese';
export function translateUiText(text:string,language:Language):string{
 if(language==='original')return text;
 if(language==='pt-BR'){const translated=translatePortuguese(text,false);if(translated!==undefined)return translated;}
 const common=translateCommon(text,language);if(common!==text)return common;
 if(language==='pt-BR'){const translated=translatePortuguese(text);if(translated!==undefined)return translated;}
 const decorated=text.match(/^(\s*(?:\+\s*)?)(.*?)(\s*[▾▼]?\s*)$/s);
 if(decorated&&decorated[1]+decorated[3]){const translated=translateUiText(decorated[2],language);if(translated!==decorated[2])return decorated[1]+translated+decorated[3];}
 const prefix=text.match(/^(Undo|Redo|Desfazer|Refazer): (.*)$/s);
 if(prefix)return translateUiText(prefix[1],language)+': '+translateUiText(prefix[2],language);
 const ellipsis=text.match(/^(.*?)(…|\.\.\.)$/);if(ellipsis)return translateUiText(ellipsis[1],language)+ellipsis[2];
 const count=text.match(/^(\d+) (Clips?|Layers?)$/i);if(count)return count[1]+' '+translateUiText(count[2],language);
 if(text.includes(' · '))return text.split(' · ').map(part=>translateUiText(part,language)).join(' · ');
 return text;
}
export function sourceUiText(element:Element|null){
 if(!element)return '';
 return element.getAttribute('data-ws-rendered-text')===element.textContent?element.getAttribute('data-ws-source-text')||element.textContent||'':element.textContent||'';
}
