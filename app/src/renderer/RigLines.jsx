// P251: 캔버스의 rig 길 선(docs research rig3-map.md 4절)과 역할 노드 꼬리표.
// P254: 사용자의 시안 V7 "새 rig · 캔버스의 길 선"을 그대로 옮겼다(lib/rig-map.js V7 치수·색).
// - 두 역할 사이에 선 두 줄: 위 줄은 왼쪽 노드 → 오른쪽 노드 길(굵기 2, 오른쪽 끝 화살촉), 아래 줄은 돌아오는 길(굵기 1.5, 왼쪽 끝 화살촉).
//   위 줄 글은 선 위("스냅숏 →"), 아래 줄 글은 선 아래("← 데이터 요청"), 기다림 수는 그 아래 "대기 n". 그 방향 길이 없으면 그 줄을 긋지 않는다.
//   일하는 역할에 닿은 쌍(두 끝 중 하나가 일함)은 선과 글이 밝고(#ECE9E1) 나머지는 흐리다(#8E8B83). 끝나지 않은 반려는 그 줄 시작에 붉은 점.
//   굵기·글·점은 화면 px로 시안과 같다(배율이 바뀌어도 같은 크기: 세계 크기 = 시안 값 / 배율).
//   정의에서 나오는 선이라 연결 기록(link)과 섞지 않고 끊기가 없다. 줄(글)을 누르면 그 길로 최근 오간 항목이 뜬다.
// - 올림: 역할이 빌더에게 올린 것이 기다리는 동안만 역할 → 빌더 노랑 점선 화살표와 "올림" 글.
// - 꼬리표(RigTag): 역할 노드 "역할 · <이름> · v<판>", 빌더 노드 "rig 빌더"(노랑 바탕). 일반 세션에는 새 꼬리표가 없다.
import { useState } from 'react';
import { EdgeLabelRenderer, ViewportPortal, useStore as useFlowStore } from '@xyflow/react';
import { useStore, getState, openDialog } from './store.js';
import { useT, fmtTime } from './lib/i18n.js';
import { rigTag, rigFrames, periodText, lineText, twoLines, polyLines, labelSpots, textW13, pairLit, pathD, V7, RIG_VIEW } from './lib/rig-map.js';

const zoomOf = (s) => s.transform[2];
const safeId = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_');
// 시안의 화살촉(채운 삼각형, 굵기에 비례). 줄마다 색이 달라 줄마다 둔다
const Tip = ({ id, color }) => <marker id={id} orient="auto" markerWidth="5" markerHeight="5" refX="2" refY="2" overflow="visible"><path d="M0 0 L4 2 L0 4 Z" fill={color} stroke="none" /></marker>;
// 글 칸: 세계 자리 [x, y]를 가운데로, 화면 크기는 시안 그대로(scale = 1/배율)
const at = (p, k, ax = '-50%', rot = 0) => ({ transform: `translate(${p[0]}px, ${p[1]}px) scale(${k})${rot ? ` rotate(${rot}deg)` : ''} translate(${ax}, -50%)`, transformOrigin: '0 0' });
// P254(2차): 비스듬한 곧은 선(수평에서 1~45도)의 글은 선과 나란히 돌리고 시안처럼 줄 바로 위(앞 줄)·바로 아래(돌아오는 줄)에 붙인다. 가로·세로 선과 꺾은선은 그대로
const slant = (P, Q) => { const d = Math.atan2(Q[1] - P[1], Q[0] - P[0]) * 180 / Math.PI; return Math.abs(d) > 1 && Math.abs(d) <= 45 ? d : 0; };

