# 데이터 출처 기록

외부에서 받은 데이터는 전부 여기에 남긴다 — 어디서, 언제, 어떤 조건으로 받았고 어느 파일이 됐는지. 데이터를 새로 받거나 갱신하면 이 파일부터 고친다. API 키는 적지 않는다(`.env.local`, git 무시).

## 사이트가 쓰는 데이터

| 산출물 | 원천 | 받은 날 | 조건·버전 | 만든 스크립트 |
|---|---|---|---|---|
| `data/psh.json` 일사량 | NASA POWER Climatology API `https://power.larc.nasa.gov/api/temporal/climatology/point` | 2026-10-21 | API v2.10.1, `parameters=ALLSKY_SFC_SW_DWN`, `community=RE`(kWh/m²/일), 출처 데이터 CERES SYN1deg(1°), 기간 2001-01~2025-12(응답 header.range), 시군구 대표 좌표 256개 | `scripts/build-psh.mjs` (meta에 기간·버전·생성일) |
| `data/regions.json` 시군구 대표 좌표 | vuski/admdongkor 행정동 경계 `https://raw.githubusercontent.com/vuski/admdongkor/master/ver20261001/HangJeongDong_ver20261001.geojson` | 2026-10-21 | ver20261001(2026-10-01 행정구역, 3,559개 행정동 → 256개 시군구), 34.6MB. 원본 GeoJSON은 저장소에 넣지 않음 | `scripts/build-regions.mjs` (meta에 파일명·기준일) |
| `data/psh.json` 보정(annual·monthly) | 위 NASA 값 × 기상청 ASOS 실측 비율(아래 `data/asos-ground.json`) | 2026-10-21 적용 | 가까운 3개 지점(유효 10년 이상 22곳) 실측÷NASA 비율의 거리 역제곱 가중, 계수 0.917~1.047. 보정 전 값은 각 항목 `nasa`, 방법은 meta.correction | `scripts/correct-psh.mjs` |
| 요금·세금·보조금 상수 `src/constants.js` | 아래 "상수 근거" | 2026-10-21 확인 | — | 손으로 입력 |

## 검증에 쓴 데이터

| 산출물 | 원천 | 받은 날 | 조건 | 스크립트 |
|---|---|---|---|---|
| `data/asos-ground.json` 지상 일사량 | 공공데이터포털 「기상청_지상(종관, ASOS) 일자료 조회서비스」 `https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList` | 2026-10-21 | `dataCd=ASOS&dateCd=DAY`, 25개 지점 × 2001~2025년, 필드 `sumGsr`(MJ/m²/일). 원 응답(지점·연도별 625개)은 `scripts/.cache/asos/`에만 두고 커밋하지 않음 | `scripts/compare-asos.mjs` |
| NASA POWER 월별(2001~2008) | NASA POWER Monthly API `https://power.larc.nasa.gov/api/temporal/monthly/point` | 2026-10-21 | `ALLSKY_SFC_SW_DWN`, `community=RE`, 16개 지점 좌표(기상청 지점 근사값) | `scripts/compare-ground.mjs` |
| KIER 지상 실측(표 값, 스크립트에 직접 입력) | 조덕기·강용혁, 「국내 태양광자원의 경년변화」, 한국태양에너지학회 논문집 30(2), 2010, 표 4 — `https://koreascience.or.kr/article/JAKO201027463259243.pdf` | 2026-10-21 | 16개 지점 2000~2008년 평균 열 | `scripts/compare-ground.mjs` |

## 상수 근거 (`src/constants.js`)

| 값 | 출처 | 확인한 날 |
|---|---|---|
| 누진 단가 120.0/214.6/307.3원, 기본요금 910/1,600/7,300원, 여름 구간 300/450 | 한전 주택용 저압 요금표(설계 문서 인용: 파이낸셜뉴스 2026-07-21), 2026년 3분기 동결(쿠키뉴스 2026-06) | 2026-10-21 |
| 기후환경 9원·연료비조정 +5원/kWh | 한전 공시(연료비조정은 상한 +5원 유지 보도) | 2026-10-21 |
| 전력산업기반기금 2.7%(3.7% → 3.2% 2024-07 → 2.7% 2025-07) | 헤럴드경제 2025-12-22 등 보도 | 2026-10-21 |
| 보조금 kW당 55만 원, 세대당 3kW | 2026 주택지원 사례(3kW 국비 165만 원), 지원범위 3kW 이하/세대(2020 보도). 공고 원문 미확인 | 2026-10-21 |
| 방향·그늘 계수 | 설계 문서 3.3(pvlib 시뮬레이션, 사용자 작성) | — |

## 글꼴·아이콘 (저장소에 포함)

| 파일 | 원천 | 받은 날 | 라이선스 |
|---|---|---|---|
| `src/fonts/suit/SUIT-Variable.woff2` | `https://raw.githubusercontent.com/sun-typeface/SUIT/main/fonts/variable/woff2/SUIT-Variable.woff2` | 2026-10-21 | SIL OFL 1.1 |
| `src/fonts/barlow-condensed/*latin-{500,600}*.woff2` | npm `@fontsource/barlow-condensed@5.3.0` | 2026-10-21 | SIL OFL 1.1 |
| `src/icons/index.js`(search·chevron-right·triangle-alert 경로) | `https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/*.svg` | 2026-10-21 | ISC |
