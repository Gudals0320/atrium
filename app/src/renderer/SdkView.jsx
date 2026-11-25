// P363: SDK 세션(claude -p, 터미널 없음)의 가까이 얼굴. 대화 보기 아래 입력칸·멈추기·프로세스 상태 줄.
// 보내기는 판의 session.send(대기열, 스티어링을 고르면 지금 턴에)라 명령줄·휴대폰 보내기와 같은 길이다
// P367: 사람은 SDK 세션에 거의 쓰지 않고 워커가 무엇을 하는지 본다. 얼굴 위에 지금 하는 일 한 줄(도구·생각 중, 경과)·백그라운드 일 수·턴 토큰과 금액(추정)·세션 누계,
//   대화는 도구 호출을 접힌 한 줄(연속 호출은 한 묶음, 누르면 펼쳐 입력·결과 앞부분), 답은 마크다운, 거절된 도구 호출·오류·과금 오류는 눈에 띄게. 긴 대화는 끝부분만 그린다
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { toast } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { sdkDraft } from './lib/auth-relay.js';
import { Markdown } from './Markdown.jsx';
import { buildItems, groupLine, inputHead, resultHead, nowOf, bgLine, elapsed, tok, money, usageParts } from './lib/sdk-face.js';

export function SdkInput({ s, compact = false }) {
  const t = useT();
  const [val, setVal] = useState('');
  const [steer, setSteer] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const text = sdkDraft(val);
    if (!text || busy) return;
    setBusy(true);
    try { await api.call('session.send', { target: [s.address || s.name], text, ...(steer && s.state === 'working' ? { steer: true } : {}), source: 'bar' }); setVal(''); }
    catch (e) { toast(t('sdkSession.sendFailed', { error: errText(e) }), 'error'); }
    finally { setBusy(false); }
  };
  const stop = async () => { try { await api.call('session.sdkStop', { session: s.sessionId }); } catch (e) { toast(errText(e), 'error'); } };
  const alive = !!(s.sdk && s.sdk.alive);
  return (
    <div className={`mt-sdk-input nodrag${compact ? ' compact' : ''}`} data-role="sdk-input" onMouseDown={(e) => e.stopPropagation()}>
      <textarea className="mt-sdk-text" data-role="sdk-text" rows={compact ? 1 : 2} value={val} placeholder={t('sdkSession.placeholder')} spellCheck={false}
        onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
      <div className="mt-sdk-bar">
        <span className={`mt-sdk-proc dim${alive ? ' on' : ''}`} data-role="sdk-proc" data-alive={alive ? '1' : '0'}>{alive ? t('sdkSession.alive') : t('sdkSession.idle')}</span>
        {s.state === 'working' && <label className="mt-check" title={t('sdkSession.steerTitle')}><input type="checkbox" data-role="sdk-steer" checked={steer} onChange={(e) => setSteer(e.target.checked)} />{t('sdkSession.steer')}</label>}
        {alive && <button className="mt-btn small" data-action="sdk-stop" title={t('sdkSession.stopTitle')} onClick={stop}>{t('sdkSession.stop')}</button>}
        <button className="mt-btn small primary" data-action="sdk-send" disabled={busy || !sdkDraft(val)} onClick={send}>{t('sdkSession.send')}</button>
      </div>
    </div>
  );
}

// 일하는 중에만 1초마다 다시 그린다(경과 시간)
function useTick(on) {
  const [, set] = useState(0);
  useEffect(() => { if (!on) return undefined; const h = setInterval(() => set((x) => x + 1), 1000); return () => clearInterval(h); }, [on]);
  return Date.now();
}

// 지금 하는 일 한 줄(축소 단계·세션 맵 카드도 이것만). 쉬는데 백그라운드 일도 없으면 그리지 않는다
export function SdkNow({ s, className = '' }) {
  const t = useT();
  const x = nowOf(s, t);
  const now = useTick(!!(x && x.since));
  if (!x) return null;
  return (
    <div className={`mt-sdk-now k-${x.kind} ${className}`} data-role="sdk-now" data-kind={x.kind} title={x.text}>
      <span className="mt-sdk-now-dot" aria-hidden="true" /><span className="mt-sdk-now-text">{x.text}</span>{x.since ? <span className="mt-sdk-now-age">{elapsed(now - x.since)}</span> : null}
    </div>
  );
}

