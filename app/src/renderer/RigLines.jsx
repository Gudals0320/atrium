// P251: 캔버스의 rig 길 선(docs research rig3-map.md 4절)과 역할 노드 꼬리표.
// P259: 보통 세션 연결(Links.jsx)과 같은 곡선·같은 구성으로 바꿨다(사용자 요청 2026-11-20). P254의 V7 곧은 두 줄·직각 길은 걷어 냈다.
// - 방향마다 한 선(쌍에 길이 두 방향이면 선 둘). 자리·곡선·칩 자리는 Canvas가 lib/rig-map.js rigCanvasLines로 정해 data.rig에 싣는다.
//   선은 보통 연결과 같은 베지어·굵기(세계 크기), 출발 끝에 작은 점, 도착 끝에 뚜렷한 화살촉. 선마다 글 칩(보통 연결 칩과 같은 생김새):
//   선 방향 화살, 끝나지 않은 반려면 붉은 점, 항목 이름, 기다리면 "대기 n". 일하는 역할에 닿은 쌍은 밝게(굵게).
//   멀리 보면 칩·화살촉·점·선 굵기는 화면에서 RIG_EDGE.CHIP_MIN배보다 작아지지 않게 키운다(data.rig.cs). 가까이(배율 ≥ CHIP_MIN)는 보통 연결과 같은 세계 크기.
//   정의에서 나오는 선이라 연결 기록(link)과 섞지 않고 끊기가 없다. 선·칩을 누르면 그 길로 최근 오간 항목이 뜬다.
// - 올림: 역할이 빌더에게 올린 것이 기다리는 동안만 역할 → 빌더 노랑 점선 곡선과 "올림" 칩.
// - 꼬리표(RigTag): 역할 노드 "역할 · <이름> · v<판>", 빌더 노드 "rig 빌더"(노랑 바탕). 일반 세션에는 새 꼬리표가 없다.
import { useState } from 'react';
import { EdgeLabelRenderer, ViewportPortal } from '@xyflow/react';
import { useStore, getState, openDialog } from './store.js';
import { useT, fmtTime } from './lib/i18n.js';
import { rigTag, rigFrames, periodText, pairLit, RIG_EDGE, RIG_VIEW } from './lib/rig-map.js';

const safeId = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_');
// 도착 끝 화살촉(채운 삼각형, 세계 크기 × cs). 끝이 노드 모서리에 닿는다(refX = 길이)
const Tip = ({ id, cls, cs, color }) => <marker id={id} className={cls} orient="auto" markerUnits="userSpaceOnUse" viewBox={`0 0 ${RIG_EDGE.ARROW} ${RIG_EDGE.ARROW_W}`} markerWidth={RIG_EDGE.ARROW * cs} markerHeight={RIG_EDGE.ARROW_W * cs} refX={RIG_EDGE.ARROW} refY={RIG_EDGE.ARROW_W / 2}><path d={`M0 0 L${RIG_EDGE.ARROW} ${RIG_EDGE.ARROW_W / 2} L0 ${RIG_EDGE.ARROW_W} Z`} style={{ fill: color, stroke: 'none' }} /></marker>;
// 칩: 세계 자리 p를 가운데로, 배율 cs
const chipAt = (p, cs) => ({ transform: `translate(${p[0]}px, ${p[1]}px) scale(${cs}) translate(-50%, -50%)`, transformOrigin: '0 0' });
const angOf = (u) => Math.round(Math.atan2(u[1], u[0]) * 180 / Math.PI);

