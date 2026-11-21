// P284: 결정 카드의 창 쪽(판 쪽 backend/src/decisions.mjs). 에이전트가 사람에게 글로 물은 질문(atrium ask)을 "내 차례" 줄과 따로 모아 보인다.
// - PC: 위 오른쪽 알약(DecisionPill, 응답 필요와 따로 센다). 누르면 오래 기다린 것부터 목록: 세션 이름(누르면 그 세션으로), 질문, 맥락,
//   기다린 시간, 보기 단추, 한 줄 답 칸, 무시. 보기나 답을 보내면 판이 그 세션에 "[결정] <질문> → <답>"을 대기열로 넣고, 무시는 아무것도 보내지 않는다.
// - 세션 카드(캔버스 노드 머리)와 세션 맵 카드에 작은 표식(DecisionMark).
// - P286: 판이 마지막 답에서 만든 자동 카드는 줄과 표식에 작게 "자동"을 단다. 한 세션의 열린 카드가 여럿이면 답을 모아 두었다가 모두 끝나면 판이 한 글로 보내고,
//   목록은 그 세션의 첫 카드 위에 모은 답 수와 "지금 보내기"를 보인다.
// - 휴대폰: 세션 맵 위 알약 줄(PhoneDecisionPill). 누르면 같은 목록을 아래 시트로. 세션 이름을 누르면 그 세션 화면.
// - P292: 사용자 몫. 알약 이름이 "내 몫 n"(en "For you n")이 되고, 카드마다 작은 종류 표(결정·할 일·확인·나중에)를 단다.
//   할 일: 명령(고정폭, 명령마다 복사 단추) + 했음·미루기·무시. 확인: 됐다/안 됐다 + 한 줄 메모·미루기·무시. 결정: 지금 그대로 + 미루기.
//   미루기는 1시간·내일 아침·날짜 고르기. 미룬 카드와 나중에 카드는 목록 끝 "나중 n"(접힘, 때·조건 보임)에 있고 꺼내기·무시.
//   알약·표식의 수는 지금 목록(나중 줄 뺌)만 센다(종류 구별 없이).
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useStore, getState, toast, answerDecision, ignoreDecision, flushDecisions, doneDecision, checkDecision, snoozeDecision, raiseDecision, wsName } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { ago } from './lib/labels.js';
import { answerReady, firstCardIds, allAuto, activeCards, laterCards, actionOf, snoozeTimes, pickedTime, pickDefault, whenText } from './lib/decisions.js';

function useNow(ms = 15000) { const [n, set] = useState(Date.now()); useEffect(() => { const id = setInterval(() => set(Date.now()), ms); return () => clearInterval(id); }, [ms]); return n; }
const nameOf = (d) => { const s = getState().sessions.get(d.sessionId); return (s && s.name) || d.name || '?'; };
const stop = (e) => e.stopPropagation();
// P292: 알림. PC는 판의 알림 줄(긴 글), 휴대폰 시트는 시트 머리 아래 한 줄(짧은 글, 새 것이 옛 것을 바꾼다. 누르는 카드를 가리지 않게)
const SayCtx = createContext((long, short, level) => toast(long, level));
const useSay = () => useContext(SayCtx);
function useSheetNote() {
  const [note, setNote] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const say = (long, short, level) => { clearTimeout(timer.current); setNote({ text: short || long, level: level || 'info', id: Date.now() }); timer.current = setTimeout(() => setNote(null), level === 'error' ? 4000 : 2200); };
  return [note, say];
}

// P292: 글을 클립보드에(보안 출처가 아닌 휴대폰 웹 화면은 textarea로)
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

// P286: 한 세션의 모은 답 줄(그 세션의 첫 카드 위)
function HeldLine({ sessionId, n, t }) {
  const say = useSay();
  const [busy, setBusy] = useState(false);
  const name = nameOf({ sessionId });
  const send = async () => {
    setBusy(true);
    try { await flushDecisions(sessionId); say(t('autoDecisions.flushed', { name, n }), t('userTasks.s.flushed', { n })); }
    catch (e) { say(t('decisions.fail', { error: errText(e) }), t('decisions.fail', { error: errText(e) }), 'error'); }
    setBusy(false);
  };
  return (
    <div className="mt-dc-held" data-role="decision-held" data-session={sessionId} data-count={n}>
      <span title={t('autoDecisions.heldTitle')}><b className="mt-dc-held-name">@{name}</b>: {t('autoDecisions.held', { n })}</span>
      <button type="button" className="mt-btn small" data-action="decision-flush" disabled={busy} onClick={send}>{t('autoDecisions.sendNow')}</button>
    </div>
  );
}

