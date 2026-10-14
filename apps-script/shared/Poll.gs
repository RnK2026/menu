// Polls live in each service's existing Drive record. Never expose voter keys.
function pollList(record) {
  return (record.polls || []).slice().reverse().map(function(poll){
    const closed=Date.now()>=Date.parse(poll.closesAt), votes=poll.votes || [];
    const texts=[poll.title,poll.description].concat(poll.options.map(function(option){return option.text;}));
    return {
      id:poll.id,title:poll.title,description:poll.description,createdAt:poll.createdAt,
      closesAt:poll.closesAt,closed:closed,multiple:poll.multiple===true,
      anonymous:poll.anonymous===true,allowAdd:poll.allowAdd===true,voteCount:votes.length,
      options:poll.options.map(function(option){
        const selected=votes.filter(function(vote){return vote.optionIds.indexOf(option.id)>=0;});
        const item={id:option.id,text:option.text,count:selected.length};
        if(!poll.anonymous)item.names=selected.map(function(vote){return vote.name;});
        return item;
      }),
      translations:publicTranslations(record,texts)
    };
  });
}
function pollClean(value,max) {
  if(typeof value!=='string')return '';
  return value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max+1);
}
function pollCreate(record,body) {
  requireAdmin(body.password);
  const title=pollClean(body.title,100),description=pollClean(body.description,2000);
  const deadline=Date.parse(body.closesAt),now=Date.now();
  if(!title || title.length>100 || description.length>2000)throw new Error('투표 제목 또는 설명을 확인하세요.');
  if(typeof body.closesAt!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(body.closesAt) || !Number.isFinite(deadline) || new Date(deadline).toISOString()!==body.closesAt || deadline<=now)throw new Error('투표 종료일시는 현재 이후로 설정하세요.');
  if(!Array.isArray(body.options) || body.options.length<2 || body.options.length>20)throw new Error('투표 항목은 2~20개 입력하세요.');
  const options=body.options.map(function(text){return pollClean(text,100);});
  if(options.some(function(text){return !text || text.length>100;}) || new Set(options.map(function(text){return text.toLowerCase();})).size!==options.length)throw new Error('투표 항목을 중복 없이 입력하세요.');
  if(!record.polls)record.polls=[];
  record.polls.push({id:Utilities.getUuid(),title:title,description:description,
    createdAt:new Date(now).toISOString(),closesAt:body.closesAt,
    multiple:body.multiple===true,anonymous:body.anonymous===true,allowAdd:body.allowAdd===true,
    options:options.map(function(text){return {id:Utilities.getUuid(),text:text};}),votes:[]});
}
function pollVote(record,body) {
  const poll=(record.polls || []).find(function(item){return item.id===body.pollId;});
  if(!poll)throw new Error('투표를 찾을 수 없습니다.');
  if(Date.now()>=Date.parse(poll.closesAt))throw new Error('종료된 투표입니다.');
  if(typeof body.voterToken!=='string' || !/^[0-9a-f-]{36}$/.test(body.voterToken))throw new Error('투표자 확인 정보가 올바르지 않습니다.');
  const key=Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,poll.id+'|'+body.voterToken,Utilities.Charset.UTF_8));
  if(poll.votes.some(function(vote){return vote.key===key;}))throw new Error('이 브라우저에서 이미 참여한 투표입니다.');
  const name=poll.anonymous?'':pollClean(body.name,30);
  if(!poll.anonymous && (!name || name.length>30))throw new Error('투표자 이름을 30자 이내로 입력하세요.');
  if(!Array.isArray(body.optionIds) || body.optionIds.length>20 || body.optionIds.some(function(id){return typeof id!=='string';}))throw new Error('투표 항목을 선택하세요.');
  const selected=new Set(body.optionIds);
  if(selected.size!==body.optionIds.length || (!poll.multiple && selected.size>1))throw new Error('선택 가능한 투표 항목 수를 확인하세요.');
  if(poll.allowAdd && body.addOptionText){
    const text=pollClean(body.addOptionText,100);
    if(!text || text.length>100 || poll.options.length>=20 || poll.options.some(function(option){return option.text.toLowerCase()===text.toLowerCase();}))throw new Error('추가할 투표 항목을 확인하세요.');
    const option={id:Utilities.getUuid(),text:text};poll.options.push(option);selected.add(option.id);
  }else if(body.addOptionText)throw new Error('이 투표는 항목을 추가할 수 없습니다.');
  if(!selected.size || (!poll.multiple && selected.size!==1))throw new Error('한 항목만 선택할 수 있습니다.');
  if([...selected].some(function(id){return !poll.options.some(function(option){return option.id===id;});}))throw new Error('투표 항목을 선택하세요.');
  if(poll.votes.length>=10000)throw new Error('투표 참여 한도에 도달했습니다.');
  const vote={key:key,optionIds:[...selected],createdAt:new Date().toISOString()};
  if(!poll.anonymous)vote.name=name;
  poll.votes.push(vote);
}
function pollDelete(record,body) {
  requireAdmin(body.password);
  if(!Array.isArray(body.ids) || !body.ids.length || body.ids.length>500 || body.ids.some(function(id){return typeof id!=='string' || !id;}))throw new Error('삭제할 투표를 선택하세요.');
  const ids=new Set(body.ids),existing=record.polls || [];
  if(ids.size!==body.ids.length || ids.size!==existing.filter(function(poll){return ids.has(poll.id);}).length)throw new Error('선택한 투표를 다시 확인하세요.');
  record.polls=existing.filter(function(poll){return !ids.has(poll.id);});
  if(record.translations){
    const used=new Set(translationTexts(record).map(function(text){return '$'+text;}));
    Object.keys(record.translations).forEach(function(key){if(!used.has(key))delete record.translations[key];});
  }
}
function pollAction(record,body) {
  if(body.action==='createPoll')pollCreate(record,body);
  else if(body.action==='castVote')pollVote(record,body);
  else if(body.action==='deletePolls')pollDelete(record,body);
  else throw new Error('지원하지 않는 요청입니다.');
  DriveApp.getFileById(translationFileId()).setContent(JSON.stringify(record));
  return output({ok:true,serviceId:PropertiesService.getScriptProperties().getProperty('DAERIM_MENU_FILE_ID')?'daerim':'rnk',polls:pollList(record)});
}
