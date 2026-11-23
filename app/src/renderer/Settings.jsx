// 설정(ARCH 4절 I7, P6c): 트레이 상주, 가지 펼치기 상한(P8), 보관 기간과 리포 스스로 찾기(P10), 새 세션 기본값. 켜면 창을 닫아도 앱이 트레이에 남아 OS 알림을 계속 띄운다(Electron main tray.mjs).
// 판 기록에 두므로(settings.set) atrium settings와 같은 값이다. 바꾸면 settings.updated로 main과 창이 함께 따른다.
// P16: 화면 언어(영어 기본, 한국어). 고르면 창을 다시 읽지 않고 곧바로 바뀐다. 글은 사전(locales/)에 있다.
// P45: 일반 탭에 화면 배율과 터미널 글자 배율(이 창의 localStorage, lib/scale.js).
// P28: 스크롤 없이 한 화면에 들어가게 탭으로 나눴다(일반, 호출자, 잠재우기, 가지 펼치기, 보관과 리포 찾기).
//   P33: 옛 새 세션 기본값 두 탭은 호출자 탭(Launchers.jsx) 하나가 대신한다.
//   줄마다 이름·값·풀이 세 칸(styles.css .mt-set-grid)이고, 체크 상자도 값 칸에 둔다. 긴 풀이는 탭 위 한 단락(.mt-set-note). 아래 텍스트 로고는 뺐다.
// P338: 위 가로 탭 → 왼쪽 세로 목록(주제 묶음, lib/settings-nav.js)과 맨 위 설정 찾기. 줄은 이름 · 컨트롤 · 한 줄 풀이이고 긴 글은 ⓘ(누르면 펼침).
//   딸린 칸은 들여쓰고 부모가 꺼지면 흐리다(rowState). 쪽 이름은 옛 data-tab과 같다. 옛 일반 탭의 사용량·목표 알림은 "알림·사용량", 성능 기록은 "개발",
//   자동 결정 카드는 봇 › 할 일 정리 봇 카드로 옮겼다. 설정 값과 저장(settings.set)은 그대로다.
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, toast, setTermScale, setUiScale } from './store.js';
import { pctOf, parsePct, stepScale, SCALE_MIN, SCALE_MAX, SCALE_STEP } from './lib/scale.js'; // P45
import { useT, errText, setLanguage, getLanguage, LANGUAGES } from './lib/i18n.js';
import { LaunchersTab } from './Launchers.jsx'; // P33: 호출자 탭
import { DevicesTab } from './WebDevices.jsx'; // P48: 연결된 기기(웹 화면)
import { useDialog } from './dialog.js'; // P52
import { UpdateSettings } from './Update.jsx'; // P69: 업데이트 묶음
import { LIGHT_MODES, workLightOf, applyWorkLight } from './lib/work-light.js'; // P107: 작업 중 테두리 빛
import { TerminalTab } from './Terminal.jsx'; // P117: 터미널 백엔드와 옮기기
import { BotsTab } from './Bots.jsx'; // P338: 봇 탭(옛 P313 에이전트 탭)
import { settingsTabOf } from './lib/agents.js'; // P313
import { botsOf } from './lib/bots.js'; // P338
import { navOf, pagesOf, pageOf, pageLabel, groupLabel, pageDesc, PAGE_ICON, searchItems, rowState } from './lib/settings-nav.js';
import { Icon } from './lib/icons.jsx'; // P338: 왼쪽 목록·찾기·딸린 칸

