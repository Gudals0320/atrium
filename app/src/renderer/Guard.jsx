// P341: 폭주 감시의 창 쪽. 배지(캔버스 노드 머리·세션 맵 카드·메모리 알약 줄), 폭주 할 일 카드의 몸통(Decisions.jsx DecisionRow가 kind guard면 부른다),
// 설정 › 세션 › 자원 쪽. 값은 자원 표본의 줄 guard(30초, 후보가 있으면 10초마다)와 카드의 guard 칸. 동작은 판 API guard.act { id | session, action }
//   (kill 그 프로세스 끄기 | pause 세션 일시정지 | resume 다시 돌리기 | sleep 재우기 | mute 30분 묻지 않기). 끄기는 한 번 더 눌러 확인한다.
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, toast } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { badgeParts, guardActions, whyParts, liveTop, rowOf, fmtMem } from './lib/guard.js';
import { SetRow, Toggle } from './Settings.jsx';

const act = (p) => api.call('guard.act', p);
const fmtClock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// 배지. where: node | map | list. 멈춘 세션은 다시 돌리기 단추를 함께(map에서는 카드 누르기와 따로)
export function GuardBadge({ sessionId, where = 'node' }) {
  const t = useT();
  const g = useStore((st) => { const r = rowOf(st.resources, sessionId); return r && r.guard ? r.guard : null; });
  const [busy, setBusy] = useState(false);
  if (!g) return null;
  const parts = badgeParts(g);
  if (!parts.length) return null;
  const text = parts.map((p) => t(p.key, p.vars)).join(' · ');
  const title = g.paused ? t('guard.pausedTitle', { time: fmtClock(g.paused.at) }) : t(g.kind === 'suspect' ? 'guard.suspectTitle' : 'guard.heavyTitle', { what: text, top: g.top ? `${g.top.name} (PID ${g.top.pid})` : '?' });
  const resume = async (e) => { e.stopPropagation(); e.preventDefault(); setBusy(true); try { await act({ session: sessionId, action: 'resume' }); toast(t('guard.resumed')); } catch (err) { toast(t('guard.fail', { error: errText(err) }), 'error'); } setBusy(false); };
  return (
    <span className={`mt-guard-badge ${where} k-${g.kind}${g.paused ? ' paused' : ''}`} data-role="guard-badge" data-kind={g.kind} data-paused={g.paused ? '1' : undefined} title={title} aria-label={title}>
      <i aria-hidden="true" />{text}
      {g.paused ? <button type="button" className="mt-guard-resume nodrag" data-action="guard-resume" disabled={busy} onClick={resume} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>{t('guard.resume')}</button> : null}
    </span>
  );
}

