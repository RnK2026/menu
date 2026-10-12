import {messages} from './messages.js';
let language='ko';
try{language=localStorage.getItem('meal-language')==='en'?'en':'ko';}catch{}
export const getLanguage=()=>language;
export const getLocale=()=>language==='en'?'en-US':'ko-KR';
export function t(text){
  if(language==='ko'||typeof text!=='string')return text;
  const trimmed=text.trim();
  if(Object.hasOwn(messages,trimmed))return text.replace(trimmed,messages[trimmed]);
  const patterns=[
    [/^답글 (\d+)개$/,m=>`${m[1]} ${m[1]==='1'?'reply':'replies'}`],[/^(\d+)개 선택$/,m=>`${m[1]} selected`],
    [/^선택한 게시글 (\d+)개와 모든 답글을 삭제할까요\?$/,m=>`Delete ${m[1]} selected posts and all their replies?`],
    [/^(\d+)개 게시글을 삭제했습니다\.$/,m=>`Deleted ${m[1]} posts.`],
    [/^첨부 준비됨: ([\s\S]*)$/,m=>`Ready to attach: ${m[1]}`],
    [/^식단을 불러오지 못했습니다\. ([\s\S]*)$/,m=>`Could not load meals. ${t(m[1])}`],
    [/^저장 서버 연결이 아직 준비되지 않았습니다: ([\s\S]*) Apps Script에서 setup 함수를 실행해 주세요\.$/,m=>`Server not ready: ${t(m[1])} Run setup in Apps Script.`]
  ];
  for(const [pattern,format] of patterns){const match=trimmed.match(pattern);if(match)return format(match);}
  return text;
}
export const confirmAction=text=>window.confirm(t(text));
const remembered=new WeakMap();
function translatedValue(owner,key,value){
  let state=remembered.get(owner);if(!state){state={};remembered.set(owner,state);}
  if(!state[key]||state[key].output!==value)state[key]={source:value};
  state[key].output=t(state[key].source);return state[key].output;
}
// Explicitly exclude user content and input values; never machine-translate the DOM.
export function localize(root=document.body){
  if(!root)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())){
    if(node.parentElement?.closest('script,style,textarea,[data-original-content]'))continue;
    const value=translatedValue(node,'text',node.data);if(node.data!==value)node.data=value;
  }
  const elements=root.querySelectorAll?.('[placeholder],[aria-label],[title],[alt]') || [];
  for(const element of elements){
    if(element.closest('[data-original-content]'))continue;
    for(const attr of ['placeholder','aria-label','title','alt'])if(element.hasAttribute(attr)){
      const current=element.getAttribute(attr),value=translatedValue(element,attr,current);if(current!==value)element.setAttribute(attr,value);
    }
  }
}
function updateLanguageButtons(){
  document.documentElement.lang=language;
  for(const button of document.querySelectorAll('[data-language]'))button.setAttribute('aria-pressed',String(button.dataset.language===language));
}
export function setLanguage(value){
  if(!['ko','en'].includes(value))return;
  language=value;try{localStorage.setItem('meal-language',language);}catch{}
  updateLanguageButtons();document.dispatchEvent(new Event('languagechange'));localize(document.body);
  localize(document.head);
}
export function initLanguage(){
  const controls=document.createElement('div');controls.className='header-controls';
  const switcher=document.createElement('div');switcher.className='language-switch';switcher.setAttribute('role','group');switcher.setAttribute('aria-label','Language / 언어');
  for(const [lang,label] of [['ko','한국어'],['en','English']]){const button=document.createElement('button');button.type='button';button.dataset.language=lang;button.textContent=label;button.onclick=()=>setLanguage(lang);switcher.append(button);}
  controls.append(switcher,document.querySelector('#theme'));document.querySelector('header').append(controls);
  updateLanguageButtons();localize(document.body);localize(document.head);
  let scheduled=false;
  const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;localize(document.body);});});
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']});
  window.addEventListener('storage',event=>{if(event.key==='meal-language'&&event.newValue!==language)setLanguage(event.newValue);});
}
