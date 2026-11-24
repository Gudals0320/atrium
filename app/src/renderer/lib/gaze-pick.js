// P354: 시선 태그. 따로 고른 세션이 없고 명령줄이 비었으면, 판 화면 가운데에 놓인 세션을 받는 이로 저절로 태그한다(단위 시험 test/p354-lib.test.mjs).
//   판단만 여기 둔다(React 없는 순수 함수). 화면 이동을 지켜보다 멈춘 뒤 부르는 것은 GazeTag.jsx, 명령줄에 넣는 것은 CommandBar.jsx(lib/cmd-input.js autoTag와 같은 규칙).
// 규칙(값은 아래 상수):
//   - 후보: 화면에 일부라도 보이는 에이전트 세션. 셸(명령줄로 받지 않는다)과 끝난 세션은 뺀다
//   - 점수: 화면 가운데 점이 노드(보이는 부분) 안이면 1 + √(화면에서 차지하는 몫). 아니면 화면 가운데에서 보이는 부분의 가장 가까운 점까지 거리 d(화면 짧은 변 비율)로
//     (1 - d/MAX_DIST) × √(차지하는 몫). d가 MAX_DIST 밖이면 후보가 아니다(노드 가운데까지 재면 큰 노드가 바로 옆에 있어도 멀게 나온다)
//   - 멀리 축소(배율 MIN_ZOOM 아래)면 태그하지 않는다. 보이는 세션이 MANY 이상이면 가운데 점을 품은 노드만 1등이 될 수 있다
//   - 1등이 2등보다 LEAD배 앞서야 태그한다. 비슷하면 지금 태그가 아직 후보일 때 그대로 두고, 아니면 비운다(틀린 세션보다 빈 편이 낫다)
//   - 흔들림 막기: 지금 태그가 후보이고 새 1등과의 점수 차가 KEEP배 안이면 바꾸지 않는다
export const MIN_ZOOM = 0.2;
export const MAX_DIST = 0.35;
export const LEAD = 1.5;
export const KEEP = 1.25;
export const MANY = 6;

// 노드(월드 좌표 x, y, w, h)의 화면 상자. view = { x, y, zoom }(React Flow 변환)
export function screenRect(n, view) {
  const z = view.zoom;
  return { l: n.x * z + view.x, t: n.y * z + view.y, r: (n.x + n.w) * z + view.x, b: (n.y + n.h) * z + view.y };
}
// 화면(0,0 ~ width,height) 안에 보이는 부분. 없으면 null
export function visiblePart(r, screen) {
  const l = Math.max(0, r.l), t = Math.max(0, r.t), rr = Math.min(screen.width, r.r), b = Math.min(screen.height, r.b);
  return rr > l && b > t ? { l, t, r: rr, b } : null;
}
// 노드가 화면에 조금이라도 보이나(누른 세션의 고름이 풀리는 때: 화면 밖으로 완전히 나감)
export function onScreen(n, view, screen) {
  if (!n || !view || !screen) return false;
  return !!visiblePart(screenRect(n, view), screen);
}
// 받을 수 있는 세션인가: 셸·끝난 세션은 아니다(잠든 세션은 판이 깨워 넣는다)
export const canReceive = (s) => !!s && s.kind !== 'shell' && s.state !== 'exited';

// 후보마다 점수 → [{ id, name, score, inside }] 높은 차례
export function gazeScores({ nodes, view, screen }) {
  const W = screen.width, H = screen.height;
  if (!(W > 0) || !(H > 0) || !view || !(view.zoom > 0)) return [];
  const cx = W / 2, cy = H / 2, short = Math.min(W, H), area = W * H;
  const out = [];
  for (const n of nodes || []) {
    if (!n || !(n.w > 0) || !(n.h > 0)) continue;
    const v = visiblePart(screenRect(n, view), screen);
    if (!v) continue;
    const share = ((v.r - v.l) * (v.b - v.t)) / area;
    const inside = cx >= v.l && cx <= v.r && cy >= v.t && cy <= v.b;
    let score;
    if (inside) score = 1 + Math.sqrt(share);
    else {
      const dx = Math.max(v.l - cx, 0, cx - v.r), dy = Math.max(v.t - cy, 0, cy - v.b);
      const d = Math.hypot(dx, dy) / short;
      if (d >= MAX_DIST) continue;
      score = (1 - d / MAX_DIST) * Math.sqrt(share);
    }
    out.push({ id: n.id, name: n.name, score, inside });
  }
  return out.sort((a, b) => b.score - a.score);
}

// 고른다 → { id, name } 또는 null.
//   nodes: [{ id, name, x, y, w, h }](받을 수 있는 세션만, canReceive로 거른 것), view: { x, y, zoom }, screen: { width, height },
//   current: 지금 저절로 태그된 세션 id(없으면 null). visible: 화면에 보이는 받을 수 있는 세션 수(없으면 nodes에서 센다)
export function gazePick({ nodes, view, screen, current = null }) {
  if (!view || !(view.zoom >= MIN_ZOOM)) return null;
  const all = gazeScores({ nodes, view, screen });
  const shown = (nodes || []).filter((n) => n && n.w > 0 && n.h > 0 && visiblePart(screenRect(n, view), screen)).length;
  const list = shown >= MANY ? all.filter((x) => x.inside) : all;
  const cur = current != null ? list.find((x) => x.id === current) || null : null;
  const pick = (x) => (x ? { id: x.id, name: x.name } : null);
  if (!list.length) return null;
  const [a, b] = list;
  const clear = !b || a.score >= b.score * LEAD;
  if (!clear) return pick(cur); // 비슷하다: 지금 태그가 아직 후보면 그대로, 아니면 비운다
  if (cur && cur.id !== a.id && a.score < cur.score * KEEP) return pick(cur); // 흔들림 막기
  return pick(a);
}

// 명령줄에 시선 태그를 넣을지(CommandBar.jsx). st = { text, auto, by }(by: 'click' 누른 세션 | 'gaze' 시선 | null), name = 고른 세션 이름(없으면 null).
//   release: 누른 세션이 화면 밖으로 나가 고름이 풀렸다. 누른 세션의 태그는 풀리기 전에는 시선이 바꾸지 않는다.
//   글이 비었거나 저절로 넣은 태그 하나만 있을 때만 바꾼다(lib/cmd-input.js autoTag, 사람이 한 글자라도 고치면 사람 것) → { text, auto, by }
export function gazeTag(st, name, { release = false } = {}, autoTag) {
  if (st.by === 'click' && !release) return st;
  const r = autoTag({ text: st.text, auto: st.auto }, name || null);
  return { text: r.text, auto: r.auto, by: r.auto ? 'gaze' : null };
}

// 설정(이 창 프로필의 localStorage, 기본 켬). 끄면 '0'을 둔다
export const GAZE_KEY = 'mt.gazeTag';
export function loadGazeOn(storage) { try { return !storage || storage.getItem(GAZE_KEY) !== '0'; } catch { return true; } }
export function saveGazeOn(storage, on) {
  try { if (storage) { if (on) storage.removeItem(GAZE_KEY); else storage.setItem(GAZE_KEY, '0'); } } catch { /* 저장소를 못 쓰면 이 창에서만 */ }
  return !!on;
}
