// P87·P89: 휴대폰 미션 맵(작업 관계도). 세션 목록 머리줄의 단추로 연다. 누가 누구의 무슨 역할인지, 무엇이 일하는지를 노드와 선으로 보인다.
// - 자료는 mission.graph만 받는다(이름, 역할, 상태, 부모·하위, 연결). 대화(session.messages)와 터미널은 받지 않는다. 상태는 판의 세션 요약(이미 받은 것)으로 덧입힌다
// - 나무와 등급은 lib/phone-mission.js, 놓기와 보기(맞추기·범위)는 lib/phone-graph.js(P89): 무리 상자, 위 → 아래 나무, 곡선(하위)과 점선(그 밖 연결)
// - 강조는 P85 등급: 일함은 초록 테두리와 빛, 응답 필요·오류는 주황·빨강, 쉼·잠듦·끝남은 물러난다. 움직임은 없다(점도 깜빡이지 않는다)
// - 위쪽 요약 칩(작업 중·응답 필요)을 누르면 그 등급만 또렷하게 하고 그 카드들로 맞춘다. 다시 누르면 푼다(자리는 그대로, 다시 받지 않는다)
// - 한 손가락으로 옮기고 두 손가락으로 확대·축소(lib/touch-board.js의 셈). 페이지는 늘어나거나 튀지 않는다(touch-action: none, gesture 막음).
//   처음과 "맞추기"는 화면에 맞춘다. 카드를 누르면 세션 화면(Phone.jsx PhoneSession), 돌아오면 같은 자리·배율(화면 크기가 같을 때, 모듈에 둔다)
// - 가볍게(iPhone Safari): 그래프는 DOM 카드와 SVG 한 장, 옮길 때는 한 요소의 transform만 바꾼다. filter·backdrop-filter·will-change·끝없는 움직임 없음
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, wsName } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { STATE_LABEL } from './lib/labels.js';
import { phoneMission, PM_FOLD_KEY } from './lib/phone-mission.js';
import { phoneGraph, PG, colsFor, fitView, clampView, zoomRange, focusView, inFocus, vpKey, branchOf } from './lib/phone-graph.js';
import { toneOf } from './lib/phone.js';
import { kindOf, shownKind, logoFor } from './lib/kinds.js';
import { TOUCH_SLOP_PX, pinchViewport, panViewport, mid, dist } from './lib/touch-board.js';

const REFRESH_MS = 600; // 판이 바뀌면 이만큼 모았다가 다시 받는다
let cache = null; // 마지막 mission.graph
let viewAt = null; // 마지막 보기 { key: 화면 크기, v: { x, y, zoom } }
const store = () => { try { return localStorage; } catch { return null; } };
const readFolded = () => { try { return JSON.parse(store().getItem(PM_FOLD_KEY) || '[]'); } catch { return []; } };
const Chev = ({ dir = 'right' }) => <svg className="mt-ph-chev" viewBox="0 0 24 24" aria-hidden="true"><path d={dir === 'left' ? 'm15 18-6-6 6-6' : dir === 'down' ? 'm6 9 6 6 6-6' : 'm9 18 6-6-6-6'} /></svg>;

function stateText(r, live) {
  const s = live || { state: r.state, kind: r.agentKind };
  if (s.kind === 'shell' && s.state !== 'exited' && s.state !== 'sleeping') return s.shell && s.shell.atPrompt === false ? STATE_LABEL.shell_running : STATE_LABEL.shell_idle;
  return STATE_LABEL[s.state] || s.state || '';
}

function Kind({ live, r }) {
  const k = kindOf(shownKind(live || { kind: r.agentKind }));
  const src = logoFor(k, r.state);
  return src ? <img className="mt-pm-kind" src={src} alt={k.label} title={k.label} width="16" height="16" decoding="async" draggable="false" />
    : <span className="mt-pm-kind mark" style={{ color: k.color }} title={k.label}>{k.mark}</span>;
}

