// P241: rig 3(역할 조직) 판. 읽기만 하는 구조 보기(역할, 쥔 섹터, 세션 상태, 길)와 켜기·끄기만 보인다.
// 켜기는 확인 한 번("역할 n개가 무인으로 돌고, 각자 쥔 섹터에만 쓰며, 도구는 판이 돌린다"). 권한 질문·승인 카드·설정 질문은 없다.
// 판 API rig.get(rig3), rig.enable(confirm), rig.disable. 판 이벤트 rig.roles(역할 세션이 뜨거나 잠듦)·rig.events 때 다시 읽는다.
import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { toast, useStore } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { useDialog } from './dialog.js';
import { remoteView } from './RigSeat.jsx';
import { roleRows, flowRows, roleCount, canEnable3, intakeRows, stalledRows, returnedIntake, cycleInfo, tuneBadge, tuneLogRows } from './lib/rig3.js';

export function Rig3Panel({ ws, onClose, first = null }) {
  const t = useT();
  const remote = remoteView();
  const box = useDialog(onClose);
  const [st, setSt] = useState(first);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState(null);
  const [openRole, setOpenRole] = useState(null); // P245: 조정 기록을 펼친 역할
  const sessions = useStore((s) => s.sessions); // 역할 세션의 지금 상태(판 이벤트를 기다리지 않는다)
  const load = useCallback(() => api.call('rig.get', { workspace: ws.key }).then(setSt, (e) => setSt({ status: 'error', error: errText(e) })), [ws.key]);
  useEffect(() => {
    if (!first) load();
    const mine = (ev) => !ev || !ev.workspace || ev.workspace === ws.key || ev.ws === ws.key;
    const offs = ['rig.roles', 'rig.events'].map((n) => api.on(n, (ev) => { if (mine(ev)) load(); }));
    return () => offs.forEach((f) => f());
  }, [ws.key, load]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); } };
  const enable = () => act(async () => { await api.call('rig.enable', { workspace: ws.key, confirm: true }); toast(t('rig.turnedOn', { name: ws.label || ws.name })); setConfirm(false); await load(); });
  const disable = () => act(async () => { await api.call('rig.disable', { workspace: ws.key }); toast(t('rig.turnedOff', { name: ws.label || ws.name })); await load(); });
  const status = st ? st.status : 'loading';
  const r3 = st && st.rig3;
  const roles = roleRows(r3, sessions);
  const flows = flowRows(r3);
  return (
    <div className="mt-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={box} className="mt-modal mt-rigpanel mt-rig3" data-role="rig3-panel" data-ws={ws.key} data-status={status}>
        <h3>{t('rigPanel.title', { name: ws.label || ws.name })}</h3>
        {!st ? <div>{t('rig.loading')}</div> : st.status === 'error' ? <div className="mt-rigon-warn">{st.error}</div> : (
          <>
            <div className="mt-rigpanel-status" data-role="rig3-status">
              <span className={`mt-rigpanel-dot ${status}`} />
              <b>{t(`rigPanel.st.${status}`)}</b>
              <span className="dim">{t('rig3.kind', { n: roles.length })}</span>
              {st.versionN != null && <span className="dim">{t('rigPanel.version', { n: st.versionN })}</span>}
              {st.why && <span className="mt-rigon-warn">{st.why}</span>}
              {!remote && status === 'on' && <button className="mt-btn small ghost" data-action="rig3-off" disabled={busy} onClick={disable}>{t('rig.menuOff')}</button>}
              {canEnable3(st, { remote }) && !confirm && <button className="mt-btn small primary" data-action="rig3-enable" disabled={busy} onClick={() => setConfirm(true)}>{t('rig3.enable')}</button>}
            </div>
            {confirm && (
              <div className="mt-rig3-confirm" data-role="rig3-confirm">
                <div className="mt-rig3-confirm-line" data-role="rig3-confirm-line">{t('rig3.confirmLine', { n: roleCount(st) })}</div>
                <div className="mt-rigon-warn">{t('rig3.confirmWarn')}</div>
                <div className="mt-card-actions">
                  <button className="mt-btn primary" data-action="rig3-confirm-on" disabled={busy} onClick={enable}>{t('rig.confirmOn')}</button>
                  <button className="mt-btn ghost" data-action="rig3-confirm-cancel" disabled={busy} onClick={() => setConfirm(false)}>{t('common.cancel')}</button>
                </div>
              </div>
            )}
            {r3 && <div className="mt-rig3-purpose dim" data-role="rig3-purpose">{t('rig3.purpose', { path: r3.purpose })}</div>}
            {roles.length > 0 && (
              <>
                <div className="mt-rigon-h">{t('rig3.roles')}</div>
                <table className="mt-rig3-table" data-role="rig3-roles">
                  <thead><tr><th>{t('rig3.colRole')}</th><th>{t('rig3.colOwns')}</th><th>{t('rig3.colSession')}</th><th>{t('rig3.colTools')}</th><th>{t('rig3Tune.col')}</th></tr></thead>
                  <tbody>
                    {roles.map((r) => { const tb = tuneBadge(r.tune); return [
                      <tr key={r.name} data-role-name={r.name} data-state={r.stateKey}>
                        <td><b>{r.name}</b><span className="mt-rig3-sub dim">{r.launcher}{r.model ? ` · ${r.model}` : ''}</span>{r.docMissing.length > 0 && <span className="mt-rigon-warn mt-rig3-sub">{t('rig3.docMissing', { list: r.docMissing.join(', ') })}</span>}</td>
                        <td><code>{r.owns.join(' ')}</code></td>
                        <td data-role="rig3-session">{r.session ? <><span className={`mt-rig3-st ${r.stateKey}`} />@{r.session.name} <span className="dim">{t(`state.${r.stateKey}`)}</span></> : <span className="dim">{t(r.gaveUp ? 'rig3.gaveUp' : 'rig3.noSession')}</span>}</td>
                        <td>{r.tools.length ? r.tools.join(', ') : <span className="dim">-</span>}</td>
                        <td data-role="rig3-tune-cell">{tb ? <button className={`mt-rig3-tune-badge${tb.open ? ' open' : ''}`} data-action="rig3-tune-toggle" data-tune-n={tb.n ?? ''} data-tunes={tb.tunes} onClick={() => setOpenRole(openRole === r.name ? null : r.name)}>{t('rig3Tune.badge', { n: tb.n ?? '-', k: tb.tunes })}{tb.material ? t('rig3Tune.material', { n: tb.material }) : ''}{tb.open ? t('rig3Tune.turnOpen') : ''}</button> : <span className="dim">-</span>}</td>
                      </tr>,
                      openRole === r.name && <tr key={r.name + '-tune'} className="mt-rig3-tune-row"><td colSpan={5}><Rig3RoleTune ws={ws} role={r.name} remote={remote} t={t} stamp={tb ? `${tb.n}|${tb.tunes}|${tb.rollbacks}|${tb.material}` : ''} onDone={load} /></td></tr>,
                    ]; })}
                  </tbody>
                </table>
              </>
            )}
            {flows.length > 0 && (
              <>
                <div className="mt-rigon-h">{t('rig3.flows')}</div>
                <ul className="mt-rigon-list mt-rig3-flows" data-role="rig3-flows">
                  {flows.map((f) => (
                    <li key={f.key} data-item={f.item}>
                      <span className="mt-rigon-at">{f.item}</span>
                      <span>{f.from.map((x) => (x === 'human' ? t('rig3.human') : x)).join(', ')} → {f.to.join(', ')}</span>
                      {f.for && <span className="dim">{t('rig3.for', { item: f.for })}</span>}
                      {f.counts && <span className="mt-rig3-counts dim" data-role="rig3-flow-counts">{t('rig3Items.counts', f.counts)}{f.counts.passed ? t('rig3Items.passed', { n: f.counts.passed }) : ''}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <Rig3Cycle ws={ws} r3={r3} on={status === 'on'} remote={remote} t={t} onBeat={load} />
            <Rig3Stalled r3={r3} t={t} />
            {!remote && <Rig3Intake ws={ws} r3={r3} on={status === 'on'} t={t} onSent={load} />}
            <div className="mt-card-sub dim" data-role="rig3-readonly">{t('rig3.readOnly')}</div>
            {err && <div className="mt-rigon-warn" data-role="rig3-error">{err}</div>}
          </>
        )}
        <div className="mt-card-actions">
          <button className="mt-btn ghost" data-action="rig-panel-close" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}

// P245: 역할 하나의 요령 칸과 조정 기록, 사람의 [되돌리기](판 API rig3.role, rig3.rollback). 작게
function Rig3RoleTune({ ws, role, remote, t, stamp, onDone }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { api.call('rig3.role', { workspace: ws.key, role }).then(setInfo, (e) => setErr(errText(e))); }, [ws.key, role, stamp]);
  if (err && !info) return <div className="mt-rigon-warn">{err}</div>;
  if (!info) return <div className="dim">{t('rig.loading')}</div>;
  const rows = tuneLogRows(info);
  const undo = async (n) => {
    setBusy(true); setErr(null);
    try { const r = await api.call('rig3.rollback', { workspace: ws.key, role, n }); toast(r.unchanged ? t('rig3Tune.same', { n }) : t('rig3Tune.undone', { role, from: n, n: r.n })); setInfo(await api.call('rig3.role', { workspace: ws.key, role })); onDone && onDone(); }
    catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="mt-rig3-tune" data-role="rig3-tune" data-tune-role={role}>
      <div className="mt-rig3-sub dim">{t('rig3Tune.head', { doc: info.doc, n: info.n ?? '-', lines: info.lines ?? '-', budget: info.budget })}</div>
      <pre className="mt-rig3-tune-text" data-role="rig3-tune-text">{(info.tune || '').trim() || t('rig3Tune.empty')}</pre>
      {!rows.length ? <div className="dim">{t('rig3Tune.noLog')}</div> : (
        <ul className="mt-rigon-list mt-rig3-tune-log" data-role="rig3-tune-log">
          {rows.map((x) => (
            <li key={x.id} data-tune-kind={x.key} data-tune-n={x.n ?? ''}>
              <span>{t('rig3Tune.k.' + x.key, { prev: x.prevN ?? '-', n: x.n ?? '-', from: x.fromN ?? '-', added: x.added, removed: x.removed, why: x.why, reason: x.reason })}</span>
              {x.evidence.length > 0 && x.key === 'tune' && <span className="dim">{t('rig3Tune.evidence', { list: x.evidence.join(' ') })}</span>}
              {!remote && x.undo != null && <button className="mt-btn small ghost" data-action="rig3-tune-undo" data-undo={x.undo} disabled={busy} onClick={() => undo(x.undo)}>{t('rig3Tune.undo', { n: x.undo })}</button>}
            </li>
          ))}
        </ul>
      )}
      {err && <div className="mt-rigon-warn" data-role="rig3-tune-error">{err}</div>}
    </div>
  );
}

// P244: 사이클(지금 번호, 다음 박자, 손 박자 단추)과 최근 변경 기록 꼭지. 생김새는 사용자와 아직 정하지 않아 작게 둔다
const hm = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-');
function Rig3Cycle({ ws, r3, on, remote, t, onBeat }) {
  const c = cycleInfo(r3);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (!c) return null;
  const beat = async () => {
    setBusy(true); setErr(null);
    try { const r = await api.call('rig3.beat', { workspace: ws.key }); toast(t('rig3Cycle.beatSent', { n: r.n })); onBeat && onBeat(); }
    catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="mt-rig3-cycle" data-role="rig3-cycle" data-cycle={c.n ?? ''}>
      <div className="mt-rigon-h">{t('rig3Cycle.h')}</div>
      <div className="mt-rig3-cycle-line">
        <b data-role="rig3-cycle-n">{c.n == null ? t('rig3Cycle.none') : t('rig3Cycle.now', { n: c.n })}</b>
        {c.openedAt && <span className="dim">{t('rig3Cycle.opened', { time: hm(c.openedAt) })}</span>}
        <span className="dim" data-role="rig3-next-beat">{c.beat ? t('rig3Cycle.next', { time: hm(c.nextAt), every: c.beat.every }) + (c.beat.at ? t('rig3Cycle.at', { at: c.beat.at }) : '') + (c.beat.role ? t('rig3Cycle.wakes', { role: c.beat.role }) : '') + ')' : t('rig3Cycle.noBeat')}</span>
        {!remote && on && <button className="mt-btn small ghost" data-action="rig3-beat" disabled={busy} onClick={beat}>{t('rig3Cycle.beatNow')}</button>}
      </div>
      {c.tools.length > 0 && <div className="mt-rig3-cycle-tools dim" data-role="rig3-clock-tools">{c.tools.map((x) => (x.running ? t('rig3Cycle.toolRunning', { name: x.name }) : t('rig3Cycle.tool', { name: x.name, every: x.every, time: hm(x.nextAt) }))).join(' · ')}</div>}
      {c.writing.length > 0 && <div className="dim" data-role="rig3-writing">{t('rig3Cycle.writing', { list: c.writing.join(', ') })}</div>}
      <div className="mt-rig3-entries" data-role="rig3-entries">
        {!c.entries.length ? <div className="dim">{t('rig3Cycle.noEntries')}</div> : c.entries.map((e, i) => (
          <details key={e.n} className="mt-rig3-entry" data-entry={e.n} data-by={e.by} open={i === 0}>
            <summary><span>{e.title}</span><span className={`mt-rig3-entry-by ${e.by}`}>{t(e.by === 'ai' ? 'rig3Cycle.byAi' : 'rig3Cycle.byNumbers')}</span></summary>
            <pre className="mt-rig3-entry-body">{e.body}</pre>
          </details>
        ))}
        {c.changelog && <div className="mt-rig3-sub dim">{t('rig3Cycle.file', { path: c.changelog })}</div>}
      </div>
      {err && <div className="mt-rigon-warn" data-role="rig3-beat-error">{err}</div>}
    </div>
  );
}

// P242: 받은 것에 답하지 않고 멈춘 역할(판이 한 번 일깨운 뒤에도 그대로)과 반려된 입력. 사람이 볼 곳의 한 줄(빌더는 5단계)
function Rig3Stalled({ r3, t }) {
  const rows = stalledRows(r3);
  const back = returnedIntake(r3);
  if (!rows.length && !back.length) return null;
  return (
    <div className="mt-rig3-alerts" data-role="rig3-stalled">
      {rows.map((r) => <div key={r.role} className="mt-rigon-warn" data-stalled-role={r.role}>{t('rig3Items.stalled', { role: r.role, items: r.items.join(', ') })}</div>)}
      {back.map((x) => <div key={x.id} className="mt-rigon-warn" data-returned-intake={x.id}>{t('rig3Items.returned', x)}</div>)}
    </div>
  );
}

// P242: 입력 창구(from이 human인 길). 글을 넣으면 판이 .atrium/intake/<종류>-<n>.md로 쓰고 항목으로 받는 역할에게 보낸다(판 API rig3.intake)
function Rig3Intake({ ws, r3, on, t, onSent }) {
  const rows = intakeRows(r3);
  const [item, setItem] = useState(rows[0] ? rows[0].item : '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (!rows.length) return null;
  const cur = rows.find((r) => r.item === item) || rows[0];
  const send = async () => {
    setBusy(true); setErr(null);
    try { const r = await api.call('rig3.intake', { workspace: ws.key, item: cur.item, text }); toast(t('rig3Items.intakeSent', { id: r.item.id, to: r.item.to.join(', ') })); setText(''); onSent && onSent(); }
    catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="mt-rig3-intake" data-role="rig3-intake">
      <div className="mt-rigon-h">{t('rig3Items.intake')}</div>
      {!on ? <div className="dim">{t('rig3Items.intakeOff')}</div> : (
        <>
          <div className="mt-rig3-intake-kinds">
            {rows.map((r) => (
              <button key={r.item} className={`mt-btn small ${r.item === cur.item ? 'primary' : 'ghost'}`} data-intake-item={r.item} disabled={busy} onClick={() => setItem(r.item)}>{t('rig3Items.intakeTo', { item: r.item, to: r.to.join(', ') })}</button>
            ))}
          </div>
          <textarea className="mt-rig3-intake-text" data-role="rig3-intake-text" rows={3} value={text} disabled={busy} placeholder={t('rig3Items.intakePlaceholder', { to: cur.to.join(', ') })} onChange={(e) => setText(e.target.value)} />
          <div className="mt-card-actions">
            <button className="mt-btn small primary" data-action="rig3-intake-send" disabled={busy || !text.trim()} onClick={send}>{t('rig3Items.intakeSend')}</button>
          </div>
          {err && <div className="mt-rigon-warn" data-role="rig3-intake-error">{err}</div>}
        </>
      )}
    </div>
  );
}
