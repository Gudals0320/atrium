// P148: 휴대폰 미션 맵의 "부대" 모양(기본). PC 부대 지도(MissionSquads.jsx, P147)와 같은 시각 언어를 좁은 화면 한 열로 놓는다.
// - 위: 거르기 칩(전체·응답 필요·작업 중·작업 완료)과 "기다리는 일" 카드 줄(응답 필요·오류 → 작업 완료, 가로로 민다). 없으면 한 줄.
// - 아래: 폴더 틀 > 워크스페이스 판 > 팀마다 부대 카드(리드 머리 + 들여쓴 하위 줄, 나무 선의 모양 = 관계 종류, 다른 워크스페이스 ↗ 칩), 혼자인 줄, 쉬는 알약 묶음.
//   자리는 lib/phone-squads.js(PC의 rosterLayout을 한 열·손가락 치수로)가 정한다. 줄은 44px, 머리 64px.
// - 손가락: 페이지가 아니라 지도 칸이 세로로 스크롤한다(네이티브 스크롤, 옮기기·확대 셈 없음). 줄을 누르면 그 세션 화면(Phone.jsx), 돌아오면 같은 스크롤 자리.
//   워크스페이스 머리를 누르면 접는다(이 기기 localStorage). 거르기는 흐리게만(자리 그대로).
// - 가볍게(P84·P86): DOM 줄과 SVG 한 장, WebGL·filter·backdrop-filter·will-change 없음. 일하는 줄의 고리는 PC와 같은 .mt-sq-pulse(steps, 판 설정 workLight를 따른다).
// - 자료는 mission.graph와 판의 세션 요약만 받는다(대화·터미널 없음, P87과 같다).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, wsName } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { phoneSquads, PHONE_SQ_SHUT_KEY } from './lib/phone-squads.js';
import { roleModel, filterMatch, missionSummary, nodeTier } from './lib/mission-model.js';
import { facts, Avatar } from './Mission.jsx';

const REFRESH_MS = 600;
let cache = null; // 마지막 mission.graph(돌아오면 바로 그린다)
let scrollAt = null; // 마지막 스크롤 { w: 폭, top }
const store = () => { try { return localStorage; } catch { return null; } };
const readShut = () => { try { return JSON.parse(store().getItem(PHONE_SQ_SHUT_KEY) || '[]'); } catch { return []; } };
const clip = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const TIER_ORDER = ['turn', 'alert', 'work', 'review', 'rest', 'sleep', 'done'];
const FILTERS = ['all', 'needs_you', 'working', 'done'];
const descOf = (tree, id) => { const out = []; const walk = (x, i) => { if (i > 1000) return; for (const c of tree.kids.get(x) || []) { out.push(c.id); walk(c.id, i + 1); } }; walk(id, 0); return out; };

function TeamBar({ ids, tiers, t }) {
  const list = [...ids].sort((a, b) => TIER_ORDER.indexOf(tiers.get(a)) - TIER_ORDER.indexOf(tiers.get(b)));
  const n = (k) => list.filter((id) => tiers.get(id) === k).length;
  const title = t('mmSquad.teamBar', { n: list.length, work: n('work'), turn: n('turn') + n('alert') });
  return <span className="mt-sq-bar" data-role="sq-teambar" aria-label={title}>{list.slice(0, 24).map((id) => <i key={id} className={`b-${tiers.get(id)}`} />)}</span>;
}

