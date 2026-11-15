// P160: 휴대폰 세션 맵 = PC 세션 맵(시안 B "Lineage", MissionLineage.jsx)과 같은 톤의 세로 목록(시안 B-phone). P152 영토 지도(PhoneTerr.jsx)를 갈음한다.
// - 배치: PC와 같은 판정(lib/mission-lineage.js lineageLayout)을 lib/phone-lineage.js가 폴더 > 워크스페이스 > 단계 들여쓰기 목록으로 편다.
//   폴더 머리(이름·워크스페이스 수·세션 수·상태 막대)와 워크스페이스 머리(이름·상태 칩)는 스크롤하는 동안 위에 붙는다(position: sticky).
// - 레일: 위 세션에서 하위로 꺾인 선(관계 종류마다 색·모양: 생성 실선, 역할 파선, 작업 요청 다른 색, PC 선 색과 같다). 카드 자리를 잰 뒤 워크스페이스마다 SVG 한 장에 긋는다.
//   동료는 짝 바로 곁(아래)에 놓이고 카드 오른쪽 바깥의 무채색 괄호(양끝 점)로 잇는다. 다른 워크스페이스의 위 세션에서 온 세션은 1단계에서 점선 꼬리와 "@이름(워크스페이스)에서".
//   PC처럼 4단계보다 깊은 가지는 "+n단계" 칩으로 접고, 누르면 그 가지만 편다(창에 기억).
// - 카드: PC 카드와 같은 사실(cardFacts: 이름·상태·시간 / 역할·하네스·모델 / 지금 또는 마지막 일 / 오류)을 좁은 폭에 맞춘다. 작업 중 빛(P107 층), 작업 완료 꼬리표·그라데이션.
// - 위 줄 알약: 나를 기다리는 세션(응답 필요·오류, 이름과 함께)과 작업 중·작업 완료 수. 누르면 그 카드로 스크롤하고 반짝인다(수 알약은 누를 때마다 다음 카드).
//   P152의 아래 "나를 기다리는 것" 시트는 이 알약과 겹쳐 없앴다.
// - 누르기: 카드를 한 번 누르면 그 세션 화면(Phone.jsx PhoneSession). 길게 누르면(또는 마우스 오른쪽) PC 마우스 미리 보기와 같은 내용(Peek)을 아래 판으로. 핀치 확대는 없다(세로 스크롤 목록).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, wsName } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { lineageLayout, LINE } from './lib/mission-lineage.js';
import { phoneLineage, nextOf, railPaths, peerPath, PL } from './lib/phone-lineage.js';
import { roleModel, nodeTier } from './lib/mission-model.js';
import { MissionLight, DoneMark } from './Mission.jsx';
import { cardFacts, Peek } from './MissionLineage.jsx';

const REFRESH_MS = 600;
const ST = { turn: 'needs', alert: 'error', work: 'working', review: 'done', rest: 'ready', sleep: 'sleeping', done: 'exited' };
const IDLE = new Set(['rest', 'sleep', 'done']);
const ATTN_MAX = 3; // 위 줄에 이름으로 보이는 기다리는 세션 수(그 밖은 "+n" 알약이 차례로)
const LONG_MS = 480, SLOP = 10;
const EXP_KEY = 'atrium.phoneMap.expanded';
const loadExpanded = () => { try { const a = JSON.parse(localStorage.getItem(EXP_KEY) || '[]'); return new Set(Array.isArray(a) ? a.slice(0, 200) : []); } catch { return new Set(); } };
const saveExpanded = (s) => { try { localStorage.setItem(EXP_KEY, JSON.stringify([...s].slice(-200))); } catch { /* 기억 못 해도 지금 화면은 된다 */ } };
let cache = null;
let scrollAt = 0; // 세션 화면에 갔다 오면 같은 자리
let lastGoId = null; // 마지막으로 알약이 데려간 카드(시험이 읽는다)
const Chev = () => <svg className="mt-ph-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>;
const FolderIcon = () => <svg className="mt-pl-wico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /></svg>;

