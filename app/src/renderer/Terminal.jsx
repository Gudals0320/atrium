// P117: 설정 › 터미널 탭. 판의 터미널 백엔드(herdr | herdr-core)를 보이고, 옛 판을 herdr-core로 옮기거나 되돌린다(backend terminal-move.mjs).
// 사람이 누를 때만 옮긴다. 누르면 먼저 세션마다 무엇을 할지(계획)를 보이고, 한 번 더 눌러야 시작한다. 옮기는 동안 세션마다 결과가 이 탭에 쌓인다.
// 자리를 트레이가 아니라 설정 탭에 둔 까닭: 옮기기 전에 세션 목록과 계획을 보여야 하고, 일하는 세션을 기다리는 동안과 끝난 뒤의 결과(옮김·건너뜀·실패)를
// 한곳에서 다시 볼 수 있어야 한다. 트레이 메뉴는 한 줄 단추라 이것을 보이지 못한다
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useStore, toast } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { SetRow, SetNote } from './Settings.jsx';

const NAME = { herdr: 'herdr', hc: 'herdr-core (hc)' };

function Rows({ rows }) {
  const t = useT();
  if (!rows || !rows.length) return null;
  return (
    <ul className="mt-tmove-list" data-role="terminal-move-rows">
      {rows.map((x) => (
        <li key={x.sessionId || x.name} data-name={x.name} data-result={x.result || x.plan || x.wait || x.skip}>
          <span className="mt-tmove-name">{x.name}</span>
          <span className="mt-tmove-kind">{x.kind}</span>
          <span className={`mt-tmove-result ${x.result || ''}`}>{x.result ? t(`terminalMove.result.${x.result}`) : t(`terminalMove.plan.${x.plan || (x.wait ? 'wait' : 'skip')}`)}</span>
          <span className="mt-tmove-why">{x.reason || x.wait || x.skip ? t('terminalMove.why', { why: x.reason || x.wait || x.skip }) : ''}</span>
        </li>
      ))}
    </ul>
  );
}

export function TerminalTab() {
  const t = useT();
  const herdr = useStore((st) => st.herdr);
  const [st, setSt] = useState(null);
  const [plan, setPlan] = useState(null); // { to, plan: [...] } 확인 전
  const [busy, setBusy] = useState(false);
  const load = () => api.call('terminal.status').then(setSt).catch((e) => toast(errText(e), 'error'));
  useEffect(() => {
    load();
    const off1 = api.on('terminal.move', (v) => { setSt((s) => (s ? { ...s, job: v } : s)); if (v && v.endedAt) load(); });
    const off2 = api.on('$open', load);
    return () => { off1(); off2(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!st) return <div className="dim">{t('settings.loading')}</div>;
  const job = st.job && !st.job.endedAt ? st.job : null;
  const last = st.job && st.job.endedAt ? st.job : st.last;
  const c = st.sessions || {};
  const version = st.backend === 'hc' ? herdr && herdr.hcVersion : herdr && herdr.version;
  const movedFromHerdr = !!(st.decided && st.decided.from === 'herdr');
  const canMoveHc = !job && !st.forced && (st.backend === 'herdr' || c.herdr > 0);
  const canMoveBack = !job && !st.forced && st.backend === 'hc' && (movedFromHerdr || c.herdr > 0);
  const ask = async (to) => {
    setBusy(true);
    try { const r = await api.call('terminal.move', { to }); setPlan({ to, plan: r.plan || [] }); } catch (e) { toast(errText(e), 'error'); }
    setBusy(false);
  };
  const go = async () => {
    const to = plan.to;
    setBusy(true);
    try { const r = await api.call('terminal.move', { to, confirm: true }); setPlan(null); setSt((s) => ({ ...s, job: r.job })); } catch (e) { toast(errText(e), 'error'); }
    setBusy(false);
  };
  return (
    <div className="mt-set-grid" data-role="terminal-settings" data-backend={st.backend}>
      <SetNote>{t('terminalMove.note')}</SetNote>
      <SetRow name={t('terminalMove.now')} hint={t('terminalMove.nowHint')} role="terminal-now">
        <span data-field="terminal-backend" data-value={st.backend}>{NAME[st.backend] || st.backend}{version ? ` ${version}` : ''}</span>
      </SetRow>
      <SetRow name={t('terminalMove.sessions')} hint={t('terminalMove.sessionsHint')} role="terminal-counts">
        <span data-field="terminal-counts">{t('terminalMove.counts', { hc: c.hc || 0, herdr: c.herdr || 0, asleep: c.asleep || 0 })}</span>
      </SetRow>
      {st.forced && <SetNote>{t('terminalMove.forced')}</SetNote>}
      {!plan && (canMoveHc || canMoveBack) && (
        <div className="mt-tmove-actions">
          {canMoveHc && <button type="button" className="mt-btn primary" data-action="terminal-move-hc" disabled={busy} onClick={() => ask('hc')}>{c.herdr > 0 && st.backend === 'hc' ? t('terminalMove.moveRest', { n: c.herdr }) : t('terminalMove.moveHc')}</button>}
          {canMoveBack && <button type="button" className="mt-btn ghost" data-action="terminal-move-herdr" disabled={busy} onClick={() => ask('herdr')}>{t('terminalMove.moveBack')}</button>}
        </div>
      )}
      {plan && (
        <div className="mt-tmove-confirm" data-role="terminal-move-plan" data-to={plan.to}>
          <SetNote>{t(plan.to === 'hc' ? 'terminalMove.confirmHc' : 'terminalMove.confirmBack', { n: plan.plan.length })}</SetNote>
          <Rows rows={plan.plan} />
          <div className="mt-tmove-actions">
            <button type="button" className="mt-btn primary" data-action="terminal-move-go" disabled={busy} onClick={go}>{t('terminalMove.go')}</button>
            <button type="button" className="mt-btn ghost" data-action="terminal-move-cancel" disabled={busy} onClick={() => setPlan(null)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
      {job && (
        <div data-role="terminal-move-job" data-state={job.state}>
          <SetNote>{t(`terminalMove.state.${job.state}`, { to: NAME[job.to] })}</SetNote>
          <Rows rows={job.rows} />
        </div>
      )}
      {!job && last && (
        <div data-role="terminal-move-last" data-state={last.state}>
          <SetNote>{last.error ? t('terminalMove.lastFailed', { error: errText(last.error) }) : t('terminalMove.lastDone', { to: NAME[last.to] || last.to, moved: last.moved, asleep: last.asleep, skipped: last.skipped, failed: last.failed })}{last.remaining ? ` ${t('terminalMove.remaining', { n: last.remaining })}` : ''}</SetNote>
          <Rows rows={last.rows} />
        </div>
      )}
    </div>
  );
}