// P292: 카드 머리(세션 이름, 워크스페이스, 종류 표, 자동 표, 기다린 시간)
function CardHead({ d, onGo, now, t }) {
  const name = nameOf(d);
  return (
    <div className="mt-dc-line">
      <button type="button" className="mt-dc-name" data-action="decision-go" title={t('decisions.goTitle', { name })} onClick={() => onGo(d.sessionId)}>@{name}</button>
      {d.workspaceKey ? <span className="mt-chip-ws">{wsName(d.workspaceKey)}</span> : null}
      <span className={`mt-ut-kind k-${d.kind}`} data-role="decision-kind" data-kind={d.kind}>{t(`userTasks.kind.${d.kind}`)}</span>
      {d.auto ? <span className="mt-dc-auto" data-role="decision-auto" title={t('autoDecisions.tagTitle')}>{t('autoDecisions.tag')}</span> : null}
      {d.tell ? <span className="mt-ut-tell" data-role="decision-tell" title={t('userTasks.tellTitle')}>{t('userTasks.tell')}</span> : null}
      <span className="mt-dc-time" title={t('decisions.waited')}>{ago(d.createdAt, now)}</span>
    </div>
  );
}

// P292: 명령(고정폭, 명령마다 복사)
function Cmds({ d, t }) {
  const say = useSay();
  const [done, setDone] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!d.cmds.length) return null;
  const copy = async (c, i) => {
    const ok = await copyText(c);
    setDone(ok ? i : null); clearTimeout(timer.current); timer.current = setTimeout(() => setDone(null), 1500);
    say(ok ? t('userTasks.copied') : t('userTasks.copyFail'), ok ? t('userTasks.s.copied') : t('userTasks.copyFail'), ok ? undefined : 'error');
  };
  return (
    <div className="mt-ut-cmds" data-role="todo-cmds">
      {d.cmds.map((c, i) => (
        <div key={i} className="mt-ut-cmd" data-role="todo-cmd">
          <code className="mono">{c}</code>
          <button type="button" className={`mt-btn small mt-ut-copy${done === i ? ' ok' : ''}`} data-action="todo-copy" data-cmd={c} onClick={() => copy(c, i)}>{done === i ? t('userTasks.copiedShort') : t('userTasks.copy')}</button>
        </div>
      ))}
    </div>
  );
}

// P292: 미루기(1시간·내일 아침·날짜 고르기)
function Snooze({ d, t, busy, setBusy }) {
  const say = useSay();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(null);
  const name = nameOf(d);
  const go = async (until) => {
    if (!until) return;
    setBusy(true);
    try { await snoozeDecision(d.id, until); say(t('userTasks.snoozed', { name, when: whenText(until) }), t('userTasks.s.snoozed', { when: whenText(until) })); }
    catch (e) { say(t('decisions.fail', { error: errText(e) }), t('decisions.fail', { error: errText(e) }), 'error'); setBusy(false); }
  };
  if (!open) return <button type="button" className="mt-btn small ghost" data-action="snooze" disabled={busy} title={t('userTasks.snoozeTitle')} onClick={() => setOpen(true)}>{t('userTasks.snooze')}</button>;
  const tm = snoozeTimes();
  return (
    <div className="mt-ut-snooze" data-role="snooze-menu">
      <button type="button" className="mt-btn small" data-action="snooze-hour" disabled={busy} onClick={() => go(tm.hour)}>{t('userTasks.snoozeHour')}</button>
      <button type="button" className="mt-btn small" data-action="snooze-morning" disabled={busy} onClick={() => go(tm.morning)}>{t('userTasks.snoozeMorning')}</button>
      {pick == null
        ? <button type="button" className="mt-btn small" data-action="snooze-pick" disabled={busy} onClick={() => setPick(pickDefault())}>{t('userTasks.snoozePick')}</button>
        : <>
            <input type="datetime-local" className="mt-dc-input mt-ut-when" data-field="snooze-when" value={pick} onChange={(e) => setPick(e.target.value)} onKeyDown={stop} />
            <button type="button" className="mt-btn small primary" data-action="snooze-set" disabled={busy || !pickedTime(pick)} onClick={() => go(pickedTime(pick))}>{t('userTasks.snoozeSet')}</button>
          </>}
      <button type="button" className="mt-btn small ghost" data-action="snooze-cancel" onClick={() => { setOpen(false); setPick(null); }}>×</button>
    </div>
  );
}

