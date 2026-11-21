// P284: 결정 카드의 창 쪽(판 쪽 backend/src/decisions.mjs). 에이전트가 사람에게 글로 물은 질문(atrium ask)을 "내 차례" 줄과 따로 모아 보인다.
// - PC: 위 오른쪽 "결정 n" 알약(DecisionPill, 응답 필요와 따로 센다). 누르면 오래 기다린 것부터 목록: 세션 이름(누르면 그 세션으로), 질문, 맥락,
//   기다린 시간, 보기 단추, 한 줄 답 칸, 무시. 보기나 답을 보내면 판이 그 세션에 "[결정] <질문> → <답>"을 대기열로 넣고, 무시는 아무것도 보내지 않는다.
// - 세션 카드(캔버스 노드 머리)와 세션 맵 카드에 작은 "결정" 표식(DecisionMark).
// - P286: 판이 마지막 답에서 만든 자동 카드는 줄과 표식에 작게 "자동"을 단다. 한 세션의 열린 카드가 여럿이면 답을 모아 두었다가 모두 끝나면 판이 한 글로 보내고,
//   목록은 그 세션의 첫 카드 위에 모은 답 수와 "지금 보내기"를 보인다.
// - 휴대폰: 세션 맵 위 알약 줄의 "결정 n"(PhoneDecisionPill). 누르면 같은 목록을 아래 시트로(답하기·무시). 세션 이름을 누르면 그 세션 화면.
import { useEffect, useRef, useState } from 'react';
import { useStore, getState, toast, answerDecision, ignoreDecision, flushDecisions, wsName } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { ago } from './lib/labels.js';
import { answerReady, firstCardIds, allAuto } from './lib/decisions.js';

function useNow(ms = 15000) { const [n, set] = useState(Date.now()); useEffect(() => { const id = setInterval(() => set(Date.now()), ms); return () => clearInterval(id); }, [ms]); return n; }
const nameOf = (d) => { const s = getState().sessions.get(d.sessionId); return (s && s.name) || d.name || '?'; };

// P286: 한 세션의 모은 답 줄(그 세션의 첫 카드 위)
function HeldLine({ sessionId, n, t }) {
  const [busy, setBusy] = useState(false);
  const name = nameOf({ sessionId });
  const send = async () => {
    setBusy(true);
    try { await flushDecisions(sessionId); toast(t('autoDecisions.flushed', { name, n })); }
    catch (e) { toast(t('decisions.fail', { error: errText(e) }), 'error'); }
    setBusy(false);
  };
  return (
    <div className="mt-dc-held" data-role="decision-held" data-session={sessionId} data-count={n}>
      <span title={t('autoDecisions.heldTitle')}><b className="mt-dc-held-name">@{name}</b>: {t('autoDecisions.held', { n })}</span>
      <button type="button" className="mt-btn small" data-action="decision-flush" disabled={busy} onClick={send}>{t('autoDecisions.sendNow')}</button>
    </div>
  );
}

function DecisionRow({ d, onGo, now, t }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const name = nameOf(d);
  const send = async (answer) => {
    if (busy || !answerReady(answer)) return;
    setBusy(true);
    try { const r = await answerDecision(d.id, answer.trim()); toast(r && r.held ? t('autoDecisions.heldToast', { name, n: r.waiting || 1 }) : t('decisions.sent', { name })); }
    catch (e) { toast(t('decisions.fail', { error: errText(e) }), 'error'); setBusy(false); }
  };
  const ignore = async () => {
    setBusy(true);
    try { await ignoreDecision(d.id); toast(t('decisions.ignored', { name })); }
    catch (e) { toast(t('decisions.fail', { error: errText(e) }), 'error'); setBusy(false); }
  };
  return (
    <div className={`mt-dc-row${d.auto ? ' auto' : ''}`} data-role="decision" data-id={d.id} data-session={d.sessionId} data-auto={d.auto ? '1' : undefined}>
      <div className="mt-dc-line">
        <button type="button" className="mt-dc-name" data-action="decision-go" title={t('decisions.goTitle', { name })} onClick={() => onGo(d.sessionId)}>@{name}</button>
        {d.workspaceKey ? <span className="mt-chip-ws">{wsName(d.workspaceKey)}</span> : null}
        {d.auto ? <span className="mt-dc-auto" data-role="decision-auto" title={t('autoDecisions.tagTitle')}>{t('autoDecisions.tag')}</span> : null}
        <span className="mt-dc-time" title={t('decisions.waited')}>{ago(d.createdAt, now)}</span>
      </div>
      <div className="mt-dc-q" data-role="decision-question">{d.question}</div>
      {d.why ? <div className="mt-dc-why" data-role="decision-why">{d.why}</div> : null}
      {d.options.length > 0 && (
        <div className="mt-dc-opts">
          {d.options.map((o) => <button key={o} type="button" className="mt-btn small mt-dc-opt" data-action="decision-option" data-option={o} disabled={busy} onClick={() => send(o)}>{o}</button>)}
        </div>
      )}
      <form className="mt-dc-answer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input type="text" className="mt-dc-input" data-field="decision-text" value={text} maxLength={2000} placeholder={t('decisions.placeholder')} disabled={busy} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <button type="submit" className="mt-btn small primary" data-action="decision-send" disabled={busy || !answerReady(text)}>{t('decisions.send')}</button>
        <button type="button" className="mt-btn small ghost" data-action="decision-ignore" title={t('decisions.ignoreTitle')} disabled={busy} onClick={ignore}>{t('decisions.ignore')}</button>
      </form>
    </div>
  );
}

