// 미션 맵(ARCH 4절 I6, P6c, P32에서 다시 그림): 덮개 화면. 왼쪽에서 오른쪽으로 펼친 나무(사람 → 지시하는 세션 → 받는 세션)와 아래 "연결 없음" 칸.
// 배치는 lib/mission-layout.js(순수 함수). 한 쌍 사이의 선은 하나로 모으고 화살표로 방향을, 받는 상자 옆 이름표로 역할을 보인다.
// 상자는 판의 노드와 같은 종류 아이콘(KindIcon)과 상태 알약(StatePill)을 쓴다. 내 차례는 노란 테두리(P93)와 묻는 내용.
// 상자를 누르면 덮개를 닫고 그 노드로 간다. 상자·선·이름표·단추가 아닌 빈 곳을 누르거나 Esc를 누르면 닫힌다(P32). 위쪽 칩으로 거른다(맞는 세션과 그 조상만, 조상은 흐리게).
// 연 동안 세션·연결·Thread·루프가 바뀌면 다시 읽는다(mission.graph).
// P46: 세션 상자는 워크스페이스(저장소)별 무리 안에 놓인다. 무리 머리줄에 이름, 세션 수, 응답 필요 수. 머리줄을 누르면 접고 펼친다.
//   다른 워크스페이스의 세션에게 시킨 선(cross)은 굵게 긋고 이름표 테두리를 점선으로, 풀이 글에 어느 워크스페이스에서 왔는지 적는다.
// P94: 역할과 관계를 먼저 보인다(공용 모델 lib/mission-model.js). 카드에 역할 칩(리드·리뷰어·테스트·문서·워커 기호와 이름), 리드는 팀 요약과 "워커 n 기다림"·"아래 응답 필요 n".
//   선은 관계 종류로 모양이 다르다: 하위 세션(실선), 역할 연결(파선), 요청(점선), 사용자(옅은 선), 다른 프로젝트(굵은 테두리 선과 → 프로젝트 이름).
//   세션을 가리키거나 키보드로 고르면 그 세션·조상·팀·바로 이어진 세션만 또렷하고 나머지는 물러나며, 팀을 점선 상자로 두른다. 가상 그룹(P44)은 무리를 두르는 띠, 범례는 왼쪽 아래.
import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { useStore, getState, setMissionOpen, toast, wsName } from './store.js';
import { missionLayout, edgeLabel, MISSION } from './lib/mission-layout.js';
import { roleModel, focusOf, teamText, roleText, REL_ORDER, FAMILIES } from './lib/mission-model.js';
import { RoleGlyph } from './RoleGlyph.jsx';
import { useT, errText, fmtTime } from './lib/i18n.js';
import { KindIcon, StatePill } from './SessionNode.jsx';

const CATS = ['all', 'needs_you', 'working', 'idle', 'done', 'exited'];
// 빈 곳 누르기에서 빼는 것
const SOLID = '[data-role="mm-node"], [data-role="mm-edge"], [data-role="mm-label"], [data-role="mm-legend"], button, input, select, a';

