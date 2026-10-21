// 입력 바인딩과 렌더. 계산은 calc.js, 숫자 표기는 format.js에 있다.

import './fonts/fonts.css';
import './style.css';
import data from '../data/psh.json';
import { calculate, maxUsefulPanels, subsidyEstimate, subsidyOf, usageFromBill, DAYS } from './calc.js';
import { DEFAULTS, ORIENTATION, PANELS, SHADE, TARIFF } from './constants.js';
import { buildIndex, mountSearch } from './search.js';
import { renderHorizon, renderMonthly } from './chart.js';
import { mountIcons } from './icons/index.js';
import { approxWon, breakEven, int, kwh, roundSig, won } from './format.js';

const $ = (id) => document.getElementById(id);
const PR_SPREAD = 0.05; // 성능비 중앙값을 바꿔도 낮음·높음은 ±0.05
const round3 = (x) => Math.round(x * 1000) / 1000;
const motionOK = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

// "계산 근거" 패널에서 바꾸는 값 — 되돌리기 기준
const ADVANCED = {
  panelWatt: DEFAULTS.panelWatt,
  prMid: DEFAULTS.pr[1],
  unitPrice: DEFAULTS.unitPrice,
  monthlyUsage: null,
  useSubsidy: false,
  subsidyTotal: null, // 국비+지방비 총액. null이면 국비 추정
};

const state = {
  region: null, // psh.json 한 항목 + name
  panelCount: PANELS.initial,
  pricePerPanel: DEFAULTS.pricePerPanel,
  monthlyBill: null,
  orientation: 'unknown',
  shade: 'unknown',
  ...ADVANCED,
};

const calcInput = () => ({
  panelCount: state.panelCount,
  pricePerPanel: state.pricePerPanel,
  monthlyBill: state.monthlyBill,
  monthlyUsage: state.monthlyUsage,
  orientation: state.orientation,
  shade: state.shade,
  useSubsidy: state.useSubsidy,
  subsidyTotal: state.subsidyTotal,
});

const calcConsts = () => ({
  ...DEFAULTS,
  panelWatt: state.panelWatt,
  unitPrice: state.unitPrice,
  pr: [round3(state.prMid - PR_SPREAD), state.prMid, round3(Math.min(1, state.prMid + PR_SPREAD))],
});

// ── 표시 도우미 ──

const span = (className, text) => Object.assign(document.createElement('span'), { className, textContent: text });

// 숫자·선 전환은 150ms 페이드만(VISUAL.md 7장). 처음 그릴 때는 안 한다.
function fade(el) {
  if (motionOK() && el.animate) el.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
}

function setText(el, text) {
  if (el.textContent === text) return;
  const first = !el.dataset.shown;
  el.dataset.shown = '1';
  el.textContent = text;
  if (!first) fade(el);
}

/** 큰 숫자 + 작은 단위(+ 앞에 작은 '약') */
function setValue(el, num, unit, pre = '') {
  const key = `${pre}|${num}|${unit}`;
  if (el.dataset.v === key) return;
  const first = el.dataset.v === undefined;
  el.dataset.v = key;
  el.replaceChildren(...[pre && span('pre', pre), span('num', num), unit && span('unit', unit)].filter(Boolean));
  if (!first) fade(el);
}

// ── 숫자 입력 ──

/** 천 단위 쉼표를 넣되 커서는 같은 숫자 뒤에 둔다 */
function groupDigits(el) {
  const caret = el.selectionStart ?? el.value.length;
  const before = el.value.slice(0, caret).replace(/\D/g, '').length;
  const digits = el.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const text = digits ? Number(digits).toLocaleString('ko-KR') : '';
  if (text === el.value) return;
  el.value = text;
  let pos = 0;
  for (let seen = 0; pos < text.length && seen < before; pos++) if (/\d/.test(text[pos])) seen++;
  el.setSelectionRange(pos, pos);
}

