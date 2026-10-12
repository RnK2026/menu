import {getLanguage,localize} from './i18n.js';
export function translatedText(source,translations={},lang=getLanguage()){
  const entry=translations['$'+source];
  const value=entry?.[lang];
  const changed=typeof value==='string'&&value!==source;
  const pending=source.trim()&&source.trim()!=='-'&&typeof value!=='string'&&(lang==='en'?/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(source):/[a-zA-Z]/.test(source));
  return {text:typeof value==='string'?value:source,pending:Boolean(pending),changed,manual:entry?.manual?.[lang]===true};
}
const bindings=new Set();
export function contentNode(tag,source,translations={},className=''){
  const node=document.createElement(tag);node.className=className;
  const binding={node,source,translations};bindings.add(binding);paint(binding);return node;
}
function paint(binding){
  const {node,source,translations}=binding,result=translatedText(source,typeof translations==='function'?translations():translations);
  const value=document.createElement('span');value.dataset.originalContent='';value.className='translated-value';value.textContent=result.text;
  node.replaceChildren(value);
  if(result.pending||result.changed){
    const badge=document.createElement('small');badge.className='translation-note';badge.textContent=result.pending?'번역 준비 중 · 원문 표시':result.manual?'교정된 번역':'자동 번역';node.append(badge);
  }
  if(result.changed){const details=document.createElement('details'),summary=document.createElement('summary'),original=document.createElement('span');details.className='original-text';summary.textContent='원문 보기';original.dataset.originalContent='';original.textContent=source;details.append(summary,original);node.append(details);}
}
export function refreshContent(){for(const binding of bindings){if(!binding.node.isConnected){bindings.delete(binding);continue;}paint(binding);}localize();}
if(typeof document!=='undefined')document.addEventListener('languagechange',refreshContent);
