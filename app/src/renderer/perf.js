// E5 측정값: 프레임 수와 양, 프레임을 받아 xterm에 다 쓰기까지의 시간, 화면 갱신(requestAnimationFrame) 간격, 입력 → 프레임 지연.
// 시험 스크립트가 window.__mt로 읽는다.

const MAX = 4000;
export const perf = {
  frames: 0, bytes: 0,
  writeMs: [], // 프레임 받음 → xterm write 끝
  rafGaps: [], // 화면 갱신 간격
  terminals: new Map(), // sessionId → { renderer, frames, bytes, cols, rows }
  echo: [], // 입력 → 다음 프레임
  pendingEcho: new Map(),
};
const push = (arr, v) => { arr.push(v); if (arr.length > MAX) arr.splice(0, arr.length - MAX); };

// 창 안의 사건 기록(P3): 터미널 붙기·놓기, 제어기 대상 바뀜, WebGL 컨텍스트, 노드 오류, 알림. E5 2.5 조사와 시험이 읽는다.
export const events = [];
// ?trace=1이면 창 로그(app-main.log)에도 남긴다. 창이 다시 읽혀도 남는다
const TRACE = new URLSearchParams(location.search).get('trace') === '1' || (() => { try { return localStorage.getItem('mt.trace') === '1'; } catch { return false; } })();
export function perfLog(kind, data = {}) {
  const e = { t: Date.now(), kind, ...data };
  events.push(e);
  if (events.length > 2000) events.splice(0, events.length - 2000);
  if (TRACE) try { window.mt.log(`trace ${kind} ${JSON.stringify(data).slice(0, 400)}`); } catch {}
  return e;
}
if (TRACE) {
  window.addEventListener('pagehide', () => perfLog('pagehide'));
  window.addEventListener('beforeunload', () => perfLog('beforeunload'));
}

export function onFrame(sessionId, bytes, w, h) {
  perf.frames++; perf.bytes += bytes;
  const t = perf.terminals.get(sessionId);
  if (t) { t.frames++; t.bytes += bytes; if (w) { t.frameW = w; t.frameH = h; } }
  const e = perf.pendingEcho.get(sessionId);
  if (e) { perf.pendingEcho.delete(sessionId); push(perf.echo, performance.now() - e); }
  return performance.now();
}
export function onWritten(t0) { push(perf.writeMs, performance.now() - t0); }
export function markInput(sessionId) { if (!perf.pendingEcho.has(sessionId)) perf.pendingEcho.set(sessionId, performance.now()); }
export function setTerminal(sessionId, info) { if (info) perf.terminals.set(sessionId, { frames: 0, bytes: 0, ...perf.terminals.get(sessionId), ...info }); else perf.terminals.delete(sessionId); }

let last = performance.now();
function tick(now) { push(perf.rafGaps, now - last); last = now; requestAnimationFrame(tick); }
requestAnimationFrame(tick);

function stats(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, median: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +s[s.length - 1].toFixed(2) };
}

export function snapshot() {
  return {
    frames: perf.frames, bytes: perf.bytes,
    writeMs: stats(perf.writeMs), rafGapMs: stats(perf.rafGaps), echoMs: stats(perf.echo),
    longFrames: perf.rafGaps.filter((g) => g > 50).length,
    terminals: Object.fromEntries(perf.terminals),
  };
}
export function reset() { perf.frames = 0; perf.bytes = 0; perf.writeMs = []; perf.rafGaps = []; perf.echo = []; for (const t of perf.terminals.values()) { t.frames = 0; t.bytes = 0; } }