const refreshFields = [];

/** 입력 중엔 유효할 때만 반영하고, 칸을 벗어나면 범위 안으로 맞춰 다시 쓴다 */
function bindNumber(el, key, { min, max, decimals = 0, commas = false, optional = false }) {
  const show = () => {
    const v = state[key];
    el.value = v == null ? '' : commas ? int(v) : v.toFixed(decimals);
    el.removeAttribute('aria-invalid');
  };
  const parse = () => el.value.replace(/,/g, '').trim();
  el.addEventListener('input', () => {
    if (commas) groupDigits(el);
    const raw = parse();
    const v = raw === '' ? null : Number(raw);
    const ok = v === null ? optional : Number.isFinite(v) && v >= min && v <= max && (decimals > 0 || Number.isInteger(v));
    if (ok) el.removeAttribute('aria-invalid');
    else el.setAttribute('aria-invalid', 'true');
    if (ok && state[key] !== v) { state[key] = v; changed(); }
  });
  el.addEventListener('change', () => {
    const raw = parse();
    const v = Number(raw);
    if (raw !== '' && Number.isFinite(v)) {
      const fixed = Math.min(max, Math.max(min, decimals ? round3(v) : Math.round(v)));
      if (state[key] !== fixed) { state[key] = fixed; changed(); }
    }
    show();
  });
  refreshFields.push(show);
  show();
}

// ── 렌더 ──

let timer = 0;
function changed() {
  renderInputs();
  clearTimeout(timer);
  timer = setTimeout(renderResults, 100); // 설계 6.1: 결과는 디바운스 100ms
}

function renderInputs() {
  const range = $('panel-range');
  range.value = state.panelCount;
  range.style.setProperty('--fill', `${((state.panelCount - PANELS.min) / (PANELS.max - PANELS.min)) * 100}%`);
  if (document.activeElement !== $('panel-count')) $('panel-count').value = state.panelCount;
  const c = calcConsts();
  const kw = (state.panelCount * state.panelWatt) / 1000;
  $('panel-kw').textContent = `≈ ${kw.toFixed(2)} kW`;
  const gross = state.panelCount * state.pricePerPanel;
  const subsidy = subsidyOf(calcInput(), c);
  $('price-total').textContent = subsidy > 0 ? `= ${won(gross)} · 보조금 빼면 자부담 ${won(gross - subsidy)}` : `= ${won(gross)}`;

  const usage = usageFromBill(state.monthlyBill);
  $('bill-usage').textContent = state.monthlyUsage > 0
    ? `계산 근거에 직접 넣은 월 ${int(state.monthlyUsage)}kWh로 계산하는 중`
    : usage != null ? `≈ 월 ${int(usage)}kWh 사용` : '';

  $('more-state').textContent = `방향 ${ORIENTATION[state.orientation].short} · 그늘 ${SHADE[state.shade].short}`;
  const [lo, , hi] = c.pr;
  $('adv-pr-range').textContent = `범위 ${lo.toFixed(2)}~${hi.toFixed(2)}`;
  $('adv-unit-note').textContent = state.monthlyUsage > 0 || usage != null
    ? '지금은 전기요금으로 누진제 계산을 해서 이 값은 안 써요'
    : '전기요금을 안 넣었을 때만 써요 (누진 2단계 + 부가요금 기준)';
  const estimate = subsidyEstimate(state.panelCount, c);
  $('adv-subsidy').placeholder = int(estimate);
  $('adv-subsidy-note').textContent = `비워 두면 국비만 넣어요: ${Math.min(kw, c.subsidyMaxKw).toFixed(2)} kW(세대당 ${c.subsidyMaxKw}kW까지) × kW당 ${won(c.subsidyPerKw)} = ${won(estimate)}. `
    + '시·도·군 보조금도 받는다면 합친 금액을 넣으세요 — 지역에 따라 자부담이 크게 줄어요.';
}

