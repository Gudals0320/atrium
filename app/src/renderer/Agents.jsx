// P313: 설정 › 에이전트 탭. 보드가 쓰는 보조 에이전트(지금은 병합 merger, 다음에 할 일 정리 등)를 같은 꼴의 칸으로 모은다.
// 칸은 판의 보조 에이전트 표(settings.get의 agents, 판 settings.mjs HELPER_AGENTS)를 보고 그린다(lib/agents.js agentsOf). 옛 판이면 창의 FALLBACK_AGENTS.
// 에이전트마다: 이름·한 줄 설명(사전 <dict>.name·desc) → 켬/물어봄/끔 → 하네스 종류 → 모델 → 노력 → 승인 방식(표에 있는 칸만) → 그만의 칸(AGENT_EXTRAS).
// 칸 이름은 공용(agents.field.*), 풀이·알림·잘못된 값 글은 그 에이전트의 사전 묶음(<dict>.modeHint·modeNote·modeSet·…Hint·bad).
// ready가 아닌 에이전트는 숨긴다: 아직 켤 것이 없는 칸을 보이지 않는다. P316: 할 일 정리(켬/끔·하네스 고르기·모델·노력 + 시간당 상한).
import { useState } from 'react';
import { api } from './api.js';
import { toast, useStore } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { agentsOf, agentValueOf } from './lib/agents.js';
import { SetRow, SetNote } from './Settings.jsx';
import { MergerExtras } from './Merger.jsx';

// 에이전트마다 그만의 칸(공용 칸 아래)
const AGENT_EXTRAS = { merge: MergerExtras, todoTidy: TodoTidyExtras };

// P316: 할 일 정리의 그만의 칸 — 시간당 상한(판 설정 todoTidyPerHour). 넘으면 규칙만 쓴다
function TodoTidyExtras() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const [v, setV] = useState(null);
  if (!settings || !('todoTidyPerHour' in settings)) return null;
  const save = async () => {
    if (v == null || v === '') return;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 600) { toast(t('todoTidy.bad.perHour'), 'error'); setV(null); return; }
    try { await api.call('settings.set', { key: 'todoTidyPerHour', value: n }); toast(t('todoTidy.perHourSet', { n })); } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); }
    setV(null);
  };
  return <SetRow name={t('todoTidy.perHour')} hint={t('todoTidy.perHourHint')} role="todoTidy-perHour-setting">
    <input type="number" className="mt-set-num" min={0} max={600} data-field="setting-todoTidyPerHour" value={v ?? settings.todoTidyPerHour} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
  </SetRow>;
}

async function saveField(t, a, f, raw) {
  const v = agentValueOf(f, raw);
  if (v.error) { toast(t(a.dict + '.bad.' + v.error), 'error'); return false; }
  try { await api.call('settings.set', { key: f.key, value: v.value }); return true; } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); return false; }
}

function TextField({ a, f, t }) {
  const [text, setText] = useState(null);
  const done = async () => { if (text == null) return; if (text.trim() !== f.value && (await saveField(t, a, f, text))) toast(t('agents.saved')); setText(null); };
  return <input type="text" className="mt-set-text" data-field={'setting-' + f.key} value={text ?? f.value} placeholder={f.default} spellCheck={false}
    onChange={(e) => setText(e.target.value)} onBlur={done} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } if (e.key === 'Escape') setText(null); }} />;
}

function ModeField({ a, f, t }) {
  const [pending, setPending] = useState(null);
  const mode = pending ?? f.value;
  const pick = async (m) => { setPending(m); if (await saveField(t, a, f, m)) toast(t(a.dict + '.modeSet.' + m)); setPending(null); };
  return <>
    <div className="mt-set-row" data-role={a.dict + '-mode-setting'}>
      <span className="mt-set-name">{t('agents.field.mode')}</span>
      <span className="mt-set-value mt-seg-lang" data-field={'setting-' + f.key} data-value={mode} role="radiogroup" aria-label={t(a.dict + '.name') + ' · ' + t('agents.field.mode')}>
        {f.options.map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} className={`mt-btn small${mode === m ? ' primary' : ' ghost'}`} data-mode={m} onClick={() => mode !== m && pick(m)}>{t(a.dict + '.modes.' + m)}</button>)}
      </span>
      <span className="mt-set-hint">{t(a.dict + '.modeHint')}</span>
    </div>
    <SetNote>{t(a.dict + '.modeNote')}</SetNote>
  </>;
}

function SelectField({ a, f, t, none, label = null }) {
  return <select className="mt-set-select" data-field={'setting-' + f.key} value={f.value} onChange={async (e) => { if (await saveField(t, a, f, e.target.value)) toast(t('agents.saved')); }}>
    {f.options.map((x) => <option key={x || 'none'} value={x}>{x ? (label ? label(x) : x) : none}</option>)}
  </select>;
}

function AgentSection({ a }) {
  const t = useT();
  const Extra = AGENT_EXTRAS[a.id];
  return (
    <section className="mt-agent" data-role={a.dict + '-settings'} data-agent={a.id}>
      <header className="mt-agent-head">
        <b className="mt-agent-name">{t(a.dict + '.name')}</b>
        <span className="mt-agent-desc">{t(a.dict + '.desc')}</span>
      </header>
      <div className="mt-set-grid">
        {a.fields.map((f) => {
          if (f.field === 'mode') return <ModeField key={f.key} a={a} f={f} t={t} />;
          const row = (body) => <SetRow key={f.key} name={t('agents.field.' + f.field)} hint={t(a.dict + '.' + f.field + 'Hint')} role={a.dict + '-' + f.field + '-setting'}>{body}</SetRow>;
          if (f.field === 'kind' && f.options) return row(<SelectField a={a} f={f} t={t} label={(x) => t(a.dict + '.kinds.' + x)} />); // P316: 고를 하네스가 정해진 에이전트(할 일 정리)
          if (f.field === 'kind' || f.field === 'model') return row(<TextField a={a} f={f} t={t} />);
          if (f.field === 'effort') return row(<SelectField a={a} f={f} t={t} none={t('agents.effortNone')} />);
          if (f.field === 'permission') return row(<SelectField a={a} f={f} t={t} none={t('agents.permissionInherit')} />);
          return null;
        })}
        {Extra && <Extra />}
      </div>
    </section>
  );
}

export function AgentsTab({ settings, table }) {
  const t = useT();
  const list = agentsOf(table, settings);
  return (
    <div className="mt-agents" data-role="agents-settings">
      <SetNote>{t('agents.note')}</SetNote>
      {list.map((a) => <AgentSection key={a.id} a={a} />)}
    </div>
  );
}