// 한 줄: 이름, 값, 풀이(짧은 글). 이름을 누르면 값 칸의 입력에 초점이 간다(label)
// P338: id(찾기가 데려가는 자리), info(ⓘ를 누르면 아래에 펼치는 긴 글), child·dim(딸린 칸의 들여쓰기·흐려짐). as='div'는 단추 묶음 줄(label이면 첫 단추가 눌린다)
export function SetRow({ name, hint, children, role, id, info, child = false, dim = false, as = 'label' }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const Tag = as;
  const long = typeof hint === 'string' && hint.length > 84; // 두 줄에 다 보이지 않을 풀이는 ⓘ로 펼쳐 읽는다
  const more = info || long;
  return <>
    <Tag className={`mt-set-row${child ? ' child' : ''}${dim ? ' dim' : ''}`} data-role={role} data-set-id={id}>
      <span className="mt-set-name" data-set-anchor={id}>{name}</span>
      <span className="mt-set-value">{children}</span>
      <span className="mt-set-hint">
        <span className="mt-set-hint-text" title={typeof hint === 'string' ? hint : undefined}>{hint}</span>
        {more && <button type="button" className={`mt-set-info${open ? ' on' : ''}`} data-action="set-info" aria-expanded={open} title={t('setNav.info')} aria-label={t('setNav.info')} onClick={(e) => { e.preventDefault(); setOpen(!open); }}>i</button>}
      </span>
    </Tag>
    {more && open && <p className={`mt-set-note open${child ? ' child' : ''}`} data-role="set-info-text">{long && hint}{long && info ? ' ' : ''}{info}</p>}
  </>;
}
// P338: 긴 풀이 단락은 한 줄로 접어 두고 누르면 펼친다
export function SetNote({ children }) {
  const [open, setOpen] = useState(false);
  return <p className={`mt-set-note fold${open ? ' open' : ''}`} data-role="set-note" role="button" tabIndex={0} aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}>{children}</p>;
}
export const SetSub = ({ children }) => <div className="mt-set-sub">{children}</div>;
// 체크 상자 하나와 켜짐·꺼짐 글
export function Toggle({ checked, onChange, field }) {
  const t = useT();
  return <span className="mt-set-toggle"><input type="checkbox" checked={checked} data-field={field} onChange={(e) => onChange(e.target.checked)} /><span>{checked ? t('settings.on') : t('settings.off')}</span></span>;
}

// P16: 화면 언어. 이름은 그 언어 자체로 보인다
const LANGUAGE_NAME = { en: 'English', ko: '한국어' };
function LanguageSetting({ settings }) {
  const t = useT();
  const value = (settings && settings.language) || getLanguage();
  const pick = async (lang) => {
    setLanguage(lang); // 백엔드 확인(settings.updated)을 기다리지 않고 곧바로
    try { await api.call('settings.set', { key: 'language', value: lang }); } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); }
  };
  return (
    <SetRow as="div" id="language" role="language-setting" name={t('settings.language')} hint={t('settings.languageHint')}>
      <span className="mt-seg-lang" data-field="setting-language" data-value={value} role="radiogroup">
        {LANGUAGES.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={value === l} className={`mt-btn small${value === l ? ' primary' : ' ghost'}`} data-lang={l} onClick={() => value !== l && pick(l)}>{LANGUAGE_NAME[l]}</button>
        ))}
      </span>
    </SetRow>
  );
}

// P45: 터미널 글자 배율과 화면 배율. 이 창에만 둔다(판 설정이 아니다). −·+는 5%씩, 칸에 백분율을 적고 Enter. 바꾸면 곧바로 보인다
function ScaleSetting({ kind }) {
  const t = useT();
  const value = useStore((st) => (kind === 'term' ? st.termScale : st.uiScale));
  const [text, setText] = useState(null);
  const set = kind === 'term' ? setTermScale : setUiScale;
  const field = kind === 'term' ? 'termScale' : 'uiScale';
  const apply = () => { if (text == null) return; const f = parsePct(text); if (f != null) set(f); setText(null); };
  return (
    <SetRow as="div" id={field} role={`${field}-setting`} name={t(`scale.${kind}Name`)} hint={t(`scale.${kind}Hint`, { min: SCALE_MIN * 100, max: SCALE_MAX * 100 })}>
      {/* P60: −·값·+를 판 단추 높이(30px)의 한 덩어리로. 브라우저 스핀 단추는 숨기고(styles.css .mt-nospin), 뒤 단추는 100%로 되돌리기 */}
      <span className="mt-scale">
        <span className="mt-stepper">
          <button type="button" className="mt-stepper-btn" data-action={`${field}-down`} disabled={value <= SCALE_MIN} title={t('scale.down')} aria-label={t('scale.down')} onClick={() => set(stepScale(value, -1))}>−</button>
          <input type="number" inputMode="numeric" className="mt-scale-num mt-nospin" min={SCALE_MIN * 100} max={SCALE_MAX * 100} step={SCALE_STEP * 100} data-field={`setting-${field}`} data-value={pctOf(value)} aria-label={t(`scale.${kind}Name`)}
            value={text ?? pctOf(value)} onChange={(e) => setText(e.target.value)} onBlur={apply} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }} />
          <span className="mt-scale-pct">%</span>
          <button type="button" className="mt-stepper-btn" data-action={`${field}-up`} disabled={value >= SCALE_MAX} title={t('scale.up')} aria-label={t('scale.up')} onClick={() => set(stepScale(value, 1))}>+</button>
        </span>
        <button type="button" className="mt-btn ghost mt-scale-reset" data-action={`${field}-reset`} disabled={value === 1} title={t('settingsP60.scaleResetTitle')} onClick={() => set(1)}>{t('settingsP60.scaleReset')}</button>
      </span>
    </SetRow>
  );
}

