// P321: 빠른 워크트리 세션(설계 P318 4.1·4.2, 시안 shots 01·02·04). 판 빈 곳 우클릭 메뉴, 영역 이름표 메뉴의 "워크트리 세션…", 리포 영역 위 단축키 W로
//   누른 자리 옆에 작은 떠 있는 상자(빠른 창)를 연다. 이름(자동, 바꿀 수 있음), 하네스(기본 런처), 첫 지시(비우면 띄우기만), "@<head>와 동료로 잇기"(판정, 바꾸기),
//   브랜치·자리 미리 보기, 띄우기(Enter)·취소(Esc). 판 API session.worktree(backend/src/worktree-session.mjs).
// - 병합 맡기기(설계 4.4, S5): 워크트리 브랜치에서 일하는 세션의 카드 ⋯ 메뉴와 사이드바 줄 메뉴. 판 API merge.request.
// 상태는 이 파일의 작은 저장소(메뉴 하나, 빠른 창 하나)다. 판 전체 상태(store.js)는 건드리지 않는다.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api.js';
import { getState, useStore, toast, openDialog, selectWorkspace, noteWorkspace, goWhenOpen } from './store.js';
import { useT, t, errText } from './lib/i18n.js';
import { orderedLaunchers, favoriteLaunchers } from './lib/launchers.js';
import { devModel } from './SpawnDialog.jsx';
import { arrangeWorkspace } from './Regions.jsx';
import { headCandidates, nextHead, paneMenuItems, mergerIdsOf, nameIssue, nameFromPrompt, wtBranch, wtRel, canAskMerge, discardChoices, discardBlock } from './lib/quick-worktree.js';

// ---------- 작은 저장소 ----------
let q = { menu: null, quick: null, discard: null }; // menu: { x, y, wsKey|null }, quick: { x, y, wsKey }, discard(P325): { sessionId, name }
const subs = new Set();
const set = (patch) => { q = { ...q, ...patch }; for (const f of subs) f(); };
const useQ = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => q);
export function openPaneMenu(x, y, wsKey) { set({ menu: { x, y, wsKey: wsKey || null }, quick: null }); }
export function openQuickWorktree(x, y, wsKey) {
  const w = getState().workspaces.find((v) => v.key === wsKey);
  if (!w) return false;
  if (w.kind !== 'repo') { toast(t('quickWt.repoOnly'), 'error'); return false; }
  set({ quick: { x, y, wsKey }, menu: null });
  return true;
}
const closeAll = () => set({ menu: null, quick: null });

// 화면 안에 들어오게 자리 맞추기(누른 자리 옆)
function useFit(at, box) {
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!box.current || !at) return;
    const r = box.current.getBoundingClientRect();
    setPos({ left: Math.max(4, Math.min(window.innerWidth - r.width - 4, at.x)), top: Math.max(4, Math.min(window.innerHeight - r.height - 4, at.y)) });
  }, [at && at.x, at && at.y]);
  return pos || { left: -9999, top: -9999 };
}
function useOutside(box, close) {
  useEffect(() => {
    const down = (e) => { if (box.current && !box.current.contains(e.target)) close(); };
    window.addEventListener('mousedown', down, true);
    return () => window.removeEventListener('mousedown', down, true);
  }, [close]);
}

