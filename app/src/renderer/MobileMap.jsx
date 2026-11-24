// P356: 휴대폰 페이지의 맵 탭 = 판 세션 맵과 같은 모양(폴더 띠, 워크스페이스 줄, 같은 카드·선·꼬리표). 맵 탭을 열 때만 읽는 조각이다.
// - 배치는 PC·옛 휴대폰 맵과 같은 lib/mission-lineage.js lineageLayout(휴대폰 배치, 오늘 | 이전 두 칸), 카드는 MapCard.jsx Card·cardFacts(PC와 같은 함수)
// - 자료: 판 이벤트 전부(events.subscribe)·mission.graph·board.get을 받지 않는다. 늘 받는 휴대폰 줄(mobile-store.js)과 맵을 열 때 받는 가벼운 구조 답(phone.map, 열쇠가 같으면 same만)
//   구조 답은 세션 구조(세션·이름·워크스페이스·부모)가 바뀔 때와 맵을 연 동안 REMAP_MS마다(같으면 수십 바이트) 다시 묻는다. 상태·지금 일·시간은 줄에서 덧입힌다
// - 보이는 카드만 그린다(lib/mobile-map.js visibleIds): 화면 밖 카드는 배치 자리만 있고 DOM이 없다. 옮기거나 확대하면 다음 그림 때 다시 고른다
// - 보기: 이 기기가 남긴 보기로 연다. 처음이면 첫 응답 필요(없으면 최근 세션) 카드를 읽히는 배율(100%)로. 맞춤은 보이는 폴더 띠 폭에(READ_K 아래로 안 줄임), 판 전체는 두 손가락으로 멀리
//   멀리 단계는 판 세션 맵과 같은 규칙(카드가 이름·상태 타일로 바뀌고 글은 --ik로 화면 크기를 지킨다)
// - 손가락: 한 손가락 끌기 = 시점 이동, 두 손가락 = 확대·축소, 카드 누르기 = 그 세션 화면(옛 휴대폰 맵 PhoneMap.jsx와 같은 판정 lib/phone-map.js)
// - 터미널·캔버스·xterm·판 store는 들이지 않는다. CSS는 판 화면 CSS에서 고른 dist/mobilemap.css(MobileApp.jsx가 이 조각과 함께 읽는다)
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMobile, getMobile, call } from './mobile-store.js';
import { useT, errText } from './lib/i18n.js';
import { lineageLayout, PHONE, todayWorkspaces, dayStart, msToMidnight, keepSameMap, factsKeeper, keepCardBoxes } from './lib/mission-lineage.js';
import { roleModel } from './lib/mission-model.js';
import { levelOf, zoomAt, ZOOM } from './lib/mission-terr.js';
import { PM, touchIntent, pinchView, goView, sizeKey } from './lib/phone-map.js';
import { holdLights } from './lib/work-light.js';
import { Card, cardFacts } from './MapCard.jsx';
import { liveFromRow, graphOf, structKey, tiersOf, visibleIds, visibleEdges, sameList, todoCounts, openMapView, saveMapView, bandFitView } from './lib/mobile-map.js';

const ST = { turn: 'needs', alert: 'error', work: 'working', review: 'done', rest: 'ready', sleep: 'sleeping', done: 'exited' };
const ATTN_MAX = 3;
const KINDS = ['spawn', 'role', 'prompt', 'cross'];
const EXP_KEY = 'atrium.mobileMap.expanded';
const DOT_GAP = 92, DOT_MIN_GAP = 28;
export const REMAP_MS = 30000; // 맵을 연 동안 구조 답을 다시 묻는 간격(같으면 열쇠만)
const STRUCT_MS = 700; // 구조가 바뀐 뒤 모았다가 묻기
const store = () => { try { return localStorage; } catch { return null; } };
const loadExpanded = () => { try { const a = JSON.parse(localStorage.getItem(EXP_KEY) || '[]'); return new Set(Array.isArray(a) ? a.slice(0, 200) : []); } catch { return new Set(); } };
const saveExpanded = (s) => { try { localStorage.setItem(EXP_KEY, JSON.stringify([...s].slice(-200))); } catch { /* 기억 못 해도 지금 화면은 된다 */ } };
let cache = null; // 마지막 구조 답(탭을 오가도 바로 그린다)
export const primeMap = (r) => { if (r && r.key) cache = r; }; // MobileApp.jsx가 조각과 함께 받은 첫 구조 답
const FolderIcon = () => <svg className="mt-ta-iico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /></svg>;
const TodoIcon = () => <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 3h.6M4.4 3H10M2 6h.6M4.4 6H10M2 9h.6M4.4 9H10" /></svg>;

