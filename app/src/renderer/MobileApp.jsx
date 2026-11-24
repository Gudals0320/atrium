// P353: 휴대폰 전용 간소 페이지. 옛 휴대폰 화면(Phone.jsx: 세션 맵 캔버스, xterm 터미널)을 바꾼다. 무거운 모듈(캔버스, xterm, 세션 맵)은 들이지 않는다.
// - 아래 탭: 홈(수, 응답 필요 카드와 번호 단추, 할 일 카드, 작업 완료), 세션(찾기, 고정, 워크스페이스 묶음, 잠든 세션 접기), 맵(관계 나무, "전체 맵"은 옛 휴대폰 맵을 늦게 읽는다)
// - 세션 화면: 기다리는 요청, 마지막 답(마크다운), 지시, 터미널 끝 줄(글), 기록 더 보기, 빠른 키(Esc Enter ↑ ↓ 1 2 3 y n), 입력(대기열·스티어링·음성), 대기 글
// - 자료는 mobile-store.js(phone.subscribe의 작은 줄과 이벤트). 세션 화면은 phone.session을 열 때와 그 줄이 바뀔 때 다시 받는다
// - 글자 크기는 옛 휴대폰 화면의 값(mt.phoneTermScale)을 페이지 전체에 쓴다. 키보드가 열리면 보이는 높이(visualViewport)에 맞춘다
// - 알림을 누르면 그 세션 화면을 바로 연다(push.js setOpenHandler, ?open=)
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, toast } from './store.js';
import { useMobile, getMobile, call, putDeliveries, setCardsLocal, noteFail } from './mobile-store.js';
import { useT, errText } from './lib/i18n.js';
import { STATE_LABEL, deliveryText, shellStateText } from './lib/labels.js';
import { homeOf, listOf, treeOf, toneOf, needsYou, isDone, QUICK_KEYS, PINS_KEY, TAB_KEY, OPEN_GROUPS_KEY, TREE_LIMIT, togglePin, readList, detailStale, mergeHistory, choiceButtons, shortChoice, uiFactor } from './lib/mobile.js';
import { keyQueue, sendPlan, nextNeed, screenBox, kbOpenOf } from './lib/phone.js';
import { steerBlock } from './lib/steer.js';
import { activeCards, laterCards, snoozeTimes, kindWord, cardPlace, whenText } from './lib/decisions.js';
import { clampPhoneScale, PHONE_SCALE_DEFAULT } from './lib/scale.js';
import { isStandalone } from './lib/pwa.js';
import { useConnSteady } from './steady.js';
import { Markdown } from './Markdown.jsx';
import { PushButton, PushSheet, SessionMuteButton } from './PhonePush.jsx';
import { setOpenHandler, launchOpen, launchCard, clearLaunchOpen } from './push.js';
import { useVoice, VoiceButton, VoiceInterim } from './Voice.jsx';
import { markInteracted, enterSession } from './touch.js';
import { setDraftSource, takeSavedDraft } from './shell-update.js';
import './phone.css';
import './mobile.css';