// ---------- 빈 곳 메뉴(시안 01) ----------
function PaneMenu({ at }) {
  const t = useT();
  const box = useRef(null);
  const w = useStore((st) => (at.wsKey ? st.workspaces.find((x) => x.key === at.wsKey) : null));
  const pos = useFit(at, box);
  useOutside(box, closeAll);
  useEffect(() => { const key = (e) => { if (e.key === 'Escape') closeAll(); }; window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true); }, []);
  const m = paneMenuItems(w);
  const run = (a) => {
    if (a === 'worktree') { openQuickWorktree(at.x, at.y, w.key); return; }
    closeAll();
    if (a === 'ws-open') openDialog({ kind: 'wsopen' });
    else if (a === 'spawn') { noteWorkspace(w.key); openDialog({ kind: 'spawn', cwd: w.root }); }
    else if (a === 'arrange') arrangeWorkspace(w.key);
    else if (a === 'fit') selectWorkspace(w.key);
  };
  return createPortal(
    <div ref={box} className="mt-sb2-menu mt-pane-menu" data-role="pane-menu" data-ws={w ? w.key : ''} style={pos} onContextMenu={(e) => e.preventDefault()}>
      {m.head && <div className="mt-sb2-mh" title={w.root}>{m.head}</div>}
      {m.items.map((it, i) => it.sep ? <div key={'s' + i} className="mt-sb2-msep" /> : (
        <button key={it.action} className={`mt-sb2-mi${it.action === 'worktree' ? ' mt-pane-strong' : ''}`} data-action={'pane-' + it.action} disabled={it.disabled}
          title={it.disabled ? t('quickWt.repoOnly') : undefined} onClick={() => run(it.action)}>{t('quickWt.menu.' + it.action)}</button>
      ))}
    </div>,
    document.body,
  );
}