function Card({ n, live, dim, t }) {
  const r = n.row;
  const tone = toneOf(live || { state: r.state, kind: r.agentKind });
  const branch = branchOf(live);
  const sub = r.ask && (r.tier === 'turn' || r.tier === 'alert') ? { k: 'ask', text: r.ask }
    : r.from ? { k: 'from', text: t('phoneMission.from', { name: r.from.name, ws: r.from.key ? wsName(r.from.key) : t('phone.noRepo') }) }
    : branch ? { k: 'branch', text: `⎇ ${branch}` } : null;
  return (
    <button type="button" className={`mt-pm-node t-${r.tier}${dim ? ' dim' : ''}`} style={{ left: n.x, top: n.y, width: PG.W, height: PG.H }}
      data-role="pm-node" data-session={r.sessionId} data-name={r.name} data-tier={r.tier} data-depth={r.depth}>
      <span className="mt-pm-top">
        <span className="mt-ph-dot" data-tone={tone} />
        <b className="mt-pm-name">{r.name}</b>
        <Kind live={live} r={r} />
      </span>
      <span className="mt-pm-meta">
        {r.role && <span className="mt-pm-role" data-role="pm-role">{r.role}</span>}
        <span className="mt-pm-state" data-role="pm-state">{r.tier === 'turn' ? t('phoneMission.turn') : stateText(r, live)}</span>
        {r.loops > 0 && <span className="mt-pm-loop">⟳{r.loops}</span>}
      </span>
      {sub && <span className={`mt-pm-sub ${sub.k}`} data-role={`pm-${sub.k}`}>{sub.text}</span>}
    </button>
  );
}