// P107: 작업 중 테두리 빛(판 노드 둘레와 미션 맵 카드 테두리를 따라 도는 빛). 켬(기본) / Windows 설정 따름 / 끔. 판 설정이라 휴대폰도 따른다.
// 누르면 백엔드 확인(settings.updated)을 기다리지 않고 곧바로 문서 뿌리에 적고, 저장이 실패하면 되돌린다
function WorkLightSetting({ settings }) {
  const t = useT();
  const [pending, setPending] = useState(null);
  const value = pending ?? workLightOf(settings);
  const pick = async (mode) => {
    setPending(mode);
    applyWorkLight({ workLight: mode });
    try { await api.call('settings.set', { key: 'workLight', value: mode }); } catch (e) { applyWorkLight(settings); toast(t('settings.saveFailed', { error: errText(e) }), 'error'); }
    setPending(null);
  };
  return (
    <SetRow as="div" id="workLight" role="work-light-setting" name={t('workLight.name')} hint={t('workLight.hint')} info={t('workLight.note')}>
      <span className="mt-seg-lang" data-field="setting-workLight" data-value={value} role="radiogroup" aria-label={t('workLight.name')}>
        {LIGHT_MODES.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={value === m} className={`mt-btn small${value === m ? ' primary' : ' ghost'}`} data-light={m} onClick={() => value !== m && pick(m)}>{t(`workLight.${m}`)}</button>
        ))}
      </span>
    </SetRow>
  );
}

// P146: 성능 기록(진단 스위치). 판 설정이라 이 판에 붙은 창·웹이 모두 모은다. 10분 뒤 백엔드가 저절로 끈다(backend perf-trace.mjs)
function PerfTraceSetting({ settings }) {
  const t = useT();
  const set = async (value) => {
    try { await api.call('settings.set', { key: 'perfTrace', value }); toast(value ? t('perfTrace.on') : t('perfTrace.off')); } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); }
  };
  return <SetRow id="perfTrace" name={t('perfTrace.name')} hint={t('perfTrace.hint')} info={t('perfTrace.note')} role="perf-trace-setting"><Toggle checked={!!settings.perfTrace} onChange={set} field="setting-perfTrace" /></SetRow>;
}

// P211: 구독 사용량 90% 알림(판 설정). 끄면 백엔드가 usage.alert를 보내지 않는다
function UsageAlertSetting({ settings }) {
  const t = useT();
  const set = async (value) => {
    try { await api.call('settings.set', { key: 'usageAlerts', value }); toast(value ? t('usage.alertsSetOn') : t('usage.alertsSetOff')); } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); }
  };
  return <SetRow id="usageAlerts" name={t('usage.alertsName')} hint={t('usage.alertsHint')} role="usage-alert-setting"><Toggle checked={settings.usageAlerts !== false} onChange={set} field="setting-usageAlerts" /></SetRow>;
}

// P314: 사용량 직접 묻기(판 설정 usageProbe·usageProbeMin·usageHermes). 값이 낡으면 하네스의 사용량 명령으로 묻는다(백엔드 usage-probe.mjs)
function UsageProbeSetting({ settings }) {
  const t = useT();
  const [min, setMin] = useState(null);
  const save = async (key, value, msg) => {
    try { await api.call('settings.set', { key, value }); setMin(null); toast(msg); } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); }
  };
  const saveMin = () => { if (min != null && min !== '') save('usageProbeMin', Number(min), t('usageProbe.minSet', { n: Number(min) })); };
  const on = settings.usageProbe !== false;
  return <>
    <SetRow id="usageProbe" name={t('usageProbe.name')} hint={t('usageProbe.hint')} role="usage-probe-setting"><Toggle checked={on} onChange={(v) => save('usageProbe', v, v ? t('usageProbe.setOn') : t('usageProbe.setOff'))} field="setting-usageProbe" /></SetRow>
    {'usageProbeMin' in settings && <SetRow id="usageProbeMin" {...rowState('usageProbeMin', settings)} name={t('usageProbe.minName')} hint={t('usageProbe.minHint')} role="usage-probe-min-setting">
      <input type="number" className="mt-set-num" min={2} max={240} data-field="setting-usageProbeMin" value={min ?? settings.usageProbeMin} onChange={(e) => setMin(e.target.value)} onBlur={saveMin} onKeyDown={(e) => { if (e.key === 'Enter') saveMin(); }} />
    </SetRow>}
    {'usageHermes' in settings && <SetRow id="usageHermes" {...rowState('usageHermes', settings)} name={t('usageProbe.hermesName')} hint={t('usageProbe.hermesHint')} role="usage-hermes-setting"><Toggle checked={!!settings.usageHermes} onChange={(v) => save('usageHermes', v, v ? t('usageProbe.hermesSetOn') : t('usageProbe.hermesSetOff'))} field="setting-usageHermes" /></SetRow>}
  </>;
}