export function DecisionList({ onGo }) {
  const t = useT();
  const cards = useStore((st) => st.decisions);
  const held = useStore((st) => st.decisionHeld);
  const now = useNow();
  if (!cards.length) return <div className="mt-dropdown-empty">{t('decisions.empty')}</div>;
  const firsts = firstCardIds(cards);
  return <>{cards.map((d) => <div key={d.id} className="mt-dc-item">{firsts.has(d.id) && held && held[d.sessionId] ? <HeldLine sessionId={d.sessionId} n={held[d.sessionId]} t={t} /> : null}<DecisionRow d={d} onGo={onGo} now={now} t={t} /></div>)}</>;
}

// PC: 위 오른쪽 알약과 펼침 목록(0이면 숨긴다)
export function DecisionPill() {
  const t = useT();
  const n = useStore((st) => st.decisions.length);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown, true); window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown, true); window.removeEventListener('keydown', onKey); };
  }, [open]);
  useEffect(() => { if (!n) setOpen(false); }, [n]);
  if (!n) return null;
  const go = (id) => { setOpen(false); const nav = getState().navigateTo; if (nav) nav(id); };
  return (
    <div className="mt-drop" ref={ref}>
      <button className={`mt-cp decision${open ? ' on' : ''}`} data-role="decisions" data-count={n} title={t('decisions.title')} onClick={() => setOpen((o) => !o)}>
        <span className="mt-dc-dot" />{t('decisions.pill')} <b className="mono">{n}</b>
      </button>
      {open && (
        <div className="mt-dropdown mt-dc-list" data-role="decisions-list">
          <div className="mt-dropdown-head"><span>{t('decisions.head')}</span></div>
          <DecisionList onGo={go} />
        </div>
      )}
    </div>
  );
}

// 세션 카드·세션 맵 카드의 작은 표식(열린 카드가 있을 때만)
export function DecisionMark({ sessionId, className = 'mt-dc-mark' }) {
  const t = useT();
  const n = useStore((st) => { let k = 0; for (const d of st.decisions) if (d.sessionId === sessionId) k++; return k; });
  const auto = useStore((st) => allAuto(st.decisions, sessionId));
  if (!n) return null;
  return <span className={`${className}${auto ? ' auto' : ''}`} data-role="decision-mark" data-count={n} data-auto={auto ? '1' : undefined} title={auto ? t('autoDecisions.markTitle', { n }) : t('decisions.markTitle', { n })}>{n > 1 ? t('decisions.markN', { n }) : t('decisions.mark')}</span>;
}

// 휴대폰: 세션 맵 위 알약과 아래 시트
export function PhoneDecisionPill({ onOpen }) {
  const t = useT();
  const n = useStore((st) => st.decisions.length);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!n) setOpen(false); }, [n]);
  if (!n) return null;
  return (
    <>
      <button type="button" className="mt-pl-pill st-decision" data-role="pl-decisions" data-count={n} onClick={() => setOpen(true)}><i /><b>{n}</b><span>{t('decisions.pill')}</span></button>
      {open && (
        <div className="mt-dc-sheet" data-role="decisions-sheet" role="dialog" aria-label={t('decisions.head')}>
          <div className="mt-dc-scrim" onClick={() => setOpen(false)} />
          <div className="mt-dc-panel">
            <div className="mt-dc-sheet-head"><b>{t('decisions.head')}</b><span className="mono">{n}</span><button type="button" className="mt-dc-x" data-action="decisions-close" aria-label={t('common.close')} onClick={() => setOpen(false)}>×</button></div>
            <div className="mt-dc-sheet-body"><DecisionList onGo={(id) => { setOpen(false); if (onOpen) onOpen(id); }} /></div>
          </div>
        </div>
      )}
    </>
  );
}