function IgnoreBtn({ d, t, busy, setBusy }) {
  const say = useSay();
  const name = nameOf(d);
  const ignore = async () => {
    setBusy(true);
    try { await ignoreDecision(d.id); say(t('decisions.ignored', { name }), t('userTasks.s.ignored')); }
    catch (e) { say(t('decisions.fail', { error: errText(e) }), t('decisions.fail', { error: errText(e) }), 'error'); setBusy(false); }
  };
  return <button type="button" className="mt-btn small ghost" data-action="decision-ignore" title={t('decisions.ignoreTitle')} disabled={busy} onClick={ignore}>{t('decisions.ignore')}</button>;
}

function DecideBody({ d, t, busy, setBusy }) {
  const say = useSay();
  const [text, setText] = useState('');
  const name = nameOf(d);
  const send = async (answer) => {
    if (busy || !answerReady(answer)) return;
    setBusy(true);
    try { const r = await answerDecision(d.id, answer.trim()); say(r && r.held ? t('autoDecisions.heldToast', { name, n: r.waiting || 1 }) : t('decisions.sent', { name }), r && r.held ? t('userTasks.s.held', { n: r.waiting || 1 }) : t('userTasks.s.sent')); }
    catch (e) { say(t('decisions.fail', { error: errText(e) }), t('decisions.fail', { error: errText(e) }), 'error'); setBusy(false); }
  };
  return (
    <>
      {d.options.length > 0 && (
        <div className="mt-dc-opts">
          {d.options.map((o) => <button key={o} type="button" className="mt-btn small mt-dc-opt" data-action="decision-option" data-option={o} disabled={busy} onClick={() => send(o)}>{o}</button>)}
        </div>
      )}
      <form className="mt-dc-answer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input type="text" className="mt-dc-input" data-field="decision-text" value={text} maxLength={2000} placeholder={t('decisions.placeholder')} disabled={busy} onChange={(e) => setText(e.target.value)} onKeyDown={stop} />
        <button type="submit" className="mt-btn small primary" data-action="decision-send" disabled={busy || !answerReady(text)}>{t('decisions.send')}</button>
      </form>
      <div className="mt-ut-acts"><Snooze d={d} t={t} busy={busy} setBusy={setBusy} /><IgnoreBtn d={d} t={t} busy={busy} setBusy={setBusy} /></div>
    </>
  );
}

function DoBody({ d, t, busy, setBusy }) {
  const say = useSay();
  const name = nameOf(d);
  const did = async () => {
    setBusy(true);
    try { const r = await doneDecision(d.id); say(r && r.sent ? (r.held ? t('autoDecisions.heldToast', { name, n: r.waiting || 1 }) : t('userTasks.didSent', { name })) : t('userTasks.didToast', { name }), r && r.sent ? (r.held ? t('userTasks.s.held', { n: r.waiting || 1 }) : t('userTasks.s.didSent')) : t('userTasks.s.did')); }
    catch (e) { say(t('decisions.fail', { error: errText(e) }), t('decisions.fail', { error: errText(e) }), 'error'); setBusy(false); }
  };
  return (
    <div className="mt-ut-acts">
      <button type="button" className="mt-btn small primary" data-action="todo-done" title={t('userTasks.didTitle')} disabled={busy} onClick={did}>{t('userTasks.did')}</button>
      <Snooze d={d} t={t} busy={busy} setBusy={setBusy} />
      <IgnoreBtn d={d} t={t} busy={busy} setBusy={setBusy} />
    </div>
  );
}

function CheckBody({ d, t, busy, setBusy }) {
  const say = useSay();
  const [note, setNote] = useState('');
  const name = nameOf(d);
  const send = async (ok) => {
    if (busy) return;
    setBusy(true);
    try { const r = await checkDecision(d.id, ok, note.trim()); say(r && r.held ? t('autoDecisions.heldToast', { name, n: r.waiting || 1 }) : t('userTasks.checkSent', { name }), r && r.held ? t('userTasks.s.held', { n: r.waiting || 1 }) : t('userTasks.s.checkSent')); }
    catch (e) { say(t('decisions.fail', { error: errText(e) }), t('decisions.fail', { error: errText(e) }), 'error'); setBusy(false); }
  };
  return (
    <>
      <div className="mt-dc-answer mt-ut-check">
        <input type="text" className="mt-dc-input" data-field="check-note" value={note} maxLength={300} placeholder={t('userTasks.notePh')} disabled={busy} onChange={(e) => setNote(e.target.value)} onKeyDown={stop} />
        <button type="button" className="mt-btn small primary mt-ut-ok" data-action="check-ok" disabled={busy} onClick={() => send(true)}>{t('userTasks.ok')}</button>
        <button type="button" className="mt-btn small mt-ut-fail" data-action="check-fail" disabled={busy} onClick={() => send(false)}>{t('userTasks.fail')}</button>
      </div>
      <div className="mt-ut-acts"><Snooze d={d} t={t} busy={busy} setBusy={setBusy} /><IgnoreBtn d={d} t={t} busy={busy} setBusy={setBusy} /></div>
    </>
  );
}