export function RigPathEdge({ id, data }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const m = useStore((st) => (data ? st.rigMaps.get(data.ws) : null));
  const aWork = useStore((st) => !!data && (st.sessions.get(data.source) || {}).state === 'working');
  const bWork = useStore((st) => !!data && (st.sessions.get(data.target) || {}).state === 'working');
  if (!data || !data.rig) return null;
  const { cs, lines } = data.rig;
  const lit = pairLit(data.a, data.b, (r) => (r === data.a ? aWork : r === data.b ? bWork : false));
  const tid = safeId(id);
  const flows = m ? data.flows.map((i) => (m.flows || [])[i]).filter(Boolean) : [];
  const recent = flows.flatMap((f) => (f.last || []).map((x) => ({ ...x, item: f.item }))).sort((a, b) => b.t - a.t).slice(0, 6);
  const toggle = (e) => { e.stopPropagation(); setOpen((v) => !v); };
  const first = lines[0];
  return <>
    <g className={`mt-rigc${lit ? ' lit' : ''}`} data-role="rig-path" data-edge={id} data-a={data.a} data-b={data.b} data-lit={lit ? '1' : '0'}>
      <defs><Tip id={`${tid}-tip`} cls={`mt-rigc-tip${lit ? ' lit' : ''}`} cs={cs} color={lit ? 'var(--wire-rig-hot)' : 'var(--wire-rig)'} /></defs>
      {lines.map((ln) => <g key={ln.key}>
        <path className={`react-flow__edge-path mt-edge rigc${lit ? ' lit' : ''}`} data-role="rig-line" data-line={ln.which} data-from={ln.from} data-to={ln.to} data-sp={ln.sp} data-tp={ln.tp} d={ln.d} fill="none" style={{ strokeWidth: (lit ? RIG_EDGE.WLIT : RIG_EDGE.W) * cs }} markerEnd={`url(#${tid}-tip)`} />
        <circle className={`mt-rigc-end${lit ? ' lit' : ''}`} data-role="rig-line-start" cx={ln.s[0]} cy={ln.s[1]} r={RIG_EDGE.DOT * cs} />
        <path d={ln.d} className="mt-edge-hit" fill="none" stroke="transparent" strokeWidth={24 * cs} onClick={toggle} />
      </g>)}
    </g>
    <EdgeLabelRenderer>
      {lines.map((ln) => <div key={ln.key} className={`mt-edge-label rigc nodrag nopan${lit ? ' lit' : ''}`} style={chipAt(ln.lab.p, cs)} data-role="rig-edge-label" data-line={ln.which} data-edge={id} data-from={ln.from} data-to={ln.to} data-free={ln.lab.free ? '1' : '0'} title={t('rigMap.pathTitle')} onClick={toggle}>
        <i className="mt-rigc-dir" data-role="rig-dir" data-ang={angOf(ln.lab.u)} style={{ transform: `rotate(${angOf(ln.lab.u)}deg)` }} aria-hidden="true">➜</i>
        {ln.open ? <i className="mt-rigc-open" data-role="rig-open-return" data-line={ln.which} /> : null}
        <span className="mt-edge-text">{ln.text}</span>
        {ln.waiting ? <span className="mt-rigc-wait" data-role="rig-wait" data-edge={id}>{t('rigV7.wait', { n: ln.waiting })}</span> : null}
      </div>)}
      {open && first ? <div className="mt-rig-recent nowheel nodrag nopan" style={chipAt([first.lab.p[0], first.lab.p[1] + first.h], cs)} data-role="rig-path-recent">
        <b>{t('rigMap.pathRecent')}</b>
        {recent.length ? recent.map((x) => <span key={x.id + x.rev} className={`is-${x.state}`}>{x.id} · {t(`rigMap.state.${x.state}`)} · {fmtTime(x.t)}{x.reason ? ` · "${x.reason}"` : ''}</span>) : <span className="dim">{t('rigMap.pathNone')}</span>}
      </div> : null}
    </EdgeLabelRenderer>
  </>;
}

// 올림: 역할 → 빌더 노랑 점선 곡선(보통 연결과 같은 베지어)과 "올림" 칩
export function RigRaiseEdge({ id, data }) {
  const t = useT();
  if (!data || !data.rig || !data.rig.lines.length) return null;
  const { cs } = data.rig, ln = data.rig.lines[0];
  const tid = safeId(id);
  return <>
    <g className="mt-rigc-raise" data-role="rig-raise" data-edge={id}>
      <defs><Tip id={`${tid}-r`} cls="mt-rigc-tip raise" cs={cs} color="var(--attn)" /></defs>
      <path className="react-flow__edge-path mt-edge rigc raise" data-role="rig-line" data-line="raise" data-from={ln.from} data-to={ln.to} data-sp={ln.sp} data-tp={ln.tp} d={ln.d} fill="none" style={{ strokeWidth: RIG_EDGE.W * cs, strokeDasharray: `${3 * cs} ${8 * cs}` }} markerEnd={`url(#${tid}-r)`} />
      <circle className="mt-rigc-end raise" cx={ln.s[0]} cy={ln.s[1]} r={RIG_EDGE.DOT * cs} />
    </g>
    <EdgeLabelRenderer>
      <div className="mt-edge-label rigc raise nodrag nopan" style={{ ...chipAt(ln.lab.p, cs), pointerEvents: 'none' }} data-role="rig-raise-label" data-edge={id} data-free={ln.lab.free ? '1' : '0'}>
        <i className="mt-rigc-dir" data-role="rig-dir" style={{ transform: `rotate(${angOf(ln.lab.u)}deg)` }} aria-hidden="true">➜</i>
        <span className="mt-edge-text">{t('rigMap.raiseEdge')}{ln.n > 1 ? ` ${ln.n}` : ''}</span>
      </div>
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