function Card({ it, b, f, tier, t, unfold, onFold }) {
  const st = ST[tier] || 'ready';
  const done = tier === 'review';
  const cls = `mt-pl-slot st-${st}${f.shell ? ' shell' : ''}${IDLE.has(tier) ? ' idle' : ''}${it.lead ? ' lead' : ''}${it.thin ? ' thin' : ''}`;
  const more = [it.from ? null : f.more, it.away ? t('phoneMap.away', { n: it.away }) : null].filter(Boolean).join(' · ');
  return (
    <div className={cls} data-role="pl-slot" data-id={it.id} data-tier={tier}>
      {it.thin ? (
        // P163: 얇은 줄(하위가 셋 이상인 세션 아래 절전 하위, PC와 같은 판정) = 상태 점 + 이름 + 지난 시간. 누르기·길게 누르기는 카드와 같다
        <button type="button" className="mt-pl-card thin" data-role="pl-card" data-id={it.id} data-session={b.node.sessionId} data-name={b.node.name} data-depth={it.depth} data-kind={it.kind} data-thin="1">
          <span className="r1"><i /><span className="nm" data-role="pl-name">{b.node.name}</span>{f.age ? <span className="ago">{f.age}</span> : null}</span>
        </button>
      ) : <button type="button" className="mt-pl-card" data-role="pl-card" data-id={it.id} data-session={b.node.sessionId} data-name={b.node.name} data-depth={it.depth} data-kind={it.kind}>
        {tier === 'work' && <MissionLight role="pl-light" />}
        {done && <span className="mt-mm-donetag" data-role="pl-done"><DoneMark />{t('doneMark.tag')}</span>}
        <span className="r1">{it.lead ? <span className="mt-pl-lead">{t('mmLine.lead')}</span> : null}<span className="nm" data-role="pl-name">{b.node.name}</span>
          <span className="st" data-role="pl-state">{done ? (f.age ? <span className="ago">{f.age}</span> : null) : <><i />{f.stateText}{f.age ? <span className="ago"> · {f.age}</span> : null}</>}</span></span>
        <span className="r2" data-role="pl-meta">{f.role ? <span className="rl">{f.role}</span> : null}{f.role ? <span className="sep">/</span> : null}<span className="hb">{f.k.mark}</span><span>{f.harness}</span>{f.model ? <><span className="sep">/</span><span>{f.model}</span></> : null}</span>
        <span className="r3" data-role="pl-task">{f.task ? <b>{t(`mmTerr.kind.${f.taskKind}`)}</b> : null}{f.task || t('mmMap3.noTask')}</span>
        {f.err ? <span className="r4" data-role="pl-err">{f.err}</span> : null}
        {it.from ? <span className="xb" data-role="pl-from">{t('phoneMap.from', { name: it.from.name, ws: it.from.ws ? wsName(it.from.ws) : t('mmapGroup.noWorkspace') })}</span> : null}
        {more ? <span className="r5" data-role="pl-more">{more}</span> : null}
      </button>}
      {it.fold > 0 || unfold ? (
        <button type="button" className={`mt-pl-fold${unfold ? ' open' : ''}`} data-action="pl-fold" data-id={it.id} onClick={(e) => { e.stopPropagation(); onFold(it.id); }}>
          {unfold ? t('mmLine.unfold') : t('mmLine.fold', { n: it.fold })}
        </button>
      ) : null}
    </div>
  );
}

