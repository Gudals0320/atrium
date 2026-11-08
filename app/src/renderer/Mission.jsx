// 미션 맵(ARCH 4절 I6, P6c → P32 → P95 → P100에서 다시 그림): 덮개 화면. 워크스페이스 판들이 지도 칸을 채우고, 판 안은 왼쪽 → 오른쪽 나무(리드 → 하위). 오른쪽 요약 열.
// - 배치는 lib/mission-layout.js(순수 함수, 휴대폰과 같은 엔진), 역할·관계·요약은 PC와 휴대폰이 같이 쓰는 lib/mission-model.js.
// - 워크스페이스는 옅은 바탕 면의 판과 머리줄(폴더 기호, 이름, 세션 수, 응답 필요 수, 일함 수)로 묶인다. 머리줄을 누르면 접는다.
//   가상 그룹(P44, P91 폴더 묶음)은 그 판들을 감싸는 옅은 테와 그룹 이름(판 위 단계). 다른 워크스페이스로 이어진 판은 옆에 붙는다.
// - 모든 세션은 테두리 있는 모양이다: 카드(이름과 상태 기호, 역할 · 지금 하는 일 또는 묻는 글, 종류 기호와 메타, 오른쪽 아래 경고) 또는 알약(쉼·잠듦·끝남: 종류 기호, 이름, 역할, 상태 기호와 때).
//   상태는 모양 안의 기호(점, !, ✕, ✓, 빈 고리, 달, 빈 네모)와 테두리·왼쪽 띠 색으로 구별한다(색만으로 뜻을 싣지 않는다). 쉬는 하위가 아주 많으면 동그라미 상자로 접힌다.
// - 선은 이름표 없는 곡선. 관계 종류는 모양(나무 밖 연결은 옅은 점선, 요청은 점 선, 다른 워크스페이스는 긴 점선)과 가리킬 때 뜨는 풀이로 구별한다. 일하는 쪽으로 가는 선은 일함 색.
// - 세션(또는 요약 열의 줄)을 가리키거나 키보드로 고르면 그 세션·조상·팀·바로 이어진 세션만 또렷하다(P94). 누르면 덮개를 닫고 판의 그 노드로 간다.
// - 확대는 배치가 정한다(지금은 1배: 큰 화면은 판 열을 넓혀 채운다). 위 거르기는 흐리게만 한다(자리 그대로). 빈 곳을 누르거나 Esc를 누르면 닫힌다(P32).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, getState, setMissionOpen, toast, wsName } from './store.js';
import { missionLayout, mapOrder, edgeLabel } from './lib/mission-layout.js';
import { roleModel, focusOf, teamText, roleText, nodeTier, filterMatch, FILTERS, modelText, ageText, missionSummary } from './lib/mission-model.js';
import { STATE_LABEL } from './lib/labels.js';
import { useT, errText, fmtTime } from './lib/i18n.js';
import { KindIcon } from './SessionNode.jsx';
import { StateGlyph, FolderGlyph } from './MissionGlyph.jsx';

// 빈 곳 누르기에서 빼는 것
const SOLID = '[data-role="mm-node"], [data-role="mm-edge"], [data-role="mm-summary"], [data-role="mm-group"], button, input, select, a';
const clip = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const branchOfLive = (live) => (live && live.git && live.git.isWorktree && live.git.branch) || null;

