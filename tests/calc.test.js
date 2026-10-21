import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bill, calculate, energyCharge, maxUsefulPanels, subsidyOf, usageFromBill, DAYS } from '../src/calc.js';
import { DEFAULTS, TARIFF } from '../src/constants.js';

// 설계 문서(docs/DESIGN.md) 3.1·3.2 표를 그대로 고정한다. 상수를 바꾸면 여기가 깨지고,
// 그때 표를 다시 뽑아 문서와 테스트를 같이 고친다 — 문서와 코드가 다른 숫자를 말하지 않게.
const SEOUL = { monthly: [2.1, 2.9, 3.8, 4.6, 5.0, 4.6, 3.6, 3.9, 3.8, 3.3, 2.4, 1.9] }; // 가정값, 연 3.49
const REAL = JSON.parse(readFileSync(new URL('../data/psh.json', import.meta.url), 'utf8')).regions['서울 중구'];
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
  assert.deepEqual(summary(calculate(SOUTH, SEOUL)), {
    kwh: [9.6, 292, 3502], won: [2207, 67114, 805373], days: 2379, years: [6.5, 6.1, 7.3],
  });
});

test('3.1 남향·그늘 없음, 월 350kWh', () => {
  assert.deepEqual(summary(calculate({ ...SOUTH, monthlyUsage: 350 }, SEOUL)), {
    kwh: [9.6, 292, 3502], won: [1916, 58283, 699390], days: 2740, years: [7.5, 7.2, 8.2],
  });
});

test('3.1 위와 같음 + 보조금(국비 추정 3kW × 55만 원)', () => {
  const r = calculate({ ...SOUTH, monthlyUsage: 350, useSubsidy: true }, SEOUL);
  assert.equal(r.mid.subsidy, 1_650_000);
  assert.equal(Math.round(r.mid.breakEvenDays), 1879);
  assert.deepEqual([years(r.mid.breakEvenDays), years(r.breakEvenRange[0]), years(r.breakEvenRange[1])], [5.1, 4.9, 5.6]);
});

test('3.1 방향·그늘 모름, 월 350kWh', () => {
  assert.deepEqual(summary(calculate({ ...BASE, monthlyUsage: 350 }, SEOUL)), {
    kwh: [7.5, 228, 2731], won: [1587, 48274, 579289], days: 3308, years: [9.1, 7.2, 12.4],
  });
});

test('3.1 서울 중구 실제 일사량(NASA × ASOS 보정), 방향·그늘 모름, 월 350kWh — 사이트가 보여 주는 값', () => {
  assert.deepEqual(summary(calculate({ ...BASE, monthlyUsage: 350 }, REAL)), {
    kwh: [7.7, 233, 2800], won: [1617, 49186, 590231], days: 3247, years: [8.9, 7.0, 12.2],
  });
});

test('3.1 usageFromBill(71000) = 351kWh, bill(350) = 70,652원, 70,650원 → 350kWh', () => {
  assert.equal(usageFromBill(71_000), 351);
  assert.equal(Math.round(bill(350)), 70_652);
  assert.equal(usageFromBill(70_650), 350);
});

// [월 사용량, 원래 월 요금, 연 절감액, 월평균 절감액, 손익분기(년), 매년 쌓이는 잉여, 적정 장수]
const TABLE_3_2 = [
  [150, 23_678, 271_832, 22_653, 19.3, 1702, 3],
  [250, 44_888, 506_361, 42_197, 10.4, 502, 5],
  [350, 70_652, 699_390, 58_283, 7.5, 0, 7],
  [450, 108_062, 854_127, 71_177, 6.1, 0, 7],
  [550, 144_273, 1_050_682, 87_557, 5.0, 0, 7],
];
for (const [usage, monthlyBill, yearlyWon, monthlyWon, be, surplus, panels] of TABLE_3_2) {
  test(`3.2 월 ${usage}kWh`, () => {
    const input = { ...SOUTH, monthlyUsage: usage };
    const { mid } = calculate(input, SEOUL);
    assert.deepEqual(
      [Math.round(bill(usage)), Math.round(mid.yearlyWon), Math.round(mid.monthlyWon),
        years(mid.breakEvenDays), Math.round(mid.surplusKwh), maxUsefulPanels(input, SEOUL)],
      [monthlyBill, yearlyWon, monthlyWon, be, surplus, panels],
    );
  });
}

// ── 불변식 ──

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

test('국비 추정은 3kW까지만', () => {
  const r = calculate({ ...SOUTH, panelCount: 10, useSubsidy: true }, SEOUL);
  assert.equal(r.mid.capacityKw, 4.5);
  assert.equal(r.mid.subsidy, 3 * 550_000);
  assert.equal(subsidyOf({ ...BASE, panelCount: 5, useSubsidy: true }), 2.25 * 550_000);
});

test('총 보조금(국비+지방비)을 넣으면 추정 대신 그 금액', () => {
  const input = { ...SOUTH, monthlyUsage: 350, useSubsidy: true, subsidyTotal: 3_650_000 };
  assert.equal(calculate(input, SEOUL).mid.totalCost, 5_250_000 - 3_650_000);
  assert.equal(subsidyOf({ ...input, useSubsidy: false }), 0); // 적용을 끄면 0
});

test('보조금이 설치비보다 크면 자부담 0, 손익분기 0일', () => {
  const r = calculate({ ...SOUTH, useSubsidy: true, subsidyTotal: 9_000_000 }, SEOUL);
  assert.equal(r.mid.subsidy, 5_250_000);
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
