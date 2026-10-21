import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bill, calculate, energyCharge, maxUsefulPanels, usageFromBill, DAYS } from '../src/calc.js';
import { DEFAULTS, TARIFF } from '../src/constants.js';

// 설계 문서(docs/DESIGN.md) 3.1·3.2 표는 문서 작성 당시 상수로 뽑은 값이다.
// 사이트는 세금 계수(부가세+기금 = 1.127)와 보조금 3kW 한도를 고쳐 쓰므로 식 검산은 당시 상수로 한다.
const DOC = { ...DEFAULTS, subsidyMaxKw: Infinity, tariff: { ...TARIFF, taxRate: 1.10 * 1.037 } };
const SEOUL = { monthly: [2.1, 2.9, 3.8, 4.6, 5.0, 4.6, 3.6, 3.9, 3.8, 3.3, 2.4, 1.9] };
const BASE = { panelCount: 7, pricePerPanel: 750_000 };
const SOUTH = { ...BASE, orientation: 'south', shade: 'none' };

const years = (days) => Math.round((days / 365) * 10) / 10;

function summary(r) {
  const m = r.mid;
  return {
    kwh: [+m.dailyKwh.toFixed(1), Math.round(m.monthlyAvgKwh), Math.round(m.yearlyKwh)],
    won: [Math.round(m.dailyWon), Math.round(m.monthlyWon), Math.round(m.yearlyWon)],
    days: Math.round(m.breakEvenDays),
    years: [years(m.breakEvenDays), years(r.breakEvenRange[0]), years(r.breakEvenRange[1])],
  };
}

test('3.1 남향·그늘 없음, 요금 미입력(×230원)', () => {
  assert.deepEqual(summary(calculate(SOUTH, SEOUL, DOC)), {
    kwh: [9.6, 292, 3502], won: [2207, 67114, 805373], days: 2379, years: [6.5, 6.1, 7.3],
  });
});

test('3.1 남향·그늘 없음, 월 350kWh', () => {
  assert.deepEqual(summary(calculate({ ...SOUTH, monthlyUsage: 350 }, SEOUL, DOC)), {
    kwh: [9.6, 292, 3502], won: [1939, 58991, 707892], days: 2707, years: [7.4, 7.1, 8.1],
  });
});

test('3.1 위와 같음 + 보조금 kW당 55만 원', () => {
  const r = calculate({ ...SOUTH, monthlyUsage: 350, useSubsidy: true }, SEOUL, DOC);
  assert.equal(Math.round(r.mid.breakEvenDays), 1814);
  assert.deepEqual([years(r.mid.breakEvenDays), years(r.breakEvenRange[0]), years(r.breakEvenRange[1])], [5.0, 4.7, 5.4]);
});

test('3.1 방향·그늘 모름, 월 350kWh', () => {
  assert.deepEqual(summary(calculate({ ...BASE, monthlyUsage: 350 }, SEOUL, DOC)), {
    kwh: [7.5, 228, 2731], won: [1606, 48861, 586331], days: 3268, years: [9.0, 7.1, 12.3],
  });
});

test('3.1 usageFromBill(71000) = 348kWh, bill(350) = 71,510원', () => {
  assert.equal(usageFromBill(71_000, DOC.tariff), 348);
  assert.equal(Math.round(bill(350, 4, DOC.tariff)), 71_510);
});

// [월 사용량, 원래 월 요금, 연 절감액, 월평균 절감액, 손익분기(년), 매년 쌓이는 잉여, 적정 장수]
const TABLE_3_2 = [
  [150, 23_966, 275_137, 22_928, 19.1, 1702, 3],
  [250, 45_434, 512_517, 42_710, 10.2, 502, 5],
  [350, 71_510, 707_892, 58_991, 7.4, 0, 7],
  [450, 109_376, 864_510, 72_043, 6.1, 0, 7],
  [550, 146_027, 1_063_454, 88_621, 4.9, 0, 7],
];
for (const [usage, monthlyBill, yearlyWon, monthlyWon, be, surplus, panels] of TABLE_3_2) {
  test(`3.2 월 ${usage}kWh`, () => {
    const input = { ...SOUTH, monthlyUsage: usage };
    const { mid } = calculate(input, SEOUL, DOC);
    assert.deepEqual(
      [Math.round(bill(usage, 4, DOC.tariff)), Math.round(mid.yearlyWon), Math.round(mid.monthlyWon),
        years(mid.breakEvenDays), Math.round(mid.surplusKwh), maxUsefulPanels(input, SEOUL, DOC)],
      [monthlyBill, yearlyWon, monthlyWon, be, surplus, panels],
    );
  });
}

// ── 여기부터는 사이트가 실제로 쓰는 상수(constants.js) ──

