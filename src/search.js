// 시군구 자동완성. 띄어쓰기 무시, 초성(ㅇㅅ → 안산), 조합 중인 글자(상로 → 상록),
// 단어 건너뛰기(경기 상록 → 경기 안산시 상록구), 옛 이름(광주 북구, 인천 서구)까지 찾는다.

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ',
  'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

/** 완성형 한글이면 0~11171, 아니면 -1 */
const syl = (c) => {
  const k = c === undefined ? -1 : c.charCodeAt(0) - 0xac00;
  return k >= 0 && k < 11172 ? k : -1;
};
const choOf = (k) => CHO[Math.floor(k / 588)];

/** 같은 글자이거나, q가 t의 초성 */
function same(q, t) {
  if (q === t) return true;
  const k = syl(t);
  return k >= 0 && CHO.includes(q) && choOf(k) === q;
}

/** 마지막 글자는 아직 조합 중일 수 있다 — '로'는 '록'의 앞부분, '앗'은 '아산'의 앞부분 */
function sameLast(q, t, next) {
  if (same(q, t)) return true;
  const a = syl(q), b = syl(t);
  if (a < 0 || b < 0 || Math.floor(a / 28) !== Math.floor(b / 28)) return false; // 초·중성이 다름
  if (a % 28 === 0) return true;
  const n = syl(next);
  return b % 28 === 0 && n >= 0 && choOf(n) === JONG[a % 28]; // 받침이 다음 글자 초성으로 넘어갈 참
}

function matchAt(q, s, i) {
  const last = q.length - 1;
  for (let j = 0; j < last; j++) if (!same(q[j], s[i + j])) return false;
  return sameLast(q[last], s[i + last], s[i + last + 1]);
}

function prepare(text) {
  const tokens = text.trim().split(/\s+/);
  const starts = new Set();
  let p = 0;
  for (const t of tokens) { starts.add(p); p += t.length; }
  return { tokens, flat: tokens.join(''), starts };
}

// 낮을수록 위: 0 단어 첫머리부터 연속 일치 · 1 단어를 건너뛰며 일치 · 2 단어 중간부터 일치
function rank(qTokens, qFlat, form) {
  let mid = false;
  for (let i = 0; i + qFlat.length <= form.flat.length; i++) {
    if (!matchAt(qFlat, form.flat, i)) continue;
    if (form.starts.has(i)) return 0;
    mid = true;
  }
  if (qTokens.length > 1) {
    let t = 0;
    for (const q of qTokens) {
      while (t < form.tokens.length && !matchAt(q, form.tokens[t], 0)) t++;
      if (t++ === form.tokens.length) return mid ? 2 : Infinity;
    }
    return 1;
  }
  return mid ? 2 : Infinity;
}

/** regions: psh.json의 { 이름: { aliases, ... } } */
export function buildIndex(regions) {
  return Object.entries(regions).map(([name, region], order) => ({
    name, region, order,
    forms: [name, ...(region.aliases ?? [])].map(prepare),
  }));
}

/** → { items: [{ name, region }], total } — 이름이 옛 이름보다, 공식 순서(코드순)가 뒤보다 앞 */
export function search(index, query, limit = 8) {
  const qTokens = query.trim().split(/\s+/).filter(Boolean);
  if (!qTokens.length) return { items: [], total: 0 };
  const qFlat = qTokens.join('');
  const hits = [];
  for (const entry of index) {
    let best = Infinity;
    entry.forms.forEach((form, k) => { best = Math.min(best, rank(qTokens, qFlat, form) + (k ? 0.5 : 0)); });
    if (best < Infinity) hits.push([best, entry]);
  }
  hits.sort((a, b) => a[0] - b[0] || a[1].order - b[1].order);
  return { items: hits.slice(0, limit).map((h) => h[1]), total: hits.length };
}

/**
 * 콤보박스(WAI-ARIA combobox + listbox). 고르면 onSelect(entry).
 * 키보드: ↑↓ 이동, Enter 선택, Esc 닫기.
 */
export function mountSearch({ input, list, index, onSelect, onCancel }) {
  let items = [], active = -1;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  const highlight = (i) => {
    active = i;
    [...list.querySelectorAll('[role=option]')].forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
    if (i >= 0) {
      input.setAttribute('aria-activedescendant', `region-opt-${i}`);
      list.querySelector(`#region-opt-${i}`)?.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };

  const choose = (i) => {
    const entry = items[i];
    if (!entry) return;
    close();
    input.value = '';
    onSelect(entry);
  };

  const update = () => {
    const { items: found, total } = search(index, input.value);
    items = found;
    list.replaceChildren();
    if (!input.value.trim()) return close();
    if (!found.length) {
      const li = document.createElement('li');
      li.className = 'combo-empty';
      li.textContent = '맞는 시·군·구가 없어요';
      list.append(li);
    }
    found.forEach((entry, i) => {
      const li = document.createElement('li');
      li.id = `region-opt-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.textContent = entry.name;
      li.addEventListener('pointerdown', (e) => e.preventDefault()); // 입력창 포커스 유지
      li.addEventListener('click', () => choose(i));
      list.append(li);
    });
    if (total > found.length) {
      const li = document.createElement('li');
      li.className = 'combo-more';
      li.textContent = `외 ${total - found.length}곳 — 더 입력해 보세요`;
      list.append(li);
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight(found.length ? 0 : -1);
  };

  input.addEventListener('input', update);
  input.addEventListener('focus', () => input.value.trim() && update());
  input.addEventListener('blur', () => { close(); onCancel?.(); });
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return; // 한글 조합 중 Enter는 글자 확정용
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) return update();
      if (!items.length) return;
      const d = e.key === 'ArrowDown' ? 1 : -1;
      highlight((active + d + items.length) % items.length);
    } else if (e.key === 'Enter') {
      if (!list.hidden && active >= 0) { e.preventDefault(); choose(active); }
    } else if (e.key === 'Escape') {
      if (!list.hidden) { e.preventDefault(); close(); } else onCancel?.();
    }
  });
}
