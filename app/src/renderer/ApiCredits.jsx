// P361: API 크레딧 장부 화면. 사용량 팝업의 "API 크레딧" 칸(CreditsBlock), 설정 › 런처의 장부 칸(ApiCreditsPanel: 붙여 넣기·미리 보기·손 편집·요금제·Admin 키),
// SDK 세션이 쓴 금액(SdkCost, 추정), 만료·바닥 알림(startCreditAlerts). 값은 백엔드 usage.get·usage.updated의 apiCredits(store.usage.apiCredits)
import { useState } from 'react';
import { useStore, getState, toast } from './store.js';
import { api } from './api.js';
import { useT, t as tt, errText } from './lib/i18n.js';
import { notifyAllowed } from './lib/multiclient.js';
import { usd, whenShort, dayShort, leftOf, targetsShort, barPct, grantLevel, sessionCost, saveBodyOf, toLocalInput, fromLocalInput, moneyInput, RULE_KEY } from './lib/api-credits.js';
import { spanOf } from './lib/usage.js';
import { setCostRender } from './lib/cost-slot.js';

const span = (t, ms) => { const s = spanOf(ms); return t(s.key, s.vars); };
const useCredits = () => useStore((st) => (st.usage && st.usage.apiCredits) || null);

function BasisTag({ c, now }) {
  const t = useT();
  const official = c.basis === 'official';
  const title = official ? t('apiCredits.officialTitle', { at: c.basisAt ? new Date(c.basisAt).toLocaleString() : '?' }) : t('apiCredits.estimateTitle', { updated: c.prices ? c.prices.updated : '?' });
  return <span className={`mt-cr-basis ${official ? 'official' : 'estimate'}`} data-role="credits-basis" data-basis={c.basis} title={title}>{official ? t('apiCredits.official') : t('apiCredits.estimate')}{official && c.basisAt ? <span className="dim"> · {t('usage.ago', { span: span(t, now - c.basisAt) })}</span> : null}</span>;
}

// 지급 한 줄: 이름, 잔액/총액 막대, 적용 대상 줄임(툴팁), 만료일과 남은 때, 부여 날짜
function GrantRow({ g, now }) {
  const t = useT();
  const tg = targetsShort(g.appliesTo);
  const lv = grantLevel(g);
  const left = leftOf(g.expiresAt, now);
  return (
    <div className={`mt-cr-grant lv-${lv}${g.expired ? ' expired' : ''}`} data-role="credits-grant" data-id={g.id} data-kind={g.kind} data-soon={g.soon ? '1' : undefined} data-expired={g.expired ? '1' : undefined}>
      <div className="mt-cr-grant-top">
        <span className="mt-cr-name" title={g.name}>{g.name}</span>
        <span className={`mt-cr-kind k-${g.kind}`} title={t(g.kind === 'plan' ? 'apiCredits.kindPlanTitle' : 'apiCredits.kindPromoTitle')}>{t(g.kind === 'plan' ? 'apiCredits.kindPlan' : 'apiCredits.kindPromo')}</span>
        <span className="mt-cr-amt mono" data-role="credits-grant-left">{g.expired ? t('apiCredits.expired') : `${usd(g.left)} / ${usd(g.total)}`}</span>
      </div>
      <span className="mt-cr-bar" aria-hidden="true"><span style={{ width: `${barPct(g)}%` }} /></span>
      <div className="mt-cr-grant-sub dim">
        <span className={`mt-cr-exp${g.soon ? ' soon' : ''}`} data-role="credits-grant-exp" title={g.expiresAt ? new Date(g.expiresAt).toLocaleString() : ''}>{g.expiresAt ? t('apiCredits.expires', { when: whenShort(g.expiresAt, g.hasTime) }) : ''}{g.expired ? '' : ` (${t(left.key, left.vars)})`}</span>
        {g.grantedOn ? <span>{t('apiCredits.granted', { day: dayShort(g.grantedOn) })}</span> : null}
        {tg.text ? <span className="mt-cr-targets" title={`${t('apiCredits.appliesTo')}: ${(g.appliesTo || []).join(', ')}`}>{tg.text}{tg.more ? ` ${t('apiCredits.more', { n: tg.more })}` : ''}</span> : null}
        {g.spent > 0 ? <span title={t('apiCredits.spentTitle')}>{t('apiCredits.spentSince', { amt: usd(g.spent, { small: true }) })}</span> : null}
      </div>
    </div>
  );
}