let last = null;          // 마지막 결과 — 창 크기가 바뀌면 그래프만 다시 그린다
let sunShown = false;     // 해가 떠오르는 움직임은 처음 한 번만

function renderResults() {
  const region = state.region;
  const ok = region && Array.isArray(region.monthly) && region.monthly.length === 12;
  $('results').classList.toggle('is-empty', !ok);
  $('monthly-block').hidden = !ok;
  if (!ok) {
    $('empty-msg').textContent = region ? '이 지역은 일사량 데이터가 없어요. 가까운 시군구로 골라 주세요.' : '지역을 고르면 바로 계산해요';
    $('surplus').hidden = true;
    last = null;
    updateBar();
    $('steps').replaceChildren(Object.assign(document.createElement('li'), { textContent: '지역을 고르면 계산 과정이 여기 나와요.' }));
    return;
  }

  const input = calcInput();
  const c = calcConsts();
  const r = calculate(input, region, c);
  const m = r.mid;

  setValue($('r-day-kwh'), kwh(m.dailyKwh), 'kWh');
  setValue($('r-month-kwh'), kwh(m.monthlyAvgKwh), 'kWh');
  setValue($('r-year-kwh'), kwh(m.yearlyKwh), 'kWh');
  setValue($('r-day-won'), ...approxWon(m.dailyWon));
  setValue($('r-month-won'), ...approxWon(m.monthlyWon));
  setValue($('r-year-won'), ...approxWon(m.yearlyWon));

  const be = breakEven(r.breakEvenRange, m.breakEvenDays);
  setText($('r-be'), be.main);
  setText($('r-be-sub'), be.sub);
  $('bar-range').textContent = be.range;

  const finite = Number.isFinite(m.breakEvenDays) && m.breakEvenDays > 0;
  const [fast, slow] = r.breakEvenRange.map((d) => Math.round(d / 365));
  $('hint-bill').hidden = m.usage != null;
  // 설계 6.5: '모름' 때문에 범위가 넓을 때만. 잉여로 절감액이 묶이면 범위가 이미 한 값으로 모인다.
  $('hint-more').hidden = !finite || fast === slow || (state.orientation !== 'unknown' && state.shade !== 'unknown');
  $('hint-life').hidden = !(finite && m.breakEvenDays / 365 > c.panelLifeYears);
  $('hint-life').textContent = `패널 수명(${c.panelLifeYears}년) 안에 본전을 찾기 어려워요`;

  renderSurplus(m, input, c);
  const years = m.breakEvenDays / 365;
  const costText = approxWon(m.totalCost).join('');
  last = {
    horizon: {
      cost: m.totalCost,
      yearly: [r.low.yearlyWon, m.yearlyWon, r.high.yearlyWon],
      costLabel: `${m.subsidy > 0 ? '자부담' : '설치비'} ${costText}`,
      sunLabel: m.breakEvenDays === 0 ? '바로 본전' : `약 ${Math.round(years)}년`,
      summary: Number.isFinite(years)
        ? `누적 절감액이 ${m.subsidy > 0 ? '자부담' : '설치비'} ${costText}을 넘는 시점: ${be.range}(중앙 ${years.toFixed(1)}년)`
        : '절감액이 없어 본전을 찾기 어려워요',
    },
    monthly: m.monthlyKwh,
    usage: m.usage,
  };
  drawCharts({ animate: !sunShown && motionOK(), fadeIn: sunShown });
  sunShown = true;
  renderSteps(r, c);
  updateBar();
  $('live').textContent = `하루 ${kwh(m.dailyKwh)}kWh, 절감액 약 ${approxWon(m.dailyWon).join('')}. ${be.main}.`;
}

