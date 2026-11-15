// P152: 미션 맵 A "Territories"(ARCH 4절 I6). 사용자가 고른 시안 A를 실제 데이터로 그린 무한 캔버스 덮개. 옛 열 지도(Mission.jsx ClassicMission)는 숨은 설정 missionStyle: classic으로만 고른다.
// - 배치와 셈은 lib/mission-terr.js(순수 함수): 폴더 = 색 점선 영토, 워크스페이스 = 섬(이름과 상태 수 칩), 팀 = 섬 안 점선 무리(리드 위 → 하위 아래), 혼자인 세션 = 무리 오른쪽 기둥,
//   폴더 밖 워크스페이스 = 영토 없는 점선 섬. 역할·관계·요약은 lib/mission-model.js(지금 모델 P137).
// - 무한 캔버스: 끌어 시점 이동, 휠(마우스 자리 중심)·두 손가락 확대·축소, 줌 단추·맞춤·멀리/보통/가까이, 키(+ − 0, 화살표로 이동). 미니맵을 누르면 그 자리로.
//   빈 곳을 눌러도 닫히지 않는다(고름만 푼다). 닫기는 닫기 단추·Esc·M(main.jsx). 조금(5px) 움직이면 끌기라 카드 고르기와 갈린다.
//   열 때마다 맞춤으로 시작한다(지난 시점은 기억하지 않는다: 판이 바뀌어 섬 자리가 옮겨 갔을 수 있다). 연 동안 판이 바뀌면 다시 읽고 시점은 그대로.
// - 성능: 보기는 ref에 두고 세계 한 요소의 transform만 바꾼다(움직이는 동안 React가 다시 그리지 않는다). 확대 단계(lv-far·lv-mid·lv-near)·배율 글·미니맵 틀도 DOM에 바로 쓴다.
//   카드는 멀리 타일과 보통 사실을 둘 다 그려 두고 단계 클래스로만 갈아 끼운다. 움직이는 동안만 will-change(멈추면 떼어 글을 또렷하게 다시 그린다).
// - 진행 중 테두리 빛: P107 빛 층(MissionLight .mt-mm-light, lib/work-light.js, 판 설정 workLight와 움직임 줄이기 규칙)을 그대로 쓰고 크기만 카드에 맞춘다(styles.css P152 덩어리).
//   끌거나 확대하는 동안에도 돈다(작업 기록에 잰 값).
// - 카드를 누르면 고르고 아래 가운데 살펴보기 띠(경로·역할·하네스·모델·상태·시간·지금/마지막 일, "Open on board", "Message"). 두 번 누르거나 Enter는 보드에서 연다.
//   카드에 초점이 있으면 ↑↓가 카드 차례로 다니며 그 카드로 간다. 위 떠 있는 줄의 "나를 기다리는 것" 단추(응답 필요·오류)는 그 카드로 날아가 고른다.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, getState, setMissionOpen, toast, wsName } from './store.js';
import { territoryLayout, TERR, ZOOM, LEVEL_K, levelOf, zoomAt, wheelK, panBy, fitView, centerOn, miniMap, miniToWorld, pressIntent, viewKey, stepCard, DRAG_SLOP } from './lib/mission-terr.js';
import { roleModel, nodeTier, roleText, modelText, ageText } from './lib/mission-model.js';
import { kindOf } from './lib/kinds.js';
import { STATE_LABEL } from './lib/labels.js';
import { useT, errText } from './lib/i18n.js';
import { MissionLight } from './Mission.jsx';
import { commandDraft } from './Thread.jsx';

const TOP = 96; // 위 떠 있는 줄 아래부터 맞춘다
const BOTTOM = 24;
const MW = 236, MH = 150; // 미니맵 크기
const ATTN_MAX = 4;
const clip = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const branchOfLive = (live) => (live && live.git && live.git.isWorktree && live.git.branch) || null;
// 상태 색 클래스(시안 st-*): 등급 → 색
const ST = { turn: 'needs', alert: 'error', work: 'working', review: 'done', rest: 'ready', sleep: 'sleeping', done: 'exited' };
const IDLE = new Set(['rest', 'sleep', 'done']);