// 세션 하나의 보일 글: 상태 글, 지금 하는 일, 메타, 경고, 둘째 줄
export function facts(n, live, m, tier, t, now) {
  const kind = (live && (live.flavor || live.kind)) || n.agentKind || 'claude';
  const shell = kind === 'shell' || n.agentKind === 'shell';
  const cmd = live && live.shell && live.shell.atPrompt === false ? live.shell.command || (live.shell.procs || []).join(', ') : null;
  const ask = n.ask || (live && live.ask && (live.ask.summary || live.ask.kind)) || null;
  const err = live && live.error ? (live.error.message || String(live.error)) : null;
  const state = live ? live.state : n.state;
  const stateText = shell && state !== 'exited' && state !== 'sleeping' ? (cmd ? STATE_LABEL.shell_running : STATE_LABEL.shell_idle) : STATE_LABEL[state] || state || '';
  const doing = cmd ? `$ ${cmd}` : tier === 'work' && (n.lastPrompt || (live && live.lastPrompt)) ? clip(n.lastPrompt || live.lastPrompt, 90) : null;
  const role = m ? roleText(m, t) : '';
  const team = m && m.team ? teamText(m, t) : null;
  const turnAt = n.turnAt || (live && live.state === 'working' && live.turn && live.turn.startedAt) || null;
  const activeAt = n.activeAt || (live && live.lastActivityAt) || null;
  const age = tier === 'work' && turnAt ? ageText(now - turnAt, t) : activeAt ? ageText(now - activeAt, t) : null;
  const model = shell ? null : modelText(n.model || (live && live.model), n.effort || (live && live.effort));
  const branch = n.gitBranch || branchOfLive(live);
  const meta = [model, age, branch ? `⎇ ${branch}` : null, n.loops ? `⟳${n.loops}` : null].filter(Boolean).join(' · ');
  const warn = tier === 'turn' ? t('mmMap.warnTurn') : tier === 'alert' ? t('mmMap.warnAlert') : tier === 'review' ? t('mmMap.warnReview') : m && m.climb ? t('mmMap.warnClimb', { n: m.climb }) : null;
  // 둘째 줄: 응답 필요는 묻는 글, 오류는 오류, 팀이 있으면 팀 요약(쉬는 리드는 "워커 n 기다림"), 그 밖은 역할 · 지금 하는 일(없으면 상태)
  const line = tier === 'turn' && ask ? { k: 'ask', main: null, text: clip(ask, 120) }
    : tier === 'alert' ? { k: 'err', main: role, text: clip(err || stateText, 90) }
    : team ? { k: 'team', main: role, text: [t('mmRole.team', { n: m.team.size }), m.waiting ? t('mmRole.waiting', { n: m.waiting }) : m.team.work ? t('mmRole.teamWork', { n: m.team.work }) : null].filter(Boolean).join(' · ') }
    : { k: doing ? 'now' : 'state', main: role, text: doing || stateText };
  // 알약 오른쪽 글: 잠듦은 "잠듦 3일", 끝남은 "끝남", 쉼은 지난 시간
  const restAge = activeAt ? ageText(now - activeAt, t) : null;
  const pill = tier === 'sleep' ? t('mmBoard.pillSleep', { age: restAge || '' }).trim() : tier === 'done' ? t('mmBoard.pillDone') : restAge || stateText;
  return { kind, shell, ask, stateText, doing, role, team, meta, warn, line, pill };
}

