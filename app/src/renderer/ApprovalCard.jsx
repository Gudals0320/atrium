// 승인 줄(ARCH 4절 A1, 7.1): 세션이 waiting이면 노드(콘솔) 아래쪽에 붙는다. 권한 요청, 질문, 계획 승인에 판에서 바로 답한다.
// 키 순서와 보내기 전 확인은 백엔드 session.answer가 한다. 대화로 이어지는 선택지와 신뢰 대화상자는 "터미널에서 답하기"로 보낸다.
// P11: 노드 위에 겹쳐 뜨던 카드를 목업처럼 콘솔 아래쪽 승인 줄로 바꿨다. 줄은 묻는 것 한 줄과 단추 줄(주황 "허용", 테두리 "거부", "터미널에서 답하기", 기다린 시간)이다.
//   카드가 하던 일(모든 선택지, 승인하면서 지시 덧붙이기, 질문의 여러 개 고르기와 직접 입력, 계획 보기)은 "선택지"를 누르면 줄 위로 펼친다.
//   질문과 계획은 고를 것이 줄에 다 들어가지 않으니 처음부터 펼쳐 둔다. 터미널은 줄 높이(ANSWER_H)만큼 줄어 Claude Code의 대화상자가 줄 위에 보인다(SessionNode).
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { dismissAsk, askKey, toast } from './store.js';
import { ago } from './lib/labels.js';
import { useT, errText } from './lib/i18n.js';
import { Icon } from './lib/icons.jsx';

export const ANSWER_H = 86; // 접힌 승인 줄의 높이(월드 px). 터미널이 이만큼 비켜 준다

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

const isNo = (c) => /^No\b/i.test(c.label);

