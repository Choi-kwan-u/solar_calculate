#!/usr/bin/env node
// NASA POWER 일사량을 국내 지상 실측과 비교한다.
//
//   node scripts/compare-ground.mjs
//
// 지상값: 조덕기·강용혁, 「국내 태양광자원의 경년변화」, 한국태양에너지학회 논문집 30(2), 2010, 표 4.
//   한국에너지기술연구원(KIER)이 기상청 16개 지점 수평면 전일사량을 모은 연평균(kWh/m²/일).
//   2000~2008년 평균 열을 쓴다.
// NASA: 같은 지점 좌표에서 POWER 월별 자료 2001~2008 연평균(기간을 맞춘 값)과,
//   사이트가 실제로 보여 주는 값(psh.json, 2001~2025 기후값)을 같이 본다.
// 좌표는 기상청 지점 위치 근사값이다. POWER 격자가 1°라 수 km 차이는 결과를 바꾸지 않는다.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// [지점, 위도, 경도, KIER 2000~2008 평균, 사이트에서 이 지점이 속한 시군구]
const SITES = [
  ['춘천', 37.9026, 127.7357, 3.66, '강원 춘천시'],
  ['강릉', 37.7515, 128.8910, 3.57, '강원 강릉시'],
  ['서울', 37.5714, 126.9658, 3.30, '서울 종로구'],
  ['원주', 37.3376, 127.9466, 3.66, '강원 원주시'],
  ['서산', 36.7766, 126.4939, 3.78, '충남 서산시'],
  ['청주', 36.6392, 127.4407, 3.74, '충북 청주시 흥덕구'],
  ['대전', 36.3720, 127.3721, 3.82, '대전 유성구'],
  ['포항', 36.0320, 129.3800, 3.81, '경북 포항시 북구'],
  ['대구', 35.8780, 128.6530, 3.74, '대구 동구'],
  ['전주', 35.8408, 127.1172, 3.63, '전북 전주시 완산구'],
  ['광주', 35.1729, 126.8916, 3.84, '전남광주 북구'],
  ['부산', 35.1047, 129.0320, 3.88, '부산 중구'],
  ['목포', 34.8169, 126.3812, 3.96, '전남광주 목포시'],
  ['제주', 33.5141, 126.5297, 3.64, '제주 제주시'],
  ['진주', 35.1638, 128.0400, 3.87, '경남 진주시'],
  ['영주', 36.8718, 128.5170, 3.42, '경북 영주시'],
];

const API = 'https://power.larc.nasa.gov/api/temporal/monthly/point';
const CACHE = new URL('./.cache/power-monthly/', import.meta.url);
const { regions } = JSON.parse(readFileSync(new URL('../data/psh.json', import.meta.url), 'utf8'));

async function nasaMean(lat, lon, start, end) {
  const file = new URL(`${lat}_${lon}_${start}-${end}.json`, CACHE);
  let json;
  if (existsSync(file)) json = JSON.parse(readFileSync(file, 'utf8'));
  else {
    const url = `${API}?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${lon}&latitude=${lat}&start=${start}&end=${end}&format=JSON`;
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`${lat},${lon}: HTTP ${res.status}`);
    json = await res.json();
    writeFileSync(file, JSON.stringify(json));
  }
  // 'YYYY13'이 그해 연평균
  const v = json.properties.parameter.ALLSKY_SFC_SW_DWN;
  const annual = Object.entries(v).filter(([k, x]) => k.endsWith('13') && x > 0).map(([, x]) => x);
  if (annual.length !== end - start + 1) throw new Error(`${lat},${lon}: 연평균 ${annual.length}개`);
  return annual.reduce((a, b) => a + b, 0) / annual.length;
}

mkdirSync(CACHE, { recursive: true });
const rows = [];
for (const [name, lat, lon, ground, region] of SITES) {
  const nasa = await nasaMean(lat, lon, 2001, 2008);
  rows.push({ name, ground, nasa, site: regions[region].annual });
}

const pct = (r) => `${r >= 1 ? '+' : ''}${((r - 1) * 100).toFixed(0)}%`;
const f2 = (x) => x.toFixed(2);
console.log('지점   KIER 00-08   NASA 01-08   차이    사이트(01-25)   차이');
for (const r of rows) {
  console.log(`${r.name.padEnd(4, '　')}  ${f2(r.ground)}         ${f2(r.nasa)}        ${pct(r.nasa / r.ground).padStart(4)}    ${f2(r.site)}           ${pct(r.site / r.ground).padStart(4)}`);
}
const mean = (k) => rows.reduce((s, r) => s + r[k] / r.ground, 0) / rows.length;
console.log(`평균 비율: NASA 01-08 ${pct(mean('nasa'))} · 사이트 값 ${pct(mean('site'))} (KIER 2000~2008 대비)`);