export default function MobileMap({ onOpen }) {
  const t = useT();
  const rows = useMobile((m) => m.rows);
  const workspaces = useMobile((m) => m.workspaces);
  const cards = useMobile((m) => m.cards);
  const [map, setMap] = useState(cache);
  const [fail, setFail] = useState(null);
  const [expanded, setExpanded] = useState(loadExpanded);
  const [vsize, setVsize] = useState(null);
  const [vis, setVis] = useState(null); // 그릴 카드 id들
  const vpRef = useRef(null), worldRef = useRef(null), bgRef = useRef(null), pctRef = useRef(null);
  const view = useRef(null), sizeRef = useRef(null), layRef = useRef(null), opened = useRef(false);
  const moveTimer = useRef(0), glideTimer = useRef(0), saveTimer = useRef(0), visRaf = useRef(0), dirty = useRef(false);
  const quiet = useRef(0);
  const lastGo = useRef({});

  // ---- 구조 답: 열 때, 구조가 바뀔 때, 연 동안 가끔(같으면 열쇠만) ----
  const skey = useMemo(() => structKey(rows), [rows]);
  const fetchMap = useCallback(() => call('phone.map', cache ? { key: cache.key } : {}).then((r) => { if (r && !r.same) { cache = r; setMap(r); } else if (cache) setMap(cache); setFail(null); }).catch((e) => { if (!cache) setFail(e); }), []);
  const first = useRef(true);
  useEffect(() => {
    const id = setTimeout(fetchMap, first.current ? 0 : STRUCT_MS);
    first.current = false;
    return () => clearTimeout(id);
  }, [skey, fetchMap]);
  useEffect(() => { const id = setInterval(() => { if (!document.hidden) fetchMap(); }, REMAP_MS); return () => clearInterval(id); }, [fetchMap]);

  // ---- 그래프·등급·배치(판 세션 맵과 같은 함수) ----
  const graph = useMemo(() => graphOf(map, getMobile().rows), [map, skey]); // eslint-disable-line react-hooks/exhaustive-deps
  const tiersRef = useRef(null);
  const tiers = useMemo(() => (tiersRef.current = keepSameMap(tiersRef.current, tiersOf(graph, rows))), [graph, rows]);
  const liveOf = (n) => (n && n.sessionId ? liveFromRow(rows.get(n.sessionId)) : null);
  const [day, setDay] = useState(() => dayStart());
  useEffect(() => { const id = setTimeout(() => setDay(dayStart()), msToMidnight() + 500); return () => clearTimeout(id); }, [day]);
  const todayKey = graph ? [...todayWorkspaces(graph.nodes, { liveOf, tierOf: (n) => tiers.get(n.id), now: Math.max(Date.now(), day) })].sort().join('\n') : '';
  const today = useMemo(() => new Set(todayKey ? todayKey.split('\n') : []), [todayKey]);
  const names = useMemo(() => new Map((workspaces || []).map((w) => [w.key, w.name])), [workspaces]);
  const vkey = sizeKey(vsize);
  const lastLay = useRef(null);
  const lay = useMemo(() => (lastLay.current = keepCardBoxes(lastLay.current, graph && vsize ? lineageLayout(graph, { vgroups: (map && map.groups) || [], tiers, names, noFolder: t('mmTerr.noFolder'), expanded, phone: true, view: vsize, today, columns: 2 }) : null)), [graph, tiers, names, t, expanded, vkey, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const roles = useMemo(() => (graph && lay ? roleModel(graph, { tiers, tree: lay.tree }) : new Map()), [graph, lay, tiers]);
  const relOfChild = useMemo(() => { const m = new Map(); if (lay) for (const e of lay.edges) if (e.tree) m.set(e.to, e.rel); return m; }, [lay]);
  layRef.current = lay;
  sizeRef.current = vsize;
  const now = Date.now();
  const keepFacts = useMemo(() => factsKeeper(), []);
  const factsOf = (id) => {
    const b = lay.cards.get(id), n = b.node, m = roles.get(id);
    const pid = m && m.parentId, p = pid ? lay.tree.byId.get(pid) : null;
    const pws = p ? p.workspaceKey || '' : null;
    return keepFacts(id, cardFacts({ ...n, _rel: relOfChild.get(id) }, liveOf(n), m, tiers.get(id), t, now, { parentName: p ? p.name : null, parentWs: p ? (pws ? names.get(pws) || pws : t('mmapGroup.noWorkspace')) : null, cross: !!p && pws !== (n.workspaceKey || ''), kids: (lay.tree.kids.get(id) || []).length }));
  };
  const onFold = useCallback((id) => { quiet.current = Date.now() + 400; setExpanded((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); saveExpanded(n); return n; }); }, []);
  // 할 일 배지(판 세션 맵과 같은 꼬리표, 수는 휴대폰 할 일 카드)
  const todo = useMemo(() => todoCounts(cards), [cards]);
  const parts = useMemo(() => ({ Todo: ({ sessionId }) => { const n = todo.get(sessionId) || 0; if (!n) return null; const label = t('mapTodo.badgeTitle', { n }); return <span className="mt-sm-todo" data-role="map-todo" data-count={n} title={label} aria-label={label}><TodoIcon />{t('mapTodo.badge')}{n > 1 ? <b data-role="map-todo-n">{n}</b> : null}</span>; } }), [todo, t]);

  // ---- 보이는 카드 고르기(그림 뒤 한 번) ----
  const pickVis = useCallback(() => {
    visRaf.current = 0;
    const L = layRef.current, s = sizeRef.current, v = view.current;
    if (!L || !s || !v) return;
    const next = visibleIds(L.cards, L.order.filter((id) => !L.cards.get(id).folded), v, s);
    setVis((cur) => (sameList(cur, next) ? cur : next));
  }, []);
  const askVis = useCallback(() => { if (!visRaf.current) visRaf.current = requestAnimationFrame(pickVis); }, [pickVis]);
  useEffect(() => () => cancelAnimationFrame(visRaf.current), []);

  // ---- 보기 쓰기(DOM에 바로, PC paint와 같다) ----
  const paint = useCallback((v, { glide = false, save = true } = {}) => {
    view.current = v;
    const w = worldRef.current, vp = vpRef.current;
    const lv = levelOf(v.k);
    if (w) {
      if (glide) { w.classList.add('glide'); clearTimeout(glideTimer.current); glideTimer.current = setTimeout(() => { w.classList.remove('glide'); }, 480); } else w.classList.remove('glide');
      w.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
      if (!w.classList.contains(`lv-${lv}`)) { w.classList.remove('lv-far', 'lv-mid', 'lv-near'); w.classList.add(`lv-${lv}`); }
    }
    const bg = bgRef.current;
    if (bg) { let gs = DOT_GAP * v.k; while (gs < DOT_MIN_GAP) gs *= 2; bg.style.backgroundSize = `${gs}px ${gs}px`; bg.style.backgroundPosition = `${v.x % gs - gs / 2}px ${v.y % gs - gs / 2}px`; }
    if (pctRef.current) pctRef.current.textContent = `${Math.round(v.k * 100)}%`;
    const setIk = () => { const ww = worldRef.current, kk = view.current && view.current.k; if (!ww || !kk || levelOf(kk) !== 'far') return; const ik = (1 / kk).toFixed(3); if (ww.style.getPropertyValue('--ik') !== ik) ww.style.setProperty('--ik', ik); };
    if (w && lv === 'far' && (glide || !w.style.getPropertyValue('--ik'))) setIk();
    if (vp && !glide) { if (vp.dataset.moving !== '1') { vp.dataset.moving = '1'; holdLights(vp, true); } clearTimeout(moveTimer.current); moveTimer.current = setTimeout(() => { delete vp.dataset.moving; holdLights(vp, false); setIk(); }, 160); }
    askVis();
    if (save) { dirty.current = true; clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => saveMapView(store(), sizeRef.current, view.current), PM.SAVE_MS); }
  }, [askVis]);
  // 맞춤: 보이는 폴더 띠 폭에(카드가 읽히는 배율). 판 전체는 두 손가락으로 멀리
  const fit = useCallback((glide = true) => { const L = layRef.current, s = sizeRef.current; const v = L && s ? bandFitView(L, view.current, s) : null; if (v) paint({ k: v.k, x: v.x, y: v.y }, { glide }); }, [paint]);
  const zoomBy = useCallback((f) => { const s = sizeRef.current, v = view.current; if (s && v) paint(zoomAt(v, s.w / 2, s.h / 2, v.k * f), { glide: true }); }, [paint]);

  // 보이는 칸 크기
  useLayoutEffect(() => {
    const el = vpRef.current;
    if (!el) return undefined;
    const read = () => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setVsize((v) => (v && v.w === Math.round(r.width) && v.h === Math.round(r.height) ? v : { w: Math.round(r.width), h: Math.round(r.height) })); };
    read();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', read);
    return () => { if (ro) ro.disconnect(); else window.removeEventListener('resize', read); };
  }, []);
  // 처음(또는 화면 크기가 바뀌면): 이 크기에서 기억한 보기, 없으면 맞춤. 배치가 바뀌면 보이는 카드를 다시 고른다
  const openedKey = useRef('');
  useLayoutEffect(() => {
    if (!lay || !vsize) return;
    // 처음: 이 기기가 남긴 보기, 없으면 첫 응답 필요(없으면 최근 세션) 카드를 읽히는 배율로
    if (!opened.current || openedKey.current !== vkey) { opened.current = true; openedKey.current = vkey; paint(openMapView(store(), vsize, lay, tiers, (id) => { const n = lay.cards.get(id).node; const r = rows.get(n.sessionId); return (r && r.lastActivityAt) || 0; }), { save: false }); }
    else if (view.current) paint(view.current, { save: false });
    pickVis();
  }, [lay, vkey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 알약: 그 카드로 가서 반짝인다 ----
  const goTo = useCallback((id) => {
    const L = layRef.current, s = sizeRef.current, b = L && L.cards.get(id);
    if (!b || !s) return false;
    paint(goView(b, view.current, s.w, s.h), { glide: true });
    setTimeout(() => { const el = vpRef.current && vpRef.current.querySelector(`.mt-ta-slot[data-id="${CSS.escape(id)}"]`); if (el) { el.classList.remove('blink'); void el.offsetWidth; el.classList.add('blink'); setTimeout(() => el.classList.remove('blink'), 2200); } }, 520);
    return true;
  }, [paint]);

  // ---- 손가락: 끌기·두 손가락·누르기(포인터 이벤트, 마우스도 같다) ----
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return undefined;
    const pts = new Map();
    let g = null;
    const local = (e) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const begin = () => {
      const v = view.current, p = [...pts.values()];
      if (!v || !p.length) { g = null; return; }
      if (p.length >= 2) { g = { mode: 'pinch', v0: v, m0: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }, d0: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1 }; return; }
      const cont = g && (g.mode === 'pinch' || g.mode === 'pan');
      g = { mode: cont ? 'pan' : 'press', v0: v, p0: p[0] };
    };
    const down = (e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; if (e.target.closest('.mt-pmap-dock')) return; pts.set(e.pointerId, local(e)); begin(); };
    const move = (e) => {
      if (!pts.has(e.pointerId) || !g) return;
      pts.set(e.pointerId, local(e));
      const p = [...pts.values()];
      if (g.mode === 'pinch' && p.length >= 2) { const m = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }, d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1; quiet.current = Date.now() + 500; paint(pinchView(g.v0, g.m0, g.d0, m, d)); return; }
      if (p.length !== 1 || !g.p0) return;
      const dx = p[0].x - g.p0.x, dy = p[0].y - g.p0.y;
      if (g.mode === 'press' && touchIntent({ n: 1, dx, dy }) === 'pan') { g.mode = 'pan'; el.classList.add('dragging'); try { el.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 끌기는 된다 */ } }
      if (g.mode === 'pan') { quiet.current = Date.now() + 400; paint({ k: g.v0.k, x: g.v0.x + dx, y: g.v0.y + dy }); }
    };
    const up = (e) => { if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); if (pts.size) { begin(); return; } g = null; el.classList.remove('dragging'); };
    const click = (e) => {
      if (Date.now() < quiet.current) { e.stopPropagation(); e.preventDefault(); return; }
      if (e.target.closest('.mt-sm-fold')) return;
      const card = e.target.closest('.mt-ta-card');
      if (!card) return;
      e.stopPropagation();
      const L = layRef.current, b = L && L.cards.get(card.dataset.id);
      if (b && b.node.sessionId) onOpen(b.node.sessionId);
    };
    const wheel = (e) => { e.preventDefault(); const v = view.current; if (!v) return; const p = local(e); paint(zoomAt(v, p.x, p.y, v.k * Math.exp(-e.deltaY * ZOOM.wheel))); };
    const noGesture = (e) => e.preventDefault();
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true); el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('gesturestart', noGesture); el.addEventListener('gesturechange', noGesture);
    return () => {
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.removeEventListener('click', click, true); el.removeEventListener('wheel', wheel);
      el.removeEventListener('gesturestart', noGesture); el.removeEventListener('gesturechange', noGesture);
    };
  }, [paint, onOpen]);
  // 떠날 때 옮긴 보기를 바로 남긴다
  useEffect(() => () => { clearTimeout(saveTimer.current); if (dirty.current && view.current && sizeRef.current) saveMapView(store(), sizeRef.current, view.current); }, []);
  window.__mtMap = { lay: () => layRef.current, view: () => (view.current ? { ...view.current } : null), set: (v) => paint(v), fit: () => fit(false), goTo, drawn: () => (vpRef.current ? vpRef.current.querySelectorAll('.mt-ta-slot').length : 0), size: () => sizeRef.current, map: () => cache }; // 시험이 읽는다

  const ids = lay ? lay.order : [];
  const attn = ids.filter((id) => tiers.get(id) === 'turn' || tiers.get(id) === 'alert').sort((a, b) => (tiers.get(a) === 'turn' ? 0 : 1) - (tiers.get(b) === 'turn' ? 0 : 1));
  const nWork = ids.filter((id) => tiers.get(id) === 'work').length, nDone = ids.filter((id) => tiers.get(id) === 'review').length;
  const goNext = (key, want) => { const list = ids.filter((id) => want.includes(tiers.get(id))); if (!list.length) return; const i = list.indexOf(lastGo.current[key]); const id = list[(i + 1) % list.length]; lastGo.current[key] = id; goTo(id); };
  const leads = useMemo(() => (lay ? new Set([...lay.cards.entries()].filter(([id, b]) => b.depth >= 0 && (lay.tree.kids.get(id) || []).some((c) => (c.workspaceKey || '') === (b.node.workspaceKey || ''))).map(([id]) => id)) : new Set()), [lay]);
  const shown = lay && vis ? vis.filter((id) => lay.cards.has(id)) : [];
  const edges = lay && view.current && vsize ? visibleEdges(lay.edges, lay.cards, view.current, vsize) : [];
  return (
    <div className="mt-mp-map mt-pl mt-pmap" data-role="mp-map">
      {lay && ids.length > 0 && (
        <div className="mt-pl-pills" data-role="pl-pills">
          {attn.slice(0, ATTN_MAX).map((id) => { const tr = tiers.get(id); return <button key={id} type="button" className={`mt-pl-pill st-${ST[tr]}`} data-role="pl-attn" data-id={id} onClick={() => goTo(id)}><i /><b>{lay.tree.byId.get(id).name}</b><span>{t(`mmTerr.chip.${tr}`)}</span></button>; })}
          {attn.length > ATTN_MAX && <button type="button" className="mt-pl-pill st-needs more" data-role="pl-attn-more" onClick={() => goNext('attn', ['turn', 'alert'])}><span>{t('mmTerr.more', { n: attn.length - ATTN_MAX })}</span></button>}
          {!attn.length && <span className="mt-pl-pill quiet" data-role="pl-none"><span>{t('phoneMap.none')}</span></span>}
          {nWork > 0 && <button type="button" className="mt-pl-pill st-working count" data-role="pl-count" data-tier="work" onClick={() => goNext('work', ['work'])}><i /><b>{nWork}</b><span>{t('mmTerr.chip.work')}</span></button>}
          {nDone > 0 && <button type="button" className="mt-pl-pill st-done count" data-role="pl-count" data-tier="review" onClick={() => goNext('review', ['review'])}><i /><b>{nDone}</b><span>{t('mmTerr.chip.review')}</span></button>}
        </div>
      )}
      <div className="mt-pmap-stage mt-ta mt-sm" data-role="pm-stage">
        <div className="mt-ta-vp mt-pmap-vp" data-role="ta-viewport" ref={vpRef}>
          <div className="mt-ta-bg" ref={bgRef} aria-hidden="true" />
          {!lay && !fail && <div className="mt-ta-loading">{t('common.loading')}</div>}
          {!lay && fail && <div className="mt-ta-loading" data-role="pm-fail">{t('mission.fail', { error: errText(fail) })}</div>}
          {lay && ids.length === 0 && <div className="mt-ta-loading" data-role="pm-empty">{t('phoneHead.empty')}</div>}
          {lay && ids.length > 0 && (
            <div className="mt-ta-world lv-far" data-role="ta-world" data-cards={ids.length} data-drawn={shown.length} ref={worldRef} style={view.current ? { transform: `translate(${view.current.x}px, ${view.current.y}px) scale(${view.current.k})` } : undefined}>
              {lay.bands.map((b, i) => (
                <div key={`b:${b.id || 'none'}:${i}`} className={`mt-sm-band mt-pmap-band${b.odd ? ' odd' : ''}${b.loose ? ' loose' : ''}`} data-role="ln-band" data-id={b.id || 'none'} style={{ left: b.x, top: b.y, height: b.h, width: b.w }}>
                  <div className="mt-pmap-fh" data-role="pm-fhead">
                    <span className="fn" data-role="ln-band-name">{b.name}{b.cont ? <span className="cont"> {t('phoneMap.cont')}</span> : null}</span>
                    <span className="fs" data-role="ln-band-stat">{t('mmTerr.workspaces', { n: b.nWs })} · {t('mmTerr.sessions', { n: b.sessions })}</span>
                    <span className="fbar" aria-hidden="true">{b.bar.map((c) => <i key={c.tier} className={`st-${ST[c.tier]}`} style={{ flexGrow: c.n }} />)}</span>
                  </div>
                </div>
              ))}
              {lay.rows.map((r) => (
                <div key={`r:${r.key || '-'}`} className={`mt-sm-row mt-pmap-row${r.first ? ' first' : ''}`} data-role="ta-isle" data-key={r.key} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
                  <div className="mt-pmap-wh" data-role="pm-whead">
                    <span className="wsn"><FolderIcon /><span data-role="ta-isle-name">{r.key ? r.name : t('mmapGroup.noWorkspace')}</span></span>
                    <span className="wsc">{r.chips.map((c) => <span key={c.tier} className={`st-${ST[c.tier]}`} data-tier={c.tier}><i /><b>{c.n}</b> {t(`mmTerr.chip.${c.tier}`)}</span>)}</span>
                  </div>
                </div>
              ))}
              {(lay.sections || []).map((s) => (s.mode === 'head' ? (
                <div key={`sec:${s.kind}`} className={`mt-sm-sec head ${s.kind} mt-pmap-sec mt-pmap-colhead`} data-role="ln-section" data-kind={s.kind} data-col={s.col} style={{ left: s.x, top: s.y, width: s.w, height: s.h }}>
                  <span className="hn">{t(s.kind === 'today' ? 'mmSec.today' : 'mmSec.earlier')}</span>
                </div>
              ) : (
                <div key={`sec:${s.kind}`} className="mt-sm-sec line mt-pmap-sec" data-role="ln-section" data-kind="split" style={{ left: s.x, top: s.y, width: s.w, height: s.h }}>
                  <span className="up">{t('mmSec.today')}</span><i aria-hidden="true" /><span className="dn">{t('mmSec.earlier')}</span>
                </div>
              )))}
              <svg className="mt-ta-edges" width={1} height={1} aria-hidden="true">
                <defs>
                  {KINDS.map((k) => <marker key={k} id={`mt-mmap-tip-${k}`} className={`mt-sm-tip k-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 L10 5 L0 10 z" /></marker>)}
                  <marker id="mt-mmap-end-peer" className="mt-sm-tip k-peer" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse"><circle cx="5" cy="5" r="4" /></marker>
                </defs>
                {edges.map((e) => {
                  const k = e.peer ? 'peer' : e.lineage ? 'lineage' : e.cross ? 'cross' : e.rel;
                  const tip = e.peer ? 'url(#mt-mmap-end-peer)' : e.lineage ? undefined : `url(#mt-mmap-tip-${KINDS.includes(k) ? k : 'spawn'})`;
                  return <path key={e.id} className={`mt-ta-edge k-${k}${!e.peer && !e.lineage && (e.active || tiers.get(e.to) === 'work') ? ' active' : ''}`} data-role="ta-edge" data-from={e.from} data-to={e.to} data-rel={e.rel} data-cross={e.cross ? '1' : undefined} d={e.d} markerEnd={tip} markerStart={e.peer ? tip : undefined} />;
                })}
              </svg>
              {shown.map((id) => { const b = lay.cards.get(id); return <Card key={id} id={id} b={b} f={factsOf(id)} tier={tiers.get(id)} lead={leads.has(id)} tagged={false} onTag={noop} onOpen={noop} onHover={noop} t={t} unfold={b.depth >= PHONE.FOLD && expanded.has(id) && (lay.tree.kids.get(id) || []).length > 0} onFold={onFold} fit todo parts={parts} />; })}
            </div>
          )}
        </div>
        {lay && ids.length > 0 && (
          <div className="mt-pmap-dock" data-role="ta-dock">
            <button type="button" className="zb" data-action="ta-zoom-out" aria-label={t('mmTerr.zoomOut')} onClick={() => zoomBy(1 / ZOOM.step)}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg></button>
            <span className="zpct" ref={pctRef} data-role="ta-zoom">100%</span>
            <button type="button" className="zb" data-action="ta-zoom-in" aria-label={t('mmTerr.zoomIn')} onClick={() => zoomBy(ZOOM.step)}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
            <button type="button" className="zb fit" data-action="ta-fit" aria-label={t('mmTerr.fitTitle')} onClick={() => fit()}>{t('mmTerr.fit')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
const noop = () => {};
