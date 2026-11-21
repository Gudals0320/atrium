// P307: 휴대폰의 목표 레인(셈은 lib/phone-plan.js, PC 판은 Plan.jsx, 설계 experiments/p301/p301-design.md 4.4절과 v2 6·7절).
// - PhoneLaneChip: 세션 맵 워크스페이스 머리 오른쪽 끝의 칩. 레인이 하나면 "수집 M2 3/7", 둘 이상이면 "레인 n". 사용자 항목이 남으면 청록 점.
// - PhonePlanSheet: 아래 시트(할 일 시트 말투, 86vh). 레인 목록 → 레인(목표 두 줄 말줄임, 측정값 가로 넘김, 마일스톤 계단 가로 넘김,
//   펼친 마일스톤의 체크리스트(누를 칸 36px), "사용자 것만" 거르기). 고치기는 체크·지금 마일스톤·측정값 지금 값만(나머지는 PC).
//   시트가 떠 있는 동안(휴대폰 화면) 할 일 시트의 "목표 판" 단추는 이 시트의 그 레인을 연다(store.js openPlanBoard).
import { useEffect, useMemo, useState } from 'react';
import { useStore, wsName, openPhonePlan, closePhonePlan, phonePlanHost, loadPlanDoc, planOp } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { agoText } from './lib/labels.js';
import { checkOp, metricPct, chipText } from './lib/plans.js';
import { phoneChip, sheetPick, sheetItems, sheetSteps } from './lib/phone-plan.js';

const lanesOf = (st) => st.plans;
function useLanes() { const m = useStore(lanesOf); return useMemo(() => [...m.values()], [m]); }

// ---------- 폴더 머리 칩 ----------
export function PhoneLaneChip({ wsKey, lite = false }) {
  const t = useT();
  const lanes = useLanes();
  const c = useMemo(() => phoneChip(lanes, wsKey, { lite }), [lanes, wsKey, lite]);
  if (!c) return null;
  const text = c.one ? chipText(c.one) : t('plan.folded', { n: c.n });
  return (
    <button type="button" className={`mt-pp-chip${c.dim ? ' dim' : ''}${c.allChecked ? ' all' : ''}`} data-role="pp-chip" data-ws={wsKey} data-count={c.n} data-folded={c.folded ? '1' : undefined} data-plan={c.one ? c.one.planId : undefined} data-user-left={c.userLeft || undefined}
      aria-label={c.one ? t('plan.chipTitle', { name: c.one.name, status: t(`plan.status.${c.one.status}`), progress: c.one.code ? `${c.one.code} ${c.one.done}/${c.one.total}` : t('plan.noMsShort') }) : t('plan.foldedTitle', { n: c.n })}
      onClick={(e) => { e.stopPropagation(); openPhonePlan(wsKey, c.one ? c.one.planId : null); }}>
      <i className="ring" aria-hidden="true" /><span className="tx">{text}</span>{c.userLeft > 0 ? <i className="udot" aria-hidden="true" /> : null}
    </button>
  );
}

// ---------- 아래 시트 ----------
export function PhonePlanSheet() {
  useEffect(() => phonePlanHost(), []);
  const sheet = useStore((st) => st.phonePlan);
  const lanes = useLanes();
  const v = useMemo(() => sheetPick(lanes, sheet), [lanes, sheet]);
  const t = useT();
  const [note, setNote] = useState(null);
  useEffect(() => { if (!note) return undefined; const id = setTimeout(() => setNote(null), 2600); return () => clearTimeout(id); }, [note]);
  if (!v) return null;
  const say = (text, level = 'ok') => setNote({ id: Date.now(), text, level });
  const lane = v.mode === 'lane' ? v.lane : null;
  return (
    <div className="mt-dc-sheet mt-pp-sheet" data-role="pp-sheet" data-mode={v.mode} data-ws={v.wsKey} data-plan={lane ? lane.planId : undefined} role="dialog" aria-label={t('plan.head')}>
      <div className="mt-dc-scrim" onClick={closePhonePlan} />
      <div className="mt-dc-panel mt-pp-panel">
        <div className="mt-dc-sheet-head mt-pp-head">
          {lane && v.back ? <button type="button" className="mt-pp-back" data-action="pp-back" aria-label={t('phonePlan.back')} onClick={() => openPhonePlan(v.wsKey, null)}>‹</button> : null}
          <b className="mt-pp-ws">{lane ? lane.name : (wsName(v.wsKey) || v.wsKey)}</b>
          <span className="mt-pp-hsub">· {lane ? (lane.workspace || wsName(lane.wsKey)) : t('phonePlan.lanes', { n: v.chips.length })}</span>
          {note ? <span key={note.id} className={`mt-ut-note ${note.level}`} data-role="pp-note" role="status">{note.text}</span> : null}
          <button type="button" className="mt-dc-x" data-action="pp-close" aria-label={t('common.close')} onClick={closePhonePlan}>×</button>
        </div>
        <div className="mt-dc-sheet-body mt-pp-body">
          {lane ? <Lane key={lane.planId} lane={lane} t={t} say={say} /> : <LaneList v={v} t={t} />}
        </div>
      </div>
    </div>
  );
}

