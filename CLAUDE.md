# ckw4_solar — 태양광 손익분기 계산기

정적 사이트(Vite 8 + 바닐라 JS, 백엔드 없음). 설계 원문은 docs/DESIGN.md, 설계와 달라진 점·데이터 갱신 방법은 README.md.

## 명령
- `npm test` — node:test, 커밋 전에 항상
- `npm run build` / `npm run preview`
- 데이터 갱신: `npm run data:regions -- <HangJeongDong_verYYYYMMDD.geojson>` → `npm run data:psh`

## 지킬 것
- 계산은 src/calc.js 순수 함수만. 상수는 전부 src/constants.js(화면 "계산 근거"에 노출됨).
- tests/calc.test.js 위쪽의 3.1·3.2 표는 설계 문서 당시 상수(DOC 픽스처: 세금 1.1407, 보조금 한도 없음)로 고정한 식 검산이다. 식을 고쳤는데 이게 깨지면 식이 틀린 것. 사이트 상수(세금 1.127, 보조금 3kW)는 아래쪽 불변식 테스트가 맡는다.
- 외부 요청 0: 폰트는 src/fonts에 자체 호스팅, 일사량은 빌드 때 data/psh.json으로 박는다. CDN·런타임 API 추가 금지.
- 포인트 색(앰버)은 결과 숫자·슬라이더·차트 막대에만. UI 문구는 해요체, 돈은 '수익'이 아니라 '절감액'.

## 저장소·배포
- github.com/Choi-kwan-u/solar_calculate (개인 계정, 공개). 나중에 회사 org(github.com/speech-tools-kr)로 옮길 예정. 로컬 폴더 이름은 ckw4_solar.
- main에 push하면 .github/workflows/pages.yml이 테스트 → 빌드 → GitHub Pages 배포. 주소 https://choi-kwan-u.github.io/solar_calculate/ (도메인은 사용자가 나중에 직접 붙임).