function DecisionRow({ d, onGo, now, t }) {
  const [busy, setBusy] = useState(false);
  const act = actionOf(d);
  return (
    <div className={`mt-dc-row k-${d.kind}${d.auto ? ' auto' : ''}`} data-role="decision" data-id={d.id} data-session={d.sessionId} data-kind={d.kind} data-auto={d.auto ? '1' : undefined}>
      <CardHead d={d} onGo={onGo} now={now} t={t} />
      <div className="mt-dc-q" data-role="decision-question">{d.question}</div>
      {d.why ? <div className="mt-dc-why" data-role="decision-why">{d.why}</div> : null}
      {d.kind === 'later' && d.later ? <div className="mt-ut-when-line" data-role="decision-later">{t('userTasks.laterWas', { text: d.later })}</div> : null}
      <Cmds d={d} t={t} />
      {act === 'decide' ? <DecideBody d={d} t={t} busy={busy} setBusy={setBusy} /> : act === 'check' ? <CheckBody d={d} t={t} busy={busy} setBusy={setBusy} /> : <DoBody d={d} t={t} busy={busy} setBusy={setBusy} />}
    </div>
  );
}

// P292: 나중 줄 하나(때·조건, 꺼내기·무시)
function LaterRow({ d, onGo, now, t }) {
  const say = useSay();
  const [busy, setBusy] = useState(false);
  const name = nameOf(d);
  const raise = async () => {
    setBusy(true);
    try { await raiseDecision(d.id); say(t('userTasks.raised', { name }), t('userTasks.s.raised')); }
    catch (e) { say(t('decisions.fail', { error: errText(e) }), t('decisions.fail', { error: errText(e) }), 'error'); setBusy(false); }
  };
  return (
    <div className={`mt-dc-row mt-ut-later-row k-${d.kind}${d.auto ? ' auto' : ''}`} data-role="later-card" data-id={d.id} data-kind={d.kind}>
      <CardHead d={d} onGo={onGo} now={now} t={t} />
      <div className="mt-dc-q" data-role="decision-question">{d.question}</div>
      <div className="mt-ut-when-line" data-role="later-when">{d.cond ? t('userTasks.cond', { text: d.cond }) : t('userTasks.at', { when: whenText(d.wakeAt, now) })}</div>
      <div className="mt-ut-acts">
        <button type="button" className="mt-btn small" data-action="later-raise" title={t('userTasks.raiseTitle')} disabled={busy} onClick={raise}>{t('userTasks.raise')}</button>
        <IgnoreBtn d={d} t={t} busy={busy} setBusy={setBusy} />
      </div>
    </div>
  );
}

function LaterSection({ cards, onGo, now, t }) {
  const [open, setOpen] = useState(false);
  if (!cards.length) return null;
  return (
    <div className={`mt-ut-later${open ? ' open' : ''}`} data-role="later" data-count={cards.length} data-open={open ? '1' : undefined}>
      <button type="button" className="mt-ut-later-head" data-action="later-toggle" title={t('userTasks.laterTitle')} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="mt-ut-caret">{open ? '▾' : '▸'}</span>{t('userTasks.later', { n: cards.length })}
        {!open && <span className="mt-ut-later-peek">{cards.slice(0, 2).map((d) => (d.cond ? d.cond : whenText(d.wakeAt, now))).join(' · ')}{cards.length > 2 ? ' …' : ''}</span>}
      </button>
      {open && cards.map((d) => <LaterRow key={d.id} d={d} onGo={onGo} now={now} t={t} />)}
    </div>
  );
}

