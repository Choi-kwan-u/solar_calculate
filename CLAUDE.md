# ckw4_solar — 태양광 손익분기 계산기

정적 사이트(Vite 8 + 바닐라 JS, 백엔드 없음). 설계는 docs/DESIGN.md, 일사량 검증은 docs/VALIDATION.md, 데이터 갱신 방법은 README.md.

## 명령
- `npm test` — node:test, 커밋 전에 항상
- `npm run build` / `npm run preview`
- 데이터 갱신: `npm run data:regions -- <HangJeongDong_verYYYYMMDD.geojson>` → `npm run data:psh`

## 지킬 것
- 계산은 src/calc.js 순수 함수만. 상수는 전부 src/constants.js(화면 "계산 근거"에 노출됨).
- docs/DESIGN.md(v2.1)와 코드는 같은 숫자를 말해야 한다. 3.1·3.2 검산표는 tests/calc.test.js가 실제 상수로 고정 검사한다 — 상수·식을 바꾸면 표를 다시 뽑아 문서와 테스트를 함께 고친다. 코드를 문서에 복사하지 않는다.
- 일사량은 NASA 1°(약 100km) 격자. ASOS 22개 지점 2001~2025 대비 평균 +1%, 서울 +9%(docs/VALIDATION.md). 보정 여부는 사용자 결정 대기 — 정해지기 전엔 데이터 손대지 말 것.
- 데이터 출처 기록이 원칙: 외부 데이터를 받거나 갱신하면 data/SOURCES.md와 산출물 meta에 출처·조건·받은 날짜를 남긴다. API 키는 .env.local(git 무시)에만.
- 외부 요청 0: 폰트는 src/fonts에 자체 호스팅, 일사량은 빌드 때 data/psh.json으로 박는다. CDN·런타임 API 추가 금지.
- 시각 기준은 docs/VISUAL.md(해 질 녘). 다크 모드 노을 띠(페이지 맨 아래 400px) 위엔 본문색 글씨만 — 코랄 글씨 금지(2.0:1). 그래서 하늘은 화면 고정이 아니라 페이지에 붙어 있다. 카드는 입력 패널 하나뿐. UI 문구는 해요체, 돈은 '수익'이 아니라 '절감액'.

## 저장소·배포
- github.com/Choi-kwan-u/solar_calculate (개인 계정, 공개). 나중에 회사 org(github.com/speech-tools-kr)로 옮길 예정. 로컬 폴더 이름은 ckw4_solar.
- main에 push하면 .github/workflows/pages.yml이 테스트 → 빌드 → GitHub Pages 배포. 주소 https://choi-kwan-u.github.io/solar_calculate/ (도메인은 사용자가 나중에 직접 붙임).