// ---------- 빠른 창(시안 02) ----------
function QuickBox({ at }) {
  const t = useT();
  const box = useRef(null);
  const nameRef = useRef(null);
  const w = useStore((st) => st.workspaces.find((x) => x.key === at.wsKey));
  const sessions = useStore((st) => st.sessions);
  const merger = useStore((st) => st.merger);
  const data = getState().launchers;
  const list = orderedLaunchers(data).filter((l) => l.harness !== 'shell' && l.harness !== 'command');
  const first = favoriteLaunchers(data).find((l) => list.includes(l)) || list[0] || null;
  const cands = headCandidates([...sessions.values()], at.wsKey, { mergerIds: mergerIdsOf(merger) });
  const [lid, setLid] = useState(first ? first.id : '');
  const [name, setName] = useState('');
  const [typed, setTyped] = useState(false); // 사람이 이름을 친 뒤에는 첫 지시로 다시 짓지 않는다
  const [auto, setAuto] = useState('');
  const [prompt, setPrompt] = useState('');
  const [headId, setHeadId] = useState(cands[0] ? cands[0].sessionId : null);
  const [peer, setPeer] = useState(!!cands[0]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const pos = useFit(at, box);
  useOutside(box, closeAll);
  useEffect(() => {
    let live = true;
    api.call('session.worktreePreview', { workspace: at.wsKey }).then((r) => { if (!live || !r || !r.name) return; setAuto(r.name); setName((n) => n || r.name); if (r.hasCommit === false) setProblem('needsCommit'); }).catch(() => {});
    const tm = setTimeout(() => { if (nameRef.current) { nameRef.current.focus(); nameRef.current.select(); } }, 30);
    return () => { live = false; clearTimeout(tm); };
  }, [at.wsKey]);
  const head = cands.find((s) => s.sessionId === headId) || null;
  const taken = [...sessions.values()].flatMap((s) => [s.name, s.address, s.label].filter(Boolean));
  const issue = nameIssue(name, taken);
  const onPrompt = (v) => { setPrompt(v); if (!typed) setName(nameFromPrompt(v) || auto); };
  const go = async () => {
    if (busy || issue || !w) return;
    setBusy(true);
    try {
      const L = list.find((l) => l.id === lid) || null;
      const p = { workspace: at.wsKey, name: name.trim(), ...(L ? { launcher: L.id } : { kind: 'claude' }), ...(prompt.trim() ? { prompt: prompt.trim() } : {}), ...(peer && head ? { peerOf: head.sessionId } : {}) };
      const dm = devModel(L); if (dm) p.model = dm;
      const r = await api.call('session.worktree', p);
      toast(t('quickWt.started', { name: r.name, branch: r.worktree ? r.worktree.branch : wtBranch(name), peer: r.peer ? t('quickWt.startedPeer', { head: r.peer }) : '', gate: r.worktree && r.worktree.gate ? t('quickWt.startedGate') : '' }));
      closeAll();
      goWhenOpen(r.sessionId);
    } catch (e) { toast(t('quickWt.failed', { error: errText(e) }), 'error'); setBusy(false); }
  };
  const onKey = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeAll(); return; }
    if (e.key === 'Enter' && !(e.target.tagName === 'TEXTAREA' && e.shiftKey)) { e.preventDefault(); e.stopPropagation(); go(); }
  };
  const cycle = () => { const n = nextHead(cands, headId); if (n) { setHeadId(n.sessionId); setPeer(true); } };
  const nm = name.trim() || auto;
  return createPortal(
    <div ref={box} className="mt-qwt" role="dialog" aria-labelledby="mt-qwt-title" data-role="quick-worktree" data-ws={at.wsKey} style={pos} onKeyDown={onKey} onContextMenu={(e) => e.preventDefault()}>
      <div className="mt-qwt-title" id="mt-qwt-title">{t('quickWt.title')}</div>
      <label className="mt-qwt-row"><span>{t('quickWt.name')}</span>
        <input ref={nameRef} className={`mt-set-text mono${issue ? ' bad' : ''}`} data-field="qwt-name" value={name} maxLength={32} spellCheck={false} autoComplete="off" aria-invalid={!!issue}
          onChange={(e) => { setName(e.target.value); setTyped(true); }} /></label>
      <label className="mt-qwt-row"><span>{t('quickWt.harness')}</span>
        <select data-field="qwt-launcher" value={lid} onChange={(e) => setLid(e.target.value)}>
          {list.map((l) => <option key={l.id} value={l.id}>{l.favorite ? '★ ' : ''}{l.name}</option>)}
          {!list.length && <option value="">Claude Code</option>}
        </select></label>
      <label className="mt-qwt-row top"><span>{t('quickWt.prompt')}</span>
        <textarea rows={2} data-field="qwt-prompt" value={prompt} placeholder={t('quickWt.promptPh')} onChange={(e) => onPrompt(e.target.value)} /></label>
      {head && <div className="mt-qwt-peer" data-role="qwt-peer">
        <label><input type="checkbox" data-field="qwt-peer" checked={peer} onChange={(e) => setPeer(e.target.checked)} /> {t('quickWt.peer', { head: head.name })}</label>
        {cands.length > 1 && <button type="button" className="mt-qwt-change" data-action="qwt-head" title={t('quickWt.changeTitle')} onClick={cycle}>{t('quickWt.change')}</button>}
      </div>}
      <div className={`mt-qwt-note mono${issue ? ' bad' : ''}`} data-role="qwt-preview">{issue ? t('quickWt.bad.' + issue) : problem ? t('quickWt.needsCommit') : t('quickWt.preview', { branch: wtBranch(nm), path: wtRel(nm) })}</div>
      <div className="mt-qwt-acts">
        <button type="button" className="mt-btn small ghost" data-action="qwt-cancel" onClick={closeAll}>{t('common.cancel')}</button>
        <button type="button" className="mt-btn small primary" data-action="qwt-go" disabled={busy || !!issue || !w} onClick={go}>{busy ? t('quickWt.starting') : t('quickWt.go')}</button>
      </div>
    </div>,
    document.body,
  );
}

// 캔버스가 그린다(Canvas.jsx)
export function QuickLayer() {
  const s = useQ();
  return <>{s.menu && <PaneMenu at={s.menu} />}{s.quick && <QuickBox key={s.quick.wsKey + ':' + s.quick.x + ':' + s.quick.y} at={s.quick} />}{s.discard && <DiscardDialog key={s.discard.sessionId} d={s.discard} />}</>;
}