function Box({ b, live, onGo, role, hot, recede, onHot }) {
  const t = useT();
  const n = b.node;
  const style = { left: b.x, top: b.y, width: b.w, height: b.h };
  if (n.kind === 'human') return (
    <div className={`mt-mm-box human${recede ? ' recede' : ''}`} style={style} data-role="mm-node" data-kind="human" title={t('mmap.humanTitle')}>
      <span className="mt-mm-you">{t('mission.human')}</span>
      <span className="mt-mm-sub">{t('mission.edge.bar')}</span>
    </div>
  );
  // 판의 세션(있으면)으로 상태 알약을 그려 노드와 같은 말·색을 쓴다
  const s = live || { state: n.state, unseen: n.category === 'done' };
  const kind = (live && (live.flavor || live.kind)) || n.agentKind || 'claude';
  const cmd = live && live.shell && !live.shell.atPrompt ? live.shell.command || (live.shell.procs || []).join(', ') : null; // 셸은 도는 명령
  const sub = n.ask || (n.lastPrompt ? n.lastPrompt.replace(/\s+/g, ' ') : cmd ? `$ ${cmd}` : null);
  const m = role || { rank: 'solo', family: 'worker' };
  const team = m.team ? teamText(m, t) : null;
  const tip = [`@${n.name} · ${roleText(m, t)}`, team, n.ask ? `${t('mmap.ask')} ${n.ask}` : null, n.lastPrompt ? `${t('mmap.prompt')} ${n.lastPrompt}` : null, t('mission.goSession')].filter(Boolean).join('\n');
  return (
    <div className={`mt-mm-box session c-${n.category} r-${m.rank} f-${m.family}${b.ghost ? ' ghost' : ''}${hot ? ' hot' : ''}${recede ? ' recede' : ''}`} style={style} data-role="mm-node" data-kind="session" data-name={n.name} data-category={n.category} data-rank={m.rank} data-family={m.family} data-ghost={b.ghost ? '1' : undefined}
      tabIndex={0} onClick={() => onGo(n)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGo(n); } }}
      onMouseEnter={() => onHot(n.id)} onMouseLeave={() => onHot(null)} onFocus={() => onHot(n.id)} onBlur={() => onHot(null)} title={tip}>
      {(m.climb > 0 || m.waiting > 0) && (
        <span className="mt-mm-flags">
          {m.climb > 0 && <span className="mt-mm-flag climb" data-role="mm-climb" title={t('mmRole.climbTitle', { n: m.climb })}>↑ {t('mmRole.climb', { n: m.climb })}</span>}
          {m.waiting > 0 && <span className="mt-mm-flag wait" data-role="mm-wait" title={t('mmRole.waitingTitle', { n: m.waiting })}>{t('mmRole.waiting', { n: m.waiting })}</span>}
        </span>
      )}
      <div className="mt-mm-line">
        <span className="mt-mm-kind"><KindIcon kind={kind} state={n.state} /></span>
        <b className="mt-mm-name">@{n.name}</b>
        {n.loops ? <span className="mt-mm-loop" title={t('mmap.loops', { n: n.loops })}>⟳{n.loops}</span> : null}
        <StatePill s={s} />
      </div>
      <div className="mt-mm-line two">
        <span className={`mt-mm-role f-${m.family} r-${m.rank}`} data-role="mm-role"><RoleGlyph family={m.family} />{roleText(m, t)}</span>
        {team ? <span className="mt-mm-team" data-role="mm-team">{team}</span>
          : sub ? <span className={`mt-mm-sub${n.ask ? ' ask' : ''}`} data-role={n.ask ? 'mm-ask' : 'mm-prompt'}>{sub}</span>
          : <span className="mt-mm-sub none">{n.agentKind === 'shell' ? t('mission.shell') : t('mmap.noPrompt')}</span>}
      </div>
      {(n.ask || (n.lastPrompt && n.lastPrompt.length > 34) || team) && <div className="mt-mm-more" data-role="mm-more">{team ? <><b>{roleText(m, t)}</b> {team}{n.ask || n.lastPrompt ? <br /> : null}</> : null}{n.ask ? <><b>{t('mmap.ask')}</b> {n.ask}{n.lastPrompt ? <><br /><b>{t('mmap.prompt')}</b> {n.lastPrompt}</> : null}</> : n.lastPrompt ? <><b>{t('mmap.prompt')}</b> {n.lastPrompt}</> : null}</div>}
    </div>
  );
}

