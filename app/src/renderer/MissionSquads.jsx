// P147: 미션 맵 "부대(squads)" 모양(기본). 옛 지도(Mission.jsx ClassicMap)와 같은 덮개·자료(mission.graph, lib/mission-model.js)를 쓰고 모양만 다르다.
// - 위 "기다리는 일" 줄: 응답 필요·오류(묻는 글·오류 글)를 먼저 큰 카드로, 그다음 작업 완료. 없으면 "기다리는 일 없음 · 작업 중 n" 한 줄.
// - 아래 지도는 신문처럼 세로 기둥 여럿(lib/mission-roster.js). 폴더는 테두리 틀, 그 안 워크스페이스 판, 판 안에 팀마다 한 장의 부대 카드:
//   머리 = 리드(팀 번호, 이름, 역할·지금 하는 일, 모델·노력·시간·브랜치, 팀 구성 막대), 아래 = 하위 세션 줄(깊이마다 들여쓰기, 나무 선의 모양이 관계 종류:
//   실선 띄움, 긴 점선 역할 연결, 점선 시킴; 다른 워크스페이스는 ↗ 칩). 혼자인 세션은 판 아래 줄, 쉬는 것이 많으면 알약 묶음.
// - 나무 밖 연결은 줄의 칩(→ 이름, ← 이름)과, 세션을 가리키거나 키보드로 고를 때만 그리는 곡선. 가리키면 그 세션·조상·팀·이은 세션만 또렷(focusOf).
// - 거르기는 흐리게만(자리 그대로). ↑↓(또는 j/k)로 줄을 옮기고 Enter로 그 노드에 간다. 빈 곳 누르기·Esc는 닫기(옛 지도와 같다).
// - 움직임: 일하는 줄의 상태 동그라미 둘레에 고리가 퍼진다(transform·opacity만, steps). 판 설정 workLight와 움직임 줄이기를 따르고(P107과 같은 조건), 끄면 멈춘 고리.
//   덮개를 연 동안 뒤 판 노드 둘레가 멈추는 것(P107 data-mm-open)은 store.setMissionOpen이 그대로 한다.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, getState, setMissionOpen, toast, wsName } from './store.js';
import { rosterLayout, dockOf, linkPath } from './lib/mission-roster.js';
import { roleModel, focusOf, filterMatch, FILTERS, missionSummary, ancestors, nodeTier } from './lib/mission-model.js';
import { MISSION_STYLES } from './lib/mission-style.js';
import { useT, errText } from './lib/i18n.js';
import { facts, Avatar } from './Mission.jsx';

const SOLID = '[data-role^="sq-"], button, input, select, a';
const clip = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const TIER_ORDER = ['turn', 'alert', 'work', 'review', 'rest', 'sleep', 'done'];

// 머리의 모양 단추(부대 / 옛 지도). 판 설정 missionStyle에 저장한다(PC 창·웹이 같은 판 설정을 따른다)
export function MissionStyleSwitch({ value, onPick }) {
  const t = useT();
  const pick = async (v) => {
    if (v === value) return;
    onPick(v);
    try { await api.call('settings.set', { key: 'missionStyle', value: v }); } catch (e) { onPick(null); toast(t('settings.saveFailed', { error: errText(e) }), 'error'); }
  };
  return (
    <span className="mt-sq-style" role="radiogroup" aria-label={t('mmSquad.styleTitle')} title={t('mmSquad.styleTitle')} data-role="sq-style">
      {MISSION_STYLES.map((v) => <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} data-style={v} onClick={() => pick(v)}>{t(`mmSquad.style_${v}`)}</button>)}
    </span>
  );
}

// 팀 구성 막대: 팀원 등급마다 한 칸(응답 필요·오류 → 일함 → 완료 → 쉼)
function TeamBar({ ids, tiers, t }) {
  const list = [...ids].sort((a, b) => TIER_ORDER.indexOf(tiers.get(a)) - TIER_ORDER.indexOf(tiers.get(b)));
  const n = (k) => list.filter((id) => tiers.get(id) === k).length;
  const title = t('mmSquad.teamBar', { n: list.length, work: n('work'), turn: n('turn') + n('alert') });
  return <span className="mt-sq-bar" data-role="sq-teambar" title={title} aria-label={title}>{list.slice(0, 24).map((id) => <i key={id} className={`b-${tiers.get(id)}`} />)}</span>;
}

