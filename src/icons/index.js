// Lucide 아이콘(ISC, ./LICENSE.txt) — 기능이 있는 곳에만 쓴다(VISUAL.md 7장). 선 1.5px, 20px.

const PATHS = {
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  triangleAlert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
};

/** data-icon="search" 같은 빈 요소에 SVG를 채운다 */
export function mountIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    el.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"`
      + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[el.dataset.icon]}</svg>`;
  }
}