const store = () => { try { return localStorage; } catch { return null; } };
const SCALE_KEY = 'mt.phoneTermScale'; // 옛 휴대폰 화면과 같은 값
const readScaleNow = () => { try { return clampPhoneScale(store().getItem(SCALE_KEY)); } catch { return PHONE_SCALE_DEFAULT; } };
const DONE = new Set(['confirmed', 'unconfirmed', 'failed', 'cancelled']);
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
  const [full, setFull] = useState(false);
  const [focus, setFocus] = useState(null); // P357: 결정 카드 알림을 눌러 갈 카드 { id, n }
  const [scale, setScale] = useState(readScaleNow);
  const fs = uiFactor(scale);

  // 글자 크기(페이지 전체)
  useEffect(() => { document.documentElement.style.setProperty('--mp-fs', String(fs)); document.documentElement.style.setProperty('--mp-scale', String(scale / PHONE_SCALE_DEFAULT)); }, [fs, scale]);
  const bump = (d) => setScale((v) => { const n = clampPhoneScale(Math.round((v + d) * 100) / 100); try { store().setItem(SCALE_KEY, String(n)); } catch {} return n; });
  // 가상 키보드: 보이는 높이에 맞춘다(입력 줄과 빠른 키가 키보드 위에 남는다)
  useEffect(() => {
    const vv = window.visualViewport; const el = rootRef.current; const tall = { w: 0, h: 0 };
    const fit = () => {
      const b = screenBox({ vv, innerHeight: window.innerHeight, innerWidth: window.innerWidth, screenW: window.screen && window.screen.width, screenH: window.screen && window.screen.height, standalone: isStandalone() });
      if (el) { el.style.height = b.height + 'px'; el.style.transform = b.top ? 'translateY(' + b.top + 'px)' : ''; }
      const vh = vv && vv.height > 0 ? vv.height : window.innerHeight;
      if (tall.w !== window.innerWidth) { tall.w = window.innerWidth; tall.h = 0; }
      tall.h = Math.max(tall.h, vh, window.innerHeight);
      document.documentElement.classList.toggle('mt-kb-open', kbOpenOf({ vvHeight: vh, innerHeight: window.innerHeight, tallest: tall.h }));
    };
    fit();
    if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
    window.addEventListener('resize', fit);
    document.documentElement.classList.add('mt-mp-on');
    return () => { if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); } window.removeEventListener('resize', fit); document.documentElement.classList.remove('mt-mp-on', 'mt-kb-open'); };
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
  const toastsView = <div className="mt-mp-toasts">{toasts.map((x) => <div key={x.id} className={'mt-mp-toast ' + x.kind}>{x.text}</div>)}</div>;
  return (
    <div className="mt-mp" ref={rootRef} data-role="mp" data-tab={tab} data-view={s ? 'session' : tab}>
      {s ? <SessionScreen key={s.sessionId} s={s} onBack={() => go(null)} onGo={(id) => go(id, { replace: true })} needIds={home.needs.map((x) => x.sessionId)} bump={bump} />
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
                : <MapTab onOpen={go} onFull={() => setFull(true)} />}
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
      {full && <FullMap onClose={() => setFull(false)} onOpen={(id) => { setFull(false); go(id); }} />}
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
  return (
    <div data-role="mp-home">
      <div className="mt-mp-tiles">
        {[['need', home.counts.need, 'sessions', 'need'], ['work', home.counts.work, 'sessions', 'work'], ['done', home.counts.done, 'sessions', 'done']].map(([k, n, tab, f]) => (
          <button key={k} type="button" className="mt-mp-tile" data-k={k} data-role="mp-tile" onClick={() => onTab(tab, f)}><b>{n}</b><span>{t(`mobile.count_${k}`)}</span></button>
        ))}
      </div>
      {home.needs.length > 0 && <div className="mt-mp-sec need"><h2>{t('mobile.count_need')}</h2><b>{home.needs.length}</b></div>}
      {home.needs.map((s) => <NeedCard key={s.sessionId} s={s} ws={ws} now={now} onOpen={onOpen} />)}
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
          {home.done.slice(0, 8).map((s) => <Row key={s.sessionId} s={s} ws={ws} now={now} onOpen={onOpen} showWs />)}
        </>
      )}
    </div>
  );
}