// ---------- 병합 맡기기(시안 04) ----------
export async function askMerge(s) {
  try {
    const r = await api.call('merge.request', { session: s.sessionId });
    toast(t('quickWt.mergeAsked', { name: r.name, branch: r.branch, target: r.target, to: r.head ? '@' + r.head : t('quickWt.toHuman') }));
    return r;
  } catch (e) {
    toast(e && e.code === 'merger_ask' ? t('quickWt.mergerAsk') : e && e.code === 'merger_off' ? t('quickWt.mergerOff') : t('quickWt.mergeFailed', { error: errText(e) }), 'error');
    return null;
  }
}
// 카드 ⋯ 메뉴의 줄들: 병합 맡기기(미리 본 브랜치 → 합칠 브랜치, 보고 받는 쪽), 관계(동료 head가 있으면)
export function MergeMenuRows({ s, onClose }) {
  const t = useT();
  const merger = useStore((st) => st.merger);
  const ok = canAskMerge(s, mergerIdsOf(merger));
  const [v, setV] = useState(null);
  useEffect(() => { if (!ok) return; let live = true; api.call('merge.request', { session: s.sessionId, dryRun: true }).then((r) => live && setV(r)).catch(() => {}); return () => { live = false; }; }, [ok, s.sessionId]);
  if (!ok) return null;
  const empty = !!(v && v.ahead === 0 && v.dirty === 0); // 합칠 것이 없다(앞선 커밋·변경 없음)
  const hint = empty ? t('quickWt.mergeNothing', { target: v.target || '?' }) : v ? t('quickWt.mergeHint', { branch: v.branch || s.git.branch, target: v.target || '?', to: v.head ? '@' + v.head : t('quickWt.toHuman') }) : t('quickWt.mergeHintShort', { branch: s.git.branch });
  const rel = (relation) => api.call('relation.set', { a: v.headId, b: s.sessionId, relation }).then(() => { onClose(); toast(t('quickWt.relSet', { head: v.head, rel: t('quickWt.rel.' + relation) })); }, (e) => toast(errText(e), 'error'));
  return <>
    <div className="mt-menu-row"><button className="mt-btn small mt-merge-ask" data-action="merge-ask" disabled={!!(v && (v.busy || empty))} onClick={() => { onClose(); askMerge(s); }}>{t('quickWt.mergeAsk')}</button><span className="dim" data-role="merge-hint">{v && v.busy ? t('quickWt.mergeBusy') : hint}</span></div>
    <div className="mt-menu-row"><button className="mt-btn small" data-action="wt-discard" onClick={() => { onClose(); openDiscard(s); }}>{t('wtDiscard.menu')}</button><span className="dim" data-role="discard-hint">{t('wtDiscard.hint')}</span></div>{/* P325 */}
    {v && v.head && <div className="mt-menu-row" data-role="peer-row"><button className="mt-btn small" data-action="peer-show" onClick={() => { onClose(); const st = getState(); if (st.navigateTo) st.navigateTo(v.headId, { viewOnly: true }); }}>{t('quickWt.relNow', { head: v.head })}</button>
      <span className="dim">{t('quickWt.relChange')} <a href="#" data-action="rel-none" onClick={(e) => { e.preventDefault(); rel('none'); }}>{t('quickWt.rel.none')}</a> · <a href="#" data-action="rel-sub" onClick={(e) => { e.preventDefault(); rel('sub'); }}>{t('quickWt.rel.sub')}</a></span></div>}
  </>;
}

