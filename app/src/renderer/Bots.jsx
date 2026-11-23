// P338: 설정 › 봇 탭(옛 P313 에이전트 탭). 봇 = 보드가 스스로 띄워 쓰는 보조 에이전트(판 settings.mjs HELPER_AGENTS: 병합 merge, 할 일 정리 todoTidy).
// 봇마다 카드 하나: 머리(이름·한 줄 설명·켬/물어봄/끔) → 상태 줄(판 bots.status: 지금 상태·오늘 한 것, 누르면 그 세션으로) →
//   런처 고르기(설정 › 런처의 런처 또는 하네스, lib/bots.js) → 모델·노력(그 하네스 표가 주는 목록, 받지 않는 칸은 숨김) → 봇만의 칸 →
//   "▸ 고급"(승인 방식·시간당 상한·긴 설명·못 띄운 까닭) → 병합 봇은 "▸ 저장소별"(.atrium/merge.json 표, 판 merger.configs·merger.config.set).
// 할 일 정리 봇의 "▸ 고급"에 옛 일반 탭의 "자동 결정 카드"(판 설정 autoDecisions)를 둔다: 봇 끔 = 규칙만, 자동 카드 끔 = 카드를 만들지 않음.
// 카드에는 런처 한 줄만(+ 상태 줄, 켬/물어봄/끔). 런처를 고르면 판 설정 mergerLauncher·todoTidyLauncher에 그 ID를 두고 하네스·모델·노력은 그 런처를 따른다
//   (런처를 고치면 봇도 따라간다). 모델·노력 덮어쓰기는 "▸ 고급"에 있고 비우면 런처 값이다. 런처 ID가 없거나 런처가 없어지면 옛 키(merger*·todoTidy*) 그대로.
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { toast, useStore, getState } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { agentValueOf } from './lib/agents.js';
import { harnessName } from './lib/launchers.js';
import { botsOf, allowedKinds, launcherPicks, harnessPicks, effectiveOf, patchFromLauncher, patchFromHarness, modelChoices, effortChoices, permissionShown, statusOf, mergeRows, mergeFieldOf, MERGE_WHERE } from './lib/bots.js';
import { Icon } from './lib/icons.jsx';
import { SetRow, Toggle } from './Settings.jsx';

const MERGE_FILE = '.atrium/merge.json';

async function saveField(t, bot, f, raw) {
  const v = agentValueOf(f, raw);
  if (v.error) { toast(t(bot.dict + '.bad.' + v.error), 'error'); return false; }
  try { await api.call('settings.set', { key: f.key, value: v.value }); return true; } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); return false; }
}
async function saveMany(t, pairs) {
  try { for (const [key, value] of pairs) await api.call('settings.set', { key, value }); toast(t('bots.saved')); return true; } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); return false; }
}

// 글자 칸(모델 목록이 없는 하네스, 저장소별 표의 브랜치·안내 파일). Enter·초점 잃음에 저장, Esc는 되돌림
function TextCell({ value, placeholder, field, onSave, className = 'mt-set-text' }) {
  const [text, setText] = useState(null);
  const done = async () => { if (text == null) return; if (text.trim() !== (value || '')) await onSave(text); setText(null); };
  return <input type="text" className={className} data-field={field} value={text ?? (value || '')} placeholder={placeholder} spellCheck={false}
    onChange={(e) => setText(e.target.value)} onBlur={done} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } if (e.key === 'Escape' && text != null) { e.preventDefault(); e.stopPropagation(); setText(null); } }} />;
}

function ModeSeg({ bot, t }) {
  const f = bot.f.mode;
  const [pending, setPending] = useState(null);
  const mode = pending ?? f.value;
  const pick = async (m) => { setPending(m); if (await saveField(t, bot, f, m)) toast(t(bot.dict + '.modeSet.' + m)); setPending(null); };
  return <span className="mt-seg-lang mt-bot-mode" data-field={'setting-' + f.key} data-value={mode} role="radiogroup" aria-label={t('bots.name.' + bot.id)}>
    {f.options.map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} className={`mt-btn small${mode === m ? ' primary' : ' ghost'}`} data-mode={m} onClick={() => mode !== m && pick(m)}>{t(bot.dict + '.modes.' + m)}</button>)}
  </span>;
}