// 응답 필요 카드: 요청 보기의 번호 단추, Esc, 열기. 누른 키는 session.keys로 그 패널에(어느 하네스든 같다)
function NeedCard({ s, ws, now, onOpen }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const press = (k) => { if (busy) return; setBusy(true); markInteracted(s.sessionId); call('session.keys', { session: s.sessionId, keys: [k] }, { kind: 'keys' }).catch((e) => { if (e.code !== 'disconnected') toast(t('phoneKeys.failed', { error: errText(e) }), 'error'); }).finally(() => setTimeout(() => setBusy(false), 400)); };
  const a = s.ask;
  const btns = s.state === 'trust_wait' ? [] : choiceButtons(a);
  const title = s.state === 'trust_wait' ? t('phone.ask_trust') : a && a.kind === 'permission' ? t('phone.ask_permission', { tool: a.tool || '' }) : a && a.question ? a.question : t(`phone.ask_${(s.line && s.line.key) || 'screen'}`);
  const sub = s.line && s.line.text;
  return (
    <div className="mt-mp-card need" data-role="mp-need" data-name={s.name}>
      <div className="mt-mp-card-top"><span className="mt-mp-dot" data-tone={toneOf(s)} /><span className="who">{s.name}</span><span>· {wsNameOf(ws, s.workspaceKey)}</span><span className="when">{ago(t, s.waitingSince || (a && a.since), now)}</span></div>
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
function TodoCard({ d, now, cards, hot = false, later = false }) {
  const t = useT();
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [snz, setSnz] = useState(false);
  const run = (method, params) => { if (busy) return; setBusy(true); call(method, { id: d.id, ...params }, { kind: 'todo' }).then(() => { setCardsLocal(cards.filter((x) => x.id !== d.id || method === 'decision.snooze' ? x.id !== d.id : false)); }).catch((e) => toast(t('mobile.todoFailed', { error: errText(e) }), 'error')).finally(() => setBusy(false)); };
  const st = snoozeTimes(now);
  const kindKey = d.kind === 'decide' ? 'decide' : d.kind === 'check' ? 'check' : 'do';
  const top = <div className="mt-mp-card-top"><span className="kind" data-k={d.kind} data-role="mp-todo-kind">{t(kindWord(d.kind))}</span>{d.auto && <span className="auto" data-role="mp-todo-auto">{t('autoDecisions.tag')}</span>}<span className="who">{d.name}</span><span className="when">{ago(t, d.createdAt, now)}</span></div>;
  const q = d.kind === 'guard' ? t('guard.cardQ') : d.question;
  if (later) return (
    <div className={'mt-mp-card later' + (hot ? ' hot' : '')} data-role="mp-todo" data-id={d.id} data-kind={d.kind} data-later="1" data-hot={hot ? '1' : undefined}>
      {top}
      <div className="mt-mp-q">{q}</div>
      <div className="mt-mp-why">{d.cond ? t('userTasks.cond', { text: d.cond }) : d.wakeAt ? t('userTasks.at', { when: whenText(d.wakeAt, now) }) : null}</div>
      <div className="mt-mp-acts"><button type="button" className="mt-mp-btn" disabled={busy} data-action="mp-later-raise" onClick={() => { if (busy) return; setBusy(true); call('decision.raise', { id: d.id }, { kind: 'todo' }).catch((e) => toast(t('mobile.todoFailed', { error: errText(e) }), 'error')).finally(() => setBusy(false)); }}>{t('userTasks.raise')}</button></div>
    </div>
  );
  return (
    <div className={'mt-mp-card' + (hot ? ' hot' : '')} data-role="mp-todo" data-id={d.id} data-kind={d.kind} data-hot={hot ? '1' : undefined}>
      {top}
      <div className="mt-mp-q">{q}</div>
      {d.why && <div className="mt-mp-why">{d.why}</div>}
      <div className="mt-mp-acts">
        {kindKey === 'decide' && (d.options || []).map((o, i) => <button key={o} type="button" className={'mt-mp-btn' + (i === 0 ? ' pri' : '')} disabled={busy} data-action="mp-todo-answer" onClick={() => run('decision.answer', { answer: o })}>{o}</button>)}
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

// 세션 줄 하나
function Row({ s, ws, now, onOpen, showWs = false, pinned = false, onPin = null }) {
  const t = useT();
  const need = needsYou(s);
  const rest = s.state === 'sleeping' || s.state === 'exited';
  const l = s.line || {};
  return (
    <div className={'mt-mp-row' + (need ? ' need' : '') + (rest ? ' rest' : '')} data-role="mp-row" data-name={s.name} data-state={s.state}>
      <button type="button" className="mt-mp-row-hit" onClick={() => onOpen(s.sessionId)}>
        <span className="mt-mp-dot" data-tone={toneOf(s)} />
        <span className="mt-mp-row-main">
          <span className="mt-mp-row-top"><span className="mt-mp-name">{s.name}</span>{showWs && <span className="mt-mp-tag">{wsNameOf(ws, s.workspaceKey)}</span>}<span className="mt-mp-when">{need ? stateText(t, s) : ago(t, s.lastActivityAt, now)}</span></span>
          <span className="mt-mp-line" data-kind={l.kind}>{lineText(t, s) || stateText(t, s)}</span>
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
  const pin = (id) => { const n = togglePin(pins, id); setPins(n); try { store().setItem(PINS_KEY, JSON.stringify(n)); } catch {} };
  const flip = (k) => { const n = new Set(shut); const key = String(k); if (n.has(key)) n.delete(key); else n.add(key); setShut(n); try { store().setItem(OPEN_GROUPS_KEY, JSON.stringify([...n])); } catch {} };
  const searching = !!q.trim() || !!filter;
  return (
    <div data-role="mp-list">
      <div className="mt-mp-search"><input type="search" data-field="mp-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('mobile.search')} autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" /></div>
      {filter && <div className="mt-mp-filter"><button type="button" className="mt-mp-chip" data-action="mp-filter-clear" onClick={() => setFilter(null)}>{t(`mobile.count_${filter}`)}<Ic d={I.x} s={14} /></button></div>}
      {v.pinned.length > 0 && <><div className="mt-mp-sec"><h2>{t('mobile.pinned')}</h2><b>{v.pinned.length}</b></div>{v.pinned.map((s) => <Row key={s.sessionId} s={s} ws={ws} now={now} onOpen={onOpen} showWs pinned onPin={pin} />)}</>}
      {v.groups.map((g) => {
        const key = String(g.key);
        const closed = !searching && shut.has(key);
        const showSleep = searching || sleepOpen.has(key) || !g.live.length;
        return (
          <section key={key} data-role="mp-group" data-ws={g.name || ''}>
            <button type="button" className="mt-mp-group" aria-expanded={!closed} onClick={() => flip(key)}><Ic d={I.chev} /><span>{g.name || t('phone.noRepo')}</span>{g.need > 0 && <span className="mt-mp-dot" data-tone="waiting" />}<span className="n">{g.total}</span></button>
            {!closed && g.live.map((s) => <Row key={s.sessionId} s={s} ws={ws} now={now} onOpen={onOpen} pinned={v.pinSet.has(s.sessionId)} onPin={pin} />)}
            {!closed && g.sleeping.length > 0 && (showSleep ? g.sleeping.map((s) => <Row key={s.sessionId} s={s} ws={ws} now={now} onOpen={onOpen} pinned={v.pinSet.has(s.sessionId)} onPin={pin} />)
              : <button type="button" className="mt-mp-more" data-action="mp-show-sleeping" onClick={() => setSleepOpen((x) => new Set([...x, key]))}>{t('mobile.showSleeping', { n: g.sleeping.length })}</button>)}
          </section>
        );
      })}
      {!v.total && <div className="mt-mp-empty">{searching ? t('mobile.noMatch') : t('phone.empty')}</div>}
    </div>
  );
}

// ---------- 맵(나무 목록) ----------
function MapTab({ onOpen, onFull }) {
  const t = useT();
  const rows = useMobile((m) => m.rows);
  const ws = useMobile((m) => m.workspaces);
  const tree = useMemo(() => treeOf(rows, ws), [rows, ws]);
  const [more, setMore] = useState(() => new Set());
  return (
    <div data-role="mp-tree">
      <div className="mt-mp-sec"><h2>{t('mobile.relations')}</h2><span className="mt-mp-sp" /><button type="button" className="mt-mp-full" data-action="mp-fullmap" onClick={onFull}><Ic d={I.map} s={16} />{t('mobile.fullMap')}</button></div>
      {tree.map((g) => {
        const key = String(g.key);
        const cut = !more.has(key) && g.items.length > TREE_LIMIT + 2;
        const items = cut ? g.items.slice(0, TREE_LIMIT) : g.items;
        return (
          <div key={key} className="mt-mp-tree" data-role="mp-tree-ws">
            <div className="mt-mp-tree-ws">{g.name || t('phone.noRepo')}</div>
            {items.map(({ s, guides }) => (
              <button key={s.sessionId} type="button" className={'mt-mp-node' + (needsYou(s) ? ' need' : '') + (s.state === 'sleeping' || s.state === 'exited' ? ' rest' : '')} data-role="mp-node" data-name={s.name} data-depth={guides.length} onClick={() => onOpen(s.sessionId)}>
                {guides.length > 0 && <span className="guide">{guides.map((c, i) => <i key={i} className={c} />)}</span>}
                <span className="mt-mp-dot" data-tone={toneOf(s)} /><span className="nm">{s.name}</span><span className="st">{stateText(t, s)}</span>
              </button>
            ))}
            {cut && <button type="button" className="mt-mp-more inset" onClick={() => setMore((x) => new Set([...x, key]))}>{t('mobile.moreRows', { n: g.items.length - items.length })}</button>}
          </div>
        );
      })}
    </div>
  );
}

// "전체 맵": 옛 휴대폰 세션 맵을 늦게 읽는다(fullmap.js·fullmap.css). 연 동안은 판 이벤트 전부를 받고, 닫으면 휴대폰 구독으로 돌아간다
let fullMod = null;
function loadFull() {
  if (fullMod) return fullMod;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'fullmap.css'; document.head.appendChild(css);
  const url = new URL('fullmap.js', import.meta.url).href; // 글로 만든 주소: esbuild가 이 묶음에 넣지 않는다
  fullMod = import(url).catch((e) => { fullMod = null; noteFail('load', 'fullmap', e); throw e; });
  return fullMod;
}
function FullMap({ onClose, onOpen }) {
  const t = useT();
  const host = useRef(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let off = null, alive = true;
    loadFull().then((m) => { if (alive && host.current) off = m.mountFullMap(host.current, { onOpen, onClose }); }).catch((e) => { if (alive) setErr(errText(e)); });
    return () => { alive = false; if (off) off(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mt-mp-fullmap" data-role="mp-fullmap-host">
      <div ref={host} className="mt-mp-fullmap-in" />
      {err && <div className="mt-mp-empty">{t('mobile.fullMapFailed', { error: err })}<br /><button type="button" className="mt-mp-btn" onClick={onClose}>{t('common.close')}</button></div>}
    </div>
  );
}

// ---------- 세션 화면 ----------
function SessionScreen({ s, onBack, onGo, needIds, bump }) {
  const t = useT();
  const id = s.sessionId;
  const ws = useMobile((m) => m.workspaces);
  const deliveries = useMobile((m) => m.deliveries);
  const allCards = useMobile((m) => m.cards);
  const mine = activeCards(allCards).filter((d) => d.sessionId === id); // P357: 이 세션의 열린 할 일 카드(위에)
  const cardNow = useNow(30000);
  const [detail, setDetail] = useState(null);
  const [termOpen, setTermOpen] = useState(null); // null: 저절로(일하거나 기다리거나 셸이면 펼침)
  const [hist, setHist] = useState({ items: [], more: true, before: null, busy: false });
  const [pins, setPins] = useState(() => readList(store(), PINS_KEY));
  const live = s.state !== 'sleeping' && s.state !== 'exited';
  const need = needsYou(s);
  const prev = useRef(null);
  const timer = useRef(0);
  const lastFetch = useRef(0);
  const fetchDetail = () => {
    clearTimeout(timer.current);
    const run = () => { lastFetch.current = Date.now(); call('phone.session', { session: id, lines: 40 }).then((d) => { setDetail(d); putDeliveries(d.deliveries); }).catch(() => {}); };
    const wait = 1200 - (Date.now() - lastFetch.current);
    if (wait > 0) timer.current = setTimeout(run, wait); else run();
  };
  // 열 때, 줄이 바뀔 때(상태·답·활동·요청), 다시 붙을 때
  // 보는 중: 이 세션은 저절로 잠재우지 않는다(판 sleep.mjs board.viewing). 30초마다, 떠나면 비운다
  useEffect(() => { const say = (on) => api.call('board.viewing', on ? { focus: id, close: [id], inputAgoMs: 0 } : { focus: null, close: [] }).catch(() => {}); say(true); const iv = setInterval(() => say(true), 30000); return () => { clearInterval(iv); say(false); }; }, [id]);
  useEffect(() => { enterSession(id); if (s.unseen) call('session.markSeen', { session: id }).catch(() => {}); fetchDetail(); const off = api.on('$open', () => fetchDetail()); return () => { off(); clearTimeout(timer.current); api.call('phone.close').catch(() => {}); }; }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (prev.current && detailStale(prev.current, s)) fetchDetail(); prev.current = s; if (s.unseen && prev.current) call('session.markSeen', { session: id }).catch(() => {}); }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  const keys = useMemo(() => keyQueue((list) => call('session.keys', { session: id, keys: list }, { kind: 'keys' }), (e) => { if (e.code !== 'disconnected') toast(t('phoneKeys.failed', { error: errText(e) }), 'error'); }), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const press = (k) => { markInteracted(id); keys.push(k); setTimeout(fetchDetail, 700); };
  const next = nextNeed(needIds, id);
  const pinned = pins.includes(id);
  const pin = () => { const n = togglePin(pins, id); setPins(n); try { store().setItem(PINS_KEY, JSON.stringify(n)); } catch {} };
  const showTerm = termOpen != null ? termOpen : (need || s.state === 'working' || s.kind === 'shell' || !(detail && detail.lastAnswer));
  const loadMore = () => {
    if (hist.busy) return;
    setHist((h) => ({ ...h, busy: true }));
    call('phone.history', { session: id, limit: 6, ...(hist.before != null ? { before: hist.before } : {}) }).then((r) => setHist((h) => ({ items: mergeHistory(h.items, r.items), more: r.more, before: r.before, busy: false }))).catch(() => setHist((h) => ({ ...h, busy: false })));
  };
  const queue = [...deliveries.values()].filter((d) => d.sessionId === id && !DONE.has(d.status)).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const a = detail && detail.ask;
  const sub = [stateText(t, s), detail && detail.model ? String(detail.model).replace(/^claude-/, '') : s.model, wsNameOf(ws, s.workspaceKey)].filter(Boolean).join(' · ');
  return (
    <div className="mt-mp-session" data-role="mp-session" data-session={id} data-state={s.state}>
      <header className="mt-mp-shead">
        <button type="button" className="mt-mp-back" data-action="mp-back" onClick={onBack}><Ic d={I.back} /><span>{t('phone.list')}</span></button>
        <div className="mt-mp-title"><b><span className="mt-mp-dot" data-tone={toneOf(s)} />{s.name}</b><span>{sub}</span></div>
        {next && <button type="button" className="mt-mp-next" data-action="mp-next" onClick={() => onGo(next)}>{t('phone.nextShort', { n: needIds.filter((x) => x !== id).length })}<Ic d={I.right} s={16} /></button>}
        {s.kind !== 'shell' && <SessionMuteButton sessionId={id} />}
        <button type="button" className={'mt-mp-ib' + (pinned ? ' on' : '')} data-action="mp-pin-session" aria-pressed={pinned} aria-label={t(pinned ? 'mobile.unpin' : 'mobile.pin')} onClick={pin}><Ic d={I.star} /></button>
      </header>
      <div className="mt-mp-sbody" data-role="mp-sbody">
        {mine.length > 0 && <div className="mt-mp-stodos" data-role="mp-session-todos" data-count={mine.length}>{mine.map((d) => <TodoCard key={d.id} d={d} now={cardNow} cards={allCards} />)}</div>}
        {s.state === 'sleeping' && <div className="mt-mp-cover" data-role="mp-asleep"><p>{t('phone.asleep')}</p><button type="button" className="mt-mp-btn pri" data-action="mp-wake" onClick={() => call('session.wake', { session: id }).catch((e) => toast(errText(e), 'error'))}>{s.waking ? t('phone.waking') : t('phone.wake')}</button></div>}
        {s.state === 'exited' && <div className="mt-mp-cover"><p>{t('phone.exited')}</p></div>}
        {need && (
          <div className="mt-mp-block need" data-role="mp-ask">
            <div className="mt-mp-block-h">{s.state === 'trust_wait' ? t('phone.ask_trust') : a && a.kind === 'permission' ? t('phone.ask_permission', { tool: a.tool || '' }) : t(`phone.ask_${(s.line && s.line.key) || 'screen'}`)}</div>
            {a && a.summary && <div className="mt-mp-sub pad">{a.summary}</div>}
            {a && a.plan && <div className="mt-mp-md"><Markdown text={a.plan} /></div>}
            {a && a.questions && a.questions.map((q, i) => <div key={i} className="mt-mp-qq"><b>{q.question}</b>{q.options.length > 0 && <ol>{q.options.map((o) => <li key={o}>{o}</li>)}</ol>}</div>)}
            {a && a.choices && a.choices.length > 0 && <div className="mt-mp-choices col">{a.choices.map((c) => <button key={c.n} type="button" className="mt-mp-choice" data-mp-choice={c.n} onClick={() => press(String(c.n))}><b>{c.n}</b> {c.label}</button>)}</div>}
            {a && a.question && !(a.choices && a.choices.length) && <div className="mt-mp-sub pad">{a.question}</div>}
          </div>
        )}
        {detail && detail.lastAnswer && (
          <div className="mt-mp-block" data-role="mp-answer">
            <div className="mt-mp-block-h">{t('mobile.lastAnswer')}<span className="when">· {ago(t, detail.lastAnswerAt, Date.now())}</span></div>
            <div className="mt-mp-md"><Markdown text={detail.lastAnswer} /></div>
          </div>
        )}
        {detail && detail.lastPrompt && (
          <div className="mt-mp-block" data-role="mp-prompt">
            <div className="mt-mp-block-h">{t('mobile.prompt')}{detail.promptAt && <span className="when">· {ago(t, detail.promptAt, Date.now())}</span>}</div>
            <div className="mt-mp-prompt">{detail.lastPrompt}</div>
          </div>
        )}
        {detail && detail.tail != null && (
          <div className="mt-mp-block" data-role="mp-term">
            <div className="mt-mp-block-h"><button type="button" className="mt-mp-hbtn" data-action="mp-tail" aria-expanded={showTerm} onClick={() => setTermOpen(!showTerm)}>{t('mobile.terminal')}<Ic d={I.chev} s={14} /></button><span className="mt-mp-sp" />
              <button type="button" data-action="mp-font-down" aria-label={t('mobile.fontDown')} onClick={() => bump(-0.05)}>A−</button><button type="button" data-action="mp-font-up" aria-label={t('mobile.fontUp')} onClick={() => bump(0.05)}>A+</button><button type="button" data-action="mp-refresh" onClick={() => { lastFetch.current = 0; fetchDetail(); }}>{t('mobile.refresh')}</button></div>
            {showTerm && <pre className="mt-mp-term" data-role="mp-tail">{detail.tail || ' '}</pre>}
          </div>
        )}
        {!detail && <div className="mt-mp-empty">{t('common.loading')}</div>}
        {hist.items.length > 0 && (
          <div className="mt-mp-block" data-role="mp-history"><div className="mt-mp-block-h">{t('mobile.history')}</div>{hist.items.map((m) => <div key={m.seq} className="mt-mp-turn" data-role={m.role}>{m.role === 'assistant' ? <Markdown text={m.text} /> : m.text}</div>)}</div>
        )}
        {s.kind !== 'shell' && hist.more && <button type="button" className="mt-mp-more" data-action="mp-more-history" disabled={hist.busy} onClick={loadMore}>{hist.busy ? t('common.loading') : t('mobile.moreHistory')}</button>}
      </div>
      {queue.length > 0 && (
        <div className="mt-mp-queue" data-role="mp-queue">{queue.slice(0, 3).map((d) => (
          <div key={d.deliveryId} className="q"><span>{deliveryText(d)}{d.text ? ' · “' + d.text + '”' : ''}</span>
            {d.status === 'queued' && <button type="button" onClick={() => call('delivery.now', { deliveryId: d.deliveryId }).catch((e) => toast(errText(e), 'error'))}>{t('mobile.sendNow')}</button>}
            <button type="button" onClick={() => call('delivery.cancel', { deliveryId: d.deliveryId }).catch((e) => toast(errText(e), 'error'))}>{t('common.cancel')}</button></div>
        ))}</div>
      )}
      {live && (
        <div className={'mt-mp-keys' + (need ? ' need' : '')} data-role="mp-keys" role="group" aria-label={t('phoneKeys.group')}>
          {QUICK_KEYS.map((k) => <button key={k} type="button" className={'mt-mp-key' + (/^[0-9]$/.test(k) ? ' num' : '')} data-mp-key={k} aria-label={t(`mobile.key_${k}`)} onPointerDown={(e) => e.preventDefault()} onClick={() => press(k)}>{KEY_GLYPH[k] || k}</button>)}
        </div>
      )}
      {live && <InputRow s={s} />}
    </div>
  );
}
const KEY_GLYPH = { esc: 'Esc', enter: '⏎', up: '↑', down: '↓' };

// 입력 줄: 에이전트는 대기열(session.send, 고르면 스티어링), 셸은 한 줄 치기(phone.type)
function InputRow({ s }) {
  const t = useT();
  const id = s.sessionId;
  const taRef = useRef(null);
  const [text, setText] = useState(() => takeSavedDraft(id) || '');
  const [busy, setBusy] = useState(false);
  const [steer, setSteer] = useState(false);
  const [note, setNote] = useState(null);
  const deliveries = useMobile((m) => m.deliveries);
  const textRef = useRef(text); textRef.current = text;
  useEffect(() => setDraftSource(() => ({ sessionId: id, text: textRef.current })), [id]);
  const voice = useVoice({ text, setText, taRef, inline: false });
  const grow = (el) => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 132) + 'px'; };
  useEffect(() => { if (taRef.current && text) grow(taRef.current); }, [text]);
  const why = steerBlock(s);
  async function send() {
    let cur = text;
    if (voice.active) { await voice.finish(1000); cur = voice.current(); }
    const plan = sendPlan(s, cur, { steer });
    if (!plan || busy) return;
    setBusy(true); markInteracted(id);
    try {
      if (plan.method === 'session.send') {
        const r = await call('session.send', { target: [id], text: plan.text, ...(plan.steer ? { steer: true } : {}) }, { kind: 'send' });
        const d = r && r.deliveries && r.deliveries[0];
        if (d) putDeliveries([{ ...d, sessionId: id }]);
        setNote(d ? { deliveryId: d.deliveryId, at: Date.now() } : { text: t('phone.sent'), at: Date.now() });
        setSteer(false);
      } else {
        await call('phone.type', { session: id, text: cur }, { kind: 'send' });
        setNote({ text: t('phone.sent'), at: Date.now() });
      }
      setText(''); requestAnimationFrame(() => { if (taRef.current) taRef.current.style.height = ''; });
    } catch (e) { if (e.code !== 'disconnected') toast(t('phone.sendFailed', { error: errText(e) }), 'error'); }
    setBusy(false);
  }
  const now = useNow(5000);
  const d = note && note.deliveryId ? deliveries.get(note.deliveryId) : null;
  const noteText = note && now - note.at < 20000 ? (d ? deliveryText(d) : note.text || null) : null;
  return (
    <>
      {noteText && !voice.active && <div className="mt-mp-note" data-role="mp-note">{noteText}</div>}
      <form className="mt-mp-input" data-role="mp-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <VoiceInterim voice={voice} />
        <VoiceButton voice={voice} className="mt-mp-round mt-ph-voice" />
        <textarea ref={taRef} rows={1} value={text} data-field="mp-text" enterKeyHint="enter" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          placeholder={s.kind === 'shell' ? t('phone.inputShell') : steer && !why ? t('cmdHead.phoneSteerOn') : t('phone.inputAgent')}
          onChange={(e) => { setText(e.target.value); grow(e.target); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
        {s.kind !== 'shell' && <button type="button" className={'mt-mp-round' + (steer && !why ? ' on' : '')} data-action="mp-steer" aria-pressed={steer && !why} aria-label={t('cmdSteer.label')} title={why ? t('cmdSteer.off', { why: t(`cmdSteer.why_${why}`) }) : t('cmdSteer.phoneTitle')} onPointerDown={(e) => e.preventDefault()} onClick={() => { if (why) toast(t('cmdSteer.off', { why: t(`cmdSteer.why_${why}`) })); else setSteer((v) => !v); }}><Ic d={I.bolt} /></button>}
        <button type="submit" className="mt-mp-round send" data-action="mp-send" disabled={busy || (!text.trim() && !voice.active)} aria-label={t('phone.send')}><Ic d={I.up} /></button>
      </form>
    </>
  );
}

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