// P306: 사람이 목표 레인을 바꾸면 그 레인의 관리자에게 알리는 때(판 설정 planNotify: next 다음 메시지와 | now 곧바로 | off)
const PLAN_NOTIFY = ['next', 'now', 'off'];
function PlanNotifySetting({ settings }) {
  const t = useT();
  const [pending, setPending] = useState(null);
  const value = pending ?? (PLAN_NOTIFY.includes(settings.planNotify) ? settings.planNotify : 'next');
  const pick = async (mode) => {
    setPending(mode);
    try { await api.call('settings.set', { key: 'planNotify', value: mode }); toast(t('plan.notifySet', { mode: t(`plan.notify.${mode}`) })); } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); }
    setPending(null);
  };
  return (
    <SetRow as="div" id="planNotify" role="plan-notify-setting" name={t('plan.notifyName')} hint={t('plan.notifyHint')}>
      <span className="mt-seg-lang" data-field="setting-planNotify" data-value={value} role="radiogroup" aria-label={t('plan.notifyName')}>
        {PLAN_NOTIFY.map((m) => <button key={m} type="button" role="radio" aria-checked={value === m} className={`mt-btn small${value === m ? ' primary' : ' ghost'}`} data-mode={m} onClick={() => value !== m && pick(m)}>{t(`plan.notify.${m}`)}</button>)}
      </span>
    </SetRow>
  );
}

// 일반: 화면(언어, 배율 P45, 작업 중 테두리 빛 P107), 앱(트레이 상주, 업데이트 P69)
function GeneralTab({ settings }) {
  const t = useT();
  const [pending, setPending] = useState(null); // 누른 값(백엔드가 settings.updated로 확정할 때까지 먼저 보인다)
  const set = async (value) => {
    setPending(value);
    try { await api.call('settings.set', { key: 'tray', value }); toast(value ? t('settings.trayOn') : t('settings.trayOff')); } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); }
    setPending(null);
  };
  return (
    <div className="mt-set-grid" data-role="general-settings">
      <SetSub>{t('setNav.sub.screen')}</SetSub>
      <LanguageSetting settings={settings} />
      <ScaleSetting kind="ui" />
      <ScaleSetting kind="term" />
      {settings && <>
        <WorkLightSetting settings={settings} />
        <SetSub>{t('setNav.sub.app')}</SetSub>
        <SetRow id="tray" name={t('settings.trayName')} hint={t('settings.tray')} info={t('settings.trayNote')} role="tray-setting"><Toggle checked={pending ?? !!settings.tray} onChange={set} field="setting-tray" /></SetRow>
        {'updateCheck' in settings && <UpdateSettings settings={settings} />}
      </>}
    </div>
  );
}

// P338: 알림·사용량(옛 일반 탭에서 옮김): 사용량 알림(P211), 사용량 직접 묻기(P314)와 딸린 칸, 목표 레인 알림(P306)
function AlertsTab({ settings }) {
  const t = useT();
  return (
    <div className="mt-set-grid" data-role="alerts-settings">
      <SetSub>{t('setNav.sub.usage')}</SetSub>
      {'usageAlerts' in settings && <UsageAlertSetting settings={settings} />}
      {'usageProbe' in settings && <UsageProbeSetting settings={settings} />}
      {'planNotify' in settings && <><SetSub>{t('setNav.sub.goals')}</SetSub><PlanNotifySetting settings={settings} /></>}
    </div>
  );
}

// P338: 개발(진단): 성능 기록(P146)
function DevTab({ settings }) {
  return <div className="mt-set-grid" data-role="dev-settings">{'perfTrace' in settings && <PerfTraceSetting settings={settings} />}</div>;
}

