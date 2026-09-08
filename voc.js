export const VOC_CATEGORIES = ['menu', 'lodging'];
export const VOC_VISIBILITIES = ['public', 'private'];

function clean(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

function validateContent(input) {
  const category = clean(input?.category);
  const visibility = clean(input?.visibility) || 'public';
  const author = clean(input?.author) || '익명';
  const title = clean(input?.title);
  const content = clean(input?.content);
  if (!VOC_CATEGORIES.includes(category)) throw new Error('게시판 종류가 올바르지 않습니다.');
  if (!VOC_VISIBILITIES.includes(visibility)) throw new Error('공개 여부가 올바르지 않습니다.');
  if (author.length > 30) throw new Error('이름은 30자 이내로 입력하세요.');
  if (!title || title.length > 80) throw new Error('제목은 1~80자로 입력하세요.');
  if (!content || content.length > 1000) throw new Error('내용은 1~1000자로 입력하세요.');
  return { category, visibility, author, title, content };
}

export function validateVocDraft(input) {
  const draft = validateContent(input);
  const postPassword = String(input?.postPassword ?? '');
  if (draft.visibility === 'private' && (postPassword.length < 4 || postPassword.length > 50)) {
    throw new Error('비공개 글 비밀번호는 4~50자로 입력하세요.');
  }
  return { ...draft, postPassword: draft.visibility === 'private' ? postPassword : '' };
}

export function validatePhotoPayload(photo) {
  if (!photo) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.mimeType)) throw new Error('지원하지 않는 사진 형식입니다.');
  if (typeof photo.data !== 'string' || photo.data.length > 1400000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.data)) throw new Error('사진 데이터가 올바르지 않습니다.');
  return { mimeType: photo.mimeType, data: photo.data };
}

export function validateVocList(value) {
  if (!Array.isArray(value) || value.length > 500) throw new Error('VoC 데이터 형식이 올바르지 않습니다.');
  return value.map((post) => {
    if (typeof post.id !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(post.id)) throw new Error('VoC 번호가 올바르지 않습니다.');
    if (!VOC_CATEGORIES.includes(post.category)) throw new Error('게시판 종류가 올바르지 않습니다.');
    if (typeof post.createdAt !== 'string' || Number.isNaN(Date.parse(post.createdAt))) throw new Error('VoC 작성일이 올바르지 않습니다.');
    const visibility = post.visibility === 'private' ? 'private' : 'public';
    const listedStatus = post.status === '답변 완료' ? '답변 완료' : '접수';
    const base = { id: post.id, category: post.category, visibility, createdAt: post.createdAt, status: listedStatus, hasPhoto: Boolean(post.hasPhoto) };
    if (post.locked) return { ...base, locked: true };
    const content = validateContent({ ...post, visibility });
    const reply = clean(post.reply);
    if (reply.length > 1000) throw new Error('관리자 답변은 1000자 이내여야 합니다.');
    return { ...base, ...content, status: reply ? '답변 완료' : '접수', locked: false, reply, repliedAt: reply && post.repliedAt ? post.repliedAt : null, photo: validatePhotoPayload(post.photo) };
  });
}

export function formatVocDate(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(value));
}
