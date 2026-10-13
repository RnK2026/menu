import {keys,moscowNow,addDays,weekStart,dateLabel as baseDateLabel,validate,upcoming,parseTSV,mergeDays,validDate} from './core.js';
import {service,menuValue,applyDefaults} from './service.js';
import {initService} from './service-extension.js';
import {initLanguage,getLocale,t,confirmAction,localize} from './i18n.js';
import {contentNode,refreshContent} from './translated-content.js';
import {initPolls} from './poll-app.js';
const dateLabel=date=>baseDateLabel(date,getLocale());
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let published,displayData,editorTranslations={},week=weekStart(moscowNow().date),editStart=week,dirty=false,apiURL='',revision=null,translationVersion=0;

function status(text){$('#status').textContent=text;}
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function localGet(key){try{return localStorage.getItem(key);}catch{return null;}}
function tab(id){const tabs=service.voc?['next','weekly','polls','menu-voc','lodging-voc','vehicle-voc','admin']:['next','weekly','polls','admin'];if(!tabs.includes(id))id='next';for(const s of tabs)$('#'+s).hidden=s!==id;$$('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===id);if(b.dataset.tab===id)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});}
$$('[data-tab]').forEach(b=>b.onclick=()=>{location.hash=b.dataset.tab;tab(b.dataset.tab);});window.addEventListener('hashchange',()=>tab(location.hash.slice(1)));tab(location.hash.slice(1));
if(localGet(service.id+'-theme')==='dark')document.body.classList.add('dark');$('#theme').onclick=()=>{document.body.classList.toggle('dark');try{localStorage.setItem(service.id+'-theme',document.body.classList.contains('dark')?'dark':'light');}catch{}};
$('#today').textContent=dateLabel(moscowNow().date);
function render(){if(!displayData)return;$('#schedule').textContent=displayData.meals.map(m=>`${t(m.label)} ${m.start}–${m.end}`).join('  /  ');const cards=$('#next-cards');cards.replaceChildren();const next=upcoming(displayData,new Date(),service.breakfastDefault==='-');if(!next.length){const empty=el('div',undefined,'empty');empty.append(el('h2','등록된 다음 식사가 없습니다'),el('p','새로운 식단이 등록되면 이곳에 표시됩니다.'));cards.append(empty);}next.forEach((m,i)=>{const card=el('article',undefined,'meal-card'+(!i?' featured':''));card.append(el('span',m.ongoing?'지금 식사 중':i?'그다음 식사':'다가오는 식사','label'),el('h2',m.label),el('div',`${dateLabel(m.date)} · ${m.start}–${m.end}`,'date'));card.append(contentNode('div',m.menu,()=>displayData.translations||{},'menu-list menu-text'));cards.append(card);});renderWeekly();}
function headerRow(start){const row=el('tr');row.append(el('th','구분'));for(let i=0;i<7;i++){const date=addDays(start,i),th=el('th',dateLabel(date),date===moscowNow().date?'today':'');th.scope='col';th.dataset.mealDate=date;row.append(th);}return row;}
function renderWeekly(){if(!displayData)return;$('#week-label').textContent=`${dateLabel(week)} – ${dateLabel(addDays(week,6))}`;const table=el('table');table.append(headerRow(week));displayData.meals.forEach(m=>{const row=el('tr'),head=el('th',m.label);head.scope='row';row.append(head);for(let i=0;i<7;i++){const day=displayData.days.find(d=>d.date===addDays(week,i));const value=menuValue(day?.[m.key],m.key);row.append(value?contentNode('td',value,()=>displayData.translations||{}):el('td','미등록'));}table.append(row);});$('#weekly-table').replaceChildren(table);}
function renderEditor(start,source=published){
 editStart=start;editorTranslations=structuredClone(source.translations||{});$('#start-date').value=start;const table=el('table');table.append(headerRow(start));
 source.meals.forEach(m=>{const row=el('tr');row.append(el('th',m.label));
  for(let i=0;i<7;i++){
   const date=addDays(start,i),td=el('td'),input=el('textarea'),details=el('details',undefined,'translation-editor');
   input.dataset.date=date;input.dataset.key=m.key;input.maxLength=5000;
   input.value=menuValue(source.days.find(d=>d.date===date)?.[m.key],m.key);
   input.setAttribute('aria-label',dateLabel(date)+' '+t(m.label));
   input.placeholder='원문 입력 · 한글/영어 모두 가능';
   details.append(el('summary','번역 교정'));
   for(const lang of ['ko','en']){
    const label=el('label'),area=el('textarea');label.append(el('span',lang==='ko'?'한국어 번역':'영어 번역'));
    area.dataset.translationLang=lang;area.maxLength=10000;
    area.oninput=()=>{area.dataset.edited='true';dirty=true;};label.append(area);details.append(label);
   }
   const reset=()=>{const value=menuValue(input.value.trim(),m.key),entry=source.translations?.['$'+value]||{};
    for(const area of details.querySelectorAll('textarea')){const lang=area.dataset.translationLang,pending=source.pendingTranslationEdits?.find(e=>e.source===value&&e.lang===lang);area.value=pending?.text??entry[lang]??'';area.dataset.edited=pending||entry.manual?.[lang]&&entry[lang]!==published.translations?.['$'+value]?.[lang]?'true':'false';area.disabled=!value||value==='-';}
   };
   reset();input.oninput=()=>{dirty=true;reset();};td.append(input,details);row.append(td);
  }table.append(row);
 });$('#edit-table').replaceChildren(table);dirty=false;
}
function translationEdits(){
 const edits=new Map();
 for(const input of $$('#edit-table textarea[data-key]')){
  const source=menuValue(input.value.trim(),input.dataset.key);if(!source||source==='-')continue;
  for(const area of input.parentElement.querySelectorAll('[data-translation-lang]'))if(area.dataset.edited==='true'){
   const lang=area.dataset.translationLang;edits.set(lang+'|'+source,{source,lang,text:area.value.trim()});
  }
 }return [...edits.values()];
}
function collect(){
 if(!published)throw Error('식단을 먼저 불러와 주세요.');
 const days=Array.from({length:7},(_,i)=>({date:addDays(editStart,i),breakfast:'',lunch:'',dinner:''}));
 $$('#edit-table textarea[data-key]').forEach(t=>days.find(d=>d.date===t.dataset.date)[t.dataset.key]=menuValue(t.value.trim(),t.dataset.key));
 const data=mergeDays(published,days);data.translations=structuredClone({...published.translations,...editorTranslations});
 for(const edit of translationEdits()){
  const entry=data.translations['$'+edit.source]||={};entry.manual||={};
  if(edit.text){entry[edit.lang]=edit.text;entry.manual[edit.lang]=true;}else{delete entry[edit.lang];delete entry.manual[edit.lang];}
 }
 data.pendingTranslationEdits=translationEdits();return data;
}
function safely(fn){return async(...args)=>{try{await fn(...args);}catch(e){status(e.message);}};}
$('#prev').onclick=()=>{week=addDays(week,-7);renderWeekly();};$('#next-week').onclick=()=>{week=addDays(week,7);renderWeekly();};$('#this-week').onclick=()=>{week=weekStart(moscowNow().date);renderWeekly();};$('#print').onclick=()=>window.print();
$('#fill-dates').onclick=safely(()=>{const date=$('#start-date').value;if(!validDate(date))throw Error('시작일을 선택하세요.');if(dirty&&!confirmAction('저장하지 않은 입력 내용을 바꾸고 선택한 주를 불러올까요?'))return;const monday=weekStart(date);renderEditor(monday);status('선택한 주의 월요일부터 7일을 불러왔습니다.');});
$('#apply-paste').onclick=safely(()=>{const rows=parseTSV($('#paste').value);keys.forEach((k,r)=>$$(`#edit-table textarea[data-key="${k}"]`).forEach((t,c)=>{t.value=menuValue(rows[r][c],k);t.dispatchEvent(new Event('input'));}));dirty=true;status('붙여넣기를 적용했습니다. 입력 내용을 확인하세요.');});
$('#save').onclick=safely(()=>{localStorage.setItem(service.id+'-draft',JSON.stringify({start:editStart,data:collect()}));dirty=false;status('이 브라우저에 임시 저장했습니다. 아직 공개되지 않았습니다.');});
$('#restore').onclick=safely(()=>{const raw=localGet(service.id+'-draft');if(!raw)throw Error('임시 저장된 식단이 없습니다.');const draft=JSON.parse(raw);validate(draft.data);if(!validDate(draft.start))throw Error('임시 저장 날짜가 올바르지 않습니다.');if(dirty&&!confirmAction('현재 입력을 임시 저장된 내용으로 바꿀까요?'))return;renderEditor(draft.start,draft.data);dirty=true;status('임시 저장을 불러왔습니다.');});
$('#preview').onclick=safely(async()=>{
 const preview=collect();displayData=preview;week=editStart;render();$('#preview-banner').hidden=false;tab('weekly');location.hash='weekly';
 const texts=[...new Set(preview.days.filter(d=>d.date>=editStart&&d.date<=addDays(editStart,6)).flatMap(d=>keys.map(k=>d[k])))].filter(s=>s&&s!=='-'&&(!preview.translations['$'+s]?.ko||!preview.translations['$'+s]?.en));
 if(!texts.length){status('');return;}
 if(translationVersion!==1){status('자동 번역을 사용하려면 관리자에게 서버 업데이트를 요청하세요.');return;}
 const password=$('#password').value;if(!password){status('미리보기 번역은 관리자 비밀번호 입력 후 사용할 수 있습니다. 원문을 표시합니다.');return;}
 status('미리보기 번역 중입니다…');
 try{for(let i=0;i<texts.length&&displayData===preview;i+=2){const result=await request({action:'previewTranslations',serviceId:service.id,password,texts:texts.slice(i,i+2)});
  for(const [key,entry] of Object.entries(result.translations||{})){const current=preview.translations[key]||{};preview.translations[key]={...entry,...current};}
  if(displayData===preview){render();refreshContent();}
 }if(displayData===preview)status('');}catch{status('번역을 완료하지 못했습니다. 원문은 그대로 보존됩니다.');}
});$('#exit-preview').onclick=()=>{displayData=published;$('#preview-banner').hidden=true;render();};
$('#download').onclick=safely(()=>{const data=collect(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='menu.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('menu.json을 내려받았습니다. 백업하거나 GitHub에 반영할 수 있습니다.');});
$('#import').onchange=safely(async()=>{const file=$('#import').files[0];if(!file)return;if(file.size>2000000)throw Error('파일은 2MB 이하만 가져올 수 있습니다.');const data=validate(JSON.parse((await file.text()).replace(/^\uFEFF/,'')));if(dirty&&!confirmAction('현재 입력을 가져온 파일의 내용으로 바꿀까요?'))return;const start=weekStart(data.days[0]?.date||editStart);renderEditor(start,data);dirty=true;status('파일의 첫 주를 월요일 기준 입력표로 가져왔습니다. 저장 전 확인하세요.');});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
async function request(payload){const response=await fetch(apiURL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),redirect:'follow',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('서버 응답 오류입니다. 잠시 후 다시 시도하세요.');const result=await response.json();if(!result.ok)throw Error(result.error||'요청을 처리하지 못했습니다.');return result;}
$('#publish').onclick=safely(async()=>{if(!apiURL)throw Error('아직 저장 서버가 연결되지 않았습니다. README의 Apps Script 설정을 완료해 주세요.');const password=$('#password').value;if(!password)throw Error('관리자 비밀번호를 입력하세요.');if(service.id==='daerim'&&!revision)throw Error('대림 저장 서버 연결을 먼저 완료하세요.');const data=collect();if(translationEdits().length&&translationVersion!==1)throw Error('자동 번역을 사용하려면 관리자에게 서버 업데이트를 요청하세요.');if(!confirmAction('입력한 식단을 모든 방문자에게 공개할까요?'))return;$('#publish').disabled=true;status('서버에 저장하고 있습니다…');try{const result=await request({action:'save',password,expectedRevision:revision,data,translationEdits:translationEdits(),serviceId:service.id});if(service.id==='daerim'&&result.serviceId!=='daerim')throw Error('대림 전용 Apps Script URL을 연결하세요.');revision=result.revision;translationVersion=result.translationVersion||0;published=applyDefaults(result.data);displayData=published;dirty=false;$('#preview-banner').hidden=true;$('#password').value='';render();renderEditor(editStart);status('공개 저장을 완료했습니다. 모든 기기에서 변경한 식단을 볼 수 있습니다.');}finally{$('#publish').disabled=false;}});
async function load(){try{const cfg=await fetch('./config.json',{cache:'no-store'});if(!cfg.ok)throw Error('설정 파일을 불러오지 못했습니다.');const config=await cfg.json();apiURL=config.apiUrl||'';if(apiURL&&!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(apiURL))throw Error('Apps Script 배포 URL 설정을 확인하세요.');let serverError='';if(apiURL){try{const response=await fetch(apiURL,{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('식단 서버 응답 오류입니다.');const result=await response.json();if(!result.ok)throw Error(result.error||'서버 설정을 확인하세요.');if(service.id==='daerim'&&result.serviceId!=='daerim')throw Error('대림 전용 Apps Script URL을 연결하세요.');revision=result.revision;translationVersion=result.translationVersion||0;published=applyDefaults(result.data);}catch(e){serverError=e.message;}}if(!published){const fallback=await fetch('./data/menu.json',{cache:'no-store'});if(!fallback.ok)throw Error('기본 식단을 불러오지 못했습니다.');published=applyDefaults(await fallback.json());}$('#connection').textContent=apiURL&&!serverError?(service.voc?'관리자 비밀번호로 메뉴를 저장하거나 VoC 게시글을 삭제할 수 있습니다. 관리자 답글은 각 게시판에서 작성하세요.':'대림 관리자 비밀번호로 식단을 공개 저장할 수 있습니다.'):apiURL?`저장 서버 연결이 아직 준비되지 않았습니다: ${serverError} Apps Script에서 setup 함수를 실행해 주세요.`:'저장 서버 연결 대기 중입니다. Apps Script를 배포하고 config.json에 URL을 입력하세요.';displayData=published;render();renderEditor(editStart);if(voc)await voc.load();await polls.load();}catch(e){$('#next-cards').replaceChildren(el('div','식단을 불러오지 못했습니다. '+e.message,'empty'));status('페이지를 새로고침해 다시 시도하세요.');$$('#admin button').forEach(b=>b.disabled=true);}}
const voc=service.voc?(await import('./voc-app.js')).initVoc({$, $$, el, status, safely, request, getApiURL:()=>apiURL}):null;
const polls=initPolls({$,status,safely,request,getApiURL:()=>apiURL,serviceId:service.id});
initService({service});
initLanguage();
const translationHelp=el('p','번역 교정은 메뉴 공개 저장 시 함께 반영됩니다. 원문을 변경하면 기존 교정은 적용되지 않습니다.','translation-help');
$('#edit-table').before(translationHelp);
document.addEventListener('languagechange',()=>{
 $('#today').textContent=dateLabel(moscowNow().date);render();
 for(const cell of $$('#edit-table [data-meal-date]'))cell.textContent=dateLabel(cell.dataset.mealDate);
 for(const input of $$('#edit-table textarea[data-key]'))input.setAttribute('aria-label',dateLabel(input.dataset.date)+' '+t(published.meals.find(m=>m.key===input.dataset.key).label));
 localize();
});
load();setInterval(async()=>{
 if(displayData)render();polls.tick();if(!apiURL||document.hidden)return;
 try{const result=await (await fetch(apiURL,{cache:'no-store',signal:AbortSignal.timeout(30000)})).json();
  if(result.ok&&result.revision===revision){published.translations=result.data.translations||{};translationVersion=result.translationVersion||0;refreshContent();}
  if(voc)await voc.refreshTranslations();
 }catch{/* Keep the last successfully loaded content while offline. */}
},60000);