function StatusLine({ bot, status, settings, onGo, t }) {
  const st = statusOf(bot.id, status, settings);
  const inner = <>
    <span className={`mt-bot-dot ${st.state}`} />
    <b>{t('bots.state.' + st.state)}</b>
    {st.parts.map((p, i) => <span key={i} className={p.bad ? 'bad' : ''}> · {t(p.key, p.vars)}</span>)}
    {st.capped && <span className="bad"> · {t('bots.capped')}</span>}
    {st.go && <span className="mt-bot-go">{t('bots.goSession')} →</span>}
  </>;
  return st.go
    ? <button type="button" className="mt-bot-status go" data-role="bot-status" data-state={st.state} onClick={() => onGo(st.go)}>{inner}</button>
    : <div className="mt-bot-status" data-role="bot-status" data-state={st.state}>{inner}</div>;
}

// 병합 봇의 저장소별 표(.atrium/merge.json). 칸을 고치면 판이 그 프로젝트의 파일에 쓴다(merger.config.set)
function MergeRepos({ configs, reload, mode, t }) {
  const workspaces = useStore((st) => st.workspaces);
  const rows = mergeRows(configs, workspaces);
  const set = async (r, field, raw) => {
    const v = mergeFieldOf(field, raw);
    if (v.error) { toast(t('bots.bad.' + v.error), 'error'); return; }
    try { await api.call('merger.config.set', { workspace: r.workspace, patch: { [field]: v.value } }); toast(t('bots.repoSaved', { name: r.name, file: MERGE_FILE })); } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); }
    reload();
  };
  const forget = async (r) => { try { await api.call('merger.answer', { workspace: r.workspace, answer: 'ask' }); toast(t('merger.forgot', { name: r.name })); } catch (e) { toast(errText(e), 'error'); } reload(); };
  const answer = (r) => {
    if (mode === 'on') return <span className="mt-bot-ans on">{t('bots.answer.allOn')}</span>;
    if (mode === 'off') return <span className="mt-bot-ans off">{t('bots.answer.allOff')}</span>;
    const a = r.answer === 'on' || r.answer === 'off' ? r.answer : 'ask';
    return <span className={`mt-bot-ans ${a}`}>{t('bots.answer.' + a)}{a !== 'ask' && <button type="button" className="mt-btn small ghost" data-action="merger-forget" onClick={() => forget(r)}>{t('merger.askAgain')}</button>}</span>;
  };
  if (!configs) return null;
  return (
    <div className="mt-bot-repos" data-role="merge-repos">
      <div className="mt-set-hint">{t('bots.reposNote', { file: MERGE_FILE })}</div>
      {rows.length ? <table className="mt-bot-table">
        <thead><tr>{['project', 'target', 'where', 'push', 'guide', 'answer'].map((c) => <th key={c}>{t('bots.col.' + c)}</th>)}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.workspace} data-ws={r.workspace} data-source={r.source || ''}>
            <td className="mt-bot-proj"><b title={r.root}>{r.name}</b>{r.problems && r.problems.length > 0 && <span className="mt-bot-warn" title={t('bots.problems', { file: MERGE_FILE, list: r.problems.join('; ') })}>!</span>}</td>
            <td><TextCell value={r.target} placeholder={t('bots.targetAuto')} field="merge-target" onSave={(v) => set(r, 'target', v)} /></td>
            <td><select className="mt-set-select" data-field="merge-where" value={r.where} onChange={(e) => set(r, 'where', e.target.value)}>{MERGE_WHERE.map((w) => <option key={w} value={w}>{t('bots.where.' + w)}</option>)}</select></td>
            <td><label className="mt-set-toggle"><input type="checkbox" data-field="merge-push" checked={!!r.push} onChange={(e) => set(r, 'push', e.target.checked)} /><span>{r.push ? t('settings.on') : t('settings.off')}</span></label></td>
            <td><TextCell value={r.guide} placeholder={t('bots.guidePh')} field="merge-guide" onSave={(v) => set(r, 'guide', v)} /></td>
            <td>{answer(r)}</td>
          </tr>
        ))}</tbody>
      </table> : <div className="dim">{t('bots.reposNone')}</div>}
    </div>
  );
}

