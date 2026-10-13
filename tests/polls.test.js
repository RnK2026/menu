import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function server(serviceId){
  const data=JSON.parse(readFileSync(serviceId==='rnk'?'data/menu.json':'services/daerim/menu.json','utf8'));
  let record={revision:'old',data,...(serviceId==='rnk'?{voc:[{id:'legacy-post',title:'기존 글',content:'보존',replies:[]}]}:{})};
  const props={ADMIN_PASSWORD:'test-admin-password',[serviceId==='rnk'?'MENU_FILE_ID':'DAERIM_MENU_FILE_ID']:'file'};
  let sequence=0,locked=false;
  const ctx={
    ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>props[key],setProperty:(key,value)=>props[key]=value})},
    DriveApp:{getFileById:id=>{assert.equal(id,'file');return {getBlob:()=>({getDataAsString:()=>JSON.stringify(record)}),setContent:s=>record=JSON.parse(s)};}},
    LockService:{getScriptLock:()=>({tryLock:()=>locked=true,waitLock:()=>locked=true,hasLock:()=>locked,releaseLock:()=>locked=false})},
    Utilities:{getUuid:()=>`id-${++sequence}`,computeDigest:(_a,s)=>Array.from(Buffer.from(s)),base64Encode:bytes=>Buffer.from(bytes).toString('base64'),DigestAlgorithm:{SHA_256:'sha'},Charset:{UTF_8:'utf8'}}
  };
  vm.createContext(ctx);vm.runInContext(readFileSync(serviceId==='rnk'?'apps-script/Code.gs':'apps-script/Daerim.gs','utf8'),ctx);
  return {ctx,get record(){return record;},get locked(){return locked;},post:body=>ctx.doPost({postData:{contents:JSON.stringify(body)}}),list:()=>ctx.doGet({parameter:{resource:'polls'}})};
}
const deadline=()=>new Date(Date.now()+86400000).toISOString();
const token=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
for(const serviceId of ['rnk','daerim'])test(serviceId+' polls: admin creation, voting, anonymity, results and old data preservation',()=>{
  const s=server(serviceId),before=JSON.stringify(s.record.data);
  const creation={action:'createPoll',serviceId,password:'test-admin-password',title:'오늘의 메뉴',description:'좋아하는 메뉴를 선택하세요.',options:['국수','밥'],closesAt:deadline(),multiple:true,anonymous:true,allowAdd:true};
  assert.equal(s.list().polls.length,0);
  assert.equal(s.post({...creation,password:'wrong'}).ok,false);
  assert.equal(s.post({...creation,closesAt:new Date(Date.now()-1000).toISOString()}).ok,false);
  assert.equal(s.post({...creation,options:['중복','중복']}).ok,false);
  assert.equal(s.record.polls,undefined);
  const created=s.post(creation);assert.equal(created.ok,true);assert.equal(created.serviceId,serviceId);
  const poll=created.polls[0],first=poll.options[0];
  const vote={action:'castVote',serviceId,pollId:poll.id,optionIds:[first.id],addOptionText:'새 메뉴',voterToken:token(1),name:'입력해도 저장 안 됨'};
  assert.equal(s.post(vote).ok,true);
  assert.equal(s.post(vote).ok,false);
  assert.equal(s.post({...vote,voterToken:'bad'}).ok,false);
  assert.equal(s.post({...vote,voterToken:token(2),optionIds:['wrong'],addOptionText:''}).ok,false);
  const state=s.list().polls[0];assert.equal(state.voteCount,1);assert.equal(state.options.length,3);assert.equal(state.options[0].count,1);assert.equal(state.options[2].count,1);
  assert.equal(state.options[0].names,undefined);assert.equal(s.record.polls[0].votes[0].name,undefined);
  assert.equal(JSON.stringify(state).includes('voterToken'),false);assert.equal(JSON.stringify(state).includes(s.record.polls[0].votes[0].key),false);
  assert.equal(JSON.stringify(s.record.data),before);if(serviceId==='rnk')assert.equal(s.record.voc[0].title,'기존 글');
  assert.equal(s.record.revision,'old');assert.equal(s.locked,false);
  s.record.polls[0].closesAt=new Date(Date.now()-1000).toISOString();assert.equal(s.list().polls[0].closed,true);
  assert.equal(s.post({...vote,voterToken:token(3),addOptionText:''}).ok,false);
  const named=s.post({...creation,title:'기명 투표',anonymous:false,multiple:false,allowAdd:false});
  assert.equal(named.ok,true);const namedPoll=named.polls[0];
  assert.equal(s.post({action:'castVote',serviceId,pollId:namedPoll.id,optionIds:[namedPoll.options[0].id],voterToken:token(4)}).ok,false);
  assert.equal(s.post({action:'castVote',serviceId,pollId:namedPoll.id,optionIds:[namedPoll.options[0].id,namedPoll.options[1].id],voterToken:token(4),name:'이용자'}).ok,false);
  assert.equal(s.post({action:'castVote',serviceId,pollId:namedPoll.id,optionIds:[namedPoll.options[0].id],voterToken:token(4),name:'이용자'}).ok,true);
  assert.deepEqual(Array.from(s.list().polls[0].options[0].names),['이용자']);
});
test('RnK and Daerim poll records remain separate',()=>{
  const rnk=server('rnk'),daerim=server('daerim');
  const body={action:'createPoll',serviceId:'rnk',password:'test-admin-password',title:'RnK 전용',options:['A','B'],description:'',closesAt:deadline()};
  assert.equal(rnk.post(body).ok,true);assert.equal(daerim.list().polls.length,0);
  assert.equal(rnk.post({...body,serviceId:'daerim'}).ok,false);
  assert.equal(daerim.post({...body,serviceId:'rnk'}).ok,false);
  assert.equal(daerim.post({...body,serviceId:'daerim',title:'대림 전용'}).ok,true);
  assert.equal(rnk.list().polls[0].title,'RnK 전용');assert.equal(daerim.list().polls[0].title,'대림 전용');
});