// 카드 사실(보통 단계 네 줄과 가까이 한 줄, 살펴보기 띠, 풍선 도움말이 같이 쓴다)
export function cardFacts(n, live, m, tier, t, now, { parentName = null, parentWs = null, cross = false, kids = 0 } = {}) {
  const kind = (live && (live.flavor || live.kind)) || n.agentKind || 'claude';
  const k = kindOf(kind);
  const shell = k.id === 'shell';
  const state = live ? live.state : n.state;
  const cmd = live && live.shell && live.shell.atPrompt === false ? live.shell.command || (live.shell.procs || []).join(', ') : null;
  const stateText = tier === 'review' ? t('doneMark.tag') : shell && state !== 'exited' && state !== 'sleeping' ? (cmd ? STATE_LABEL.shell_running : STATE_LABEL.shell_idle) : STATE_LABEL[state] || state || '';
  const turnAt = n.turnAt || (live && live.state === 'working' && live.turn && live.turn.startedAt) || null;
  const activeAt = n.activeAt || (live && live.lastActivityAt) || null;
  const age = tier === 'work' && turnAt ? ageText(now - turnAt, t) : activeAt ? ageText(now - activeAt, t) : null;
  const model = shell ? null : live && live.model ? modelText(live.model, live.effort) : modelText(n.model, n.effort);
  const role = m ? roleText(m, t, { short: true }) : ''; // "· 하위 리드"는 빼고(가까이 단계 관계 줄이 "세션 n개를 이끎"을 말한다) 둘째 줄이 한 줄에 들게
  const lp = n.lastPrompt || (live && live.lastPrompt) || null;
  const ask = n.ask || (live && live.ask && (live.ask.summary || live.ask.kind)) || null;
  const err = live && live.error ? (live.error.message || String(live.error)) : n.error || null;
  let taskKind, task;
  if (tier === 'work') { taskKind = 'now'; task = cmd ? `$ ${cmd}` : lp; }
  else if (tier === 'turn') { taskKind = 'ask'; task = ask || lp; }
  else if (tier === 'alert') { taskKind = 'fail'; task = lp || ask; }
  else if (tier === 'review') { taskKind = 'did'; task = lp; }
  else { taskKind = 'last'; task = lp; }
  const rel = parentName ? t(`mmTerr.rel.${['spawn', 'role', 'prompt'].includes(n._rel) ? n._rel : 'spawn'}`, { name: parentName }) : kids ? t('mmTerr.leads', { n: kids }) : t('mmTerr.rel.none');
  const relText = cross && parentWs ? t('mmTerr.rel.inWs', { text: rel, ws: parentWs }) : rel;
  const branch = n.gitBranch || branchOfLive(live);
  const more = [relText, branch ? `⎇ ${branch}` : null, n.loops ? `⟳${n.loops}` : null].filter(Boolean).join(' · ');
  return { kind, k, shell, state, stateText, age, model, role, taskKind, task: task ? clip(task, 200) : null, err: tier === 'alert' && err ? clip(err, 200) : null, more, harness: k.label };
}

