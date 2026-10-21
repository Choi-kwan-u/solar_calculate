// 순수 계산 함수 — DOM을 모른다. 설계 문서 3.1·3.2 검산값은 tests/calc.test.js에 고정.
// 요금표는 c.tariff로 바꿔 끼울 수 있다(기본 TARIFF). 테스트가 문서 작성 당시 상수로 검산할 때 쓴다.

import { DEFAULTS, ORIENTATION, SHADE, TARIFF } from './constants.js';

export const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isSummer = (m) => m === 7 || m === 8;
const stepsOf = (m, t) => (isSummer(m) ? t.stepsSummer : t.stepsNormal);

/** 전력량요금(누진) + 기후환경·연료비조정요금. 기본요금·세금 제외 */
export function energyCharge(kwh, month, t = TARIFF) {
  if (kwh <= 0) return 0;
  const [s1, s2] = stepsOf(month, t);
  const caps = [s1, s2, Infinity];
  let won = 0, prev = 0;
  for (let i = 0; i < 3 && kwh > prev; i++) {
    won += (Math.min(kwh, caps[i]) - prev) * t.rates[i];
    prev = caps[i];
  }
  return won + kwh * t.extraPerKwh;
}

/** 월 청구액(원, 세금 포함) */
export function bill(kwh, month = 4, t = TARIFF) {
  if (kwh <= 0) return 0;
  const [s1, s2] = stepsOf(month, t);
  const tier = kwh <= s1 ? 0 : kwh <= s2 ? 1 : 2;
  return (t.base[tier] + energyCharge(kwh, month, t)) * t.taxRate;
}

/** 월 전기요금(원) → 사용량(kWh) 역산. 비여름철 요금표 기준 이분 탐색 */
export function usageFromBill(won, t = TARIFF) {
  if (!(won > 0)) return null;
  let lo = 0, hi = 3000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (bill(mid, 4, t) < won) lo = mid; else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

// 상계 시뮬레이션: 잉여는 이월되어 이후 달 사용량을 상계한다(10kW 이하, 현금정산 없음).
// 기본요금은 수전량 기준이라 그대로 두고 전력량요금만 줄어든다.
// 정상상태를 보려고 1년을 두 번 돌리고 두 번째 해 결과를 쓴다.
function offsetYear(usage, monthlyKwh, t) {
  let bank = 0, won = 0, usedKwh = 0, bankAfterYear1 = 0;
  for (let pass = 0; pass < 2; pass++) {
    won = 0;
    usedKwh = 0;
    monthlyKwh.forEach((gen, i) => {
      const m = i + 1;
      const avail = gen + bank;
      const used = Math.min(avail, usage);
      bank = avail - used;
      usedKwh += used;
      won += (energyCharge(usage, m, t) - energyCharge(usage - used, m, t)) * t.taxRate;
    });
    if (pass === 0) bankAfterYear1 = bank;
  }
  return { yearlyWon: won, usedKwh, surplusKwh: bank - bankAfterYear1 }; // 매년 쌓이기만 하는 양
}

/** 국비 추정(원): 가구당 subsidyMaxKw까지 kW당 subsidyPerKw */
export function subsidyEstimate(panelCount, c = DEFAULTS) {
  return Math.min((panelCount * c.panelWatt) / 1000, c.subsidyMaxKw ?? Infinity) * c.subsidyPerKw;
}

/** 보조금(원): 직접 넣은 총액(국비+지방비), 없으면 국비 추정. 설치비를 넘지 않는다 */
export function subsidyOf(input, c = DEFAULTS) {
  if (!input.useSubsidy) return 0;
  const total = input.subsidyTotal ?? subsidyEstimate(input.panelCount, c);
  return Math.min(total, input.panelCount * input.pricePerPanel);
}

function scenario(input, psh, k /* 0=낮음 1=중앙 2=높음 */, c) {
  const t = c.tariff ?? TARIFF;
  const orientation = ORIENTATION[input.orientation ?? 'unknown'].v[k];
  const shade = SHADE[input.shade ?? 'unknown'].v[k];
  const pr = c.pr[k];
  const capacityKw = (input.panelCount * c.panelWatt) / 1000;
  const factor = orientation * shade * pr;
  const monthlyKwh = psh.monthly.map((p, i) => capacityKw * p * factor * DAYS[i]);
  const yearlyKwh = monthlyKwh.reduce((a, b) => a + b, 0);

  const usage = input.monthlyUsage > 0 ? input.monthlyUsage : usageFromBill(input.monthlyBill, t);
  const { yearlyWon, usedKwh, surplusKwh } = usage != null
    ? offsetYear(usage, monthlyKwh, t)
    : { yearlyWon: yearlyKwh * c.unitPrice, usedKwh: yearlyKwh, surplusKwh: 0 };

  const grossCost = input.panelCount * input.pricePerPanel;
  const subsidy = subsidyOf(input, c);
  const totalCost = grossCost - subsidy;
  const dailyWon = yearlyWon / 365;
  return {
    orientation, shade, pr, factor,
    capacityKw, usage, monthlyKwh,
    dailyKwh: yearlyKwh / 365, monthlyAvgKwh: yearlyKwh / 12, yearlyKwh,
    dailyWon, monthlyWon: yearlyWon / 12, yearlyWon,
    usedKwh, surplusKwh,
    grossCost, subsidy, totalCost,
    breakEvenDays: totalCost === 0 ? 0 : dailyWon > 0 ? totalCost / dailyWon : Infinity,
    lifetimeSaving: yearlyWon * c.panelLifeYears - totalCost,
  };
}

/**
 * 낮음/중앙/높음 세 시나리오. 손익분기 범위는 [많이 아끼는 쪽, 적게 아끼는 쪽]
 * @param input { panelCount, pricePerPanel, monthlyBill?, monthlyUsage?, orientation?, shade?, useSubsidy?, subsidyTotal? }
 * @param psh   { monthly: number[12] }  kWh/m²/일 (= peak sun hours)
 * @param c     DEFAULTS와 같은 모양 — 화면에서 바꾼 값이 들어온다
 */
export function calculate(input, psh, c = DEFAULTS) {
  const [low, mid, high] = [0, 1, 2].map((k) => scenario(input, psh, k, c));
  return { low, mid, high, breakEvenRange: [high.breakEvenDays, low.breakEvenDays] };
}

/** 잉여 경고용: 중앙 시나리오에서 매년 남는 전기가 거의 0이 되는 최대 장수 */
export function maxUsefulPanels(input, psh, c = DEFAULTS) {
  for (let n = input.panelCount; n >= 1; n--) {
    if (scenario({ ...input, panelCount: n }, psh, 1, c).surplusKwh < 1) return n;
  }
  return 0;
}
