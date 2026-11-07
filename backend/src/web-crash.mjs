// P84: 웹 화면(휴대폰 Safari 등)이 정상 떠남(pagehide) 없이 다시 읽혔을 때 창이 알리는 직전 상태. 연결 기록(remote-log.jsonl)의 boot 줄에 남는다.
// 창(app/src/renderer/lib/crumbs.js)이 localStorage에 적어 둔 값을 다음 부팅에 web.boot로 보낸다. 정한 숫자와 짧은 코드만 받는다(글·화면 내용 없음).
// - ago: 마지막으로 살아 있던 때부터 다음 부팅까지 ms, up: 부팅부터 마지막으로 살아 있던 때까지 ms
// - view: 화면(board 보드, list 목록, session 목록의 세션, full 전체 보기), terms: 붙은 터미널 수, px: 터미널 캔버스 장치 픽셀 합, atlas: 글자 아틀라스 장치 픽셀 합,
//   gl: WebGL 터미널 수, dpr: devicePixelRatio, inB: 받은 바이트, boots: 짧은 사이에 이어 죽은 수, hidden: 가려진(백그라운드) 채 죽음,
//   light: 가벼운 화면에서 죽음, retry: 가벼운 화면에서 "보드로 다시 열기"를 누른 뒤 죽음
export const CRASH_VIEWS = ['board', 'list', 'session', 'full'];
const int = (v, max) => (Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), max) : null);

export function crashInfo(f) {
  if (!f || typeof f !== 'object') return null;
  const o = {};
  for (const [k, max] of [['ago', 864e5 * 30], ['up', 864e5 * 30], ['terms', 999], ['px', 1e10], ['atlas', 1e10], ['gl', 999], ['inB', 1e13], ['boots', 999]]) { const v = int(f[k], max); if (v != null) o[k] = v; }
  if (CRASH_VIEWS.includes(f.view)) o.view = f.view;
  if (Number.isFinite(f.dpr) && f.dpr > 0 && f.dpr <= 10) o.dpr = Math.round(f.dpr * 100) / 100;
  for (const k of ['hidden', 'light', 'retry']) if (f[k] === true) o[k] = true;
  return Object.keys(o).length ? o : null;
}

// 연결 기록 화면과 CLI의 짧은 글(예: "board · 3 term · 2.1M px · gl 3 · dpr 3 · 6.0s")
export function crashLabel(c) {
  if (!c) return '';
  const parts = [];
  if (c.view) parts.push(c.view);
  if (c.terms != null) parts.push(`${c.terms} term`);
  if (c.px != null || c.atlas != null) parts.push(`${(((c.px || 0) + (c.atlas || 0)) / 1e6).toFixed(1)}M px`);
  if (c.gl != null) parts.push(`gl ${c.gl}`);
  if (c.dpr != null) parts.push(`dpr ${c.dpr}`);
  if (c.up != null) parts.push(`${(c.up / 1000).toFixed(c.up < 10000 ? 1 : 0)}s`);
  if (c.hidden) parts.push('hidden');
  if (c.light) parts.push('light');
  return parts.join(' · ');
}
