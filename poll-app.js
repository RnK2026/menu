import {getLocale,localize} from './i18n.js';
import {contentNode} from './translated-content.js';

export function initPolls({$,status,safely,request,getApiURL,serviceId}){
  let polls=[],ready=false;
  const localTokens=new Map();
  function savedToken(id){try{return localStorage.getItem(serviceId+'-poll-'+id);}catch{return localTokens.get(id);}}
  function voterToken(id){let token=savedToken(id);if(token)return token;
    token=crypto.randomUUID();try{localStorage.setItem(serviceId+'-poll-'+id,token);}catch{localTokens.set(id,token);}return token;
  }
  function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
  function dateText(iso){return new Intl.DateTimeFormat(getLocale(),{timeZone:'Europe/Moscow',dateStyle:'medium',timeStyle:'short'}).format(new Date(iso));}
  function dateNode(iso){const node=element('time',dateText(iso));node.dataset.pollDate=iso;return node;}
  function content(tag,text,poll,className){return contentNode(tag,text,()=>poll.translations||{},className||'');}
  function row(option,poll){const wrapper=element('div',undefined,'poll-result-row'),label=element('div',undefined,'poll-result-label'),percent=poll.voteCount?Math.round(option.count/poll.voteCount*100):0;
    label.append(content('span',option.text,poll),element('strong',`${option.count}표 · ${percent}%`));wrapper.append(label);
    const bar=element('div',undefined,'poll-bar'),fill=element('span');fill.style.width=percent+'%';bar.append(fill);wrapper.append(bar);
    if(!poll.anonymous&&option.names?.length){const names=element('p',undefined,'poll-voter-names');const original=element('span',option.names.join(', '));original.dataset.originalContent='';names.append(original);wrapper.append(names);}
    return wrapper;
  }
  function card(poll){const article=element('article',undefined,'panel poll-card'),header=element('div',undefined,'poll-card-heading');
    header.append(content('h3',poll.title,poll),element('span',poll.closed?'완료':'진행 중','status-badge'));article.append(header);
    if(poll.description)article.append(content('p',poll.description,poll,'poll-description'));
    const deadline=element('p',undefined,'poll-deadline');deadline.append('종료 · ',dateNode(poll.closesAt),' · 모스크바 시간');article.append(deadline);
    const setting=element('p',undefined,'poll-setting-summary');setting.textContent=[poll.multiple?'복수 선택':'단일 선택',poll.anonymous?'비기명':'기명',poll.allowAdd?'참여자 항목 추가 가능':null].filter(Boolean).join(' · ');article.append(setting);
    const form=element('form',undefined,'poll-ballot');
    if(!poll.closed&&!savedToken(poll.id)){
      const name='poll-choice-'+poll.id;
      for(const option of poll.options){const label=element('label',undefined,'poll-choice'),input=element('input');input.type=poll.multiple?'checkbox':'radio';input.name=name;input.value=option.id;label.append(input,content('span',option.text,poll));form.append(label);}
      if(poll.allowAdd){const label=element('label',undefined,'poll-add-choice');label.append(element('span','새 항목 추가'));const input=element('input');input.name='addOptionText';input.maxLength=100;input.placeholder='추가할 항목 입력';input.oninput=()=>{if(input.value.trim()&&!poll.multiple)form.querySelectorAll(`input[name="${name}"]`).forEach(choice=>choice.checked=false);};label.append(input);form.append(label);}
      if(!poll.anonymous){const label=element('label',undefined,'poll-name');label.append(element('span','투표자 이름'));const input=element('input');input.name='voterName';input.maxLength=30;input.required=true;input.placeholder='이름 입력';label.append(input);form.append(label);}
      const submit=element('button','투표하기','primary');submit.type='submit';form.append(submit);
      form.onsubmit=safely(async event=>{event.preventDefault();const optionIds=[...form.querySelectorAll(`input[name="${name}"]:checked`)].map(input=>input.value),addOptionText=form.elements.addOptionText?.value.trim()||'';
        if(!optionIds.length&&!addOptionText)throw Error('투표 항목을 선택하세요.');
        if(!poll.multiple&&optionIds.length&&addOptionText)throw Error('한 항목만 선택할 수 있습니다.');
        submit.disabled=true;try{const result=await request({action:'castVote',serviceId,pollId:poll.id,optionIds,addOptionText,name:form.elements.voterName?.value.trim()||'',voterToken:voterToken(poll.id)});
          if(result.serviceId&&result.serviceId!==serviceId)throw Error('투표 서버를 확인하세요.');polls=result.polls;render();status('투표가 등록되었습니다.');
        }finally{submit.disabled=false;}
      });
      article.append(form);
    }else if(!poll.closed)article.append(element('p','이 브라우저에서 이미 참여했습니다.','poll-participated'));
    const summary=element('div',undefined,'poll-results');summary.append(element('h4',`결과 · ${poll.voteCount}명 참여`));
    for(const option of poll.options)summary.append(row(option,poll));article.append(summary);return article;
  }
  function render(){const active=$('#poll-active'),closed=$('#poll-closed');active.replaceChildren();closed.replaceChildren();
    for(const poll of polls){poll.closed=Date.now()>=Date.parse(poll.closesAt);(poll.closed?closed:active).append(card(poll));}
    if(!active.children.length)active.append(element('div','진행 중인 투표가 없습니다.','empty'));
    if(!closed.children.length)closed.append(element('div','완료된 투표가 없습니다.','empty'));
    localize();
  }
  async function load(){if(!getApiURL()){$('#poll-notice').textContent='투표 서버를 연결해 주세요.';$('#poll-notice').hidden=false;return;}
    try{const response=await fetch(getApiURL()+'?resource=polls',{cache:'no-store',signal:AbortSignal.timeout(30000)});const result=await response.json();
      if(!response.ok||!result.ok||result.pollVersion!==1||!Array.isArray(result.polls)||result.serviceId&&result.serviceId!==serviceId)throw Error('투표 기능을 사용하려면 Apps Script를 업데이트하고 다시 배포해 주세요.');
      polls=result.polls;ready=true;$('#poll-notice').hidden=true;render();
    }catch(error){ready=false;$('#poll-notice').textContent=error.message;$('#poll-notice').hidden=false;$('#poll-active').replaceChildren();$('#poll-closed').replaceChildren();}
  }
  const fields=$('#poll-option-fields');
  function optionField(){if(fields.children.length>=20)return;const row=element('div',undefined,'poll-option-field'),input=element('input'),remove=element('button','삭제','secondary');input.maxLength=100;input.required=true;input.placeholder='투표 항목';input.setAttribute('aria-label','투표 항목');remove.type='button';remove.onclick=()=>{if(fields.children.length>2)row.remove();};row.append(input,remove);fields.append(row);}
  optionField();optionField();$('#poll-add-option').onclick=optionField;
  const form=$('#poll-create-form');
  form.elements.closesAt.value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(Date.now()+86400000)).replace(' ','T');
  form.onsubmit=safely(async event=>{event.preventDefault();if(!ready)throw Error('투표 기능을 사용하려면 Apps Script를 업데이트하고 다시 배포해 주세요.');
    const password=$('#password').value;if(!password)throw Error('관리자 비밀번호를 입력하세요.');
    const values=new FormData(form),options=[...fields.querySelectorAll('input')].map(input=>input.value.trim());
    const closesAt=new Date(values.get('closesAt')+':00+03:00').toISOString();
    const button=form.querySelector('button[type=submit]');button.disabled=true;
    try{const result=await request({action:'createPoll',serviceId,password,title:values.get('title').trim(),description:values.get('description').trim(),options,closesAt,multiple:values.has('multiple'),anonymous:values.has('anonymous'),allowAdd:values.has('allowAdd')});
      if(result.serviceId&&result.serviceId!==serviceId)throw Error('투표 서버를 확인하세요.');polls=result.polls;render();form.reset();fields.replaceChildren();optionField();optionField();status('투표가 생성되었습니다.');
    }finally{button.disabled=false;}
  });
  $('#poll-refresh').onclick=safely(load);
  document.addEventListener('languagechange',()=>{for(const node of document.querySelectorAll('[data-poll-date]'))node.textContent=dateText(node.dataset.pollDate);});
  return {load,tick(){if(polls.some(poll=>poll.closed!== (Date.now()>=Date.parse(poll.closesAt))))render();}};
}