// P10: 보관 기간(0이면 저절로 보관 끔)과 리포 스스로 찾기
function RecallSettings({ settings, schema }) {
  const t = useT();
  const [days, setDays] = useState(null);
  const save = async (key, value) => { try { await api.call('settings.set', { key, value }); setDays(null); toast(key === 'archiveDays' ? (Number(value) ? t('settings.archiveDaysSet', { n: value }) : t('settings.archiveOff')) : value ? t('settings.autoOpenOn') : t('settings.autoOpenOff')); } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); } };
  const sc = (schema && schema.archiveDays) || { min: 0, max: 365, default: 14 };
  return (
    <div className="mt-set-grid" data-role="recall-settings">
      <SetRow id="archiveDays" name={t('settings.archiveDays')} hint={t('settings.archiveDaysHint', { n: sc.default })} info={t('settings.archiveDaysNote')}>
        <input type="number" className="mt-set-num" min={sc.min} max={sc.max} data-field="setting-archiveDays" value={days ?? settings.archiveDays} onChange={(e) => setDays(e.target.value)} onBlur={() => days != null && days !== '' && save('archiveDays', Number(days))} onKeyDown={(e) => { if (e.key === 'Enter' && days != null && days !== '') save('archiveDays', Number(days)); }} />
      </SetRow>
      <SetRow id="autoOpenRepos" name={t('settings.autoOpenName')} hint={t('settings.autoOpen')} info={t('settings.autoOpenNote')}><Toggle checked={!!settings.autoOpenRepos} onChange={(v) => save('autoOpenRepos', v)} field="setting-autoOpenRepos" /></SetRow>
    </div>
  );
}

// P21(D4): 쉬면 잠재우기(분). P111: 리포 전체(sleepAfterMin)와 세션 하나(sessionSleepAfterMin) 두 칸
function SleepMinutes({ settings, schema, k, label, hint, set, off, note }) {
  const t = useT();
  const [v, setV] = useState(null);
  const sc = (schema && schema[k]) || { min: 0, max: 1440, default: 30 };
  const save = async (value) => { try { await api.call('settings.set', { key: k, value }); setV(null); toast(value ? t(set, { n: value }) : t(off)); } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); } };
  return (
    <SetRow id={k} name={t(label)} hint={t(hint, { n: sc.default })} info={note ? t(note) : null}>
      <input type="number" className="mt-set-num" min={sc.min} max={sc.max} data-field={`setting-${k}`} value={v ?? settings[k] ?? sc.default} onChange={(e) => setV(e.target.value)} onBlur={() => v != null && v !== '' && save(Number(v))} onKeyDown={(e) => { if (e.key === 'Enter' && v != null && v !== '') save(Number(v)); }} />
    </SetRow>
  );
}
function SleepSetting({ settings, schema }) {
  const t = useT();
  return (
    <div className="mt-set-grid" data-role="sleep-settings">
      <SleepMinutes settings={settings} schema={schema} k="sleepAfterMin" label="sleep.afterLabel" hint="sleep.afterHint" set="sleep.afterSet" off="sleep.afterOff" note="sleep.afterNote" />
      {settings.sessionSleepAfterMin != null && <SleepMinutes settings={settings} schema={schema} k="sessionSleepAfterMin" label="sessionSleep.afterLabel" hint="sessionSleep.afterHint" set="sessionSleep.afterSet" off="sessionSleep.afterOff" note="sessionSleep.afterNote" />}
    </div>
  );
}

