// 화면 숫자 표기. 결과는 ±20% 흔들리는 추정치라 유효숫자를 줄이고 "약"을 붙인다(설계 6.5).

const nf = new Intl.NumberFormat('ko-KR');
const sig3 = new Intl.NumberFormat('ko-KR', { maximumSignificantDigits: 3 });

/** 유효숫자 n자리 반올림 */
export function roundSig(x, n) {
  if (!x) return 0;
  const e = Math.ceil(Math.log10(Math.abs(x))) - n; // 버릴 자릿수
  return e >= 0 ? Math.round(x / 10 ** e) * 10 ** e : Math.round(x * 10 ** -e) / 10 ** -e;
}

export const int = (x) => nf.format(Math.round(x));
export const won = (x) => `${int(x)}원`;

/** 대략 금액 → [숫자, 단위]. 1,606 → ['1,600', '원'], 48,861 → ['4.9', '만 원'] */
export function approxWon(x) {
  if (!Number.isFinite(x)) return ['—', ''];
  if (x < 10_000) return [nf.format(roundSig(x, 2)), '원'];
  if (x < 1_000_000) return [nf.format(roundSig(x / 10_000, 2)), '만 원'];
  if (x < 100_000_000) return [nf.format(Math.round(x / 10_000)), '만 원'];
  return [nf.format(roundSig(x / 1e8, 2)), '억 원'];
}

/** 발전량 kWh: 100 미만은 소수 한 자리, 그 위는 유효숫자 3자리 */
export const kwh = (x) => (Math.abs(x) < 100 ? x.toFixed(1) : sig3.format(x));

/** 손익분기 → { main, sub }. range = [빨리 회수, 늦게 회수] 일수 */
export function breakEven([fast, slow], mid) {
  if (mid === 0) return { main: '바로 회수', sub: '보조금이 설치비보다 커요' };
  if (!Number.isFinite(mid)) return { main: '회수 어려움', sub: '아끼는 전기요금이 없어요' };
  const a = Math.round(fast / 365);
  const b = Number.isFinite(slow) ? Math.round(slow / 365) : null;
  const main = b === null ? `약 ${a}년 이상` : a === b ? `약 ${a}년` : `약 ${a}~${b}년`;
  return { main, sub: `중앙 ${(mid / 365).toFixed(1)}년 · ${int(mid)}일` };
}
