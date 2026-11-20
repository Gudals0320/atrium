// P268: 합치기 merger의 창 쪽(판 쪽 P267 merger.mjs, 계약은 판 API merger.*와 설정 mergerMode·mergerKind·mergerModel·mergerEffort).
// - 설정 › 합치기 탭(MergerTab): 켬 / 물어봄 / 끔, merger의 종류·모델·노력, 프로젝트마다 기억한 답(다시 묻기)
// - 사람에게 묻는 카드(MergerAskCards): 설정이 물어봄이고 그 프로젝트에 답이 없을 때 판이 낸 물음(merger.ask). 워크스페이스마다 한 번, 답은 merger.answer로 판이 기억한다.
//   PC 창은 위쪽 가운데(허락 요청 카드와 같은 자리·생김새), 휴대폰은 세션 맵 머리 아래. 지휘 세션에게는 묻지 않는다(설계 12절 5번)
// - 캔버스의 하위 → merger 선(MergerEdge): 열린 합치기 일의 childId → mergerId(lib/merger.js mergerLines). 보통 연결과 같은 곡선, 색은 합치기(보라 점선)
// - merger 세션 꼬리표(MergerTag): 캔버스 노드 머리, 사이드바 줄, 세션 맵 카드
import { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import { api } from './api.js';
import { useStore, getState, toast, dismissMergerAsk, dropMergerAsk } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { MERGER_MODES, MERGER_EFFORTS, MERGER_DEFAULTS, mergerSettingsOf, mergerValueOf, askCards, askKey, mergerSessionIds } from './lib/merger.js';
import { shifted, linkLabelHidden } from './lib/link-labels.js';
import { labelFit } from './lib/labels.js';
import { SetRow, SetNote } from './Settings.jsx';

// ---------- 설정 탭 ----------
async function saveSetting(t, key, raw) {
  const v = mergerValueOf(key, raw);
  if (v.error) { toast(t('merger.bad.' + v.error), 'error'); return false; }
  try { await api.call('settings.set', { key, value: v.value }); return true; } catch (e) { toast(t('settings.saveFailed', { error: errText(e) }), 'error'); return false; }
}
function TextSetting({ k, value, t }) {
  const [text, setText] = useState(null);
  const done = async () => { if (text == null) return; if (text.trim() !== value && (await saveSetting(t, k, text))) toast(t('merger.saved')); setText(null); };
  return <input type="text" className="mt-set-text" data-field={'setting-' + k} value={text ?? value} placeholder={MERGER_DEFAULTS[k]} spellCheck={false}
    onChange={(e) => setText(e.target.value)} onBlur={done} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } if (e.key === 'Escape') setText(null); }} />;
}
export function MergerTab({ settings }) {
  const t = useT();
  const v = mergerSettingsOf(settings);
  const view = useStore((st) => st.merger);
  const workspaces = useStore((st) => st.workspaces);
  const [pending, setPending] = useState(null);
  if (!v) return <div className="dim">{t('merger.noBoard')}</div>;
  const mode = pending ?? v.mergerMode;
  const pick = async (m) => { setPending(m); if (await saveSetting(t, 'mergerMode', m)) toast(t('merger.modeSet.' + m)); setPending(null); };
  const nameOf = (ws) => { const w = (workspaces || []).find((x) => x.key === ws); return w ? w.name : ws; };
  const answers = view ? Object.entries(view.answers).filter(([, a]) => a === 'on' || a === 'off') : [];
  const forget = async (ws) => { try { await api.call('merger.answer', { workspace: ws, answer: 'ask' }); toast(t('merger.forgot', { name: nameOf(ws) })); } catch (e) { toast(errText(e), 'error'); } };
  return (
    <div className="mt-set-grid" data-role="merger-settings">
      <div className="mt-set-row" data-role="merger-mode-setting">
        <span className="mt-set-name">{t('merger.mode')}</span>
        <span className="mt-set-value mt-seg-lang" data-field="setting-mergerMode" data-value={mode} role="radiogroup" aria-label={t('merger.mode')}>
          {MERGER_MODES.map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} className={`mt-btn small${mode === m ? ' primary' : ' ghost'}`} data-mode={m} onClick={() => mode !== m && pick(m)}>{t('merger.modes.' + m)}</button>)}
        </span>
        <span className="mt-set-hint">{t('merger.modeHint')}</span>
      </div>
      <SetNote>{t('merger.modeNote')}</SetNote>
      <SetRow name={t('merger.kind')} hint={t('merger.kindHint')} role="merger-kind-setting"><TextSetting k="mergerKind" value={v.mergerKind} t={t} /></SetRow>
      <SetRow name={t('merger.model')} hint={t('merger.modelHint')} role="merger-model-setting"><TextSetting k="mergerModel" value={v.mergerModel} t={t} /></SetRow>
      <SetRow name={t('merger.effort')} hint={t('merger.effortHint')} role="merger-effort-setting">
        <select className="mt-set-select" data-field="setting-mergerEffort" value={v.mergerEffort} onChange={async (e) => { if (await saveSetting(t, 'mergerEffort', e.target.value)) toast(t('merger.saved')); }}>
          {MERGER_EFFORTS.map((x) => <option key={x || 'none'} value={x}>{x ? x : t('merger.effortNone')}</option>)}
        </select>
      </SetRow>
      <SetNote>{t('merger.repoNote')}</SetNote>
      {view && view.problem && <div className="mt-set-row" data-role="merger-problem"><span className="mt-set-hint">{t('merger.problem', { name: nameOf(view.problem.workspace) || '?', why: view.problem.why })}</span></div>}
      {answers.length > 0 && <div className="mt-set-row mt-merger-answers" data-role="merger-answers">
        <span className="mt-set-name">{t('merger.answers')}</span>
        <span className="mt-set-value mt-merger-answer-list">
          {answers.map(([ws, a]) => <span key={ws} className="mt-merger-answer" data-ws={ws} data-answer={a}>
            <b>{nameOf(ws)}</b><span className={`mt-merger-answer-v ${a}`}>{t('merger.answer.' + a)}</span>
            <button type="button" className="mt-btn small ghost" data-action="merger-forget" onClick={() => forget(ws)}>{t('merger.askAgain')}</button>
          </span>)}
        </span>
        <span className="mt-set-hint">{t('merger.answersHint')}</span>
      </div>}
    </div>
  );
}