export function RigPathEdge({ id, sourceX, sourceY, targetX, targetY, data }) {
  const t = useT();
  const zoom = useFlowStore(zoomOf);
  const [open, setOpen] = useState(false);
  const m = useStore((st) => (data ? st.rigMaps.get(data.ws) : null));
  const aWork = useStore((st) => !!data && (st.sessions.get(data.source) || {}).state === 'working');
  const bWork = useStore((st) => !!data && (st.sessions.get(data.target) || {}).state === 'working');
  if (!data || !data.lines) return null;
  const k = 1 / (zoom || 1);
  // 왼쪽(가로가 더 길면 x, 세로가 더 길면 y가 작은 쪽) 노드 → 오른쪽 노드 줄이 위 줄
  // P254: 다른 노드를 지나는 선은 Canvas가 준 직각 길(data.route, a 쪽 → b 쪽)을 따른다
  //   끝점은 Canvas가 나눈 자리(data.ends: 같은 변을 여러 선이 쓸 때)
  const S0 = data.route ? data.route[0] : data.ends ? data.ends[0] : [sourceX, sourceY], T0 = data.route ? data.route[data.route.length - 1] : data.ends ? data.ends[1] : [targetX, targetY];
  const dx = T0[0] - S0[0], dy = T0[1] - S0[1];
  const aLeft = Math.abs(dx) >= Math.abs(dy) ? dx >= 0 : dy >= 0;
  const P = aLeft ? S0 : T0, Q = aLeft ? T0 : S0;
  const route = data.route ? (aLeft ? data.route : [...data.route].reverse()) : null;
  const top = aLeft ? data.lines.top : data.lines.bottom, bottom = aLeft ? data.lines.bottom : data.lines.top;
  const left = aLeft ? data.a : data.b, right = aLeft ? data.b : data.a;
  const g = route ? polyLines(route, k) : twoLines(P, Q, k);
  // P254: 세로·비스듬한 줄에서도 글이 줄 바깥에 붙게 글 폭으로 자리를 잰다
  const tw = (s) => Math.max(V7.LABW, textW13(s));
  const rot = route ? 0 : slant(P, Q);
  const spot = rot ? { topLab: g.topLab, botLab: g.botLab, wait: g.wait } : labelSpots(g.mid, g.n, k, { topW: tw(lineText(top, 'top')), botW: tw(lineText(bottom, 'bottom')), waitW: Math.max(V7.WAITW, textW13(t('rigV7.wait', { n: data.lines.waiting }))) });
  const lit = pairLit(data.a, data.b, (r) => (r === data.a ? aWork : r === data.b ? bWork : false));
  const color = lit ? V7.C.lit : V7.C.dim;
  const tid = safeId(id);
  const flows = m ? data.flows.map((i) => (m.flows || [])[i]).filter(Boolean) : [];
  const recent = flows.flatMap((f) => (f.last || []).map((x) => ({ ...x, item: f.item }))).sort((a, b) => b.t - a.t).slice(0, 6);
  const toggle = (e) => { e.stopPropagation(); setOpen((v) => !v); };
  return <>
    <g className={`mt-rig7${lit ? ' lit' : ''}`} data-role="rig-path" data-edge={id} data-a={data.a} data-b={data.b} data-lit={lit ? '1' : '0'}>
      <defs><Tip id={`${tid}-t`} color={color} /><Tip id={`${tid}-b`} color={color} /></defs>
      {top ? <path className="mt-rig7-line top" data-role="rig-line" data-line="top" data-routed={route ? '1' : '0'} data-from={left} data-to={right} d={g.top.d} fill="none" stroke={color} strokeWidth={V7.W1 * k} strokeLinecap="round" markerEnd={`url(#${tid}-t)`} /> : null}
      {bottom ? <path className="mt-rig7-line bottom" data-role="rig-line" data-line="bottom" data-from={right} data-to={left} d={g.bottom.d} fill="none" stroke={color} strokeWidth={V7.W2 * k} strokeLinecap="round" markerEnd={`url(#${tid}-b)`} /> : null}
      <path d={pathD(route || [P, Q])} className="mt-edge-hit" fill="none" stroke="transparent" strokeWidth={22 * k} onClick={toggle} />
      {top && top.open ? <circle className="mt-rig-open" data-role="rig-open-return" data-line="top" cx={g.dotTop[0]} cy={g.dotTop[1]} r={(V7.DOT / 2) * k} fill={V7.C.red} /> : null}
      {bottom && bottom.open ? <circle className="mt-rig-open" data-role="rig-open-return" data-line="bottom" cx={g.dotBot[0]} cy={g.dotBot[1]} r={(V7.DOT / 2) * k} fill={V7.C.red} /> : null}
    </g>
    <EdgeLabelRenderer>
      {top ? <div className={`mt-rig7-lab nodrag nopan${lit ? ' lit' : ''}`} style={at(spot.topLab, k, '-50%', rot)} data-rot={Math.round(rot)} data-role="rig-edge-label" data-line="top" data-edge={id} data-a={data.a} data-b={data.b} title={t('rigMap.pathTitle')} onClick={toggle}>{lineText(top, 'top')}</div> : null}
      {bottom ? <div className={`mt-rig7-lab nodrag nopan${lit ? ' lit' : ''}`} style={at(spot.botLab, k, '-50%', rot)} data-rot={Math.round(rot)} data-role="rig-edge-label" data-line="bottom" data-edge={id} data-a={data.a} data-b={data.b} title={t('rigMap.pathTitle')} onClick={toggle}>{lineText(bottom, 'bottom')}</div> : null}
      {data.lines.waiting ? <div className={`mt-rig7-wait nodrag nopan${lit ? ' lit' : ''}`} style={at(bottom ? spot.wait : spot.botLab, k, '-50%', rot)} data-rot={Math.round(rot)} data-role="rig-wait" data-edge={id}>{t('rigV7.wait', { n: data.lines.waiting })}</div> : null}
      {open ? <div className="mt-rig-recent nowheel nodrag nopan" style={at(spot.wait, k, '-50%')} data-role="rig-path-recent">
        <b>{t('rigMap.pathRecent')}</b>
        {recent.length ? recent.map((x) => <span key={x.id + x.rev} className={`is-${x.state}`}>{x.id} · {t(`rigMap.state.${x.state}`)} · {fmtTime(x.t)}{x.reason ? ` · "${x.reason}"` : ''}</span>) : <span className="dim">{t('rigMap.pathNone')}</span>}
      </div> : null}
    </EdgeLabelRenderer>
  </>;
}

