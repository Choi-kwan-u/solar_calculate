import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAYS } from '../src/calc.js';

const { meta, regions } = JSON.parse(readFileSync(new URL('../data/psh.json', import.meta.url), 'utf8'));
const list = Object.entries(regions);

test('psh.json: 전 지역에 월별 12개 + 연평균, 값과 좌표가 그럴듯함', () => {
  assert.equal(list.length, meta.regions.count);
  for (const [name, r] of list) {
    assert.equal(r.monthly.length, 12, name);
    for (const v of [...r.monthly, r.annual]) assert.ok(v > 0.5 && v < 8, `${name}: ${v}`);
    assert.ok(r.lat > 33 && r.lat < 39 && r.lon > 124 && r.lon < 132, `${name}: ${r.lat},${r.lon}`);
    assert.ok(Array.isArray(r.aliases), name);
  }
});

test('연평균 = 월별 값의 일수 가중 평균', () => {
  for (const [name, r] of list) {
    const weighted = r.monthly.reduce((s, v, i) => s + v * DAYS[i], 0) / 365;
    assert.ok(Math.abs(weighted - r.annual) < 0.03, `${name}: ${weighted.toFixed(3)} vs ${r.annual}`);
  }
});

test('meta에 출처·기간·단위', () => {
  assert.equal(meta.source, 'NASA POWER');
  assert.match(meta.period, /^\d{4}–\d{4}$/);
  assert.equal(meta.units, 'kWh/m²/일');
});
