/** RnK meal API. Keep secrets in Project Settings > Script properties. */
const MEAL_KEYS = ['breakfast', 'lunch', 'dinner'];
function output(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function emptyMenu() { return {version:1,updatedAt:null,meals:[{key:'breakfast',label:'조식',start:'05:00',end:'06:00'},{key:'lunch',label:'중식',start:'12:00',end:'13:00'},{key:'dinner',label:'석식',start:'18:00',end:'20:00'}],days:[]}; }
function readRecord() {
  const id = PropertiesService.getScriptProperties().getProperty('MENU_FILE_ID');
  if (!id) throw new Error('관리자가 setup 함수를 먼저 실행해야 합니다.');
  return JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'));
}
function doGet() {
  try { const record = readRecord(); return output({ok:true,data:record.data,revision:record.revision}); }
  catch (_) { return output({ok:false,error:'저장 서버 초기화가 필요합니다. 관리자에게 문의하세요.'}); }
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
    const secret = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
    if (!secret || typeof body.password !== 'string' || !samePassword(secret, body.password)) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
    if (body.action !== 'save') throw new Error('지원하지 않는 요청입니다.');
    const data = validateMenu(body.data);
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw new Error('다른 저장을 처리 중입니다. 잠시 후 다시 시도하세요.');
    const current = readRecord();
    if (body.expectedRevision !== current.revision) throw new Error('다른 관리자가 식단을 수정했습니다. 입력을 임시 저장한 후 새로고침하고 다시 적용하세요.');
    const record = {revision:Utilities.getUuid(),data:data};
    const id = PropertiesService.getScriptProperties().getProperty('MENU_FILE_ID');
    DriveApp.getFileById(id).setContent(JSON.stringify(record));
    return output({ok:true,data:record.data,revision:record.revision});
  } catch (error) { return output({ok:false,error:error.message || '저장에 실패했습니다.'}); }
  finally { if (lock && lock.hasLock()) lock.releaseLock(); }
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
    const file = DriveApp.createFile('rnk-meal-data.json',JSON.stringify({revision:Utilities.getUuid(),data:emptyMenu()}),MimeType.PLAIN_TEXT);
    props.setProperty('MENU_FILE_ID',file.getId());
  } finally { lock.releaseLock(); }
}
