// P355: 휴대폰 전용 페이지의 세션 화면(MobileApp.jsx에서 떼어 냈다. 홈·세션 목록·맵 탭은 MobileApp.jsx).
// P358: 세션 화면은 살아 있는 터미널만 보인다(답 보기·"답 | 터미널" 전환 줄 없음). 어디서 열든 같다
// - 위: 머리줄(뒤로, 이름·상태, 다음 응답 필요, 바로 치기, 알림 끄기, 고정)
// - 가운데: 그 세션의 살아 있는 터미널(xterm). mterm.js·mterm.css를 세션 화면을 열 때 읽고(첫 열기 묶음에는 없다), 한 번에 하나만 붙인다.
//   화면을 떠나면 떼고 버린다. 잠들었으면 깨우기, 끝났으면 안내
// - 오른쪽 아래 작은 단추: 기다리는 요청(권한·질문)이 있으면 노란 "응답 필요", 할 일 카드만 있으면 "할 일 n". 기본은 접혀 있고
//   누르면 겹친 카드(작은 글, 터미널 칸의 절반까지, 넘으면 카드 안 스크롤, 여러 장이면 ‹ 1/2 ›)
// - 바로 치기(머리줄 키보드 단추): 화면 키보드를 터미널(xterm 입력 칸)에 연다. 붙기 전에 친 글은 TerminalView가 모았다가 붙은 뒤 보낸다
// - 키 줄: 늘 보이는 한 줄(펼침, Esc ⏎ ↑ ↓ 1 2 3)과 펼치면 두 줄(Ctrl C, Tab, ⇧Tab, ← →, 4, ⌫, y, n, /, Space, 글자 크기). 펼침은 이 기기에 기억.
//   키는 session.keys 이름으로 보낸다(차례로, keyQueue). 응답 필요면 숫자가 노랗다
// - 입력 줄: 에이전트는 대기열(고르면 스티어링), 셸은 한 줄 치기(phone.type)
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { toast } from './store.js';
import { useMobile, call, putDeliveries, noteFail } from './mobile-store.js';
import { useT, errText } from './lib/i18n.js';
import { STATE_LABEL, deliveryText, shellStateText } from './lib/labels.js';
import { toneOf, needsYou, isDone, choiceButtons, PINS_KEY, togglePin, readList, detailStale, KEY_MAIN, KEY_MORE, KEY_GLYPH, KEY_WIDE, keyId, isNumKey, KEYS_OPEN_KEY, readFlag, isLive, overlayButton, overlayPages, clampPage } from './lib/mobile.js';
import { keyQueue, sendPlan, nextNeed } from './lib/phone.js';
import { steerBlock } from './lib/steer.js';
import { SessionMuteButton } from './PhonePush.jsx';
import { useVoice, VoiceButton, VoiceInterim } from './Voice.jsx';
import { markInteracted, enterSession } from './touch.js';
import { setDraftSource, takeSavedDraft } from './shell-update.js';
import { activeCards } from './lib/decisions.js';
import { TodoCard } from './MobileApp.jsx'; // P357: 할 일 카드(홈과 같은 카드)

const store = () => { try { return localStorage; } catch { return null; } };
const DONE = new Set(['confirmed', 'unconfirmed', 'failed', 'cancelled']);
const I = {
  chev: 'm6 9 6 6 6-6', chevUp: 'm6 15 6-6 6 6', back: 'm15 18-6-6 6-6', right: 'm9 18 6-6-6-6', left: 'm15 18-6-6 6-6', bolt: 'M13 2 4 14h7l-1 8 9-12h-7z', up: 'M12 19V5M5 12l7-7 7 7',
  star: 'm12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z',
  kb: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 9.5h.01M10.5 9.5h.01M14 9.5h.01M17.5 9.5h.01M7 13h.01M17 13h.01M8 16h8',
};
const Ic = ({ d, s }) => <svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={s ? { width: s, height: s } : undefined}><path d={d} /></svg>;
const noFocus = (e) => e.preventDefault();
function useNow(ms) { const [n, set] = useState(Date.now()); useEffect(() => { const id = setInterval(() => set(Date.now()), ms); return () => clearInterval(id); }, [ms]); return n; }
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