// 사용량 팝업의 칸
export function CreditsBlock({ now = Date.now() }) {
  const t = useT();
  const c = useCredits();
  if (!c) return null;
  const tot = c.totals;
  return (
    <div className="mt-usage-prov mt-credits" data-role="api-credits" data-ledger={c.ledger ? '1' : '0'} data-basis={c.basis}>
      <div className="mt-usage-head"><b>{t('apiCredits.head')}</b><BasisTag c={c} now={now} /><span className="mt-cr-rule dim" data-role="credits-rule" title={t(RULE_KEY)}>ⓘ</span></div>
      {!c.ledger ? <div className="mt-usage-src dim" data-role="credits-empty">{t('apiCredits.noLedger')}</div> : <>
        <div className="mt-cr-totals" data-role="credits-totals">
          <span className="mt-cr-usable" title={t('apiCredits.usableTitle')}><b className="mono">{usd(tot.usable)}</b> {t('apiCredits.usable')}</span>
          <span className="dim">{t('apiCredits.planShort')} {usd(tot.plan)}</span>
          <span className="dim">{t('apiCredits.promoShort')} {usd(tot.promo)}</span>
          {tot.purchased != null ? <span className={`mt-cr-purchased${tot.purchased < 0 ? ' due' : ''}`} data-role="credits-purchased" title={t('apiCredits.purchasedTitle')}>{t('apiCredits.purchasedShort')} {usd(tot.purchased)}{tot.purchased < 0 ? ` (${t('apiCredits.due')})` : ''}</span> : null}
        </div>
        {(c.grants || []).map((g) => <GrantRow key={g.id} g={g} now={now} />)}
        {c.nextGrant ? <div className="mt-cr-next dim" data-role="credits-next" title={t('apiCredits.nextTitle')}>{t('apiCredits.next', { day: dayShort(c.nextGrant.date), amt: c.nextGrant.amount != null ? usd(c.nextGrant.amount) : '?' })}</div> : null}
        {c.exhausted ? <div className="mt-cr-warn" data-role="credits-exhausted">{t('apiCredits.exhausted')}</div> : null}
      </>}
      <div className="mt-cr-spend" data-role="credits-spend"><span>{t('apiCredits.spendToday', { amt: usd(c.spend ? c.spend.today : 0) })}</span><span>{t('apiCredits.spendMonth', { amt: usd(c.spend ? c.spend.month : 0) })}</span></div>
      <div className="mt-usage-src dim">
        {c.ledger && c.pastedAt ? t('apiCredits.pastedAgo', { span: span(t, now - c.pastedAt) }) : ''}
        {c.unpriced ? ` · ${t('apiCredits.unpriced', { n: c.unpriced })}` : ''}
        {c.officialError ? ` · ${t('apiCredits.officialFailed', { why: c.officialError })}` : ''}
      </div>
    </div>
  );
}

// SDK 세션 노드·세션 맵 카드의 금액(추정)
export function SdkCost({ sessionId, className = '' }) {
  const t = useT();
  const v = useStore((st) => sessionCost(st.usage, sessionId));
  if (v == null) return null;
  return <span className={`mt-cr-cost ${className}`} data-role="sdk-cost" data-usd={v} title={t('apiCredits.sessionCostTitle')}>{usd(v, { small: true })}</span>;
}
setCostRender((sid) => <SdkCost sessionId={sid} className="map" />); // 세션 맵 카드 자리(lib/cost-slot.js)