function BotCard({ bot, settings, status, configs, reloadConfigs, onGo }) {
  const t = useT();
  const data = useStore((st) => st.launchers);
  const harnesses = data && data.harnesses;
  const [adv, setAdv] = useState(false);
  const [repos, setRepos] = useState(false);
  const off = !!(bot.f.mode && bot.f.mode.value === 'off');
  const allowed = allowedKinds(bot);
  const picks = launcherPicks(data, allowed);
  const eff = effectiveOf(bot, picks);
  const kind = eff.kind;
  const lost = !!(bot.f.launcher && bot.f.launcher.value && !eff.launcher); // 고른 런처가 없어졌다(옛 키로 돈다)
  const mc = kind && bot.f.model ? modelChoices(harnesses, kind, bot.f.model.value) : null;
  const ec = kind && bot.f.effort ? effortChoices(harnesses, kind, bot.f.effort.options) : null;
  const hname = (h) => harnessName(harnesses, h, t);
  const what = [hname(kind), mc && mc.show ? eff.model || t('bots.modelDefault') : null, ec && ec.show ? eff.effort || t('bots.effortDefaultShort') : null].filter(Boolean).join(' · ');
  const launcherHint = eff.launcher ? t('bots.gives', { what }) + (eff.over.model || eff.over.effort ? ' ' + t('bots.overridden') : '') : lost ? t('bots.lost', { what }) : t('bots.noLauncherHint', { what });
  const onPick = (v) => {
    if (v.startsWith('l:')) { const l = picks.find((x) => 'l:' + x.id === v); if (l) saveMany(t, patchFromLauncher(bot, l)); }
    else saveMany(t, patchFromHarness(bot, v.slice(2), harnesses));
  };
  // 덮어쓰기 칸: 빈 값 = 런처(또는 하네스 기본) 값. 판이 칸 꼴을 확인한다
  const setOver = (f, v) => saveMany(t, [[f.key, String(v == null ? '' : v).trim()]]);
  const field = (f, raw) => saveField(t, bot, f, raw).then((ok) => ok && toast(t('bots.saved')));
  const problem = bot.id === 'merge' && status && status.merge && status.merge.problem;
  const perHour = bot.id === 'todoTidy' && 'todoTidyPerHour' in settings;
  const perm = bot.f.permission && kind && permissionShown(harnesses, kind);
  const repoCount = configs && Array.isArray(configs.workspaces) ? configs.workspaces.length : 0;
  const baseModel = eff.launcher ? t('bots.useLauncher', { v: eff.launcher.model || t('bots.modelDefault') }) : t('bots.harnessDefault');
  const baseEffort = eff.launcher ? t('bots.useLauncher', { v: eff.launcher.effort || t('bots.effortDefaultShort') }) : t('bots.harnessDefault');
  return (
    <section className={`mt-bot${off ? ' off' : ''}`} data-role={bot.dict + '-settings'} data-bot={bot.id} data-agent={bot.id}>
      <header className="mt-bot-head" data-set-id={'bot-' + bot.id}>
        <span className="mt-bot-ico"><Icon name={bot.id === 'merge' ? 'git' : 'note'} /></span>
        <div className="mt-bot-title"><b className="mt-bot-name" data-set-anchor={'bot-' + bot.id}>{t('bots.name.' + bot.id)}</b><span className="mt-bot-desc">{t(bot.dict + '.desc')}</span></div>
        {bot.f.mode && <ModeSeg bot={bot} t={t} />}
      </header>
      <StatusLine bot={bot} status={status} settings={settings} onGo={onGo} t={t} />
      <div className="mt-set-grid mt-bot-grid">
        {bot.f.kind && <SetRow as="div" dim={off} name={t('bots.launcher')} hint={launcherHint} role={bot.dict + '-launcher-setting'}>
          <select className="mt-set-select" data-field={'bot-launcher-' + bot.id} value={eff.launcher ? 'l:' + eff.launcher.id : 'h:' + kind} onChange={(e) => onPick(e.target.value)}>
            {picks.length > 0 && <optgroup label={t('bots.launchers')}>{picks.map((l) => <option key={l.id} value={'l:' + l.id}>{l.name}</option>)}</optgroup>}
            <optgroup label={t('bots.harnesses')}>{harnessPicks(harnesses, allowed, kind).map((h) => <option key={h} value={'h:' + h}>{hname(h)}</option>)}</optgroup>
          </select>
        </SetRow>}
      </div>
      <div className="mt-bot-folds">
        <button type="button" className="mt-bot-fold" data-action="bot-advanced" aria-expanded={adv} onClick={() => setAdv(!adv)}>{adv ? '▾' : '▸'} {t('bots.advanced')}</button>
        {bot.id === 'merge' && configs && <button type="button" className="mt-bot-fold" data-action="bot-repos" aria-expanded={repos} onClick={() => setRepos(!repos)} data-set-id="bot-merge-repos"><span data-set-anchor="bot-merge-repos">{repos ? '▾' : '▸'} {t('bots.repos')}</span><span className="dim"> {repoCount}</span></button>}
      </div>
      {adv && <div className="mt-set-grid mt-bot-adv" data-role="bot-advanced">
        {mc && mc.show && <SetRow as="div" name={t('bots.modelOver')} hint={eff.launcher ? t('bots.overHint') : t(bot.dict + '.modelHint')} role={bot.dict + '-model-setting'}>
          {mc.free
            ? <TextCell value={bot.f.model.value} placeholder={baseModel} field={'setting-' + bot.f.model.key} onSave={(v) => setOver(bot.f.model, v)} />
            : <select className="mt-set-select" data-field={'setting-' + bot.f.model.key} value={bot.f.model.value} onChange={(e) => setOver(bot.f.model, e.target.value)}>
                <option value="">{baseModel}</option>
                {mc.list.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>}
        </SetRow>}
        {ec && ec.show && <SetRow as="div" name={t('bots.effortOver')} hint={eff.launcher ? t('bots.overHint') : t(bot.dict + '.effortHint')} role={bot.dict + '-effort-setting'}>
          <select className="mt-set-select" data-field={'setting-' + bot.f.effort.key} value={bot.f.effort.value} onChange={(e) => setOver(bot.f.effort, e.target.value)}>
            <option value="">{baseEffort}</option>
            {ec.list.filter((o) => o).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </SetRow>}
        {perm && <SetRow as="div" name={t('agents.field.permission')} hint={t(bot.dict + '.permissionHint')} role={bot.dict + '-permission-setting'}>
          <select className="mt-set-select" data-field={'setting-' + bot.f.permission.key} value={bot.f.permission.value} onChange={(e) => field(bot.f.permission, e.target.value)}>{bot.f.permission.options.map((o) => <option key={o || 'inherit'} value={o}>{o || t('agents.permissionInherit')}</option>)}</select>
        </SetRow>}
        {perHour && <PerHour t={t} settings={settings} />}
        {bot.id === 'todoTidy' && 'autoDecisions' in settings && <SetRow id="autoDecisions" name={t('bots.autoCards')} hint={t('bots.autoCardsHint')} role="auto-decision-setting">
          <Toggle checked={settings.autoDecisions !== false} field="setting-autoDecisions" onChange={async (v) => { try { await api.call('settings.set', { key: 'autoDecisions', value: v }); toast(v ? t('autoDecisions.setOn') : t('autoDecisions.setOff')); } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); } }} />
        </SetRow>}
        {problem && <SetRow as="div" name={t('bots.lastProblem')} hint={problem.why} role="merger-problem"><span className="dim">{problem.workspace || ''}</span></SetRow>}
        <p className="mt-set-note">{t(bot.dict + '.modeNote')}</p>
      </div>}
      {repos && bot.id === 'merge' && <MergeRepos configs={configs} reload={reloadConfigs} mode={bot.f.mode ? bot.f.mode.value : 'ask'} t={t} />}
    </section>
  );
}