function LaneList({ v, t }) {
  if (!v.chips.length) return <div className="mt-pp-none" data-role="pp-empty">{t('phonePlan.noLanes')}</div>;
  return (
    <div className="mt-pp-list" data-role="pp-list">
      {v.chips.map((c) => (
        <button key={c.planId} type="button" className={`mt-pp-row${c.dim ? ' dim' : ''}${c.allChecked && !c.dim ? ' all' : ''}`} data-action="pp-lane" data-plan={c.planId} onClick={() => openPhonePlan(v.wsKey, c.planId)}>
          <b className="nm">{c.name}</b>
          <span className="pg mono">{c.code ? `${c.code} ${c.done}/${c.total}` : t('plan.noMsShort')}</span>
          {c.userLeft > 0 && !c.dim ? <span className="us" data-role="pp-row-user">{t('plan.userN', { n: c.userLeft })}</span> : null}
          {c.dim ? <span className="st">{t(`plan.status.${c.status}`)}</span> : null}
          <span className="go" aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
}

function Lane({ lane, t, say }) {
  const [picked, setPicked] = useState(null);
  const [userOnly, setUserOnly] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // 문서: 열 때와 레인이 바뀔 때(rev). plan.changed가 문서를 실어 오면 그것으로 충분하다
  useEffect(() => { if (lane.doc) return undefined; let off = false; loadPlanDoc(lane.planId).catch((e) => { if (!off) say(t('plan.fail', { error: errText(e) }), 'error'); }); return () => { off = true; }; }, [lane.planId, lane.rev, !!lane.doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const doc = lane.doc;
  const { steps, ms } = useMemo(() => sheetSteps(doc, picked), [doc, picked]);
  const items = sheetItems(ms, userOnly);
  const op = async (ops, okText) => {
    setBusy(true);
    try { const r = await planOp(lane.planId, ops); if (okText) say(okText); return r; } catch (e) { say(t('plan.fail', { error: errText(e) }), 'error'); return null; } finally { setBusy(false); }
  };
  const o = lane.owner;
  return (
    <div className="mt-pp-lane" data-role="pp-lane" data-plan={lane.planId} data-rev={lane.rev}>
      <div className="mt-pp-meta" data-role="pp-meta">
        <span className="dim">{t('plan.manager')}</span>
        <span className={`mt-pp-owner${o ? '' : ' none'}`} data-role="pp-owner">{o ? '@' + (o.name || '?') : t('plan.noManager')}</span>
        {lane.status !== 'active' ? <span className={`mt-pp-st st-${lane.status}`}>{t(`plan.status.${lane.status}`)}</span> : null}
      </div>
      {!doc ? <div className="mt-pp-none">{t('plan.loading')}</div> : <>
        <div className={`mt-pp-goal${doc.goal ? '' : ' none'}${goalOpen ? ' open' : ''}`} data-role="pp-goal" onClick={() => setGoalOpen((x) => !x)}>{doc.goal || t('plan.noGoal')}</div>
        {doc.metrics.length > 0 && <div className="mt-pp-metrics" data-role="pp-metrics">{doc.metrics.map((m) => <Metric key={m.id} m={m} t={t} onSave={(val) => op({ op: 'metricNow', metric: m.id, now: val }, t('plan.metricSaved', { name: m.name }))} />)}</div>}
        {steps.length ? <>
          <div className="mt-pp-steps" data-role="pp-steps">
            {steps.map((s) => (
              <button key={s.code} type="button" className={`mt-pp-step${s.focus ? ' focus' : ''}${s.state === 'done' ? ' done' : ''}${s.open ? ' open' : ''}`} data-action="pp-step" data-ms={s.code} aria-pressed={s.open} onClick={() => setPicked(s.code)}>
                {s.focus && s.state !== 'done' ? <i className="sdot" aria-hidden="true" /> : null}{s.code}{s.state === 'done' ? ' ✓' : <span className="mono"> {s.done}/{s.total}</span>}
              </button>
            ))}
          </div>
          {ms && (
            <div className={`mt-pp-ms${ms.code === doc.focus ? ' focus' : ''}${ms.state === 'done' ? ' done' : ''}`} data-role="pp-ms" data-ms={ms.code}>
              <div className="mt-pp-ms-head">
                <b className="mono">{ms.code}</b><b className="tt">{ms.title}</b>
                {ms.code === doc.focus ? <span className="mt-plan-now" data-role="pp-focus-tag">{t('plan.now')}</span>
                  : <button type="button" className="mt-btn small" data-action="pp-focus" disabled={busy} onClick={() => op({ op: 'focus', code: ms.code }, t('plan.focusSet', { code: ms.code }))}>{t('plan.makeFocus')}</button>}
              </div>
              <MsBar ms={ms} />
              {(ms.purpose || ms.doneWhen) && (
                <div className="mt-pp-why" data-role="pp-why">
                  {ms.purpose ? <div><span className="dim">{t('plan.purpose')}</span><span>{ms.purpose}</span></div> : null}
                  {ms.doneWhen ? <div><span className="dim">{t('plan.doneWhen')}</span><span>{ms.doneWhen}</span></div> : null}
                </div>
              )}
              <div className="mt-pp-filter">
                <span className="mono dim" data-role="pp-ms-count">{t('plan.progress', { done: ms.items.filter((x) => x.done).length, total: ms.items.length, n: ms.items.filter((x) => x.who === 'user' && !x.done).length })}</span>
                <button type="button" className={`mt-pp-toggle${userOnly ? ' on' : ''}`} data-action="pp-user-only" aria-pressed={userOnly} onClick={() => setUserOnly((x) => !x)}><i aria-hidden="true" />{t('phonePlan.userOnly')}</button>
              </div>
              <div className="mt-pp-items" data-role="pp-items">
                {items.map((x) => <Item key={x.id} x={x} t={t} busy={busy} onToggle={() => op(checkOp(x.id, !x.done), x.done ? t('plan.unchecked', { id: x.id }) : t('plan.checked', { id: x.id }))} />)}
                {!items.length && <div className="mt-pp-none">{userOnly ? t('phonePlan.noUserItems') : t('plan.noItems')}</div>}
              </div>
            </div>
          )}
        </> : <div className="mt-pp-none" data-role="pp-no-ms">{t('plan.noMs')}</div>}
        <div className="mt-pp-foot dim" data-role="pp-foot">{t('phonePlan.pcOnly')}</div>
      </>}
    </div>
  );
}
function MsBar({ ms }) {
  const total = ms.items.length || 1;
  const uDone = ms.items.filter((x) => x.who === 'user' && x.done).length, hDone = ms.items.filter((x) => x.who !== 'user' && x.done).length;
  return <div className="mt-plan-bar2 mt-pp-bar" aria-hidden="true"><i className="h" style={{ width: `${(hDone / total) * 100}%` }} /><i className="u" style={{ width: `${(uDone / total) * 100}%` }} /></div>;
}
function Metric({ m, t, onSave }) {
  const [edit, setEdit] = useState(null);
  const pct = metricPct(m);
  const save = () => { const val = edit; setEdit(null); if (val != null && val.trim() !== String(m.now ?? '')) onSave(val.trim()); };
  return (
    <div className="mt-pp-metric" data-role="pp-metric" data-metric={m.id}>
      <span className="nm">{m.name}</span>
      <span className="vl">
        {edit == null
          ? <button type="button" className="now" data-action="pp-metric-now" aria-label={t('plan.metricNowTitle')} onClick={() => setEdit(String(m.now ?? ''))}>{m.now ?? '-'}</button>
          : <input autoFocus className="mt-dc-input" data-field="pp-metric-now" value={edit} maxLength={40} enterKeyHint="done" onChange={(e) => setEdit(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEdit(null); }} onBlur={save} />}
        <span className="dim"> → {m.target ?? '-'}{m.unit ? m.unit : ''}</span>
      </span>
      {pct != null ? <span className="mt-plan-mbar"><i style={{ width: `${Math.round(pct * 100)}%` }} /></span> : null}
    </div>
  );
}
function Item({ x, t, busy, onToggle }) {
  const done = !!x.done;
  return (
    <label className={`mt-pp-item${done ? ' done' : ''}`} data-role="pp-item" data-item={x.id} data-who={x.who} data-done={done ? '1' : undefined}>
      <input type="checkbox" className="mt-pp-check" data-action="pp-check" checked={done} disabled={busy} aria-label={done ? t('plan.uncheckTitle') : t('plan.checkTitle')} onChange={onToggle} />
      <span className="mono dim iid">{x.id}</span>
      <span className="itx">
        <span className="it">{x.text}</span>
        {x.note ? <span className="in">{x.note}</span> : null}
        {done ? <span className="in" data-role="pp-item-done">{t('plan.checkedBy', { by: x.done.by === 'user' ? t('plan.who.user') : '@' + x.done.by, ago: agoText(x.done.at) })}</span> : null}
      </span>
      <span className={`mt-plan-who ${x.who}`}>{t(`plan.who.${x.who}`)}</span>
    </label>
  );
}