// 머리 줄: 지금 하는 일, 백그라운드 일, 이번 턴 토큰·금액과 세션 누계
function SdkStatus({ s }) {
  const t = useT();
  const f = s.sdkFace || {};
  const u = f.usage;
  const last = u && u.last;
  const working = s.state === 'working';
  return (
    <div className="mt-sdk-status" data-role="sdk-status">
      <div className="mt-sdk-status-row">
        {nowOf(s, t) ? <SdkNow s={s} /> : <span className="mt-sdk-now k-idle dim" data-role="sdk-now-idle">{t('sdkFace.idle')}</span>}
        {f.bg && f.bg.n && (working || nowOf(s, t)?.kind !== 'bg') ? <span className="mt-sdk-bg" data-role="sdk-bg" data-n={f.bg.n} title={(f.bg.items || []).map((x) => x.label).filter(Boolean).join('\n')}>{bgLine(f.bg, t)}</span> : null}
      </div>
      {u ? (
        <div className="mt-sdk-usage dim" data-role="sdk-usage" title={t('sdkFace.usageTitle')}>
          {last ? <span className="mt-sdk-u-turn">{t('sdkFace.lastTurn')} {usageParts(last).map(([k, v]) => <span key={k} className="mt-sdk-u" data-k={k}>{t(`sdkFace.u.${k}`)} <b>{tok(v)}</b></span>)}<b className="mt-sdk-u-cost" data-role="sdk-turn-cost">{money(last.cost)}</b></span> : null}
          <span className="mt-sdk-u-total" data-role="sdk-total">{t('sdkFace.total', { cost: money(u.total && u.total.cost), n: u.turns || 0 })}</span>
        </div>
      ) : null}
    </div>
  );
}

// 도구 호출 하나(접힘: 이름과 요점, 펼침: 입력·결과 앞부분)
function ToolCall({ c }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const err = c.result && c.result.isError;
  return (
    <div className={`mt-sdk-call${open ? ' open' : ''}${err ? ' err' : ''}`} data-role="sdk-tool" data-tool={c.tool}>
      <button type="button" className="mt-sdk-call-line nodrag" data-action="sdk-tool-toggle" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} title={c.gist}>
        <span className="mt-sdk-caret" aria-hidden="true">{open ? '▾' : '▸'}</span><b>{c.tool}</b>{c.gist ? <span className="mt-sdk-gist">{c.gist}</span> : null}{err ? <span className="mt-sdk-call-err">{t('sdkFace.toolError')}</span> : c.result ? null : <span className="dim">…</span>}
      </button>
      {open ? (
        <div className="mt-sdk-call-detail nodrag nowheel" data-role="sdk-tool-detail" onMouseDown={(e) => e.stopPropagation()}>
          <div className="mt-sdk-k">{t('sdkFace.input')}</div><pre className="mono">{inputHead(c.input)}</pre>
          <div className="mt-sdk-k">{t('sdkFace.result')}</div><pre className={`mono${err ? ' err' : ''}`}>{c.result ? resultHead(c.result) || t('sdkFace.emptyResult') : t('sdkFace.noResult')}</pre>
        </div>
      ) : null}
    </div>
  );
}

// 연속 도구 호출 묶음(하나면 그 호출 줄 그대로)
function ToolGroup({ g }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (g.calls.length === 1) return <div className="mt-sdk-tools single" data-role="sdk-tools"><ToolCall c={g.calls[0]} /></div>;
  const line = groupLine(g.calls);
  const errs = g.calls.filter((c) => c.result && c.result.isError).length;
  return (
    <div className={`mt-sdk-tools${open ? ' open' : ''}`} data-role="sdk-tools" data-n={g.calls.length}>
      <button type="button" className="mt-sdk-call-line group nodrag" data-action="sdk-tools-toggle" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
        <span className="mt-sdk-caret" aria-hidden="true">{open ? '▾' : '▸'}</span><b>{t('sdkFace.tools', { n: g.calls.length })}</b><span className="mt-sdk-gist">{line.head}{line.gists ? ` — ${line.gists}` : ''}</span>{errs ? <span className="mt-sdk-call-err">{t('sdkFace.toolErrors', { n: errs })}</span> : null}
      </button>
      {open ? <div className="mt-sdk-tools-list">{g.calls.map((c) => <ToolCall key={c.id} c={c} />)}</div> : null}
    </div>
  );
}

