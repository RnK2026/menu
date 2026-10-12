function properties() { return PropertiesService.getScriptProperties(); }
function readRecord() {
  const id = properties().getProperty('DAERIM_MENU_FILE_ID');
  if (!id) throw new Error('대림 관리자가 setup 함수를 먼저 실행해야 합니다.');
  return JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'));
}
function requireAdmin(password) {
  const secret = properties().getProperty('ADMIN_PASSWORD');
  if (!secret || typeof password !== 'string' || !samePassword(secret,password)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
}
function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.resource) throw new Error('지원하지 않는 요청입니다.');
    const record = readRecord();
    return output({ok:true,serviceId:'daerim',data:mealTranslations(record),revision:record.revision,translationVersion:1});
  } catch(error) { return output({ok:false,error:error.message}); }
}
function doPost(e) {
  let lock;
  try {
    if (!e || !e.postData || e.postData.contents.length > 2000000) throw new Error('요청 크기를 확인하세요.');
    const body = JSON.parse(e.postData.contents);
    if(body.action==='previewTranslations' && body.serviceId==='daerim')return previewTranslations(body);
    if (body.action !== 'save' || body.serviceId !== 'daerim') throw new Error('지원하지 않는 요청입니다.');
    requireAdmin(body.password);
    const data = validateMenu(body.data);
    data.days.forEach(function(day){ if(!day.breakfast.trim()) day.breakfast='-'; });
    lock = LockService.getScriptLock();
    if(!lock.tryLock(10000)) throw new Error('다른 저장을 처리 중입니다. 잠시 후 다시 시도하세요.');
    const current = readRecord();
    if(body.expectedRevision !== current.revision) throw new Error('다른 관리자가 식단을 수정했습니다. 임시 저장 후 새로고침하세요.');
    current.data = data;
    applyTranslationEdits(current,body.translationEdits);
    current.revision = Utilities.getUuid();
    DriveApp.getFileById(properties().getProperty('DAERIM_MENU_FILE_ID')).setContent(JSON.stringify(current));
    return output({ok:true,serviceId:'daerim',data:mealTranslations(current),revision:current.revision,translationVersion:1});
  } catch(error) { return output({ok:false,error:error.message}); }
  finally { if(lock && lock.hasLock()) lock.releaseLock(); }
}
/** Run in a NEW project with its own ADMIN_PASSWORD (8+ characters). */
function setup() {
  const props = properties(), password=props.getProperty('ADMIN_PASSWORD');
  if(props.getProperty('MENU_FILE_ID')) throw new Error('기존 서비스 프로젝트입니다. 대림용 새 프로젝트에서 실행하세요.');
  if(!password || password.length<8) throw new Error('8자 이상 ADMIN_PASSWORD를 설정하세요.');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    if(props.getProperty('DAERIM_MENU_FILE_ID')) return;
    const file=DriveApp.createFile('daerim-meal-data.json',JSON.stringify({revision:Utilities.getUuid(),data:emptyMenu()}),MimeType.PLAIN_TEXT);
    props.setProperty('DAERIM_MENU_FILE_ID',file.getId());
  } finally { lock.releaseLock(); }
}