// ---------- 설정 ----------
function PreviewTable({ pv }) {
  const t = useT();
  return (
    <div className="mt-cr-preview" data-role="credits-preview">
      <div className="mt-cr-preview-head">{t('apiCredits.previewHead')}</div>
      {pv.purchased ? <div data-role="credits-preview-purchased">{t('apiCredits.purchasedShort')} <b className="mono">{usd(pv.purchased.balance)}</b>{pv.purchased.due ? ` (${t('apiCredits.due')})` : ''}{pv.autoReload === false ? ` · ${t('apiCredits.autoOff')}` : pv.autoReload ? ` · ${t('apiCredits.autoOn')}` : ''}</div> : null}
      {pv.grants.length ? (
        <table className="mt-cr-table">
          <thead><tr><th>{t('apiCredits.colName')}</th><th>{t('apiCredits.colLeft')}</th><th>{t('apiCredits.appliesTo')}</th><th>{t('apiCredits.colExpires')}</th><th>{t('apiCredits.colGranted')}</th></tr></thead>
          <tbody>{pv.grants.map((g, i) => (
            <tr key={i} data-role="credits-preview-grant"><td>{g.name} <span className={`mt-cr-kind k-${g.kind}`}>{t(g.kind === 'plan' ? 'apiCredits.kindPlan' : 'apiCredits.kindPromo')}</span></td><td className="mono">{usd(g.remaining)} / {usd(g.total)}</td><td>{(g.appliesTo || []).join(', ')}</td><td>{g.expiresAt ? new Date(g.expiresAt).toLocaleString() : '—'}</td><td>{g.grantedOn || '—'}</td></tr>
          ))}</tbody>
        </table>
      ) : null}
      {pv.planGuess ? <div className="dim">{t('apiCredits.planGuess', { name: pv.planGuess.name || '?', amt: usd(pv.planGuess.amount), day: pv.planGuess.day })}</div> : null}
      {pv.warnings.filter((w) => w !== 'nothing').map((w) => <div key={w} className="mt-cr-warn" data-role="credits-preview-warn">{t(`apiCredits.warn.${w}`)}</div>)}
    </div>
  );
}

