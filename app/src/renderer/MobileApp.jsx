// P353: 휴대폰 전용 간소 페이지. 옛 휴대폰 화면(Phone.jsx: 세션 맵 캔버스, xterm 터미널)을 바꾼다. 무거운 모듈(캔버스, xterm, 세션 맵)은 들이지 않는다.
// - 아래 탭: 홈(수, 응답 필요 카드와 번호 단추, 할 일 카드, 작업 완료), 세션(찾기, 고정, 워크스페이스 묶음, 잠든 세션 접기), 맵(관계 나무, "전체 맵"은 옛 휴대폰 맵을 늦게 읽는다)
// - 세션 화면: MobileSession.jsx(P355: 답 | 터미널 보기, 키 줄, 입력)
// - 자료는 mobile-store.js(phone.subscribe의 작은 줄과 이벤트). 세션 화면은 phone.session을 열 때와 그 줄이 바뀔 때 다시 받는다
// - 글자 크기는 옛 휴대폰 화면의 값(mt.phoneTermScale)을 페이지 전체에 쓴다. 키보드가 열리면 보이는 높이(visualViewport)에 맞춘다
// - 알림을 누르면 그 세션 화면을 바로 연다(push.js setOpenHandler, ?open=)
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, toast } from './store.js';
import { useMobile, getMobile, call, setCardsLocal, noteFail } from './mobile-store.js';
import { useT, errText } from './lib/i18n.js';
import { STATE_LABEL, shellStateText } from './lib/labels.js';
import { homeOf, listOf, treeOf, toneOf, needsYou, isDone, PINS_KEY, TAB_KEY, OPEN_GROUPS_KEY, TREE_LIMIT, togglePin, readList, choiceButtons, shortChoice, uiFactor, pageBox } from './lib/mobile.js';
import { kbOpenOf } from './lib/phone.js';
import { SessionScreen } from './MobileSession.jsx'; // P355: 세션 화면
import { noteLayout } from './lib/phone-telemetry.js'; // P355: 배치 값 한 번(아래 잘림을 숫자로)
import { activeCards, snoozeTimes } from './lib/decisions.js';
import { clampPhoneScale, PHONE_SCALE_DEFAULT } from './lib/scale.js';
import { isStandalone } from './lib/pwa.js';
import { useConnSteady } from './steady.js';
import { PushButton, PushSheet } from './PhonePush.jsx';
import { setOpenHandler, launchOpen, clearLaunchOpen } from './push.js';
import { markInteracted } from './touch.js';
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
  const [scale, setScale] = useState(readScaleNow);
  const fs = uiFactor(scale);

  // 글자 크기(페이지 전체)
  useEffect(() => { document.documentElement.style.setProperty('--mp-fs', String(fs)); document.documentElement.style.setProperty('--mp-scale', String(scale / PHONE_SCALE_DEFAULT)); }, [fs, scale]);
  const bump = (d) => setScale((v) => { const n = clampPhoneScale(Math.round((v + d) * 100) / 100); try { store().setItem(SCALE_KEY, String(n)); } catch {} return n; });
  // 가상 키보드: 보이는 높이에 맞춘다(입력 줄과 빠른 키가 키보드 위에 남는다)
  useEffect(() => {
    const vv = window.visualViewport; const el = rootRef.current; const tall = { w: 0, h: 0 };
    const fit = () => {
      const b = pageBox({ vv, innerHeight: window.innerHeight, innerWidth: window.innerWidth, screenW: window.screen && window.screen.width, screenH: window.screen && window.screen.height, standalone: isStandalone() });
      if (el) { el.style.height = b.height + 'px'; el.style.transform = b.top ? 'translateY(' + b.top + 'px)' : ''; }
      // P355: 홈 화면 앱이 창 높이를 짧게 주면 html·body도 화면 높이까지(옛 휴대폰 화면 useScreenFix, phone.css html.mt-tall)
      if (b.tall) { document.documentElement.style.setProperty('--mt-screen-h', b.height + 'px'); document.documentElement.classList.add('mt-tall'); } else document.documentElement.classList.remove('mt-tall');
      const vh = vv && vv.height > 0 ? vv.height : window.innerHeight;
      if (tall.w !== window.innerWidth) { tall.w = window.innerWidth; tall.h = 0; }
      tall.h = Math.max(tall.h, vh, window.innerHeight);
      document.documentElement.classList.toggle('mt-kb-open', kbOpenOf({ vvHeight: vh, innerHeight: window.innerHeight, tallest: tall.h }));
    };
    fit();
    if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
    window.addEventListener('resize', fit);
    document.documentElement.classList.add('mt-mp-on');
    // P355: 자리가 잡힌 뒤 배치 값을 한 번 남긴다(창·보이는 높이, 화면, 안전 영역, 뿌리·아래 줄의 아래 끝)
    const lay = setTimeout(() => noteLayout(), 2500);
    return () => { clearTimeout(lay); if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); } window.removeEventListener('resize', fit); document.documentElement.classList.remove('mt-mp-on', 'mt-kb-open', 'mt-tall'); };
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
  useEffect(() => setOpenHandler((id) => { if (getMobile().rows.has(id)) goRef.current(id); }), []);
  const launch = useRef(launchOpen());
  useEffect(() => { const id = launch.current; if (!id || !loaded) return; launch.current = null; clearLaunchOpen(); if (rows.has(id)) goRef.current(id); }, [loaded, rows]);
  // 연 세션이 사라지면 목록으로
  useEffect(() => { if (open && loaded && !rows.has(open)) { setOpen(null); try { history.replaceState(null, ''); } catch {} } }, [open, loaded, rows]);
  window.__mtMobile = { open: (id) => go(id), tab: setTab, state: getMobile };

  const home = useMemo(() => homeOf(rows), [rows]);
  const s = open ? rows.get(open) : null;
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
                : tab === 'home' ? <Home home={home} onOpen={go} onTab={(k, f) => { setFilter(f || null); setTab(k); }} />
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
function Home({ home, onOpen, onTab }) {
  const t = useT();
  const cards = useMobile((m) => m.cards);
  const ws = useMobile((m) => m.workspaces);
  const now = useNow(30000);
  const active = activeCards(cards);
  const later = cards.length - active.length;
  const [allRead, setAllRead] = useState(false);
  return (
    <div data-role="mp-home">
      <div className="mt-mp-tiles">
        {[['need', home.counts.need, 'sessions', 'need'], ['work', home.counts.work, 'sessions', 'work'], ['done', home.counts.done, 'sessions', 'done']].map(([k, n, tab, f]) => (
          <button key={k} type="button" className="mt-mp-tile" data-k={k} data-role="mp-tile" onClick={() => onTab(tab, f)}><b>{n}</b><span>{t(`mobile.count_${k}`)}</span></button>
        ))}
      </div>
      {home.needs.length > 0 && <div className="mt-mp-sec need"><h2>{t('mobile.count_need')}</h2><b>{home.needs.length}</b></div>}
      {home.needs.map((s) => <NeedCard key={s.sessionId} s={s} ws={ws} now={now} onOpen={onOpen} />)}
      <div className="mt-mp-sec"><h2>{t('mobile.todo')}</h2><b>{active.length}</b>{later > 0 && <><span className="mt-mp-sp" /><span className="mt-mp-dimnote">{t('mobile.later', { n: later })}</span></>}</div>
      {!active.length && <div className="mt-mp-empty small">{t('mobile.noTodo')}</div>}
      {active.map((d) => <TodoCard key={d.id} d={d} now={now} cards={cards} />)}
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
function TodoCard({ d, now, cards }) {
  const t = useT();
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [snz, setSnz] = useState(false);
  const run = (method, params) => { if (busy) return; setBusy(true); call(method, { id: d.id, ...params }, { kind: 'todo' }).then(() => { setCardsLocal(cards.filter((x) => x.id !== d.id || method === 'decision.snooze' ? x.id !== d.id : false)); }).catch((e) => toast(t('mobile.todoFailed', { error: errText(e) }), 'error')).finally(() => setBusy(false)); };
  const st = snoozeTimes(now);
  const kindKey = d.kind === 'decide' ? 'decide' : d.kind === 'check' ? 'check' : 'do';
  return (
    <div className="mt-mp-card" data-role="mp-todo" data-id={d.id} data-kind={d.kind}>
      <div className="mt-mp-card-top"><span className="kind" data-k={kindKey}>{t(`mobile.kind_${kindKey}`)}</span><span className="who">{d.name}</span><span className="when">{ago(t, d.createdAt, now)}</span></div>
      <div className="mt-mp-q">{d.question}</div>
      {d.why && <div className="mt-mp-why">{d.why}</div>}
      <div className="mt-mp-acts">
        {kindKey === 'decide' && (d.options || []).map((o, i) => <button key={o} type="button" className={'mt-mp-btn' + (i === 0 ? ' pri' : '')} disabled={busy} data-action="mp-todo-answer" onClick={() => run('decision.answer', { answer: o })}>{o}</button>)}
        {kindKey === 'do' && <button type="button" className="mt-mp-btn pri" disabled={busy} data-action="mp-todo-done" onClick={() => run('decision.done', {})}>{t('mobile.did')}</button>}
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