// 카드 하나. 멀리 타일(이름·상태 큰 글)과 보통 사실을 둘 다 그리고 단계 클래스(.lv-far 등)로 갈아 끼운다
const Card = memo(function Card({ id, b, f, tier, sel, onPick, onOpen, t }) {
  const n = b.node;
  const st = ST[tier] || 'ready';
  const cls = `mt-ta-slot st-${st}${f.shell ? ' shell' : ''}${IDLE.has(tier) ? ' idle' : ''}${b.lead ? ' lead' : ''}${sel ? ' sel' : ''}`;
  const tip = [`@${n.name}${f.role ? ` · ${f.role}` : ''}`, `${f.stateText}${f.age ? ` · ${f.age}` : ''}`, [f.harness, f.model].filter(Boolean).join(' · '), f.task ? `${t(`mmTerr.kind.${f.taskKind}`)}: ${f.task}` : null, f.err, f.more, t('mmTerr.cardTip')].filter(Boolean).join('\n');
  return (
    <div className={cls} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} data-role="ta-slot" data-id={id} data-tier={tier}>
      <div className="mt-ta-card" role="button" tabIndex={0} data-role="mm-node" data-kind="session" data-id={id} data-name={n.name} data-tier={tier} title={tip} aria-label={tip.replace(/\n/g, ', ')}
        onClick={(e) => onPick(id, e)} onDoubleClick={() => onOpen(id)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(id); } else if (e.key === ' ') { e.preventDefault(); onPick(id, e); } }}>
        {tier === 'work' && <MissionLight role="ta-light" />}
        <span className="mt-ta-tile" aria-hidden="true"><span className="tn">{n.name}</span><span className="ts"><i />{f.stateText}</span></span>
        <span className="mt-ta-full">
          <span className="c1"><span className="cname" data-role="ta-name">{n.name}</span><span className="cst" data-role="ta-state"><i />{f.stateText}{f.age ? <span className="cago"> · {f.age}</span> : null}</span></span>
          <span className="c2" data-role="ta-meta">{f.role ? <span className="crole">{f.role}</span> : null}{f.role ? <span className="dotsep">·</span> : null}<span className="hb">{f.k.mark}</span><span>{f.harness}</span>{f.model ? <><span className="dotsep">·</span><span>{f.model}</span></> : null}</span>
          <span className="c3" data-role="ta-task">{f.task ? <b>{t(`mmTerr.kind.${f.taskKind}`)}</b> : null}{f.task || t('mmMap3.noTask')}</span>
          {f.err ? <span className="cerr" data-role="ta-err">{f.err}</span> : null}
          <span className="c4" data-role="ta-more">{f.more}</span>
        </span>
      </div>
    </div>
  );
});

const FolderIcon = () => <svg className="mt-ta-iico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /></svg>;
const XIcon = ({ s = 20 }) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" className="mt-ta-x"><path d="M6 6l12 12M18 6L6 18" /></svg>;

