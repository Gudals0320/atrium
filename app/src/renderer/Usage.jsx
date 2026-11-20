// P211: 구독 사용량 화면. 위 막대 알약(메모리 알약 옆, 휴대폰은 위쪽 줄)과 펼침, 호출자 옆 남은 양, 90% 알림.
// 값은 백엔드 usage.get·usage.updated(store.usage). 움직임 없이 그린다(막대는 너비만, 전환 없음)
import { Fragment, useEffect, useRef, useState } from 'react';
import { useStore, getState } from './store.js';
import { api } from './api.js';
import { useT, t as tt } from './lib/i18n.js';
import { notifyAllowed } from './lib/multiclient.js';
import { PROVIDERS, PROVIDER_NAME, pillOf, pillLine, shortKey, shownWindows, livePct, levelOf, spanOf, windowKey, creditOf, windowLabel, remainingOf, providerOfLauncher, alertText } from './lib/usage.js';
import { KINDS } from './lib/kinds.js';
import { creditMode, creditPillText } from './lib/p255.js'; // P255: Codex 한도를 다 써서 크레딧을 쓰는 중이면 퍼센트 대신 남은 크레딧

function useNow(ms = 30000) { const [n, set] = useState(Date.now()); useEffect(() => { const id = setInterval(() => set(Date.now()), ms); return () => clearInterval(id); }, [ms]); return n; }
const span = (t, ms) => { const s = spanOf(ms); return t(s.key, s.vars); };
const winName = (t, id) => windowLabel(id, t);
// P214: 보이는 창 이름. AGY의 gemini-5h·gemini-weekly도 5시간·주간(구독 이름 AGY 아래라 Gemini를 붙이지 않는다)
const kindName = (t, w) => (windowKey(w.kind) ? t(windowKey(w.kind)) : winName(t, w.id));
const shortName = (t, kind) => (shortKey(kind) ? t(shortKey(kind)) : kind);

// 펼침: 바깥을 누르거나 Esc면 닫는다
function useDrop() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey); };
  }, [open]);
  return [open, setOpen, ref];
}

function ProviderBlock({ k, e, now }) {
  const t = useT();
  const wins = shownWindows(k, e); // P214: AGY는 Gemini 5시간·주간만. 보일 창이 없으면 모름과 같다
  if (!e || !wins.length) return (
    <div className="mt-usage-prov unknown" data-role="usage-provider" data-provider={k}>
      <div className="mt-usage-head"><b>{PROVIDER_NAME[k]}</b><span className="dim">{t('usage.unknown')}</span></div>
      <div className="mt-usage-src dim">{t(`usage.unknownWhy.${k}`)}</div>
    </div>
  );
  const c = creditOf(e.credits);
  return (
    <div className="mt-usage-prov" data-role="usage-provider" data-provider={k}>
      <div className="mt-usage-head"><b>{PROVIDER_NAME[k]}</b>{e.plan && <span className="mt-usage-plan">{e.plan}</span>}<span className="dim mt-usage-ago" title={new Date(e.at).toLocaleString()}>{t('usage.ago', { span: span(t, now - e.at) })}</span></div>
      {k === 'agy' && <div className="mt-usage-what dim" data-role="usage-what">{t('usage.agyWhat')}</div>}
      {wins.map((w) => {
        const p = livePct(w, now);
        const lv = levelOf(p);
        return (
          <div key={w.id} className={`mt-usage-win lv-${lv}`} data-role="usage-window" data-window={w.id} data-pct={Math.round(p)}>
            <span className="mt-usage-wname" title={w.id}>{kindName(t, w)}</span>
            <span className="mt-usage-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, p))}%` }} /></span>
            <span className="mt-usage-pct mono">{Math.round(p)}%</span>
            <span className="mt-usage-reset dim">{w.resetsAt ? (w.resetsAt > now ? t('usage.resetIn', { span: span(t, w.resetsAt - now) }) : t('usage.resetPassed')) : ''}</span>
          </div>
        );
      })}
      {c && <div className="mt-usage-credit" data-role="usage-credit">{t(c.key, c.vars)}</div>}
      <div className="mt-usage-src dim">{t(`usage.source.${e.source}`)}{e.model ? ` · ${e.model}` : ''}</div>
    </div>
  );
}