function Node({ b, live, m, tier, t, now, no, hot, recede, dim, cross, onGo, onHot }) {
  const n = b.node;
  const f = facts(n, live, m, tier, t, now);
  const style = { left: b.x, top: b.y, width: b.w, height: b.h };
  const st = (live && live.state) || n.state;
  const tip = [`@${n.name} · ${f.role || f.stateText}`, f.team, f.ask ? `${t('mmap.ask')} ${f.ask}` : null, n.lastPrompt ? `${t('mmap.prompt')} ${n.lastPrompt}` : null, cross ? t('mmMap.crossWs', { ws: wsName(n.workspaceKey) }) : null, f.meta || null, t('mission.goSession')].filter(Boolean).join('\n');
  const common = {
    'data-role': 'mm-node', 'data-kind': 'session', 'data-name': n.name, 'data-tier': tier, 'data-rank': m ? m.rank : undefined, 'data-family': m ? m.family : undefined, 'data-shape': b.kind, 'data-ws': b.ws,
    tabIndex: 0, title: tip, onClick: () => onGo(n), onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGo(n); } },
    onMouseEnter: () => onHot(n.id), onMouseLeave: () => onHot(null), onFocus: () => onHot(n.id), onBlur: () => onHot(null),
  };
  const cls = `t-${tier}${f.shell ? ' shell' : ''}${st === 'starting' ? ' starting' : ''}${hot ? ' hot' : ''}${recede ? ' recede' : ''}${dim ? ' fdim' : ''}`;
  if (b.kind === 'dot') return <div className={`mt-mm-dot ${cls}`} style={style} {...common}><KindIcon kind={f.kind} /></div>;
  if (b.kind === 'pill') return (
    <div className={`mt-mm-pill ${cls}`} style={style} {...common}>
      <KindIcon kind={f.kind} /><span className="nm">{n.name}</span>
      {m && m.rank !== 'solo' && <span className="rl" data-role="mm-role">{f.role}</span>}
      <span className="sp" /><StateGlyph tier={tier} shell={f.shell} /><span className="ag" data-role="mm-pill-state">{f.pill}</span>
    </div>
  );
  return (
    <div className={`mt-mm-card ${cls}${m && m.team ? ' lead' : ''}`} style={style} {...common}>
      <div className="mt-mm-c1"><StateGlyph tier={tier} shell={f.shell} /><b className="mt-mm-name">{n.name}</b>{no ? <span className="mt-mm-no" data-role="mm-team-no">{no}</span> : null}</div>
      <div className={`mt-mm-c2 k-${f.line.k}`} data-role={f.line.k === 'ask' ? 'mm-ask' : f.line.k === 'team' ? 'mm-team' : 'mm-line'}>
        {f.line.main ? <b data-role="mm-role">{f.line.main}</b> : null}{f.line.main && f.line.text ? ' · ' : null}{f.line.text}
      </div>
      <div className="mt-mm-c3"><KindIcon kind={f.kind} /><span className="mt-mm-meta" data-role="mm-meta">{f.meta || (f.shell ? t('mmMap.noModel') : '')}</span>{f.warn ? <span className="mt-mm-warn" data-role="mm-warn">{f.warn}</span> : null}</div>
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
  const workspaces = useStore((st) => st.workspaces);
  const vgroups = useStore((st) => st.groups); // P44 가상 그룹, P91 폴더 묶음
  const [graph, setGraph] = useState(null);
  const [filter, setFilter] = useState('all');
  const [shut, setShut] = useState(() => new Set()); // 접은 워크스페이스 키
  const [hot, setHot] = useState(null); // 가리키거나 키보드로 고른 세션 id
  const [area, setArea] = useState({ w: 1300, h: 800 }); // 지도 칸 크기(판 열 수와 확대를 정한다)
  const bodyRef = useRef(null);
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
  useEffect(() => { if (!open) setHot(null); }, [open]);
  // 지도 칸 크기: 10px 단위로 내려 잡아(넘치지 않게) 다시 놓기를 줄인다. 스크롤 막대 자리는 빼지 않는다(offset 크기)
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!open || !el) return undefined;
    const read = () => { const w = Math.max(480, Math.floor(el.offsetWidth / 10) * 10 - 10), h = Math.max(300, Math.floor(el.offsetHeight / 10) * 10 - 10); setArea((v) => (v.w === w && v.h === h ? v : { w, h })); };
    read();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', read);
    return () => { if (ro) ro.disconnect(); else window.removeEventListener('resize', read); };
  }, [open, !!graph]); // eslint-disable-line react-hooks/exhaustive-deps

  const order = useMemo(() => (workspaces || []).map((w) => w.key), [workspaces]);
  const liveOf = (n) => (n && n.sessionId ? sessions.get(n.sessionId) : null);
  const tiers = useMemo(() => new Map(graph ? graph.nodes.filter((n) => n.kind === 'session').map((n) => [n.id, nodeTier(n, liveOf(n))]) : []), [graph, sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const lay = useMemo(() => (graph ? missionLayout(graph, { collapsed: [...shut], order, vgroups, tiers, width: area.w, height: area.h }) : null), [graph, shut, order, vgroups, tiers, area]);
  const roles = useMemo(() => (graph && lay ? roleModel(graph, { tiers, tree: lay.tree }) : new Map()), [graph, lay, tiers]);
  const focus = useMemo(() => (lay && hot ? focusOf(lay.tree, hot) : null), [lay, hot]);
  const ids = useMemo(() => (lay ? mapOrder(lay) : []), [lay]);
  const sum = useMemo(() => missionSummary(lay ? lay.tree.nodes.map((n) => n.id).sort((a, b) => (ids.indexOf(a) + 1 || 1e9) - (ids.indexOf(b) + 1 || 1e9)) : [], (id) => tiers.get(id)), [lay, ids, tiers]);
  if (!open) return null;

  const now = Date.now();
  const gName = (key) => (key ? wsName(key) : t('mmapGroup.noWorkspace'));
  const toggle = (key) => setShut((cur) => { const n = new Set(cur); if (n.has(key)) n.delete(key); else n.add(key); return n; });
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
  const nameOf = (id) => { const n = lay && lay.tree.byId.get(id); return n ? n.name : id; };
  const tipOf = (e) => {
    const rel = e.cross ? t('mmRole.relCross') : t(`mmRole.${{ spawn: 'relSpawn', role: 'relRole', prompt: 'relPrompt' }[e.rel] || 'relRole'}`);
    const who = e.from.startsWith('g:') || e.to.startsWith('g:') || e.to.startsWith('dots:') ? null : t('mmMap.edgeTip', { from: nameOf(e.from), to: nameOf(e.to) });
    return [who, `${rel}${e.role ? ` · ${e.role}` : ''}`, e.cross ? `${t('mmapGroup.crossTitle')}` : null, e.text ? `“${e.text}”` : null, e.count > 1 ? edgeLabel(e, t) : null, e.lastAt ? t('mission.edgeLast', { time: fmtTime(e.lastAt) }) : null].filter(Boolean).join('\n');
  };
  const edgeHot = (e) => !!focus && (focus.pairs.has(e.id) || (e.members || []).some((x) => focus.pairs.has(x)));
  const fdim = (id) => filter !== 'all' && !filterMatch(tiers.get(id), filter);
  const counts = sum.counts;
  const catN = { all: counts.all, needs_you: counts.turn, working: counts.work, idle: counts.idle, done: counts.review, exited: counts.gone };
  const boxes = lay ? [...lay.boxes.values()] : [];
  const z = lay ? lay.zoom : 1;
  const sumItem = (id, text, ask) => {
    const n = lay.tree.byId.get(id), tier = tiers.get(id), no = lay.teamNo.get(id), live = liveOf(n);
    const shell = (live && live.kind === 'shell') || n.agentKind === 'shell';
    const hov = { onMouseEnter: () => setHot(id), onMouseLeave: () => setHot(null), onFocus: () => setHot(id), onBlur: () => setHot(null) };
    if (ask) return (
      <div key={id} className={`mt-mm-ask t-${tier}${hot === id ? ' hot' : ''}`} data-role="mm-sum-item" data-name={n.name} {...hov}>
        <div className="a"><StateGlyph tier={tier} shell={shell} />{no ? <span className="mt-mm-no">{no}</span> : null}<b>{n.name}</b><span className="ws">{gName(n.workspaceKey)}</span></div>
        {text ? <div className="q">{text}</div> : null}
        <button type="button" className="go" data-action="mm-go" onClick={() => go(n)}>{t('mmBoard.goAnswer')}</button>
      </div>
    );
    return (
      <button key={id} type="button" className={`mt-mm-si t-${tier}${hot === id ? ' hot' : ''}`} data-role="mm-sum-item" data-name={n.name} onClick={() => go(n)} {...hov}>
        <StateGlyph tier={tier} shell={shell} />{no ? <span className="mt-mm-no">{no}</span> : null}<b className="nm">{n.name}</b>{text ? <span className="b">{text}</span> : null}
      </button>
    );
  };
  const nowText = (id) => {
    const n = lay.tree.byId.get(id), live = liveOf(n), m = roles.get(id);
    const f = facts(n, live, m, tiers.get(id), t, now);
    return f.doing || (f.team ? `${f.role} · ${f.team}` : f.role ? `${f.role} · ${f.stateText}` : f.stateText);
  };
  const askText = (id) => { const n = lay.tree.byId.get(id), live = liveOf(n); const f = facts(n, live, roles.get(id), tiers.get(id), t, now); return f.line.k === 'ask' || f.line.k === 'err' ? f.line.text : f.stateText; };
  const REST_MAX = 30;
  const center = lay && (lay.width + 2 * 24) * z < area.w - 4; // 여백도 확대된다
  return (
    <div className="mt-mission" data-role="mission" onClick={onBackdrop}>
      <div className="mt-mission-head">
        <b className="mt-mission-title">{t('mission.title')}</b>
        <span className="mt-mission-filters" role="tablist">
          {FILTERS.map((k) => <button key={k} role="tab" aria-selected={filter === k} className={`mt-mm-filter c-${k}${filter === k ? ' on' : ''}`} data-filter={k} data-n={catN[k] || 0} onClick={() => setFilter(k)}>{t(`mission.cat.${k}`)}<span className="mt-mm-fn">{catN[k] ?? 0}</span></button>)}
        </span>
        <span className="mt-node-sp" />
        <button className="mt-x" data-action="mission-close" title={t('mission.closeTitle')} onClick={() => setMissionOpen(false)}>×</button>
      </div>
      <div className="mt-mission-main">
        <div className={`mt-mission-body nowheel${focus ? ' focusing' : ''}`} ref={bodyRef}>
          {!lay ? <div className="dim" style={{ padding: 20 }}>{t('common.loading')}</div> : (
            <div className={`mt-mission-canvas${center ? ' center' : ''}`} data-role="mm-canvas" data-zoom={z} style={{ width: lay.width, height: lay.height, zoom: z }}>
              {lay.frames.map((f) => (
                <div key={`f:${f.id}`} className={`mt-mm-frame${focus ? ' recede' : ''}`} data-role="mm-frame" style={{ left: f.x, top: f.y, width: f.w, height: f.h }} title={t('mmBoard.frameTitle', { name: f.name })}>
                  <span className="lb" data-role="mm-vgroup">{f.name}</span>
                </div>
              ))}
              {lay.groups.map((g) => (
                <section key={`g:${g.key}`} className={`mt-mm-ws${g.collapsed ? ' shut' : ''}`} data-role="mm-group" data-key={g.key} data-collapsed={g.collapsed ? '1' : undefined} data-vg={g.vg ? g.vg.name : undefined}
                  style={{ left: g.x, top: g.y, width: g.w, height: g.h }}>
                  <button type="button" className="hd" data-action="mm-fold" title={t('mmBoard.wsTitle', { name: gName(g.key), n: g.count })} aria-expanded={!g.collapsed} onClick={(ev) => { ev.stopPropagation(); toggle(g.key); }}>
                    <FolderGlyph />
                    <span className="nm" data-role="mm-group-name">{gName(g.key)}</span>
                    <span className="n" data-role="mm-group-count">{g.count}</span>
                    <span className="sp" />
                    {g.needs > 0 && <span className="c turn" data-role="mm-group-needs" title={t('mmBoard.wsNeeds', { n: g.needs })}>!&nbsp;{g.needs}</span>}
                    {g.work > 0 && <span className="c work" data-role="mm-group-work" title={t('mmBoard.wsWorking', { n: g.work })}><i aria-hidden="true" />{g.work}</span>}
                    <span className="car" aria-hidden="true">{g.collapsed ? '▸' : '▾'}</span>
                  </button>
                </section>
              ))}
              <svg className="mt-mm-svg" width={lay.width} height={lay.height}>
                {lay.edges.filter((e) => !e.quiet || edgeHot(e)).map((e) => {
                  const to = lay.boxes.get(e.to);
                  const target = to && to.node && to.node.kind === 'session' ? tiers.get(e.to) : null;
                  const hotE = edgeHot(e);
                  return (
                    <g key={e.id} className={`mt-mm-edge rel-${e.rel}${e.tree ? ' tree' : ' link'}${e.cross ? ' cross' : ''}${e.back ? ' back' : ''}${target === 'work' || e.active ? ' active' : ''}${target === 'turn' ? ' turn' : ''}${focus ? (hotE ? ' hot' : ' recede') : ''}`}
                      data-role="mm-edge" data-kind={e.primary} data-rel={e.rel} data-from={e.from} data-to={e.to} data-cross={e.cross ? '1' : undefined} data-tree={e.tree ? '1' : undefined}>
                      <path className="hit" d={e.d} />
                      <path className="line" d={e.d} />
                      <title>{tipOf(e)}</title>
                    </g>
                  );
                })}
              </svg>
              {boxes.filter((b) => b.kind === 'dots').map((b) => (
                <div key={b.id} className={`mt-mm-dots${focus && !b.node.ids.some((x) => focus.nodes.has(x)) ? ' recede' : ''}`} data-role="mm-dots" style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
                  <span className="lb">{t('mmBoard.dots', { n: b.node.ids.length })}</span>
                </div>
              ))}
              {boxes.filter((b) => b.node && b.node.kind === 'session').map((b) => (
                <Node key={b.node.id} b={b} cross={false} live={liveOf(b.node)} m={roles.get(b.node.id)} tier={tiers.get(b.node.id)} t={t} now={now} no={lay.teamNo.get(b.node.id)}
                  hot={hot === b.node.id} recede={!!focus && !focus.nodes.has(b.node.id)} dim={fdim(b.node.id)} onGo={go} onHot={setHot} />
              ))}
              {boxes.length === 0 && lay.groups.length === 0 && <div className="dim mt-mm-empty">{t('mission.empty')}</div>}
            </div>
          )}
        </div>
        {lay && (
          <aside className="mt-mm-sum" data-role="mm-summary" aria-label={t('mission.title')}>
            {sum.turn.length > 0 && <section className="mt-mm-sec turn" data-role="mm-sum-turn"><h4 className="mt-mm-sech">{t('mmMap.sumTurn')}<i>{sum.turn.length}</i></h4>{sum.turn.map((id) => sumItem(id, askText(id), true))}</section>}
            <section className="mt-mm-sec" data-role="mm-sum-work"><h4 className="mt-mm-sech">{t('mmMap.sumWork')}<i>{sum.work.length}</i></h4>{sum.work.length ? sum.work.map((id) => sumItem(id, nowText(id))) : <div className="mt-mm-none">{t('mmMap.sumNone')}</div>}</section>
            {sum.review.length > 0 && <section className="mt-mm-sec" data-role="mm-sum-review"><h4 className="mt-mm-sech">{t('mmMap.sumReview')}<i>{sum.review.length}</i></h4>{sum.review.map((id) => sumItem(id, nowText(id)))}</section>}
            {sum.rest.length > 0 && (
              <section className="mt-mm-sec" data-role="mm-sum-rest"><h4 className="mt-mm-sech">{t('mmMap.sumRest')}<i>{sum.rest.length}</i></h4>
                <div className="mt-mm-rest">{sum.rest.slice(0, REST_MAX).map((id) => { const n = lay.tree.byId.get(id); return <button key={id} type="button" className={`mt-mm-rn t-${tiers.get(id)}`} data-role="mm-sum-rest-item" onClick={() => go(n)} onMouseEnter={() => setHot(id)} onMouseLeave={() => setHot(null)}><StateGlyph tier={tiers.get(id)} />{n.name}</button>; })}
                  {sum.rest.length > REST_MAX ? <span className="mt-mm-more">{t('mmMap.restHidden', { n: sum.rest.length - REST_MAX })}</span> : null}</div>
              </section>
            )}
            <div className="mt-mm-foot" data-role="mm-sum-foot">
              <div>{t('mmMap.sumFoot', { work: counts.work, all: counts.all, teams: lay.teamNo.size })}</div>
              <div className="mt-mm-hint">{t('mmBoard.hint')}</div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
