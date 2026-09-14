export function initService(){
const note=document.createElement('p');note.className='notice';note.textContent='조식은 기본적으로 제공하지 않습니다(-). 특별 조식이 있는 날에는 조식 메뉴를 직접 입력하세요.';
document.querySelector('#edit-table').before(note);
}