function GrantEdit({ g, onDone }) {
  const t = useT();
  const [f, setF] = useState(() => ({ name: g ? g.name : '', kind: g ? g.kind : 'promo', remaining: g ? String(g.remaining ?? '') : '', total: g && g.total != null ? String(g.total) : '', expires: g ? toLocalInput(g.expiresAt) : '', granted: g && g.grantedOn ? g.grantedOn : '', targets: g ? (g.appliesTo || []).join(', ') : '' }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const remaining = moneyInput(f.remaining), total = moneyInput(f.total);
    if (remaining == null || remaining === undefined || total === undefined) { toast(t('apiCredits.err.amount'), 'error'); return; }
    const grant = { name: f.name, kind: f.kind, remaining, total, expiresAt: fromLocalInput(f.expires), hasTime: /T/.test(f.expires), grantedOn: f.granted || null, appliesTo: f.targets };
    setBusy(true);
    try { await api.call('credits.grant', g ? { op: 'update', id: g.id, grant } : { op: 'add', grant }); toast(t('apiCredits.saved')); onDone(); }
    catch (e) { toast(t('apiCredits.saveFailed', { error: errText(e) }), 'error'); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-cr-edit" data-role="credits-grant-edit">
      <input className="mt-cr-in name" placeholder={t('apiCredits.colName')} value={f.name} onChange={set('name')} data-role="credits-in-name" />
      <select className="mt-cr-in" value={f.kind} onChange={set('kind')} data-role="credits-in-kind"><option value="plan">{t('apiCredits.kindPlan')}</option><option value="promo">{t('apiCredits.kindPromo')}</option></select>
      <input className="mt-cr-in money" placeholder={t('apiCredits.colRemaining')} value={f.remaining} onChange={set('remaining')} data-role="credits-in-remaining" />
      <input className="mt-cr-in money" placeholder={t('apiCredits.colTotal')} value={f.total} onChange={set('total')} data-role="credits-in-total" />
      <input className="mt-cr-in" type="datetime-local" title={t('apiCredits.colExpires')} value={f.expires} onChange={set('expires')} data-role="credits-in-expires" />
      <input className="mt-cr-in" type="date" title={t('apiCredits.colGranted')} value={f.granted} onChange={set('granted')} data-role="credits-in-granted" />
      <input className="mt-cr-in targets" placeholder={t('apiCredits.appliesTo')} value={f.targets} onChange={set('targets')} />
      <button className="mt-btn small primary" disabled={busy} onClick={save} data-role="credits-grant-save">{t('apiCredits.save')}</button>
      <button className="mt-btn small" disabled={busy} onClick={onDone}>{t('apiCredits.cancel')}</button>
    </div>
  );
}

function AdminKey({ present }) {
  const t = useT();
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const k = val; setVal(''); // 보내는 즉시 칸을 비운다
    if (!k.trim()) return;
    setBusy(true);
    try { await api.call('relay.setAdminKey', { key: k }); toast(t('apiCredits.adminSaved')); }
    catch (e) { toast(t('apiCredits.saveFailed', { error: errText(e) }), 'error'); }
    finally { setBusy(false); }
  };
  const remove = async () => { setBusy(true); try { await api.call('relay.removeAdminKey', {}); toast(t('apiCredits.adminRemoved')); } catch (e) { toast(t('apiCredits.saveFailed', { error: errText(e) }), 'error'); } finally { setBusy(false); } };
  return (
    <div className="mt-cr-admin" data-role="credits-admin" data-present={present ? '1' : '0'}>
      <span className="mt-cr-sub-title">{t('apiCredits.adminTitle')}</span>
      {present
        ? <><span className="mt-apikey-state">{t('apiCredits.adminSavedState')}</span><button className="mt-btn small danger" disabled={busy} onClick={remove} data-role="credits-admin-remove">{t('apiCredits.adminRemove')}</button></>
        : <><input type="password" className="mt-apikey-input" autoComplete="off" spellCheck={false} placeholder={t('apiCredits.adminPlaceholder')} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} data-role="credits-admin-input" /><button className="mt-btn small primary" disabled={busy || !val.trim()} onClick={save} data-role="credits-admin-save">{t('apiCredits.save')}</button></>}
      <div className="mt-apikey-note dim">{t('apiCredits.adminNote')}</div>
    </div>
  );
}