test('세금은 부가세와 기금의 합 — 곱이 아니다', () => {
  const beforeTax = 1600 + 200 * 120 + 150 * 214.6 + 350 * 14;
  assert.ok(Math.abs(bill(350) - beforeTax * 1.127) < 1e-6);
});

test('여름(7~8월)엔 누진 구간이 300/450으로 늘어난다', () => {
  assert.ok(Math.abs(energyCharge(350, 8) - (300 * 120 + 50 * 214.6 + 350 * 14)) < 1e-6);
  assert.ok(Math.abs(energyCharge(350, 9) - (200 * 120 + 150 * 214.6 + 350 * 14)) < 1e-6);
});

test('사용량 역산은 요금 → kWh → 요금이 되돌아온다 (구간 경계 포함)', () => {
  for (const u of [30, 150, 199, 200, 201, 350, 400, 401, 700]) assert.equal(usageFromBill(bill(u)), u, `${u}kWh`);
});

test('보조금은 3kW까지만 나온다', () => {
  const r = calculate({ ...SOUTH, panelCount: 10, useSubsidy: true }, SEOUL);
  assert.equal(r.mid.capacityKw, 4.5);
  assert.equal(r.mid.subsidy, 3 * 550_000);
});

test('보조금이 총액보다 크면 비용 0, 손익분기 0일', () => {
  const r = calculate({ ...SOUTH, pricePerPanel: 100_000, useSubsidy: true }, SEOUL);
  assert.equal(r.mid.totalCost, 0);
  assert.equal(r.mid.breakEvenDays, 0);
});

test('세 시나리오는 낮음 ≤ 중앙 ≤ 높음, 손익분기 범위가 중앙을 감싼다', () => {
  for (const orientation of ['unknown', 'south', 'north']) {
    for (const shade of ['unknown', 'none', 'heavy']) {
      const r = calculate({ ...BASE, orientation, shade, monthlyUsage: 350 }, SEOUL);
      assert.ok(r.low.yearlyKwh <= r.mid.yearlyKwh && r.mid.yearlyKwh <= r.high.yearlyKwh, `${orientation}/${shade}`);
      assert.ok(r.breakEvenRange[0] <= r.mid.breakEvenDays && r.mid.breakEvenDays <= r.breakEvenRange[1]);
    }
  }
});

test('방향·그늘을 고르면 손익분기 범위가 좁아진다', () => {
  const width = (input) => { const [a, b] = calculate(input, SEOUL).breakEvenRange; return b - a; };
  assert.ok(width({ ...BASE, monthlyUsage: 350 }) > width({ ...SOUTH, monthlyUsage: 350 }));
});

test('잉여는 이월돼 다른 달을 상계한다 — 달마다 버리는 것보다 잉여가 적다', () => {
  const r = calculate({ ...SOUTH, monthlyUsage: 250 }, SEOUL).mid;
  const dropped = r.monthlyKwh.reduce((s, gen) => s + Math.max(gen - 250, 0), 0);
  assert.ok(r.surplusKwh > 0 && r.surplusKwh < dropped);
});

test('발전량이 차고 넘쳐도 기본요금은 남는다 — 절감액 상한 = 전력량요금 전부', () => {
  const r = calculate({ ...SOUTH, panelCount: 40, monthlyUsage: 350 }, SEOUL).mid;
  const cap = DAYS.reduce((s, _, i) => s + energyCharge(350, i + 1) * TARIFF.taxRate, 0);
  assert.ok(Math.abs(r.yearlyWon - cap) < 1e-6);
  assert.ok(r.yearlyWon < DAYS.reduce((s, _, i) => s + bill(350, i + 1), 0));
});

test('사용량이 많을수록 같은 패널로 더 아낀다', () => {
  const saved = [150, 250, 350, 450, 550].map((u) => calculate({ ...SOUTH, monthlyUsage: u }, SEOUL).mid.yearlyWon);
  saved.reduce((prev, x) => (assert.ok(x > prev), x));
});

test('직접 넣은 kWh가 전기요금보다 우선', () => {
  const r = calculate({ ...SOUTH, monthlyBill: 200_000, monthlyUsage: 300 }, SEOUL).mid;
  assert.equal(r.usage, 300);
});

test('요금이 기본요금에도 못 미치면 사용량 0 → 절감액 0, 회수 불가', () => {
  const r = calculate({ ...SOUTH, monthlyBill: 500 }, SEOUL).mid;
  assert.equal(r.usage, 0);
  assert.equal(r.yearlyWon, 0);
  assert.equal(r.breakEvenDays, Infinity);
});

test('적정 장수: 잉여가 없으면 지금 장수 그대로', () => {
  assert.equal(maxUsefulPanels({ ...SOUTH, monthlyUsage: 450 }, SEOUL), 7);
  assert.ok(maxUsefulPanels({ ...SOUTH, monthlyUsage: 150 }, SEOUL) < 7);
});
