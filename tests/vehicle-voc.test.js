import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {validateVocDraft,validateVocList} from '../voc.js';

test('vehicle feedback supports photos, notifications, translation, replies and scoped deletion',()=>{
 let sequence=0,locked=false;
 let record={revision:'original',data:JSON.parse(readFileSync('data/menu.json','utf8')),voc:[]};
 const props={ADMIN_PASSWORD:'test-admin-password',MENU_FILE_ID:'main',VOC_NOTIFY_EMAILS:'one@example.com,two@example.com'};
 const photos=new Map(),trashed=[],mail=[];
 const ctx={console,
  ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},
  DriveApp:{getFileById:id=>id==='main'?{getBlob:()=>({getDataAsString:()=>JSON.stringify(record)}),setContent:s=>record=JSON.parse(s)}:{getBlob:()=>photos.get(id),setTrashed:()=>trashed.push(id)},createFile:blob=>{const id='photo-'+(++sequence);photos.set(id,blob);return {getId:()=>id};}},
  LockService:{getScriptLock:()=>({tryLock:()=>locked=true,hasLock:()=>locked,releaseLock:()=>locked=false})},
  MailApp:{sendEmail:message=>mail.push(message)},
  Utilities:{getUuid:()=>`test-id-${++sequence}`,computeDigest:(_a,s)=>Array.from(Buffer.from(s)),base64Encode:bytes=>Buffer.from(bytes).toString('base64'),base64Decode:s=>Array.from(Buffer.from(s,'base64')),newBlob:(bytes,type)=>({getBytes:()=>bytes,getContentType:()=>type}),formatDate:d=>d.toISOString(),DigestAlgorithm:{SHA_256:'sha'},Charset:{UTF_8:'utf8'}}
 };
 vm.createContext(ctx);vm.runInContext(readFileSync('apps-script/Code.gs','utf8'),ctx);
 const post=body=>ctx.doPost({postData:{contents:JSON.stringify(body)}});
 const draft={category:'vehicle',author:'이용자',title:'차량 냉방',content:'오후 셔틀 냉방을 확인해 주세요.',postPassword:'post-password'};
 assert.equal(validateVocDraft(draft).category,'vehicle');
 assert.throws(()=>validateVocDraft({...draft,category:'unknown'}));
 const existing=post({action:'createVoc',...draft,category:'menu'}).posts[0];
 const lodging=post({action:'createVoc',...draft,category:'lodging'}).posts[0];
 assert.ok(mail.at(-1).body.includes('#lodging-voc'));
 const photo={mimeType:'image/jpeg',data:Buffer.from([1,2,3]).toString('base64')};
 const created=post({action:'createVoc',...draft,photo});
 assert.equal(created.ok,true);assert.equal(created.posts.length,3);
 const vehicle=validateVocList(created.posts).find(p=>p.category==='vehicle'),id=vehicle.id;
 assert.equal(vehicle.hasPhoto,true);assert.equal(vehicle.canSelfDelete,true);
 assert.equal(ctx.doGet({parameter:{resource:'voc'}}).capabilities.vehicleVoc,true);
 assert.equal(ctx.doGet({parameter:{resource:'vocPhoto',id}}).photo.data,photo.data);
 assert.equal(mail.at(-1).to,props.VOC_NOTIFY_EMAILS);
 assert.match(mail.at(-1).subject,/차량 VoC/);assert.match(mail.at(-1).body,/#vehicle-voc/);assert.match(mail.at(-1).body,/첨부 사진: 있음/);
 record.translations={'$차량 냉방':{ko:'차량 냉방',en:'Vehicle air conditioning'}};
 assert.equal(ctx.doGet({parameter:{resource:'voc'}}).posts.find(p=>p.id===id).translations['$차량 냉방'].en,'Vehicle air conditioning');
 const reply=post({action:'createVocReply',id,author:'동료',content:'저도 같은 문제입니다.',password:'reply-password'}).posts.find(p=>p.id===id).replies[0];
 assert.equal(reply.isAdmin,false);assert.match(mail.at(-1).body,/#vehicle-voc/);
 assert.equal(post({action:'deleteVocReply',id,replyId:reply.id,password:'wrong'}).ok,false);
 assert.equal(post({action:'deleteVocReply',id,replyId:reply.id,password:'reply-password'}).ok,true);
 const adminReply=post({action:'createVocReply',id,asAdmin:true,password:props.ADMIN_PASSWORD,content:'확인했습니다.'}).posts.find(p=>p.id===id).replies[0];
 assert.equal(adminReply.isAdmin,true);assert.match(mail.at(-1).subject,/차량 VoC 답글/);
 assert.equal(post({action:'deleteVocReply',id,replyId:adminReply.id,password:props.ADMIN_PASSWORD}).ok,true);
 assert.equal(post({action:'deleteOwnVoc',id,password:'wrong'}).ok,false);
 const other=post({action:'createVoc',...draft,title:'다른 차량 의견'}).posts.find(p=>p.title==='다른 차량 의견');
 assert.equal(post({action:'deleteOwnVoc',id:other.id,password:draft.postPassword}).ok,true);
 post({action:'createVocReply',id,author:'동료',content:'추가 확인 요청',password:'reply-password'});
 const second=post({action:'createVoc',...draft,title:'두 번째 차량 의견'}).posts.find(p=>p.title==='두 번째 차량 의견');
 const deletion=post({action:'deleteVocMany',ids:[id,second.id],password:props.ADMIN_PASSWORD});
 assert.equal(deletion.ok,true);assert.deepEqual(record.voc.map(p=>p.id).sort(),[existing.id,lodging.id].sort());
 assert.equal(trashed.length,1);assert.equal(record.revision,'original');assert.equal(locked,false);
});