export function ApprovalCard({ s, onTerminal, onAnswered }) {
  const t = useT();
  const ask = s.ask;
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [text, setText] = useState('');
  const [mode, setMode] = useState(null); // 'amend' | 'free'
  const [picks, setPicks] = useState([]);
  const kind = s.state === 'trust_wait' ? 'trust' : ask ? ask.kind : null;
  const [open, setOpen] = useState(kind === 'question' || kind === 'plan');
  useEffect(() => { setMsg(null); setText(''); setMode(null); setPicks([]); setBusy(false); setOpen(kind === 'question' || kind === 'plan'); }, [askKey(ask), s.state]); // eslint-disable-line react-hooks/exhaustive-deps

  async function answer(params) {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.call('session.answer', { session: s.sessionId, toolUseId: ask && ask.toolUseId, since: ask && ask.since, ...params });
      if (r.sent) { setMsg(t('approval.sent', { label: r.label })); if (onAnswered) onAnswered(); }
      else if (r.reason === 'stale' || r.reason === 'no_pending_ask') { dismissAsk(askKey(ask)); toast(t('approval.stale', { name: s.name })); }
      else if (r.reason === 'not_blocked') { setMsg(t('approval.notBlocked', { status: r.herdrStatus })); setBusy(false); }
      else { setMsg(t('approval.notSent', { reason: r.reason })); setBusy(false); }
    } catch (e) {
      setMsg(e.code === 'answer_in_terminal' ? errText(e) : t('approval.failed', { error: errText(e) }));
      setBusy(false);
    }
  }

  if (kind !== 'trust' && !ask) return null;
  const waited = ask && ask.since ? ago(ask.since, now) : '';
  const terminalBtn = <button className="mt-a-term" onClick={onTerminal} data-action="answer-terminal">{t('approval.terminal')}</button>;
  const reject = (label) => <button className="mt-a-no" disabled={busy} data-choice="reject" onClick={() => answer({ choice: 'reject' })}>{label} <kbd>Esc</kbd></button>;
  const moreBtn = (label) => <button className={`mt-a-more${open ? ' on' : ''}`} data-action="answer-more" title={open ? t('approval.collapse') : t('approval.moreTitle')} onClick={() => setOpen((o) => !o)}>{label}<Icon name={open ? 'chevDown' : 'chevUp'} /></button>;

  let what = null; // 묻는 것 한 줄
  let row = null; // 단추 줄
  let more = null; // 펼친 것(줄 위)
  if (kind === 'trust') {
    what = <><b>{t('approval.trust')}</b></>;
    more = <div className="mt-card-text">{t('approval.trustText')}</div>;
    row = <>{terminalBtn}{moreBtn(t('approval.explain'))}</>;
  } else if (kind === 'screen') {
    // P4(F5): 판의 hook이 없는 세션(다른 종류, 판에 올린 에이전트). 키 순서를 모르니 화면 끝만 보여주고 터미널로 보낸다
    what = <><b>{t('approval.screenAsks', { kind: s.kind || t('ask.agent') })}</b> <span className="dim">{t('approval.screenHint')}</span></>;
    more = <>{ask.tail ? <pre className="mt-card-plan" data-role="screen-tail">{ask.tail}</pre> : <div className="mt-card-sub">{t('approval.screenBlocked')}</div>}</>;
    row = <>{terminalBtn}{moreBtn(t('approval.screenTail'))}</>;
  } else if (kind === 'permission') {
    const choices = ask.choices && ask.choices.length ? ask.choices : [{ n: 1, label: 'Yes' }];
    const first = choices.find((c) => c.n === 1) || choices[0];
    const others = choices.filter((c) => c !== first && !isNo(c));
    what = <><b>{t('approval.permission', { tool: ask.tool })}</b> <span className="mono">{String(ask.summary || '').startsWith(`${ask.tool}:`) ? ask.summary.slice(ask.tool.length + 1).trim() : ask.summary || ''}</span></>;
    row = <>
      <button className="mt-a-yes" disabled={busy} data-choice={first.n} title={`${first.n}. ${first.label}`} onClick={() => answer({ choice: first.n })}>{t('approval.allow')} <kbd>{first.n}</kbd></button>
      {reject(t('approval.reject'))}
      {terminalBtn}
      {moreBtn(others.length ? t('approval.choices', { n: choices.length }) : t('approval.amend'))}
    </>;
    more = <>
      {ask.question && <div className="mt-card-q">{ask.question}</div>}
      {!ask.choices && <div className="mt-card-sub">{t('approval.readingChoicesQuick')}</div>}
      <div className="mt-card-choices">
        {choices.map((c) => {
          const no = isNo(c);
          return <button key={c.n} className={`mt-btn ${c.n === 1 ? 'primary' : no ? 'danger' : ''}`} disabled={busy} data-choice={no ? 'reject' : c.n} onClick={() => answer({ choice: no ? 'reject' : c.n })}>{c.n}. {c.label}{no ? ' (Esc)' : ''}</button>;
        })}
      </div>
      {mode === 'amend' ? (
        <form className="mt-card-form" onSubmit={(e) => { e.preventDefault(); answer({ choice: 'amend', text }); }}>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t('approval.amendPlaceholder')} />
          <button className="mt-btn primary" disabled={busy || !text.trim()}>{t('approval.amendSubmit')}</button>
        </form>
      ) : <div className="mt-card-actions"><button className="mt-btn ghost" data-action="answer-amend" onClick={() => setMode('amend')}>{t('approval.amendOpen')}</button></div>}
    </>;
  } else if (kind === 'question') {
    const qs = ask.questions || [];
    const single = qs.length === 1 && !qs[0].multiSelect;
    what = <><b>{t('approval.question')}</b> <span>{qs.map((q) => q.question).join(' / ')}</span></>;
    row = <>{moreBtn(open ? t('approval.choicesCollapse') : t('approval.pickAnswer'))}{reject(t('approval.questionCancel'))}{terminalBtn}</>;
    if (single) {
      const q = qs[0];
      const free = q.options.length + 1;
      more = <>
        {q.header && <div className="mt-card-sub">{q.header}</div>}
        <div className="mt-card-q">{q.question}</div>
        <div className="mt-card-choices">
          {q.options.map((o, i) => <button key={i} className="mt-btn" disabled={busy} data-choice={i + 1} onClick={() => answer({ choice: i + 1 })}>{i + 1}. {o}</button>)}
          {mode !== 'free' && <button className="mt-btn ghost" data-action="answer-free" onClick={() => setMode('free')}>{free}. {t('approval.free')}</button>}
        </div>
        {mode === 'free' && (
          <form className="mt-card-form" onSubmit={(e) => { e.preventDefault(); answer({ choice: free, text }); }}>
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t('approval.free')} />
            <button className="mt-btn primary" disabled={busy || !text.trim()}>{t('approval.send')}</button>
          </form>
        )}
      </>;
    } else if (qs.length === 1) {
      const q = qs[0];
      const toggle = (n) => setPicks((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
      more = <>
        <div className="mt-card-q">{q.question} <span className="mt-card-sub">{t('approval.multi')}</span></div>
        <div className="mt-card-choices">
          {q.options.map((o, i) => <label key={i} className="mt-check"><input type="checkbox" checked={picks.includes(i + 1)} onChange={() => toggle(i + 1)} />{o}</label>)}
        </div>
        <div className="mt-card-actions"><button className="mt-btn primary" disabled={busy || !picks.length} data-action="answer-submit" onClick={() => answer({ picks })}>{t('approval.submit')}</button></div>
      </>;
    } else if (qs.some((q) => q.multiSelect)) {
      more = <div className="mt-card-q">{t('approval.mixedQuestions', { n: qs.length })}</div>;
    } else {
      more = <>
        {qs.map((q, qi) => (
          <div key={qi} className="mt-card-qblock">
            <div className="mt-card-q">{qi + 1}. {q.question}</div>
            <div className="mt-card-choices">
              {q.options.map((o, i) => <label key={i} className="mt-check"><input type="radio" name={`q${qi}`} checked={picks[qi] === i + 1} onChange={() => setPicks((p) => { const x = [...p]; x[qi] = i + 1; return x; })} />{o}</label>)}
            </div>
          </div>
        ))}
        <div className="mt-card-actions"><button className="mt-btn primary" disabled={busy || picks.filter(Boolean).length !== qs.length} data-action="answer-submit" onClick={() => answer({ picks })}>{t('approval.submit')}</button></div>
      </>;
    }
  } else if (kind === 'plan') {
    const choices = ask.choices || [];
    what = <><b>{t('ask.plan')}</b></>;
    row = <>{moreBtn(open ? t('approval.planCollapse') : t('approval.planShow'))}{terminalBtn}</>;
    more = <>
      <pre className="mt-card-plan">{ask.plan || ''}</pre>
      {!choices.length && <div className="mt-card-sub">{t('approval.readingChoices')}</div>}
      <div className="mt-card-choices">
        {choices.map((c) => /tell claude what to change/i.test(c.label)
          ? <button key={c.n} className="mt-btn ghost" onClick={onTerminal}>{c.n}. {c.label} → {t('approval.toTerminal')}</button>
          : <button key={c.n} className={`mt-btn${c.n === 1 ? ' primary' : ''}`} disabled={busy} data-choice={c.n} onClick={() => answer({ choice: c.n })}>{c.n}. {c.label}</button>)}
      </div>
    </>;
  } else {
    what = <><b>{t('ask.unknownDialog')}</b> <span className="dim">{t('approval.unknownHint')}</span></>;
    row = <>{terminalBtn}</>;
  }

  return (
    <div className={`mt-answer nodrag nowheel${open && more ? ' open' : ''}${s.estimate ? ' estimate' : ''}`} data-kind={kind} data-role="approval">
      {open && more && <div className="mt-answer-more" data-role="answer-more">{more}{s.estimate && <div className="mt-card-sub">{t('approval.estimate', { v: s.estimate })}</div>}</div>}
      <div className="mt-answer-bar">
        <div className="mt-answer-what" title={typeof ask?.summary === 'string' ? ask.summary : ''}>{what}</div>
        <div className="mt-answer-row">
          {row}
          {msg ? <span className="mt-a-msg">{msg}</span> : null}
          {waited && <span className="mt-a-wait" title={t('approval.waitedTitle')}>{t('approval.waited', { d: waited })}</span>}
        </div>
      </div>
    </div>
  );
}
