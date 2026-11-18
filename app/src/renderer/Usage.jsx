// P211: 구독 사용량 화면. 위 막대 알약(메모리 알약 옆, 휴대폰은 위쪽 줄)과 펼침, 호출자 옆 남은 양, 90% 알림.
// 값은 백엔드 usage.get·usage.updated(store.usage). 움직임 없이 그린다(막대는 너비만, 전환 없음)
import { useEffect, useRef, useState } from 'react';
import { useStore, getState } from './store.js';
import { api } from './api.js';
import { useT, t as tt } from './lib/i18n.js';
import { notifyAllowed } from './lib/multiclient.js';
import { PROVIDERS, PROVIDER_NAME, pillOf, livePct, levelOf, spanOf, windowKey, creditOf, remainingOf, providerOfLauncher, alertText } from './lib/usage.js';

function useNow(ms = 30000) { const [n, set] = useState(Date.now()); useEffect(() => { const id = setInterval(() => set(Date.now()), ms); return () => clearInterval(id); }, [ms]); return n; }
const span = (t, ms) => { const s = spanOf(ms); return t(s.key, s.vars); };
const winName = (t, id) => (windowKey(id) ? t(windowKey(id)) : id);

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
  if (!e) return (
    <div className="mt-usage-prov unknown" data-role="usage-provider" data-provider={k}>
      <div className="mt-usage-head"><b>{PROVIDER_NAME[k]}</b><span className="dim">{t('usage.unknown')}</span></div>
      <div className="mt-usage-src dim">{t(`usage.unknownWhy.${k}`)}</div>
    </div>
  );
  const c = creditOf(e.credits);
  return (
    <div className="mt-usage-prov" data-role="usage-provider" data-provider={k}>
      <div className="mt-usage-head"><b>{PROVIDER_NAME[k]}</b>{e.plan && <span className="mt-usage-plan">{e.plan}</span>}<span className="dim mt-usage-ago" title={new Date(e.at).toLocaleString()}>{t('usage.ago', { span: span(t, now - e.at) })}</span></div>
      {e.windows.map((w) => {
        const p = livePct(w, now);
        const lv = levelOf(p);
        return (
          <div key={w.id} className={`mt-usage-win lv-${lv}`} data-role="usage-window" data-window={w.id} data-pct={Math.round(p)}>
            <span className="mt-usage-wname">{winName(t, w.id)}</span>
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

// 위 막대 알약: 구독마다 가장 높은 창의 사용률(예 Claude 81% · Codex 81%), 가장 높은 값의 색. 누르면 펼침
export function UsagePill() {
  const t = useT();
  const v = useStore((st) => st.usage);
  const now = useNow();
  const [open, setOpen, ref] = useDrop();
  if (!v) return null;
  const pill = pillOf(v, now);
  const title = pill.parts.map((x) => `${x.name} ${winName(t, x.window)} ${x.pct}%`).join('\n') || t('usage.none');
  return (
    <div className="mt-drop" ref={ref}>
      <button className={`mt-cp usage lv-${pill.level}${open ? ' on' : ''}`} title={title} data-role="usage" data-level={pill.level} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={`mt-usage-dot lv-${pill.level}`} aria-hidden="true" />
        {pill.parts.length ? pill.parts.map((x, i) => (
          <span key={x.provider} className="mt-usage-part" data-provider={x.provider} data-pct={x.pct}>{i > 0 && <span className="dim">·</span>}<span className="dim">{x.name}</span><span className={`mono lv-${x.level}`}>{x.pct}%</span></span>
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
