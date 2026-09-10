/** RnK meal API. Keep secrets in Project Settings > Script properties. */
const MEAL_KEYS = ['breakfast', 'lunch', 'dinner'];
function output(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function emptyMenu() { return {version:1,updatedAt:null,meals:[{key:'breakfast',label:'조식',start:'07:30',end:'08:30'},{key:'lunch',label:'중식',start:'12:30',end:'13:30'},{key:'dinner',label:'석식',start:'18:30',end:'19:30'}],days:[]}; }
function readRecord() {
  const id = PropertiesService.getScriptProperties().getProperty('MENU_FILE_ID');
  if (!id) throw new Error('관리자가 setup 함수를 먼저 실행해야 합니다.');
  const record = JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'));
  if (!Array.isArray(record.voc)) record.voc = [];
  record.voc = record.voc.map(function(post){
    post.visibility = 'public';
    post.photoFileId = post.photoFileId || '';
    post.deleteSalt = post.deleteSalt || '';
    post.deleteHash = post.deleteHash || '';
    if (!Array.isArray(post.replies)) {
      post.replies = post.reply ? [{id:'legacy-'+post.id,author:'관리자',content:post.reply,createdAt:post.repliedAt || post.createdAt,isAdmin:true}] : [];
    }
    post.replies = post.replies.map(function(reply){
      reply.deleteSalt = reply.deleteSalt || '';
      reply.deleteHash = reply.deleteHash || '';
      return reply;
    });
    return post;
  });
  return record;
}
function doGet(e) {
  const record = readRecord();
  if (e && e.parameter && e.parameter.resource === 'voc') return output({ok:true,posts:publicVoc(record.voc),capabilities:{publicReplies:true,lodgingPhoto:true,ownerDelete:true,bulkDelete:true}});
  if (e && e.parameter && e.parameter.resource === 'vocPhoto') {
    const post = findVoc(record,e.parameter.id);
    if (!post.photoFileId) throw new Error('사진을 볼 수 없습니다.');
    return output({ok:true,photo:readPhoto(post)});
  }
  return output({ok:true,data:record.data,revision:record.revision});
}
function validateMenu(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.days) || data.days.length > 3660 || !Array.isArray(data.meals) || data.meals.length !== 3) throw new Error('올바르지 않은 식단 형식입니다.');
  let previous = '00:00';
  data.meals.forEach(function(m,i) {
    if (m.key !== MEAL_KEYS[i] || typeof m.label !== 'string' || m.label.length > 30 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(m.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(m.end) || m.start >= m.end || m.start < previous) throw new Error('식사 시간 설정이 올바르지 않습니다.');
    previous = m.end;
  });
  const seen = {};
  data.days.forEach(function(d) {
    if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || isNaN(Date.parse(d.date)) || new Date(d.date).toISOString().slice(0,10) !== d.date || seen[d.date] || MEAL_KEYS.some(function(k){return typeof d[k] !== 'string' || d[k].length > 5000;})) throw new Error('식단 날짜 또는 메뉴가 올바르지 않습니다.');
    seen[d.date] = true;
  });
  return {version:1,updatedAt:new Date().toISOString(),meals:data.meals.map(function(m){return {key:m.key,label:m.label,start:m.start,end:m.end};}),days:data.days.map(function(d){return {date:d.date,breakfast:d.breakfast,lunch:d.lunch,dinner:d.dinner};})};
}
function doPost(e) {
  let lock;
  try {
    if (!e || !e.postData || e.postData.contents.length > 2000000) throw new Error('요청 크기를 확인하세요.');
    const body = JSON.parse(e.postData.contents);
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw new Error('다른 저장을 처리 중입니다. 잠시 후 다시 시도하세요.');
    const current = readRecord();
    if (body.action === 'createVoc') {
      if (body.website) return output({ok:true,posts:publicVoc(current.voc)});
      const post = validateVoc(body);
      const duplicate = current.voc.some(function(item) {
        return item.category === post.category && item.author === post.author && item.title === post.title && item.content === post.content && Date.now() - Date.parse(item.createdAt) < 60000;
      });
      if (duplicate) throw new Error('같은 의견이 방금 등록되었습니다. 잠시 후 확인해 주세요.');
      const id = Utilities.getUuid(), deleteSalt = Utilities.getUuid();
      const photoFileId = body.photo ? createPhoto(body.photo,post.category,id) : '';
      current.voc.unshift({id:id,category:post.category,visibility:'public',author:post.author,title:post.title,content:post.content,createdAt:new Date().toISOString(),replies:[],photoFileId:photoFileId,deleteSalt:deleteSalt,deleteHash:hashPassword(deleteSalt,post.postPassword)});
      current.voc = current.voc.slice(0,500);
      writeRecord(current);
      notifyVocCreated(current.voc[0],null);
      return output({ok:true,posts:publicVoc(current.voc)});
    }
    if (body.action === 'createVocReply') {
      const target = findVoc(current,body.id), reply = validateReply(body);
      if (reply.isAdmin) requireAdmin(body.password);
      const duplicate = target.replies.some(function(item){
        return item.author === reply.author && item.content === reply.content && Date.now() - Date.parse(item.createdAt) < 60000;
      });
      if (duplicate) throw new Error('같은 답글이 방금 등록되었습니다.');
      const deleteSalt = reply.isAdmin ? '' : Utilities.getUuid();
      target.replies.push({id:Utilities.getUuid(),author:reply.author,content:reply.content,createdAt:new Date().toISOString(),isAdmin:reply.isAdmin,deleteSalt:deleteSalt,deleteHash:deleteSalt?hashPassword(deleteSalt,reply.password):''});
      target.replies = target.replies.slice(-200);
      writeRecord(current);
      notifyVocCreated(target,target.replies[target.replies.length - 1]);
      return output({ok:true,posts:publicVoc(current.voc)});
    }
    if (body.action === 'deleteOwnVoc') {
      const target = findVoc(current,body.id);
      requireDeletePassword(target,body.password,'기존 게시글은 관리자만 삭제할 수 있습니다.');
      deletePost(current,target);
      writeRecord(current);
      return output({ok:true,posts:publicVoc(current.voc)});
    }
    if (body.action === 'deleteVocReply') {
      const target = findVoc(current,body.id), reply = target.replies.find(function(item){ return item.id === body.replyId; });
      if (!reply) throw new Error('해당 답글을 찾을 수 없습니다.');
      if (reply.isAdmin) requireAdmin(body.password);
      else requireDeletePassword(reply,body.password,'기존 답글은 관리자만 삭제할 수 있습니다.');
      target.replies = target.replies.filter(function(item){ return item.id !== body.replyId; });
      writeRecord(current);
      return output({ok:true,posts:publicVoc(current.voc)});
    }
    requireAdmin(body.password);
    if (body.action === 'listVocAdmin') return output({ok:true,posts:adminVoc(current.voc)});
    if (body.action === 'readVocAdmin') return output({ok:true,post:fullVoc(findVoc(current,body.id),true)});
    if (body.action === 'deleteVocMany') {
      if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 500) throw new Error('삭제할 게시글을 선택하세요.');
      const selected = {};
      body.ids.forEach(function(id){ if (typeof id === 'string') selected[id] = true; });
      const targets = current.voc.filter(function(item){ return selected[item.id]; });
      if (!targets.length) throw new Error('삭제할 게시글을 찾을 수 없습니다.');
      targets.forEach(function(item){ trashPhoto(item); });
      current.voc = current.voc.filter(function(item){ return !selected[item.id]; });
      writeRecord(current);
      return output({ok:true,posts:adminVoc(current.voc)});
    }
    if (body.action === 'save') {
      const data = validateMenu(body.data);
      if (body.expectedRevision !== current.revision) throw new Error('다른 관리자가 식단을 수정했습니다. 입력을 임시 저장한 후 새로고침하고 다시 적용하세요.');
      current.revision = Utilities.getUuid();
      current.data = data;
      writeRecord(current);
      return output({ok:true,data:current.data,revision:current.revision});
    }
    if (body.action === 'deleteVoc') {
      const target = findVoc(current,body.id);
      deletePost(current,target);
      writeRecord(current);
      return output({ok:true,posts:adminVoc(current.voc)});
    }
    throw new Error('지원하지 않는 요청입니다.');
  } catch (error) { return output({ok:false,error:error.message || '저장에 실패했습니다.'}); }
  finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
