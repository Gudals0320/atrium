// P306: 목표·마일스톤 레인의 PC 창(판 쪽 backend/src/plan-board.mjs, 셈은 lib/plans.js, 설계 experiments/p301/p301-design.md 4·5절과 v2 6·7절).
// - LaneChips: 워크스페이스 영역 머리(세는 값 뒤)의 레인 칩. 레인마다 "수집 M2 3/7", 사용자 항목이 남으면 청록 점, focus 마일스톤이 모두 체크면 녹색 테두리.
//   멈춤·끝 레인은 흐리게, 보관 레인은 칩에 없다(판의 탭에만). 많으면 "레인 n" 하나로 접고 누르면 레인 목록.
// - ManagerChip: 관리자 세션 카드 머리와 세션 맵 카드의 자기 레인 칩(여럿이면 "레인 n").
// - PlanPanelHost: 칩을 누르면 그 아래 화면 기준으로 뜨는 520px 목표 판. 레인 탭, 목표 문장, 측정값(지금 값 고치기), 마일스톤 계단, 펼친 마일스톤의 목적·끝 기준·항목
//   (체크, 더하기·고치기·지우기), 바뀜 n(기록), 관리자 표시와 넘기기, 상태 바꾸기. 사람이 고치는 범위는 HUMAN_OPS(목표 문장·마일스톤 구조는 관리자 명령).
// - PlanCards: 할 일 목록의 가상 "실행" 카드(레인마다 focus 사용자 항목 2장 + "n개 더"). 했음 = 그 항목 체크, 미루기 = 그 항목 미루기, 목표 판 = 판 열기.
// 사람이 바꾸면 판이 그 레인의 관리자에게 알린다(plan-notify.mjs, 설정 planNotify).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore, getState, toast, openPlanPanel, closePlanPanel, pickPlanTab, loadPlanDoc, planOp, planOwner, planStatus, wsName } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { ago, agoText } from './lib/labels.js';
import { regionChips, chipText, managerLanes, wsLanes, planCards, checkOp, snoozeOp, metricPct, openMs, LANE_STATUSES } from './lib/plans.js';
import { snoozeTimes, whenText } from './lib/decisions.js';

const stop = (e) => e.stopPropagation();
const lanesOf = (st) => st.plans;
function useLanes() { const m = useStore(lanesOf); return useMemo(() => [...m.values()], [m]); }
function useNow(ms = 30000) { const [n, set] = useState(Date.now()); useEffect(() => { const id = setInterval(() => set(Date.now()), ms); return () => clearInterval(id); }, [ms]); return n; }
const fail = (t, e) => toast(t('plan.fail', { error: errText(e) }), 'error');

