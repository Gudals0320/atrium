// P355: 휴대폰 전용 페이지의 세션 화면(MobileApp.jsx에서 떼어 냈다. 홈·세션 목록·맵 탭은 MobileApp.jsx).
// - 위: 머리줄(뒤로, 이름·상태, 다음 응답 필요, 알림 끄기, 고정)과 보기 고르기 "답 | 터미널"(마지막에 고른 쪽을 이 기기에 기억, VIEW_KEY)
// - 답 보기: 기다리는 요청, 마지막 답(마크다운), 지시, 터미널 끝 40줄(글), 기록 더 보기(P353 그대로)
// - 터미널 보기: 그 세션의 살아 있는 터미널(xterm). mterm.js·mterm.css를 처음 고를 때만 읽고, 한 번에 하나만 붙인다.
//   답 보기로 바꾸거나 화면을 떠나면 떼고 버린다. 응답 필요면 질문 카드가 터미널 위에 겹친다(접을 수 있다). 바로 치기(키보드 단추)는 화면 키보드로 터미널에 직접 친다
// - 키 줄: 늘 보이는 한 줄(펼침, Esc ⏎ ↑ ↓ 1 2 3)과 펼치면 두 줄(Ctrl C, Tab, ⇧Tab, ← →, 4, ⌫, y, n, /, Space, 글자 크기). 펼침은 이 기기에 기억.
//   키는 session.keys 이름으로 보낸다(차례로, keyQueue). 응답 필요면 숫자가 노랗다
// - 입력 줄: 에이전트는 대기열(고르면 스티어링), 셸은 한 줄 치기(phone.type)
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { toast } from './store.js';
import { useMobile, call, putDeliveries, noteFail } from './mobile-store.js';
import { useT, errText } from './lib/i18n.js';
import { STATE_LABEL, deliveryText, shellStateText } from './lib/labels.js';
import { toneOf, needsYou, isDone, choiceButtons, PINS_KEY, togglePin, readList, detailStale, mergeHistory, KEY_MAIN, KEY_MORE, KEY_GLYPH, KEY_WIDE, keyId, isNumKey, KEYS_OPEN_KEY, VIEW_KEY, viewOf, readView, readFlag, isLive } from './lib/mobile.js';
import { keyQueue, sendPlan, nextNeed } from './lib/phone.js';
import { steerBlock } from './lib/steer.js';
import { Markdown } from './Markdown.jsx';
import { SessionMuteButton } from './PhonePush.jsx';
import { useVoice, VoiceButton, VoiceInterim } from './Voice.jsx';
import { markInteracted, enterSession } from './touch.js';
import { setDraftSource, takeSavedDraft } from './shell-update.js';
import { activeCards } from './lib/decisions.js';
import { TodoCard } from './MobileApp.jsx'; // P357: 할 일 카드(홈과 같은 카드)

const store = () => { try { return localStorage; } catch { return null; } };
const DONE = new Set(['confirmed', 'unconfirmed', 'failed', 'cancelled']);
const I = {
  chev: 'm6 9 6 6 6-6', chevUp: 'm6 15 6-6 6 6', back: 'm15 18-6-6 6-6', right: 'm9 18 6-6-6-6', bolt: 'M13 2 4 14h7l-1 8 9-12h-7z', up: 'M12 19V5M5 12l7-7 7 7',
  star: 'm12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z',
  kb: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 9.5h.01M10.5 9.5h.01M14 9.5h.01M17.5 9.5h.01M7 13h.01M17 13h.01M8 16h8',
};
const Ic = ({ d, s }) => <svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={s ? { width: s, height: s } : undefined}><path d={d} /></svg>;
const noFocus = (e) => e.preventDefault();
function useNow(ms) { const [n, set] = useState(Date.now()); useEffect(() => { const id = setInterval(() => set(Date.now()), ms); return () => clearInterval(id); }, [ms]); return n; }
function ago(t, at, now) {
  if (!at) return '';
  const sec = Math.max(0, Math.round((now - at) / 1000));
  if (sec < 60) return t('mobile.now');
  if (sec < 3600) return t('mobile.min', { n: Math.round(sec / 60) });
  if (sec < 86400) return t('mobile.hour', { n: Math.round(sec / 3600) });
  return t('mobile.day', { n: Math.round(sec / 86400) });
}
const wsNameOf = (ws, key) => { const w = ws.find((x) => x.key === key); return w ? w.name : key ? String(key).split('/').filter(Boolean).slice(-1)[0] : ''; };
function stateText(t, s) { if (s.kind === 'shell' && s.state !== 'sleeping' && s.state !== 'exited') return shellStateText(s); if (isDone(s)) return t('mobile.done'); return STATE_LABEL[s.state] || s.state; }
const askTitle = (t, s, a) => (s.state === 'trust_wait' ? t('phone.ask_trust') : a && a.kind === 'permission' ? t('phone.ask_permission', { tool: a.tool || '' }) : t(`phone.ask_${(s.line && s.line.key) || 'screen'}`));