export function TerritoryMap() {
  const t = useT();
  const open = useStore((st) => st.missionOpen);
  const sessions = useStore((st) => st.sessions);
  const links = useStore((st) => st.links);
  const thread = useStore((st) => st.thread);
  const loops = useStore((st) => st.loops);
  const workspaces = useStore((st) => st.workspaces);
  const vgroups = useStore((st) => st.groups);
  const [graph, setGraph] = useState(null);
  const [sel, setSel] = useState(null);
  const [vsize, setVsize] = useState(null); // 보기 칸 크기 { w, h }
  const rootRef = useRef(null), vpRef = useRef(null), worldRef = useRef(null), pctRef = useRef(null), frameRef = useRef(null);
  const view = useRef(null); // { k, x, y }
  const fitted = useRef(false);
  const moveTimer = useRef(0), glideTimer = useRef(0);
  const justDragged = useRef(false);
  const layRef = useRef(null), sizeRef = useRef(null);

  useEffect(() => {
    if (!open) { setGraph(null); setSel(null); fitted.current = false; view.current = null; return undefined; }
    let alive = true;
    const timer = setTimeout(() => api.call('mission.graph').then((g) => alive && setGraph(g)).catch((e) => toast(t('mission.fail', { error: errText(e) }), 'error')), graph ? 300 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [open, sessions, links, thread, loops]); // eslint-disable-line react-hooks/exhaustive-deps

  const order = useMemo(() => (workspaces || []).map((w) => w.key), [workspaces]);
  const liveOf = (n) => (n && n.sessionId ? sessions.get(n.sessionId) : null);
  const tiers = useMemo(() => new Map(graph ? graph.nodes.filter((n) => n.kind === 'session').map((n) => [n.id, nodeTier(n, liveOf(n))]) : []), [graph, sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const names = useMemo(() => new Map((workspaces || []).map((w) => [w.key, wsName(w.key)])), [workspaces]);
  const lay = useMemo(() => (graph ? territoryLayout(graph, { order, vgroups, tiers, names }) : null), [graph, order, vgroups, tiers, names]);
  const roles = useMemo(() => (graph && lay ? roleModel(graph, { tiers, tree: lay.tree }) : new Map()), [graph, lay, tiers]);
  layRef.current = lay;
  sizeRef.current = vsize;
  const now = Date.now();
  const leads = useMemo(() => new Set(lay ? lay.rings.map((r) => r.lead) : []), [lay]);
  const relOfChild = useMemo(() => { const m = new Map(); if (lay) for (const e of lay.edges) if (e.tree) m.set(e.to, e.rel); return m; }, [lay]);
  const factsOf = useCallback((id) => {
    const b = lay.cards.get(id), n = b.node, m = roles.get(id);
    const pid = m && m.parentId, p = pid ? lay.tree.byId.get(pid) : null;
    const pws = p ? p.workspaceKey || '' : null;
    return cardFacts({ ...n, _rel: relOfChild.get(id) }, liveOf(n), m, tiers.get(id), t, now, { parentName: p ? p.name : null, parentWs: p ? (pws ? wsName(pws) : t('mmapGroup.noWorkspace')) : null, cross: !!p && pws !== (n.workspaceKey || ''), kids: (lay.tree.kids.get(id) || []).length });
  }, [lay, roles, tiers, sessions, t, relOfChild]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 보기 쓰기(DOM에 바로) ----
  const paint = useCallback((v, { glide = false } = {}) => {
    view.current = v;
    const w = worldRef.current, vp = vpRef.current, root = rootRef.current;
    if (w) {
      if (glide) { w.classList.add('glide'); clearTimeout(glideTimer.current); glideTimer.current = setTimeout(() => w.classList.remove('glide'), 480); } else w.classList.remove('glide');
      w.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
      const lv = levelOf(v.k);
      if (!w.classList.contains(`lv-${lv}`)) { w.classList.remove('lv-far', 'lv-mid', 'lv-near'); w.classList.add(`lv-${lv}`); }
      // 단계 단추도 DOM에 바로(다시 그리지 않는다)
      if (root && root.dataset.level !== lv) root.dataset.level = lv;
      if (root) for (const btn of root.querySelectorAll('[data-level]')) { const on = btn.dataset.level === lv; btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    }
    if (vp) { const gs = Math.max(8, 32 * v.k); vp.style.backgroundSize = `${gs}px ${gs}px`; vp.style.backgroundPosition = `${v.x % gs}px ${v.y % gs}px`; }
    if (pctRef.current) pctRef.current.textContent = `${Math.round(v.k * 100)}%`;
    const L = layRef.current, s = sizeRef.current;
    if (frameRef.current && L && s) { const f = miniMap(L.bounds, v, s.w, s.h, MW, MH).frame; Object.assign(frameRef.current.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` }); }
    // 움직이는 동안만 will-change(멈추면 떼어 또렷하게)
    if (root && !glide) { if (root.dataset.moving !== '1') root.dataset.moving = '1'; clearTimeout(moveTimer.current); moveTimer.current = setTimeout(() => { delete root.dataset.moving; }, 160); }
  }, []);
  const fit = useCallback((glide = true) => { const L = layRef.current, s = sizeRef.current; if (L && s) paint(fitView(L.bounds, s.w, s.h, { top: TOP, bottom: BOTTOM, pad: 48 }), { glide }); }, [paint]);
  const zoomCenter = useCallback((k2) => { const s = sizeRef.current, v = view.current; if (s && v) paint(zoomAt(v, s.w / 2, (s.h + TOP) / 2, k2), { glide: true }); }, [paint]);
  const flyTo = useCallback((id, k) => {
    const L = layRef.current, s = sizeRef.current, v = view.current, b = L && L.cards.get(id);
    if (!b || !s || !v) return;
    paint(centerOn(b.x + b.w / 2, b.y + b.h / 2, k || Math.max(1.05, v.k), s.w, s.h, { top: TOP, bottom: 120 }), { glide: true });
  }, [paint]);

  // 보기 칸 크기
  useLayoutEffect(() => {
    const el = vpRef.current;
    if (!open || !el) return undefined;
    const read = () => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setVsize((v) => (v && v.w === Math.round(r.width) && v.h === Math.round(r.height) ? v : { w: Math.round(r.width), h: Math.round(r.height) })); };
    read();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', read);
    return () => { if (ro) ro.disconnect(); else window.removeEventListener('resize', read); };
  }, [open]);
  // 처음은 맞춤. 판이 바뀌거나 창 크기가 바뀌면 보기는 그대로(미니맵 틀만 다시)
  useLayoutEffect(() => {
    if (!open || !lay || !vsize) return;
    if (!fitted.current) { fitted.current = true; paint(fitView(lay.bounds, vsize.w, vsize.h, { top: TOP, bottom: BOTTOM, pad: 48 })); }
    else if (view.current) paint(view.current);
  }, [open, lay, vsize, paint]);

  // ---- 끌기·두 손가락·휠 ----
  useEffect(() => {
    const el = vpRef.current;
    if (!open || !el) return undefined;
    const pts = new Map(); // pointerId → { x, y }
    let g = null; // { mode: 'press'|'drag'|'pinch', ... }
    const local = (e) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const begin = () => {
      const v = view.current; if (!v) { g = null; return; }
      const p = [...pts.values()];
      if (p.length >= 2) g = { mode: 'pinch', v0: v, m0: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }, d0: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1 };
      else if (p.length === 1) g = { mode: g && g.mode !== 'press' ? 'drag' : 'press', v0: v, p0: p[0] };
      else g = null;
    };
    const down = (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('.mt-ta-hud')) return; // 떠 있는 판(단추·미니맵)은 끌지 않는다
      pts.set(e.pointerId, local(e));
      justDragged.current = false;
      begin();
    };
    const move = (e) => {
      if (!pts.has(e.pointerId) || !g) return;
      pts.set(e.pointerId, local(e));
      const p = [...pts.values()];
      if (g.mode === 'pinch' && p.length >= 2) {
        const m = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }, d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
        const z = zoomAt(g.v0, g.m0.x, g.m0.y, g.v0.k * (d / g.d0));
        justDragged.current = true;
        paint(panBy(z, m.x - g.m0.x, m.y - g.m0.y));
        return;
      }
      if (p.length !== 1 || !g.p0) return;
      const dx = p[0].x - g.p0.x, dy = p[0].y - g.p0.y;
      if (g.mode === 'press' && pressIntent({ dx, dy }) === 'drag') { g.mode = 'drag'; el.classList.add('dragging'); try { el.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 끌기는 된다 */ } }
      if (g.mode === 'drag') { justDragged.current = true; paint(panBy(g.v0, dx, dy)); }
    };
    const up = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (!pts.size) { g = null; el.classList.remove('dragging'); } else begin(); // 두 손가락에서 하나를 떼면 남은 손가락으로 이어 끈다
    };
    const wheel = (e) => {
      if (e.target.closest('.mt-ta-hud')) return;
      e.preventDefault();
      const v = view.current; if (!v) return;
      const p = local(e);
      paint(zoomAt(v, p.x, p.y, wheelK(v.k, e.deltaY, e.deltaMode)));
    };
    // 끈 뒤의 click은 고르기·풀기가 아니다
    const click = (e) => { if (justDragged.current) { e.stopPropagation(); e.preventDefault(); justDragged.current = false; } };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('click', click, true);
    return () => {
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel); el.removeEventListener('click', click, true);
    };
  }, [open, paint]);

  const go = useCallback((id) => {
    const L = layRef.current, b = L && L.cards.get(id);
    setMissionOpen(false);
    const st = getState();
    if (b && b.node.sessionId) setTimeout(() => st.navigateTo && st.navigateTo(b.node.sessionId), 30);
  }, []);
  const message = (id) => {
    const b = lay && lay.cards.get(id);
    if (!b) return;
    setMissionOpen(false);
    setTimeout(() => commandDraft.dispatchEvent(new CustomEvent('draft', { detail: `@${b.node.name} ` })), 30);
  };
  const pick = useCallback((id) => { setSel((cur) => (cur === id ? null : id)); }, []);

  // ---- 키: Esc 닫기, + − 0, 화살표 끌기, 카드에 초점이 있으면 ↑↓로 카드 다니기 ----
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setMissionOpen(false); return; }
      const tag = (e.target && e.target.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable) || e.ctrlKey || e.metaKey || e.altKey) return;
      const card = e.target && e.target.closest ? e.target.closest('.mt-ta-card') : null;
      const L = layRef.current;
      if (card && L && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const next = stepCard(L.order, card.dataset.id, e.key === 'ArrowDown' ? 1 : -1);
        const el = next && rootRef.current && rootRef.current.querySelector(`.mt-ta-card[data-id="${CSS.escape(next)}"]`);
        if (el) { el.focus({ preventScroll: true }); setSel(next); flyTo(next); }
        return;
      }
      const a = viewKey(e.key, { shift: e.shiftKey });
      if (!a) return;
      e.preventDefault();
      if (a.fit) fit();
      else if (a.zoom) zoomCenter(view.current.k * a.zoom);
      else if (a.pan && view.current) paint(panBy(view.current, a.pan[0], a.pan[1]), { glide: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, fit, zoomCenter, flyTo, paint]);
  window.__mtTa = { view: () => (view.current ? { ...view.current } : null), fit: () => fit(false), flyTo, lay: () => layRef.current, set: (v) => paint(v) }; // 시험이 읽는다

  if (!open) return null;
  const gName = (key) => (key ? wsName(key) : t('mmapGroup.noWorkspace'));
  const ids = lay ? lay.order : [];
  const attn = ids.filter((id) => tiers.get(id) === 'turn' || tiers.get(id) === 'alert').sort((a, b) => (tiers.get(a) === 'turn' ? 0 : 1) - (tiers.get(b) === 'turn' ? 0 : 1));
  const nWs = lay ? lay.isles.length : 0;
  const nFolders = lay ? lay.terrs.length : 0;
  const selB = sel && lay ? lay.cards.get(sel) : null;
  const selF = selB ? factsOf(sel) : null;
  const terrOf = (id) => (lay ? lay.terrs.find((x) => x.id === id) : null);
  const mm = lay ? miniMap(lay.bounds, { k: 1, x: 0, y: 0 }, 1, 1, MW, MH) : null; // 영토 윤곽과 점(보이는 틀은 paint가 DOM에 쓴다)
  const onMini = (e) => {
    if (!lay || !vsize || !view.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const w = miniToWorld(lay.bounds, MW, MH, e.clientX - r.left, e.clientY - r.top);
    paint(centerOn(w.x, w.y, view.current.k, vsize.w, vsize.h, { top: TOP }), { glide: true });
  };
  const onEmpty = (e) => { if (pressIntent({ onCard: !!e.target.closest('.mt-ta-card') }) === 'clear') setSel(null); }; // 빈 곳은 고름만 푼다(닫지 않는다)

  return (
    <div className="mt-mission mt-ta nowheel nopan" data-role="mission" data-style="territories" ref={rootRef}>
      <div className="mt-ta-vp" data-role="ta-viewport" ref={vpRef} onClick={onEmpty}>
        {!lay ? <div className="mt-ta-loading">{t('common.loading')}</div> : (
          <div className="mt-ta-world lv-far" data-role="ta-world" ref={worldRef}>
            {lay.terrs.map((x) => (
              <div key={`t:${x.id}`} className={`mt-ta-terr c${x.color}`} data-role="ta-terr" data-id={x.id} style={{ left: x.x, top: x.y, width: x.w, height: x.h }}>
                <div className="mt-ta-thead"><span className="mt-ta-tname" data-role="ta-terr-name">{x.name}</span><span className="mt-ta-tsub">{`${t('mmTerr.workspaces', { n: x.nWs })} · ${t('mmTerr.sessions', { n: x.sessions })}`}</span></div>
              </div>
            ))}
            {lay.isles.map((i) => (
              <div key={`i:${i.key || '-'}`} className={`mt-ta-isl${i.loose ? ' loose' : ''}`} data-role="ta-isle" data-key={i.key} style={{ left: i.x, top: i.y, width: i.w, height: i.h }}>
                <div className="mt-ta-ihead">
                  <FolderIcon /><span className="mt-ta-iname" data-role="ta-isle-name">{gName(i.key)}</span>
                  {i.loose && <span className="mt-ta-itag">{t('mmTerr.noFolder')}</span>}
                  <span className="mt-ta-ichips">{i.chips.map((c) => <span key={c.tier} className={`mt-ta-ichip st-${ST[c.tier]}`} data-tier={c.tier}><i /><b>{c.n}</b><span className="lb"> {t(`mmTerr.chip.${c.tier}`)}</span></span>)}</span>
                </div>
              </div>
            ))}
            {lay.rings.map((r) => (
              <div key={`r:${r.id}`} className="mt-ta-ring" data-role="ta-ring" data-lead={r.lead} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
                <div className="mt-ta-rlabel">{t('mmTerr.team')} <b>{lay.tree.byId.get(r.lead).name}</b> · {t('mmTerr.sessions', { n: r.n + r.away })}{r.away ? ` ${t('mmTerr.away', { n: r.away })}` : ''}</div>
              </div>
            ))}
            <svg className="mt-ta-edges" width={1} height={1} aria-hidden="true">
              {lay.edges.map((e) => <path key={e.id} className={`mt-ta-edge k-${e.cross ? 'cross' : e.rel}${e.link ? ' link' : ''}${e.active || tiers.get(e.to) === 'work' ? ' active' : ''}${sel && (e.from === sel || e.to === sel) ? ' hot' : ''}`} data-role="ta-edge" data-from={e.from} data-to={e.to} data-rel={e.rel} data-cross={e.cross ? '1' : undefined} d={e.d} />)}
            </svg>
            {lay.edges.filter((e) => e.label).map((e) => {
              const text = e.cross ? t('mmTerr.edgeCross', { from: lay.tree.byId.get(e.from).name, ws: gName(lay.tree.byId.get(e.to).workspaceKey || '') }) : e.rel === 'role' ? t('mmTerr.edgeRole', { role: e.role || t('mmRole.worker') }) : t('mmTerr.edgePrompt');
              return <span key={`l:${e.id}`} className={`mt-ta-elab k-${e.cross ? 'cross' : e.rel}`} data-role="ta-edge-label" style={{ left: e.label.x, top: e.label.y }}>{text}</span>;
            })}
            {ids.map((id) => { const b = lay.cards.get(id); return <Card key={id} id={id} b={{ ...b, lead: leads.has(id) }} f={factsOf(id)} tier={tiers.get(id)} sel={sel === id} onPick={pick} onOpen={go} t={t} />; })}
          </div>
        )}
        {lay && lay.cards.size === 0 && <div className="mt-ta-loading">{t('mission.empty')}</div>}
      </div>

      <div className="mt-ta-hud mt-ta-top" data-role="ta-top">
        <span className="mt-ta-title">{t('mission.title')}</span>
        {lay && <span className="mt-ta-sub" data-role="ta-summary">{t('mmTerr.summary', { folders: t('mmTerr.folders', { n: nFolders }), workspaces: t('mmTerr.workspaces', { n: nWs }), sessions: t('mmTerr.sessions', { n: lay.cards.size }) })}</span>}
        <span className="mt-ta-attn" data-role="ta-attn">
          {attn.slice(0, ATTN_MAX).map((id) => {
            const b = lay.cards.get(id), f = factsOf(id), tier = tiers.get(id);
            return <button key={id} type="button" className={`mt-ta-abtn st-${ST[tier]}`} data-role="ta-attn-item" data-id={id} title={t('mmTerr.waitingTitle')} onClick={() => { setSel(id); flyTo(id); }}><i /><b>{b.node.name}</b><span className="tx">{f.err || f.task || f.stateText}</span></button>;
          })}
          {attn.length > ATTN_MAX && <span className="mt-ta-amore">{t('mmTerr.more', { n: attn.length - ATTN_MAX })}</span>}
        </span>
        <span className="mt-ta-spacer" />
        <button type="button" className="mt-ta-iconbtn" data-action="mission-close" title={t('mmTerr.close')} aria-label={t('mmTerr.close')} onClick={() => setMissionOpen(false)}><XIcon /></button>
      </div>

      <div className="mt-ta-hud mt-ta-legend" data-role="ta-legend" aria-label={t('mmTerr.legend')}>
        <span className="mt-ta-hint">{t('mmTerr.hint')}</span>
        <span className="lg"><span className="ring" aria-hidden="true" />{t('mmTerr.lgLight')}</span>
        <span className="lg"><span className="l k-spawn" aria-hidden="true" />{t('mmTerr.lgSpawn')}</span>
        <span className="lg"><span className="l k-role" aria-hidden="true" />{t('mmTerr.lgRole')}</span>
        <span className="lg"><span className="l k-prompt" aria-hidden="true" />{t('mmTerr.lgPrompt')}</span>
        <span className="lg"><span className="l k-cross" aria-hidden="true" />{t('mmTerr.lgCross')}</span>
      </div>

      {selB && selF && (
        <div className={`mt-ta-hud mt-ta-insp st-${ST[tiers.get(sel)]}`} data-role="ta-inspect" data-id={sel}>
          <div className="col">
            <span className="nm">{selB.node.name}</span>
            <span className="ln">{[selB.ws && lay.isles.find((i) => i.key === selB.ws)?.folder ? `${terrOf(lay.isles.find((i) => i.key === selB.ws).folder)?.name} / ${gName(selB.ws)}` : `${t('mmTerr.noFolder')} / ${gName(selB.ws)}`, selF.role, [selF.harness, selF.model].filter(Boolean).join(' '), [selF.stateText, selF.age].filter(Boolean).join(' · ')].filter(Boolean).join(' · ')}</span>
            <span className="ln task">{t(`mmTerr.kind.${selF.taskKind}`)}: {selF.task || t('mmMap3.noTask')}</span>
            {selF.err && <span className="ln err">{selF.err}</span>}
          </div>
          <button type="button" className="mt-ta-pbtn pri" data-action="ta-open" title={t('mmTerr.openTitle')} onClick={() => go(sel)}>{t('mmTerr.open')}</button>
          {!selF.shell && <button type="button" className="mt-ta-pbtn" data-action="ta-message" title={t('mmTerr.messageTitle', { name: selB.node.name })} onClick={() => message(sel)}>{t('mmTerr.message')}</button>}
          <button type="button" className="mt-ta-iconbtn" data-action="ta-clear" title={t('mmTerr.clear')} aria-label={t('mmTerr.clear')} onClick={() => setSel(null)}><XIcon s={18} /></button>
        </div>
      )}

      <div className="mt-ta-hud mt-ta-dock" data-role="ta-dock">
        <div className="mt-ta-mini" data-role="ta-minimap" title={t('mmTerr.minimap')} onClick={onMini} style={{ width: MW, height: MH }}>
          {mm && lay.terrs.map((x) => { const r = mm.map(x); return <span key={x.id} className={`mt c${x.color}`} style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />; })}
          {mm && lay.isles.filter((i) => i.loose).map((i) => { const r = mm.map(i); return <span key={i.key || '-'} className="mt none" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />; })}
          {mm && ids.filter((id) => ['turn', 'alert', 'work'].includes(tiers.get(id))).map((id) => { const b = lay.cards.get(id), r = mm.map(b); return <span key={id} className={`md st-${ST[tiers.get(id)]}${lay.cards.get(id) && factsOf(id).shell ? ' shell' : ''}`} style={{ left: r.x + r.w / 2, top: r.y + r.h / 2 }} />; })}
          <span className="mv" ref={frameRef} data-role="ta-minimap-frame" />
        </div>
        <div className="mt-ta-lvrow" role="group" aria-label={t('mmTerr.levels')}>
          {['far', 'mid', 'near'].map((l) => <button key={l} type="button" className="lv" data-level={l} data-action={`ta-level-${l}`} aria-pressed="false" onClick={() => zoomCenter(LEVEL_K[l])}>{t(`mmTerr.${l}`)}</button>)}
        </div>
        <div className="mt-ta-zrow">
          <button type="button" className="zb" data-action="ta-zoom-out" title={t('mmTerr.zoomOut')} aria-label={t('mmTerr.zoomOut')} onClick={() => zoomCenter(view.current.k / ZOOM.step)}><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg></button>
          <span className="zpct" ref={pctRef} data-role="ta-zoom">100%</span>
          <button type="button" className="zb" data-action="ta-zoom-in" title={t('mmTerr.zoomIn')} aria-label={t('mmTerr.zoomIn')} onClick={() => zoomCenter(view.current.k * ZOOM.step)}><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
          <button type="button" className="zb fit" data-action="ta-fit" title={t('mmTerr.fitTitle')} onClick={() => fit()}>{t('mmTerr.fit')}</button>
        </div>
      </div>
    </div>
  );
}
