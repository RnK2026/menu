export const VOC_CATEGORIES = ['menu', 'lodging'];

function clean(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

export function validateVocDraft(input) {
  const category = clean(input?.category);
  const author = clean(input?.author) || '익명';
  const title = clean(input?.title);
  const content = clean(input?.content);
  if (!VOC_CATEGORIES.includes(category)) throw new Error('게시판 종류가 올바르지 않습니다.');
  if (author.length > 30) throw new Error('이름은 30자 이내로 입력하세요.');
  if (!title || title.length > 80) throw new Error('제목은 1~80자로 입력하세요.');
  if (!content || content.length > 1000) throw new Error('내용은 1~1000자로 입력하세요.');
  return { category, author, title, content };
}

export function validateVocList(value) {
  if (!Array.isArray(value) || value.length > 500) throw new Error('VoC 데이터 형식이 올바르지 않습니다.');
  return value.map((post) => {
    const draft = validateVocDraft(post);
    if (typeof post.id !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(post.id)) throw new Error('VoC 번호가 올바르지 않습니다.');
    if (typeof post.createdAt !== 'string' || Number.isNaN(Date.parse(post.createdAt))) throw new Error('VoC 작성일이 올바르지 않습니다.');
    const reply = clean(post.reply);
    if (reply.length > 1000) throw new Error('관리자 답변은 1000자 이내여야 합니다.');
    const status = reply ? '답변 완료' : '접수';
    return { ...draft, id: post.id, createdAt: post.createdAt, status, reply, repliedAt: reply && post.repliedAt ? post.repliedAt : null };
  });
}

export function formatVocDate(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(value));
}