// ---------- 칩 ----------
function Chip({ c, t, onOpen, small = false }) {
  return (
    <button type="button" className={`mt-plan-chip nodrag${c.dim ? ' dim' : ''}${c.allChecked && !c.dim ? ' all' : ''}${small ? ' small' : ''}`} data-role="plan-chip" data-plan={c.planId} data-status={c.status} data-user-left={c.userLeft || undefined} data-all={c.allChecked ? '1' : undefined} data-plan-anchor="1"
      title={t('plan.chipTitle', { name: c.name, status: t(`plan.status.${c.status}`), progress: c.code ? `${c.code} ${c.done}/${c.total}` : t('plan.noMsShort') }) + (c.userLeft ? ' · ' + t('plan.userLeftTitle', { n: c.userLeft }) : '') + (c.allChecked ? ' · ' + t('plan.allChecked') : '')}
      onMouseDown={stop} onClick={(e) => { e.stopPropagation(); onOpen(c.planId, e.currentTarget); }}>
      <span className="mt-plan-ring" aria-hidden="true" />{chipText(c)}{c.userLeft > 0 && !c.dim ? <i className="mt-plan-udot" aria-hidden="true" /> : null}
    </button>
  );
}
// 접은 칩("레인 n") → 누르면 레인 목록
function FoldedChips({ chips, n, userLeft, allChecked, t, small = false, label = null }) {
  const [menu, setMenu] = useState(null);
  return (
    <>
      <button type="button" className={`mt-plan-chip nodrag fold${allChecked ? ' all' : ''}${small ? ' small' : ''}`} data-role="plan-chip-fold" data-count={n} data-plan-anchor="1" title={t('plan.foldedTitle', { n })}
        onMouseDown={stop} onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu(menu ? null : { x: r.left, y: r.bottom + 4 }); }}>
        <span className="mt-plan-ring" aria-hidden="true" />{label || t('plan.folded', { n })}{userLeft > 0 ? <i className="mt-plan-udot" aria-hidden="true" /> : null}
      </button>
      {menu && <LaneMenu at={menu} chips={chips} t={t} close={() => setMenu(null)} />}
    </>
  );
}
function LaneMenu({ at, chips, t, close }) {
  const box = useRef(null);
  useEffect(() => {
    const down = (e) => { if (box.current && !box.current.contains(e.target)) close(); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', down, true); window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('mousedown', down, true); window.removeEventListener('keydown', key, true); };
  }, [close]);
  return createPortal(
    <div ref={box} className="mt-plan-menu" data-role="plan-lane-menu" style={{ left: Math.max(4, Math.min(window.innerWidth - 300, at.x)), top: at.y }} onMouseDown={stop}>
      {chips.map((c) => (
        <button key={c.planId} type="button" className={`mt-plan-mi${c.dim ? ' dim' : ''}${c.allChecked && !c.dim ? ' all' : ''}`} data-action="plan-lane-open" data-plan={c.planId} onClick={() => { const a = box.current; close(); openPlanPanel(c.planId, a); }}>
          <b>{c.name}</b><span className="mono">{c.code ? `${c.code} ${c.done}/${c.total}` : '—'}</span>{c.userLeft > 0 && !c.dim ? <span className="mt-plan-mi-user">{t('plan.userN', { n: c.userLeft })}</span> : null}{c.dim ? <span className="mt-plan-mi-st">{t(`plan.status.${c.status}`)}</span> : null}
        </button>
      ))}
    </div>,
    document.body,
  );
}
export function LaneChips({ wsKey }) {
  const t = useT();
  const lanes = useLanes();
  const r = useMemo(() => regionChips(lanes, wsKey), [lanes, wsKey]);
  if (!r.n) return null;
  const open = (id, el) => openPlanPanel(id, el, wsKey);
  return (
    <span className="mt-plan-chips" data-role="plan-chips" data-ws={wsKey} data-count={r.n} data-folded={r.folded ? '1' : undefined}>
      {r.folded ? <FoldedChips chips={r.chips} n={r.n} userLeft={r.userLeft} allChecked={r.allChecked} t={t} /> : r.chips.map((c) => <Chip key={c.planId} c={c} t={t} onOpen={open} />)}
    </span>
  );
}
// 관리자 세션 카드 머리·세션 맵 카드
export function ManagerChip({ sessionId, map = false }) {
  const t = useT();
  const lanes = useLanes();
  const mine = useMemo(() => managerLanes(lanes, sessionId), [lanes, sessionId]);
  if (!mine.length) return null;
  const r = regionChips(mine, mine[0].wsKey, 1);
  const chips = mine.map((l) => r.chips.find((c) => c.planId === l.planId)).filter(Boolean);
  const userLeft = chips.filter((c) => !c.dim).reduce((s, c) => s + c.userLeft, 0);
  return (
    <span className={`mt-plan-mgr${map ? ' map' : ''}`} data-role={map ? 'plan-manager-map' : 'plan-manager'} data-count={chips.length} title={t('plan.managerChipTitle', { names: chips.map((c) => c.name).join(', ') })}>
      {chips.length > 1 ? <FoldedChips chips={chips} n={chips.length} userLeft={userLeft} allChecked={chips.some((c) => c.allChecked && !c.dim)} t={t} small /> : <Chip c={chips[0]} t={t} small onOpen={(id, el) => openPlanPanel(id, el)} />}
    </span>
  );
}

// ---------- 목표 판 ----------
export function PlanPanelHost() {
  const p = useStore((st) => st.planPanel);
  const lane = useStore((st) => (st.planPanel ? st.plans.get(st.planPanel.planId) : null));
  useEffect(() => { if (p && !lane) closePlanPanel(); }, [p, lane]);
  if (!p || !lane) return null;
  return <PlanPanel p={p} lane={lane} />;
}
function PlanPanel({ p, lane }) {
  const t = useT();
  const box = useRef(null);
  const now = useNow();
  const lanes = useLanes();
  const tabs = useMemo(() => wsLanes(lanes, lane.wsKey, { all: true }).sort((a, b) => (a.status === 'archived' ? 1 : 0) - (b.status === 'archived' ? 1 : 0) || a.no - b.no), [lanes, lane.wsKey]);
  const [log, setLog] = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  const [picked, setPicked] = useState(null);
  const [pos, setPos] = useState({ left: p.x, top: p.y });
  useEffect(() => { setPicked(null); setLogOpen(false); }, [lane.planId]);
  // 문서와 기록: 열 때와 레인이 바뀔 때(rev)
  useEffect(() => { let off = false; loadPlanDoc(lane.planId).then((v) => { if (!off) setLog(v.log || []); }).catch((e) => { if (!off) fail(t, e); }); return () => { off = true; }; }, [lane.planId, lane.rev]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const w = el.offsetWidth || 520;
    setPos({ left: Math.max(8, Math.min(window.innerWidth - w - 8, p.x)), top: Math.max(8, Math.min(p.y, window.innerHeight - 160)) });
  }, [p.x, p.y]);
  useEffect(() => {
    const down = (e) => { if (box.current && !box.current.contains(e.target) && !(e.target.closest && e.target.closest('[data-plan-anchor], .mt-plan-menu, .mt-dc-list, .mt-toasts, .mt-toast'))) closePlanPanel(); };
    const key = (e) => { if (e.key === 'Escape' && !(e.target && e.target.closest && e.target.closest('.mt-plan-panel input'))) closePlanPanel(); };
    window.addEventListener('mousedown', down, true); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', down, true); window.removeEventListener('keydown', key); };
  }, []);
  const doc = lane.doc;
  const ms = openMs(doc, picked);
  const op = (ops, okText) => planOp(lane.planId, ops).then((r) => { if (okText) toast(okText); return r; }).catch((e) => { fail(t, e); return null; });
  const by = !lane.updatedBy ? '' : lane.updatedBy === 'user' ? t('plan.who.user') : '@' + lane.updatedBy; // 사람이 바꿨으면 "사용자"
  return createPortal(
    <div ref={box} className="mt-plan-panel" data-role="plan-panel" data-plan={lane.planId} data-ws={lane.wsKey} data-rev={lane.rev} style={{ left: pos.left, top: pos.top, maxHeight: `min(78vh, ${Math.max(240, window.innerHeight - pos.top - 12)}px)` }} onMouseDown={stop} onWheel={stop}>
      <div className="mt-plan-head">
        <b className="mt-plan-ws">{lane.workspace || wsName(lane.wsKey)}</b><span className="mt-plan-hsub">· {t('plan.head')}</span>
        <span className="mt-plan-rev mono" data-role="plan-rev">{t('plan.rev', { rev: lane.rev, ago: lane.updatedAt ? agoText(lane.updatedAt, now) : '-', by })}</span>
        <button type="button" className="mt-dc-x" data-action="plan-close" aria-label={t('common.close')} onClick={closePlanPanel}>×</button>
      </div>
      {tabs.length > 1 && (
        <div className="mt-plan-tabs" role="tablist" data-role="plan-tabs">
          {tabs.map((l) => { const f = l.summary && l.summary.focus; return (
            <button key={l.planId} type="button" role="tab" aria-selected={l.planId === lane.planId} className={`mt-plan-tab${l.planId === lane.planId ? ' on' : ''}${l.status !== 'active' ? ' dim' : ''}`} data-action="plan-tab" data-plan={l.planId} title={t(`plan.status.${l.status}`)} onClick={() => pickPlanTab(l.planId)}>
              {l.name}{f ? <span className="mono">{f.code} {f.done}/{f.total}</span> : null}{l.status !== 'active' ? <span className="mt-plan-tab-st">{t(`plan.status.${l.status}`)}</span> : null}
            </button>
          ); })}
        </div>
      )}
      <LaneBar lane={lane} t={t} />
      {!doc ? <div className="mt-dropdown-empty">{t('plan.loading')}</div> : <>
        <div className={`mt-plan-goal${doc.goal ? '' : ' none'}`} data-role="plan-goal">{doc.goal || t('plan.noGoal')}</div>
        {doc.metrics.length > 0 && <div className="mt-plan-metrics" data-role="plan-metrics">{doc.metrics.map((m) => <Metric key={m.id} m={m} t={t} onSave={(v) => op({ op: 'metricNow', metric: m.id, now: v }, t('plan.metricSaved', { name: m.name }))} />)}</div>}
        {doc.milestones.length ? <>
          <div className="mt-plan-steps" data-role="plan-steps">
            {doc.milestones.map((m, i) => { const done = m.items.filter((x) => x.done).length; return (
              <span key={m.code} className="mt-plan-stepw">{i > 0 ? <i className="mt-plan-step-line" aria-hidden="true" /> : null}
                <button type="button" className={`mt-plan-step${m.code === doc.focus ? ' focus' : ''}${m.state === 'done' ? ' done' : ''}${ms && m.code === ms.code ? ' open' : ''}`} data-action="plan-step" data-ms={m.code} title={m.title} onClick={() => setPicked(m.code)}>
                  {m.code === doc.focus && m.state !== 'done' ? <i className="mt-plan-sdot" aria-hidden="true" /> : null}{m.code}{m.state === 'done' ? ' ✓' : <span className="mono"> {done}/{m.items.length}</span>}
                </button>
              </span>
            ); })}
          </div>
          {ms && <Milestone key={ms.code} m={ms} doc={doc} t={t} op={op} now={now} />}
        </> : <div className="mt-plan-none" data-role="plan-no-ms">{t('plan.noMs')}</div>}
        <div className="mt-plan-foot">
          {ms ? <AddItem ms={ms} t={t} op={op} /> : <span />}
          <button type="button" className="mt-plan-log-btn" data-action="plan-log" aria-expanded={logOpen} onClick={() => setLogOpen((v) => !v)}>{t('plan.changes', { n: log ? log.length : '…' })} {logOpen ? '▴' : '▾'}</button>
        </div>
        {logOpen && log && <div className="mt-plan-log" data-role="plan-log">{log.length ? log.map((r) => <div key={r.id} className="mt-plan-log-row"><span className="mono dim">{ago(r.at, now)}</span><span>{r.summary}</span><span className="dim">{r.via === 'agent' ? '@' + r.by : t('plan.byUser', { via: r.via })}{r.manager === 0 || r.manager === false ? ' · ' + t('plan.notManager') : ''}</span></div>) : <div className="dim">{t('plan.noChanges')}</div>}</div>}
      </>}
    </div>,
    document.body,
  );
}
// 관리자 표시와 넘기기, 상태
function LaneBar({ lane, t }) {
  const sessions = useStore((st) => st.sessions);
  const cands = useMemo(() => [...sessions.values()].filter((s) => s.workspaceKey === lane.wsKey && (s.kind || 'claude') !== 'shell'), [sessions, lane.wsKey]);
  const o = lane.owner;
  const open = o && sessions.has(o.sessionId);
  const go = () => { if (o && open) { closePlanPanel(); const nav = getState().navigateTo; if (nav) nav(o.sessionId); } };
  return (
    <div className="mt-plan-bar" data-role="plan-bar">
      <span className="dim">{t('plan.manager')}</span>
      {o ? <button type="button" className={`mt-plan-owner${open ? '' : ' closed'}`} data-role="plan-owner" data-session={o.sessionId} disabled={!open} onClick={go}>@{o.name || '?'}{open ? '' : ' ' + t('plan.managerClosed')}</button> : <span className="mt-plan-owner none" data-role="plan-owner">{t('plan.noManager')}</span>}
      <select className="mt-plan-sel" data-field="plan-owner" value="" title={t('plan.handOverTitle')} onChange={(e) => { const v = e.target.value; if (!v) return; planOwner(lane.planId, v === '-' ? null : v).then(() => toast(t('plan.handedOver', { name: lane.name }))).catch((er) => fail(t, er)); }}>
        <option value="">{t('plan.handOver')}</option>
        {cands.filter((s) => !o || s.sessionId !== o.sessionId).map((s) => <option key={s.sessionId} value={s.name}>@{s.name}</option>)}
        {o ? <option value="-">{t('plan.noManager')}</option> : null}
      </select>
      <span className="mt-node-sp" />
      <select className={`mt-plan-sel st-${lane.status}`} data-field="plan-status" value={lane.status} title={t('plan.statusTitle')} onChange={(e) => planStatus(lane.planId, e.target.value).then(() => toast(t('plan.statusSet', { name: lane.name, status: t(`plan.status.${e.target.value}`) }))).catch((er) => fail(t, er))}>
        {LANE_STATUSES.map((s) => <option key={s} value={s}>{t(`plan.status.${s}`)}</option>)}
      </select>
    </div>
  );
}
function Metric({ m, t, onSave }) {
  const [edit, setEdit] = useState(null);
  const pct = metricPct(m);
  const save = () => { const v = edit; setEdit(null); if (v != null && v.trim() !== String(m.now ?? '')) onSave(v.trim()); };
  return (
    <div className="mt-plan-metric" data-role="plan-metric" data-metric={m.id}>
      <span className="mt-plan-mname">{m.name}</span>
      <span className="mt-plan-mval">
        {edit == null
          ? <button type="button" className="mt-plan-mnow" data-action="metric-now" title={t('plan.metricNowTitle')} onClick={() => setEdit(String(m.now ?? ''))}>{m.now ?? '-'}</button>
          : <input autoFocus className="mt-plan-input small" data-field="metric-now" value={edit} maxLength={40} onChange={(e) => setEdit(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') setEdit(null); }} onBlur={save} />}
        <span className="dim"> → {m.target ?? '-'}{m.unit ? m.unit : ''}</span>
      </span>
      {pct != null ? <span className="mt-plan-mbar"><i style={{ width: `${Math.round(pct * 100)}%` }} /></span> : null}
    </div>
  );
}
function Milestone({ m, doc, t, op, now }) {
  const [more, setMore] = useState(false);
  const done = m.items.filter((x) => x.done).length;
  const user = m.items.filter((x) => x.who === 'user');
  const uDone = user.filter((x) => x.done).length;
  const hDone = done - uDone;
  const total = m.items.length || 1;
  const focus = m.code === doc.focus;
  return (
    <div className={`mt-plan-ms${focus ? ' focus' : ''}${m.state === 'done' ? ' done' : ''}`} data-role="plan-ms" data-ms={m.code}>
      <div className="mt-plan-ms-head">
        <b className="mono">{m.code}</b><b>{m.title}</b>
        {focus ? <span className="mt-plan-now" data-role="plan-focus-tag">{t('plan.now')}</span> : <button type="button" className="mt-btn small ghost" data-action="plan-focus" onClick={() => op({ op: 'focus', code: m.code }, t('plan.focusSet', { code: m.code }))}>{t('plan.makeFocus')}</button>}
        <span className="mt-node-sp" />
        <span className="mono dim" data-role="plan-ms-count">{t('plan.progress', { done, total: m.items.length, n: user.length - uDone })}</span>
        <button type="button" className="mt-btn small ghost" data-action={m.state === 'done' ? 'plan-ms-reopen' : 'plan-ms-done'} title={m.state === 'done' ? '' : t('plan.msDoneTitle')} onClick={() => op({ op: m.state === 'done' ? 'msReopen' : 'msDone', code: m.code })}>{m.state === 'done' ? t('plan.msReopen') : t('plan.msDone')}</button>
      </div>
      <div className="mt-plan-bar2" aria-hidden="true"><i className="h" style={{ width: `${(hDone / total) * 100}%` }} /><i className="u" style={{ width: `${(uDone / total) * 100}%` }} /></div>
      {(m.purpose || m.doneWhen) && (
        <div className={`mt-plan-why${more ? ' open' : ''}`} data-role="plan-why" onClick={() => setMore((v) => !v)} title={t('plan.whyTitle')}>
          {m.purpose ? <div><span className="dim">{t('plan.purpose')}</span><span>{m.purpose}</span></div> : null}
          {m.doneWhen ? <div><span className="dim">{t('plan.doneWhen')}</span><span>{m.doneWhen}</span></div> : null}
        </div>
      )}
      <div className="mt-plan-items" data-role="plan-items">
        {m.items.map((x) => <Item key={x.id} x={x} t={t} op={op} now={now} />)}
        {!m.items.length && <div className="dim mt-plan-none">{t('plan.noItems')}</div>}
      </div>
    </div>
  );
}
function Item({ x, t, op, now }) {
  const [edit, setEdit] = useState(null);
  const save = () => { const e = edit; setEdit(null); const o = { op: 'itemEdit', id: x.id }; if (e.text.trim() !== x.text) o.text = e.text.trim(); if ((e.note || '').trim() !== (x.note || '')) o.note = e.note.trim(); if (o.text != null || o.note != null) op(o); };
  const done = !!x.done;
  if (edit) return (
    <div className="mt-plan-item editing" data-role="plan-item" data-item={x.id}>
      <span className="mono dim mt-plan-iid">{x.id}</span>
      <div className="mt-plan-iedit">
        <input autoFocus className="mt-plan-input" data-field="item-text" value={edit.text} maxLength={300} onChange={(e) => setEdit({ ...edit, text: e.target.value })} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') setEdit(null); }} />
        <input className="mt-plan-input small" data-field="item-note" value={edit.note} maxLength={600} placeholder={t('plan.notePh')} onChange={(e) => setEdit({ ...edit, note: e.target.value })} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') setEdit(null); }} />
      </div>
      <button type="button" className="mt-btn small primary" data-action="item-save" disabled={!edit.text.trim()} onClick={save}>{t('plan.save')}</button>
    </div>
  );
  return (
    <div className={`mt-plan-item${done ? ' done' : ''}`} data-role="plan-item" data-item={x.id} data-who={x.who} data-done={done ? '1' : undefined}>
      <input type="checkbox" className="mt-plan-check" data-action="plan-check" checked={done} title={done ? t('plan.uncheckTitle') : t('plan.checkTitle')} onChange={() => op(checkOp(x.id, !done), done ? t('plan.unchecked', { id: x.id }) : t('plan.checked', { id: x.id }))} />
      <span className="mono dim mt-plan-iid">{x.id}</span>
      <span className="mt-plan-itext">
        <span className="mt-plan-it">{x.text}</span>
        {x.note ? <span className="mt-plan-inote">{x.note}</span> : null}
        {done ? <span className="mt-plan-inote" data-role="plan-item-done">{t('plan.checkedBy', { by: x.done.by === 'user' ? t('plan.who.user') : '@' + x.done.by, ago: agoText(x.done.at, now) })}</span> : x.snoozeUntil && x.snoozeUntil > now ? <span className="mt-plan-inote">{t('plan.snoozedUntil', { when: whenText(x.snoozeUntil, now) })}</span> : null}
      </span>
      <span className="mt-plan-iacts">
        <button type="button" className="mt-plan-ib" data-action="item-edit" title={t('plan.edit')} onClick={() => setEdit({ text: x.text, note: x.note || '' })}>✎</button>
        <button type="button" className="mt-plan-ib" data-action="item-rm" title={t('plan.remove')} onClick={() => op({ op: 'itemRm', id: x.id }, t('plan.removed', { id: x.id }))}>×</button>
      </span>
      <span className={`mt-plan-who ${x.who}`} data-role="plan-who">{t(`plan.who.${x.who}`)}</span>
    </div>
  );
}
function AddItem({ ms, t, op }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [who, setWho] = useState('user');
  const add = async () => { if (!text.trim()) return; const r = await op({ op: 'itemAdd', ms: ms.code, text: text.trim(), who }); if (r) { setText(''); setOpen(false); toast(t('plan.added', { id: (r.changed && r.changed[0] && r.changed[0].id) || ms.code })); } };
  if (!open) return <button type="button" className="mt-btn small" data-action="plan-add-open" onClick={() => setOpen(true)}>{t('plan.addItem')}</button>;
  return (
    <span className="mt-plan-add" data-role="plan-add">
      <input autoFocus className="mt-plan-input" data-field="plan-add-text" value={text} maxLength={300} placeholder={t('plan.addPh', { code: ms.code })} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') add(); if (e.key === 'Escape') setOpen(false); }} />
      <select className="mt-plan-sel" data-field="plan-add-who" value={who} onChange={(e) => setWho(e.target.value)}><option value="user">{t('plan.who.user')}</option><option value="head">{t('plan.who.head')}</option></select>
      <button type="button" className="mt-btn small primary" data-action="plan-add" disabled={!text.trim()} onClick={add}>{t('plan.add')}</button>
      <button type="button" className="mt-btn small ghost" data-action="plan-add-cancel" onClick={() => setOpen(false)}>×</button>
    </span>
  );
}

// ---------- 할 일 목록의 가상 "실행" 카드 ----------
export function usePlanCards(now) {
  const lanes = useLanes();
  return useMemo(() => planCards(lanes, now), [lanes, now]);
}
export function PlanCardRow({ c, onGo, t, say = null }) {
  const [busy, setBusy] = useState(false);
  const [snz, setSnz] = useState(false);
  const tell = (long, short, level) => (say ? say(long, short, level) : toast(long, level));
  const did = async (e) => {
    setBusy(true);
    try { await planOp(c.planId, checkOp(c.itemId, true), 'foryou'); tell(t('plan.card.didToast', { lane: c.lane, id: c.itemId }), t('plan.card.didShort')); }
    catch (er) { tell(t('plan.fail', { error: errText(er) }), t('plan.fail', { error: errText(er) }), 'error'); setBusy(false); }
  };
  const snooze = async (until) => {
    setBusy(true);
    try { await planOp(c.planId, snoozeOp(c.itemId, until), 'foryou'); tell(t('plan.card.snoozed', { id: c.itemId, when: whenText(until) }), t('userTasks.s.snoozed', { when: whenText(until) })); }
    catch (er) { tell(t('plan.fail', { error: errText(er) }), t('plan.fail', { error: errText(er) }), 'error'); setBusy(false); }
  };
  const tm = snoozeTimes();
  return (
    <div className="mt-dc-row k-plan" data-role="plan-card" data-plan={c.planId} data-item={c.itemId} data-session={c.ownerId || undefined}>
      <div className="mt-dc-line">
        {c.ownerId ? <button type="button" className="mt-dc-name" data-action="decision-go" onClick={() => onGo(c.ownerId)}>@{c.ownerName || '?'}</button> : <span className="mt-dc-name dim">{t('plan.noManager')}</span>}
        {c.wsKey ? <span className="mt-chip-ws">{c.workspace || wsName(c.wsKey)}</span> : null}
        <span className="mt-ut-kind k-plan" data-role="decision-kind" data-kind="plan">{t('plan.card.kind')}</span>
        <span className="mt-plan-mstag" data-role="plan-card-ms">{c.lane} · {c.ms}</span>
      </div>
      <div className="mt-dc-q" data-role="decision-question"><span className="mono dim">{c.itemId}</span> {c.text}</div>
      <div className="mt-dc-why">{c.ms}{c.msTitle ? ' · ' + c.msTitle : ''}{c.note ? ' · ' + c.note : ''}</div>
      <div className="mt-ut-acts">
        <button type="button" className="mt-btn small primary" data-action="plan-card-done" disabled={busy} title={t('plan.card.didTitle')} onClick={did}>{t('plan.card.did')}</button>
        <button type="button" className="mt-btn small" data-action="plan-card-board" data-plan-anchor="1" onClick={(e) => openPlanPanel(c.planId, e.currentTarget)}>{t('plan.card.board')}</button>
        {snz ? <span className="mt-ut-snooze" data-role="snooze-menu">
          <button type="button" className="mt-btn small" data-action="snooze-hour" disabled={busy} onClick={() => snooze(tm.hour)}>{t('userTasks.snoozeHour')}</button>
          <button type="button" className="mt-btn small" data-action="snooze-morning" disabled={busy} onClick={() => snooze(tm.morning)}>{t('userTasks.snoozeMorning')}</button>
          <button type="button" className="mt-btn small ghost" data-action="snooze-cancel" onClick={() => setSnz(false)}>×</button>
        </span> : <button type="button" className="mt-btn small ghost" data-action="plan-card-snooze" disabled={busy} onClick={() => setSnz(true)}>{t('userTasks.snooze')}</button>}
      </div>
    </div>
  );
}
export function PlanMoreLine({ m, t }) {
  return (
    <div className="mt-plan-more" data-role="plan-card-more" data-plan={m.planId} data-count={m.n}>
      <span><b>{m.workspace} {m.lane} {m.ms}</b> {t('plan.card.more', { n: m.n })}</span>
      <button type="button" className="mt-btn small" data-action="plan-card-board" data-plan-anchor="1" onClick={(e) => openPlanPanel(m.planId, e.currentTarget)}>{t('plan.card.board')}</button>
    </div>
  );
}
