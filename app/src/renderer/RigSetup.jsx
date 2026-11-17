// P191: 하네스 7단계 창 — 판 안에서 rig 만들기(대화상자)와 보기·고치기(rig 판). docs research harness-arch.md 16절.
// 판 API(P190): rig.templates, rig.create, rig.describe, rig.get, rig.save, rig.spawnSeat, 이미 있는 rig.enable·rig.seat. 판 이벤트 rig.builder(제작 세션이 끝남)
// 단계·표 편집·잠금·저장 자료는 lib/rig-setup.js(단위 시험 test/p191-lib.test.mjs). 원격 기기(웹 화면)는 보기만.
import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from './api.js';
import { useStore, toast, getState, openDialog } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { useDialog } from './dialog.js';
import { remoteView } from './RigSeat.jsx';
import {
  launcherChoices, wizardInit, wizardPickTemplate, wizardPickDescribe, wizardSetLauncher, wizardBack, wizardCanNext, wizardRequest, wizardAfterRequest,
  wizardOnBuilder, wizardAfterEnable, wizardSetSeat, builderView, keepSeats, seatCandidates, seatActions, previewModel, arrowLabel, seatList,
  tableFromDef, tableEdit, tableAdd, tableRemove, rowLocked, partLocked, canRemove, tableToSave, tableDirty, canEdit,
} from './lib/rig-setup.js';

const argv = (run) => (Array.isArray(run) ? run.join(' ') : String(run || ''));
const launcherName = (choices, id) => { const l = choices.find((c) => c.id === id); return l ? l.name : id; };

// rig.get을 읽고, 판 이벤트(rig.builder·rig.cases·rig.alert) 때 다시 읽는다
function useRigGet(key) {
  const [st, setSt] = useState(null);
  const load = useCallback(() => api.call('rig.get', { workspace: key }).then((r) => { setSt(r); return r; }, (e) => { const r = { status: 'error', error: errText(e) }; setSt(r); return r; }), [key]);
  useEffect(() => {
    load();
    const mine = (ev) => !ev || !ev.workspace || ev.workspace === key;
    const offs = ['rig.builder', 'rig.cases', 'rig.alert'].map((n) => api.on(n, (ev) => { if (mine(ev)) load(); }));
    return () => offs.forEach((f) => f());
  }, [key, load]);
  return [st, load, setSt];
}
// 판 이벤트 rig.builder(제작 세션이 끝났다) 하나를 받는다
function useBuilderEvent(key, fn) {
  useEffect(() => api.on('rig.builder', (ev) => { if (ev && (!ev.workspace || ev.workspace === key)) fn(ev); }), [key, fn]);
}

// ---------- 미리보기 그림 ----------
export function RigPreview({ def, choices = [] }) {
  const t = useT();
  const m = useMemo(() => previewModel(def), [def]);
  if (!m.seats.length) return <div className="dim" data-role="rig-preview-empty">{t('rigSetup.previewEmpty')}</div>;
  return (
    <div className="mt-rigpv" data-role="rig-preview" role="img" aria-label={t('rigSetup.previewAria')}>
      {/* 선과 화살촉만 SVG, 글은 HTML(P138: 판 위 글은 HTML 글) */}
      <div className="mt-rigpv-canvas" style={{ width: m.width, height: m.height }}>
        <svg width={m.width} height={m.height} viewBox={`0 0 ${m.width} ${m.height}`} aria-hidden="true">
          <defs><marker id="mt-rigpv-arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z" className="mt-rigpv-head" /></marker></defs>
          {m.arrows.map((a, i) => <path key={i} className={`mt-rigpv-arrow${a.back ? ' back' : ''}`} d={a.d} markerEnd="url(#mt-rigpv-arr)" />)}
        </svg>
        {m.seats.map((s) => (
          <div key={s.name} className={`mt-rigpv-seat ${s.mode}`} data-seat={s.name} style={{ left: s.x, top: s.y, width: s.w, height: s.h }}>
            <b>{s.name}</b>
            <span className="mt-rigpv-sub">{s.mode}{s.worktree ? ' · ⎇' : ''} · {launcherName(choices, s.launcher)}</span>
          </div>
        ))}
        {m.arrows.map((a, i) => <span key={i} className={`mt-rigpv-label${a.back ? ' back' : ''}`} data-from={a.from} data-to={a.to} data-on={a.on} data-max={a.max ?? undefined} style={{ left: a.lx, top: a.ly }}>{arrowLabel(a)}</span>)}
      </div>
      {m.results.length > 0 && <div className="mt-rigpv-results dim" data-role="rig-preview-results">{t('rigSetup.results', { list: m.results.join(', ') })}</div>}
    </div>
  );
}