export function ApiCreditsPanel() {
  const t = useT();
  const c = useCredits();
  const now = Date.now();
  const [text, setText] = useState('');
  const [pv, setPv] = useState(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null); // 지급 id | 'new'
  const [plan, setPlan] = useState(null);
  const [pur, setPur] = useState(null);
  const [sure, setSure] = useState(false);
  const read = async () => {
    setBusy(true);
    try { const r = await api.call('credits.preview', { text }); setPv(r); if (!r.found) toast(t('apiCredits.warn.nothing'), 'error'); }
    catch (e) { toast(t('apiCredits.saveFailed', { error: errText(e) }), 'error'); }
    finally { setBusy(false); }
  };
  const savePv = async () => {
    setBusy(true);
    try { await api.call('credits.save', saveBodyOf(pv)); setPv(null); setText(''); toast(t('apiCredits.saved')); }
    catch (e) { toast(t('apiCredits.saveFailed', { error: errText(e) }), 'error'); }
    finally { setBusy(false); }
  };
  const call = async (m, p) => { setBusy(true); try { await api.call(m, p); toast(t('apiCredits.saved')); return true; } catch (e) { toast(t('apiCredits.saveFailed', { error: errText(e) }), 'error'); return false; } finally { setBusy(false); } };
  const curPlan = c && c.plan ? c.plan : null;
  const pf = plan || { name: curPlan ? curPlan.name || '' : '', amount: curPlan && curPlan.amount != null ? String(curPlan.amount) : '', day: curPlan ? String(curPlan.day) : '' };
  const purVal = pur ?? (c && c.purchased ? String(c.purchased.seen) : '');
  const adminPresent = !!(c && c.adminKey);
  return (
    <div className="mt-apikey mt-cr-panel" data-role="credits-panel">
      <div className="mt-apikey-head"><span className="mt-apikey-title">{t('apiCredits.panelTitle')}</span>{c ? <BasisTag c={c} now={now} /> : null}</div>
      <div className="mt-apikey-note dim">{t('apiCredits.panelNote')}</div>
      <textarea className="mt-cr-paste" rows={4} placeholder={t('apiCredits.pastePlaceholder')} value={text} onChange={(e) => { setText(e.target.value); setPv(null); }} data-role="credits-paste" spellCheck={false} />
      <div className="mt-apikey-row">
        <button className="mt-btn small" disabled={busy || !text.trim()} onClick={read} data-role="credits-read">{t('apiCredits.read')}</button>
        {pv && pv.found ? <><button className="mt-btn small primary" disabled={busy} onClick={savePv} data-role="credits-save">{t('apiCredits.saveLedger')}</button><button className="mt-btn small" onClick={() => setPv(null)}>{t('apiCredits.cancel')}</button></> : null}
      </div>
      {pv && pv.found ? <PreviewTable pv={pv} /> : null}

      {c && c.ledger ? (
        <div className="mt-cr-ledger" data-role="credits-ledger">
          <div className="mt-cr-sub-title">{t('apiCredits.ledgerTitle', { span: c.pastedAt ? span(t, now - c.pastedAt) : '?' })}</div>
          {(c.grants || []).map((g) => edit === g.id ? <GrantEdit key={g.id} g={g} onDone={() => setEdit(null)} /> : (
            <div key={g.id} className="mt-cr-ledger-row" data-role="credits-ledger-row" data-id={g.id}>
              <span className="mt-cr-name">{g.name}</span><span className={`mt-cr-kind k-${g.kind}`}>{t(g.kind === 'plan' ? 'apiCredits.kindPlan' : 'apiCredits.kindPromo')}</span>
              <span className="mono">{usd(g.remaining)} / {usd(g.total)}</span>
              <span className="dim">{g.expiresAt ? t('apiCredits.expires', { when: whenShort(g.expiresAt, g.hasTime) }) : t('apiCredits.noExpiry')}</span>
              <span className="dim">{g.grantedOn ? t('apiCredits.granted', { day: dayShort(g.grantedOn) }) : ''}</span>
              <button className="mt-btn small" onClick={() => setEdit(g.id)} data-role="credits-edit">{t('apiCredits.edit')}</button>
              <button className="mt-btn small danger" disabled={busy} onClick={() => call('credits.grant', { op: 'remove', id: g.id })} data-role="credits-remove">{t('apiCredits.remove')}</button>
            </div>
          ))}
          {edit === 'new' ? <GrantEdit g={null} onDone={() => setEdit(null)} /> : <button className="mt-btn small" onClick={() => setEdit('new')} data-role="credits-add">{t('apiCredits.add')}</button>}
        </div>
      ) : <div className="mt-apikey-row"><button className="mt-btn small" onClick={() => setEdit('new')} data-role="credits-add">{t('apiCredits.add')}</button>{edit === 'new' ? <GrantEdit g={null} onDone={() => setEdit(null)} /> : null}</div>}

      <div className="mt-cr-line" data-role="credits-purchased-edit">
        <span className="mt-cr-sub-title">{t('apiCredits.purchasedLabel')}</span>
        <input className="mt-cr-in money" value={purVal} placeholder="-4.33" onChange={(e) => setPur(e.target.value)} data-role="credits-in-purchased" />
        <button className="mt-btn small" disabled={busy || pur == null} onClick={async () => { const v = moneyInput(pur); if (v === undefined) { toast(t('apiCredits.err.amount'), 'error'); return; } if (await call('credits.purchased', { balance: v })) setPur(null); }}>{t('apiCredits.save')}</button>
      </div>
      <div className="mt-cr-line" data-role="credits-plan">
        <span className="mt-cr-sub-title" title={t('apiCredits.planTitle')}>{t('apiCredits.planLabel')}</span>
        <input className="mt-cr-in" placeholder="Ultra" value={pf.name} onChange={(e) => setPlan({ ...pf, name: e.target.value })} data-role="credits-in-plan-name" />
        <input className="mt-cr-in money" placeholder="200" value={pf.amount} onChange={(e) => setPlan({ ...pf, amount: e.target.value })} data-role="credits-in-plan-amount" />
        <input className="mt-cr-in day" placeholder={t('apiCredits.dayPlaceholder')} value={pf.day} onChange={(e) => setPlan({ ...pf, day: e.target.value })} data-role="credits-in-plan-day" />
        <button className="mt-btn small" disabled={busy || !plan} onClick={async () => { const amount = moneyInput(pf.amount); if (amount === undefined) { toast(t('apiCredits.err.amount'), 'error'); return; } if (await call('credits.plan', { plan: pf.day ? { name: pf.name, amount, day: Number(pf.day) } : null })) setPlan(null); }} data-role="credits-plan-save">{t('apiCredits.save')}</button>
        {c && c.nextGrant ? <span className="dim">{t('apiCredits.next', { day: dayShort(c.nextGrant.date), amt: c.nextGrant.amount != null ? usd(c.nextGrant.amount) : '?' })}</span> : null}
      </div>
      <AdminKey present={adminPresent} />
      <div className="mt-apikey-note dim" title={t(RULE_KEY)}>{t('apiCredits.ruleShort')}</div>
      {c && c.ledger ? <button className={`mt-btn small danger${sure ? ' armed' : ''}`} onClick={async () => { if (!sure) { setSure(true); return; } setSure(false); await call('credits.clear', {}); }} data-role="credits-clear">{sure ? t('apiCredits.clearSure') : t('apiCredits.clear')}</button> : null}
    </div>
  );
}