function drawCharts({ animate = false, fadeIn = false } = {}) {
  if (!last) return;
  renderHorizon($('horizon'), last.horizon, { animate });
  const hasExtra = renderMonthly($('chart'), last.monthly, last.usage);
  $('lg-usage').hidden = last.usage == null;
  $('lg-usage-v').textContent = last.usage != null ? `${int(last.usage)}kWh` : '';
  $('lg-extra').hidden = !hasExtra;
  if (fadeIn) { fade($('horizon')); fade($('chart')); }
}

// 모바일 하단 고정 바: 위치를 고른 뒤, 결과가 화면 밖에 있을 때만(VISUAL.md 4장)
let resultsVisible = false;
function updateBar() {
  const show = !!last && !resultsVisible;
  $('bottom-bar').hidden = !show;
  document.body.classList.toggle('has-bar', show);
}
new IntersectionObserver(([e]) => { resultsVisible = e.isIntersecting; updateBar(); }, { threshold: 0.15 })
  .observe($('results'));
$('bottom-bar').addEventListener('click', () => {
  $('results').scrollIntoView({ block: 'start', behavior: motionOK() ? 'smooth' : 'auto' });
  $('r-be').setAttribute('tabindex', '-1');
  $('r-be').focus({ preventScroll: true });
});

// 설계 6.5: 매년 쌓이기만 하는 잉여가 있으면 경고 + 적정 장수
function renderSurplus(m, input, c) {
  const box = $('surplus');
  box.hidden = !(m.surplusKwh >= 1);
  if (box.hidden) return;
  const n = maxUsefulPanels(input, state.region, c);
  const fix = $('surplus-fix');
  $('surplus-text').textContent = `매년 약 ${int(roundSig(m.surplusKwh, 2))}kWh는 쌓이기만 하고 돈이 안 돼요. `
    + (n > 0 ? `${n}장으로 줄여도 절감액은 거의 같아요.` : '사용량에 비해 1장만 달아도 전기가 남아요.');
  fix.hidden = n === 0;
  fix.dataset.n = n;
  fix.textContent = `${n}장으로 바꿔 보기`;
}

