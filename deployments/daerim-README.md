# 대림 · 오늘의 식탁

서비스: https://rnk2026.github.io/daerim/

이 저장소는 배포 설정만 관리합니다. 공통 코드와 대림 설정의 원본은 [RnK2026/menu](https://github.com/RnK2026/menu)입니다.

- 공유 기능 수정: 원본의 `app.js`, `core.js`, `index.html`, `style.css`
- 대림 전용 기능: 원본의 `services/daerim/extension.js`
- 대림 API 주소: 원본의 `services/daerim/config.json`
- 대림 정적 메뉴: 원본의 `services/daerim/menu.json`
- 저장 서버 설치: 원본 README의 대림 저장 서버 연결 안내

Actions가 15분 간격으로 공통 소스의 변경을 확인하고 새 커밋이 있을 때만 테스트·배포합니다. 예약 실행은 GitHub 상황에 따라 지연될 수 있습니다. 즉시 배포하려면 Actions → Deploy Daerim from shared source → Run workflow를 실행하세요.

원본 저장소의 최신 main을 사용하며, 식단 데이터는 기존 RnK와 별도 Apps Script 프로젝트에 저장합니다. 이 저장소에 기능 코드를 복사해 수정하지 마세요.