// 알림: 만료 3일 안(지급마다 한 번, 판이 "나중에" 카드도 남긴다), SDK 세션을 띄울 때 크레딧 바닥
export const creditAlerts = []; // 시험이 읽는다
export function startCreditAlerts() {
  api.on('credits.alert', (a) => {
    const title = a.kind === 'expiring' ? tt('apiCredits.alertExpiringTitle') : tt('apiCredits.alertExhaustedTitle');
    const body = a.kind === 'expiring' ? tt('apiCredits.alertExpiring', { name: a.name, amt: usd(a.left), when: whenShort(a.expiresAt) }) : tt('apiCredits.exhaustedWarn', { ...(a.vars || {}), name: a.name || '' });
    const peer = notifyAllowed(getState().peers);
    const rec = { at: Date.now(), ...a, title, body, notify: peer.allowed };
    creditAlerts.push(rec); if (creditAlerts.length > 20) creditAlerts.shift();
    try { toast(`${title}: ${body}`, a.kind === 'exhausted' ? 'error' : undefined); } catch {}
    if (!peer.allowed || !window.mt || !window.mt.notify) return;
    window.mt.notify({ sessionId: null, key: `credits|${a.key || a.kind}`, title, body }).then((r) => { rec.result = r; }).catch((e) => { rec.result = { shown: false, reason: e.message }; });
  });
}
