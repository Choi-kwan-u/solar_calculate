// 월별 발전량 막대 12개 — 라이브러리 없이 SVG. 축선 없이 막대 위에 값(kWh), 아래에 월.
// 값이 전부 붙어 있으니 축이 없어도 되고, 스크린리더용 표를 같이 만든다.

const H = 150;          // 전체 높이(px)
const TOP = 20;         // 값 라벨 자리
const BOTTOM = 22;      // 월 라벨 자리
const BAR_MAX = 24;     // 막대는 칸을 다 채우지 않는다
const RADIUS = 4;       // 위쪽만 둥글게, 바닥은 각지게

// 지역을 고르기 전 흐리게 보여 줄 모양(값 없음)
const GHOST = [2.3, 3.1, 4.2, 5.0, 5.5, 5.1, 4.3, 4.6, 4.1, 3.5, 2.5, 2.1];

function columnPath(x, y, w, h) {
  const r = Math.min(RADIUS, w / 2, h);
  return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`;
}

/** el: 차트 컨테이너. values: kWh 12개 또는 null(빈 상태) */
export function renderChart(el, values) {
  const width = Math.max(240, Math.floor(el.clientWidth || 320));
  const slot = width / 12;
  const barW = Math.min(BAR_MAX, slot * 0.62);
  const data = values ?? GHOST;
  const max = Math.max(...data) || 1;
  const plotH = H - TOP - BOTTOM;

  // 좁으면 쉼표·'월'을 빼서 라벨이 옆 칸을 침범하지 않게
  const narrow = slot < 34;
  const label = (v) => (narrow ? String(Math.round(v)) : Math.round(v).toLocaleString('ko-KR'));
  const longest = Math.max(...data.map((v) => label(v).length));
  const valueSize = Math.max(8.5, Math.min(12, (slot - 2) / (longest * 0.62)));

  let marks = '';
  data.forEach((v, i) => {
    const h = Math.max(2, (v / max) * plotH);
    const x = i * slot + (slot - barW) / 2;
    const y = TOP + plotH - h;
    const cx = (x + barW / 2).toFixed(1);
    const month = `${i + 1}월`;
    marks += `<path class="bar" d="${columnPath(x, y, barW, h)}">`
      + (values ? `<title>${month} ${label(v)} kWh</title>` : '') + '</path>';
    if (values) marks += `<text class="val" x="${cx}" y="${(y - 5).toFixed(1)}" font-size="${valueSize.toFixed(1)}">${label(v)}</text>`;
    marks += `<text class="month" x="${cx}" y="${H - 6}">${narrow ? i + 1 : month}</text>`;
  });

  const summary = values
    ? `월별 발전량. 가장 많은 달 ${data.indexOf(max) + 1}월 ${label(max)} kWh, 가장 적은 달 ${data.indexOf(Math.min(...data)) + 1}월 ${label(Math.min(...data))} kWh`
    : '지역을 고르면 월별 발전량이 나와요';
  const table = values
    ? `<table class="sr-only"><caption>월별 발전량(kWh)</caption><tbody>${data
      .map((v, i) => `<tr><th scope="row">${i + 1}월</th><td>${Math.round(v)}</td></tr>`).join('')}</tbody></table>`
    : '';

  el.classList.toggle('is-ghost', !values);
  el.innerHTML = `<svg width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="img" aria-label="${summary}">${marks}</svg>${table}`;
}
