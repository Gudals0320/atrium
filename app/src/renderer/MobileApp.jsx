// P353: 휴대폰 전용 간소 페이지. 옛 휴대폰 화면(Phone.jsx: 세션 맵 캔버스, xterm 터미널)을 바꾼다. 무거운 모듈(캔버스, xterm, 세션 맵)은 들이지 않는다.
// - 아래 탭: 홈(수, 응답 필요 카드와 번호 단추, 할 일 카드, 작업 완료), 세션(찾기, 고정, 워크스페이스 묶음, 잠든 세션 접기), 맵(P356: 판 세션 맵과 같은 모양, MobileMap.jsx를 늦게 읽는다)
// - 세션 화면: MobileSession.jsx(P355: 답 | 터미널 보기, 키 줄, 입력)
// - 자료는 mobile-store.js(phone.subscribe의 작은 줄과 이벤트). 세션 화면은 phone.session을 열 때와 그 줄이 바뀔 때 다시 받는다
// - 글자 크기는 옛 휴대폰 화면의 값(mt.phoneTermScale)을 페이지 전체에 쓴다. 키보드가 열리면 보이는 높이(visualViewport)에 맞춘다
// - 알림을 누르면 그 세션 화면을 바로 연다(push.js setOpenHandler, ?open=)
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, toast } from './store.js';
import { useMobile, getMobile, call, setCardsLocal, noteFail } from './mobile-store.js';
import { useT, errText } from './lib/i18n.js';
import { STATE_LABEL, shellStateText } from './lib/labels.js';
import { homeOf, listOf, toneOf, needsYou, isDone, PINS_KEY, TAB_KEY, OPEN_GROUPS_KEY, togglePin, readList, choiceButtons, shortChoice, uiFactor, pageBox, layScreen, OVERLAY_CHOICE_CHARS } from './lib/mobile.js';
import { kbOpenOf } from './lib/phone.js';
import { SessionScreen } from './MobileSession.jsx'; // P355: 세션 화면
import { noteLayout } from './lib/phone-telemetry.js'; // P355: 배치 값 한 번(아래 잘림을 숫자로)
import { activeCards, laterCards, snoozeTimes, kindWord, cardPlace, whenText } from './lib/decisions.js';
import { clampPhoneScale, PHONE_SCALE_DEFAULT } from './lib/scale.js';
import { isStandalone } from './lib/pwa.js';
import { useConnSteady } from './steady.js';
import { PushButton, PushSheet } from './PhonePush.jsx';
import { setOpenHandler, launchOpen, launchCard, clearLaunchOpen } from './push.js';
import { markInteracted } from './touch.js';
import { cardFacts, DoneMark, ST } from './MapCard.jsx'; // P356: 줄·카드 얼굴은 판 세션 맵 카드와 같은 함수
import { nodeTier } from './lib/mission-model.js';
import { liveFromRow, todoCounts } from './lib/mobile-map.js';
import { usd, dayShort, phoneRows, hasCredits } from './lib/api-credits.js'; // P361: 홈의 API 크레딧 칸
import './phone.css';
import './mobile.css';

const store = () => { try { return localStorage; } catch { return null; } };
const SCALE_KEY = 'mt.phoneTermScale'; // 옛 휴대폰 화면과 같은 값
const readScaleNow = () => { try { return clampPhoneScale(store().getItem(SCALE_KEY)); } catch { return PHONE_SCALE_DEFAULT; } };
const I = {
  home: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  tree: 'M6 4v14a2 2 0 0 0 2 2h3M6 9h5M6 14h5M13 6.5h7v5h-7zM13 15.5h7v5h-7z',
  plus: 'M12 5v14M5 12h14', star: 'm12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z',
  chev: 'm6 9 6 6 6-6', back: 'm15 18-6-6 6-6', right: 'm9 18 6-6-6-6', bolt: 'M13 2 4 14h7l-1 8 9-12h-7z', up: 'M12 19V5M5 12l7-7 7 7',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14', x: 'M6 6l12 12M18 6 6 18',
};
const Ic = ({ d, s }) => <svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={s ? { width: s, height: s } : undefined}><path d={d} /></svg>;
function useNow(ms) { const [n, set] = useState(Date.now()); useEffect(() => { const id = setInterval(() => set(Date.now()), ms); return () => clearInterval(id); }, [ms]); return n; }
function ago(t, at, now) {
  if (!at) return '';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return t('mobile.now');
  if (s < 3600) return t('mobile.min', { n: Math.round(s / 60) });
  if (s < 86400) return t('mobile.hour', { n: Math.round(s / 3600) });
  return t('mobile.day', { n: Math.round(s / 86400) });
}
const wsNameOf = (ws, key) => { const w = ws.find((x) => x.key === key); return w ? w.name : key ? String(key).split('/').filter(Boolean).slice(-1)[0] : ''; };
function stateText(t, s) { if (s.kind === 'shell' && s.state !== 'sleeping' && s.state !== 'exited') return shellStateText(s); if (isDone(s)) return t('mobile.done'); return STATE_LABEL[s.state] || s.state; }
function lineText(t, s) {
  const l = s.line || {};
  if (l.kind === 'ask') return l.key === 'trust' ? t('phone.ask_trust') : l.key === 'permission' ? `${t('phone.ask_permission', { tool: l.tool || '' })}: ${l.text}` : l.text || t(`phone.ask_${l.key || 'screen'}`);
  if (l.kind === 'shell') return l.text ? '$ ' + l.text : '$';
  return l.text || '';
}

