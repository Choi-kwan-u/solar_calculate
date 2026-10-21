#!/usr/bin/env node
// 행정동 경계 GeoJSON → 시군구 대표 좌표 data/regions.json
//
//   node scripts/build-regions.mjs <HangJeongDong_verYYYYMMDD.geojson>
//
// 원본: https://github.com/vuski/admdongkor (전국 행정동 경계, 분기마다 갱신)
// 대표 좌표 = 시군구에 속한 행정동 폴리곤 전체의 면적 중심. 섬 지역처럼 중심이 바다에
// 떨어지면 가장 큰 폴리곤 안쪽 점으로 옮긴다. 일사량 격자가 1°(약 100km)라 좌표가
// 수 km 어긋나도 결과는 같다 — 정밀도보다 "그 지역 안의 점"이면 충분하다.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const OUT = new URL('../data/regions.json', import.meta.url);

const SIDO_SHORT = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천',
  광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종',
  경기도: '경기', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남',
  전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남',
  제주특별자치도: '제주',
  // 2026-07-01 광주광역시 + 전라남도 통합. 공식 약칭이 확정되지 않아 두 이름을 이어 쓴다.
  전남광주통합특별시: '전남광주',
};

// 검색 전용 옛 이름 — 최근 개편으로 이름이 바뀐 곳만. 사람들은 한동안 옛 이름으로 찾는다.
const FORMER_SIDO = {
  강원특별자치도: ['강원도'],
  전북특별자치도: ['전라북도'],
};
const FORMER_NAMES = {
  '인천 제물포구': ['인천 중구', '인천 동구'],      // 2026-07 중구 내륙 + 동구
  '인천 영종구': ['인천 중구', '영종도'],           // 2026-07 중구 영종·용유
  '인천 검단구': ['인천 서구'],                     // 2026-07 서구에서 분리
  '인천 서해구': ['인천 서구'],                     // 검단 분리 후 남은 서구
  '대구 군위군': ['경북 군위군', '경상북도 군위군'], // 2023-07 경북 → 대구
};

// 경도 1°의 실거리는 위도에 따라 줄어든다. 한반도 중위도(36°) 값으로 x를 펴서 면적을 잰다.
const K = Math.cos((36 * Math.PI) / 180);

/** 링의 부호 있는 면적과 면적 중심 */
function ringStats(r) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i];
    const [x1, y1] = r[(i + 1) % r.length];
    const f = x0 * K * y1 - x1 * K * y0;
    a += f;
    cx += (x0 + x1) * K * f;
    cy += (y0 + y1) * f;
  }
  if (a === 0) return { area: 0, x: 0, y: 0 };
  return { area: Math.abs(a / 2), x: cx / (3 * a) / K, y: cy / (3 * a) };
}

/** 폴리곤(외곽 링 + 구멍들)의 면적과 중심 */
function polygonStats(rings) {
  let area = 0, sx = 0, sy = 0;
  rings.forEach((r, i) => {
    const s = ringStats(r);
    const w = i === 0 ? s.area : -s.area;
    area += w; sx += w * s.x; sy += w * s.y;
  });
  return { area, x: sx / area, y: sy / area };
}

/** 짝홀 규칙 — 구멍 링까지 한 번에 처리된다 */
function insidePolygon([x, y], rings) {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** 폴리곤 안쪽이 보장되는 점: 중심 위도의 가로선이 폴리곤을 지나는 가장 긴 구간의 가운데 */
function interiorPoint(rings, y) {
  const xs = [];
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y)) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
    }
  }
  xs.sort((a, b) => a - b);
  let best = null;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
  }
  return best ? [(best[0] + best[1]) / 2, y] : null;
}

/** '수원시장안구' → '수원시 장안구' (일반구가 있는 시) */
const splitGu = (sggnm) => sggnm.replace(/^(.+시)(.+구)$/, '$1 $2');

function names(sidonm, sggnm) {
  const short = SIDO_SHORT[sidonm];
  if (!short) throw new Error(`모르는 시도: ${sidonm} — SIDO_SHORT에 추가할 것`);
  const sgg = splitGu(sggnm);
  if (short === '세종') return { name: '세종', aliases: ['세종특별자치시', '세종시'] };

  const name = `${short} ${sgg}`;
  const aliases = [`${sidonm} ${sgg}`, ...(FORMER_SIDO[sidonm] ?? []).map((s) => `${s} ${sgg}`)];
  if (short === '전남광주') {
    // 옛 광주광역시는 자치구, 옛 전라남도는 시·군뿐이라 접미사로 갈린다
    const old = sgg.endsWith('구') ? ['광주', '광주광역시'] : ['전남', '전라남도'];
    aliases.push(...old.map((s) => `${s} ${sgg}`));
  }
  aliases.push(...(FORMER_NAMES[name] ?? []));
  return { name, aliases };
}

const src = process.argv[2];
if (!src) {
  console.error('사용법: node scripts/build-regions.mjs <HangJeongDong_verYYYYMMDD.geojson>');
  process.exit(1);
}
const geo = JSON.parse(readFileSync(src, 'utf8'));

const groups = new Map();
for (const f of geo.features) {
  const p = f.properties;
  const g = groups.get(p.sgg) ?? { code: p.sgg, sidonm: p.sidonm, sggnm: p.sggnm, polygons: [] };
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  g.polygons.push(...polys);
  groups.set(p.sgg, g);
}

const moved = [];
const regions = [...groups.values()]
  .sort((a, b) => a.code.localeCompare(b.code))
  .map((g) => {
    const stats = g.polygons.map(polygonStats);
    const total = stats.reduce((s, p) => s + p.area, 0);
    let pt = [
      stats.reduce((s, p) => s + p.area * p.x, 0) / total,
      stats.reduce((s, p) => s + p.area * p.y, 0) / total,
    ];
    const { name, aliases } = names(g.sidonm, g.sggnm);
    if (!g.polygons.some((rings) => insidePolygon(pt, rings))) {
      const big = stats.indexOf(stats.reduce((a, b) => (b.area > a.area ? b : a)));
      pt = interiorPoint(g.polygons[big], stats[big].y) ?? [stats[big].x, stats[big].y];
      moved.push(name);
    }
    return {
      code: g.code,
      name,
      lat: +pt[1].toFixed(4),
      lon: +pt[0].toFixed(4),
      aliases: [...new Set(aliases)].filter((a) => a !== name),
    };
  });

const dup = regions.map((r) => r.name).filter((n, i, a) => a.indexOf(n) !== i);
if (dup.length) throw new Error(`이름 중복: ${dup.join(', ')}`);

const ver = basename(src).match(/ver(\d{4})(\d{2})(\d{2})/);
const meta = {
  source: 'vuski/admdongkor 행정동 경계',
  file: basename(src),
  asOf: ver ? `${ver[1]}-${ver[2]}-${ver[3]}` : null,
  method: '행정동 폴리곤 면적 중심(밖이면 가장 큰 폴리곤 안쪽 점)',
  count: regions.length,
};
writeFileSync(OUT, JSON.stringify({ meta, regions }, null, 1) + '\n');
console.log(`${regions.length}개 시군구 → ${OUT.pathname}`);
if (moved.length) console.log(`중심이 바깥이라 안쪽 점으로 옮김 (${moved.length}): ${moved.join(', ')}`);
