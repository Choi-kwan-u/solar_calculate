#!/usr/bin/env node
// 기상청 ASOS 지상 관측 일사량(2001~2025)과 사이트 값(NASA POWER 2001~2025 기후값)을 같은 기간끼리 비교한다.
//
//   node scripts/compare-asos.mjs        # .env.local 의 DATA_GO_KR_KEY 사용(저장소에 올리지 않는다)
//
// 출처: 공공데이터포털 「기상청_지상(종관, ASOS) 일자료 조회서비스」
//   https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList
//   필드 sumGsr = 합계 일사량(MJ/m²/일) → ÷3.6 = kWh/m²/일
// 응답은 scripts/.cache/asos/ 에 캐시. 결과는 data/asos-ground.json (meta에 조회 조건·날짜).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const API = 'https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList';
const YEARS = [2001, 2025];
const MIN_DAYS = 300;          // 한 해 유효 일수가 이보다 적으면 그해는 뺀다
const CONCURRENCY = 4;
const CACHE = new URL('./.cache/asos/', import.meta.url);
const OUT = new URL('../data/asos-ground.json', import.meta.url);

// [지점번호, 지점명, 사이트에서 이 지점이 속한 시군구]
const STATIONS = [
  [101, '춘천', '강원 춘천시'], [105, '강릉', '강원 강릉시'], [108, '서울', '서울 종로구'],
  [112, '인천', '인천 제물포구'], [114, '원주', '강원 원주시'], [119, '수원', '경기 수원시 권선구'],
  [129, '서산', '충남 서산시'], [131, '청주', '충북 청주시 흥덕구'], [133, '대전', '대전 유성구'],
  [135, '추풍령', '충북 영동군'], [136, '안동', '경북 안동시'], [138, '포항', '경북 포항시 북구'],
  [143, '대구', '대구 동구'], [146, '전주', '전북 전주시 덕진구'], [152, '울산', '울산 중구'],
  [155, '창원', '경남 창원시 성산구'], [156, '광주', '전남광주 북구'], [159, '부산', '부산 중구'],
  [165, '목포', '전남광주 목포시'], [168, '여수', '전남광주 여수시'], [177, '홍성', '충남 홍성군'],
  [184, '제주', '제주 제주시'], [185, '고산', '제주 제주시'], [189, '서귀포', '제주 서귀포시'],
  [192, '진주', '경남 진주시'],
];

function loadKey() {
  if (process.env.DATA_GO_KR_KEY) return process.env.DATA_GO_KR_KEY;
  const file = new URL('../.env.local', import.meta.url);
  const m = existsSync(file) && readFileSync(file, 'utf8').match(/^DATA_GO_KR_KEY=(\S+)/m);
  if (!m) throw new Error('DATA_GO_KR_KEY가 없어요 — .env.local 에 DATA_GO_KR_KEY=... 로 넣으세요');
  return m[1];
}
const KEY = loadKey();

async function fetchYear(stn, year) {
  const file = new URL(`${stn}_${year}.json`, CACHE);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const last = year === new Date().getFullYear() ? null : `${year}1231`;
  const params = new URLSearchParams({
    pageNo: '1', numOfRows: '400', dataType: 'JSON', dataCd: 'ASOS', dateCd: 'DAY',
    startDt: `${year}0101`, endDt: last ?? `${year}1231`, stnIds: String(stn),
  });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${API}?serviceKey=${KEY}&${params}`, { signal: AbortSignal.timeout(60_000) });
      const text = await res.text();
      const json = JSON.parse(text);
      const code = json?.response?.header?.resultCode;
      if (code === '03') { writeFileSync(file, '[]'); return []; } // NO_DATA: 그해 관측 없음(지점 신설 전 등)
      if (code !== '00') throw new Error(`${stn} ${year}: ${code} ${json?.response?.header?.resultMsg}`);
      const items = json.response.body.items?.item ?? [];
      const days = items.map((d) => ({ tm: d.tm, gsr: d.sumGsr === '' ? null : Number(d.sumGsr) }));
      writeFileSync(file, JSON.stringify(days));
      return days;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
}

async function mapPool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
      if (++done % 50 === 0) process.stderr.write(`${done}/${items.length}\n`);
    }
  }));
  return out;
}

mkdirSync(CACHE, { recursive: true });
const { regions, meta: pshMeta } = JSON.parse(readFileSync(new URL('../data/psh.json', import.meta.url), 'utf8'));
const jobs = STATIONS.flatMap(([stn]) => Array.from({ length: YEARS[1] - YEARS[0] + 1 }, (_, i) => [stn, YEARS[0] + i]));
const results = await mapPool(jobs, CONCURRENCY, ([stn, y]) => fetchYear(stn, y));

const rows = STATIONS.map(([stn, name, region]) => {
  const years = [];
  results.forEach((days, i) => {
    if (jobs[i][0] !== stn) return;
    const valid = days.filter((d) => d.gsr != null && d.gsr >= 0);
    if (valid.length >= MIN_DAYS) years.push(valid.reduce((s, d) => s + d.gsr, 0) / valid.length / 3.6);
  });
  const ground = years.length ? years.reduce((a, b) => a + b, 0) / years.length : null;
  const site = regions[region].annual;                    // 사이트가 보여 주는 값(보정 후)
  const nasa = regions[region].nasa?.annual ?? site;      // 보정 전 NASA 값
  const r3 = (x) => ground && +(x / ground).toFixed(3);
  return { stn, name, region, years: years.length, ground: ground && +ground.toFixed(3), nasa, site, ratioNasa: r3(nasa), ratio: r3(site) };
});

const ok = rows.filter((r) => r.years >= 10);
const meanRatio = ok.reduce((s, r) => s + r.ratio, 0) / ok.length;
const meanRatioNasa = ok.reduce((s, r) => s + r.ratioNasa, 0) / ok.length;
const out = {
  meta: {
    source: '공공데이터포털 기상청_지상(종관, ASOS) 일자료 조회서비스',
    api: API,
    field: 'sumGsr (합계 일사량, MJ/m²/일) ÷ 3.6 → kWh/m²/일',
    period: `${YEARS[0]}–${YEARS[1]}`,
    method: `연도별로 유효 일수 ${MIN_DAYS}일 이상인 해만 일평균을 내고, 그 해들의 평균. 유효 연수 10년 미만 지점은 평균 비율에서 뺌`,
    compareTo: `data/psh.json (${pshMeta.source} ${pshMeta.period} 기후값) — 지점이 속한 시군구 값. nasa=보정 전, site=사이트 값(보정 후)`,
    fetchedAt: new Date().toISOString().slice(0, 10),
    stationsUsed: ok.length,
    meanRatioNasaOverGround: +meanRatioNasa.toFixed(3),
    meanRatioSiteOverGround: +meanRatio.toFixed(3),
  },
  rows,
};
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');

const pct = (r) => (r == null ? '  —' : `${r >= 1 ? '+' : ''}${((r - 1) * 100).toFixed(0)}%`);
for (const r of rows) {
  console.log(`${r.name.padEnd(4, '　')} ${String(r.years).padStart(2)}년  지상 ${r.ground?.toFixed(2) ?? ' —  '}  NASA ${r.nasa.toFixed(2)} ${pct(r.ratioNasa)}  사이트 ${r.site.toFixed(2)} ${pct(r.ratio)}`);
}
console.log(`평균: NASA ${pct(meanRatioNasa)} · 사이트 ${pct(meanRatio)} (지상 실측 대비, ${ok.length}개 지점, ${YEARS[0]}–${YEARS[1]})`);