// 올림: 역할 → 빌더 노랑 점선 화살표(굵기 2, 점선 2 6)와 선 오른쪽 "올림"(시안)
export function RigRaiseEdge({ id, sourceX, sourceY, targetX, targetY, data }) {
  const t = useT();
  const zoom = useFlowStore(zoomOf);
  const k = 1 / (zoom || 1);
  // P254: 다른 노드를 지나면 Canvas가 준 직각 길(data.route)을 따른다. 글은 가장 긴 토막 옆
  const pts = data && data.route ? data.route : data && data.ends ? data.ends : [[sourceX, sourceY], [targetX, targetY]];
  const segs = pts.slice(1).map((q, i) => [pts[i], q]);
  const [sp, sq] = segs.reduce((a, s) => (Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) > Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]) ? s : a), segs[0]);
  const [lp, lq] = segs[segs.length - 1];
  const LL = Math.hypot(lq[0] - lp[0], lq[1] - lp[1]) || 1;
  const end = [lq[0] - (lq[0] - lp[0]) / LL * 2 * V7.RAISEW * k, lq[1] - (lq[1] - lp[1]) / LL * 2 * V7.RAISEW * k];
  const L = Math.hypot(sq[0] - sp[0], sq[1] - sp[1]) || 1, ux = (sq[0] - sp[0]) / L, uy = (sq[1] - sp[1]) / L;
  let nx = -uy, ny = ux; if (nx < 0 || (nx === 0 && ny < 0)) { nx = -nx; ny = -ny; } // 선의 오른쪽(가로 선이면 아래)
  const mid = [(sp[0] + sq[0]) / 2 + nx * V7.RAISELX * k, (sp[1] + sq[1]) / 2 + ny * V7.RAISELX * k];
  const tid = safeId(id);
  return <>
    <g className="mt-rig7-raise" data-role="rig-raise" data-edge={id}>
      <defs><Tip id={`${tid}-r`} color={V7.C.raise} /></defs>
      <path d={pathD([...pts.slice(0, -1), end])} fill="none" stroke={V7.C.raise} strokeWidth={V7.RAISEW * k} strokeDasharray={V7.RAISEDASH.map((x) => x * k).join(' ')} strokeLinecap="round" markerEnd={`url(#${tid}-r)`} />
    </g>
    <EdgeLabelRenderer>
      <div className="mt-rig7-raise-lab nodrag nopan" style={{ ...at(mid, k, '0%'), pointerEvents: 'none' }} data-role="rig-raise-label" data-edge={id}>{t('rigMap.raiseEdge')}{data && data.n > 1 ? ` ${data.n}` : ''}</div>
    </EdgeLabelRenderer>
  </>;
}

