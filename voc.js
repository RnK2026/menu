export const VOC_CATEGORIES = ['menu', 'lodging'];

function clean(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

export function validateVocDraft(input) {
  const category = clean(input?.category);
  const author = clean(input?.author) || '익명';
  const title = clean(input?.title);
  const content = clean(input?.content);
  const postPassword = String(input?.postPassword ?? '');
  if (!VOC_CATEGORIES.includes(category)) throw new Error('게시판 종류가 올바르지 않습니다.');
  if (author.length > 30) throw new Error('이름은 30자 이내로 입력하세요.');
  if (!title || title.length > 80) throw new Error('제목은 1~80자로 입력하세요.');
  if (!content || content.length > 1000) throw new Error('내용은 1~1000자로 입력하세요.');
  if (postPassword.length < 4 || postPassword.length > 50) throw new Error('게시글 삭제 비밀번호는 4~50자로 입력하세요.');
  return { category, author, title, content, postPassword };
}

export function validateReplyDraft(input) {
  const asAdmin = input?.asAdmin === true || input?.asAdmin === 'on' || input?.asAdmin === 'true';
  const author = asAdmin ? '관리자' : clean(input?.author) || '익명';
  const content = clean(input?.content);
  const password = String(input?.password ?? '');
  if (author.length > 30) throw new Error('답글 작성자 이름은 30자 이내로 입력하세요.');
  if (!asAdmin && author === '관리자') throw new Error('관리자 이름은 관리자 인증 후 사용할 수 있습니다.');
  if (!content || content.length > 1000) throw new Error('답글은 1~1000자로 입력하세요.');
  if (asAdmin && !password) throw new Error('관리자 비밀번호를 입력하세요.');
  if (!asAdmin && (password.length < 4 || password.length > 50)) throw new Error('답글 삭제 비밀번호는 4~50자로 입력하세요.');
  return { author, content, asAdmin, password };
}

export function validatePhotoPayload(photo) {
  if (!photo) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.mimeType)) throw new Error('지원하지 않는 사진 형식입니다.');
  if (typeof photo.data !== 'string' || photo.data.length > 1400000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.data)) throw new Error('사진 데이터가 올바르지 않습니다.');
  return { mimeType: photo.mimeType, data: photo.data };
}

function validateReplies(post) {
  const source = Array.isArray(post.replies) ? post.replies : post.reply ? [{id:`legacy-${post.id}`,author:'관리자',content:post.reply,createdAt:post.repliedAt || post.createdAt,isAdmin:true}] : [];
  if (source.length > 200) throw new Error('답글 데이터가 너무 많습니다.');
  return source.map(reply => {
    if (typeof reply.id !== 'string' || !/^[A-Za-z0-9-]{8,100}$/.test(reply.id)) throw new Error('답글 번호가 올바르지 않습니다.');
    if (typeof reply.createdAt !== 'string' || Number.isNaN(Date.parse(reply.createdAt))) throw new Error('답글 작성일이 올바르지 않습니다.');
    const isAdmin = reply.isAdmin === true;
    const author = isAdmin ? '관리자' : clean(reply.author) || '익명';
    const content = clean(reply.content);
    if (author.length > 30 || !content || content.length > 1000) throw new Error('답글 내용이 올바르지 않습니다.');
    return { id:reply.id, author, content, createdAt:reply.createdAt, isAdmin, canSelfDelete:reply.canSelfDelete === true };
  });
}

export function validateVocList(value) {
  if (!Array.isArray(value) || value.length > 500) throw new Error('VoC 데이터 형식이 올바르지 않습니다.');
  return value.map(post => {
    if (typeof post.id !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(post.id)) throw new Error('VoC 번호가 올바르지 않습니다.');
    if (typeof post.createdAt !== 'string' || Number.isNaN(Date.parse(post.createdAt))) throw new Error('VoC 작성일이 올바르지 않습니다.');
    const validated = validateVocDraft({...post,postPassword:'view'});
    const {postPassword:_,...content} = validated;
    const replies = validateReplies(post);
    return {...content,id:post.id,createdAt:post.createdAt,replies,status:replies.length?`답글 ${replies.length}개`:'접수',canSelfDelete:post.canSelfDelete === true,hasPhoto:Boolean(post.hasPhoto),photo:validatePhotoPayload(post.photo)};
  });
}

export function formatVocDate(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(value));
}