export function PhoneMission({ onBack, onOpen, conn }) {
  const t = useT();
  const sessions = useStore((st) => st.sessions);
  const links = useStore((st) => st.links);
  const thread = useStore((st) => st.thread);
  const loops = useStore((st) => st.loops);
  const workspaces = useStore((st) => st.workspaces);
  const [graph, setGraph] = useState(cache);
  const [fail, setFail] = useState(null);
  const [folded, setFolded] = useState(readFolded);
  const [focus, setFocus] = useState(null); // 'work' | 'turn' | null
  const [vp, setVp] = useState(null); // 그래프 칸 크기 { w, h }
  const stageRef = useRef(null), worldRef = useRef(null);
  const view = useRef(null); // { x, y, zoom }
  const moved = useRef(false); // 옮기거나 확대한 손가락 뒤의 click은 열지 않는다
  const sizeRef = useRef(null), keyRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => api.call('mission.graph').then((g) => { cache = g; if (alive) { setGraph(g); setFail(null); } }).catch((e) => { if (alive) setFail(e); }), graph ? REFRESH_MS : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [sessions, links, thread, loops]); // eslint-disable-line react-hooks/exhaustive-deps
  // 그래프 칸 크기(세로·가로 돌리기)
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const read = () => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setVp((v) => (v && Math.round(v.w) === Math.round(r.width) && Math.round(v.h) === Math.round(r.height) ? v : { w: r.width, h: r.height })); };
    read();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', read);
    return () => { if (ro) ro.disconnect(); else window.removeEventListener('resize', read); };
  }, []);

  const order = useMemo(() => (workspaces || []).map((w) => w.key), [workspaces]);
  const lay = useMemo(() => (graph ? phoneMission(graph, { live: sessions, order, folded }) : null), [graph, sessions, order, folded]);
  const cols = vp ? colsFor(vp.w) : 2;
  const pg = useMemo(() => (lay ? phoneGraph(lay, { cols }) : null), [lay, cols]);
  sizeRef.current = pg && vp ? { size: pg, vp } : null;
  const tierOfId = useMemo(() => new Map(pg ? pg.nodes.map((n) => [n.id, n.row.tier]) : []), [pg]);

  // 보기를 바꾼다: 한 요소의 transform만(다시 그리지 않는다). 모듈에 남겨 돌아오면 같은 자리
  const apply = (v) => {
    const s = sizeRef.current;
    const c = s ? clampView(v, s.size, s.vp) : v;
    view.current = { x: c.x, y: c.y, zoom: c.zoom };
    if (keyRef.current) viewAt = { key: keyRef.current, v: view.current };
    const w = worldRef.current;
    if (w) w.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.zoom})`;
  };
  const fit = () => { const s = sizeRef.current; if (s) apply(fitView(s.size, s.vp)); };
  // 처음(또는 화면 크기가 바뀌면) 맞추고, 돌아오면 마지막 보기. 그래프가 바뀌어도 보기는 그대로(범위만 다시)
  useLayoutEffect(() => {
    if (!pg || !vp) return;
    const key = vpKey(vp);
    if (keyRef.current !== key || !view.current) {
      keyRef.current = key;
      apply(viewAt && viewAt.key === key ? viewAt.v : fitView(pg, vp));
    } else apply(view.current);
  }, [pg, vp]); // eslint-disable-line react-hooks/exhaustive-deps

  // 손가락: 한 손가락 옮기기, 두 손가락 확대·축소. 페이지 확대(Safari gesture)는 막는다
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    let g = null;
    const pts = (tl) => [...tl].map((x) => { const r = el.getBoundingClientRect(); return { id: x.identifier, x: x.clientX - r.left, y: x.clientY - r.top }; });
    const lim = () => { const s = sizeRef.current; return s ? zoomRange(s.size, s.vp) : { minZoom: 0.25, maxZoom: 2.5 }; };
    const set = apply;
    const begin = (tl) => {
      const p = pts(tl), v0 = { ...view.current };
      if (p.length >= 2) g = { mode: 'pinch', v0, m0: mid(p[0], p[1]), d0: dist(p[0], p[1]) };
      else if (p.length === 1) g = { mode: g && g.mode !== 'pending' ? 'pan' : 'pending', v0, p0: p[0] };
      else g = null;
    };
    const onStart = (e) => { if (e.touches.length === 1) moved.current = false; if (!view.current) return; begin(e.touches); };
    const onMove = (e) => {
      if (e.cancelable) e.preventDefault();
      if (!g || !view.current) return;
      const p = pts(e.touches);
      if (g.mode === 'pinch' && p.length >= 2) { moved.current = true; set(pinchViewport(g.v0, g.m0, g.d0, mid(p[0], p[1]), dist(p[0], p[1]), lim())); return; }
      if (p.length !== 1 || !g.p0) return;
      const dx = p[0].x - g.p0.x, dy = p[0].y - g.p0.y;
      if (g.mode === 'pending' && Math.hypot(dx, dy) > TOUCH_SLOP_PX) g.mode = 'pan';
      if (g.mode === 'pan') { moved.current = true; set(panViewport(g.v0, dx, dy)); }
    };
    const onEnd = (e) => { if (!view.current) return; if (e.touches.length) begin(e.touches); else g = null; }; // 두 손가락에서 하나를 떼면 남은 손가락으로 이어 옮긴다
    const noGesture = (e) => e.preventDefault();
    const cap = { passive: false };
    el.addEventListener('touchstart', onStart, cap); el.addEventListener('touchmove', onMove, cap); el.addEventListener('touchend', onEnd, cap); el.addEventListener('touchcancel', onEnd, cap);
    el.addEventListener('gesturestart', noGesture, cap); el.addEventListener('gesturechange', noGesture, cap);
    return () => {
      el.removeEventListener('touchstart', onStart, cap); el.removeEventListener('touchmove', onMove, cap); el.removeEventListener('touchend', onEnd, cap); el.removeEventListener('touchcancel', onEnd, cap);
      el.removeEventListener('gesturestart', noGesture, cap); el.removeEventListener('gesturechange', noGesture, cap);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  window.__mtPm = { view: () => (view.current ? { x: view.current.x, y: view.current.y, zoom: view.current.zoom } : null), fit }; // 시험이 읽는다

  const toggle = (key) => setFolded((f) => { const k = key || '-'; const n = f.includes(k) ? f.filter((x) => x !== k) : [...f, k]; try { store().setItem(PM_FOLD_KEY, JSON.stringify(n)); } catch {} return n; });
  const pick = (tier) => {
    const next = focus === tier ? null : tier;
    setFocus(next);
    const s = sizeRef.current;
    if (next && s) { const v = focusView(s.size.nodes.filter((n) => inFocus(next, n.row.tier)), s.vp); if (v) apply(v); }
  };
  const onClick = (e) => {
    if (moved.current) return;
    const b = e.target.closest('[data-role=pm-node], [data-action=pm-fold]');
    if (!b) return;
    if (b.dataset.action === 'pm-fold') toggle(b.dataset.ws || null);
    else if (b.dataset.session) onOpen(b.dataset.session);
  };
  const c = lay ? lay.counts : null;
  return (
    <div className="mt-ph-list mt-pm" data-role="phone-mission">
      <header className="mt-ph-head">
        <button type="button" className="mt-pm-back" data-action="phone-mission-back" aria-label={t('phoneMission.back')} onClick={onBack}><Chev dir="left" /><span>{t('phone.list')}</span></button>
        <b className="mt-pm-title">{t('phoneMission.title')}</b>
        {conn}
      </header>
      {c && (
        <div className="mt-pm-sum" data-role="pm-sum">
          <button type="button" className={`mt-pm-chip t-work${focus === 'work' ? ' on' : ''}`} data-n={c.work} data-action="pm-focus-work" aria-pressed={focus === 'work'} disabled={!c.work && focus !== 'work'} title={t('phoneMission.focus')} onClick={() => pick('work')}><i />{t('phoneMission.working', { n: c.work })}</button>
          <button type="button" className={`mt-pm-chip t-turn${focus === 'turn' ? ' on' : ''}`} data-n={c.turn} data-action="pm-focus-turn" aria-pressed={focus === 'turn'} disabled={!c.turn && focus !== 'turn'} title={t('phoneMission.focus')} onClick={() => pick('turn')}><i />{t('phoneMission.needs', { n: c.turn })}</button>
          <span className="mt-pm-chip">{t('phoneMission.all', { n: c.all })}</span>
        </div>
      )}
      <div className={`mt-pm-stage${focus ? ' focusing' : ''}`} data-role="pm-stage" ref={stageRef} onClick={onClick}>
        {!lay && !fail && <div className="mt-ph-empty">{t('common.loading')}</div>}
        {!lay && fail && <div className="mt-ph-empty" data-role="pm-fail">{t('mission.fail', { error: errText(fail) })}</div>}
        {lay && lay.groups.length === 0 && <div className="mt-ph-empty" data-role="pm-empty">{t('phone.empty')}</div>}
        {pg && pg.nodes.length + pg.groups.length > 0 && (
          <div className="mt-pm-world" data-role="pm-world" ref={worldRef} style={{ width: pg.width, height: pg.height, transform: view.current ? `translate(${view.current.x}px, ${view.current.y}px) scale(${view.current.zoom})` : 'scale(0)' }}>
            {pg.groups.map((g) => (
              <section key={g.key || '-'} className={`mt-pm-group${g.folded ? ' folded' : ''}`} data-role="pm-group" data-ws={g.key || ''} style={{ left: g.x, top: g.y, width: g.w, height: g.h }}>
                <button type="button" className="mt-pm-ghead" data-action="pm-fold" data-ws={g.key || ''} aria-expanded={!g.folded}>
                  <Chev dir={g.folded ? 'right' : 'down'} />
                  <span className="mt-pm-gname">{g.key ? wsName(g.key) : t('phone.noRepo')}</span>
                  {g.work > 0 && <span className="mt-pm-gn t-work" title={t('phoneMission.working', { n: g.work })}><i />{g.work}</span>}
                  {g.turn > 0 && <span className="mt-pm-gn t-turn" title={t('phoneMission.needs', { n: g.turn })}><i />{g.turn}</span>}
                  <span className="mt-pm-gcount">{g.count}</span>
                </button>
              </section>
            ))}
            <svg className="mt-pm-edges" width={pg.width} height={pg.height} viewBox={`0 0 ${pg.width} ${pg.height}`} aria-hidden="true">
              {pg.edges.map((e) => {
                const dim = focus && !(inFocus(focus, e.tier) || inFocus(focus, tierOfId.get(e.from)));
                return (
                  <g key={e.id} className={`mt-pm-edge ${e.kind} t-${e.tier}${e.active ? ' active' : ''}${dim ? ' dim' : ''}`} data-role="pm-edge" data-kind={e.kind} data-from={e.from} data-to={e.to}>
                    <path d={e.d} />
                    {e.kind !== 'tree' && <circle cx={e.ex} cy={e.ey} r="3" />}
                    {e.kind !== 'tree' && e.role && <text x={e.lx} y={e.ly} textAnchor="middle" dominantBaseline="middle" transform={e.rot ? `rotate(-90 ${e.lx} ${e.ly})` : undefined}>{e.role.length > 16 ? `${e.role.slice(0, 15)}…` : e.role}</text>}
                  </g>
                );
              })}
            </svg>
            {pg.nodes.map((n) => <Card key={n.id} n={n} t={t} live={n.row.sessionId ? sessions.get(n.row.sessionId) : null} dim={!!focus && !inFocus(focus, n.row.tier)} />)}
          </div>
        )}
        {pg && pg.nodes.length > 0 && (
          <div className="mt-pm-tools">
            <span className="mt-pm-legend" data-role="pm-legend"><i className="tree" />{t('phoneMission.legendTree')}<i className="link" />{t('phoneMission.legendLink')}</span>
            <button type="button" className="mt-pm-fit" data-action="pm-fit" aria-label={t('phoneMission.fit')} onClick={(e) => { e.stopPropagation(); fit(); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg><span>{t('phoneMission.fitShort')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
