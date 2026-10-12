import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {translatedText} from '../translated-content.js';
import {mealSchedule} from '../core.js';
const read=p=>readFileSync(p,'utf8');
function backend(target='rnk'){
 let record={revision:'original',data:{version:1,meals:mealSchedule,days:[{date:'2026-10-12',breakfast:'-',lunch:'김치찌개',dinner:'Pasta'}]},voc:[{id:'post',title:'건의',content:'방이 추워요',author:'홍길동',createdAt:'2026-10-12T00:00:00Z',category:'lodging',photoFileId:'photo',deleteHash:'secret',replies:[{id:'reply',content:'확인합니다',author:'관리자',isAdmin:true,createdAt:'2026-10-12T01:00:00Z'}]}]};
 const props={ADMIN_PASSWORD:'password123',[target==='rnk'?'MENU_FILE_ID':'DAERIM_MENU_FILE_ID']:'file'};let locked=false,calls=[],beforeTranslate=()=>{};
 const ctx={console,ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},DriveApp:{getFileById:id=>{assert.equal(id,'file');return {getBlob:()=>({getDataAsString:()=>JSON.stringify(record)}),setContent:s=>record=JSON.parse(s)};}},LockService:{getScriptLock:()=>({tryLock:()=>locked=true,waitLock:()=>locked=true,hasLock:()=>locked,releaseLock:()=>locked=false})},Utilities:{getUuid:()=> 'new',computeDigest:(_a,s)=>Array.from(Buffer.from(s)),DigestAlgorithm:{SHA_256:'sha'},Charset:{UTF_8:'utf8'}},LanguageApp:{translate:(text,from,to)=>{assert.equal(locked,false);calls.push(text);beforeTranslate();return to+':'+text;}}};
 vm.createContext(ctx);vm.runInContext(read('apps-script/shared/Meal.gs')+read('apps-script/shared/Translation.gs')+read('apps-script/templates/'+target+'.gs'),ctx);
 return {ctx,calls,get record(){return record;},set beforeTranslate(f){beforeTranslate=f;},post:body=>ctx.doPost({postData:{contents:JSON.stringify(body)}})};
}
test('translation display selects language, preserves original, handles pending and dash',()=>{
 assert.equal(translatedText('김치',{'$김치':{en:'Kimchi'}},'en').text,'Kimchi');
 assert.equal(translatedText('김치',{},'en').pending,true);
 assert.equal(translatedText('Pasta',{},'ko').pending,true);
 assert.equal(translatedText('-',{},'en').pending,false);
 assert.equal(translatedText('김치',{},'en').text,'김치');
 assert.equal(translatedText('김치',{'$김치':{en:'Kimchi',manual:{en:true}}},'en').manual,true);
});
for(const target of ['rnk','daerim'])test(target+' background translation preserves originals, revisions, concurrent changes and secrets',()=>{
 const b=backend(target),before=JSON.parse(JSON.stringify(b.record));
 b.beforeTranslate=()=>{b.record.data.days[0].dinner='Edited concurrently';};
 b.ctx.processTranslations();
 assert.equal(b.record.revision,'original');
 assert.equal(b.record.voc[0].content,before.voc[0].content);
 assert.equal(b.record.voc[0].replies[0].content,before.voc[0].replies[0].content);
 assert.equal(b.record.voc[0].photoFileId,'photo');assert.equal(b.record.voc[0].deleteHash,'secret');
 assert.equal(b.record.data.days[0].lunch,'김치찌개');assert.equal(b.record.data.days[0].dinner,'Edited concurrently');
 assert.equal(b.record.translations['$김치찌개'].en,'en:김치찌개');
 assert.equal(b.calls.includes('홍길동'),false);assert.equal(b.calls.includes('secret'),false);
 assert.equal(b.ctx.doGet().data.translations['$방이 추워요'],undefined);
 if(target==='rnk'){const post=b.ctx.doGet({parameter:{resource:'voc'}}).posts[0];assert.equal(post.translations['$방이 추워요'].en,'en:방이 추워요');assert.equal(post.deleteHash,undefined);}
});
test('manual menu corrections persist; untrusted translations in meal payload ignored',()=>{
 const b=backend('daerim');b.record.voc=[];
 const result=b.post({action:'save',serviceId:'daerim',password:'password123',expectedRevision:'original',data:{...b.record.data,translations:{'$김치찌개':{en:'Injected'}}},translationEdits:[{source:'김치찌개',lang:'en',text:'Kimchi stew'}]});
 assert.equal(result.ok,true);assert.equal(b.record.data.translations,undefined);
 b.ctx.processTranslations();assert.equal(b.record.translations['$김치찌개'].en,'Kimchi stew');assert.equal(b.record.translations['$김치찌개'].manual.en,true);
 const snapshot=JSON.stringify(b.record);
 assert.equal(b.post({action:'save',serviceId:'daerim',password:'password123',expectedRevision:b.record.revision,data:b.record.data,translationEdits:[{source:'missing',lang:'en',text:'Invalid'}]}).ok,false);
 assert.equal(JSON.stringify(b.record),snapshot);
});
test('translation failure does not damage originals and does not throw from background job',()=>{
 const b=backend();b.beforeTranslate=()=>{throw Error('quota');};b.ctx.processTranslations();
 assert.equal(b.record.revision,'original');assert.equal(b.record.voc[0].content,'방이 추워요');
 assert.ok(Object.values(b.record.translations).some(e=>e.retryAt>Date.now()));
 assert.equal(b.post({action:'previewTranslations',password:'wrong',texts:['김치']}).ok,false);
});
