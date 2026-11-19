// P251: 캔버스의 rig 길 선(docs research rig3-map.md 4절)과 역할 노드 꼬리표.
// P254: 사용자의 시안 V7 "새 rig · 캔버스의 길 선"을 그대로 옮겼다(lib/rig-map.js V7 치수·색).
// - 두 역할 사이에 선 두 줄: 위 줄은 왼쪽 노드 → 오른쪽 노드 길(굵기 2, 오른쪽 끝 화살촉), 아래 줄은 돌아오는 길(굵기 1.5, 왼쪽 끝 화살촉).
//   위 줄 글은 선 위("스냅숏 →"), 아래 줄 글은 선 아래("← 데이터 요청"), 기다림 수는 그 아래 "대기 n". 그 방향 길이 없으면 그 줄을 긋지 않는다.
//   지금 오가는 쌍(기다리는 항목이 있다)은 선과 글이 밝고(#ECE9E1) 나머지는 흐리다(#8E8B83). 끝나지 않은 반려는 그 줄 시작에 붉은 점.
//   굵기·글·점은 화면 px로 시안과 같다(배율이 바뀌어도 같은 크기: 세계 크기 = 시안 값 / 배율).
//   정의에서 나오는 선이라 연결 기록(link)과 섞지 않고 끊기가 없다. 줄(글)을 누르면 그 길로 최근 오간 항목이 뜬다.
// - 올림: 역할이 빌더에게 올린 것이 기다리는 동안만 역할 → 빌더 노랑 점선 화살표와 "올림" 글.
// - 꼬리표(RigTag): 역할 노드 "역할 · <이름> · v<판>", 빌더 노드 "rig 빌더"(노랑 바탕), rig가 켜진 워크스페이스의 다른 세션 "일반 세션".
import { useState } from 'react';
import { EdgeLabelRenderer, ViewportPortal, useStore as useFlowStore } from '@xyflow/react';
import { useStore, getState, openDialog } from './store.js';
import { useT, fmtTime } from './lib/i18n.js';
import { rigTag, rigFrames, periodText, lineText, twoLines, pathD, V7, RIG_VIEW } from './lib/rig-map.js';

const zoomOf = (s) => s.transform[2];
const safeId = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_');
// 시안의 화살촉(채운 삼각형, 굵기에 비례). 줄마다 색이 달라 줄마다 둔다
const Tip = ({ id, color }) => <marker id={id} orient="auto" markerWidth="5" markerHeight="5" refX="2" refY="2" overflow="visible"><path d="M0 0 L4 2 L0 4 Z" fill={color} stroke="none" /></marker>;
// 글 칸: 세계 자리 [x, y]를 가운데로, 화면 크기는 시안 그대로(scale = 1/배율)
const at = (p, k, ax = '-50%') => ({ transform: `translate(${p[0]}px, ${p[1]}px) scale(${k}) translate(${ax}, -50%)`, transformOrigin: '0 0' });

