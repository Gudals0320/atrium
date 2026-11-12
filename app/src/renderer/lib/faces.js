// 세션 노드의 세 얼굴(ARCH 7.2)과 화면 스트림을 붙일 노드 고르기(7.4, BRIEF 위험 2). 순수 함수만 둔다(단위 시험 있음).
//
// 얼굴은 노드가 화면에서 차지하는 너비로 정한다(P2에서 정한 기준):
//   가까이(close)  화면 너비 360px 이상: 실제 터미널(xterm.js). 기본 노드 720px이면 배율 0.5 이상
//   중간(middle)   200px 이상: 대화 보기(대화 기록)
//   멀리(far)      그보다 작으면: 요약. OpenCove의 개요 모드(배율 0.4 미만)와 같은 생각
// 제어기(herdr 제어기 프로세스, 약 17MB)는 가까이 얼굴이면서 화면에 보이는 노드에만, 화면 가운데에 가까운 순서로 상한까지 붙인다.

export const FACE_CLOSE_PX = 360;
export const FACE_MIDDLE_PX = 200;
export const DEFAULT_MAX_CONTROLLERS = 8;
export const DEFAULT_WEBGL_BUDGET = 8; // OpenCove DEFAULT_WEBGL_RENDERER_BUDGET과 같은 값. 넘으면 DOM으로 그린다

// P3: 경계에서 얼굴이 흔들리지 않게 이력(hysteresis)을 둔다. 이미 가까이 얼굴인 노드는 360 - 16px까지 가까이로 남는다.
// 기본 노드 720px을 배율 0.5에 맞추면 정확히 경계(360px)라, 배율이 0.4999로만 흔들려도 모든 터미널이 한꺼번에 놓인다(E5 2.5 후보 원인, docs/log/p3-v02.md 보고 3.3).
export const FACE_HYSTERESIS_PX = 16;

// P10: 아이콘(icon) 화면 너비 140px 아래: 글을 넣지 않고 에이전트 종류 아이콘과 상태 색만(lib/kinds.js). 140px이면 12px 글자가 한 줄에 열 자 남짓이라,
// 그보다 좁으면 이름과 상태 필만으로도 줄이 깨진다. 경계 이력은 다른 얼굴과 같다
export const FACE_ICON_PX = 140;

export function faceFor(nodeWidth, zoom, prev = null) {
  const px = nodeWidth * zoom;
  if (px >= FACE_CLOSE_PX || (prev === 'close' && px >= FACE_CLOSE_PX - FACE_HYSTERESIS_PX)) return 'close';
  if (px >= FACE_MIDDLE_PX || ((prev === 'close' || prev === 'middle') && px >= FACE_MIDDLE_PX - FACE_HYSTERESIS_PX)) return 'middle';
  if (px >= FACE_ICON_PX || (prev && prev !== 'icon' && px >= FACE_ICON_PX - FACE_HYSTERESIS_PX)) return 'far';
  return 'icon';
}

// P121: 터미널은 고른 워크스페이스의 세션만 갖는다. 다른 워크스페이스의 세션은 가까이 크기여도 요약 얼굴(far)을 보이고,
// 그 노드를 누르거나(초점) 고르거나, 노드가 화면을 아주 가깝게 채울 만큼 확대하면 터미널을 갖는다.
// "아주 가까이": 노드가 화면에 보이는 넓이가 캔버스 넓이의 35% 이상(16:9 노드가 16:9 캔버스 너비의 60%쯤을 채울 때). 노드를 누르면 85%를 채우게 옮기므로(H4)
// 그보다 작은 값이다. 노드 크기가 아니라 화면 안에 든 넓이로 보므로, 누른 노드 곁에 조금 걸친 이웃 노드는 아니다.
// 이미 아주 가까이였던 노드는 30%까지 남는다(경계에서 터미널이 붙었다 떨어졌다 하지 않게)
export const VERY_CLOSE_FRAC = 0.35;
export const VERY_CLOSE_KEEP = 0.3;
// rect: 노드 { x, y, w, h }(판 좌표), viewport: { x, y, zoom }, screen: { width, height }
export function veryClose(rect, viewport, screen, prev = false) {
  if (!rect || !viewport || !screen || !(screen.width > 0) || !(screen.height > 0)) return false;
  const { x: vx, y: vy, zoom } = viewport;
  const l = Math.max(0, rect.x * zoom + vx), t = Math.max(0, rect.y * zoom + vy);
  const r = Math.min(screen.width, (rect.x + rect.w) * zoom + vx), b = Math.min(screen.height, (rect.y + rect.h) * zoom + vy);
  if (r <= l || b <= t) return false;
  return (r - l) * (b - t) >= screen.width * screen.height * (prev ? VERY_CLOSE_KEEP : VERY_CLOSE_FRAC);
}
// 이 세션 노드가 터미널을 가질 수 있나. viewWs: 고른 워크스페이스 키(null이면 고른 것 없음: 초점·고른 노드·아주 가까운 노드만).
// ws: 노드의 워크스페이스 키, focus: 초점 노드 id, selected: 고른 노드 id 모음(Set), near: 아주 가까이(veryClose)
export function termAllowed({ id, ws, viewWs, focus = null, selected = null, near = false }) {
  if (near) return true;
  if (id != null && id === focus) return true;
  if (selected && selected.has(id)) return true;
  return viewWs != null && (ws || null) === viewWs;
}
// 다른 워크스페이스 노드(요약 얼굴)의 글자 크기는 배율을 계단으로 따른다. 배율 1.1배마다 한 계단(가장 가까운 계단으로 반올림, 차이 ±5% 안).
// 판을 확대·축소하는 동안 이 노드들은 계단이 바뀔 때만 다시 그린다(P112의 매 프레임 글자 크기 맞추기를 하지 않는다)
export const ZOOM_STEP = 1.1;
export const zoomStep = (z) => { const v = Math.max(Number.isFinite(z) ? z : 1, 0.02); return ZOOM_STEP ** Math.round(Math.log(v) / Math.log(ZOOM_STEP)); };