export function SquadMap({ switcher = null }) {
  const t = useT();
  const open = useStore((st) => st.missionOpen);
  const sessions = useStore((st) => st.sessions);
  const links = useStore((st) => st.links);
  const thread = useStore((st) => st.thread);
  const loops = useStore((st) => st.loops);
  const workspaces = useStore((st) => st.workspaces);
  const vgroups = useStore((st) => st.groups);
  const [graph, setGraph] = useState(null);
  const [filter, setFilter] = useState('all');
  const [shut, setShut] = useState(() => new Set());
  const [hot, setHot] = useState(null);
  const [width, setWidth] = useState(1300);
  const bodyRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const timer = setTimeout(() => api.call('mission.graph').then((g) => alive && setGraph(g)).catch((e) => toast(t('mission.fail', { error: errText(e) }), 'error')), graph ? 300 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [open, sessions, links, thread, loops]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open) setHot(null); }, [open]);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!open || !el) return undefined;
    const read = () => { const w = Math.max(420, Math.floor(el.clientWidth / 20) * 20); setWidth((v) => (v === w ? v : w)); };
    read();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', read);
    return () => { if (ro) ro.disconnect(); else window.removeEventListener('resize', read); };
  }, [open, !!graph]); // eslint-disable-line react-hooks/exhaustive-deps

  const order = useMemo(() => (workspaces || []).map((w) => w.key), [workspaces]);
  const liveOf = (n) => (n && n.sessionId ? sessions.get(n.sessionId) : null);
  const tiers = useMemo(() => {
    const out = new Map();
    if (graph) for (const n of graph.nodes) if (n.kind === 'session') { const live = n.sessionId ? sessions.get(n.sessionId) : null; out.set(n.id, nodeTierOf(n, live)); }
    return out;
  }, [graph, sessions]);
  const lay = useMemo(() => (graph ? rosterLayout(graph, { collapsed: [...shut], order, vgroups, tiers, width }) : null), [graph, shut, order, vgroups, tiers, width]);
  const roles = useMemo(() => (graph && lay ? roleModel(graph, { tiers, tree: lay.tree }) : new Map()), [graph, lay, tiers]);
  const focus = useMemo(() => (lay && hot ? focusOf(lay.tree, hot) : null), [lay, hot]);
  const sum = useMemo(() => missionSummary(lay ? lay.order : [], (id) => tiers.get(id)), [lay, tiers]);
  const human = useMemo(() => humanOf(graph, lay), [graph, lay]);

  // 키보드: ↑↓(j/k)로 읽는 차례를 옮기고(그 줄에 초점), Enter·Space는 줄의 단추가 받는다
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setMissionOpen(false); return; }
      if (!lay || e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const step = e.key === 'ArrowDown' || e.key === 'j' ? 1 : e.key === 'ArrowUp' || e.key === 'k' ? -1 : e.key === 'Home' ? -1e9 : e.key === 'End' ? 1e9 : 0;
      if (!step || !lay.order.length) return;
      e.preventDefault();
      const i = lay.order.indexOf(hot);
      const j = Math.max(0, Math.min(lay.order.length - 1, i < 0 ? (step > 0 ? 0 : lay.order.length - 1) : i + step));
      const id = lay.order[j];
      setHot(id);
      const el = document.querySelector(`[data-role="mission"] [data-sq-id="${CSS.escape(id)}"]`);
      if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, lay, hot]);

  if (!open) return null;
  const now = Date.now();
  const go = (n) => {
    setMissionOpen(false);
    const st = getState();
    if (n && n.kind === 'session') setTimeout(() => st.navigateTo && st.navigateTo(n.sessionId), 30);
  };
  const onBackdrop = (e) => {
    if (e.button !== 0 || e.target.closest(SOLID)) return;
    const sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed && String(sel).trim()) return;
    setMissionOpen(false);
  };
  const toggle = (key) => setShut((cur) => { const n = new Set(cur); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const nodeOf = (id) => lay && lay.tree.byId.get(id);
  const nameOf = (id) => { const n = nodeOf(id); return n ? n.name : id; };
  const factsOf = (id) => { const n = nodeOf(id); return facts(n, liveOf(n), roles.get(id), tiers.get(id), t, now); };
  const fdim = (id) => filter !== 'all' && !filterMatch(tiers.get(id), filter);
  const recede = (id) => !!focus && !focus.nodes.has(id);
  const hotProps = (id) => ({ onMouseEnter: () => setHot(id), onMouseLeave: () => setHot((h) => (h === id ? null : h)), onFocus: () => setHot(id), onBlur: () => setHot((h) => (h === id ? null : h)) });
  const counts = sum.counts;
  const catN = { all: counts.all, needs_you: counts.turn, working: counts.work, idle: counts.idle, done: counts.review, exited: counts.gone };
  const relName = (rel) => t(`mmRole.${{ spawn: 'relSpawn', role: 'relRole', prompt: 'relPrompt' }[rel] || 'relRole'}`);
  // 나무 밖 연결의 칩: 줄마다 보내는 쪽(→)과 받는 쪽(←)
  const linkChips = (id) => {
    if (!lay) return [];
    const out = [];
    for (const l of lay.links) {
      if (l.from === id) out.push({ l, dir: 'to', other: l.to });
      else if (l.to === id) out.push({ l, dir: 'from', other: l.from });
    }
    return out;
  };
  const tipOf = (id, f) => {
    const n = nodeOf(id), h = human.get(id);
    const parent = lay.tree.parent.get(id), via = lay.tree.via.get(id);
    const chain = ancestors(lay.tree, id).reverse().map(nameOf).join(' › ');
    const fromYou = h ? `${t('mmRole.relHuman')}${h.text ? `: “${clip(h.text, 80)}”` : ''}${h.count > 1 ? ` ×${h.count}` : ''}` : null;
    return [`@${n.name} · ${f.role}`, chain ? `${chain} › ${n.name}` : null, parent && via ? `${relName(lay.guides.find((g) => g.to === id)?.rel || 'spawn')}${via.role ? ` · ${via.role}` : ''}` : null,
      f.team, fromYou, f.ask ? `${t('mmap.ask')} ${f.ask}` : null, n.lastPrompt ? `${t('mmap.prompt')} ${n.lastPrompt}` : null,
      (n.workspaceKey || '') ? `${t('mmSquad.inWs', { ws: wsName(n.workspaceKey) })}` : null, f.meta || null, f.launched, t('mission.goSession')].filter(Boolean).join('\n');
  };

  // 한 줄(하위 세션·혼자인 세션) 또는 부대 머리(리드)
  const renderRow = (r) => {
    const id = r.id, n = nodeOf(id), tier = tiers.get(id), m = roles.get(id), f = factsOf(id);
    const head = r.kind === 'head';
    const chips = linkChips(id);
    const cross = r.cross;
    const text = f.line.k === 'team' ? (f.doing || f.line.text) : f.line.text;
    const cls = `mt-sq-row k-${r.kind} t-${tier}${f.shell ? ' shell' : ''}${hot === id ? ' hot' : ''}${recede(id) ? ' recede' : ''}${fdim(id) ? ' fdim' : ''}`;
    return (
      <div key={id} className={cls} style={{ left: r.x, top: r.y, width: r.w, height: r.h }} data-role="sq-row" data-sq-id={id} data-id={id} data-name={n.name} data-tier={tier} data-kind={r.kind} data-depth={r.depth}
        tabIndex={0} title={tipOf(id, f)} onClick={() => go(n)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(n); } }} {...hotProps(id)}>
        <span className="mt-sq-dot">{tier === 'work' && <i className="mt-sq-pulse" aria-hidden="true" />}<Avatar kind={f.kind} tier={tier} shell={f.shell} small /></span>
        <span className="mt-sq-main">
          <span className="mt-sq-l1">
            {head && lay.teamNo.get(id) ? <span className="mt-sq-no" data-role="sq-team-no">{lay.teamNo.get(id)}</span> : null}
            <b className="mt-sq-name">{n.name}</b>
            {m && m.rank !== 'solo' && <span className={`mt-sq-role f-${m.family}`} data-role="sq-role">{f.role}</span>}
            {cross && <span className="mt-sq-chip cross" data-role="sq-cross" title={t('mmRole.relCrossTitle')}>↗ {wsName(n.workspaceKey)}</span>}
            {!head && <span className={`mt-sq-text k-${f.line.k}`} data-role={f.line.k === 'ask' ? 'sq-ask' : 'sq-line'}>{text}</span>}
            {chips.slice(0, 2).map(({ l, dir, other }) => <span key={`${l.id}:${dir}`} className={`mt-sq-chip rel-${l.rel}`} data-role="sq-link-chip" data-dir={dir} title={`${relName(l.rel)}${l.cross ? ` · ${t('mmRole.relCross')}` : ''}${l.text ? `\n“${clip(l.text, 80)}”` : ''}`}>{dir === 'to' ? '→' : '←'} {nameOf(other)}</span>)}
            {chips.length > 2 && <span className="mt-sq-chip">+{chips.length - 2}</span>}
            <span className="mt-sq-meta" data-role="sq-meta">{f.meta || (f.shell ? t('mmMap.noModel') : '')}</span>
          </span>
          {head && (
            <span className="mt-sq-l2">
              <span className={`mt-sq-text k-${f.line.k}`} data-role={f.line.k === 'ask' ? 'sq-ask' : 'sq-line'}>{f.line.k === 'team' ? [f.doing, f.line.text].filter(Boolean).join(' · ') : text}</span>
              {f.warn && f.line.k !== 'ask' && f.line.k !== 'err' ? <span className="mt-sq-warn" data-role="sq-warn">{f.warn}</span> : null}
              <TeamBar ids={descOf(lay.tree, id)} tiers={tiers} t={t} />
            </span>
          )}
        </span>
      </div>
    );
  };
  // 접은 알약 묶음(쉬는 세션들)
  const renderFold = (r) => (
    <div key={r.id} className={`mt-sq-fold${focus && !r.ids.some((x) => focus.nodes.has(x)) ? ' recede' : ''}`} style={{ left: r.x, top: r.y, width: r.w, height: r.h }} data-role="sq-fold" data-n={r.ids.length}>
      {r.ids.map((id) => {
        const n = nodeOf(id), tier = tiers.get(id), f = factsOf(id);
        return (
          <button key={id} type="button" className={`mt-sq-pill t-${tier}${hot === id ? ' hot' : ''}${recede(id) ? ' recede' : ''}${fdim(id) ? ' fdim' : ''}`} data-role="sq-row" data-kind="pill" data-sq-id={id} data-id={id} data-name={n.name} data-tier={tier}
            title={tipOf(id, f)} onClick={() => go(n)} {...hotProps(id)}>
            <Avatar kind={f.kind} tier={tier} shell={f.shell} small /><span className="nm">{n.name}</span>
          </button>
        );
      })}
    </div>
  );

  const dock = lay ? dockOf(lay.order, (id) => tiers.get(id)) : [];
  const DOCK_MAX = 12;
  const pathOf = (id) => { const n = nodeOf(id); const fd = lay.folders.find((x) => lay.blocks.some((b) => b.folder === x.id && b.key === (n.workspaceKey || ''))); return [fd ? fd.name : null, wsName(n.workspaceKey || '') || null, ...ancestors(lay.tree, id).reverse().map(nameOf)].filter(Boolean).join(' › '); };
  const hotLinks = lay && focus ? lay.links.filter((l) => focus.pairs.has(l.id)) : [];
  const guideHot = (g) => !!focus && focus.nodes.has(g.from) && (g.to ? focus.nodes.has(g.to) : g.ids.some((x) => focus.nodes.has(x)));
  return (
    <div className="mt-mission mt-sq" data-role="mission" data-style="squads" onClick={onBackdrop}>
      <div className="mt-mission-head">
        <b className="mt-mission-title">{t('mission.title')}</b>
        <span className="mt-mission-filters" role="tablist">
          {FILTERS.map((k) => <button key={k} role="tab" aria-selected={filter === k} className={`mt-mm-filter c-${k}${filter === k ? ' on' : ''}`} data-filter={k} data-n={catN[k] || 0} onClick={() => setFilter(k)}>{t(`mission.cat.${k}`)}<span className="mt-mm-fn">{catN[k] ?? 0}</span></button>)}
        </span>
        <span className="mt-node-sp" />
        <span className="mt-sq-legend" data-role="sq-legend" aria-hidden="true">
          <span><svg width="22" height="8"><path className="rel-spawn" d="M1 4H21" /></svg>{t('mmRole.relSpawn')}</span>
          <span><svg width="22" height="8"><path className="rel-role" d="M1 4H21" /></svg>{t('mmRole.relRole')}</span>
          <span><svg width="22" height="8"><path className="rel-prompt" d="M1 4H21" /></svg>{t('mmRole.relPrompt')}</span>
          <span><b className="mt-sq-chip cross">↗</b>{t('mmRole.relCross')}</span>
        </span>
        {switcher}
        <button className="mt-x" data-action="mission-close" title={t('mission.closeTitle')} onClick={() => setMissionOpen(false)}>×</button>
      </div>
      {lay && (
        <div className={`mt-sq-dock${dock.length ? '' : ' calm'}`} data-role="sq-dock" aria-label={t('mmSquad.dockTitle')}>
          <span className="mt-sq-dockh">{t('mmSquad.dockTitle')}{dock.length ? <i>{dock.length}</i> : null}</span>
          {dock.length === 0 ? <span className="mt-sq-calm" data-role="sq-dock-none">{t('mmSquad.dockNone')}{counts.work ? ` · ${t('mmFoot.work', { n: counts.work })}` : ''}</span> : (
            <div className="mt-sq-dockl">
              {dock.slice(0, DOCK_MAX).map((id) => {
                const n = nodeOf(id), tier = tiers.get(id), f = factsOf(id);
                const msg = tier === 'turn' ? (f.ask || f.stateText) : tier === 'alert' ? f.line.text : (f.doing || n.lastPrompt || f.stateText);
                return (
                  <button key={id} type="button" className={`mt-sq-card t-${tier}${hot === id ? ' hot' : ''}${fdim(id) ? ' fdim' : ''}`} data-role="sq-dock-item" data-sq-dock={id} data-name={n.name} data-tier={tier} title={tipOf(id, f)} onClick={() => go(n)} {...hotProps(id)}>
                    <span className="k">{tier === 'turn' ? t('mmMap.warnTurn') : tier === 'alert' ? t('mmMap.warnAlert') : t('mmSquad.dockDone')}{f.meta ? <span className="mt-sq-meta">{f.meta}</span> : null}</span>
                    <span className="p">{pathOf(id)}</span>
                    <b className="nm"><Avatar kind={f.kind} tier={tier} shell={f.shell} small />{n.name}</b>
                    <span className="q" data-role={tier === 'turn' ? 'sq-dock-ask' : 'sq-dock-text'}>{tier === 'turn' ? `“${clip(msg, 140)}”` : clip(msg, 140)}</span>
                  </button>
                );
              })}
              {dock.length > DOCK_MAX ? <span className="mt-sq-more">{t('mmMap.restHidden', { n: dock.length - DOCK_MAX })}</span> : null}
            </div>
          )}
        </div>
      )}
      <div className={`mt-mission-body mt-sq-body nowheel${focus ? ' focusing' : ''}`} ref={bodyRef}>
        {!lay ? <div className="dim" style={{ padding: 20 }}>{t('common.loading')}</div> : (
          <div className="mt-sq-canvas" style={{ width: lay.width, height: lay.height }}>
            {lay.folders.map((f, i) => (
              <div key={`f:${f.id}:${i}`} className={`mt-sq-folder${f.cont ? ' cont' : ''}`} data-role="sq-folder" data-id={f.id} style={{ left: f.x, top: f.y, width: f.w, height: f.h }} title={t('mmFolder.folderTitle', { name: f.name, n: f.count })}>
                <span className="mt-sq-fhead"><span className="ic" aria-hidden="true">▤</span><span className="nm" data-role="sq-folder-name">{f.name}</span>{f.cont ? <span className="cont">{t('mmSquad.cont')}</span> : null}<span className="n">{f.count}</span>{f.needs > 0 && <span className="needs">!{f.needs}</span>}</span>
              </div>
            ))}
            {lay.blocks.map((b) => (
              <div key={`w:${b.key}`} className={`mt-sq-ws${b.collapsed ? ' shut' : ''}${b.folder ? ' inf' : ''}`} data-role="sq-ws" data-key={b.key} style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
                <button type="button" className="mt-sq-wsh" data-role="sq-ws-head" aria-expanded={!b.collapsed} title={t('mmapGroup.toggleTitle')} onClick={(ev) => { ev.stopPropagation(); toggle(b.key); }}>
                  <span className="caret" aria-hidden="true">{b.collapsed ? '▸' : '▾'}</span><span className="nm" data-role="sq-ws-name">{b.key ? wsName(b.key) : t('mmapGroup.noWorkspace')}</span><span className="n">{b.count}</span>{b.needs > 0 && <span className="needs" title={t('mmapGroup.needs', { n: b.needs })}>!{b.needs}</span>}
                </button>
              </div>
            ))}
            {lay.squads.map((s) => <div key={`s:${s.root}`} className={`mt-sq-squad${recede(s.root) && !(focus && descOf(lay.tree, s.root).some((x) => focus.nodes.has(x))) ? ' recede' : ''}`} data-role="sq-squad" data-root={s.root} style={{ left: s.x, top: s.y, width: s.w, height: s.h }} />)}
            <svg className="mt-sq-svg" width={lay.width} height={lay.height} aria-hidden="true">
              {lay.guides.map((g) => <path key={g.id} className={`mt-sq-guide rel-${g.rel}${g.cross ? ' cross' : ''}${guideHot(g) ? ' hot' : focus ? ' recede' : ''}`} data-role="sq-guide" data-rel={g.rel} data-from={g.from} data-to={g.to || undefined} d={g.d} />)}
              {hotLinks.map((l) => { const d = linkPath(lay.byId.get(l.from), lay.byId.get(l.to)); return d ? <path key={l.id} className={`mt-sq-link rel-${l.rel}`} data-role="sq-link" data-from={l.from} data-to={l.to} d={d} markerEnd="url(#mt-sq-arrow)" /> : null; })}
              <defs><marker id="mt-sq-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" className="mt-sq-arrow" /></marker></defs>
            </svg>
            {lay.rows.map((r) => (r.kind === 'fold' ? renderFold(r) : renderRow(r)))}
            {lay.rows.length === 0 && <div className="dim mt-mm-empty">{t('mission.empty')}</div>}
          </div>
        )}
      </div>
      {lay && <div className="mt-sq-foot" data-role="sq-foot"><span>{[t('mmFoot.work', { n: counts.work }), t('mmFoot.sessions', { n: counts.all }), t('mmFoot.teams', { n: lay.teamNo.size })].join(' · ')}</span><span className="mt-mm-hint">{t('mmSquad.hint')}</span></div>}
    </div>
  );
}

// 등급(옛 지도와 같은 규칙: lib/mission-model.js nodeTier)
function nodeTierOf(n, live) { return nodeTier(n, live); }
const descOf = (tree, id) => { const out = []; const walk = (x, i) => { if (i > 1000) return; for (const c of tree.kids.get(x) || []) { out.push(c.id); walk(c.id, i + 1); } }; walk(id, 0); return out; };
// 사람(명령 입력줄·반복 작업)이 보낸 지시: 받는 세션 id → { count, text }(옛 지도 lay.human과 같다, 풍선 도움말 한 줄)
function humanOf(graph, lay) {
  const out = new Map();
  if (!graph || !lay) return out;
  const hid = (graph.nodes.find((n) => n.kind === 'human') || {}).id;
  if (!hid) return out;
  for (const e of graph.edges || []) {
    if (e.from !== hid || !lay.tree.byId.has(e.to)) continue;
    const p = out.get(e.to) || { count: 0, text: null, lastAt: 0 };
    p.count += e.count || 0;
    if (e.label && (e.lastAt || 0) >= p.lastAt) { p.text = e.label; p.lastAt = e.lastAt || 0; }
    out.set(e.to, p);
  }
  return out;
}
