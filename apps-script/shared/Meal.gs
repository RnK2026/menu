const MEAL_KEYS = ['breakfast', 'lunch', 'dinner'];
function output(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function emptyMenu() { return {version:1,updatedAt:null,meals:[{key:'breakfast',label:'조식',start:'07:30',end:'08:30'},{key:'lunch',label:'중식',start:'12:30',end:'13:30'},{key:'dinner',label:'석식',start:'18:30',end:'19:30'}],days:[]}; }

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

function samePassword(a,b) {
  const first = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,a,Utilities.Charset.UTF_8);
  const second = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,b,Utilities.Charset.UTF_8);
  let difference = 0;
  for (let i=0;i<first.length;i++) difference |= first[i] ^ second[i];
  return difference === 0;
}