export function PhoneLineage({ onBack, onOpen, conn }) {
  const t = useT();
  const sessions = useStore((st) => st.sessions);
  const links = useStore((st) => st.links);
  const thread = useStore((st) => st.thread);
  const loops = useStore((st) => st.loops);
  const workspaces = useStore((st) => st.workspaces);
  const vgroups = useStore((st) => st.groups);
  const [graph, setGraph] = useState(cache);
  const [fail, setFail] = useState(null);
  const [reloadN, setReloadN] = useState(0);
  const [expanded, setExpanded] = useState(loadExpanded);
  const [rails, setRails] = useState(null); // 줄 키 → { w, h, paths, peers, stubs }
  const [peek, setPeek] = useState(null); // 길게 누른 카드 id
  const scrollRef = useRef(null), innerRef = useRef(null);
  const lastGo = useRef({});
  const press = useRef(null); // 길게 누르기 { id, x, y, timer, fired }
  const quiet = useRef(0); // 길게 누른 뒤 이때까지 오는 click은 무시한다(열리지도, 미리 보기 바깥 누르기로 닫히지도 않게)

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => api.call('mission.graph').then((g) => { cache = g; if (alive) { setGraph(g); setFail(null); } }).catch((e) => { if (alive) setFail(e); }), graph ? REFRESH_MS : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [sessions, links, thread, loops, reloadN]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => api.on('relation.updated', () => setReloadN((n) => n + 1)), []);

  const order = useMemo(() => (workspaces || []).map((w) => w.key), [workspaces]);
  const liveOf = (n) => (n && n.sessionId ? sessions.get(n.sessionId) : null);
  const tiers = useMemo(() => new Map(graph ? graph.nodes.filter((n) => n.kind === 'session').map((n) => [n.id, nodeTier(n, liveOf(n))]) : []), [graph, sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const names = useMemo(() => new Map((workspaces || []).map((w) => [w.key, wsName(w.key)])), [workspaces]);
  const lay = useMemo(() => (graph ? lineageLayout(graph, { order, vgroups, tiers, names, routing: false, noFolder: t('mmTerr.noFolder'), expanded }) : null), [graph, order, vgroups, tiers, names, t, expanded]);
  const model = useMemo(() => phoneLineage(lay, { tiers }), [lay, tiers]);
  const roles = useMemo(() => (graph && lay ? roleModel(graph, { tiers, tree: lay.tree }) : new Map()), [graph, lay, tiers]);
  const relOfChild = useMemo(() => { const m = new Map(); if (lay) for (const e of lay.edges) if (e.tree) m.set(e.to, e.rel); return m; }, [lay]);
  const now = Date.now();
  const factsOf = (id) => {
    const b = lay.cards.get(id), n = b.node, m = roles.get(id);
    const pid = m && m.parentId, p = pid ? lay.tree.byId.get(pid) : null;
    const pws = p ? p.workspaceKey || '' : null;
    return cardFacts({ ...n, _rel: relOfChild.get(id) }, liveOf(n), m, tiers.get(id), t, now, { parentName: p ? p.name : null, parentWs: p ? (pws ? wsName(pws) : t('mmapGroup.noWorkspace')) : null, cross: !!p && pws !== (n.workspaceKey || ''), kids: (lay.tree.kids.get(id) || []).length });
  };
  const onFold = useCallback((id) => setExpanded((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); saveExpanded(n); return n; }), []);

  // ---- 레일: 그려진 카드 자리를 재서 워크스페이스마다 긋는다(폭·글꼴·펴기로 높이가 바뀌면 다시) ----
  const measure = useCallback(() => {
    const root = innerRef.current;
    if (!root) return;
    const next = {};
    for (const body of root.querySelectorAll('[data-role=pl-body]')) {
      const B = body.getBoundingClientRect();
      const box = new Map();
      for (const s of body.querySelectorAll('[data-role=pl-slot]')) { const r = s.querySelector('.mt-pl-card').getBoundingClientRect(); box.set(s.dataset.id, { x: r.left - B.left, y: r.top - B.top, w: r.width, h: r.height }); }
      const w = model.folders.flatMap((f) => f.ws).find((x) => String(x.key) === body.dataset.key);
      if (!w) continue;
      const paths = [], stubs = [], peers = [];
      const kidsOf = new Map();
      for (const it of w.items) if (it.up && box.has(it.up) && box.has(it.id)) { if (!kidsOf.has(it.up)) kidsOf.set(it.up, []); kidsOf.get(it.up).push(it); }
      for (const [up, ks] of kidsOf) railPaths(box.get(up), ks.map((k) => box.get(k.id))).forEach((d, i) => paths.push({ id: ks[i].id, d, rel: ks[i].rel, active: ks[i].active || tiers.get(ks[i].id) === 'work' }));
      // 다른 워크스페이스에서 온 세션: 위에서 내려오는 점선 꼬리
      for (const it of w.items) if (it.kind === 'away' && box.has(it.id)) { const b = box.get(it.id), x = b.x - PL.INDENT + 8, my = b.y + b.h / 2; stubs.push({ id: it.id, d: `M${x} ${Math.max(0, b.y - 14)} V${my - 6} Q${x} ${my} ${x + 6} ${my} H${b.x - 2}` }); }
      for (const [a, b] of w.peers) if (box.has(a) && box.has(b)) peers.push({ id: `${a}|${b}`, ...peerPath(box.get(a), box.get(b)) });
      next[w.key] = { w: Math.ceil(B.width), h: Math.ceil(B.height), paths, stubs, peers };
    }
    // 폴더 머리 높이(워크스페이스 머리가 그 아래에 붙는다)
    const fh = Math.max(0, ...[...root.querySelectorAll('[data-role=pl-fhead]')].map((x) => x.getBoundingClientRect().height));
    if (scrollRef.current) scrollRef.current.style.setProperty('--pl-fh', `${Math.round(fh)}px`);
    setRails((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
  }, [model, tiers]);
  useLayoutEffect(() => { measure(); }, [measure]);
  useEffect(() => {
    const el = innerRef.current;
    if (!el || typeof ResizeObserver !== 'function') return undefined;
    let raf = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); });
    ro.observe(el);
    if (scrollRef.current) ro.observe(scrollRef.current);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [measure, !!lay]); // eslint-disable-line react-hooks/exhaustive-deps

  // 돌아오면 같은 스크롤 자리
  useLayoutEffect(() => { const el = scrollRef.current; if (el && lay && scrollAt) el.scrollTop = scrollAt; }, [!!lay]); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = (e) => { scrollAt = e.currentTarget.scrollTop; };

  // ---- 알약: 그 카드로 스크롤하고 반짝인다 ----
  const goTo = useCallback((id) => {
    const root = innerRef.current, el = root && root.querySelector(`[data-role=pl-slot][data-id="${CSS.escape(id)}"]`);
    if (!el) return false;
    lastGoId = id;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    el.classList.remove('blink'); void el.offsetWidth; el.classList.add('blink');
    setTimeout(() => el.classList.remove('blink'), 2200);
    return true;
  }, []);
  const tierOf = (id) => tiers.get(id);
  const goNext = (key, want) => { const id = nextOf(model.order, tierOf, want, lastGo.current[key]); if (id) { lastGo.current[key] = id; goTo(id); } };

  // ---- 누르기: 한 번 = 세션 화면, 길게 = 미리 보기 ----
  const cardOf = (e) => e.target.closest && e.target.closest('[data-role=pl-card]');
  const onTouchStart = (e) => {
    const c = cardOf(e);
    if (!c || e.touches.length !== 1) { if (press.current) clearTimeout(press.current.timer); press.current = null; return; }
    const p = e.touches[0];
    const id = c.dataset.id;
    press.current = { id, x: p.clientX, y: p.clientY, fired: false, timer: setTimeout(() => { if (press.current && press.current.id === id) { press.current.fired = true; quiet.current = Date.now() + 10000; setPeek(id); } }, LONG_MS) };
  };
  const onTouchMove = (e) => { const s = press.current; if (!s || s.fired) return; const p = e.touches[0]; if (Math.hypot(p.clientX - s.x, p.clientY - s.y) > SLOP) { clearTimeout(s.timer); press.current = null; } };
  const onTouchEnd = (e) => { const s = press.current; if (!s) return; clearTimeout(s.timer); press.current = null; if (s.fired) { quiet.current = Date.now() + 700; if (e.cancelable) e.preventDefault(); } };
  const onClick = (e) => {
    const c = cardOf(e);
    if (!c) return;
    if (Date.now() < quiet.current) return; // 길게 누른 뒤 손을 떼며 오는 click
    if (c.dataset.session) onOpen(c.dataset.session);
  };
  const onContext = (e) => { const c = cardOf(e); if (!c) return; e.preventDefault(); setPeek(c.dataset.id); };
  window.__mtPm = { style: 'lineage', model: () => model, goTo, last: () => lastGoId, peek: (id) => setPeek(id), scroller: () => scrollRef.current }; // 시험이 읽는다

  const ids = model.order;
  const attn = ids.filter((id) => tiers.get(id) === 'turn' || tiers.get(id) === 'alert').sort((a, b) => (tiers.get(a) === 'turn' ? 0 : 1) - (tiers.get(b) === 'turn' ? 0 : 1));
  const c = model.counts;
  const pb = peek && lay ? lay.cards.get(peek) : null;
  return (
    <div className="mt-ph-list mt-pm mt-pl" data-role="phone-mission" data-style="lineage">
      <header className="mt-ph-head">
        <button type="button" className="mt-pm-back" data-action="phone-mission-back" aria-label={t('phoneMission.back')} onClick={onBack}><Chev /><span>{t('phone.list')}</span></button>
        <b className="mt-pm-title">{t('phoneMission.title')}</b>
        {conn}
      </header>
      {lay && ids.length > 0 && (
        <div className="mt-pl-pills" data-role="pl-pills">
          {attn.slice(0, ATTN_MAX).map((id) => { const tr = tiers.get(id); return <button key={id} type="button" className={`mt-pl-pill st-${ST[tr]}`} data-role="pl-attn" data-id={id} onClick={() => goTo(id)}><i /><b>{lay.cards.get(id).node.name}</b><span>{t(`mmTerr.chip.${tr}`)}</span></button>; })}
          {attn.length > ATTN_MAX && <button type="button" className="mt-pl-pill st-needs more" data-role="pl-attn-more" onClick={() => goNext('attn', ['turn', 'alert'])}><span>{t('mmTerr.more', { n: attn.length - ATTN_MAX })}</span></button>}
          {!attn.length && <span className="mt-pl-pill quiet" data-role="pl-none"><span>{t('phoneMap.none')}</span></span>}
          {c.work > 0 && <button type="button" className="mt-pl-pill st-working count" data-role="pl-count" data-tier="work" onClick={() => goNext('work', ['work'])}><i /><b>{c.work}</b><span>{t('mmTerr.chip.work')}</span></button>}
          {c.review > 0 && <button type="button" className="mt-pl-pill st-done count" data-role="pl-count" data-tier="review" onClick={() => goNext('review', ['review'])}><i /><b>{c.review}</b><span>{t('mmTerr.chip.review')}</span></button>}
        </div>
      )}
      <div className="mt-pl-scroll" data-role="pm-stage" ref={scrollRef} onScroll={onScroll} onClick={onClick} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} onContextMenu={onContext}>
        {!lay && !fail && <div className="mt-ph-empty">{t('common.loading')}</div>}
        {!lay && fail && <div className="mt-ph-empty" data-role="pm-fail">{t('mission.fail', { error: errText(fail) })}</div>}
        {lay && ids.length === 0 && <div className="mt-ph-empty" data-role="pm-empty">{t('phone.empty')}</div>}
        {lay && ids.length > 0 && (
          <div className="mt-pl-inner" ref={innerRef}>
            {model.folders.map((f) => (
              <section key={`f:${f.id || 'none'}`} className={`mt-pl-folder${f.loose ? ' loose' : ''}`} data-role="pl-folder" data-id={f.id || 'none'}>
                <div className="mt-pl-fh" data-role="pl-fhead">
                  <span className="fn" data-role="pl-fname">{f.name}</span>
                  <span className="fs">{t('mmTerr.workspaces', { n: f.nWs })} · {t('mmTerr.sessions', { n: f.sessions })}</span>
                  <span className="fbar" aria-hidden="true">{f.bar.map((x) => <i key={x.tier} className={`st-${ST[x.tier]}`} style={{ flexGrow: x.n }} />)}</span>
                </div>
                {f.ws.map((w) => {
                  const r = rails && rails[w.key];
                  let soloSeen = false;
                  return (
                    <section key={`w:${w.key || '-'}`} className="mt-pl-ws" data-role="pl-ws" data-key={w.key}>
                      <div className="mt-pl-wh" data-role="pl-whead">
                        <span className="wsn"><FolderIcon /><span data-role="pl-wname">{w.key ? w.name : t('mmapGroup.noWorkspace')}</span></span>
                        <span className="wsc">{w.chips.map((x) => <span key={x.tier} className={`st-${ST[x.tier]}`} data-tier={x.tier}><i /><b>{x.n}</b> {t(`mmTerr.chip.${x.tier}`)}</span>)}</span>
                      </div>
                      <div className="mt-pl-body" data-role="pl-body" data-key={w.key}>
                        {r ? (
                          <svg className="mt-pl-rails" width={r.w} height={r.h} viewBox={`0 0 ${r.w} ${r.h}`} aria-hidden="true">
                            {r.paths.map((p) => <path key={`r:${p.id}`} className={`mt-pl-rail k-${p.rel}${p.active ? ' active' : ''}`} data-role="pl-rail" data-to={p.id} data-rel={p.rel} d={p.d} />)}
                            {r.stubs.map((p) => <path key={`x:${p.id}`} className="mt-pl-rail k-cross" data-role="pl-rail" data-to={p.id} data-rel="cross" d={p.d} />)}
                            {r.peers.map((p) => <g key={`p:${p.id}`} className="mt-pl-peer" data-role="pl-peer" data-pair={p.id}><path d={p.d} />{p.ends.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" />)}</g>)}
                          </svg>
                        ) : null}
                        {w.items.map((it) => {
                          const b = lay.cards.get(it.id);
                          const divider = it.kind === 'solo' && !soloSeen;
                          if (it.kind === 'solo') soloSeen = true;
                          return [
                            divider ? <div key={`s:${it.id}`} className="mt-pl-solo" data-role="pl-solo-head">{t('mmLine.colSolo')}</div> : null,
                            <div key={it.id} className={`mt-pl-item${it.thin ? ' thin' : ''}`} data-role="pl-item" data-id={it.id} data-depth={it.depth} style={{ paddingLeft: it.ind * PL.INDENT }}>
                              <Card it={it} b={b} f={factsOf(it.id)} tier={tiers.get(it.id)} t={t} onFold={onFold} unfold={it.depth >= LINE.FOLD && expanded.has(it.id) && (lay.tree.kids.get(it.id) || []).length > 0} />
                            </div>,
                          ];
                        })}
                      </div>
                    </section>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </div>
      {pb && (() => {
        const row = lay.rows.find((x) => x.key === pb.ws), band = row && lay.bands.find((x) => (x.id || null) === (row.band || null));
        return (
          <div className="mt-pl-peekwrap" data-role="pl-peek" onClick={(e) => { if (e.target === e.currentTarget && Date.now() >= quiet.current) setPeek(null); }}>
            <div className="mt-pl-peeksheet">
              <Peek pv={{ id: peek, x: 0, y: 0 }} b={pb} f={factsOf(peek)} live={liveOf(pb.node)} tier={tiers.get(peek)} t={t} now={now} folder={[band && band.name, row && row.name].filter(Boolean).join(' / ')} />
              <div className="mt-pl-peekact">
                <button type="button" data-action="pl-peek-close" onClick={() => setPeek(null)}>{t('common.close')}</button>
                {pb.node.sessionId ? <button type="button" className="go" data-action="pl-peek-open" onClick={() => { const sid = pb.node.sessionId; setPeek(null); onOpen(sid); }}>{t('phoneMap.open')}</button> : null}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