// P356: 세션 얼굴(홈·세션 목록의 줄과 카드). 판 세션 맵 카드와 같은 등급(nodeTier)·사실(cardFacts)·상태 색(st-*)·하네스 표시를 쓴다
const IDLE_TIERS = new Set(['rest', 'sleep', 'done']);
function faceOf(t, s, now) {
  const live = liveFromRow(s);
  const n = { name: s.name, agentKind: s.kind, state: s.state };
  const tier = nodeTier(n, live);
  return { tier, st: ST[tier] || 'ready', f: cardFacts(n, live, null, tier, t, now), idle: IDLE_TIERS.has(tier) };
}
const TodoIcon = () => <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 3h.6M4.4 3H10M2 6h.6M4.4 6H10M2 9h.6M4.4 9H10" /></svg>;
// 첫 줄: 이름 · 상태(점과 글, 상태 색) · 지난 시간(판 세션 맵 카드 c1과 같다)
function FaceTop({ s, face, extra = null }) {
  const { f, tier } = face;
  const done = tier === 'review';
  return <span className="c1"><span className="cname" data-role="mp-name">{s.name}</span>{extra}<span className="cst" data-role="mp-state">{done ? (f.age ? <span className="cago">{f.age}</span> : null) : <><i />{f.stateText}{f.age ? <span className="cago"> · {f.age}</span> : null}</>}</span></span>;
}
// 둘째 줄: 하네스 표 · 하네스 · 모델(판 세션 맵 카드 c2와 같다)
const FaceMeta = ({ face, children = null }) => <span className="c2" data-role="mp-meta"><span className="hb">{face.f.k.mark}</span><span>{face.f.harness}</span>{face.f.api ? <span className="mt-api-tag" data-role="mp-api">API</span> : null}{face.f.sdk ? <span className="mt-api-tag mt-sdk-tag" data-role="mp-sdk">SDK</span> : null}{face.f.model ? <><span className="dotsep">/</span><span>{face.f.model}</span></> : null}{children}</span>;
// 오른쪽 위 꼬리표 무리: 할 일 배지 위, 작업 완료 꼬리표(판 세션 맵 카드와 같은 차례·색)
function FaceTags({ t, face, todo = 0 }) {
  const done = face.tier === 'review';
  if (!todo && !done) return null;
  return <span className="mt-mp-tags" data-role="mp-tags">{todo ? <span className="mt-mp-todotag" data-role="mp-todo-badge" data-count={todo}><TodoIcon />{t('mapTodo.badge')}{todo > 1 ? <b>{todo}</b> : null}</span> : null}{done ? <span className="mt-mp-donetag" data-role="mp-done"><DoneMark />{t('doneMark.tag')}</span> : null}</span>;
}
const faceCls = (face) => ` st-${face.st}${face.f.shell ? ' shell' : ''}${face.idle ? ' idle' : ''}`;

// 연결 알약(짧은 끊김에는 바꾸지 않는다)
function Conn() {
  const t = useT();
  const { conn: raw, grace } = useConnSteady();
  const [rtt, setRtt] = useState(api.rtt);
  useEffect(() => api.on('$rtt', (r) => setRtt(r.rtt)), []);
  const phase = grace || raw.phase === 'open' ? 'open' : raw.phase === 'blocked' ? 'blocked' : 'reconnecting';
  const text = phase === 'open' ? (rtt != null ? t('phone.connRtt', { ms: rtt }) : t('phone.connOpen')) : phase === 'blocked' ? t('phone.connBlocked') : t('phone.connRetry');
  return <button type="button" className="mt-mp-conn" data-role="mp-conn" data-phase={phase} onClick={() => { if (phase !== 'open') api.wake(); }}><i />{text}</button>;
}