// nodes: [{ id, x, y, w, h, ws? }] (판 좌표), viewport: { x, y, zoom } (React Flow), screen: { width, height } (화면 px)
// 돌려줌: 제어기를 붙일 노드 id 목록(가까운 순). margin만큼 화면 밖도 보이는 것으로 친다(끌 때 깜빡이지 않게).
// prev: 지금 붙어 있는 노드 id 모음. 그 노드에는 얼굴 이력을 적용한다(SessionNode와 같은 기준).
// focus(초점 노드 id), selected(고른 노드 id 모음): 보이고 가까이 얼굴이면 거리와 상관없이 상한 안에 먼저 넣는다(이슈 #1-16). 초점이 먼저다
// P121 wsLimit: { key } 를 주면 termAllowed를 따른다(key가 고른 워크스페이스, null이면 고른 것 없음). 주지 않으면 워크스페이스로 거르지 않는다
export function pickAttached(nodes, viewport, screen, { max = DEFAULT_MAX_CONTROLLERS, margin = 80, prev = null, focus = null, selected = null, wsLimit = null } = {}) {
  const { x: vx, y: vy, zoom } = viewport;
  const cx = screen.width / 2, cy = screen.height / 2;
  const seen = [];
  for (const n of nodes) {
    if (faceFor(n.w, zoom, prev && prev.has(n.id) ? 'close' : null) !== 'close') continue;
    if (wsLimit && !termAllowed({ id: n.id, ws: n.ws, viewWs: wsLimit.key ?? null, focus, selected, near: veryClose(n, viewport, screen, !!(prev && prev.has(n.id))) })) continue;
    const left = n.x * zoom + vx, top = n.y * zoom + vy, right = left + n.w * zoom, bottom = top + n.h * zoom;
    if (right < -margin || bottom < -margin || left > screen.width + margin || top > screen.height + margin) continue;
    const dx = clampDist(cx, left, right), dy = clampDist(cy, top, bottom);
    seen.push({ id: n.id, d: dx * dx + dy * dy, rank: n.id === focus ? 0 : selected && selected.has(n.id) ? 1 : 2 });
  }
  seen.sort((a, b) => a.rank - b.rank || a.d - b.d);
  return seen.slice(0, max).map((s) => s.id);
}
const clampDist = (c, lo, hi) => (c < lo ? lo - c : c > hi ? c - hi : 0);

// WebGL 렌더러 예산(BRIEF 위험 2). Chromium은 살아 있는 WebGL 컨텍스트 수가 적고 넘으면 오래된 것부터 잃는다.
// 예산 안이면 WebGL, 넘으면 DOM. 컨텍스트를 잃으면 그 터미널은 DOM으로 돌아가고 자리를 돌려준다.
export class RendererBudget {
  constructor(budget = DEFAULT_WEBGL_BUDGET) { this.budget = budget; this.holders = new Set(); this.lost = 0; }
  acquire(id) {
    if (this.holders.has(id)) return 'webgl';
    if (this.holders.size >= this.budget) return 'dom';
    this.holders.add(id);
    return 'webgl';
  }
  release(id, { contextLost = false } = {}) { if (this.holders.delete(id) && contextLost) this.lost++; }
  get used() { return this.holders.size; }
}

// N 이동 순서: 내 차례(waiting, trust_wait)를 오래 기다린 순서로, 그다음 오류(ARCH 4절 A1, 참고 제품의 needs you는 오류도 포함)
export function inboxOf(sessions) {
  const askSince = (s) => (s.ask && s.ask.since) || s.createdAt;
  const needsYou = sessions.filter((s) => s.state === 'waiting' || s.state === 'trust_wait').sort((a, b) => askSince(a) - askSince(b));
  const review = sessions.filter((s) => s.unseen && s.state !== 'waiting' && s.state !== 'trust_wait').sort((a, b) => ((a.turn && a.turn.endedAt) || 0) - ((b.turn && b.turn.endedAt) || 0));
  const problems = sessions.filter((s) => s.state === 'error' || (s.state === 'exited' && s.exit && s.exit.kind !== 'normal'));
  return { needsYou, review, problems };
}

export function nextTarget(order, currentId) {
  if (!order.length) return null;
  const i = order.indexOf(currentId);
  return order[(i + 1) % order.length];
}