// ---------- 켜기 확인(돌 명령과 사용자 계정) ----------
function EnableBody({ st, ws }) {
  const t = useT();
  const hooks = st.hooks || [], tools = st.tools || [], cycles = (st.cycles || []).filter((x) => x.run);
  return (
    <div className="mt-rigsetup-enable" data-role="rig-setup-enable">
      <div className="mt-rigon-warn" data-role="rig-confirm-warn">{t('rig.confirmWarn')}</div>
      <div className="mt-rigon-root dim">{t('rig.confirmFile', { file: `${ws.root}/.atrium/rig.json` })}</div>
      <div className="mt-rigon-h">{t('rig.confirmHooks', { n: hooks.length })}</div>
      <ul className="mt-rigon-list" data-role="rig-confirm-hooks">{hooks.length ? hooks.map((h, i) => <li key={i}><span className="mt-rigon-at">{h.at}</span><code>{argv(h.run)}</code></li>) : <li className="dim">{t('rig.confirmNone')}</li>}</ul>
      <div className="mt-rigon-h">{t('rig.confirmTools', { n: tools.length })}</div>
      <ul className="mt-rigon-list" data-role="rig-confirm-tools">{tools.length ? tools.map((x) => <li key={x.name}><span className="mt-rigon-at">{x.name}</span><code>{argv(x.run)} …</code></li>) : <li className="dim">{t('rig.confirmNone')}</li>}</ul>
      {cycles.length > 0 && <><div className="mt-rigon-h">{t('rigAdmin.confirmCycles', { n: cycles.length })}</div><ul className="mt-rigon-list">{cycles.map((x, i) => <li key={i}><span className="mt-rigon-at">{x.every}</span><code>{argv(x.run)}</code></li>)}</ul></>}
      <div className="mt-card-sub dim">{t('rig.confirmLater')}</div>
    </div>
  );
}

// ---------- 앉히기(keep 자리마다 세션 하나 고르기 또는 새로 띄우기) ----------
function SeatStep({ ws, st, picks, setPick }) {
  const t = useT();
  const sessions = useStore((s) => s.sessions);
  const keeps = keepSeats(st.definition, st.seated || {});
  if (!keeps.length) return <div className="dim" data-role="rig-seat-none">{t('rigSetup.seatNone')}</div>;
  return (
    <div className="mt-rigsetup-seats" data-role="rig-seat-step">
      <div className="dim">{t('rigSetup.seatIntro')}</div>
      {keeps.map((k) => {
        const cands = seatCandidates([...sessions.values()], ws.key, k.name);
        const p = picks[k.name] || (k.seated ? { kind: 'skip' } : { kind: 'spawn' });
        const val = p.kind === 'session' ? `s:${p.session}` : p.kind;
        return (
          <label key={k.name} className="mt-rigsetup-seatrow" data-seat={k.name}>
            <span><b>{k.name}</b> <span className="dim">{k.seated ? t('rigSetup.seatedNow', { name: k.seated.name || k.seated.sessionId }) : t('rigSetup.seatEmpty')}</span></span>
            <select className="mt-input" data-role="rig-seat-pick" value={val} onChange={(e) => { const v = e.target.value; setPick(k.name, v.startsWith('s:') ? { kind: 'session', session: v.slice(2) } : { kind: v }); }}>
              <option value="spawn">{t('rigSetup.seatSpawn', { name: k.name })}</option>
              {cands.map((c) => <option key={c.sessionId} value={`s:${c.sessionId}`}>{t('rigSetup.seatUse', { name: c.name })}</option>)}
              <option value="skip">{k.seated ? t('rigSetup.seatKeep') : t('rigSetup.seatLater')}</option>
            </select>
          </label>
        );
      })}
    </div>
  );
}
// 앉히기 고른 것 → rig.seat·rig.spawnSeat. 새로 띄운 세션은 그 자리로 간다
async function runSeats(ws, st, picks) {
  const keeps = keepSeats(st.definition, st.seated || {});
  const full = {};
  for (const k of keeps) full[k.name] = picks[k.name] || (k.seated ? { kind: 'skip' } : { kind: 'spawn' });
  for (const a of seatActions(ws.key, full)) await api.call(a.method, a.params);
}