// 폭주 카드 몸통(머리는 Decisions.jsx CardHead)
export function GuardBody({ d, t }) {
  const row = useStore((st) => rowOf(st.resources, d.sessionId));
  const canPause = useStore((st) => !!(st.resources && st.resources.guard && st.resources.guard.canPause));
  const s = useStore((st) => st.sessions.get(d.sessionId));
  const cores = useStore((st) => (st.resources && st.resources.cpu && st.resources.cpu.cores) || 1); // 줄의 CPU는 PC 전체 대비 → 코어 하나 대비로
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const g = d.guard || {};
  const paused = !!(g.paused || (row && row.guard && row.guard.paused));
  const top = liveTop(d, row);
  const sleepable = !!s && (s.kind || 'claude') !== 'shell' && s.state !== 'sleeping';
  const { acts, recommend } = guardActions(d, { canPause, paused, sleepable, top });
  const name = s ? s.name : d.name;
  const run = async (action) => {
    if (busy) return;
    if (action === 'kill' && !sure) { setSure(true); clearTimeout(timer.current); timer.current = setTimeout(() => setSure(false), 4000); return; }
    setBusy(true); setSure(false);
    try {
      const r = await act({ id: d.id, action, ...(action === 'kill' && top ? { pid: top.pid, created: top.created } : {}) });
      toast(t(`guard.done.${action}`, { name, proc: r && r.name ? r.name : top ? top.name : '' }));
    } catch (e) { toast(t('guard.fail', { error: errText(e) }), 'error'); }
    setBusy(false);
  };
  const live = row && row.guard && !row.guard.paused ? row.guard : g;
  return (
    <div className="mt-guard-body" data-role="guard-body" data-paused={paused ? '1' : undefined}>
      <div className="mt-guard-why" data-role="guard-why">{paused ? t('guard.pausedLine', { time: fmtClock(g.paused ? g.paused.at : row.guard.paused.at) }) : whyParts(live).map((p) => t(p.key, p.vars)).join(' · ')}</div>
      {top ? (
        <div className="mt-guard-top mono" data-role="guard-top" data-pid={top.pid}>
          <b>{top.name}</b> · PID {top.pid}{top.cpuPct != null ? <> · CPU {Math.round(top.cpuPct * cores)}%</> : null} · {fmtMem(top.memMB)}
          {top.agent ? <span className="mt-guard-agent" data-role="guard-agent">{t('guard.isAgent')}</span> : null}
        </div>
      ) : null}
      {recommend === 'sleep' && !paused ? <div className="mt-guard-hint" data-role="guard-hint">{t('guard.sleepHint')}</div> : null}
      <div className="mt-ut-acts mt-guard-acts">
        {acts.map((a) => (
          <button key={a} type="button" data-action={`guard-${a}`} disabled={busy}
            className={`mt-btn small${a === 'kill' ? (sure ? ' danger primary' : ' danger') : a === recommend || a === 'resume' ? ' primary' : a === 'mute' ? ' ghost' : ''}`}
            title={t(`guard.act.${a}Title`)} onClick={() => run(a)}>
            {a === 'kill' && sure ? t('guard.act.killSure', { proc: top ? top.name : '' }) : t(`guard.act.${a}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

// 설정 › 세션 › 자원
function GuardNum({ k, settings, schema, label, hint, child = true, dim = false }) {
  const t = useT();
  const [v, setV] = useState(null);
  const sc = (schema && schema[k]) || {};
  const save = async (value) => { try { await api.call('settings.set', { key: k, value }); setV(null); toast(t('guard.set.saved')); } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); } };
  return (
    <SetRow id={k} name={t(label)} hint={t(hint, { n: sc.default ?? '' })} child={child} dim={dim}>
      <input type="number" className="mt-set-num" min={sc.min} max={sc.max} data-field={`setting-${k}`} value={v ?? settings[k] ?? sc.default ?? ''} onChange={(e) => setV(e.target.value)}
        onBlur={() => v != null && v !== '' && save(Number(v))} onKeyDown={(e) => { if (e.key === 'Enter' && v != null && v !== '') save(Number(v)); }} />
    </SetRow>
  );
}
export function ResourcesTab({ settings, schema }) {
  const t = useT();
  const [adv, setAdv] = useState(false);
  const status = useStore((st) => (st.resources && st.resources.guard) || null);
  const save = async (key, value) => { try { await api.call('settings.set', { key, value }); toast(t(`guard.set.${key}${value ? 'On' : 'Off'}`)); } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); } };
  const off = settings.guardDetect === false;
  return (
    <div className="mt-set-grid" data-role="resources-settings">
      <SetRow id="guardLowerPriority" name={t('guard.set.lowerName')} hint={t('guard.set.lowerHint')} info={t('guard.set.lowerNote')} role="guard-lower"><Toggle checked={settings.guardLowerPriority !== false} onChange={(v) => save('guardLowerPriority', v)} field="setting-guardLowerPriority" /></SetRow>
      <SetRow id="guardDetect" name={t('guard.set.detectName')} hint={t('guard.set.detectHint')} info={t('guard.set.detectNote')} role="guard-detect"><Toggle checked={!off} onChange={(v) => save('guardDetect', v)} field="setting-guardDetect" /></SetRow>
      {status && !status.canPause ? <div className="mt-set-note dim" data-role="guard-no-pause">{t('guard.set.noPause')}</div> : null}
      <button type="button" className="mt-bot-fold" data-action="guard-advanced" aria-expanded={adv} onClick={() => setAdv(!adv)}>{adv ? '▾' : '▸'} {t('guard.set.advanced')}</button>
      {adv && <>
        <GuardNum k="guardCpuPct" settings={settings} schema={schema} label="guard.set.cpuPct" hint="guard.set.cpuPctHint" dim={off} />
        <GuardNum k="guardCpuMin" settings={settings} schema={schema} label="guard.set.cpuMin" hint="guard.set.cpuMinHint" dim={off} />
        <GuardNum k="guardMemGB" settings={settings} schema={schema} label="guard.set.memGB" hint="guard.set.memGBHint" dim={off} />
        <GuardNum k="guardGrowMin" settings={settings} schema={schema} label="guard.set.growMin" hint="guard.set.growMinHint" dim={off} />
      </>}
    </div>
  );
}
