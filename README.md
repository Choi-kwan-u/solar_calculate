# 태양광 손익분기 계산기

지역·패널 개수·1장 가격·월 전기요금을 넣으면 발전량(kWh), 전기요금 절감액(원), 손익분기 기간(범위)을 바로 보여 주는 정적 웹사이트. 백엔드도 외부 요청도 없다 — 빌드 결과 `dist/`를 아무 정적 호스팅에 올리면 된다.

설계 원문: [docs/DESIGN.md](docs/DESIGN.md)

## 실행

```bash
npm install
npm run dev       # 개발 서버
npm test          # 계산·검색·데이터 테스트 (node:test, 추가 의존성 없음)
npm run build     # dist/ 생성
npm run preview   # dist/ 미리보기
```

Node 22.12 이상(Vite 8).

## 구조

```
index.html
src/
  main.js         입력 바인딩·렌더
  calc.js         계산(순수 함수) — 누진제, 요금→사용량 역산, 상계 시뮬레이션, 세 시나리오
  constants.js    상수 전부 — 화면 "계산 근거"에 그대로 노출
  search.js       시군구 자동완성(초성·조합 중인 글자·옛 이름)
  chart.js        월별 막대 SVG
  format.js       숫자 표기(유효숫자, 만 원 단위)
  fonts/pretendard/   Pretendard 가변 폰트 자체 호스팅(쓰는 글자 조각만 내려받음)
data/
  regions.json    시군구 256곳 대표 좌표 — build-regions 산출물
  psh.json        시군구별 월별·연평균 일사량 — build-psh 산출물, 사이트가 읽는 파일
scripts/
  build-regions.mjs   행정동 경계 GeoJSON → regions.json
  build-psh.mjs       NASA POWER 256회 호출 → psh.json
  compare-ground.mjs  NASA 값 vs 지상 실측 대조 (docs/VALIDATION.md)
tests/
```

## 데이터 다시 만들기

행정구역이 바뀌었을 때(분기마다 확인):

```bash
# 1) https://github.com/vuski/admdongkor 에서 최신 HangJeongDong_verYYYYMMDD.geojson 받기
npm run data:regions -- /경로/HangJeongDong_verYYYYMMDD.geojson
# 2) 일사량 — 좌표가 그대로인 곳은 scripts/.cache/ 응답을 재사용
npm run data:psh
```

모르는 시도 이름이 나오면 `build-regions.mjs`가 멈추고 `SIDO_SHORT`에 약칭을 넣으라고 알려 준다. 요금이 바뀌면 `src/constants.js`의 `TARIFF`만 고치면 된다.

## 설계 문서와 검증

- [docs/DESIGN.md](docs/DESIGN.md) — 설계(v2.1). 3.1·3.2 검산표는 `tests/calc.test.js`가 그대로 검사하므로, 상수나 식을 바꾸면 표를 다시 뽑아 문서와 테스트를 같이 고친다.
- [docs/VALIDATION.md](docs/VALIDATION.md) — NASA 일사량 vs 지상 실측. 같은 기간 평균 +4%, 서울 +16%. 보정은 ASOS 2001~2025 대조 후 결정.

## 배포

`main`에 push하면 `.github/workflows/pages.yml`이 테스트 → 빌드 → GitHub Pages 배포까지 한다 — https://choi-kwan-u.github.io/solar_calculate/ . 저장소 Settings → Pages → Source가 "GitHub Actions"여야 한다. 도메인을 붙이려면 Settings → Pages → Custom domain.

다른 곳에 올릴 땐 `npm run build` 후 `dist/`를 Cloudflare Pages·Vercel 등에 그대로 올리면 된다(`base: './'`라 하위 경로도 동작).

## 출처·라이선스

- 일사량: [NASA POWER](https://power.larc.nasa.gov/) Climatology API (`ALLSKY_SFC_SW_DWN`, community=RE)
- 행정구역 경계: [vuski/admdongkor](https://github.com/vuski/admdongkor)
- 요금: 한전 주택용 저압 요금표(2026-07)
- 글꼴: [Pretendard](https://github.com/orioncactus/pretendard) — SIL Open Font License 1.1 (`src/fonts/pretendard/LICENSE.txt`)
