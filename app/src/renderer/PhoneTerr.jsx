// P152: 휴대폰 미션 맵 A "Territories"(시안 A-phone). 위는 멀리 단계 영토 지도(섬마다 세션 색 타일, 작업 중 타일에도 빛), 아래 시트는 "나를 기다리는 것"(응답 필요·오류) 카드와 작업 중 카드.
// - 배치는 lib/mission-terr.js(territoryLayout → phoneTerr). 옛 휴대폰 지도(PhoneMission.jsx ClassicPhoneMission)는 숨은 설정 missionStyle: classic일 때만.
// - 한 손가락으로 옮기고 두 손가락으로 확대·축소(lib/touch-board.js 셈, P95와 같은 처리). 페이지는 늘어나지 않는다(touch-action: none, gesture 막음).
//   보기는 한 요소의 transform만 바꾼다(다시 그리지 않는다). 처음과 "맞춤"은 지도 전체를 칸에 맞춘다.
// - 타일을 누르면: 화면에서 타일이 작으면(24px 밑) 그 섬으로 확대하고, 크면 그 세션을 연다(Phone.jsx PhoneSession). 섬 바탕을 누르면 그 섬으로 확대한다.
//   시트의 카드를 누르면 그 세션을 연다. 휴대폰 목록 화면·키 패드(P104)·길게 눌러 복사(P151)로 가는 길은 그대로(세션 화면은 Phone.jsx).
// - 빛: P107 빛 층(MissionLight)을 타일 크기에 맞춘다(phone.css P152 덩어리, 휴대폰은 steps(36)로 가볍게).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, wsName } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { territoryLayout, phoneTerr, fitView, fitBox, tileTap } from './lib/mission-terr.js';
import { roleModel, nodeTier } from './lib/mission-model.js';
import { TOUCH_SLOP_PX, pinchViewport, panViewport, mid, dist } from './lib/touch-board.js';
import { MissionLight } from './Mission.jsx';
import { cardFacts } from './MissionTerr.jsx';

const REFRESH_MS = 600;
const ST = { turn: 'needs', alert: 'error', work: 'working', review: 'done', rest: 'ready', sleep: 'sleeping', done: 'exited' };
const IDLE = new Set(['rest', 'sleep', 'done']);
const LIM = { minZoom: 0.2, maxZoom: 4 };
const TOPBAR = 44; // 지도 칸 위 띠(안내 글, 줌 단추). 지도는 이 아래부터 맞춘다
const READ_K = 0.88; // 타일 이름 12px이 화면에서 10.5px 이상
let cache = null;
const Chev = () => <svg className="mt-ph-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>;

function SheetCard({ id, b, f, tier, onOpen, t }) {
  const st = ST[tier] || 'ready';
  return (
    <div className={`mt-pt-pslot st-${st}${f.shell ? ' shell' : ''}`}>
      <button type="button" className="mt-pt-pc" data-role="pt-card" data-id={id} data-session={b.node.sessionId} data-tier={tier} onClick={() => onOpen(b.node.sessionId)}>
        {tier === 'work' && <MissionLight role="pt-light" />}
        <span className="r1"><span className="nm">{b.node.name}</span><span className="st"><i />{f.stateText}{f.age ? <span className="ago"> · {f.age}</span> : null}</span></span>
        <span className="r2">{f.role ? <b>{f.role}</b> : null}{f.role ? <span>·</span> : null}<span className="hb">{f.k.mark}</span><span>{f.harness}</span>{f.model ? <><span>·</span><span>{f.model}</span></> : null}<span className="where">· {b.ws ? wsName(b.ws) : t('mmapGroup.noWorkspace')}</span></span>
        <span className="r3"><b>{t(`mmTerr.kind.${f.taskKind}`)}</b>{f.task || t('mmMap3.noTask')}</span>
        {f.err ? <span className="r4">{f.err}</span> : null}
      </button>
    </div>
  );
}