// ---------- 기다리는 요청(겹친 카드 한 장) ----------
// 묻는 것(세 줄까지), 짧은 보기 단추(홈 응답 필요 카드와 같은 choiceButtons, 전체 글은 title), Esc
function AskCompact({ s, a, t, press }) {
  const btns = s.state === 'trust_wait' ? [] : choiceButtons(a);
  const line = (a && (a.question || a.summary)) || (s.line && s.line.text) || '';
  return (
    <div className="mt-mp-card need mt-ms-askcard" data-role="mp-term-ask">
      <div className="mt-mp-q">{askTitle(t, s, a)}</div>
      {line && <div className="mt-mp-sub mt-ms-askq">{String(line)}</div>}
      <div className="mt-mp-acts">
        {btns.map((b, i) => <button key={b.key} type="button" className={'mt-mp-btn' + (i === 0 ? ' attn' : '')} data-mp-choice={b.key} title={b.label} onPointerDown={noFocus} onClick={() => press(b.key)}>{b.key}{b.short ? ' ' + b.short : ''}</button>)}
        {s.state !== 'trust_wait' && <button type="button" className="mt-mp-btn ghost" data-mp-choice="esc" onPointerDown={noFocus} onClick={() => press('esc')}>Esc</button>}
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
  const mine = activeCards(allCards).filter((d) => d.sessionId === id); // P357: 이 세션의 열린 할 일 카드
  const cardNow = useNow(30000);
  const [detail, setDetail] = useState(null);
  const [pins, setPins] = useState(() => readList(store(), PINS_KEY));
  const [keysOpen, setKeysOpenRaw] = useState(() => readFlag(store(), KEYS_OPEN_KEY));
  const [direct, setDirect] = useState(false);
  const [overOpen, setOverOpen] = useState(false); // P358: 겹친 카드는 기본으로 접는다
  const [pageKey, setPageKey] = useState(null);
  const live = isLive(s);
  const need = needsYou(s);
  const setKeysOpen = (v) => { setKeysOpenRaw(v); try { store().setItem(KEYS_OPEN_KEY, v ? '1' : '0'); } catch {} };
  const prev = useRef(null);
  const timer = useRef(0);
  const lastFetch = useRef(0);
  // 기다리는 요청·대기 글만 받는다(brief: 마지막 답·끝 줄 없이, 화면을 읽지 않는다)
  const fetchDetail = () => {
    clearTimeout(timer.current);
    const run = () => { lastFetch.current = Date.now(); call('phone.session', { session: id, brief: true }).then((d) => { setDetail(d); putDeliveries(d.deliveries); }).catch(() => {}); };
    const wait = 1200 - (Date.now() - lastFetch.current);
    if (wait > 0) timer.current = setTimeout(run, wait); else run();
  };
  // 보는 중: 이 세션은 저절로 잠재우지 않는다(판 sleep.mjs board.viewing). 30초마다, 떠나면 비운다
  useEffect(() => { const say = (on) => api.call('board.viewing', on ? { focus: id, close: [id], inputAgoMs: 0 } : { focus: null, close: [] }).catch(() => {}); say(true); const iv = setInterval(() => say(true), 30000); return () => { clearInterval(iv); say(false); }; }, [id]);
  // 열 때, 줄이 바뀔 때(상태·답·활동·요청), 다시 붙을 때. P358: 세션 화면이 열고 닫힐 때 페이지 높이를 다시 잰다
  useEffect(() => { enterSession(id); if (s.unseen) call('session.markSeen', { session: id }).catch(() => {}); fetchDetail(); const off = api.on('$open', () => fetchDetail()); if (window.__mtMobileFit) window.__mtMobileFit(); return () => { off(); clearTimeout(timer.current); api.call('phone.close').catch(() => {}); if (window.__mtMobileFit) window.__mtMobileFit(); }; }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (prev.current && detailStale(prev.current, s)) fetchDetail(); prev.current = s; if (s.unseen && prev.current) call('session.markSeen', { session: id }).catch(() => {}); }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  const keys = useMemo(() => keyQueue((list) => call('session.keys', { session: id, keys: list }, { kind: 'keys' }), (e) => { if (e.code !== 'disconnected') toast(t('phoneKeys.failed', { error: errText(e) }), 'error'); }), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const press = (k) => { markInteracted(id); keys.push(k); if (needsYou(s)) setTimeout(fetchDetail, 700); };
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
  const queue = [...deliveries.values()].filter((d) => d.sessionId === id && !DONE.has(d.status)).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const a = detail && detail.ask;
  // P358: 오른쪽 아래 작은 단추와 겹친 카드(요청 먼저, 그 뒤 할 일)
  const btn = overlayButton({ need, todos: mine.length });
  const pages = overlayPages({ need, todos: mine });
  const found = pages.findIndex((p) => p.key === pageKey);
  const page = clampPage(found < 0 ? 0 : found, pages.length);
  const cur = pages[page] || null;
  const go = (d) => { const p = pages[clampPage(page + d, pages.length)]; if (p) setPageKey(p.key); };
  useEffect(() => { if (!pages.length) setOverOpen(false); }, [pages.length]);
  const sub = [stateText(t, s), detail && detail.model ? String(detail.model).replace(/^claude-/, '') : s.model, wsNameOf(ws, s.workspaceKey)].filter(Boolean).join(' · ');
  return (
    <div className="mt-mp-session" data-role="mp-session" data-session={id} data-state={s.state}>
      <header className="mt-mp-shead">
        <button type="button" className="mt-mp-back" data-action="mp-back" onClick={onBack}><Ic d={I.back} /><span>{t('phone.list')}</span></button>
        <div className="mt-mp-title"><b><span className="mt-mp-dot" data-tone={toneOf(s)} />{s.name}</b><span>{sub}</span></div>
        {next && <button type="button" className="mt-mp-next" data-action="mp-next" onClick={() => onGo(next)}>{t('phone.nextShort', { n: needIds.filter((x) => x !== id).length })}<Ic d={I.right} s={16} /></button>}
        {live && <button type="button" className={'mt-mp-ib mt-ms-kbbtn' + (direct ? ' on' : '')} data-action="mp-type-direct" aria-pressed={direct} aria-label={t(direct ? 'mobile.typeDirectOff' : 'mobile.typeDirect')} title={t('mobile.typeDirectTitle')} onPointerDown={noFocus} onClick={typeDirect}><Ic d={I.kb} /></button>}
        {s.kind !== 'shell' && <SessionMuteButton sessionId={id} />}
        <button type="button" className={'mt-mp-ib' + (pinned ? ' on' : '')} data-action="mp-pin-session" aria-pressed={pinned} aria-label={t(pinned ? 'mobile.unpin' : 'mobile.pin')} onClick={pin}><Ic d={I.star} /></button>
      </header>
      <div className="mt-ms-termarea" data-role="mp-termview">
        {live && <TermPane s={s} scale={scale} direct={direct} onDirectEnd={() => setDirect(false)} />}
        {s.state === 'sleeping' && <div className="mt-mp-cover mt-ms-cover" data-role="mp-asleep"><p>{t('phone.asleep')}</p><button type="button" className="mt-mp-btn pri" data-action="mp-wake" onClick={() => call('session.wake', { session: id }).catch((e) => toast(errText(e), 'error'))}>{s.waking ? t('phone.waking') : t('phone.wake')}</button></div>}
        {s.state === 'exited' && <div className="mt-mp-cover mt-ms-cover"><p>{t('phone.exited')}</p></div>}
        {btn && !overOpen && (
          <button type="button" className={'mt-ms-overbtn ' + btn.kind} data-action="mp-over-show" data-kind={btn.kind} data-count={btn.n} onClick={() => setOverOpen(true)}>
            {btn.kind === 'need' ? <><span className="mt-mp-dot" data-tone="waiting" />{t('mobileOver.need')}{btn.n > 1 ? ' ' + btn.n : ''}</> : t('termTodos.pill', { n: btn.n })}<Ic d={I.chevUp} s={14} />
          </button>
        )}
        {overOpen && cur && (
          <div className={'mt-ms-over' + (cur.kind === 'ask' ? ' need' : '')} data-role="mp-over" data-kind={cur.kind} data-page={page + 1} data-pages={pages.length}>
            <div className="mt-ms-overhead">
              <b>{cur.kind === 'ask' ? t('mobileOver.need') : t('mobileOver.todo')}</b>
              <span className="mt-mp-sp" />
              {pages.length > 1 && (
                <span className="mt-ms-pager" data-role="mp-over-pager">
                  <button type="button" data-action="mp-over-prev" disabled={page === 0} aria-label={t('mobileOver.prev')} onClick={() => go(-1)}><Ic d={I.left} s={16} /></button>
                  <span>{page + 1}/{pages.length}</span>
                  <button type="button" data-action="mp-over-next" disabled={page >= pages.length - 1} aria-label={t('mobileOver.next')} onClick={() => go(1)}><Ic d={I.right} s={16} /></button>
                </span>
              )}
              <button type="button" className="mt-ms-overhide" data-action="mp-over-hide" onClick={() => setOverOpen(false)}>{t('mobile.askHide')}<Ic d={I.chev} s={14} /></button>
            </div>
            <div className="mt-ms-overbody" data-role="mp-over-body">
              {cur.kind === 'ask' ? <AskCompact s={s} a={a} t={t} press={press} /> : <TodoCard key={cur.d.id} d={cur.d} now={cardNow} cards={allCards} compact />}
            </div>
          </div>
        )}
      </div>
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