// ---------- 사람에게 묻는 카드 ----------
async function answer(t, card, a) {
  try {
    await api.call('merger.answer', { workspace: card.workspace, answer: a });
    dropMergerAsk(card.workspace);
    toast(t(a === 'on' ? 'merger.card.onDone' : 'merger.card.offDone', { name: card.workspaceName || card.workspace }));
  } catch (e) { toast(t('merger.card.fail', { error: errText(e) }), 'error'); }
}
function AskCard({ card, phone }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const go = async (a) => { setBusy(true); await answer(t, card, a); setBusy(false); };
  const vars = { child: card.child || '?', branch: card.branch || '?', target: card.target || '?', name: card.workspaceName || card.workspace };
  return (
    <div className={`mt-merger-ask${phone ? ' phone' : ''}`} data-role="merger-ask" data-ws={card.workspace} data-at={card.at || 0}>
      <div className="mt-merger-ask-head"><span className="mt-merger-ask-ws">{vars.name}</span><b>{t('merger.card.title')}</b></div>
      <p className="mt-merger-ask-body">{t('merger.card.body', vars)}</p>
      <p className="mt-merger-ask-note dim">{t('merger.card.sentNote')}</p>
      <div className="mt-merger-ask-actions">
        <button type="button" className="mt-btn small primary" disabled={busy} data-action="merger-on" onClick={() => go('on')}>{t('merger.card.on')}</button>
        <button type="button" className="mt-btn small" disabled={busy} data-action="merger-off" onClick={() => go('off')}>{t('merger.card.off')}</button>
        <button type="button" className="mt-btn small ghost" disabled={busy} data-action="merger-later" onClick={() => dismissMergerAsk(askKey(card))}>{t('merger.card.later')}</button>
      </div>
    </div>
  );
}
export function MergerAskCards({ phone = false }) {
  const view = useStore((st) => st.merger);
  const dismissed = useStore((st) => st.mergerDismissed);
  const cards = askCards(view, dismissed);
  if (!cards.length) return null;
  return <div className={phone ? 'mt-merger-asks phone' : 'mt-merger-asks'} data-role="merger-asks">{cards.map((c) => <AskCard key={askKey(c)} card={c} phone={phone} />)}</div>;
}

// ---------- 캔버스의 하위 → merger 선 ----------
export function MergerEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const t = useT();
  const [path, lx0, ly0] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const [lx, ly] = shifted(lx0, ly0, data);
  const fit = labelFit(data);
  if (!data) return null;
  const st = data.state || 'queued';
  const label = t('merger.line.' + (['merging', 'queued', 'failed', 'merged'].includes(st) ? st : 'queued'), { branch: data.branch || '?', target: data.target_branch || '?' });
  const title = t('merger.line.title', { child: data.child || '?', merger: data.merger || '?', branch: data.branch || '?', target: data.target_branch || '?' });
  const hidden = fit.compact || linkLabelHidden(data, { x: lx, y: ly });
  return <>
    <BaseEdge id={id} path={path} className={`mt-edge merge st-${st}${st === 'merging' ? ' active' : ''}`} interactionWidth={0} />
    <circle className="mt-edge-end merge" cx={sourceX} cy={sourceY} r={4.5} />
    <circle className="mt-edge-end merge" cx={targetX} cy={targetY} r={4.5} />
    {!hidden && <EdgeLabelRenderer>
      <div className={`mt-edge-label merge st-${st} nodrag nopan`} style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, '--fitw': `${fit.maxWidth}px` }}
        data-role="merger-line" data-edge={id} data-state={st} data-unit={data.unit} title={title}
        onClick={(e) => { e.stopPropagation(); const nav = getState().navigateTo; if (nav) nav(data.target); }}>
        <span className="mt-edge-tag merge">{t('merger.tag')}</span>
        <span className="mt-edge-text">{label}</span>
        {data.n > 1 && <span className="mt-edge-more">+{data.n - 1}</span>}
      </div>
    </EdgeLabelRenderer>}
  </>;
}

// ---------- merger 세션 꼬리표 ----------
export function useMergerOf(sessionId) {
  return useStore((st) => (st.merger ? mergerSessionIds(st.merger).get(sessionId) || null : null));
}
export function MergerTag({ s, className = 'mt-merger-tag' }) {
  const t = useT();
  const m = useMergerOf(s && s.sessionId);
  if (!m) return null;
  return <span className={className} data-role="merger-tag" title={t('merger.tagTitle', { target: m.target || '?', jobs: m.jobs || 0, max: m.jobsMax || 5 })}>{t('merger.tag')}</span>;
}