// P338: 왼쪽 목록(lib/settings-nav.js navOf: 있는 설정만, 옛 백엔드면 빠진다)과 설정 찾기
export function SettingsDialog({ onClose, tab: tab0 = null, newLauncher = false }) {
  const t = useT();
  const settings = useStore((st) => st.settings);
  const launchers = useStore((st) => st.launchers);
  const [schema, setSchema] = useState(null);
  const [agents, setAgents] = useState(null); // P313: 판의 보조 에이전트(봇) 표(옛 판이면 없음 → 창의 FALLBACK_AGENTS)
  const [tab, setTab] = useState(pageOf(settingsTabOf(tab0)) || 'general'); // P97: 연 곳이 정한 쪽(레일 + → 런처)
  const [q, setQ] = useState('');
  const [hit, setHit] = useState(null); // 찾기에서 고른 칸 { id, at }
  useEffect(() => { api.call('settings.get').then((r) => { setSchema(r.schema); setAgents(r.agents || null); }).catch((e) => toast(t('settings.saveFailed', { error: errText(e) }), 'error')); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const box = useDialog(onClose); // P52: Esc 닫기는 공용(dialog.js). 열면 상자에 초점, Tab은 안에서 돈다
  const body = useRef(null);
  const nav = navOf(settings, launchers, botsOf(agents, settings).length > 0);
  const pages = pagesOf(nav);
  const cur = pages.includes(tab) ? tab : 'general';
  const results = q.trim() ? searchItems(q, t, pages) : null;
  const go = (r) => { setTab(r.page); setHit({ id: r.id, at: Date.now() }); };
  // 찾기로 고른 칸으로 데려가 잠깐 밝힌다(쪽이 그려진 뒤)
  useEffect(() => {
    if (!hit || !body.current) return undefined;
    let row = null;
    const tm = setTimeout(() => {
      const el = body.current && body.current.querySelector(`[data-set-anchor="${hit.id}"]`);
      row = body.current && body.current.querySelector(`[data-set-id="${hit.id}"]`);
      if (el) el.scrollIntoView({ block: 'center' }); else if (body.current) body.current.scrollTop = 0;
      if (row) row.classList.add('mt-set-flash');
    }, 40);
    const off = setTimeout(() => { if (row) row.classList.remove('mt-set-flash'); }, 1800);
    return () => { clearTimeout(tm); clearTimeout(off); if (row) row.classList.remove('mt-set-flash'); };
  }, [hit, cur]);
  const tabBtn = (p) => <button key={p} type="button" role="tab" aria-selected={cur === p} className={`mt-set-tab${cur === p ? ' on' : ''}`} data-tab={p} onClick={() => { setTab(p); setHit(null); }}><Icon name={PAGE_ICON[p]} /><span>{t(pageLabel(p))}</span></button>;
  return (
    <div className="mt-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="mt-modal mt-settings v2" data-role="settings" data-tab={cur}>
        <h3>{t('settings.title')}</h3>
        <div className="mt-set-shell">
          <nav className="mt-set-nav">
            <div className="mt-set-searchbox"><Icon name="search" />
            <input type="search" className="mt-set-text mt-set-search" data-field="settings-search" value={q} placeholder={t('setNav.search')} title={t('setNav.searchTitle')} aria-label={t('setNav.search')} spellCheck={false}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && results && results[0]) { e.preventDefault(); go(results[0]); } if (e.key === 'Escape' && q) { e.preventDefault(); e.stopPropagation(); setQ(''); } }} />
            </div>
            {results ? (
              <div className="mt-set-results" data-role="settings-search-results">
                {results.length ? results.map((r) => (
                  <button key={r.id} type="button" className={`mt-set-hit${hit && hit.id === r.id ? ' on' : ''}`} data-hit={r.id} data-page={r.page} onClick={() => go(r)}>
                    <b>{r.name}</b><span>{t(pageLabel(r.page))}</span>
                  </button>
                )) : <div className="mt-set-nohit dim">{t('setNav.noHit')}</div>}
              </div>
            ) : (
              <div className="mt-set-tabs" role="tablist" aria-orientation="vertical" data-role="settings-tabs">
                {nav.map((g) => (
                  <div key={g.group} className="mt-set-navgroup" data-group={g.group}>
                    <div className="mt-set-navhead">{t(groupLabel(g.group))}</div>
                    {g.pages.map((p) => tabBtn(p))}
                  </div>))}
              </div>
            )}
          </nav>
          <div ref={body} className="mt-set-body" role="tabpanel" data-page={cur}>
            <header className="mt-set-pagehead"><h4>{t(pageLabel(cur))}</h4><p>{t(pageDesc(cur))}</p></header>
            {!settings && <div className="dim">{t('settings.loading')}</div>}
            {cur === 'general' && <GeneralTab settings={settings} />}
            {cur === 'launchers' && <LaunchersTab startNew={newLauncher} />}
            {settings && cur === 'sleep' && <SleepSetting settings={settings} schema={schema} />}
            {settings && cur === 'recall' && <RecallSettings settings={settings} schema={schema} />}
            {settings && cur === 'alerts' && <AlertsTab settings={settings} />}
            {settings && cur === 'bots' && <BotsTab settings={settings} table={agents} onClose={onClose} />}
            {cur === 'devices' && <DevicesTab />}
            {cur === 'terminal' && <TerminalTab />}
            {settings && cur === 'dev' && <DevTab settings={settings} />}
          </div>
        </div>
        <div className="mt-card-actions"><button className="mt-btn" data-action="settings-close" onClick={onClose}>{t('common.close')}</button></div>
      </div>
    </div>
  );
}
