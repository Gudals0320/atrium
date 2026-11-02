// 미션 맵(ARCH 4절 I6, P6c): 덮개 화면. 두 열(명령 바(사람)와 다른 세션에게 지시하는 세션 → 세션)과 누가 누구에게 지시하는지 선. P22에서 그룹 열을 뺐다.
// 선: 역할(파랑), 알아챈 지시(보라), 띄움(초록 점선), 명령 바 전달(주황), 루프(청록 점선). 받는 쪽이 도는 중이거나 켜진 루프면 움직인다.
// 노드를 누르면 덮개를 닫고 그 노드로 간다. 위쪽 칩으로 거른다(작업 중, 내 차례, 쉼, 검토 대기, 끝남).
// 연 동안 세션·연결·Thread·루프가 바뀌면 다시 읽는다(mission.graph, 1ms 안쪽).
import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { useStore, getState, setMissionOpen, toast } from './store.js';
import { missionLayout } from './lib/items.js';
import { useT, errText, fmtTime } from './lib/i18n.js';

// 글은 사전(mission.cat.*, mission.edge.*)에 있다(P16)
const CATS = ['all', 'needs_you', 'working', 'idle', 'done', 'exited'];
const CAT_KEYS = ['working', 'needs_you', 'idle', 'done', 'exited'];
const EDGE_KEYS = ['role', 'prompt', 'spawn', 'bar', 'loop'];

function Box({ b, onGo }) {
  const t = useT();
  const catLabel = (k) => (CAT_KEYS.includes(k) ? t(`mission.cat.${k}`) : null);
  const n = b.node;
  if (n.kind === 'human') return <div className="mt-mm-box human" style={{ left: b.x, top: b.y, width: b.w, height: b.h }} data-role="mm-node" data-kind="human"><b>{t('mission.human')}</b><span className="dim">{t('mission.edge.bar')}</span></div>;
  return (
    <div className={`mt-mm-box session c-${n.category}`} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} data-role="mm-node" data-kind="session" data-name={n.name} data-category={n.category} onClick={() => onGo(n)} title={`${n.lastPrompt || ''}\n${t('mission.goSession')}`}>
      <div className="mt-mm-line"><b>@{n.name}</b>{n.role ? <span className="mt-mm-branch" data-role="mm-branch">{n.role} · {t('mission.depth', { n: n.depth })}</span> : null} <span className={`mt-mm-cat c-${n.category}`}>{catLabel(n.category) || n.state}</span>{n.agentKind && n.agentKind !== 'claude' ? <span className="mt-badge kind">{n.agentKind === 'shell' ? t('mission.shell') : n.agentKind}</span> : null}{n.loops ? <span className="mt-badge loop">⟳ {n.loops}</span> : null}{n.directs ? <span className="dim">{t('mission.directs', { n: n.directs })}</span> : null}</div>
      {n.ask ? <div className="mt-mm-ask">{n.ask}</div> : n.lastPrompt ? <div className="mt-mm-sub dim">{t('mission.request', { text: n.lastPrompt.replace(/\s+/g, ' ') })}</div> : null}
    </div>
  );
}

export function MissionMap() {
  const t = useT();
  const open = useStore((st) => st.missionOpen);
  const sessions = useStore((st) => st.sessions);
  const links = useStore((st) => st.links);
  const thread = useStore((st) => st.thread);
  const loops = useStore((st) => st.loops);
  const [graph, setGraph] = useState(null);
  const [filter, setFilter] = useState('all');
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const timer = setTimeout(() => api.call('mission.graph').then((g) => alive && setGraph(g)).catch((e) => toast(t('mission.fail', { error: errText(e) }), 'error')), graph ? 300 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [open, sessions, links, thread, loops]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); setMissionOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const lay = useMemo(() => (graph ? missionLayout(graph, { filter }) : null), [graph, filter]);
  if (!open) return null;

  const go = (n) => {
    setMissionOpen(false);
    const st = getState();
    if (n.kind === 'session') setTimeout(() => st.navigateTo && st.navigateTo(n.sessionId), 30);
  };
  const c = (graph && graph.counts) || {};
  return (
    <div className="mt-mission" data-role="mission">
      <div className="mt-mission-head">
        <b>{t('mission.title')}</b>
        <span className="dim">{t('mission.subtitle')}</span>
        <span className="mt-mission-filters">
          {CATS.map((k) => <button key={k} className={`mt-btn small${filter === k ? ' on' : ' ghost'}`} data-filter={k} onClick={() => setFilter(k)}>{t(`mission.cat.${k}`)} {k === 'all' ? c.all ?? '' : c[k] ?? 0}</button>)}
        </span>
        <span className="mt-node-sp" />
        <button className="mt-x" data-action="mission-close" title={t('mission.closeTitle')} onClick={() => setMissionOpen(false)}>×</button>
      </div>
      <div className="mt-mission-body nowheel">
        {!lay ? <div className="dim" style={{ padding: 20 }}>{t('common.loading')}</div> : (
          <div className="mt-mission-canvas" style={{ width: lay.width, height: lay.height }}>
            <div className="mt-mm-colhead" style={{ left: 24, width: 260 }}>{t('mission.colHuman')}</div>
            <div className="mt-mm-colhead" style={{ left: 24 + 400, width: 260 }}>{t('mission.colSessions')}</div>
            <svg className="mt-mm-svg" width={lay.width} height={lay.height}>
              {lay.edges.map((e) => (
                <g key={e.id} className={`mt-mm-edge k-${e.kind}${e.active ? ' active' : ''}`} data-role="mm-edge" data-kind={e.kind}>
                  <path d={e.d} />
                  <text x={e.lx} y={e.ly - 4} textAnchor="middle">{EDGE_KEYS.includes(e.kind) ? t(`mission.edge.${e.kind}`) : e.kind}{e.count > 1 ? ` ×${e.count}` : ''}{e.label && e.kind !== 'bar' && e.kind !== 'spawn' ? ` · ${String(e.label).slice(0, 18)}` : ''}</text>
                  <title>{`${EDGE_KEYS.includes(e.kind) ? t(`mission.edge.${e.kind}`) : e.kind}${e.label && e.kind !== 'spawn' ? `: ${e.label}` : ''}${e.count ? ` ${t('mission.edgeCount', { n: e.count })}` : ''}${e.lastAt ? ` · ${t('mission.edgeLast', { time: fmtTime(e.lastAt) })}` : ''}`}</title>
                </g>
              ))}
            </svg>
            {[...lay.boxes.values()].map((b) => <Box key={b.node.id} b={b} onGo={go} />)}
            {lay.boxes.size <= 1 && <div className="dim" style={{ position: 'absolute', left: 24, top: 120 }}>{t('mission.empty')}{filter !== 'all' ? t('mission.emptyFiltered') : ''}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