export function PhoneSquads({ onBack, onOpen, conn, switcher }) {
  const t = useT();
  const sessions = useStore((st) => st.sessions);
  const links = useStore((st) => st.links);
  const thread = useStore((st) => st.thread);
  const loops = useStore((st) => st.loops);
  const workspaces = useStore((st) => st.workspaces);
  const vgroups = useStore((st) => st.groups);
  const [graph, setGraph] = useState(cache);
  const [fail, setFail] = useState(null);
  const [shut, setShut] = useState(readShut);
  const [filter, setFilter] = useState('all');
  const [width, setWidth] = useState(0);
  const scrollRef = useRef(null);
  const placed = useRef(false);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => api.call('mission.graph').then((g) => { cache = g; if (alive) { setGraph(g); setFail(null); } }).catch((e) => { if (alive) setFail(e); }), graph ? REFRESH_MS : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [sessions, links, thread, loops]); // eslint-disable-line react-hooks/exhaustive-deps
  // 지도 칸 폭(세로·가로 돌리기)
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const read = () => { const w = Math.floor(el.clientWidth); if (w > 0) setWidth((v) => (v === w ? v : w)); };
    read();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', read);
    return () => { if (ro) ro.disconnect(); else window.removeEventListener('resize', read); };
  }, []);

  const order = useMemo(() => (workspaces || []).map((w) => w.key), [workspaces]);
  const tiers = useMemo(() => {
    const out = new Map();
    if (graph) for (const n of graph.nodes) if (n.kind === 'session') out.set(n.id, nodeTier(n, n.sessionId ? sessions.get(n.sessionId) : null));
    return out;
  }, [graph, sessions]);
  const lay = useMemo(() => (graph && width ? phoneSquads(graph, { width, tiers, order, vgroups, collapsed: shut }) : null), [graph, width, tiers, order, vgroups, shut]);
  const roles = useMemo(() => (graph && lay ? roleModel(graph, { tiers, tree: lay.tree }) : new Map()), [graph, lay, tiers]);
  const sum = useMemo(() => missionSummary(lay ? lay.order : [], (id) => tiers.get(id)), [lay, tiers]);

  // 돌아오면 같은 스크롤 자리(폭이 같을 때)
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!lay || !el || placed.current) return;
    placed.current = true;
    if (scrollAt && scrollAt.w === width) el.scrollTop = scrollAt.top;
  }, [lay]); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = (e) => { scrollAt = { w: width, top: e.currentTarget.scrollTop }; };
  window.__mtPsq = { lay: () => lay, scroll: () => (scrollRef.current ? scrollRef.current.scrollTop : null) }; // 시험이 읽는다

  const toggle = (key) => setShut((cur) => { const n = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]; try { store().setItem(PHONE_SQ_SHUT_KEY, JSON.stringify(n)); } catch {} return n; });
  const now = Date.now();
  const nodeOf = (id) => lay && lay.tree.byId.get(id);
  const nameOf = (id) => { const n = nodeOf(id); return n ? n.name : id; };
  const liveOf = (n) => (n && n.sessionId ? sessions.get(n.sessionId) : null);
  const factsOf = (id) => { const n = nodeOf(id); return facts(n, liveOf(n), roles.get(id), tiers.get(id), t, now); };
  const fdim = (id) => filter !== 'all' && !filterMatch(tiers.get(id), filter);
  const go = (id) => { const n = nodeOf(id); if (n && n.sessionId) onOpen(n.sessionId); };
  const c = sum.counts;
  const catN = { all: c.all, needs_you: c.turn, working: c.work, done: c.review };

  const renderRow = (r) => {
    const id = r.id, n = nodeOf(id), tier = tiers.get(id), m = roles.get(id), f = factsOf(id);
    const head = r.kind === 'head';
    const text = f.line.k === 'team' ? [f.doing, f.line.text].filter(Boolean).join(' · ') : f.line.text;
    const leadF = r.squad && !head ? factsOf(r.squad) : null;
    const meta = head || !leadF ? (f.meta || (f.shell ? t('mmMap.noModel') : '')) : [f.model && f.model !== leadF.model ? f.model : null, f.age, f.branch ? `⎇ ${f.branch}` : null].filter(Boolean).join(' · ');
    const plainRole = m && m.rank === 'worker' && (!m.roleName || [t('roles.worker'), 'worker', t('mmRole.worker')].includes(m.roleName));
    const out = lay.links.filter((l) => l.from === id || l.to === id);
    return (
      <button key={id} type="button" className={`mt-sq-row k-${r.kind} t-${tier}${f.shell ? ' shell' : ''}${fdim(id) ? ' fdim' : ''}`} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
        data-role="sq-row" data-sq-id={id} data-id={id} data-session={n.sessionId} data-name={n.name} data-tier={tier} data-kind={r.kind} data-depth={r.depth} onClick={() => go(id)}>
        <span className="mt-sq-dot">{tier === 'work' && <i className="mt-sq-pulse" aria-hidden="true" />}<Avatar kind={f.kind} tier={tier} shell={f.shell} small /></span>
        <span className="mt-sq-main">
          <span className="mt-sq-l1">
            {head && lay.teamNo.get(id) ? <span className="mt-sq-no" data-role="sq-team-no">{lay.teamNo.get(id)}</span> : null}
            <b className="mt-sq-name">{n.name}</b>
            {m && m.rank !== 'solo' && !plainRole && <span className={`mt-sq-role f-${m.family}`} data-role="sq-role">{f.role}</span>}
            {r.cross && <span className="mt-sq-chip cross" data-role="sq-cross">↗ {wsName(n.workspaceKey)}</span>}
            {out.slice(0, 1).map((l) => { const dir = l.from === id ? 'to' : 'from'; return <span key={l.id} className={`mt-sq-chip rel-${l.rel}`} data-role="sq-link-chip" data-dir={dir}>{dir === 'to' ? '→' : '←'} {nameOf(dir === 'to' ? l.to : l.from)}</span>; })}
            {out.length > 1 && <span className="mt-sq-chip">+{out.length - 1}</span>}
            <span className="mt-sq-meta" data-role="sq-meta">{meta}</span>
          </span>
          <span className="mt-sq-l2">
            <span className={`mt-sq-text k-${f.line.k}`} data-role={f.line.k === 'ask' ? 'sq-ask' : 'sq-line'}>{text}</span>
            {head && f.warn && f.line.k !== 'ask' && f.line.k !== 'err' ? <span className="mt-sq-warn" data-role="sq-warn">{f.warn}</span> : null}
          </span>
          {head && <span className="mt-sq-l3"><TeamBar ids={descOf(lay.tree, id)} tiers={tiers} t={t} /></span>}
        </span>
      </button>
    );
  };
  const renderFold = (r) => (
    <div key={r.id} className="mt-sq-fold" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} data-role="sq-fold" data-n={r.ids.length}>
      {r.ids.map((id) => {
        const n = nodeOf(id), tier = tiers.get(id), f = factsOf(id);
        return (
          <button key={id} type="button" className={`mt-sq-pill t-${tier}${fdim(id) ? ' fdim' : ''}`} data-role="sq-row" data-kind="pill" data-sq-id={id} data-id={id} data-session={n.sessionId} data-name={n.name} data-tier={tier} onClick={() => go(id)}>
            <Avatar kind={f.kind} tier={tier} shell={f.shell} small /><span className="nm">{n.name}</span>
          </button>
        );
      })}
    </div>
  );
  const pathOf = (id) => { const n = nodeOf(id); const b = lay.blocks.find((x) => x.key === (n.workspaceKey || '')); const fd = b && b.folder ? lay.folders.find((x) => x.id === b.folder) : null; return [fd ? fd.name : null, wsName(n.workspaceKey || '') || null].filter(Boolean).join(' › '); };

  return (
    <div className="mt-ph-list mt-pm mt-sq mt-psq" data-role="phone-mission" data-style="squads">
      <header className="mt-ph-head">
        <button type="button" className="mt-pm-back" data-action="phone-mission-back" aria-label={t('phoneMission.back')} onClick={onBack}><svg className="mt-ph-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg><span>{t('phone.list')}</span></button>
        <b className="mt-pm-title">{t('phoneMission.title')}</b>
        {conn}
      </header>
      {lay && (
        <div className="mt-psq-filters" data-role="pm-sum" role="tablist">
          {FILTERS.map((k) => (k === 'done' && !catN.done && filter !== 'done' ? null : (
            <button key={k} type="button" role="tab" aria-selected={filter === k} className={`mt-psq-filter c-${k}${filter === k ? ' on' : ''}`} data-filter={k} data-n={catN[k] || 0} onClick={() => setFilter((v) => (v === k && k !== 'all' ? 'all' : k))}>
              {t(`mission.cat.${k}`)}<span className="n">{catN[k] || 0}</span>
            </button>
          )))}
        </div>
      )}
      <div className="mt-psq-scroll" data-role="pm-stage" ref={scrollRef} onScroll={onScroll}>
        {!lay && !fail && <div className="mt-ph-empty">{t('common.loading')}</div>}
        {!lay && fail && <div className="mt-ph-empty" data-role="pm-fail">{t('mission.fail', { error: errText(fail) })}</div>}
        {lay && (
          <section className={`mt-psq-dock${lay.dock.length ? '' : ' calm'}`} data-role="sq-dock" aria-label={t('mmSquad.dockTitle')}>
            <span className="mt-psq-dockh">{t('mmSquad.dockTitle')}{lay.dock.length ? <i>{lay.dock.length}</i> : null}</span>
            {lay.dock.length === 0 ? <span className="mt-sq-calm" data-role="sq-dock-none">{t('mmSquad.dockNone')}{c.work ? ` · ${t('mmFoot.work', { n: c.work })}` : ''}</span> : (
              <div className="mt-psq-dockl">
                {lay.dock.map((id) => {
                  const n = nodeOf(id), tier = tiers.get(id), f = factsOf(id);
                  const msg = tier === 'turn' ? (f.ask || f.stateText) : tier === 'alert' ? f.line.text : (f.doing || n.lastPrompt || f.stateText);
                  return (
                    <button key={id} type="button" className={`mt-sq-card t-${tier}${fdim(id) ? ' fdim' : ''}`} data-role="sq-dock-item" data-sq-dock={id} data-session={n.sessionId} data-name={n.name} data-tier={tier} onClick={() => go(id)}>
                      <span className="k">{tier === 'turn' ? t('mmMap.warnTurn') : tier === 'alert' ? t('mmMap.warnAlert') : t('mmSquad.dockDone')}{f.age ? <span className="mt-sq-meta">{f.age}</span> : null}</span>
                      <span className="p">{pathOf(id)}</span>
                      <b className="nm"><Avatar kind={f.kind} tier={tier} shell={f.shell} small />{n.name}</b>
                      <span className="q" data-role={tier === 'turn' ? 'sq-dock-ask' : 'sq-dock-text'}>{tier === 'turn' ? `“${clip(msg, 140)}”` : clip(msg, 140)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}
        {lay && lay.rows.length === 0 && lay.blocks.length === 0 && <div className="mt-ph-empty" data-role="pm-empty">{t('phone.empty')}</div>}
        {lay && lay.blocks.length > 0 && (
          <div className="mt-sq-canvas mt-psq-canvas" data-role="pm-world" style={{ width: lay.width, height: lay.height }}>
            {lay.folders.map((f, i) => (
              <div key={`f:${f.id}:${i}`} className="mt-sq-folder" data-role="sq-folder" data-id={f.id} style={{ left: f.x, top: f.y, width: f.w, height: f.h }}>
                <span className="mt-sq-fhead"><span className="ic" aria-hidden="true">▤</span><span className="nm" data-role="sq-folder-name">{f.name}</span><span className="n">{f.count}</span>{f.needs > 0 && <span className="needs">!{f.needs}</span>}</span>
              </div>
            ))}
            {lay.blocks.map((b) => (
              <div key={`w:${b.key}`} className={`mt-sq-ws${b.collapsed ? ' shut' : ''}${b.folder ? ' inf' : ''}`} data-role="sq-ws" data-key={b.key} style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
                <button type="button" className="mt-sq-wsh" data-role="sq-ws-head" data-action="pm-fold" aria-expanded={!b.collapsed} onClick={() => toggle(b.key)}>
                  <span className="caret" aria-hidden="true">{b.collapsed ? '▸' : '▾'}</span><span className="nm" data-role="sq-ws-name">{b.key ? wsName(b.key) : t('mmapGroup.noWorkspace')}</span><span className="n">{b.count}</span>{b.needs > 0 && <span className="needs">!{b.needs}</span>}
                </button>
              </div>
            ))}
            {lay.squads.map((s) => <div key={`s:${s.root}`} className="mt-sq-squad" data-role="sq-squad" data-root={s.root} style={{ left: s.x, top: s.y, width: s.w, height: s.h }} />)}
            <svg className="mt-sq-svg" width={lay.width} height={lay.height} aria-hidden="true">
              {lay.guides.map((g) => <path key={g.id} className={`mt-sq-guide rel-${g.rel}${g.cross ? ' cross' : ''}`} data-role="sq-guide" data-rel={g.rel} data-from={g.from} data-to={g.to || undefined} d={g.d} />)}
            </svg>
            {lay.rows.map((r) => (r.kind === 'fold' ? renderFold(r) : renderRow(r)))}
          </div>
        )}
        {lay && (
          <div className="mt-psq-foot" data-role="sq-foot">
            <span>{[t('mmFoot.work', { n: c.work }), t('mmFoot.sessions', { n: c.all }), t('mmFoot.teams', { n: lay.teamNo.size })].join(' · ')}</span>
            {switcher}
          </div>
        )}
      </div>
    </div>
  );
}
