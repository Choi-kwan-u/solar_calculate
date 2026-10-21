import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horizonModel, splitMonths, YEARS } from '../src/chart.js';
import { breakEven } from '../src/format.js';

test('지평선 차트: 해는 누적 절감(중앙)이 설치비와 만나는 해', () => {
  const m = horizonModel({ cost: 5_250_000, yearly: [500_000, 630_000, 800_000] });
  assert.ok(Math.abs(m.sunYears - 5_250_000 / 630_000) < 1e-9);
  assert.equal(m.sunInRange, true);
  assert.ok(m.yMax >= 800_000 * YEARS); // 높음 시나리오 끝까지 띠가 들어간다
});

test('지평선 차트: 25년 안에 못 넘으면 해 없음, 비용 0이면 원점', () => {
  assert.equal(horizonModel({ cost: 9_000_000, yearly: [200_000, 300_000, 400_000] }).sunInRange, false);
  assert.equal(horizonModel({ cost: 1, yearly: [0, 0, 0] }).sunYears, Infinity);
  assert.equal(horizonModel({ cost: 0, yearly: [1, 1, 1] }).sunYears, 0);
});

test('월별 막대: 사용량을 넘는 윗부분만 이월 잉여', () => {
  assert.deepEqual(splitMonths([200, 400], 300), [{ used: 200, extra: 0 }, { used: 300, extra: 100 }]);
  assert.deepEqual(splitMonths([200], null), [{ used: 200, extra: 0 }]);
});

test('손익분기 문구: 범위가 먼저 — "약 7~12년이면 본전"', () => {
  const be = breakEven([7.2 * 365, 12.4 * 365], 9.1 * 365);
  assert.equal(be.main, '약 7~12년이면 본전');
  assert.equal(be.range, '약 7~12년');
  assert.equal(breakEven([7 * 365, 7.3 * 365], 7.1 * 365).main, '약 7년이면 본전');
});