// 제작 세션 줄(만드는 중·끝남·멈춤과 까닭, 그 세션으로 가기)
function BuilderLine({ b }) {
  const t = useT();
  const v = builderView(b);
  if (!v) return null;
  const go = () => { const s = getState(); if (v.session && s.navigateTo) { openDialog(null); s.navigateTo(v.session, { focusTerminal: true }); } };
  return (
    <div className={`mt-rigsetup-builder ${v.state}`} data-role="rig-builder" data-state={v.state}>
      <span>{t(`rigSetup.builder.${v.state}`, { name: v.name })}</span>
      {v.text && <span className="dim mt-rigsetup-btext">{v.text}</span>}
      {v.session && <button type="button" className="mt-btn small" data-action="rig-builder-go" onClick={go}>{t('rigSetup.builderGo')}</button>}
    </div>
  );
}

// ---------- 만들기 대화상자 ----------
export function RigCreateDialog({ ws, onClose }) {
  const t = useT();
  const remote = remoteView();
  const box = useDialog(onClose);
  const launchers = useStore((s) => s.launchers);
  const choices = useMemo(() => launcherChoices(launchers), [launchers]);
  const [st, load] = useRigGet(ws.key);
  const [tpls, setTpls] = useState(null);
  const [w, setW] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.call('rig.templates', {}).then(setTpls, (e) => setTpls({ error: errText(e) })); }, []);
  useEffect(() => { if (st && !w && st.status !== 'error') setW(wizardInit({ defaultLauncher: st.defaultLauncher, status: { state: st.status } })); }, [st, w]);
  // 제작 세션 소식: 이벤트의 builder와 새로 읽은 정의로 building을 넘긴다
  const onBuilder = useCallback((ev) => { load().then((r) => setW((x) => (x ? wizardOnBuilder(x, { session: ev.session, state: 'done', result: ev.result, text: ev.text }, { state: r && r.status }) : x))); }, [load]);
  useBuilderEvent(ws.key, onBuilder);
  useEffect(() => { if (w && w.step === 'building' && st && st.builder) setW((x) => wizardOnBuilder(x, st.builder, { state: st.status })); }, [st]); // eslint-disable-line react-hooks/exhaustive-deps
  if (remote) return null; // 원격 기기에는 만들기가 없다
  const act = async (fn) => { setBusy(true); try { await fn(); } catch (e) { setW((x) => ({ ...x, error: errText(e) })); } finally { setBusy(false); } };
  const next = () => act(async () => {
    const req = wizardRequest(w, ws.key);
    if (req) { const r = await api.call(req.method, req.params); await load(); setW((x) => wizardAfterRequest(x, r)); return; }
    if (w.step === 'preview') { setW((x) => ({ ...x, step: 'enable', error: null })); return; }
    if (w.step === 'enable') { await api.call('rig.enable', { workspace: ws.key, confirm: true }); toast(t('rig.turnedOn', { name: ws.label || ws.name })); await load(); setW(wizardAfterEnable); return; }
    if (w.step === 'seat') { await runSeats(ws, st, w.seatPick); toast(t('rigSetup.seated')); onClose(); }
  });
  const step = w ? w.step : 'loading';
  const tplList = tpls && !tpls.error ? (Array.isArray(tpls) ? tpls : tpls.templates || []) : [];
  const nextLabel = { launchers: t('rigSetup.create'), describe: t('rigSetup.startBuilder'), preview: t('rigSetup.toEnable'), enable: t('rig.confirmOn'), seat: t('rigSetup.seatGo') }[step];
  return (
    <div className="mt-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={box} className="mt-modal mt-rigsetup" data-role="rig-create" data-ws={ws.key} data-step={step}>
        <h3>{t('rigSetup.createTitle', { name: ws.label || ws.name })}</h3>
        <ol className="mt-rigsetup-steps" aria-hidden="true">
          {['path', 'shape', 'preview', 'enable', 'seat'].map((k) => <li key={k} className={stepGroup(step) === k ? 'on' : ''}>{t(`rigSetup.step.${k}`)}</li>)}
        </ol>
        {!w ? <div>{st && st.status === 'error' ? st.error : t('rig.loading')}</div> : (
          <>
            {step === 'path' && (
              <div className="mt-rigsetup-paths" data-role="rig-paths">
                {tpls && tpls.error && <div className="mt-rigon-warn">{tpls.error}</div>}
                {tplList.map((x) => (
                  <button key={x.id} type="button" className="mt-rigsetup-card" data-action="rig-template" data-template={x.id} onClick={() => setW(wizardPickTemplate(w, x, st.defaultLauncher, choices))}>
                    <b>{x.title}</b><span className="dim">{x.desc}</span>
                    <span className="mt-rigsetup-card-seats">{seatList(x).map((s) => s.name).join(' · ')}</span>
                  </button>
                ))}
                <button type="button" className="mt-rigsetup-card describe" data-action="rig-describe" onClick={() => setW(wizardPickDescribe(w))}>
                  <b>{t('rigSetup.describeTitle')}</b><span className="dim">{t('rigSetup.describeDesc')}</span>
                </button>
              </div>
            )}
            {step === 'launchers' && (
              <div className="mt-rigsetup-launchers" data-role="rig-launchers">
                <div className="dim">{t('rigSetup.launchersIntro')}</div>
                {seatList(w.templateDef).map((s) => (
                  <label key={s.name} className="mt-rigsetup-seatrow" data-seat={s.name}>
                    <span><b>{s.name}</b> <span className="dim">{s.session === 'keep' ? 'keep' : 'fresh'}{s.worktree ? ' · ⎇' : ''}</span></span>
                    <LauncherSelect choices={choices} value={w.launchers[s.name]} onChange={(v) => setW(wizardSetLauncher(w, s.name, v))} />
                  </label>
                ))}
                <RigPreview def={{ ...w.templateDef, seats: Object.fromEntries(seatList(w.templateDef).map((s) => [s.name, { ...s, launcher: w.launchers[s.name] }])) }} choices={choices} />
              </div>
            )}
            {step === 'describe' && (
              <div className="mt-rigsetup-describe" data-role="rig-describe-form">
                <label>{t('rigSetup.describeLabel')}
                  <textarea className="mt-input" rows={6} value={w.text} data-role="rig-describe-text" placeholder={t('rigSetup.describePh')} onChange={(e) => setW({ ...w, text: e.target.value })} />
                </label>
                <label>{t('rigSetup.builderLauncher')}
                  <LauncherSelect choices={choices} value={w.builderLauncher} onChange={(v) => setW({ ...w, builderLauncher: v })} />
                </label>
              </div>
            )}
            {step === 'building' && (
              <div data-role="rig-building">
                <BuilderLine b={w.builder} />
                <div className="dim">{t('rigSetup.buildingHint')}</div>
                {st && st.status === 'invalid' && <div className="mt-rigon-warn">{t('rig.stInvalid', { reason: st.why || '?' })}</div>}
              </div>
            )}
            {step === 'preview' && st && <><RigPreview def={st.definition} choices={choices} />{st.status === 'invalid' && <div className="mt-rigon-warn">{t('rig.stInvalid', { reason: st.why || '?' })}</div>}</>}
            {step === 'enable' && st && <EnableBody st={st} ws={ws} />}
            {step === 'seat' && st && <SeatStep ws={ws} st={st} picks={w.seatPick} setPick={(seat, p) => setW(wizardSetSeat(w, seat, p))} />}
            {w.error && <div className="mt-rigon-warn" data-role="rig-setup-error">{w.error}</div>}
          </>
        )}
        <div className="mt-card-actions">
          {nextLabel && <button className="mt-btn primary" data-action="rig-setup-next" disabled={busy || !w || !wizardCanNext(w) || (step === 'preview' && st && st.status === 'invalid')} onClick={next}>{nextLabel}</button>}
          {w && (step === 'launchers' || step === 'describe') && <button className="mt-btn ghost" data-action="rig-setup-back" disabled={busy} onClick={() => setW(wizardBack(w))}>{t('rigSetup.back')}</button>}
          <button className="mt-btn ghost" data-action="rig-setup-close" onClick={onClose}>{step === 'building' ? t('rigSetup.closeBuilding') : step === 'seat' ? t('rigSetup.seatSkip') : t('common.cancel')}</button>
        </div>
      </div>
    </div>
  );
}
const stepGroup = (s) => (s === 'path' ? 'path' : s === 'launchers' || s === 'describe' || s === 'building' ? 'shape' : s);