function renderSteps(r, c) {
  const m = r.mid;
  const f2 = (x) => x.toFixed(2);
  const years = (d) => (Number.isFinite(d) ? `${(d / 365).toFixed(1)}년` : '회수 불가');
  const irradiance = state.region.monthly.reduce((s, v, i) => s + v * DAYS[i], 0); // kWh/m²·년
  const steps = [
    ['설비 용량', `${state.panelCount}장 × ${int(state.panelWatt)}W = ${f2(m.capacityKw)} kW`],
    ['일사량', `${state.region.name} 연평균 ${state.region.annual.toFixed(2)} kWh/m²/일 = NASA ${state.region.nasa.annual.toFixed(2)} × 실측 보정 ${state.region.correction.factor.toFixed(3)} (${state.region.correction.stations.join('·')} 관측소)`],
    ['연 발전량', `${f2(m.capacityKw)} kW × 연 일사량 ${int(irradiance)} kWh/m² × 방향 ${f2(m.orientation)} × 그늘 ${f2(m.shade)} × 성능비 ${f2(m.pr)} = ${int(m.yearlyKwh)} kWh`],
  ];
  if (state.monthlyUsage > 0) steps.push(['사용량', `직접 넣은 월 ${int(m.usage)} kWh`]);
  else if (m.usage != null) steps.push(['사용량', `월 ${won(state.monthlyBill)} → 약 ${int(m.usage)} kWh (비여름철 요금표로 역산, 12개월 같다고 봄)`]);

  if (m.usage != null) {
    const perKwh = m.usedKwh > 0 ? ` · 상계 ${int(m.usedKwh)} kWh, kWh당 평균 ${int(m.yearlyWon / m.usedKwh)}원` : '';
    steps.push(['절감액', `매달 발전량(+이월분)으로 사용량을 상계. 기본요금은 그대로 두고 전력량·기후환경·연료비조정요금과 세금만 줄어요 → 연 ${won(m.yearlyWon)}${perKwh}`]);
  } else {
    steps.push(['절감액', `전기요금을 몰라 발전량 전부를 kWh당 ${int(c.unitPrice)}원으로 계산: ${int(m.yearlyKwh)} kWh × ${int(c.unitPrice)}원 = 연 ${won(m.yearlyWon)}`]);
  }

  const source = state.subsidyTotal != null
    ? '직접 넣은 총액'
    : `국비 추정 ${f2(Math.min(m.capacityKw, c.subsidyMaxKw))} kW × ${won(c.subsidyPerKw)}`;
  const subsidy = m.subsidy > 0 ? ` − 보조금 ${won(m.subsidy)}(${source}) = 자부담 ${won(m.totalCost)}` : '';
  steps.push(['총비용', `${state.panelCount}장 × ${won(state.pricePerPanel)} = ${won(m.grossCost)}${subsidy}`]);
  steps.push(['손익분기', Number.isFinite(m.breakEvenDays)
    ? `${won(m.totalCost)} ÷ 하루 ${won(m.dailyWon)} = ${int(m.breakEvenDays)}일 (${years(m.breakEvenDays)})`
    : '하루 절감액이 0이라 회수할 수 없어요']);
  const sc = (s) => `방향 ${f2(s.orientation)} × 그늘 ${f2(s.shade)} × 성능비 ${f2(s.pr)}`;
  steps.push(['범위', `빨리 회수(${sc(r.high)}) ${years(r.high.breakEvenDays)} ~ 늦게 회수(${sc(r.low)}) ${years(r.low.breakEvenDays)}`]);
  steps.push([`${c.panelLifeYears}년 누적 절감`, `${won(m.yearlyWon)} × ${c.panelLifeYears} − ${won(m.totalCost)} = ${won(m.lifetimeSaving)} (열화·인버터 교체 미반영)`]);

  $('steps').replaceChildren(...steps.map(([k, v]) => {
    const li = document.createElement('li');
    li.append(span('step-k', k), ` ${v}`);
    return li;
  }));
}

function renderFixed() {
  const f2 = (x) => x.toFixed(2);
  const value = (v) => (v[0] === v[2] ? f2(v[1]) : `${f2(v[1])}(${f2(v[0])}~${f2(v[2])})`);
  const list = (table, keys, name) => keys.map((k) => `${table[k][name]} ${value(table[k].v)}`).join(' · ');
  $('fixed-orientation').textContent = list(ORIENTATION, ['south', 'flat', 'eastWest', 'north', 'unknown'], 'label');
  $('fixed-shade').textContent = list(SHADE, ['none', 'some', 'heavy', 'unknown'], 'short');
  const { meta } = data;
  $('fixed-psh').textContent = `${meta.source} ${meta.period} 기후값 · ${meta.surface} 기준. 위성 자료(${meta.dataset})라 격자가 약 1°(100km)예요. 보정 계수 ${meta.correction.factorRange.join('~')}.`;
  const pct = (x) => `${+(x * 100).toFixed(1)}%`;
  $('fixed-tariff').textContent = `한전 주택용 저압 ${TARIFF.updated} · 누진 ${TARIFF.rates.map((x) => x.toFixed(1)).join(' / ')}원/kWh`
    + ` · 기후환경·연료비조정 +${TARIFF.extraPerKwh}원/kWh · 부가세 ${pct(TARIFF.vat)} + 전력기금 ${pct(TARIFF.fund)}`;
  $('fixed-regions').textContent = `행정동 경계 ${meta.regions.asOf} 기준 시군구 ${meta.regions.count}곳의 중심점`;
}

function buildSegments(container, name, table, key) {
  for (const [value, o] of Object.entries(table)) {
    const label = document.createElement('label');
    label.title = o.label;
    const radio = Object.assign(document.createElement('input'), { type: 'radio', name, value, checked: state[key] === value });
    radio.addEventListener('change', () => { state[key] = value; changed(); });
    label.append(radio, span('', o.short));
    container.append(label);
  }
}