// 위 막대 알약(P214 한 줄 꼴): 구독마다 로고 하나 + 보이는 창만(예 [로고] 5h 42 · 주 88), 값마다 색, 테두리는 가장 높은 값의 색. 누르면 펼침
// compact(휴대폰 위쪽 줄): 점과 가장 높은 값 하나만(81%). 구독별 값은 누르면 펼침에
export function UsagePill({ compact = false }) {
  const t = useT();
  const v = useStore((st) => st.usage);
  const now = useNow();
  const [open, setOpen, ref] = useDrop();
  if (!v) return null;
  const pill = pillOf(v, now);
  const line = pillLine(v, now);
  const credit = (k) => creditPillText(creditMode(v.providers && v.providers[k], now)); // P255
  const title = line.parts.map((x) => { const c = credit(x.provider); return `${x.name} ${x.wins.map((w) => `${kindName(t, w)} ${w.pct}%`).join(' · ')}${c ? ` · ${t(c.key, c.vars)}` : ''}`; }).join('\n') || t('usage.none'); // 풍선에는 한도 창도 남긴다
  return (
    <div className="mt-drop" ref={ref}>
      <button className={`mt-cp usage lv-${pill.level}${open ? ' on' : ''}${compact ? ' compact' : ' line'}`} title={title} data-role="usage" data-level={pill.level} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {compact && <span className={`mt-usage-dot lv-${pill.level}`} aria-hidden="true" />}
        {compact && pill.parts.length ? (() => { const top = pill.parts.reduce((a, x) => (x.pct > a.pct ? x : a)); return <span className="mt-usage-part" data-provider={top.provider} data-pct={top.pct}><span className={`mono lv-${top.level}`}>{top.pct}%</span></span>; })() : line.parts.length ? line.parts.map((x, i) => (
          <Fragment key={x.provider}>
            {i > 0 && <span className="mt-usage-sep" aria-hidden="true" />}
            <span className="mt-usage-part line" data-provider={x.provider} data-pct={Math.max(...x.wins.map((w) => w.pct))}>
              {KINDS[x.provider] && KINDS[x.provider].logo ? <img className="mt-usage-logo" src={KINDS[x.provider].logo} alt={x.name} draggable={false} /> : <span className="dim">{x.name}</span>}
              {credit(x.provider) ? <span className="mt-usage-credit-v" data-role="usage-credit-pill">{t(credit(x.provider).key, credit(x.provider).vars)}</span> : x.wins.map((w, j) => (
                <Fragment key={w.id}>
                  {j > 0 && <span className="mt-usage-dotsep" aria-hidden="true">·</span>}
                  <span className="mt-usage-k">{shortName(t, w.kind)}</span><span className={`mono mt-usage-v lv-${w.level}`} data-window={w.id} data-pct={w.pct}>{w.pct}</span>
                </Fragment>
              ))}
            </span>
          </Fragment>
        )) : <span className="dim">{t('usage.label')}</span>}
      </button>
      {open && (
        <div className="mt-dropdown mt-usage-list" data-role="usage-list">
          <div className="mt-dropdown-head"><span>{t('usage.head')}</span></div>
          {PROVIDERS.map((k) => <ProviderBlock key={k} k={k} e={v.providers ? v.providers[k] : null} now={now} />)}
          <div className="mt-usage-foot dim" data-role="usage-alerts">{v.alertsOn === false ? t('usage.alertsOff') : t('usage.alertsOn')}</div>
        </div>
      )}
    </div>
  );
}

// 호출자 옆 남은 양(작게). 그 호출자가 구독을 쓰지 않거나 모르면 아무것도 그리지 않는다
export function useUsageLeft(l) {
  const v = useStore((st) => st.usage);
  const p = providerOfLauncher(l);
  return p ? remainingOf(v, p) : null;
}
export function UsageLeft({ l, compact = false }) {
  const t = useT();
  const r = useUsageLeft(l);
  if (!r) return null;
  return <span className={`mt-usage-left lv-${r.level}${compact ? ' compact' : ''}`} data-role="usage-left" data-pct={r.pct} title={t('usage.leftTitle', { pct: r.pct, win: winName(t, r.window) })}>{compact ? r.pct : t('usage.left', { pct: r.pct })}</span>;
}
// 글로만(새 세션 창의 드롭다운 줄). 모르면 ''
export function usageLeftText(l, view = getState().usage) {
  const p = providerOfLauncher(l);
  const r = p ? remainingOf(view, p) : null;
  return r ? ` · ${tt('usage.left', { pct: r.pct })}` : '';
}

// 90% 알림: 백엔드가 창마다 리셋될 때까지 한 번 보낸다(usage.alert). 여러 창이 붙었으면 백엔드가 고른 클라이언트만 띄운다(P47)
export const usageAlerts = []; // 시험이 읽는다
export function startUsageAlerts() {
  api.on('usage.alert', (a) => {
    const x = alertText(a);
    const title = tt(x.title.key, x.title.vars);
    const body = [winName(tt, x.window), x.reset ? tt('usage.resetIn', { span: tt(x.reset.key, x.reset.vars) }) : null].filter(Boolean).join(' · ');
    const peer = notifyAllowed(getState().peers);
    const rec = { at: Date.now(), ...a, title, body, notify: peer.allowed };
    usageAlerts.push(rec); if (usageAlerts.length > 20) usageAlerts.shift();
    if (!peer.allowed || !window.mt || !window.mt.notify) return;
    window.mt.notify({ sessionId: null, key: `usage|${a.key}`, title, body }).then((r) => { rec.result = r; }).catch((e) => { rec.result = { shown: false, reason: e.message }; });
  });
}