export function PhoneTerr({ onBack, onOpen, conn }) {
  const t = useT();
  const sessions = useStore((st) => st.sessions);
  const links = useStore((st) => st.links);
  const thread = useStore((st) => st.thread);
  const loops = useStore((st) => st.loops);
  const workspaces = useStore((st) => st.workspaces);
  const vgroups = useStore((st) => st.groups);
  const [graph, setGraph] = useState(cache);
  const [fail, setFail] = useState(null);
  const [vp, setVp] = useState(null);
  const stageRef = useRef(null), worldRef = useRef(null), tagRef = useRef(null);
  const view = useRef(null); // { k, x, y }
  const moved = useRef(false);
  const ptRef = useRef(null), vpRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => api.call('mission.graph').then((g) => { cache = g; if (alive) { setGraph(g); setFail(null); } }).catch((e) => { if (alive) setFail(e); }), graph ? REFRESH_MS : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [sessions, links, thread, loops]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const read = () => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setVp((v) => (v && v.w === Math.round(r.width) && v.h === Math.round(r.height) ? v : { w: Math.round(r.width), h: Math.round(r.height) })); };
    read();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', read);
    return () => { if (ro) ro.disconnect(); else window.removeEventListener('resize', read); };
  }, []);

  const order = useMemo(() => (workspaces || []).map((w) => w.key), [workspaces]);
  const liveOf = (n) => (n && n.sessionId ? sessions.get(n.sessionId) : null);
  const tiers = useMemo(() => new Map(graph ? graph.nodes.filter((n) => n.kind === 'session').map((n) => [n.id, nodeTier(n, liveOf(n))]) : []), [graph, sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const names = useMemo(() => new Map((workspaces || []).map((w) => [w.key, wsName(w.key)])), [workspaces]);
  const lay = useMemo(() => (graph ? territoryLayout(graph, { order, vgroups, tiers, names, routing: false }) : null), [graph, order, vgroups, tiers, names]);
  const pAspect = vp ? Math.round(((vp.w - 16) / Math.max(120, vp.h - TOPBAR - 8)) * 10) / 10 : 0.9;
  const pMaxW = vp ? (vp.w - 16) / READ_K : 0;
  const pt = useMemo(() => (lay ? phoneTerr(lay, { names, aspect: pAspect, maxW: pMaxW }) : null), [lay, names, pAspect, pMaxW]);
  const roles = useMemo(() => (graph && lay ? roleModel(graph, { tiers, tree: lay.tree }) : new Map()), [graph, lay, tiers]);
  ptRef.current = pt; vpRef.current = vp;
  const now = Date.now();
  const factsOf = (id) => {
    const b = lay.cards.get(id), n = b.node, m = roles.get(id), pid = m && m.parentId, p = pid ? lay.tree.byId.get(pid) : null;
    return cardFacts(n, liveOf(n), m, tiers.get(id), t, now, { parentName: p ? p.name : null, kids: (lay.tree.kids.get(id) || []).length });
  };

  const apply = (v) => {
    view.current = v;
    const w = worldRef.current;
    if (w) w.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
    if (tagRef.current) tagRef.current.textContent = `${Math.round(v.k * 100)}%`; // 휴대폰은 늘 타일 지도라 단계 이름은 쓰지 않는다
  };
  // 맞춤: 위 띠(안내 글과 줌 단추, TOPBAR)를 비우고 전체를 칸에 넣는다
  const fitOf = (p, s) => fitView(p.bounds, s.w, s.h, { pad: 8, top: TOPBAR, bottom: 0, max: 1.6 });
  const fit = () => { const p = ptRef.current, s = vpRef.current; if (p && s) apply(fitOf(p, s)); };
  // P153: 처음 연 화면. 전체가 읽히는 크기(이름 글 10.5px 이상, READ_K)로 들어가면 맞춤, 아니면 폭에 맞추고 위에 붙인다(아래는 끌어서 본다)
  const openView = () => { const p = ptRef.current, s = vpRef.current; if (!p || !s) return; const f = fitOf(p, s); if (f.k >= READ_K) { apply(f); return; } const k = Math.min(1.2, Math.max(READ_K, (s.w - 16) / p.bounds.w)); apply({ k, x: (s.w - p.bounds.w * k) / 2, y: TOPBAR }); };
  const zoomBy = (f) => { const s = vpRef.current, v = view.current; if (!s || !v) return; const k = Math.max(LIM.minZoom, Math.min(LIM.maxZoom, v.k * f)), r = k / v.k; apply({ k, x: s.w / 2 - (s.w / 2 - v.x) * r, y: s.h / 2 - (s.h / 2 - v.y) * r }); };
  const toIsle = (key) => { const p = ptRef.current, s = vpRef.current, i = p && p.isles.find((x) => x.key === key); if (i && s) apply(fitBox(i, s.w, s.h, { pad: 16, max: 3 })); };
  useLayoutEffect(() => {
    if (!pt || !vp) return;
    if (!view.current) openView(); else apply(view.current);
  }, [pt, vp]); // eslint-disable-line react-hooks/exhaustive-deps

  // 손가락: 한 손가락 옮기기, 두 손가락 확대·축소(P95와 같다)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    let g = null;
    const pts = (tl) => { const r = el.getBoundingClientRect(); return [...tl].map((x) => ({ id: x.identifier, x: x.clientX - r.left, y: x.clientY - r.top })); };
    const asZ = (v) => ({ x: v.x, y: v.y, zoom: v.k });
    const fromZ = (z) => ({ k: z.zoom, x: z.x, y: z.y });
    const begin = (tl) => {
      const p = pts(tl), v0 = asZ(view.current);
      if (p.length >= 2) g = { mode: 'pinch', v0, m0: mid(p[0], p[1]), d0: dist(p[0], p[1]) };
      else if (p.length === 1) g = { mode: g && g.mode !== 'pending' ? 'pan' : 'pending', v0, p0: p[0] };
      else g = null;
    };
    const onStart = (e) => { if (e.touches.length === 1) moved.current = false; if (!view.current) return; begin(e.touches); };
    const onMove = (e) => {
      if (e.cancelable) e.preventDefault();
      if (!g || !view.current) return;
      const p = pts(e.touches);
      if (g.mode === 'pinch' && p.length >= 2) { moved.current = true; apply(fromZ(pinchViewport(g.v0, g.m0, g.d0, mid(p[0], p[1]), dist(p[0], p[1]), LIM))); return; }
      if (p.length !== 1 || !g.p0) return;
      const dx = p[0].x - g.p0.x, dy = p[0].y - g.p0.y;
      if (g.mode === 'pending' && Math.hypot(dx, dy) > TOUCH_SLOP_PX) g.mode = 'pan';
      if (g.mode === 'pan') { moved.current = true; apply(fromZ(panViewport(g.v0, dx, dy))); }
    };
    const onEnd = (e) => { if (!view.current) return; if (e.touches.length) begin(e.touches); else g = null; };
    const noGesture = (e) => e.preventDefault();
    const cap = { passive: false };
    el.addEventListener('touchstart', onStart, cap); el.addEventListener('touchmove', onMove, cap); el.addEventListener('touchend', onEnd, cap); el.addEventListener('touchcancel', onEnd, cap);
    el.addEventListener('gesturestart', noGesture, cap); el.addEventListener('gesturechange', noGesture, cap);
    return () => {
      el.removeEventListener('touchstart', onStart, cap); el.removeEventListener('touchmove', onMove, cap); el.removeEventListener('touchend', onEnd, cap); el.removeEventListener('touchcancel', onEnd, cap);
      el.removeEventListener('gesturestart', noGesture, cap); el.removeEventListener('gesturechange', noGesture, cap);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  window.__mtPm = { view: () => (view.current ? { x: view.current.x, y: view.current.y, zoom: view.current.k } : null), fit, style: 'territories' }; // 시험이 읽는다

  const onTap = (e) => {
    if (moved.current) return;
    const tile = e.target.closest('[data-role=pt-tile]');
    if (tile) { if (tileTap(view.current ? view.current.k : 1) === 'open') onOpen(tile.dataset.session); else toIsle(tile.dataset.ws); return; }
    const isle = e.target.closest('[data-role=pt-isle]');
    if (isle) toIsle(isle.dataset.ws);
  };
  const ids = lay ? lay.order : [];
  const attn = ids.filter((id) => tiers.get(id) === 'turn' || tiers.get(id) === 'alert').sort((a, b) => (tiers.get(a) === 'turn' ? 0 : 1) - (tiers.get(b) === 'turn' ? 0 : 1));
  const work = ids.filter((id) => tiers.get(id) === 'work');
  const gName = (k) => (k ? wsName(k) : t('mmapGroup.noWorkspace'));
  return (
    <div className="mt-ph-list mt-pm mt-pt" data-role="phone-mission" data-style="territories">
      <header className="mt-ph-head">
        <button type="button" className="mt-pm-back" data-action="phone-mission-back" aria-label={t('phoneMission.back')} onClick={onBack}><Chev /><span>{t('phone.list')}</span></button>
        <b className="mt-pm-title">{t('phoneMission.title')}</b>
        {conn}
      </header>
      <div className="mt-pt-stage" data-role="pm-stage" ref={stageRef} onClick={onTap}>
        {!lay && !fail && <div className="mt-ph-empty">{t('common.loading')}</div>}
        {!lay && fail && <div className="mt-ph-empty" data-role="pm-fail">{t('mission.fail', { error: errText(fail) })}</div>}
        {lay && lay.cards.size === 0 && <div className="mt-ph-empty" data-role="pm-empty">{t('phone.empty')}</div>}
        {pt && pt.tiles.length > 0 && (
          <div className="mt-pt-world" data-role="pm-world" ref={worldRef} style={{ transform: view.current ? `translate(${view.current.x}px, ${view.current.y}px) scale(${view.current.k})` : 'scale(0)' }}>
            {pt.terrs.map((x) => <div key={x.id} className={`mt-pt-terr c${x.color}`} data-role="pt-terr" style={{ left: x.x, top: x.y, width: x.w, height: x.h }}><span>{x.name}</span></div>)}
            {pt.isles.map((i) => (
              <div key={i.key || '-'} className={`mt-pt-isl${i.loose ? ' loose' : ''}`} data-role="pt-isle" data-ws={i.key} title={t('mmTerr.phoneIsle', { ws: gName(i.key) })} style={{ left: i.x, top: i.y, width: i.w, height: i.h }}>
                <span className="n">{gName(i.key)}</span>
              </div>
            ))}
            {pt.tiles.map((x) => {
              const tier = tiers.get(x.id), b = lay.cards.get(x.id), live = liveOf(b.node), shell = (live && live.kind === 'shell') || b.node.agentKind === 'shell';
              return (
                <span key={x.id} className={`mt-pt-tile st-${ST[tier] || 'ready'}${IDLE.has(tier) ? ' idle' : ''}${shell ? ' shell' : ''}`} data-role="pt-tile" data-id={x.id} data-session={b.node.sessionId} data-ws={x.ws} data-tier={tier} title={b.node.name} style={{ left: x.x, top: x.y, width: x.w, height: x.h }}>
                  {tier === 'work' && <MissionLight role="pt-light" />}
                  <i className="dot" aria-hidden="true" /><span className="tn">{b.node.name}</span>
                </span>
              );
            })}
          </div>
        )}
        {pt && pt.tiles.length > 0 && (
          <div className="mt-pt-zoomrow" onClick={(e) => e.stopPropagation()}>
            <span className="mt-pt-lvtag" ref={tagRef} data-role="pt-zoom" />
            <button type="button" className="mt-pt-zb" data-action="pt-zoom-out" aria-label={t('mmTerr.zoomOut')} onClick={() => zoomBy(1 / 1.4)}><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg></button>
            <button type="button" className="mt-pt-zb" data-action="pt-zoom-in" aria-label={t('mmTerr.zoomIn')} onClick={() => zoomBy(1.4)}><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
            <button type="button" className="mt-pt-zb fit" data-action="pm-fit" aria-label={t('phoneMission.fit')} onClick={() => fit()}>{t('mmTerr.fit')}</button>
          </div>
        )}
        {pt && pt.tiles.length > 0 && <span className="mt-pt-hint">{t('mmTerr.phoneHint')}</span>}
      </div>
      {lay && (
        <div className="mt-pt-sheet" data-role="pt-sheet">
          <span className="grab" aria-hidden="true" />
          <span className="sh"><b>{t('mmTerr.phoneWaiting')}</b><span>{attn.length ? t('mmTerr.phoneWaitingSub', { n: attn.length }) : ''}</span></span>
          {attn.length ? attn.map((id) => <SheetCard key={id} id={id} b={lay.cards.get(id)} f={factsOf(id)} tier={tiers.get(id)} onOpen={onOpen} t={t} />) : <span className="mt-pt-none" data-role="pt-none">{t('mmTerr.phoneNone')}</span>}
          {work.length > 0 && <span className="sh"><b>{t('mmTerr.phoneWorking')}</b><span>{work.length}</span></span>}
          {work.map((id) => <SheetCard key={id} id={id} b={lay.cards.get(id)} f={factsOf(id)} tier="work" onOpen={onOpen} t={t} />)}
        </div>
      )}
    </div>
  );
}
