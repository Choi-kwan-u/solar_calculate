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

## 설계 문서와 다른 점

| 항목 | 설계 문서 | 구현 | 이유 |
|---|---|---|---|
| 세금 계수 | `1.10 × 1.037` | `1 + 0.10 + 0.027` = 1.127 | 부가세와 전력산업기반기금은 둘 다 전기요금계에 붙으니 곱이 아니라 합. 기금 요율도 3.7% → 3.2%(2024-07) → 2.7%로 내려감(2025-12 보도 기준) |
| 보조금 | kW당 금액 × 전체 용량 | 가구당 3kW까지(`subsidyMaxKw`) | 주택지원사업 태양광의 가구당 지원 한도. 공고 원문 확인 필요 |
| NASA POWER | 2001–2020, 0.5° 격자 | 2001–2025(25년), 약 1° 격자(CERES SYN1deg) | 2026-10 API 응답 기준. 256개 시군구가 20개 값으로 나뉘고 연평균은 3.75–4.06 kWh/m²/일 — 지역 차이가 ±4% 정도로 작다 |
| 시군구 | 약 250곳 | 2026-10-01 행정동 경계 기준 256곳 | 전남광주통합특별시(2026-07), 인천 제물포·영종·검단·서해구, 화성·부천 일반구 반영. 옛 이름(광주 북구, 전남 순천, 인천 서구, 강원도 …)으로도 검색된다. 통합특별시 공식 약칭이 확정 전이라 화면엔 "전남광주" |
| psh.json 형식 | `{ 이름: {...} }` | `{ meta, regions: { 이름: {...} } }` | 출처·기간·생성일을 같이 들고 있어야 화면에 근거를 보여 줄 수 있다 |
| 결과 숫자 색(라이트 모드) | `#E8A317` | `#B07400` | 흰 바탕에서 `#E8A317` 글자는 대비 2.2:1. 같은 색조를 진하게 해 3.9:1. 슬라이더·막대·다크 모드는 원래 색 |
| 성능비 편집 | 세 값 | 중앙값만 편집, 낮음·높음은 ±0.05 | 칸 하나로 범위까지 따라오게 |
| 문구 | "지역을 먼저 골라줘" | "지역을 먼저 골라 주세요" | 나머지 화면 문구(해요체)와 맞춤 |

`tests/calc.test.js`는 설계 문서 3.1·3.2 표를 **문서 작성 당시 상수**(세금 1.1407, 보조금 한도 없음)로 그대로 검산한다 — 식이 문서와 같다는 확인이다. 사이트가 실제로 쓰는 상수는 따로 불변식(세금은 합, 보조금 3kW, 요금↔사용량 왕복, 시나리오 순서 등)으로 검사한다.

## 배포

`npm run build` 후 `dist/`를 GitHub Pages·Cloudflare Pages·Vercel 어디든 그대로 올리면 된다(`base: './'`라 하위 경로도 동작). GitHub Pages는 공개 저장소이거나 유료 플랜이어야 한다.

## 출처·라이선스

- 일사량: [NASA POWER](https://power.larc.nasa.gov/) Climatology API (`ALLSKY_SFC_SW_DWN`, community=RE)
- 행정구역 경계: [vuski/admdongkor](https://github.com/vuski/admdongkor)
- 요금: 한전 주택용 저압 요금표(2026-07)
- 글꼴: [Pretendard](https://github.com/orioncactus/pretendard) — SIL Open Font License 1.1 (`src/fonts/pretendard/LICENSE.txt`)
