#!/usr/bin/env node
// data/regions.json 좌표마다 NASA POWER 기후값(월별·연평균 수평면 일사량)을 받아 data/psh.json 생성
//
//   node scripts/build-psh.mjs            # 받아 둔 응답(scripts/.cache/power/)은 재사용
//   node scripts/build-psh.mjs --refresh  # 캐시 무시하고 전부 다시 받기
//
// ALLSKY_SFC_SW_DWN(community=RE)은 kWh/m²/일 단위라 그대로 PSH(peak sun hours)다.
// 기후값은 안 바뀌므로 빌드 때 한 번 돌리고 결과를 커밋한다 — 사이트는 런타임 호출 0.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const API = 'https://power.larc.nasa.gov/api/temporal/climatology/point';
const PARAM = 'ALLSKY_SFC_SW_DWN';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const CONCURRENCY = 4; // 공용 API라 동시 요청은 적게
const CACHE = new URL('./.cache/power/', import.meta.url);
const IN = new URL('../data/regions.json', import.meta.url);
const OUT = new URL('../data/psh.json', import.meta.url);
const refresh = process.argv.includes('--refresh');

const round2 = (x) => Math.round(x * 100) / 100;

async function fetchPoint(lat, lon) {
  const file = new URL(`${lat}_${lon}.json`, CACHE);
  if (!refresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const url = `${API}?parameters=${PARAM}&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      writeFileSync(file, JSON.stringify(json));
      return json;
    } catch (e) {
      if (attempt >= 4) throw new Error(`${lat},${lon}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

function parse(json, where) {
  const v = json?.properties?.parameter?.[PARAM];
  const fill = json?.header?.fill_value ?? -999;
  const monthly = MONTHS.map((m) => v?.[m]);
  for (const x of [...monthly, v?.ANN]) {
    if (!Number.isFinite(x) || x === fill || x <= 0 || x > 10) throw new Error(`${where}: 이상값 ${x}`);
  }
  return { annual: round2(v.ANN), monthly: monthly.map(round2) };
}

async function mapPool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
      process.stdout.write(`\r${++done}/${items.length}`);
    }
  }));
  process.stdout.write('\n');
  return out;
}

const { meta: regionsMeta, regions } = JSON.parse(readFileSync(IN, 'utf8'));
mkdirSync(CACHE, { recursive: true });
const responses = await mapPool(regions, CONCURRENCY, (r) => fetchPoint(r.lat, r.lon));

const header = responses[0].header;
const ranges = new Set(responses.map((j) => j.header?.range));
if (ranges.size !== 1) throw new Error(`응답마다 기후값 기간이 다름: ${[...ranges].join(' / ')}`);
const years = header.range.match(/(\d{4})\D+(\d{4})\)?$/);

const values = responses.map((j, i) => parse(j, regions[i].name));
const cells = new Set(values.map((v) => v.monthly.join())).size;

const meta = {
  source: 'NASA POWER',
  api: `${API} (${header.api.version})`,
  dataset: header.sources.join(', '),
  parameter: PARAM,
  units: 'kWh/m²/일',
  surface: '수평면',
  period: years ? `${years[1]}–${years[2]}` : header.range,
  range: header.range,
  generatedAt: new Date().toISOString().slice(0, 10),
  regions: regionsMeta,
  distinctCells: cells,
};

// 지역 하나당 한 줄 — 다시 생성했을 때 diff가 읽히도록
const lines = regions.map((r, i) => {
  const entry = { code: r.code, lat: r.lat, lon: r.lon, ...values[i], aliases: r.aliases };
  return `  ${JSON.stringify(r.name)}: ${JSON.stringify(entry)}`;
});
const body = `{\n "meta": ${JSON.stringify(meta, null, 2).replace(/\n/g, '\n ')},\n "regions": {\n${lines.join(',\n')}\n }\n}\n`;
JSON.parse(body); // 형식 확인
writeFileSync(OUT, body);

const annuals = values.map((v) => v.annual);
console.log(`${regions.length}개 지역 → ${OUT.pathname}`);
console.log(`기간 ${meta.period} · 서로 다른 격자값 ${cells}개 · 연평균 ${Math.min(...annuals)}–${Math.max(...annuals)} kWh/m²/일`);