const LOG_MAX = 40; // 그리는 항목 수(끝에서). 긴 대화를 다 그리지 않는다

// 대화 보기(SDK): 대화 기록을 묶어 그린다. 글이 들어오면(지금 하는 일이 바뀌면) 다시 읽는다
export function SdkLog({ s, compact = false }) {
  const t = useT();
  const [items, setItems] = useState(null);
  const box = useRef(null);
  const stick = useRef(true);
  const n = (s.sdkFace && s.sdkFace.now) || null;
  const key = `${s.lastPrompt || ''}|${s.lastAnswerAt || ''}|${s.state}|${n ? `${n.kind}:${n.since}` : ''}`;
  useEffect(() => {
    let alive = true;
    const h = setTimeout(() => {
      api.call('session.messages', { session: s.sessionId, limit: 200 }).then((r) => { if (alive) setItems(buildItems(r.messages, { max: compact ? 16 : LOG_MAX })); }).catch(() => alive && setItems([]));
    }, s.state === 'working' ? 500 : 200);
    return () => { alive = false; clearTimeout(h); };
  }, [s.sessionId, key, compact]);
  useEffect(() => { const el = box.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [items]); // 끝을 보고 있었으면 끝을 따라간다
  const onScroll = () => { const el = box.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; };
  return (
    <div className="mt-chat mt-sdk-log nowheel" ref={box} onScroll={onScroll} data-role="sdk-log">
      {items === null && <div className="mt-chat-empty">{t('common.loading')}</div>}
      {items && !items.length && <div className="mt-chat-empty">{t('chat.empty')}</div>}
      {items && items.map((it, i) => {
        if (it.type === 'more') return <div key="more" className="mt-chat-empty" data-role="sdk-more">{t('sdkFace.more', { n: it.n })}</div>;
        if (it.type === 'tools') return <ToolGroup key={`t${it.seq}-${i}`} g={it} />;
        if (it.type === 'bgdone') return <div key={`b${it.seq}-${i}`} className="mt-sdk-bgdone" data-role="sdk-bgdone">{t('sdkFace.bgDone')}{it.summary ? `: ${it.summary}` : ''}</div>;
        if (it.type === 'user') return <div key={`u${it.seq}-${i}`} className="mt-msg user">{String(it.text).slice(0, 600)}</div>;
        return <div key={`a${it.seq}-${i}`} className="mt-msg assistant mt-sdk-answer nodrag" onMouseDown={(e) => e.stopPropagation()}><Markdown text={it.text} className="mt-sdk-md" /></div>;
      })}
    </div>
  );
}

// 거절된 도구 호출(승인 화면이 없어 -p가 거절하고 일을 이어 간다)·오류·과금 오류
function SdkAlerts({ s }) {
  const t = useT();
  const d = s.sdkFace && s.sdkFace.denied;
  const err = s.state === 'error' && s.error && s.error.message ? s.error : null;
  const billing = err && err.type === 'billing_error';
  return (
    <>
      {d && d.items && d.items.length ? <div className="mt-sdk-denied" data-role="sdk-denied" title={t('sdkFace.deniedTitle')}><b>{t('sdkFace.denied')}</b> {d.items.map((x) => `${x.tool}${x.gist ? `: ${x.gist}` : ''}`).join(' · ')}</div> : null}
      {err ? <div className={`mt-sdk-err${billing ? ' billing' : ''}`} data-role="sdk-error" data-type={err.type || ''}><b>{t(billing ? 'sdkFace.billingError' : 'sdkFace.error')}</b> {String(err.message).slice(0, 300)}</div> : null}
    </>
  );
}

export function SdkFace({ s }) {
  return (
    <div className="mt-sdk-face" data-role="sdk-face">
      <SdkStatus s={s} />
      <div className="mt-sdk-chat"><SdkLog s={s} /></div>
      <SdkAlerts s={s} />
      <SdkInput s={s} />
    </div>
  );
}

// 중간 얼굴: 입력칸 없이 머리 줄과 대화 보기
export function SdkMiddle({ s }) {
  return (
    <div className="mt-sdk-face middle" data-role="sdk-face-middle">
      <SdkStatus s={s} />
      <div className="mt-sdk-chat"><SdkLog s={s} compact /></div>
      <SdkAlerts s={s} />
    </div>
  );
}
