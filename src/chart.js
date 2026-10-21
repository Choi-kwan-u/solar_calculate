// 그래프 두 개 — 라이브러리 없이 SVG. 디자인 기준은 docs/VISUAL.md 6장.
//  · 지평선 차트: 설치비(지평선) · 누적 절감선 · 범위 띠 · 둘이 만나는 해
//  · 월별 발전량과 사용량: 사용량을 넘는 윗부분(이월되는 잉여)은 빗금

export const YEARS = 25;

/** 지평선 차트에 필요한 값만 계산(순수 함수, 테스트 대상) */
export function horizonModel({ cost, yearly: [low, mid, high] }) {
  const yMax = Math.max(cost, high * YEARS, 1) * 1.08;
  const sunYears = cost === 0 ? 0 : mid > 0 ? cost / mid : Infinity;
  return { yMax, sunYears, sunInRange: sunYears <= YEARS, end: [low, mid, high].map((w) => w * YEARS) };
}

/** 월별 막대를 사용량 아래(실제로 상계)·위(이월되는 잉여)로 나눈다 */
export function splitMonths(monthly, usage) {
  return monthly.map((v) => (usage == null ? { used: v, extra: 0 } : { used: Math.min(v, usage), extra: Math.max(v - usage, 0) }));
}

const f1 = (x) => x.toFixed(1);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * el: 컨테이너. d: { cost, yearly:[낮음,중앙,높음], costLabel, sunLabel, summary }
 * animate: 처음 결과가 나올 때만 해가 누적선을 따라 지평선까지 올라간다(400ms)
 */
export function renderHorizon(el, d, { animate = false } = {}) {
  const width = Math.max(260, Math.floor(el.clientWidth || 320));
  const height = width < 480 ? 160 : 200;
  const pad = { l: 6, r: 6, t: 36, b: 22 };
  const w = width - pad.l - pad.r, h = height - pad.t - pad.b;
  const m = horizonModel(d);
  const x = (t) => pad.l + (t / YEARS) * w;
  const y = (v) => pad.t + h - (v / m.yMax) * h;
  const [low, mid, high] = m.end;
  const yc = y(d.cost);

  let svg = '';
  svg += `<rect class="hz-below" x="${pad.l}" y="${f1(yc)}" width="${w}" height="${f1(y(0) - yc)}"/>`;
  svg += `<line class="hz-base" x1="${pad.l}" x2="${pad.l + w}" y1="${f1(y(0))}" y2="${f1(y(0))}"/>`;
  svg += `<polygon class="hz-band" points="${x(0)},${f1(y(0))} ${x(YEARS)},${f1(y(low))} ${x(YEARS)},${f1(y(high))}"/>`;
  svg += `<line class="hz-horizon" x1="${pad.l}" x2="${pad.l + w}" y1="${f1(yc)}" y2="${f1(yc)}"/>`;
  svg += `<line class="hz-line" x1="${x(0)}" y1="${f1(y(0))}" x2="${x(YEARS)}" y2="${f1(y(mid))}"/>`;

  // 설치비 라벨: 오른쪽 끝. 해가 오른쪽에 있으면 지평선 아래로 내려 겹치지 않게
  const sx = x(Math.min(m.sunYears, YEARS));
  const costBelow = m.sunInRange && sx > pad.l + w * 0.55;
  svg += `<text class="hz-cost" x="${pad.l + w}" y="${f1(costBelow ? yc + 15 : yc - 6)}" text-anchor="end">${esc(d.costLabel)}</text>`;

  for (let t = 0; t <= YEARS; t += 5) {
    const anchor = t === 0 ? 'start' : t === YEARS ? 'end' : 'middle';
    svg += `<text class="hz-tick" x="${x(t)}" y="${height - 5}" text-anchor="${anchor}">${t === YEARS ? `${t}년` : t}</text>`;
  }

  let sun = '';
  if (m.sunInRange) {
    const lx = Math.min(Math.max(sx, pad.l + 28), pad.l + w - 28);
    sun = `<g class="hz-sun">`
      + `<circle cx="${f1(sx)}" cy="${f1(yc)}" r="15" class="hz-glow2"/><circle cx="${f1(sx)}" cy="${f1(yc)}" r="10" class="hz-glow1"/>`
      + `<circle cx="${f1(sx)}" cy="${f1(yc)}" r="6" class="hz-dot"/>`
      + `<text class="hz-sun-label num" x="${f1(lx)}" y="${f1(yc - 20)}" text-anchor="middle">${esc(d.sunLabel)}</text></g>`;
  } else {
    svg += `<text class="hz-note" x="${pad.l + w}" y="${pad.t - 14}" text-anchor="end">25년 안에는 지평선을 못 넘어요</text>`;
  }

  el.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(d.summary)}">${svg}${sun}</svg>`;

  const g = el.querySelector('.hz-sun');
  if (animate && g && g.animate) {
    // 원점에서 출발해 누적선을 따라 해 위치까지
    g.animate([{ transform: `translate(${x(0) - sx}px, ${y(0) - yc}px)`, opacity: 0.3 }, { transform: 'translate(0, 0)', opacity: 1 }],
      { duration: 400, easing: 'ease-out' });
  }
}

