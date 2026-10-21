#!/usr/bin/env node
// NASA 일사량(data/psh.json)을 기상청 ASOS 실측 비율로 보정한다.
//
//   node scripts/correct-psh.mjs     # build-psh.mjs → compare-asos.mjs 다음에
//
// 지점 비율 = ASOS 2001~2025 평균 ÷ 그 지점 시군구의 NASA 값(유효 10년 이상 지점만).
// 시군구 보정 계수 = 가까운 3개 지점 비율의 거리 역제곱 가중 평균. 월별 12개 값에 같은 계수를 곱한다.
// 원본 NASA 값은 nasa: { annual, monthly } 로 남겨 두므로 몇 번 돌려도 결과가 같다.

import { readFileSync, writeFileSync } from 'node:fs';

const PSH = new URL('../data/psh.json', import.meta.url);
const ASOS = new URL('../data/asos-ground.json', import.meta.url);
const NEAREST = 3;
const MIN_YEARS = 10;

const psh = JSON.parse(readFileSync(PSH, 'utf8'));
const asos = JSON.parse(readFileSync(ASOS, 'utf8'));
const raw = (r) => r.nasa ?? { annual: r.annual, monthly: r.monthly };

const rad = (d) => (d * Math.PI) / 180;
function km(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// 지점 위치는 지점이 속한 시군구의 대표 좌표로 본다(격자가 100km라 충분)
const stations = asos.rows.filter((s) => s.years >= MIN_YEARS).map((s) => {
  const r = psh.regions[s.region];
  return { name: s.name, stn: s.stn, lat: r.lat, lon: r.lon, ratio: s.ground / raw(r).annual };
});

const round2 = (x) => Math.round(x * 100) / 100;
const factors = [];
for (const [name, r] of Object.entries(psh.regions)) {
  const nasa = raw(r);
  const near = stations.map((s) => ({ ...s, d: km(r, s) })).sort((a, b) => a.d - b.d).slice(0, NEAREST);
  const exact = near.find((s) => s.d < 0.5);
  const factor = exact ? exact.ratio
    : near.reduce((s, x) => s + x.ratio / x.d ** 2, 0) / near.reduce((s, x) => s + 1 / x.d ** 2, 0);
  r.nasa = nasa;
  r.annual = round2(nasa.annual * factor);
  r.monthly = nasa.monthly.map((v) => round2(v * factor));
  r.correction = { factor: +factor.toFixed(3), stations: near.map((s) => s.name) };
  factors.push(factor);
}

psh.meta.correction = {
  method: `기상청 ASOS 실측 비율 보정 — 가까운 ${NEAREST}개 지점(유효 ${MIN_YEARS}년 이상, ${stations.length}곳)의 실측÷NASA 비율을 거리 역제곱 가중 평균해 월별 값에 곱함`,
  ground: `${asos.meta.source} ${asos.meta.period} (받은 날 ${asos.meta.fetchedAt})`,
  appliedAt: new Date().toISOString().slice(0, 10),
  factorRange: [Math.min(...factors), Math.max(...factors)].map((x) => +x.toFixed(3)),
};
psh.meta.distinctCells = new Set(Object.values(psh.regions).map((r) => r.monthly.join())).size;

// build-psh.mjs와 같은 형식(지역 하나당 한 줄)
const lines = Object.entries(psh.regions).map(([n, r]) => `  ${JSON.stringify(n)}: ${JSON.stringify(r)}`);
writeFileSync(PSH, `{\n "meta": ${JSON.stringify(psh.meta, null, 2).replace(/\n/g, '\n ')},\n "regions": {\n${lines.join(',\n')}\n }\n}\n`);

const annuals = Object.values(psh.regions).map((r) => r.annual);
console.log(`보정 계수 ${psh.meta.correction.factorRange.join('~')} · 연평균 ${Math.min(...annuals)}–${Math.max(...annuals)} kWh/m²/일 · 서로 다른 값 ${psh.meta.distinctCells}개`);
for (const n of ['서울 종로구', '경기 수원시 권선구', '부산 중구', '대전 유성구', '강원 강릉시', '제주 제주시']) {
  const r = psh.regions[n];
  console.log(`  ${n}: NASA ${r.nasa.annual} → ${r.annual} (×${r.correction.factor}, ${r.correction.stations.join('·')})`);
}