export function DecisionList({ onGo }) {
  const t = useT();
  const all = useStore((st) => st.decisions);
  const held = useStore((st) => st.decisionHeld);
  const now = useNow();
  const cards = activeCards(all);
  const later = laterCards(all);
  if (!cards.length && !later.length) return <div className="mt-dropdown-empty">{t('userTasks.empty')}</div>;
  const firsts = firstCardIds(cards);
  return (
    <>
      {!cards.length && <div className="mt-dropdown-empty">{t('userTasks.emptyNow')}</div>}
      {cards.map((d) => <div key={d.id} className="mt-dc-item">{firsts.has(d.id) && held && held[d.sessionId] ? <HeldLine sessionId={d.sessionId} n={held[d.sessionId]} t={t} /> : null}<DecisionRow d={d} onGo={onGo} now={now} t={t} /></div>)}
      <LaterSection cards={later} onGo={onGo} now={now} t={t} />
    </>
  );
}

// PC: 위 오른쪽 알약과 펼침 목록(카드가 없으면 숨긴다. 수는 지금 목록만)
export function DecisionPill() {
  const t = useT();
  const n = useStore((st) => activeCards(st.decisions).length);
  const total = useStore((st) => st.decisions.length);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown, true); window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown, true); window.removeEventListener('keydown', onKey); };
  }, [open]);
  useEffect(() => { if (!total) setOpen(false); }, [total]);
  if (!total) return null;
  const go = (id) => { setOpen(false); const nav = getState().navigateTo; if (nav) nav(id); };
  return (
    <div className="mt-drop" ref={ref}>
      <button className={`mt-cp decision${open ? ' on' : ''}${n ? '' : ' quiet'}`} data-role="decisions" data-count={n} data-total={total} title={t('userTasks.title')} onClick={() => setOpen((o) => !o)}>
        <span className="mt-dc-dot" />{t('userTasks.pill')} <b className="mono">{n}</b>
      </button>
      {open && (
        <div className="mt-dropdown mt-dc-list" data-role="decisions-list">
          <div className="mt-dropdown-head"><span>{t('userTasks.head')}</span></div>
          <DecisionList onGo={go} />
        </div>
      )}
    </div>
  );
}

// 세션 카드·세션 맵 카드의 작은 표식(지금 목록에 카드가 있을 때만, 종류 구별 없이 센다)
export function DecisionMark({ sessionId, className = 'mt-dc-mark' }) {
  const t = useT();
  const n = useStore((st) => { let k = 0; for (const d of st.decisions) if (d.sessionId === sessionId && !d.deferred) k++; return k; });
  const auto = useStore((st) => allAuto(activeCards(st.decisions), sessionId));
  if (!n) return null;
  return <span className={`${className}${auto ? ' auto' : ''}`} data-role="decision-mark" data-count={n} data-auto={auto ? '1' : undefined} title={auto ? t('autoDecisions.markTitle', { n }) : t('userTasks.markTitle', { n })}>{n > 1 ? t('userTasks.markN', { n }) : t('userTasks.mark')}</span>;
}

// 휴대폰: 세션 맵 위 알약과 아래 시트
export function PhoneDecisionPill({ onOpen }) {
  const t = useT();
  const n = useStore((st) => activeCards(st.decisions).length);
  const total = useStore((st) => st.decisions.length);
  const [open, setOpen] = useState(false);
  const [note, say] = useSheetNote();
  useEffect(() => { if (!total) setOpen(false); }, [total]);
  if (!total) return null;
  return (
    <SayCtx.Provider value={say}>
      <button type="button" className={`mt-pl-pill st-decision${n ? '' : ' quiet'}`} data-role="pl-decisions" data-count={n} data-total={total} onClick={() => setOpen(true)}><i /><b>{n}</b><span>{t('userTasks.pill')}</span></button>
      {open && (
        <div className="mt-dc-sheet" data-role="decisions-sheet" role="dialog" aria-label={t('userTasks.head')}>
          <div className="mt-dc-scrim" onClick={() => setOpen(false)} />
          <div className="mt-dc-panel">
            <div className="mt-dc-sheet-head"><b>{t('userTasks.head')}</b><span className="mono">{n}</span>{note ? <span key={note.id} className={`mt-ut-note ${note.level}`} data-role="sheet-note" role="status">{note.text}</span> : null}<button type="button" className="mt-dc-x" data-action="decisions-close" aria-label={t('common.close')} onClick={() => setOpen(false)}>×</button></div>
            <div className="mt-dc-sheet-body"><DecisionList onGo={(id) => { setOpen(false); if (onOpen) onOpen(id); }} /></div>
          </div>
        </div>
      )}
    </SayCtx.Provider>
  );
}