function LauncherSelect({ choices, value, onChange, disabled }) {
  const t = useT();
  const known = choices.some((c) => c.id === value);
  return (
    <select className="mt-input" data-role="rig-launcher" value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {!value && <option value="">{t('rigSetup.pickLauncher')}</option>}
      {value && !known && <option value={value}>{value}</option>}
      {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

// ---------- rig 판 ----------
export function RigPanel({ ws, onClose }) {
  const t = useT();
  const remote = remoteView();
  const edit = canEdit({ remote });
  const box = useDialog(onClose);
  const launchers = useStore((s) => s.launchers);
  const sessions = useStore((s) => s.sessions);
  const choices = useMemo(() => launcherChoices(launchers), [launchers]);
  const [st, load] = useRigGet(ws.key);
  const [tb, setTb] = useState(null);
  const [base, setBase] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [say, setSay] = useState('');
  const [setup, setSetup] = useState(null); // 꺼진 맞는 정의: 미리보기 → 켜기 → 앉히기 단계(만들기 대화상자와 같은 단계)
  const defHash = st && st.hash;
  useEffect(() => { if (st && st.definition) { const x = tableFromDef(st.definition); setTb(x); setBase(x); } }, [defHash]); // eslint-disable-line react-hooks/exhaustive-deps
  const locked = (st && st.locked) || [];
  const act = async (fn) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); } };
  const save = () => act(async () => {
    const d = tableToSave(tb);
    if (d.error) { setErr(t(d.error.key, d.error.vars || {})); return; }
    const r = await api.call('rig.save', { workspace: ws.key, ...d });
    toast(t('rigPanel.saved', { n: r && r.versionN != null ? r.versionN : '?' }));
    await load();
  });
  const describe = () => act(async () => { const r = await api.call('rig.describe', { workspace: ws.key, text: say.trim(), launcher: (st && st.defaultLauncher) || (choices[0] && choices[0].id) || '' }); setSay(''); toast(t('rigPanel.describeSent', { name: (r && r.name) || 'rig-builder' })); await load(); });
  const seat = (sessionId, seatName) => act(async () => { await api.call('rig.seat', { session: sessionId, seat: seatName }); await load(); });
  const spawn = (seatName) => act(async () => { await api.call('rig.spawnSeat', { workspace: ws.key, seat: seatName }); await load(); });
  const enable = () => act(async () => { await api.call('rig.enable', { workspace: ws.key, confirm: true }); toast(t('rig.turnedOn', { name: ws.label || ws.name })); await load(); setSetup({ step: 'seat', picks: {} }); });
  const disable = () => act(async () => { await api.call('rig.disable', { workspace: ws.key }); toast(t('rig.turnedOff', { name: ws.label || ws.name })); await load(); });
  const status = st ? st.status : 'loading';
  const seatNames = tb ? tb.seats.map((r) => r.name).filter(Boolean) : [];
  const results = tb ? tb.results.map((r) => r.value).filter(Boolean) : [];
  const dirty = tb && base && tableDirty(tb, base);
  const Lk = ({ on }) => (on ? <span className="mt-rigpanel-lock" title={t('rigPanel.locked')} data-role="rig-lock">🔒</span> : null);
  return (
    <div className="mt-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={box} className="mt-modal mt-rigpanel" data-role="rig-panel" data-ws={ws.key} data-status={status} data-remote={remote ? '1' : undefined}>
        <h3>{t('rigPanel.title', { name: ws.label || ws.name })}</h3>
        {!st ? <div>{t('rig.loading')}</div> : st.status === 'error' ? <div className="mt-rigon-warn">{st.error}</div> : (
          <>
            <div className="mt-rigpanel-status" data-role="rig-panel-status">
              <span className={`mt-rigpanel-dot ${status}`} />
              <b>{t(`rigPanel.st.${status}`)}</b>
              {st.versionN != null && <span className="dim">{t('rigPanel.version', { n: st.versionN })}</span>}
              <span className="dim" data-role="rig-open-cases">{t('rigPanel.openCases', { n: st.openCases || 0 })}</span>
              {st.why && <span className="mt-rigon-warn">{st.why}</span>}
              {edit && status === 'on' && <button className="mt-btn small ghost" data-action="rig-panel-off" disabled={busy} onClick={disable}>{t('rig.menuOff')}</button>}
              {edit && status === 'off' && !setup && <button className="mt-btn small primary" data-action="rig-panel-setup" disabled={busy} onClick={() => setSetup({ step: 'enable', picks: {} })}>{t('rigPanel.enableSteps')}</button>}
              {edit && status !== 'none' && <button className="mt-btn small ghost" data-action="rig-panel-protect" onClick={() => openDialog({ kind: 'rigprotect', ws })}>{t('rigAdmin.menu')}</button>}
            </div>
            {st.builder && <BuilderLine b={st.builder} />}
            {status === 'none' && !st.builder && <div className="dim">{t('rigPanel.none')}</div>}
            {setup && edit && (
              <div className="mt-rigpanel-setup" data-role="rig-panel-setup" data-step={setup.step}>
                {setup.step === 'enable' && <><EnableBody st={st} ws={ws} /><div className="mt-card-actions"><button className="mt-btn primary" data-action="rig-panel-enable" disabled={busy} onClick={enable}>{t('rig.confirmOn')}</button><button className="mt-btn ghost" onClick={() => setSetup(null)}>{t('common.cancel')}</button></div></>}
                {setup.step === 'seat' && <><SeatStep ws={ws} st={st} picks={setup.picks} setPick={(s, p) => setSetup({ ...setup, picks: { ...setup.picks, [s]: p } })} /><div className="mt-card-actions"><button className="mt-btn primary" data-action="rig-panel-seat-go" disabled={busy} onClick={() => act(async () => { await runSeats(ws, st, setup.picks); toast(t('rigSetup.seated')); setSetup(null); await load(); })}>{t('rigSetup.seatGo')}</button><button className="mt-btn ghost" onClick={() => setSetup(null)}>{t('rigSetup.seatSkip')}</button></div></>}
              </div>
            )}
            {st.definition && <RigPreview def={tb ? previewDef(tb, st.definition) : st.definition} choices={choices} />}
            {tb && (
              <>
                <div className="mt-rigon-h">{t('rigPanel.seats')}</div>
                <table className="mt-rigpanel-table" data-role="rig-seats">
                  <thead><tr><th>{t('rigPanel.colName')}</th><th>{t('rigPanel.colMode')}</th><th>{t('rigPanel.colLauncher')}</th><th>⎇</th><th>{t('rigPanel.colSeated')}</th><th /></tr></thead>
                  <tbody>
                    {tb.seats.map((r) => {
                      const L = (f) => !edit || rowLocked(locked, 'seats', r, f);
                      const seated = (st.seated || {})[r.orig || r.name] || [];
                      const cands = seatCandidates([...sessions.values()], ws.key, r.name);
                      return (
                        <tr key={r.key} data-seat={r.name} data-locked={rowLocked(locked, 'seats', r) ? '1' : undefined}>
                          <td><Lk on={rowLocked(locked, 'seats', r)} /><input className="mt-input" value={r.name} disabled={L('name') || r.orig != null} data-field="name" onChange={(e) => setTb(tableEdit(tb, 'seats', r.key, 'name', e.target.value))} /></td>
                          <td><select className="mt-input" value={r.session} disabled={L('session')} data-field="session" onChange={(e) => setTb(tableEdit(tb, 'seats', r.key, 'session', e.target.value))}><option value="keep">keep</option><option value="fresh">fresh</option></select></td>
                          <td><LauncherSelect choices={choices} value={r.launcher} disabled={L('launcher')} onChange={(v) => setTb(tableEdit(tb, 'seats', r.key, 'launcher', v))} /></td>
                          <td><input type="checkbox" checked={r.worktree} disabled={L('worktree') || r.session === 'keep'} data-field="worktree" onChange={(e) => setTb(tableEdit(tb, 'seats', r.key, 'worktree', e.target.checked))} /></td>
                          <td className="mt-rigpanel-seated">
                            {seated.length ? seated.map((x) => <span key={x.sessionId} className="mt-rigpanel-sess">{x.name}{edit && r.session === 'keep' && <button className="mt-btn small ghost" data-action="rig-unseat" disabled={busy} onClick={() => seat(x.sessionId, null)}>{t('rigPanel.unseat')}</button>}</span>) : <span className="dim">-</span>}
                            {edit && status === 'on' && r.session === 'keep' && r.orig != null && !seated.length && (
                              <select className="mt-input small" value="" data-role="rig-seat-quick" disabled={busy} onChange={(e) => { const v = e.target.value; if (v === 'spawn') spawn(r.name); else if (v) seat(v, r.name); }}>
                                <option value="">{t('rigPanel.seatPick')}</option>
                                <option value="spawn">{t('rigSetup.seatSpawn', { name: r.name })}</option>
                                {cands.map((c) => <option key={c.sessionId} value={c.sessionId}>{t('rigSetup.seatUse', { name: c.name })}</option>)}
                              </select>
                            )}
                          </td>
                          <td>{edit && <button className="mt-btn small ghost" data-action="rig-row-del" disabled={!canRemove(locked, tb, 'seats', r)} title={t('rigPanel.remove')} onClick={() => setTb(tableRemove(tb, 'seats', r.key))}>✕</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {edit && !partLocked(locked, 'seats') && <button className="mt-btn small" data-action="rig-add-seat" onClick={() => setTb(tableAdd(tb, 'seats', { launcher: st.defaultLauncher }))}>{t('rigPanel.addSeat')}</button>}

                <div className="mt-rigon-h">{t('rigPanel.flow')}</div>
                <table className="mt-rigpanel-table" data-role="rig-flow">
                  <thead><tr><th>{t('rigPanel.colFrom')}</th><th>{t('rigPanel.colOn')}</th><th>{t('rigPanel.colTo')}</th><th>{t('rigPanel.colMax')}</th><th>{t('rigPanel.colElse')}</th><th /></tr></thead>
                  <tbody>
                    {tb.flow.map((r, i) => {
                      const L = (f) => !edit || rowLocked(locked, 'flow', r, f);
                      return (
                        <tr key={r.key} data-flow={i} data-locked={rowLocked(locked, 'flow', r) ? '1' : undefined}>
                          <td><Lk on={rowLocked(locked, 'flow', r)} /><Pick value={r.from} list={seatNames} disabled={L('from')} field="from" onChange={(v) => setTb(tableEdit(tb, 'flow', r.key, 'from', v))} /></td>
                          <td><Pick value={r.on} list={['assign', ...results]} disabled={L('on')} field="on" onChange={(v) => setTb(tableEdit(tb, 'flow', r.key, 'on', v))} /></td>
                          <td><Pick value={r.to} list={seatNames} disabled={L('to')} field="to" onChange={(v) => setTb(tableEdit(tb, 'flow', r.key, 'to', v))} /></td>
                          <td><input className="mt-input mt-rigpanel-num" type="number" min="1" value={r.max} disabled={L('max')} data-field="max" onChange={(e) => setTb(tableEdit(tb, 'flow', r.key, 'max', e.target.value))} /></td>
                          <td><Pick value={r.else} list={seatNames} blank disabled={L('else')} field="else" onChange={(v) => setTb(tableEdit(tb, 'flow', r.key, 'else', v))} /></td>
                          <td>{edit && <button className="mt-btn small ghost" data-action="rig-row-del" disabled={!canRemove(locked, tb, 'flow', r)} title={t('rigPanel.remove')} onClick={() => setTb(tableRemove(tb, 'flow', r.key))}>✕</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {edit && !partLocked(locked, 'flow') && <button className="mt-btn small" data-action="rig-add-flow" onClick={() => setTb(tableAdd(tb, 'flow'))}>{t('rigPanel.addFlow')}</button>}

                <div className="mt-rigon-h">{t('rigPanel.results')}</div>
                <div className="mt-rigpanel-results" data-role="rig-results">
                  {tb.results.map((r) => (
                    <span key={r.key} className="mt-rigpanel-res" data-locked={rowLocked(locked, 'results', r) ? '1' : undefined}>
                      <Lk on={rowLocked(locked, 'results', r)} />
                      <input className="mt-input" value={r.value} disabled={!edit || rowLocked(locked, 'results', r)} onChange={(e) => setTb(tableEdit(tb, 'results', r.key, 'value', e.target.value))} />
                      {edit && <button className="mt-btn small ghost" data-action="rig-row-del" disabled={!canRemove(locked, tb, 'results', r)} onClick={() => setTb(tableRemove(tb, 'results', r.key))}>✕</button>}
                    </span>
                  ))}
                  {edit && !partLocked(locked, 'results') && <button className="mt-btn small" data-action="rig-add-result" onClick={() => setTb(tableAdd(tb, 'results'))}>+</button>}
                </div>
                {edit && (
                  <div className="mt-card-actions mt-rigpanel-save">
                    <button className="mt-btn primary" data-action="rig-save" disabled={busy || !dirty} onClick={save}>{t('rigPanel.save')}</button>
                    {dirty && <button className="mt-btn ghost" data-action="rig-reset" disabled={busy} onClick={() => setTb(base)}>{t('rigPanel.reset')}</button>}
                    <span className="dim">{t('rigPanel.saveHint')}</span>
                  </div>
                )}
              </>
            )}
            {(st.hooks || []).length + (st.tools || []).length + (st.cycles || []).length > 0 && (
              <>
                <div className="mt-rigon-h">{t('rigPanel.parts')}</div>
                <ul className="mt-rigon-list" data-role="rig-parts">
                  {(st.hooks || []).map((h, i) => <li key={`h${i}`}><span className="mt-rigon-at">{t('rigPanel.hook')} {h.at}</span><code>{argv(h.run)}</code></li>)}
                  {(st.tools || []).map((x) => <li key={`t${x.name}`}><span className="mt-rigon-at">{t('rigPanel.tool')} {x.name}</span><code>{argv(x.run)}</code></li>)}
                  {(st.cycles || []).map((x, i) => <li key={`c${i}`}><span className="mt-rigon-at">{t('rigPanel.cycle')} {x.every} → {x.to}</span>{x.run && <code>{argv(x.run)}</code>}</li>)}
                </ul>
              </>
            )}
            {edit && (
              <div className="mt-rigpanel-say" data-role="rig-say">
                <label>{t('rigPanel.sayLabel')}
                  <textarea className="mt-input" rows={3} value={say} placeholder={t('rigPanel.sayPh')} data-role="rig-say-text" onChange={(e) => setSay(e.target.value)} />
                </label>
                <div className="mt-card-actions">
                  <button className="mt-btn" data-action="rig-say-send" disabled={busy || !say.trim()} onClick={describe}>{t('rigPanel.saySend')}</button>
                  <button className="mt-btn ghost" data-action="rig-file-copy" title={t('rigPanel.fileTitle')} onClick={() => copyPath(`${ws.root}/.atrium/rig.json`, t)}>{t('rigPanel.fileCopy')}</button>
                </div>
              </div>
            )}
            {err && <div className="mt-rigon-warn" data-role="rig-panel-error">{err}</div>}
          </>
        )}
        <div className="mt-card-actions">
          <button className="mt-btn ghost" data-action="rig-panel-close" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}
// 표의 지금 값으로 미리보기(저장 전에도 그림이 따라온다). 표 검사에 걸리면 원래 정의
function previewDef(tb, def) {
  const d = tableToSave(tb);
  return d.error ? def : { ...def, seats: d.seats, flow: d.flow, results: d.results };
}
function Pick({ value, list, onChange, disabled, blank, field }) {
  const opts = [...new Set([...(blank ? [''] : []), ...list, ...(value && !list.includes(value) ? [value] : [])])];
  return <select className="mt-input" value={value || ''} disabled={disabled} data-field={field} onChange={(e) => onChange(e.target.value)}>{!value && !blank && <option value="" />}{opts.map((o) => <option key={o} value={o}>{o || '-'}</option>)}</select>;
}
// 판에 파일을 편집기로 여는 길이 없어 경로를 복사한다(보고에 적음)
async function copyPath(p, t) {
  try { await navigator.clipboard.writeText(p.replace(/\//g, '\\')); toast(t('rigPanel.fileCopied')); } catch { toast(p); }
}