const REL_KEY = { spawn: 'relSpawn', role: 'relRole', prompt: 'relPrompt', human: 'relHuman' };
const FAM_KEY = { lead: 'keyLead', review: 'keyReview', test: 'keyTest', docs: 'keyDocs', worker: 'keyWorker' };
function Legend() {
  const t = useT();
  return (
    <div className="mt-mm-legend" data-role="mm-legend" aria-label={t('mmRole.legend')}>
      <div className="mt-mm-lrow"><b>{t('mmRole.legendRoles')}</b>
        {FAMILIES.map((f) => <span key={f} className={`mt-mm-key role f-${f}`} title={f === 'lead' ? t('mmRole.keyLeadTitle') : undefined}><RoleGlyph family={f} />{t(`mmRole.${FAM_KEY[f]}`)}</span>)}
      </div>
      <div className="mt-mm-lrow"><b>{t('mmRole.legendLines')}</b>
        {REL_ORDER.map((k) => <span key={k} className={`mt-mm-key rel-${k}`} title={t(`mmRole.${REL_KEY[k]}Title`)}><svg width="24" height="8"><line x1="1" y1="4" x2="23" y2="4" /></svg>{t(`mmRole.${REL_KEY[k]}`)}</span>)}
        <span className="mt-mm-key rel-cross" title={t('mmRole.relCrossTitle')}><svg width="24" height="8"><line className="case" x1="1" y1="4" x2="23" y2="4" /><line x1="1" y1="4" x2="23" y2="4" /></svg>{t('mmRole.relCross')}</span>
      </div>
      <div className="mt-mm-lhint">{t('mmRole.hint')}</div>
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
  const workspaces = useStore((st) => st.workspaces);
  const [shut, setShut] = useState(() => new Set()); // P46: 접은 무리(워크스페이스 키)
  const vgroups = useStore((st) => st.groups); // P44 가상 그룹
  const [hot, setHot] = useState(null); // P94: 가리키거나 키보드로 고른 세션 id
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
  const order = useMemo(() => (workspaces || []).map((w) => w.key), [workspaces]);
  const lay = useMemo(() => (graph ? missionLayout(graph, { filter, collapsed: [...shut], order, vgroups }) : null), [graph, filter, shut, order, vgroups]);
  const roles = useMemo(() => (graph && lay ? roleModel(graph, { live: sessions, tree: lay.tree }) : new Map()), [graph, lay, sessions]);
  const focus = useMemo(() => (lay && hot ? focusOf(lay.tree, hot, lay.edges.filter((e) => e.rel === 'human')) : null), [lay, hot]);
  useEffect(() => { if (!open) setHot(null); }, [open]);
  const gName = (key) => (key ? wsName(key) : t('mmapGroup.noWorkspace'));
  const wsLabel = (key) => (key ? wsName(key) : t('mmapGroup.noWorkspace'));
  const toggle = (key) => setShut((cur) => { const n = new Set(cur); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  if (!open) return null;

  const go = (n) => {
    setMissionOpen(false);
    const st = getState();
    if (n.kind === 'session') setTimeout(() => st.navigateTo && st.navigateTo(n.sessionId), 30);
  };
  // P32: 빈 곳을 누르면 닫는다(글을 고르며 끈 경우는 빼고)
  const onBackdrop = (e) => {
    if (e.button !== 0 || e.target.closest(SOLID)) return;
    const sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed && String(sel).trim()) return;
    setMissionOpen(false);
  };
  const c = (graph && graph.counts) || {};
  const tipOf = (e) => {
    const kinds = e.kinds.map((k) => t(`mission.edge.${k}`)).join(' · ');
    return [`${kinds}${e.role ? `: ${e.role}` : ''}`, e.cross ? `${t('mmapGroup.crossTitle')}: ${gName(e.fromGroup)} → ${gName(e.toGroup)}` : null, e.text ? `“${e.text}”` : null, e.count ? t('mission.edgeCount', { n: e.count }) : null, e.lastAt ? t('mission.edgeLast', { time: fmtTime(e.lastAt) }) : null].filter(Boolean).join('\n');
  };
  return (
    <div className="mt-mission" data-role="mission" onClick={onBackdrop}>
      <div className="mt-mission-head">
        <b className="mt-mission-title">{t('mission.title')}</b>
        <span className="mt-mission-filters">
          {CATS.map((k) => <button key={k} className={`mt-mm-filter c-${k}${filter === k ? ' on' : ''}`} data-filter={k} onClick={() => setFilter(k)}>{k !== 'all' && <i className="mt-mm-fdot" />}{t(`mission.cat.${k}`)}<span className="mt-mm-fn">{k === 'all' ? c.all ?? '' : c[k] ?? 0}</span></button>)}
        </span>
        <span className="mt-node-sp" />
        <button className="mt-x" data-action="mission-close" title={t('mission.closeTitle')} onClick={() => setMissionOpen(false)}>×</button>
      </div>
      <div className={`mt-mission-body nowheel${focus ? ' focusing' : ''}`}>
        {!lay ? <div className="dim" style={{ padding: 20 }}>{t('common.loading')}</div> : (
          <div className="mt-mission-canvas" style={{ width: lay.width, height: lay.height }}>
            {lay.bands.map((bd) => (
              <div key={`b:${bd.id}`} className="mt-mm-band" data-role="mm-band" data-group={bd.id} style={{ left: bd.x, top: bd.y, width: bd.w, height: bd.h }}>
                <span className="mt-mm-bandname">{t('mmRole.groupTag', { name: bd.name })}</span>
              </div>
            ))}
            {lay.groups.map((g) => (
              <div key={`g:${g.key}`} className={`mt-mm-group${g.collapsed ? ' shut' : ''}`} data-role="mm-group" data-key={g.key} data-collapsed={g.collapsed ? '1' : undefined} style={{ left: g.x, top: g.y, width: g.w, height: g.h }}>
                <button className="mt-mm-ghead" data-action="mm-group-toggle" title={t('mmapGroup.toggleTitle')} onClick={(ev) => { ev.stopPropagation(); toggle(g.key); }}>
                  <span className="mt-mm-gcaret" aria-label={t(g.collapsed ? 'mmapGroup.expand' : 'mmapGroup.collapse')}>{g.collapsed ? '▸' : '▾'}</span>
                  <b className="mt-mm-gname" data-role="mm-group-name">{gName(g.key)}</b>
                  {g.vg && <span className="mt-mm-gvg" data-role="mm-vgroup">{g.vg.name}</span>}
                  <span className="mt-mm-gcount">{t('mmapGroup.sessions', { n: g.count })}</span>
                  {g.needs > 0 && <span className="mt-mm-gneeds" data-role="mm-group-needs">{t('mmapGroup.needs', { n: g.needs })}</span>}
                </button>
                {g.looseAt && <div className="mt-mm-gloose" style={{ left: g.looseAt.x - g.x, top: g.looseAt.y - g.y }}>{t('mmap.loose')}</div>}
              </div>
            ))}
            {focus && lay.teams.filter((tm) => tm.lead === focus.lead || tm.lead === hot).map((tm) => <div key={`t:${tm.lead}`} className="mt-mm-teambox" data-role="mm-team-box" data-lead={tm.lead} style={{ left: tm.x, top: tm.y, width: tm.w, height: tm.h }} />)}
            <svg className="mt-mm-svg" width={lay.width} height={lay.height}>
              <defs>
                {REL_ORDER.map((k) => <marker key={k} id={`mm-arrow-${k}`} className={`mt-mm-arrow rel-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" /></marker>)}
              </defs>
              {lay.edges.map((e) => (
                <g key={e.id} className={`mt-mm-edge k-${e.primary} rel-${e.rel}${e.active ? ' active' : ''}${e.back ? ' back' : ''}${e.kinds.length > 1 ? ' multi' : ''}${e.cross ? ' cross' : ''}${focus ? (focus.pairs.has(e.id) ? ' hot' : ' recede') : ''}`} data-role="mm-edge" data-kind={e.primary} data-rel={e.rel} data-kinds={e.kinds.join(' ')} data-from={e.from} data-to={e.to} data-cross={e.cross ? '1' : undefined}>
                  <path className="hit" d={e.d} />
                  {e.cross && <path className="case" d={e.d} />}
                  <path className="line" d={e.d} markerEnd={`url(#mm-arrow-${e.rel})`} />
                  {!e.label && <circle className="dot" cx={e.lx} cy={e.ly} r="3.5" />}
                  <title>{tipOf(e)}</title>
                </g>
              ))}
            </svg>
            {lay.edges.filter((e) => e.label && !(e.rel === 'spawn' && !e.role && !e.cross)).map((e) => ( // P94: 이름 없는 하위 세션 선은 모양이 말한다(이름표 없음)
              <span key={`l:${e.id}`} className={`mt-mm-label k-${e.primary} rel-${e.rel}${e.cross ? ' cross' : ''}${focus ? (focus.pairs.has(e.id) ? ' hot' : ' recede') : ''}`} data-role="mm-label" data-kind={e.primary} data-rel={e.rel} style={{ left: e.lx, top: e.ly, maxWidth: e.cross ? MISSION.colGap - 14 : MISSION.labelW }} title={tipOf(e)}>
                {e.role && <RoleGlyph family={roles.get(e.to) ? roles.get(e.to).family : 'worker'} />}{edgeLabel(e, t)}{e.cross ? <span className="mt-mm-lcross"> {t('mmRole.cross', { ws: wsLabel(e.toGroup) })}</span> : null}
              </span>
            ))}
            {[...lay.boxes.values()].filter((b) => !b.proxy).map((b) => <Box key={b.node.id} b={b} live={b.node.sessionId ? sessions.get(b.node.sessionId) : null} onGo={go} role={roles.get(b.node.id)} hot={hot === b.node.id} recede={!!focus && !focus.nodes.has(b.node.id) && !(b.node.kind === 'human' && lay.edges.some((e) => e.rel === 'human' && focus.pairs.has(e.id)))} onHot={setHot} />)}
            {lay.boxes.size === 0 && <div className="dim mt-mm-empty">{t('mission.empty')}{filter !== 'all' ? t('mission.emptyFiltered') : ''}</div>}
          </div>
        )}
      </div>
      {lay && lay.boxes.size > 0 && <Legend />}
    </div>
  );
}