// ---------- P325 워크트리 치우기(설계 4.5, 시안 04 둘째 줄) ----------
// 카드 ⋯ 메뉴와 사이드바 세션 메뉴의 "워크트리 치우기…" → 확인 상자. 판 API worktree.discard(dryRun으로 값, 누르면 세션을 닫고 merger 또는 판이 지운다)
export function openDiscard(s) { if (s) set({ discard: { sessionId: s.sessionId, name: s.name }, menu: null, quick: null }); }
const closeDiscard = () => set({ discard: null });
function DiscardDialog({ d }) {
  const t = useT();
  const [v, setV] = useState(null);
  const [err, setErr] = useState(null);
  const [keep, setKeep] = useState(true);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api.call('worktree.discard', { session: d.sessionId, dryRun: true }).then((r) => { if (!live) return; setV(r); setKeep(discardChoices(r).keepBranch); }).catch((e) => live && setErr(e));
    const key = (e) => { if (e.key === 'Escape' && !busy) closeDiscard(); };
    window.addEventListener('keydown', key);
    return () => { live = false; window.removeEventListener('keydown', key); };
  }, [d.sessionId]);
  const c = discardChoices(v);
  const block = err ? 'error' : discardBlock(v, force);
  const go = async () => {
    if (block || busy) return;
    setBusy(true);
    try {
      const r = await api.call('worktree.discard', { session: d.sessionId, keepBranch: !c.hasBranch || keep, force });
      closeDiscard();
      if (r.via === 'merger') toast(t('wtDiscard.handed', { name: r.name, merger: r.merger ? '@' + r.merger : 'merger' }));
      else if (!r.removed || r.error) toast(t('wtDiscard.failed', { error: r.error || '?' }), 'error');
    } catch (e) { toast(t('wtDiscard.failed', { error: errText(e) }), 'error'); setBusy(false); }
  };
  return createPortal(
    <div className="mt-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && !busy && closeDiscard()}>
      <div className="mt-modal mt-wtd" role="dialog" aria-labelledby="mt-wtd-title" data-role="wt-discard" data-session={d.sessionId} data-via={v ? v.via : ''}>
        <h3 id="mt-wtd-title">{t('wtDiscard.title', { name: (v && v.name) || d.name })}</h3>
        {err ? <div className="mt-wtd-bad" data-role="wtd-error">{errText(err)}</div> : !v ? <div className="dim">{t('wtDiscard.loading')}</div> : <>
          <dl className="mt-wtd-facts" data-role="wtd-facts">
            <dt>{t('wtDiscard.branch')}</dt><dd className="mono" data-field="branch">{v.branch || t('wtDiscard.noBranch')}</dd>
            <dt>{t('wtDiscard.ahead', { target: v.target || '?' })}</dt><dd data-field="ahead" className={v.ahead > 0 ? 'hot' : ''}>{v.ahead ?? '?'}</dd>
            <dt>{t('wtDiscard.dirty')}</dt><dd data-field="dirty" className={v.dirty > 0 ? 'hot' : ''}>{v.dirty ?? '?'}</dd>
            <dt>{t('wtDiscard.path')}</dt><dd className="mono" data-field="path" title={v.path || ''}>{v.path || '?'}</dd>
          </dl>
          {c.risky && <div className="mt-wtd-bad" data-role="wtd-warn">{t('wtDiscard.warn')}</div>}
          {c.hasBranch && <label className="mt-wtd-check"><input type="checkbox" data-field="wtd-keep" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> {t('wtDiscard.keepBranch', { branch: v.branch })}</label>}
          {c.needForce && <label className="mt-wtd-check"><input type="checkbox" data-field="wtd-force" checked={force} onChange={(e) => setForce(e.target.checked)} /> {t('wtDiscard.force', { n: v.dirty })}</label>}
          <div className="mt-card-sub dim" data-role="wtd-how">{t(v.via === 'merger' ? 'wtDiscard.viaMerger' : 'wtDiscard.viaBoard')}</div>
          {block === 'same_branch' && <div className="mt-wtd-bad">{t('wtDiscard.sameBranch')}</div>}
        </>}
        <div className="mt-card-actions">
          <button className="mt-btn danger" data-action="wtd-go" disabled={!!block || busy} onClick={go}>{busy ? t('wtDiscard.working') : t('wtDiscard.go')}</button>
          <button className="mt-btn ghost" data-action="wtd-cancel" disabled={busy} onClick={closeDiscard}>{t('common.cancel')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
// 치운 결과(판이 직접 지웠거나 merger가 닫았다)
api.on('worktree.discarded', (r) => {
  if (!r) return;
  const ok = r.removed && !r.error;
  const br = !r.branch ? '' : r.keepBranch ? t('wtDiscard.branchKept', { branch: r.branch }) : r.branchDeleted ? t('wtDiscard.branchDeleted', { branch: r.branch }) : t('wtDiscard.branchLeft', { branch: r.branch });
  toast(ok ? t('wtDiscard.done', { name: r.name, by: r.via === 'merger' ? 'merger' : t('wtDiscard.byBoard'), branch: br }) : t('wtDiscard.failedNamed', { name: r.name, error: r.error || '?' }), ok ? 'info' : 'error');
});
