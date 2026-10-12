// Original text is authoritative. Translation runs outside the data-file lock.
function translationTexts(record) {
  const texts=[];
  (record.voc || []).forEach(function(post){texts.push(post.title,post.content);(post.replies || []).forEach(function(reply){texts.push(reply.content);});if(post.reply)texts.push(post.reply);});
  ((record.data || {}).days || []).slice().sort(function(a,b){return b.date.localeCompare(a.date);}).forEach(function(day){MEAL_KEYS.forEach(function(key){texts.push(day[key]);});});
  return Array.from(new Set(texts.filter(function(text){return typeof text==='string' && text.trim() && text.trim()!=='-';})));
}
function publicTranslations(record,texts) {
  const result={};
  texts.forEach(function(text){
    const key='$'+text, entry=(record.translations || {})[key];
    if(!entry)return;
    const item={};
    ['ko','en'].forEach(function(lang){if(typeof entry[lang]==='string')item[lang]=entry[lang];});
    if(entry.manual)item.manual=entry.manual;
    result[key]=item;
  });
  return result;
}
function mealTranslations(record) {
  const texts=[];
  record.data.days.forEach(function(day){MEAL_KEYS.forEach(function(key){texts.push(day[key]);});});
  return Object.assign({},record.data,{translations:publicTranslations(record,texts)});
}
function applyTranslationEdits(record,edits) {
  if(edits===undefined)return;
  if(!Array.isArray(edits) || edits.length>42)throw new Error('번역 교정 형식이 올바르지 않습니다.');
  const allowed=new Set(translationTexts({data:record.data}));
  if(!record.translations)record.translations={};
  edits.forEach(function(edit){
    if(!edit || !allowed.has(edit.source) || !['ko','en'].includes(edit.lang) || typeof edit.text!=='string' || edit.text.length>10000)throw new Error('번역 교정 형식이 올바르지 않습니다.');
    const key='$'+edit.source, entry=record.translations[key] || {};
    entry.generation=Number(entry.generation || 0)+1;
    if(!entry.manual)entry.manual={};
    if(edit.text.trim()){entry[edit.lang]=edit.text.trim();entry.manual[edit.lang]=true;}
    else {delete entry[edit.lang];delete entry.manual[edit.lang];delete entry.retryAt;}
    record.translations[key]=entry;
  });
}
function translationFileId() {
  const props=PropertiesService.getScriptProperties();
  return props.getProperty('DAERIM_MENU_FILE_ID') || props.getProperty('MENU_FILE_ID');
}
function translateEntry(source,previous) {
  const entry=Object.assign({},previous || {});
  ['ko','en'].forEach(function(lang){if(!entry[lang])entry[lang]=LanguageApp.translate(source,'',lang);});
  delete entry.retryAt;
  return entry;
}
/** Run once after updating the web app; also grants translation/trigger permissions. */
function enableTranslations() {
  readRecord();
  LanguageApp.translate('안녕하세요','ko','en');
  if(!ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='processTranslations';})){
    ScriptApp.newTrigger('processTranslations').timeBased().everyMinutes(1).create();
  }
  processTranslations();
}
/** Safe to rerun. Originals, revisions, posts and photos are never replaced. */
function processTranslations() {
  // A short property lease prevents overlapping workers without blocking menu saves.
  const lock=LockService.getScriptLock(), props=PropertiesService.getScriptProperties();
  if(!lock.tryLock(1000))return;
  let snapshot;
  const lease=Utilities.getUuid();
  try {
    if(Number(props.getProperty('TRANSLATION_LEASE_UNTIL') || 0)>Date.now())return;
    snapshot=readRecord();
    props.setProperty('TRANSLATION_LEASE',lease);
    props.setProperty('TRANSLATION_LEASE_UNTIL',String(Date.now()+360000));
  } finally {lock.releaseLock();}
  try {
    const pending=translationTexts(snapshot).filter(function(text){const e=(snapshot.translations || {})['$'+text] || {};return (!e.ko || !e.en) && !(e.retryAt>Date.now());}).slice(0,8);
    const updates={},started=Date.now();
    for(let i=0;i<pending.length && Date.now()-started<40000;i++){
      const text=pending[i],key='$'+text;
      try {updates[key]=translateEntry(text,(snapshot.translations || {})[key]);}
      catch(error){updates[key]=Object.assign({},(snapshot.translations || {})[key],{retryAt:Date.now()+900000});console.warn('Translation deferred; original saved.');break;}
    }
    lock.waitLock(10000);
    try {
      const latest=readRecord(),valid=new Set(translationTexts(latest).map(function(s){return '$'+s;}));
      if(!latest.translations)latest.translations={};
      Object.keys(updates).forEach(function(key){
        if(!valid.has(key))return;
        const current=latest.translations[key] || {},update=updates[key];
        // A correction or reset made while translating wins over the old snapshot.
        if((current.generation || 0)!==(((snapshot.translations || {})[key] || {}).generation || 0))return;
        ['ko','en'].forEach(function(lang){if(!current[lang] && update[lang])current[lang]=update[lang];});
        if(update.retryAt)current.retryAt=update.retryAt;
        latest.translations[key]=current;
      });
      let pruned=false;
      Object.keys(latest.translations).forEach(function(key){if(!valid.has(key)){delete latest.translations[key];pruned=true;}});
      if(pending.length || pruned)DriveApp.getFileById(translationFileId()).setContent(JSON.stringify(latest));
    } finally {lock.releaseLock();}
  } finally {
    lock.waitLock(10000);
    try {if(props.getProperty('TRANSLATION_LEASE')===lease){props.setProperty('TRANSLATION_LEASE_UNTIL','0');}}
    finally {lock.releaseLock();}
  }
}
function previewTranslations(body) {
  requireAdmin(body.password);
  if(!Array.isArray(body.texts) || body.texts.length>2 || body.texts.some(function(s){return typeof s!=='string' || s.length>5000;}))throw new Error('번역 요청 형식이 올바르지 않습니다.');
  const result={};
  body.texts.forEach(function(text){if(text.trim() && text.trim()!=='-')result['$'+text]=translateEntry(text);});
  return output({ok:true,translations:result});
}