// 할 일 정리 봇의 시간당 상한(판 설정 todoTidyPerHour). 넘으면 규칙만 쓴다
function PerHour({ t, settings }) {
  const [v, setV] = useState(null);
  const save = async () => {
    if (v == null || v === '') return;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 600) { toast(t('todoTidy.bad.perHour'), 'error'); setV(null); return; }
    try { await api.call('settings.set', { key: 'todoTidyPerHour', value: n }); toast(t('todoTidy.perHourSet', { n })); } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); }
    setV(null);
  };
  return <SetRow id="todoTidyPerHour" name={t('todoTidy.perHour')} hint={t('todoTidy.perHourHint')} role="todoTidy-perHour-setting">
    <input type="number" className="mt-set-num" min={0} max={600} data-field="setting-todoTidyPerHour" value={v ?? settings.todoTidyPerHour} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
  </SetRow>;
}

export function BotsTab({ settings, table, onClose }) {
  const t = useT();
  const [status, setStatus] = useState(null);
  const [configs, setConfigs] = useState(null);
  const load = () => api.call('bots.status').then(setStatus).catch(() => setStatus(null)); // 옛 판이면 없다: 설정 값만으로 켬·끔
  const loadConfigs = () => api.call('merger.configs').then(setConfigs).catch(() => setConfigs(null));
  useEffect(() => {
    load(); loadConfigs();
    const iv = setInterval(load, 5000); // 탭이 열린 동안만(가볍게)
    const off = api.on('merger.updated', () => load());
    const off2 = api.on('merger.answered', () => loadConfigs());
    return () => { clearInterval(iv); off(); off2(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onGo = (id) => { const nav = getState().navigateTo; if (nav) { nav(id, { focusTerminal: true }); if (onClose) onClose(); } };
  const list = botsOf(table, settings);
  return (
    <div className="mt-bots" data-role="bots-settings">
      {list.map((b) => <BotCard key={b.id} bot={b} settings={settings} status={status} configs={configs} reloadConfigs={loadConfigs} onGo={onGo} />)}
    </div>
  );
}