// ---------- 터미널 묶음(늦게 읽기) ----------
let termMod = null;
let TermComp = null; // 한 번 읽은 뒤에는 바로 그린다
export function loadTerm() {
  if (termMod) return termMod;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'mterm.css'; document.head.appendChild(css);
  const url = new URL('mterm.js', import.meta.url).href; // 글로 만든 주소: esbuild가 이 묶음에 넣지 않는다
  termMod = import(url).then((m) => { TermComp = m.MobileTerm; return m; }).catch((e) => { termMod = null; css.remove(); noteFail('load', 'mterm', e); throw e; });
  return termMod;
}
function TermPane({ s, scale, direct, onDirectEnd }) {
  const t = useT();
  const [Comp, setComp] = useState(() => TermComp);
  const [err, setErr] = useState(null);
  useEffect(() => { let alive = true; if (!Comp) loadTerm().then((m) => { if (alive) setComp(() => m.MobileTerm); }).catch((e) => { if (alive) setErr(errText(e)); }); return () => { alive = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const info = useMemo(() => ({ kind: s.kind, state: s.state }), [s.kind, s.state]);
  if (!Comp) return <div className="mt-mp-empty" data-role="mp-term-loading">{err ? t('mobile.termFailed', { error: err }) : t('mobile.termLoading')}</div>;
  return <Comp sessionId={s.sessionId} info={info} scale={scale} direct={direct} onDirectEnd={onDirectEnd} onInput={() => markInteracted(s.sessionId)} />;
}

// ---------- 기다리는 요청(답 보기의 블록, 터미널 보기의 겹친 카드) ----------
function AskBody({ s, a, press }) {
  return (
    <>
      {a && a.summary && <div className="mt-mp-sub pad">{a.summary}</div>}
      {a && a.plan && <div className="mt-mp-md"><Markdown text={a.plan} /></div>}
      {a && a.questions && a.questions.map((q, i) => <div key={i} className="mt-mp-qq"><b>{q.question}</b>{q.options.length > 0 && <ol>{q.options.map((o) => <li key={o}>{o}</li>)}</ol>}</div>)}
      {a && a.choices && a.choices.length > 0 && <div className="mt-mp-choices col">{a.choices.map((c) => <button key={c.n} type="button" className="mt-mp-choice" data-mp-choice={c.n} onPointerDown={noFocus} onClick={() => press(String(c.n))}><b>{c.n}</b> {c.label}</button>)}</div>}
      {a && a.question && !(a.choices && a.choices.length) && <div className="mt-mp-sub pad">{a.question}</div>}
    </>
  );
}

// 터미널 보기의 겹친 질문 카드(작게): 묻는 것 한 줄, 짧은 보기 단추(홈 응답 필요 카드와 같은 모양), Esc, 접기. 전체 카드는 답 보기에
function AskCompact({ s, a, t, press, onHide }) {
  const btns = s.state === 'trust_wait' ? [] : choiceButtons(a);
  const line = (a && (a.question || a.summary)) || (s.line && s.line.text) || '';
  return (
    <div className="mt-mp-card need mt-ms-ask" data-role="mp-term-ask">
      <div className="mt-mp-q">{askTitle(t, s, a)}</div>
      {line && <div className="mt-mp-sub mt-ms-askline">{String(line).split('\n')[0]}</div>}
      <div className="mt-mp-acts">
        {btns.map((b, i) => <button key={b.key} type="button" className={'mt-mp-btn' + (i === 0 ? ' attn' : '')} data-mp-choice={b.key} title={b.label} onPointerDown={noFocus} onClick={() => press(b.key)}>{b.key}{b.short ? ' ' + b.short : ''}</button>)}
        {s.state !== 'trust_wait' && <button type="button" className="mt-mp-btn ghost" data-mp-choice="esc" onPointerDown={noFocus} onClick={() => press('esc')}>Esc</button>}
        <span className="mt-mp-sp" />
        <button type="button" className="mt-mp-btn ghost" data-action="mp-ask-hide" onClick={onHide}>{t('mobile.askHide')}</button>
      </div>
    </div>
  );
}

// ---------- 키 줄 ----------
// 8칸 격자: 늘 [펼침 Esc ⏎ ↑ ↓ 1 2 3], 펼치면 [Ctrl C, Tab, ⇧Tab, ←, →, 4, ⌫⌫]과 [y, n, /, Space×3, A−, A+]
export function KeyBar({ need, open, setOpen, onKey, bump }) {
  const t = useT();
  const cell = (k) => {
    const g = KEY_GLYPH[k] || k;
    return <button key={k} type="button" className={'mt-mp-key' + (isNumKey(k) ? ' num' : '') + (g.length > 3 ? ' small' : '')} data-mp-key={k} style={KEY_WIDE[k] ? { gridColumn: 'span ' + KEY_WIDE[k] } : undefined} aria-label={t(`mobile.key_${keyId(k)}`)} onPointerDown={noFocus} onClick={() => onKey(k)}>{g}</button>;
  };
  return (
    <div className={'mt-mp-keys' + (need ? ' need' : '')} data-role="mp-keys" data-open={open ? '1' : '0'} role="group" aria-label={t('phoneKeys.group')}>
      <button type="button" className="mt-mp-key more" data-action="mp-keys-more" aria-expanded={open} aria-label={t(open ? 'mobile.keysLess' : 'mobile.keysMore')} title={t(open ? 'mobile.keysLess' : 'mobile.keysMore')} onPointerDown={noFocus} onClick={() => setOpen(!open)}><Ic d={open ? I.chev : I.chevUp} s={18} /></button>
      {KEY_MAIN.map(cell)}
      {open && KEY_MORE.map(cell)}
      {open && <button type="button" className="mt-mp-key small" data-action="mp-keys-font-down" aria-label={t('mobile.fontDown')} onPointerDown={noFocus} onClick={() => bump(-0.05)}>A−</button>}
      {open && <button type="button" className="mt-mp-key small" data-action="mp-keys-font-up" aria-label={t('mobile.fontUp')} onPointerDown={noFocus} onClick={() => bump(0.05)}>A+</button>}
    </div>
  );
}

// ---------- 세션 화면 ----------
export function SessionScreen({ s, onBack, onGo, needIds, bump, scale }) {
  const t = useT();
  const id = s.sessionId;
  const ws = useMobile((m) => m.workspaces);
  const deliveries = useMobile((m) => m.deliveries);
  const allCards = useMobile((m) => m.cards);
  const mine = activeCards(allCards).filter((d) => d.sessionId === id); // P357: 이 세션의 열린 할 일 카드(답 보기 맨 위, 터미널 보기는 접힌 알약 → 겹친 작은 창)
  const cardNow = useNow(30000);
  const [todosOpen, setTodosOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [termOpen, setTermOpen] = useState(null); // null: 저절로(일하거나 기다리거나 셸이면 펼침)
  const [hist, setHist] = useState({ items: [], more: true, before: null, busy: false });
  const [pins, setPins] = useState(() => readList(store(), PINS_KEY));
  const [stored, setStored] = useState(() => readView(store()));
  const [keysOpen, setKeysOpenRaw] = useState(() => readFlag(store(), KEYS_OPEN_KEY));
  const [direct, setDirect] = useState(false);
  const live = isLive(s);
  const need = needsYou(s);
  const view = viewOf(stored, s);
  const viewRef = useRef(view); viewRef.current = view;
  const pick = (v) => { setStored(v); try { store().setItem(VIEW_KEY, v); } catch {} if (v !== 'term') setDirect(false); };
  const setKeysOpen = (v) => { setKeysOpenRaw(v); try { store().setItem(KEYS_OPEN_KEY, v ? '1' : '0'); } catch {} };
  // 응답 필요 카드를 접었으면 기다리는 요청이 바뀔 때 다시 편다
  const askSig = need ? s.state + '|' + ((s.ask && s.ask.since) || s.waitingSince || '') : 'calm';
  const [askHidden, setAskHidden] = useState(false);
  useEffect(() => setAskHidden(false), [askSig]);
  const prev = useRef(null);
  const timer = useRef(0);
  const lastFetch = useRef(0);
  // 터미널 보기는 짧게(brief: 마지막 답·끝 줄 없이). 보기를 바꾸면 다시 받는다
  const fetchDetail = () => {
    clearTimeout(timer.current);
    const run = () => { lastFetch.current = Date.now(); call('phone.session', viewRef.current === 'term' ? { session: id, brief: true } : { session: id, lines: 40 }).then((d) => { setDetail((old) => (d.brief && old ? { ...old, ...d, lastAnswer: old.lastAnswer, lastPrompt: old.lastPrompt, tail: old.tail } : d)); putDeliveries(d.deliveries); }).catch(() => {}); };
    const wait = 1200 - (Date.now() - lastFetch.current);
    if (wait > 0) timer.current = setTimeout(run, wait); else run();
  };
  // 보는 중: 이 세션은 저절로 잠재우지 않는다(판 sleep.mjs board.viewing). 30초마다, 떠나면 비운다
  useEffect(() => { const say = (on) => api.call('board.viewing', on ? { focus: id, close: [id], inputAgoMs: 0 } : { focus: null, close: [] }).catch(() => {}); say(true); const iv = setInterval(() => say(true), 30000); return () => { clearInterval(iv); say(false); }; }, [id]);
  // 열 때, 줄이 바뀔 때(상태·답·활동·요청), 다시 붙을 때
  useEffect(() => { enterSession(id); if (s.unseen) call('session.markSeen', { session: id }).catch(() => {}); fetchDetail(); const off = api.on('$open', () => fetchDetail()); return () => { off(); clearTimeout(timer.current); api.call('phone.close').catch(() => {}); }; }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (prev.current && detailStale(prev.current, s)) fetchDetail(); prev.current = s; if (s.unseen && prev.current) call('session.markSeen', { session: id }).catch(() => {}); }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (view === 'answer' && detail && detail.brief) { lastFetch.current = 0; fetchDetail(); } }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  const keys = useMemo(() => keyQueue((list) => call('session.keys', { session: id, keys: list }, { kind: 'keys' }), (e) => { if (e.code !== 'disconnected') toast(t('phoneKeys.failed', { error: errText(e) }), 'error'); }), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const press = (k) => { markInteracted(id); keys.push(k); if (viewRef.current === 'answer' || needsYou(s)) setTimeout(fetchDetail, 700); };
  // 바로 치기: 화면 키보드를 터미널(xterm 입력 칸)에 연다. 누르는 동안(사용자 동작 안)에 초점을 줘야 iOS가 키보드를 띄운다
  const typeDirect = () => {
    const ta = document.querySelector('[data-role=mp-termbox] .xterm-helper-textarea');
    if (direct) { setDirect(false); if (ta) ta.blur(); return; }
    if (!ta) { toast(t('mobile.termLoading')); return; }
    ta.setAttribute('inputmode', 'text'); ta.removeAttribute('aria-hidden');
    ta.focus();
    setDirect(true);
  };
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
    <div className="mt-mp-session" data-role="mp-session" data-session={id} data-state={s.state} data-sview={view}>
      <header className="mt-mp-shead">
        <button type="button" className="mt-mp-back" data-action="mp-back" onClick={onBack}><Ic d={I.back} /><span>{t('phone.list')}</span></button>
        <div className="mt-mp-title"><b><span className="mt-mp-dot" data-tone={toneOf(s)} />{s.name}</b><span>{sub}</span></div>
        {next && <button type="button" className="mt-mp-next" data-action="mp-next" onClick={() => onGo(next)}>{t('phone.nextShort', { n: needIds.filter((x) => x !== id).length })}<Ic d={I.right} s={16} /></button>}
        {s.kind !== 'shell' && <SessionMuteButton sessionId={id} />}
        <button type="button" className={'mt-mp-ib' + (pinned ? ' on' : '')} data-action="mp-pin-session" aria-pressed={pinned} aria-label={t(pinned ? 'mobile.unpin' : 'mobile.pin')} onClick={pin}><Ic d={I.star} /></button>
      </header>
      {live && (
        <div className="mt-ms-seg" data-role="mp-viewpick">
          <div className="mt-ms-segs" role="tablist" aria-label={t('mobile.viewLabel')}>
            <button type="button" role="tab" aria-selected={view === 'answer'} data-action="mp-view-answer" onClick={() => pick('answer')}>{t('mobile.viewAnswer')}</button>
            <button type="button" role="tab" aria-selected={view === 'term'} data-action="mp-view-term" onClick={() => pick('term')}>{t('mobile.viewTerm')}</button>
          </div>
          <span className="mt-mp-sp" />
          {view === 'term' && <button type="button" className={'mt-ms-kb' + (direct ? ' on' : '')} data-action="mp-type-direct" aria-pressed={direct} title={t('mobile.typeDirectTitle')} onPointerDown={noFocus} onClick={typeDirect}><Ic d={I.kb} s={18} /><span>{t(direct ? 'mobile.typeDirectOff' : 'mobile.typeDirect')}</span></button>}
        </div>
      )}
      {view === 'term' ? (
        <div className="mt-ms-termarea" data-role="mp-termview">
          <TermPane s={s} scale={scale} direct={direct} onDirectEnd={() => setDirect(false)} />
          {need && (askHidden
            ? <button type="button" className="mt-ms-askpill" data-action="mp-ask-show" onClick={() => setAskHidden(false)}><span className="mt-mp-dot" data-tone="waiting" />{askTitle(t, s, a)}<Ic d={I.chev} s={14} /></button>
            : (
              <AskCompact s={s} a={a} t={t} press={press} onHide={() => setAskHidden(true)} />
            ))}
          {mine.length > 0 && (todosOpen
            ? <div className="mt-ms-todos" data-role="mp-term-todos" data-count={mine.length}>{mine.map((d) => <TodoCard key={d.id} d={d} now={cardNow} cards={allCards} />)}<div className="mt-mp-acts"><span className="mt-mp-sp" /><button type="button" className="mt-mp-btn ghost" data-action="mp-todos-hide" onClick={() => setTodosOpen(false)}>{t('mobile.askHide')}</button></div></div>
            : <button type="button" className="mt-ms-todopill" data-action="mp-todos-show" data-count={mine.length} onClick={() => setTodosOpen(true)}>{t('termTodos.pill', { n: mine.length })}<Ic d={I.chevUp} s={14} /></button>)}
        </div>
      ) : (
        <div className="mt-mp-sbody" data-role="mp-sbody">
          {mine.length > 0 && <div className="mt-mp-stodos" data-role="mp-session-todos" data-count={mine.length}>{mine.map((d) => <TodoCard key={d.id} d={d} now={cardNow} cards={allCards} />)}</div>}
          {s.state === 'sleeping' && <div className="mt-mp-cover" data-role="mp-asleep"><p>{t('phone.asleep')}</p><button type="button" className="mt-mp-btn pri" data-action="mp-wake" onClick={() => call('session.wake', { session: id }).catch((e) => toast(errText(e), 'error'))}>{s.waking ? t('phone.waking') : t('phone.wake')}</button></div>}
          {s.state === 'exited' && <div className="mt-mp-cover"><p>{t('phone.exited')}</p></div>}
          {need && (
            <div className="mt-mp-block need" data-role="mp-ask">
              <div className="mt-mp-block-h">{askTitle(t, s, a)}</div>
              <AskBody s={s} a={a} press={press} />
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
      )}
      {queue.length > 0 && (
        <div className="mt-mp-queue" data-role="mp-queue">{queue.slice(0, 3).map((d) => (
          <div key={d.deliveryId} className="q"><span>{deliveryText(d)}{d.text ? ' · “' + d.text + '”' : ''}</span>
            {d.status === 'queued' && <button type="button" onClick={() => call('delivery.now', { deliveryId: d.deliveryId }).catch((e) => toast(errText(e), 'error'))}>{t('mobile.sendNow')}</button>}
            <button type="button" onClick={() => call('delivery.cancel', { deliveryId: d.deliveryId }).catch((e) => toast(errText(e), 'error'))}>{t('common.cancel')}</button></div>
        ))}</div>
      )}
      {live && <KeyBar need={need} open={keysOpen} setOpen={setKeysOpen} onKey={press} bump={bump} />}
      {live && !direct && <InputRow s={s} />}
    </div>
  );
}

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

