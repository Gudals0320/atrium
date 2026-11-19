// P241: rig 3(역할 조직) 판. 읽기만 하는 구조 보기(역할, 쥔 섹터, 세션 상태, 길)와 켜기·끄기만 보인다.
// 켜기는 확인 한 번("역할 n개가 무인으로 돌고, 각자 쥔 섹터에만 쓰며, 도구는 판이 돌린다"). 권한 질문·승인 카드·설정 질문은 없다.
// 판 API rig.get(rig3), rig.enable(confirm), rig.disable. 판 이벤트 rig.roles(역할 세션이 뜨거나 잠듦)·rig.events 때 다시 읽는다.
import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { toast, useStore } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { useDialog } from './dialog.js';
import { remoteView } from './RigSeat.jsx';
import { roleRows, flowRows, roleCount, canEnable3, intakeRows, stalledRows, returnedIntake } from './lib/rig3.js';

export function Rig3Panel({ ws, onClose, first = null }) {
  const t = useT();
  const remote = remoteView();
  const box = useDialog(onClose);
  const [st, setSt] = useState(first);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState(null);
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
                  <thead><tr><th>{t('rig3.colRole')}</th><th>{t('rig3.colOwns')}</th><th>{t('rig3.colSession')}</th><th>{t('rig3.colTools')}</th></tr></thead>
                  <tbody>
                    {roles.map((r) => (
                      <tr key={r.name} data-role-name={r.name} data-state={r.stateKey}>
                        <td><b>{r.name}</b><span className="mt-rig3-sub dim">{r.launcher}{r.model ? ` · ${r.model}` : ''}</span>{r.docMissing.length > 0 && <span className="mt-rigon-warn mt-rig3-sub">{t('rig3.docMissing', { list: r.docMissing.join(', ') })}</span>}</td>
                        <td><code>{r.owns.join(' ')}</code></td>
                        <td data-role="rig3-session">{r.session ? <><span className={`mt-rig3-st ${r.stateKey}`} />@{r.session.name} <span className="dim">{t(`state.${r.stateKey}`)}</span></> : <span className="dim">{t(r.gaveUp ? 'rig3.gaveUp' : 'rig3.noSession')}</span>}</td>
                        <td>{r.tools.length ? r.tools.join(', ') : <span className="dim">-</span>}</td>
                      </tr>
                    ))}
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