// ---------- 뿌리 ----------
export function MobileApp() {
  const t = useT();
  const loaded = useMobile((m) => m.loaded);
  const rows = useMobile((m) => m.rows);
  const toasts = useStore((st) => st.toasts);
  const rootRef = useRef(null);
  const [tab, setTabRaw] = useState(() => { try { return store().getItem(TAB_KEY) || 'home'; } catch { return 'home'; } });
  const setTab = (v) => { setTabRaw(v); try { store().setItem(TAB_KEY, v); } catch {} };
  const [filter, setFilter] = useState(null);
  const [open, setOpen] = useState(() => (history.state && history.state.mtMobile) || null);
  const [spawn, setSpawn] = useState(false);
  const [push, setPush] = useState(false);
  const [focus, setFocus] = useState(null); // P357: 결정 카드 알림을 눌러 갈 카드 { id, n }
  const [scale, setScale] = useState(readScaleNow);
  const fs = uiFactor(scale);

  // 글자 크기(페이지 전체)
  useEffect(() => { document.documentElement.style.setProperty('--mp-fs', String(fs)); document.documentElement.style.setProperty('--mp-scale', String(scale / PHONE_SCALE_DEFAULT)); }, [fs, scale]);
  const bump = (d) => setScale((v) => { const n = clampPhoneScale(Math.round((v + d) * 100) / 100); try { store().setItem(SCALE_KEY, String(n)); } catch {} return n; });
  // 가상 키보드: 보이는 높이에 맞춘다(입력 줄과 빠른 키가 키보드 위에 남는다)
  // P358: 홈 화면 앱은 키보드가 닫혀 있으면 늘 화면 높이(pageBox). html·body·#root도 같은 높이로 맞춘다(문서 높이 793에 걸려 아래가 잘리지 않게).
  //   초점이 들고 날 때(키보드 열고 닫음)와 세션 화면이 열고 닫힐 때도 다시 잰다(iOS가 resize를 늦게 주거나 주지 않는다)
  useEffect(() => {
    const vv = window.visualViewport; const el = rootRef.current; const tall = { w: 0, h: 0 };
    const de = document.documentElement;
    const fit = () => {
      const vh = vv && vv.height > 0 ? vv.height : window.innerHeight;
      if (tall.w !== window.innerWidth) { tall.w = window.innerWidth; tall.h = 0; }
      tall.h = Math.max(tall.h, vh, window.innerHeight);
      const b = pageBox({ vv, innerHeight: window.innerHeight, innerWidth: window.innerWidth, screenW: window.screen && window.screen.width, screenH: window.screen && window.screen.height, standalone: isStandalone(), tallest: tall.h });
      if (el) { el.style.height = b.height + 'px'; el.style.transform = b.top ? 'translateY(' + b.top + 'px)' : ''; }
      de.style.setProperty('--mt-page-h', (b.height + (b.top || 0)) + 'px');
      // P355: 홈 화면 앱이 창 높이를 짧게 주면 html·body도 화면 높이까지(옛 휴대폰 화면 useScreenFix, phone.css html.mt-tall)
      if (b.tall || b.full) { de.style.setProperty('--mt-screen-h', b.height + 'px'); de.classList.add('mt-tall'); } else de.classList.remove('mt-tall');
      // P358: 홈 화면 앱에서 키보드를 닫은 뒤 iOS가 남긴 스크롤(보이는 위치)을 0으로 되돌린다(되돌아오면 scroll 이벤트로 다시 잰다)
      if (b.full && b.top > 0) { try { window.scrollTo(0, 0); } catch {} }
      de.classList.toggle('mt-kb-open', b.kb === true || kbOpenOf({ vvHeight: vh, innerHeight: window.innerHeight, tallest: tall.h }));
    };
    fit();
    const timers = [];
    const later = () => { for (const ms of [60, 350, 900]) timers.push(setTimeout(fit, ms)); if (timers.length > 30) timers.splice(0, timers.length - 30).forEach(clearTimeout); };
    if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
    window.addEventListener('resize', fit);
    document.addEventListener('focusin', later); document.addEventListener('focusout', later);
    window.__mtMobileFit = later; // 세션 화면이 열고 닫힐 때 부른다
    de.classList.add('mt-mp-on');
    return () => { timers.forEach(clearTimeout); if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); } window.removeEventListener('resize', fit); document.removeEventListener('focusin', later); document.removeEventListener('focusout', later); delete window.__mtMobileFit; de.classList.remove('mt-mp-on', 'mt-kb-open', 'mt-tall'); };
  }, []);
  // 세션 화면은 history에 둔다(뒤로 가기 = 목록)
  useEffect(() => { const onPop = (e) => setOpen((e.state && e.state.mtMobile) || null); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  const go = (id, { replace = false } = {}) => {
    if (!id) { if (history.state && history.state.mtMobile) history.back(); else setOpen(null); return; }
    const next = { mtMobile: id };
    if (replace || (history.state && history.state.mtMobile)) history.replaceState(next, ''); else history.pushState(next, '');
    setOpen(id);
  };
  const goRef = useRef(go); goRef.current = go;
  // 알림을 누르면 그 세션으로(열린 창: 서비스 워커 메시지, 새로 연 창: ?open=)
  // P357: 결정 카드 알림(카드 번호가 있으면)은 홈의 할 일에서 그 카드로 간다(세션 화면이 아니다)
  const toCard = (card) => { goRef.current(null); setTabRaw('home'); setFocus({ id: card, n: Date.now() }); };
  useEffect(() => setOpenHandler((id, o) => { if (o && o.card) toCard(o.card); else if (getMobile().rows.has(id)) goRef.current(id); }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const launch = useRef(launchOpen());
  const launchC = useRef(launchCard());
  useEffect(() => { const id = launch.current; const card = launchC.current; if ((!id && !card) || !loaded) return; launch.current = null; launchC.current = null; clearLaunchOpen(); if (card) toCard(card); else if (rows.has(id)) goRef.current(id); }, [loaded, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  // 연 세션이 사라지면 목록으로
  useEffect(() => { if (open && loaded && !rows.has(open)) { setOpen(null); try { history.replaceState(null, ''); } catch {} } }, [open, loaded, rows]);
  window.__mtMobile = { open: (id) => go(id), tab: setTab, state: getMobile, toCard: (card) => toCard(card) }; // P357: 시험이 알림 누르기를 흉내 낸다

  const home = useMemo(() => homeOf(rows), [rows]);
  const s = open ? rows.get(open) : null;
  // P355·P358: 자리가 잡힌 뒤 배치 값을 화면마다 한 번 남긴다(홈·세션 목록·맵·세션 화면, 키보드 열림). 창·보이는 높이, 화면, 안전 영역, 뿌리·아래 줄의 아래 끝, html·body 높이
  const layView = loaded ? (s ? 'session' : tab) : null;
  useEffect(() => { if (!layView) return undefined; if (window.__mtMobileFit) window.__mtMobileFit(); const tm = setTimeout(() => noteLayout(layScreen({ view: layView })), 2500); return () => clearTimeout(tm); }, [layView]);
  useEffect(() => {
    const de = document.documentElement; let tm = 0;
    const mo = new MutationObserver(() => { clearTimeout(tm); if (de.classList.contains('mt-kb-open')) tm = setTimeout(() => { if (de.classList.contains('mt-kb-open')) noteLayout('kb'); }, 800); });
    mo.observe(de, { attributes: true, attributeFilter: ['class'] });
    return () => { clearTimeout(tm); mo.disconnect(); };
  }, []);
  const toastsView = <div className="mt-mp-toasts">{toasts.map((x) => <div key={x.id} className={'mt-mp-toast ' + x.kind}>{x.text}</div>)}</div>;
  return (
    <div className="mt-mp" ref={rootRef} data-role="mp" data-tab={tab} data-view={s ? 'session' : tab}>
      {s ? <SessionScreen key={s.sessionId} s={s} onBack={() => go(null)} onGo={(id) => go(id, { replace: true })} needIds={home.needs.map((x) => x.sessionId)} bump={bump} scale={scale} />
        : (
          <>
            <header className="mt-mp-head">
              <h1>{tab === 'home' ? 'Atrium' : t(`mobile.tab_${tab}`)}</h1>
              <span className="mt-mp-sp" />
              <Conn />
              <PushButton onClick={() => setPush(true)} />
              <button type="button" className="mt-mp-ib" data-action="mp-new" aria-label={t('phone.newSession')} title={t('phone.newSession')} onClick={() => setSpawn(true)}><Ic d={I.plus} /></button>
            </header>
            <div className="mt-mp-body" data-role={'mp-' + tab}>
              {!loaded ? <div className="mt-mp-empty">{t('app.connecting')}</div>
                : tab === 'home' ? <Home home={home} onOpen={go} onTab={(k, f) => { setFilter(f || null); setTab(k); }} focus={focus} />
                : tab === 'sessions' ? <Sessions filter={filter} setFilter={setFilter} onOpen={go} />
                : <MapTab onOpen={go} />}
              {loaded && <span data-role="mp-ready" hidden />}
            </div>
            <nav className="mt-mp-tabs" role="tablist">
              {[['home', I.home], ['sessions', I.list], ['map', I.tree]].map(([k, d]) => (
                <button key={k} type="button" role="tab" className="mt-mp-tab" data-action={'mp-tab-' + k} aria-selected={tab === k} onClick={() => { if (k === 'sessions') setFilter(null); setTab(k); }}>
                  <Ic d={d} /><span>{t(`mobile.tab_${k}`)}</span>{k === 'home' && home.counts.need > 0 && <span className="badge" data-role="mp-need-badge">{home.counts.need}</span>}
                </button>
              ))}
            </nav>
          </>
        )}
      {spawn && <SpawnSheet onClose={() => setSpawn(false)} onStarted={(id) => { setSpawn(false); go(id); }} />}
      {push && <PushSheet onClose={() => setPush(false)} />}
      {api.conn && api.conn.phase === 'blocked' && <div className="mt-mp-cover-all" data-role="mp-blocked"><p>{t('phone.connBlocked')}</p></div>}
      {toastsView}
    </div>
  );
}

// ---------- 홈 ----------
function Home({ home, onOpen, onTab, focus = null }) {
  const t = useT();
  const cards = useMobile((m) => m.cards);
  const ws = useMobile((m) => m.workspaces);
  const now = useNow(30000);
  const active = activeCards(cards);
  const later = laterCards(cards);
  const [allRead, setAllRead] = useState(false);
  const [laterOpen, setLaterOpen] = useState(false);
  // P357: 알림을 눌러 온 카드. 지금 목록이면 그 카드를, 나중이면 나중 묶음을 펼쳐 보이고 잠깐 강조한다. 없으면 한 줄
  const [hot, setHot] = useState(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!focus) return undefined;
    const where = cardPlace(cards, focus.id);
    if (where === 'gone') { setGone(true); setHot(null); const tm = setTimeout(() => setGone(false), 6000); return () => clearTimeout(tm); }
    setGone(false); if (where === 'later') setLaterOpen(true); setHot(focus.id);
    const raf = requestAnimationFrame(() => { const el = document.querySelector(`[data-role="mp-todo"][data-id="${focus.id}"]`); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' }); });
    const tm = setTimeout(() => setHot(null), 2600);
    return () => { cancelAnimationFrame(raf); clearTimeout(tm); };
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const todo = useMemo(() => todoCounts(cards), [cards]);
  return (
    <div data-role="mp-home">
      <div className="mt-mp-tiles">
        {[['need', home.counts.need, 'sessions', 'need'], ['work', home.counts.work, 'sessions', 'work'], ['done', home.counts.done, 'sessions', 'done']].map(([k, n, tab, f]) => (
          <button key={k} type="button" className="mt-mp-tile" data-k={k} data-role="mp-tile" onClick={() => onTab(tab, f)}><b>{n}</b><span>{t(`mobile.count_${k}`)}</span></button>
        ))}
      </div>
      {home.needs.length > 0 && <div className="mt-mp-sec need"><h2>{t('mobile.count_need')}</h2><b>{home.needs.length}</b></div>}
      {home.needs.map((s) => <NeedCard key={s.sessionId} s={s} ws={ws} now={now} onOpen={onOpen} todo={todo.get(s.sessionId) || 0} />)}
      <div className="mt-mp-sec"><h2>{t('mobile.todo')}</h2><b>{active.length}</b></div>
      {gone && <div className="mt-mp-gone" data-role="mp-card-gone" role="status">{t('mobile.cardGone')}</div>}
      {!active.length && <div className="mt-mp-empty small">{t('mobile.noTodo')}</div>}
      {active.map((d) => <TodoCard key={d.id} d={d} now={now} cards={cards} hot={hot === d.id} />)}
      {later.length > 0 && (
        <div className={'mt-mp-later' + (laterOpen ? ' open' : '')} data-role="mp-later" data-count={later.length}>
          <button type="button" className="mt-mp-later-head" data-action="mp-later-toggle" aria-expanded={laterOpen} onClick={() => setLaterOpen((v) => !v)}><span>{laterOpen ? '▾' : '▸'}</span>{t('mobile.later', { n: later.length })}</button>
          {laterOpen && later.map((d) => <TodoCard key={d.id} d={d} now={now} cards={cards} hot={hot === d.id} later />)}
        </div>
      )}
      {home.done.length > 0 && (
        <>
          <div className="mt-mp-sec"><h2>{t('mobile.done')}</h2><b>{home.done.length}</b><span className="mt-mp-sp" /><button type="button" data-action="mp-read-all" disabled={allRead} onClick={() => { setAllRead(true); Promise.all(home.done.map((s) => call('session.markSeen', { session: s.sessionId }).catch(() => 0))).finally(() => setAllRead(false)); }}>{t('mobile.readAll')}</button></div>
          {home.done.slice(0, 8).map((s) => <Row key={s.sessionId} s={s} ws={ws} now={now} onOpen={onOpen} showWs todo={todo.get(s.sessionId) || 0} />)}
        </>
      )}
      <PhoneCredits now={now} />
    </div>
  );
}

// P361: 홈 아래 API 크레딧 칸(합계와 지급 줄). 장부도 지출도 없으면 그리지 않는다. 누르면 펼친다(처음은 합계 한 줄)
function PhoneCredits({ now }) {
  const t = useT();
  const c = useMobile((m) => m.credits);
  const [open, setOpen] = useState(false);
  if (!hasCredits(c)) return null;
  const tot = c.totals;
  const rows = phoneRows(c, now);
  return (
    <div className={'mt-mp-credits' + (open ? ' open' : '')} data-role="mp-credits" data-basis={c.basis}>
      <button type="button" className="mt-mp-later-head" data-action="mp-credits-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{open ? '▾' : '▸'}</span>{t('apiCredits.head')}
        {tot ? <b className="mono" data-role="mp-credits-usable">{usd(tot.usable)}</b> : null}
        <span className={`mt-cr-basis ${c.basis}`}>{c.basis === 'official' ? t('apiCredits.official') : t('apiCredits.estimate')}</span>
      </button>
      {open && <div className="mt-mp-credits-body">
        {tot ? <div className="mt-cr-totals"><span>{t('apiCredits.planShort')} {usd(tot.plan)}</span><span>{t('apiCredits.promoShort')} {usd(tot.promo)}</span>{tot.purchased != null ? <span className={tot.purchased < 0 ? 'mt-cr-purchased due' : 'mt-cr-purchased'}>{t('apiCredits.purchasedShort')} {usd(tot.purchased)}</span> : null}</div> : <div className="dim">{t('apiCredits.noLedgerPhone')}</div>}
        {rows.map((g) => (
          <div key={g.id} className={`mt-cr-grant lv-${g.level}`} data-role="mp-credits-grant">
            <div className="mt-cr-grant-top"><span className="mt-cr-name">{g.name}</span><span className="mt-cr-amt mono">{usd(g.left)} / {usd(g.total)}</span></div>
            <span className="mt-cr-bar" aria-hidden="true"><span style={{ width: `${g.pct}%` }} /></span>
            <div className="mt-cr-grant-sub dim"><span className={g.level === 'warn' ? 'mt-cr-exp soon' : 'mt-cr-exp'}>{g.when ? t('apiCredits.expires', { when: g.when }) : ''} ({t(g.left2.key, g.left2.vars)})</span></div>
          </div>
        ))}
        {c.nextGrant ? <div className="dim">{t('apiCredits.next', { day: dayShort(c.nextGrant.date), amt: c.nextGrant.amount != null ? usd(c.nextGrant.amount) : '?' })}</div> : null}
        <div className="mt-cr-spend"><span>{t('apiCredits.spendToday', { amt: usd(c.spend ? c.spend.today : 0) })}</span><span>{t('apiCredits.spendMonth', { amt: usd(c.spend ? c.spend.month : 0) })}</span></div>
      </div>}
    </div>
  );
}

// 응답 필요 카드: 요청 보기의 번호 단추, Esc, 열기. 누른 키는 session.keys로 그 패널에(어느 하네스든 같다)
function NeedCard({ s, ws, now, onOpen, todo = 0 }) {
  const t = useT();
  const face = faceOf(t, s, now);
  const [busy, setBusy] = useState(false);
  const press = (k) => { if (busy) return; setBusy(true); markInteracted(s.sessionId); call('session.keys', { session: s.sessionId, keys: [k] }, { kind: 'keys' }).catch((e) => { if (e.code !== 'disconnected') toast(t('phoneKeys.failed', { error: errText(e) }), 'error'); }).finally(() => setTimeout(() => setBusy(false), 400)); };
  const a = s.ask;
  const btns = s.state === 'trust_wait' ? [] : choiceButtons(a);
  const title = s.state === 'trust_wait' ? t('phone.ask_trust') : a && a.kind === 'permission' ? t('phone.ask_permission', { tool: a.tool || '' }) : a && a.question ? a.question : t(`phone.ask_${(s.line && s.line.key) || 'screen'}`);
  const sub = s.line && s.line.text;
  return (
    <div className={'mt-mp-card need mt-mp-face' + faceCls(face)} data-role="mp-need" data-name={s.name} data-tier={face.tier}>
      <FaceTags t={t} face={face} todo={todo} />
      <div className="mt-mp-face-in"><FaceTop s={s} face={face} /><FaceMeta face={face}><span className="dotsep">/</span><span>{wsNameOf(ws, s.workspaceKey)}</span></FaceMeta></div>
      <div className="mt-mp-q">{title}</div>
      {sub && <div className="mt-mp-sub">{sub}</div>}
      <div className="mt-mp-acts">
        {btns.map((b, i) => <button key={b.key} type="button" className={'mt-mp-btn' + (i === 0 ? ' attn' : '')} data-mp-choice={b.key} title={b.label} disabled={busy} onClick={() => press(b.key)}>{b.key}{b.short ? ' ' + b.short : ''}</button>)}
        {s.state !== 'trust_wait' && <button type="button" className="mt-mp-btn ghost" data-mp-choice="esc" disabled={busy} onClick={() => press('esc')}>Esc</button>}
        <span className="mt-mp-sp" />
        <button type="button" className="mt-mp-btn ghost" data-action="mp-need-open" onClick={() => onOpen(s.sessionId)}>{t('common.open')} ›</button>
      </div>
    </div>
  );
}

// 할 일 카드: 결정(보기·답 쓰기), 실행(했음), 확인(됐다·안 됐다), 미루기(한 시간, 내일 아침)
// P357: 종류 꼬리표는 PC와 같은 말(userTasks.kind), 자동 카드는 작은 "자동". hot = 알림을 눌러 온 카드(잠깐 강조). later = 나중 묶음(꺼내기만)
export function TodoCard({ d, now, cards, hot = false, later = false, compact = false }) { // P357: 세션 화면(MobileSession.jsx)도 쓴다. P358: compact = 세션 화면의 겹친 카드(보기 글을 짧게, 전체 글은 title)
  const t = useT();
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [snz, setSnz] = useState(false);
  const run = (method, params) => { if (busy) return; setBusy(true); call(method, { id: d.id, ...params }, { kind: 'todo' }).then(() => { setCardsLocal(cards.filter((x) => x.id !== d.id || method === 'decision.snooze' ? x.id !== d.id : false)); }).catch((e) => toast(t('mobile.todoFailed', { error: errText(e) }), 'error')).finally(() => setBusy(false)); };
  const st = snoozeTimes(now);
  const kindKey = d.kind === 'decide' ? 'decide' : d.kind === 'check' ? 'check' : 'do';
  const top = <div className="mt-mp-todo-line"><span className="nm">@{d.name}</span><span className={`kind k-${d.kind}`} data-k={d.kind} data-role="mp-todo-kind">{t(kindWord(d.kind))}</span>{d.auto && <span className="auto" data-role="mp-todo-auto">{t('autoDecisions.tag')}</span>}<span className="when">{ago(t, d.createdAt, now)}</span></div>;
  const q = d.kind === 'guard' ? t('guard.cardQ') : d.question;
  if (later) return (
    <div className={`mt-mp-card mt-mp-todo k-${d.kind} later` + (hot ? ' hot' : '')} data-role="mp-todo" data-id={d.id} data-kind={d.kind} data-later="1" data-hot={hot ? '1' : undefined}>
      {top}
      <div className="mt-mp-q">{q}</div>
      <div className="mt-mp-why">{d.cond ? t('userTasks.cond', { text: d.cond }) : d.wakeAt ? t('userTasks.at', { when: whenText(d.wakeAt, now) }) : null}</div>
      <div className="mt-mp-acts"><button type="button" className="mt-mp-btn" disabled={busy} data-action="mp-later-raise" onClick={() => { if (busy) return; setBusy(true); call('decision.raise', { id: d.id }, { kind: 'todo' }).catch((e) => toast(t('mobile.todoFailed', { error: errText(e) }), 'error')).finally(() => setBusy(false)); }}>{t('userTasks.raise')}</button></div>
    </div>
  );
  return (
    <div className={`mt-mp-card mt-mp-todo k-${d.kind}` + (hot ? ' hot' : '')} data-role="mp-todo" data-id={d.id} data-kind={d.kind} data-hot={hot ? '1' : undefined}>
      {top}
      <div className="mt-mp-q">{q}</div>
      {d.why && <div className="mt-mp-why">{d.why}</div>}
      <div className="mt-mp-acts">
        {kindKey === 'decide' && (d.options || []).map((o, i) => <button key={o} type="button" className={'mt-mp-btn' + (i === 0 ? ' pri' : '')} disabled={busy} data-action="mp-todo-answer" title={compact ? o : undefined} onClick={() => run('decision.answer', { answer: o })}>{compact ? shortChoice(o, OVERLAY_CHOICE_CHARS) : o}</button>)}
        {kindKey === 'do' && d.kind !== 'guard' && <button type="button" className="mt-mp-btn pri" disabled={busy} data-action="mp-todo-done" onClick={() => run('decision.done', {})}>{t('mobile.did')}</button>}
        {kindKey === 'check' && <><button type="button" className="mt-mp-btn pri" disabled={busy} onClick={() => run('decision.check', { ok: true })}>{t('mobile.checkOk')}</button><button type="button" className="mt-mp-btn" disabled={busy} onClick={() => run('decision.check', { ok: false })}>{t('mobile.checkFail')}</button></>}
        <span className="mt-mp-sp" />
        {kindKey === 'decide' && <button type="button" className="mt-mp-btn ghost" onClick={() => setWriting((v) => !v)}>{t('mobile.writeAnswer')}</button>}
        <button type="button" className="mt-mp-btn ghost" data-action="mp-todo-snooze" onClick={() => setSnz((v) => !v)}>{t('mobile.snooze')}</button>
      </div>
      {snz && <div className="mt-mp-acts sub"><button type="button" className="mt-mp-btn" disabled={busy} onClick={() => run('decision.snooze', { until: st.hour })}>{t('mobile.snoozeHour')}</button><button type="button" className="mt-mp-btn" disabled={busy} onClick={() => run('decision.snooze', { until: st.morning })}>{t('mobile.snoozeMorning')}</button></div>}
      {writing && (
        <form className="mt-mp-reply" onSubmit={(e) => { e.preventDefault(); if (text.trim()) run('decision.answer', { answer: text.trim() }); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('mobile.answerPh')} enterKeyHint="send" autoCapitalize="off" />
          <button type="submit" className="mt-mp-btn pri" disabled={busy || !text.trim()}>{t('phone.send')}</button>
        </form>
      )}
    </div>
  );
}

// 세션 줄 하나. P356: 판 세션 맵 카드와 같은 얼굴(이름·상태 색·지난 시간 / 하네스·모델 / 지금 일·마지막 한 줄, 작업 완료·할 일 꼬리표)
function Row({ s, ws, now, onOpen, showWs = false, pinned = false, onPin = null, todo = 0 }) {
  const t = useT();
  const need = needsYou(s);
  const face = faceOf(t, s, now);
  const l = s.line || {};
  const line = lineText(t, s);
  return (
    <div className={'mt-mp-row mt-mp-face' + (need ? ' need' : '') + faceCls(face)} data-role="mp-row" data-name={s.name} data-state={s.state} data-tier={face.tier}>
      <FaceTags t={t} face={face} todo={todo} />
      <button type="button" className="mt-mp-row-hit" onClick={() => onOpen(s.sessionId)}>
        <span className="mt-mp-row-main mt-mp-face-in">
          <FaceTop s={s} face={face} />
          <FaceMeta face={face}>{showWs ? <><span className="dotsep">/</span><span>{wsNameOf(ws, s.workspaceKey)}</span></> : null}</FaceMeta>
          {line ? <span className="c3" data-role="mp-line" data-kind={l.kind}><b>{t(`mmTerr.kind.${face.f.taskKind}`)}</b>{line}</span> : null}
        </span>
      </button>
      {onPin && <button type="button" className={'mt-mp-pin' + (pinned ? ' on' : '')} data-action="mp-pin" aria-pressed={pinned} aria-label={t(pinned ? 'mobile.unpin' : 'mobile.pin')} onClick={() => onPin(s.sessionId)}><Ic d={I.star} /></button>}
    </div>
  );
}

// ---------- 세션 목록 ----------
function Sessions({ filter, setFilter, onOpen }) {
  const t = useT();
  const rows = useMobile((m) => m.rows);
  const ws = useMobile((m) => m.workspaces);
  const now = useNow(30000);
  const [q, setQ] = useState('');
  const [pins, setPins] = useState(() => readList(store(), PINS_KEY));
  const [shut, setShut] = useState(() => new Set(readList(store(), OPEN_GROUPS_KEY)));
  const [sleepOpen, setSleepOpen] = useState(() => new Set());
  const v = useMemo(() => listOf(rows, ws, { query: q, pins, filter }), [rows, ws, q, pins, filter]);
  const cards = useMobile((m) => m.cards);
  const todo = useMemo(() => todoCounts(cards), [cards]);
  const pin = (id) => { const n = togglePin(pins, id); setPins(n); try { store().setItem(PINS_KEY, JSON.stringify(n)); } catch {} };
  const flip = (k) => { const n = new Set(shut); const key = String(k); if (n.has(key)) n.delete(key); else n.add(key); setShut(n); try { store().setItem(OPEN_GROUPS_KEY, JSON.stringify([...n])); } catch {} };
  const searching = !!q.trim() || !!filter;
  return (
    <div data-role="mp-list">
      <div className="mt-mp-search"><input type="search" data-field="mp-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('mobile.search')} autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" /></div>
      {filter && <div className="mt-mp-filter"><button type="button" className="mt-mp-chip" data-action="mp-filter-clear" onClick={() => setFilter(null)}>{t(`mobile.count_${filter}`)}<Ic d={I.x} s={14} /></button></div>}
      {v.pinned.length > 0 && <><div className="mt-mp-sec"><h2>{t('mobile.pinned')}</h2><b>{v.pinned.length}</b></div>{v.pinned.map((s) => <Row key={s.sessionId} s={s} ws={ws} now={now} onOpen={onOpen} showWs pinned onPin={pin} todo={todo.get(s.sessionId) || 0} />)}</>}
      {v.groups.map((g) => {
        const key = String(g.key);
        const closed = !searching && shut.has(key);
        const showSleep = searching || sleepOpen.has(key) || !g.live.length;
        return (
          <section key={key} data-role="mp-group" data-ws={g.name || ''}>
            <button type="button" className="mt-mp-group" aria-expanded={!closed} onClick={() => flip(key)}><Ic d={I.chev} /><span>{g.name || t('phone.noRepo')}</span>{g.need > 0 && <span className="mt-mp-dot" data-tone="waiting" />}<span className="n">{g.total}</span></button>
            {!closed && g.live.map((s) => <Row key={s.sessionId} s={s} ws={ws} now={now} onOpen={onOpen} pinned={v.pinSet.has(s.sessionId)} onPin={pin} todo={todo.get(s.sessionId) || 0} />)}
            {!closed && g.sleeping.length > 0 && (showSleep ? g.sleeping.map((s) => <Row key={s.sessionId} s={s} ws={ws} now={now} onOpen={onOpen} pinned={v.pinSet.has(s.sessionId)} onPin={pin} todo={todo.get(s.sessionId) || 0} />)
              : <button type="button" className="mt-mp-more" data-action="mp-show-sleeping" onClick={() => setSleepOpen((x) => new Set([...x, key]))}>{t('mobile.showSleeping', { n: g.sleeping.length })}</button>)}
          </section>
        );
      })}
      {!v.total && <div className="mt-mp-empty">{searching ? t('mobile.noMatch') : t('phone.empty')}</div>}
    </div>
  );
}

// ---------- 맵(P356: 판 세션 맵과 같은 모양) ----------
// 맵 코드(MobileMap.jsx 조각)와 그 CSS(dist/mobilemap.css, 판 화면 CSS에서 고른 세션 맵 규칙)는 맵 탭을 처음 열 때 함께 읽는다
let mapCss = null;
function loadMapCss() {
  if (mapCss) return mapCss;
  mapCss = new Promise((res) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'mobilemap.css'; l.onload = () => res(); l.onerror = () => { mapCss = null; l.remove(); res(); }; document.head.appendChild(l); });
  return mapCss;
}
// 구조 답(phone.map)도 조각을 읽는 동안 함께 묻는다(첫 카드까지 한 번 덜 기다린다)
const MobileMap = lazy(() => { const first = call('phone.map', {}).catch(() => null); return Promise.all([import('./MobileMap.jsx'), loadMapCss(), first]).then(([m, , r]) => { if (r && !r.same) m.primeMap(r); return m; }).catch((e) => { noteFail('load', 'mobilemap', e); throw e; }); });
function MapTab({ onOpen }) {
  const t = useT();
  return <Suspense fallback={<div className="mt-mp-empty">{t('common.loading')}</div>}><MobileMap onOpen={onOpen} /></Suspense>;
}

// ---------- 세션 화면: MobileSession.jsx(P355) ----------

// ---------- 새 세션 ----------
function SpawnSheet({ onClose, onStarted }) {
  const t = useT();
  const [info, setInfo] = useState(null);
  const [lid, setLid] = useState(null);
  const [ws, setWs] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { call('phone.spawnInfo').then((r) => { setInfo(r); const favs = r.launchers.filter((l) => r.favorites.includes(l.id)); const list = favs.length ? favs : r.launchers; setLid(list[0] ? list[0].id : null); setWs(r.current || (r.workspaces[0] && r.workspaces[0].key) || null); }).catch((e) => toast(errText(e), 'error')); }, []);
  const favs = info ? info.launchers.filter((l) => info.favorites.includes(l.id)).sort((a, b) => info.favorites.indexOf(a.id) - info.favorites.indexOf(b.id)) : [];
  const list = info ? (favs.length ? favs : info.launchers) : [];
  const W = info && info.workspaces.find((w) => w.key === ws);
  const L = list.find((l) => l.id === lid);
  const clean = name.trim();
  async function start() {
    if (!L || !W || busy) return;
    setBusy(true);
    try {
      const r = await call('session.spawn', { cwd: W.root, launcher: L.id, ...(clean ? { name: clean } : {}) }, { kind: 'spawn' });
      const t0 = Date.now();
      const wait = () => { if (getMobile().rows.has(r.sessionId)) return onStarted(r.sessionId); if (Date.now() - t0 < 15000) setTimeout(wait, 250); else onClose(); };
      wait();
    } catch (e) { toast(t('spawn.failed', { error: errText(e) }), 'error'); setBusy(false); }
  }
  return (
    <div className="mt-mp-sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mt-mp-sheet" data-role="mp-spawn" role="dialog" aria-label={t('phone.newSession')}>
        <div className="mt-mp-sheet-h"><h3>{t('phone.newSession')}</h3><button type="button" className="mt-mp-ib" aria-label={t('common.close')} onClick={onClose}><Ic d={I.x} /></button></div>
        {!info ? <div className="mt-mp-empty">{t('common.loading')}</div> : (
          <>
            <div className="mt-mp-label">{favs.length ? t('phone.launchersRail') : t('phone.launchers')}</div>
            <div className="mt-mp-choices">{list.map((l) => <button key={l.id} type="button" className="mt-mp-choice" aria-pressed={l.id === lid} data-launcher={l.id} onClick={() => setLid(l.id)}>{l.name}</button>)}{!list.length && <div className="mt-mp-empty">{t('phone.noLaunchers')}</div>}</div>
            <div className="mt-mp-label">{t('phone.repo')}</div>
            <div className="mt-mp-choices">{info.workspaces.map((w) => <button key={w.key} type="button" className="mt-mp-choice" aria-pressed={w.key === ws} data-ws={w.key} onClick={() => setWs(w.key)}>{w.name}</button>)}{!info.workspaces.length && <div className="mt-mp-empty">{t('phone.noRepos')}</div>}</div>
            <label className="mt-mp-label" htmlFor="mt-mp-spawn-name">{t('quickName.label')}</label>
            <input id="mt-mp-spawn-name" className="mt-mp-field" value={name} maxLength={40} autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder={t('quickName.ph')} onChange={(e) => setName(e.target.value)} />
            <button type="button" className="mt-mp-btn pri wide" data-action="mp-spawn-go" disabled={!L || !W || busy} onClick={start}>{busy ? t('phone.starting') : t('phone.start', { name: L ? L.name : '' })}</button>
          </>
        )}
      </div>
    </div>
  );
}