export function RigPathEdge({ id, sourceX, sourceY, targetX, targetY, data }) {
  const t = useT();
  const zoom = useFlowStore(zoomOf);
  const [open, setOpen] = useState(false);
  const m = useStore((st) => (data ? st.rigMaps.get(data.ws) : null));
  if (!data || !data.lines) return null;
  const k = 1 / (zoom || 1);
  // 왼쪽(가로가 더 길면 x, 세로가 더 길면 y가 작은 쪽) 노드 → 오른쪽 노드 줄이 위 줄
  const dx = targetX - sourceX, dy = targetY - sourceY;
  const aLeft = Math.abs(dx) >= Math.abs(dy) ? dx >= 0 : dy >= 0;
  const P = aLeft ? [sourceX, sourceY] : [targetX, targetY], Q = aLeft ? [targetX, targetY] : [sourceX, sourceY];
  const top = aLeft ? data.lines.top : data.lines.bottom, bottom = aLeft ? data.lines.bottom : data.lines.top;
  const left = aLeft ? data.a : data.b, right = aLeft ? data.b : data.a;
  const g = twoLines(P, Q, k);
  const lit = !!data.lines.lit;
  const color = lit ? V7.C.lit : V7.C.dim;
  const tid = safeId(id);
  const flows = m ? data.flows.map((i) => (m.flows || [])[i]).filter(Boolean) : [];
  const recent = flows.flatMap((f) => (f.last || []).map((x) => ({ ...x, item: f.item }))).sort((a, b) => b.t - a.t).slice(0, 6);
  const toggle = (e) => { e.stopPropagation(); setOpen((v) => !v); };
  return <>
    <g className={`mt-rig7${lit ? ' lit' : ''}`} data-role="rig-path" data-edge={id} data-a={data.a} data-b={data.b} data-lit={lit ? '1' : '0'}>
      <defs><Tip id={`${tid}-t`} color={color} /><Tip id={`${tid}-b`} color={color} /></defs>
      {top ? <path className="mt-rig7-line top" data-role="rig-line" data-line="top" data-from={left} data-to={right} d={g.top.d} fill="none" stroke={color} strokeWidth={V7.W1 * k} strokeLinecap="round" markerEnd={`url(#${tid}-t)`} /> : null}
      {bottom ? <path className="mt-rig7-line bottom" data-role="rig-line" data-line="bottom" data-from={right} data-to={left} d={g.bottom.d} fill="none" stroke={color} strokeWidth={V7.W2 * k} strokeLinecap="round" markerEnd={`url(#${tid}-b)`} /> : null}
      <path d={pathD([P, Q])} className="mt-edge-hit" fill="none" stroke="transparent" strokeWidth={22 * k} onClick={toggle} />
      {top && top.open ? <circle className="mt-rig-open" data-role="rig-open-return" data-line="top" cx={g.dotTop[0]} cy={g.dotTop[1]} r={(V7.DOT / 2) * k} fill={V7.C.red} /> : null}
      {bottom && bottom.open ? <circle className="mt-rig-open" data-role="rig-open-return" data-line="bottom" cx={g.dotBot[0]} cy={g.dotBot[1]} r={(V7.DOT / 2) * k} fill={V7.C.red} /> : null}
    </g>
    <EdgeLabelRenderer>
      {top ? <div className={`mt-rig7-lab nodrag nopan${lit ? ' lit' : ''}`} style={at(g.topLab, k)} data-role="rig-edge-label" data-line="top" data-edge={id} data-a={data.a} data-b={data.b} title={t('rigMap.pathTitle')} onClick={toggle}>{lineText(top, 'top')}</div> : null}
      {bottom ? <div className={`mt-rig7-lab nodrag nopan${lit ? ' lit' : ''}`} style={at(g.botLab, k)} data-role="rig-edge-label" data-line="bottom" data-edge={id} data-a={data.a} data-b={data.b} title={t('rigMap.pathTitle')} onClick={toggle}>{lineText(bottom, 'bottom')}</div> : null}
      {data.lines.waiting ? <div className={`mt-rig7-wait nodrag nopan${lit ? ' lit' : ''}`} style={at(bottom ? g.wait : g.botLab, k)} data-role="rig-wait" data-edge={id}>{t('rigV7.wait', { n: data.lines.waiting })}</div> : null}
      {open ? <div className="mt-rig-recent nowheel nodrag nopan" style={at(g.wait, k, '-50%')} data-role="rig-path-recent">
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
  const dx = targetX - sourceX, dy = targetY - sourceY, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const end = [targetX - ux * 2 * V7.RAISEW * k, targetY - uy * 2 * V7.RAISEW * k];
  let nx = -uy, ny = ux; if (nx < 0 || (nx === 0 && ny < 0)) { nx = -nx; ny = -ny; } // 선의 오른쪽(가로 선이면 아래)
  const mid = [(sourceX + targetX) / 2 + nx * V7.RAISELX * k, (sourceY + targetY) / 2 + ny * V7.RAISELX * k];
  const tid = safeId(id);
  return <>
    <g className="mt-rig7-raise" data-role="rig-raise" data-edge={id}>
      <defs><Tip id={`${tid}-r`} color={V7.C.raise} /></defs>
      <path d={pathD([[sourceX, sourceY], end])} fill="none" stroke={V7.C.raise} strokeWidth={V7.RAISEW * k} strokeDasharray={V7.RAISEDASH.map((x) => x * k).join(' ')} strokeLinecap="round" markerEnd={`url(#${tid}-r)`} />
    </g>
    <EdgeLabelRenderer>
      <div className="mt-rig7-raise-lab nodrag nopan" style={{ ...at(mid, k, '0%'), pointerEvents: 'none' }} data-role="rig-raise-label" data-edge={id}>{t('rigMap.raiseEdge')}{data && data.n > 1 ? ` ${data.n}` : ''}</div>
    </EdgeLabelRenderer>
  </>;
}

// 역할·빌더 노드의 꼬리표(머리줄 배지 자리)
export function RigTag({ s }) {
  const t = useT();
  const m = useStore((st) => (s ? st.rigMaps.get(s.workspaceKey || null) || null : null)); // 같은 객체를 고른다(새 객체를 고르면 다시 그리기가 돈다)
  const tag = rigTag(s, () => m);
  if (!tag) return null;
  if (tag.kind === 'general') return <span className="mt-badge rig general" data-role="rig-tag" data-kind="general">{t('rigV7.tagGeneral')}</span>; // P254: 시안 V7 "일반 세션"
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
