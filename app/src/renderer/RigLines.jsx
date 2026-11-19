// P251: 캔버스의 rig 길 선(docs research rig3-map.md 4절)과 역할 노드 꼬리표.
// - 선 하나 = 길을 함께 쓰는 역할 한 쌍(lib/rig-map.js rigEdges). 정의에서 나오는 선이라 연결 기록(link)과 섞지 않고 끊기가 없다.
//   생김새는 일반 영구 연결 선(.mt-edge)과 같은 계열에 옅은 색조(.rig), 길의 방향에 화살촉(답으로 돌아오는 길이 있으면 반대쪽에 작은 화살촉),
//   선 위 글은 항목 종류("가설 → · ← 검증 결과")와 기다리는 수(멀어지면 키우고, 아주 멀면 숨김), 반려되어 끝나지 않은 항목은 낸 쪽 끝에 붉은 점.
//   받는 역할이 일하는 중이고 기다리는 항목이 있으면 밝아진다(.lit, 멈춘 밝기: 사용자 PC는 늘 움직임 줄이기라 움직이는 점선 대신 굵기와 밝기만).
//   선(글)을 누르면 그 길로 최근 오간 항목이 뜬다.
// - 올림: 역할이 빌더에게 올린 것이 기다리는 동안만 역할 → 빌더 점선 하나("올림"). 일시 연결과 같은 느낌.
// - 꼬리표(RigTag): 역할 노드에 "역할 · <이름>"과 정의서 판, 빌더 노드에 "rig 빌더", 사람 입력을 받는 역할에는 입력 창구 표시(누르면 rig 판).
import { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, ViewportPortal, getBezierPath, useStore as useFlowStore } from '@xyflow/react';
import { useStore, getState, openDialog } from './store.js';
import { useT, fmtTime } from './lib/i18n.js';
import { pathText, rigTag, rigFrames, periodText, RIG_VIEW } from './lib/rig-map.js';

const LABEL_ZOOM = 0.15; // 이보다 멀면 글을 숨긴다
// 멀어지면 글을 키워 화면에서 읽히게 한다(배율 0.75 아래에서 1/배율에 비례, 3배까지). 역할 노드 넷을 한눈에 보는 배율(0.3 안팎)에서도 길 글이 보인다
const labelK = (z) => Math.min(3, Math.max(1, 0.75 / (z || 1)));
const zoomOf = (s) => s.transform[2];

export function RigPathEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, markerStart }) {
  const t = useT();
  const zoom = useFlowStore(zoomOf);
  const [open, setOpen] = useState(false);
  const m = useStore((st) => (data ? st.rigMaps.get(data.ws) : null));
  const to = useStore((st) => (data ? st.sessions.get(data.target) : null));
  const from = useStore((st) => (data ? st.sessions.get(data.source) : null));
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  if (!data) return null;
  const busy = (to && to.state === 'working') || (from && from.state === 'working');
  const active = busy && data.waiting > 0;
  const text = pathText(data, t);
  const flows = m ? data.flows.map((i) => (m.flows || [])[i]).filter(Boolean) : [];
  const recent = flows.flatMap((f) => (f.last || []).map((x) => ({ ...x, item: f.item }))).sort((a, b) => b.t - a.t).slice(0, 6);
  return <>
    <BaseEdge id={id} path={path} className={`mt-edge rig${active ? ' lit' : ''}`} markerEnd={markerEnd} markerStart={markerStart} interactionWidth={0} />
    <path d={path} className="mt-edge-hit" fill="none" stroke="transparent" strokeWidth={22} onClick={() => setOpen((v) => !v)} />
    {data.openA ? <circle className="mt-rig-open" data-role="rig-open-return" cx={sourceX} cy={sourceY} r={6 * labelK(zoom)} /> : null}
    {data.openB ? <circle className="mt-rig-open" data-role="rig-open-return" cx={targetX} cy={targetY} r={6 * labelK(zoom)} /> : null}
    {(zoom >= LABEL_ZOOM || open) && <EdgeLabelRenderer>
      <div className={`mt-edge-label rig nodrag nopan${active ? ' awake' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px) scale(${labelK(zoom)})` }} data-role="rig-edge-label" data-edge={id} data-a={data.a} data-b={data.b} title={t('rigMap.pathTitle')} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
        <span className="mt-edge-text">{text}</span>
        {open ? <div className="mt-rig-recent nowheel" data-role="rig-path-recent">
          <b>{t('rigMap.pathRecent')}</b>
          {recent.length ? recent.map((x) => <span key={x.id + x.rev} className={`is-${x.state}`}>{x.id} · {t(`rigMap.state.${x.state}`)} · {fmtTime(x.t)}{x.reason ? ` · "${x.reason}"` : ''}</span>) : <span className="dim">{t('rigMap.pathNone')}</span>}
        </div> : null}
      </div>
    </EdgeLabelRenderer>}
  </>;
}

export function RigRaiseEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const t = useT();
  const zoom = useFlowStore(zoomOf);
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return <>
    <BaseEdge id={id} path={path} className="mt-edge rig-raise" interactionWidth={0} />
    {zoom >= LABEL_ZOOM && <EdgeLabelRenderer>
      <div className="mt-edge-label rig-raise nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px) scale(${labelK(zoom)})`, pointerEvents: 'none' }} data-role="rig-raise-label" data-edge={id}>{t('rigMap.raiseEdge')}{data && data.n > 1 ? ` ${data.n}` : ''}</div>
    </EdgeLabelRenderer>}
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
// 캔버스 선 꼴(Canvas.jsx edges): 길 방향 화살촉(굵기 같은 계열), 답 길·뒤로 가는 길은 반대쪽 끝에 작은 화살촉
export const RIG_TIP = { type: 'arrowclosed', width: 18, height: 18, color: '#86a9bd' };
export const RIG_TIP_SMALL = { type: 'arrowclosed', width: 12, height: 12, color: '#86a9bd' };