function writeRecord(record) {
  const id = PropertiesService.getScriptProperties().getProperty('MENU_FILE_ID');
  DriveApp.getFileById(id).setContent(JSON.stringify(record));
}
function notifyVocCreated(post,reply) {
  try {
    const props = PropertiesService.getScriptProperties();
    const recipients = String(props.getProperty('VOC_NOTIFY_EMAILS') || '').split(',').map(function(value){ return value.trim(); }).filter(Boolean);
    if (!recipients.length) return;
    const category = post.category === 'lodging' ? '숙소 VoC' : '메뉴 VoC';
    const eventLabel = reply ? '답글' : '새로운 의견';
    const subject = '[' + category + (reply ? ' 답글' : '') + '] ' + eventLabel + '이 등록되었습니다';
    const siteUrl = String(props.getProperty('VOC_NOTIFY_SITE_URL') || 'https://rnk2026.github.io/menu/').trim();
    const createdAt = formatNotificationDate(reply ? reply.createdAt : post.createdAt);
    const lines = [
      category + ' 게시판에 ' + eventLabel + '이 등록되었습니다.',
      '',
      '작성자: ' + (reply ? reply.author : post.author),
      '등록일시: ' + createdAt
    ];
    if (!reply) {
      lines.push('제목: ' + post.title);
      lines.push('', '내용:', post.content);
      if (post.category === 'lodging' && post.photoFileId) lines.push('', '첨부 사진: 있음');
    } else {
      lines.push('원문 제목: ' + post.title);
      lines.push('', '답글 내용:', reply.content);
    }
    lines.push('', '게시판 확인:', siteUrl + (post.category === 'lodging' ? '#stay-voc' : '#menu-voc'));
    const body = lines.join('\n');
    MailApp.sendEmail({to:recipients.join(','),subject:subject,body:body,htmlBody:notificationHtml(lines)});
  } catch (error) {
    console.error('VoC 알림 메일 발송 실패: ' + (error.message || error));
  }
}
function formatNotificationDate(value) {
  return Utilities.formatDate(new Date(value), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
}
function notificationHtml(lines) {
  return '<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap">' + lines.map(escapeNotificationHtml).join('\n') + '</div>';
}
function escapeNotificationHtml(value) {
  return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function requireAdmin(password) {
  const secret = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!secret || typeof password !== 'string' || !samePassword(secret,password)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
}
function findVoc(record,id) {
  const target = record.voc.find(function(item){ return item.id === id; });
  if (!target) throw new Error('해당 게시글을 찾을 수 없습니다.');
  return target;
}
function hashPassword(salt,password) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,salt+'|'+password,Utilities.Charset.UTF_8));
}
function sameValue(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let i=0;i<a.length;i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function requireDeletePassword(item,password,legacyMessage) {
  if (!item.deleteSalt || !item.deleteHash) throw new Error(legacyMessage);
  if (!sameValue(item.deleteHash,hashPassword(item.deleteSalt,String(password || '')))) throw new Error('삭제 비밀번호가 올바르지 않습니다.');
}
function trashPhoto(post) { if (post.photoFileId) DriveApp.getFileById(post.photoFileId).setTrashed(true); }
function deletePost(record,post) {
  trashPhoto(post);
  record.voc = record.voc.filter(function(item){ return item.id !== post.id; });
}
function createPhoto(photo,category,id) {
  if (category !== 'lodging' || !photo || ['image/jpeg','image/png','image/webp'].indexOf(photo.mimeType) < 0 || typeof photo.data !== 'string' || photo.data.length > 1400000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.data)) throw new Error('사진 데이터가 올바르지 않습니다.');
  const bytes = Utilities.base64Decode(photo.data);
  if (bytes.length > 950000) throw new Error('사진은 압축 후 950KB 이하여야 합니다.');
  return DriveApp.createFile(Utilities.newBlob(bytes,photo.mimeType,'voc-'+id+'.jpg')).getId();
}
function readPhoto(post) {
  const blob = DriveApp.getFileById(post.photoFileId).getBlob();
  return {mimeType:blob.getContentType(),data:Utilities.base64Encode(blob.getBytes())};
}
function cleanText(value) { return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').trim(); }
function validateVoc(body) {
  const category = cleanText(body.category), author = cleanText(body.author) || '익명', title = cleanText(body.title), content = cleanText(body.content), postPassword = String(body.postPassword || '');
  if (category !== 'menu' && category !== 'lodging') throw new Error('게시판 종류가 올바르지 않습니다.');
  if (author.length > 30) throw new Error('이름은 30자 이내로 입력하세요.');
  if (!title || title.length > 80) throw new Error('제목은 1~80자로 입력하세요.');
  if (!content || content.length > 1000) throw new Error('내용은 1~1000자로 입력하세요.');
  if (postPassword.length < 4 || postPassword.length > 50) throw new Error('게시글 삭제 비밀번호는 4~50자로 입력하세요.');
  return {category:category,author:author,title:title,content:content,postPassword:postPassword};
}
function validateReply(body) {
  const isAdmin = body.asAdmin === true || body.asAdmin === 'true', author = isAdmin ? '관리자' : cleanText(body.author) || '익명', content = cleanText(body.content), password = String(body.password || '');
  if (author.length > 30) throw new Error('답글 작성자 이름은 30자 이내로 입력하세요.');
  if (!isAdmin && author === '관리자') throw new Error('관리자 이름은 관리자 인증 후 사용할 수 있습니다.');
  if (!content || content.length > 1000) throw new Error('답글은 1~1000자로 입력하세요.');
  if (!isAdmin && (password.length < 4 || password.length > 50)) throw new Error('답글 삭제 비밀번호는 4~50자로 입력하세요.');
  return {author:author,content:content,isAdmin:isAdmin,password:password};
}
function publicVoc(posts) { return posts.slice(0,500).map(function(post){ return fullVoc(post,false); }); }
function adminVoc(posts) { return posts.slice(0,500).map(function(post){ return fullVoc(post,false); }); }
function fullVoc(post,includePhoto) {
  const replies = (post.replies || []).map(function(reply){ return {id:reply.id,author:reply.isAdmin?'관리자':reply.author,content:reply.content,createdAt:reply.createdAt,isAdmin:reply.isAdmin === true,canSelfDelete:reply.isAdmin === true || Boolean(reply.deleteHash)}; });
  return {id:post.id,category:post.category,author:post.author,title:post.title,content:post.content,createdAt:post.createdAt,status:replies.length?'답글 '+replies.length+'개':'접수',replies:replies,canSelfDelete:Boolean(post.deleteHash),hasPhoto:Boolean(post.photoFileId),photo:includePhoto&&post.photoFileId?readPhoto(post):null};
}
function samePassword(a,b) {
  const first = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,a,Utilities.Charset.UTF_8);
  const second = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,b,Utilities.Charset.UTF_8);
  let difference = 0;
  for (let i=0;i<first.length;i++) difference |= first[i] ^ second[i];
  return difference === 0;
}
/** Run once in the editor after setting ADMIN_PASSWORD (at least 16 characters). */
function setup() {
  const props = PropertiesService.getScriptProperties();
  const password = props.getProperty('ADMIN_PASSWORD');
  if (!password || password.length < 16) throw new Error('스크립트 속성에 16자 이상 ADMIN_PASSWORD를 설정하세요.');
  const lock = LockService.getScriptLock();lock.waitLock(10000);
  try {
    if (props.getProperty('MENU_FILE_ID')) return;
    const file = DriveApp.createFile('rnk-meal-data.json',JSON.stringify({revision:Utilities.getUuid(),data:emptyMenu(),voc:[]}),MimeType.PLAIN_TEXT);
    props.setProperty('MENU_FILE_ID',file.getId());
  } finally { lock.releaseLock(); }
}