// 지역을 고르기 전 흐리게 보여 줄 모양(값 없음)
const GHOST = [2.3, 3.1, 4.2, 5.0, 5.5, 5.1, 4.3, 4.6, 4.1, 3.5, 2.5, 2.1];

function columnPath(x, y, w, h, r = 3) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`;
}

/** el: 컨테이너. monthly: kWh 12개 또는 null. usage: 월 사용량 kWh 또는 null */
export function renderMonthly(el, monthly, usage = null) {
  const width = Math.max(240, Math.floor(el.clientWidth || 320));
  const H = 150, TOP = 20, BOTTOM = 22;
  const plotH = H - TOP - BOTTOM;
  const slot = width / 12;
  const barW = Math.min(22, slot * 0.6);
  const data = monthly ?? GHOST;
  const top = Math.max(...data, usage ?? 0) * 1.08 || 1;
  const y = (v) => TOP + plotH - (v / top) * plotH;
  const parts = splitMonths(data, monthly ? usage : null);
  const iMax = data.indexOf(Math.max(...data)), iMin = data.indexOf(Math.min(...data));
  const narrow = slot < 34;

  let s = '<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">'
    + '<rect width="5" height="5" class="hatch-bg"/><line x1="1" y1="0" x2="1" y2="5" class="hatch-line"/></pattern></defs>';
  data.forEach((v, i) => {
    const x = i * slot + (slot - barW) / 2;
    const cx = f1(x + barW / 2);
    const total = Math.max(2, (v / top) * plotH);
    const title = monthly ? `<title>${i + 1}월 ${Math.round(v)} kWh${parts[i].extra ? ` (이월 ${Math.round(parts[i].extra)})` : ''}</title>` : '';
    if (parts[i].extra > 0) {
      // 위쪽 빗금(잉여) 전체를 그리고 사용량까지는 꽉 찬 막대로 덮는다
      s += `<path class="bar-extra" d="${columnPath(x, TOP + plotH - total, barW, total)}">${title}</path>`;
      s += `<rect class="bar" x="${f1(x)}" y="${f1(y(parts[i].used))}" width="${f1(barW)}" height="${f1(TOP + plotH - y(parts[i].used))}"/>`;
    } else {
      s += `<path class="bar" d="${columnPath(x, TOP + plotH - total, barW, total)}">${title}</path>`;
    }
    if (monthly && (i === iMax || i === iMin)) s += `<text class="val" x="${cx}" y="${f1(TOP + plotH - total - 5)}">${Math.round(v)}</text>`;
    s += `<text class="month" x="${cx}" y="${H - 6}">${narrow ? i + 1 : `${i + 1}월`}</text>`;
  });
  if (monthly && usage != null) {
    s += `<line class="usage" x1="0" x2="${width}" y1="${f1(y(usage))}" y2="${f1(y(usage))}"/>`;
  }

  const label = monthly
    ? `월별 발전량. 가장 많은 달 ${iMax + 1}월 ${Math.round(data[iMax])} kWh, 가장 적은 달 ${iMin + 1}월 ${Math.round(data[iMin])} kWh`
      + (usage != null ? `, 월 사용량 ${Math.round(usage)} kWh` : '')
    : '지역을 고르면 월별 발전량이 나와요';
  const table = monthly
    ? `<table class="sr-only"><caption>월별 발전량(kWh)</caption><tbody>${data
      .map((v, i) => `<tr><th scope="row">${i + 1}월</th><td>${Math.round(v)}</td></tr>`).join('')}</tbody></table>`
    : '';
  el.classList.toggle('is-ghost', !monthly);
  el.innerHTML = `<svg width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="img" aria-label="${esc(label)}">${s}</svg>${table}`;
  return parts.some((p) => p.extra > 0);
}