// ── 위치 ──

function showChip(on) {
  $('region-combo').hidden = on;
  $('region-chip').hidden = !on;
  $('region-note').hidden = !on;
  if (on) {
    $('chip-name').textContent = state.region.name;
    $('chip-psh').textContent = state.region.annual.toFixed(2);
  }
}

mountSearch({
  input: $('region-input'),
  list: $('region-list'),
  index: buildIndex(data.regions),
  onSelect: (entry) => {
    state.region = { name: entry.name, ...entry.region };
    showChip(true);
    $('region-chip').focus();
    changed();
  },
  onCancel: () => state.region && showChip(true),
});
$('region-chip').addEventListener('click', () => {
  showChip(false);
  $('region-input').focus();
});

// ── 입력 연결 ──

for (const el of [$('panel-range'), $('panel-count')]) Object.assign(el, { min: PANELS.min, max: PANELS.max });
$('panel-range').addEventListener('input', (e) => { state.panelCount = Number(e.target.value); changed(); });
bindNumber($('panel-count'), 'panelCount', { min: PANELS.min, max: PANELS.max });
bindNumber($('price'), 'pricePerPanel', { min: 0, max: 99_999_999, commas: true });
bindNumber($('bill'), 'monthlyBill', { min: 0, max: 9_999_999, commas: true, optional: true });
bindNumber($('adv-watt'), 'panelWatt', { min: 50, max: 1000 });
bindNumber($('adv-pr'), 'prMid', { min: 0.5, max: 0.95, decimals: 2 });
bindNumber($('adv-unit'), 'unitPrice', { min: 0, max: 2000 });
bindNumber($('adv-usage'), 'monthlyUsage', { min: 0, max: 5000, optional: true });
bindNumber($('adv-subsidy'), 'subsidyTotal', { min: 0, max: 99_999_999, commas: true, optional: true });
$('adv-subsidy-on').addEventListener('change', (e) => { state.useSubsidy = e.target.checked; changed(); });
// 금액을 넣으면 적용도 켠다 — 넣고 체크를 깜빡하는 경우가 많다
$('adv-subsidy').addEventListener('input', () => {
  if (state.subsidyTotal == null || state.useSubsidy) return;
  state.useSubsidy = $('adv-subsidy-on').checked = true;
  changed();
});

buildSegments($('seg-orientation'), 'orientation', ORIENTATION, 'orientation');
buildSegments($('seg-shade'), 'shade', SHADE, 'shade');

$('reset').addEventListener('click', () => {
  Object.assign(state, ADVANCED);
  $('adv-subsidy-on').checked = false;
  refreshFields.forEach((show) => show());
  changed();
});

$('surplus-fix').addEventListener('click', (e) => {
  state.panelCount = Number(e.currentTarget.dataset.n);
  changed();
});

const scrollOpts = () => ({ block: 'center', behavior: motionOK() ? 'smooth' : 'auto' });
$('hint-bill').addEventListener('click', () => {
  $('bill').focus({ preventScroll: true });
  $('bill').scrollIntoView(scrollOpts());
});
$('hint-more').addEventListener('click', () => {
  $('more').open = true;
  const target = document.querySelector(`#seg-${state.orientation === 'unknown' ? 'orientation' : 'shade'} input:checked`);
  target.focus({ preventScroll: true });
  target.scrollIntoView(scrollOpts());
});

// 그래프는 실제 폭으로 다시 그린다(글자 크기가 viewBox 배율에 휘둘리지 않게)
let raf = 0;
let lastWidth = 0;
new ResizeObserver(([e]) => {
  if (Math.round(e.contentRect.width) === lastWidth) return;
  lastWidth = Math.round(e.contentRect.width);
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => drawCharts());
}).observe($('results'));

mountIcons();
renderFixed();
renderInputs();
renderResults();