// 역할·빌더 노드의 꼬리표(머리줄 배지 자리)
export function RigTag({ s }) {
  const t = useT();
  const m = useStore((st) => (s && s.rigRole ? st.rigMaps.get(s.workspaceKey || null) || null : null)); // 같은 객체를 고른다(새 객체를 고르면 다시 그리기가 돈다)
  const tag = rigTag(s, () => m);
  if (!tag) return null;
  if (tag.kind === 'builder') return <span className="mt-badge rig builder" data-role="rig-tag" data-kind="builder">{t('rigMap.tagBuilder')}</span>;
  const extra = RIG_VIEW.canvasExtras ? [tag.beat && tag.beat.every ? t('rigMap.tagBeat', { every: periodText(tag.beat.every, tag.beat.at, t) }) : null, tag.sectors.length ? t('rigMap.tagSectors', { list: tag.sectors.join(' ') }) : null].filter(Boolean) : [];
  const panel = (e) => { e.stopPropagation(); const w = (getState().workspaces || []).find((x) => x.key === tag.ws); if (w) openDialog({ kind: 'rigpanel', ws: w }); };
  return <>
    <span className="mt-badge rig" data-role="rig-tag" data-kind="role" data-rig-role={tag.role}>{t('rigMap.tagRole', { name: tag.role })}{tag.docN != null ? <span className="dim"> · v{tag.docN}</span> : null}{extra.map((x) => <span key={x} className="dim"> · {x}</span>)}</span>
    {tag.intake.length ? <button type="button" className="mt-badge rig intake nodrag" data-role="rig-intake" title={t('rigMap.tagIntakeTip', { kinds: tag.intake.join(', ') })} onClick={panel} onPointerDown={(e) => e.stopPropagation()}>{t('rigMap.tagIntake')}</button> : null}
  </>;
}

// 6절 뒤집기(RIG_VIEW.canvasFrame): 켜진 rig의 역할 노드를 옅은 테두리로 묶는다. 기본은 그리지 않는다
export function RigFrames() {
  const maps = useStore((st) => st.rigMaps);
  const sessions = useStore((st) => st.sessions);
  const nodes = useStore((st) => st.nodes);
  if (!RIG_VIEW.canvasFrame) return null;
  const fr = rigFrames([...maps.values()], sessions, (sid) => nodes.get(sid) || null);
  if (!fr.length) return null;
  return <ViewportPortal>{fr.map((f) => <div key={f.ws} className="mt-rig-frame" data-role="rig-frame" style={{ transform: `translate(${f.x}px, ${f.y}px)`, width: f.w, height: f.h }} />)}</ViewportPortal>;
}
