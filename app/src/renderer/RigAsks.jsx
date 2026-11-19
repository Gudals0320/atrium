// P224: rig 2 R6 응답 필요 카드(docs research rig2-design.md 2.1 "제안과 승인", 11.5의 4, 11.7의 1).
// - 판 API rig.asks(사람 승인 제안, 승인 안 된 정본 바뀜, 받아들임 human 섹터의 새 산출물)를 읽고 판 이벤트 rig.asks·rig.artifacts와 다시 붙을 때 다시 읽는다.
// - P239: 권한 모드가 바뀐 rig 자리 "rig 자리 <자리>의 권한 모드가 <모드>로 바뀌었습니다…"(단추 없음. 자리 터미널에서 Shift+Tab으로 돌리면 사라진다).
// - P230: 상한에 닿은 회(관리자 자리 없는 rig) "상한에 닿은 회: <이름>", 마지막 반려 까닭, [그대로 받기] [한 번 더] [회 멈추기].
// - 카드: 제안 "제안: <문서> · <까닭>"과 패치 보기, [승인] [거절(한 줄 까닭)]. 승인 안 된 바뀜은 바뀐 내용 보기와 [되돌리기] [받아들이기]. 산출물은 [받아들이기].
// - 위 오른쪽 "내 차례" 펼침 목록(Chrome.jsx TurnPill)과 휴대폰 목록(Phone.jsx)이 같은 부품을 쓴다. 정하기는 rig.decide(이 PC의 창과 연결한 기기)
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { toast } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { ago } from './lib/labels.js';
import { remoteView } from './RigSeat.jsx'; // P225: 무인 자리 승인은 이 PC의 창만

let cache = { asks: [], at: 0 };
const subs = new Set();
let loading = null;
function load() {
  if (loading) return loading;
  loading = api.call('rig.asks', {}).then((r) => { cache = { asks: (r && r.asks) || [], at: Date.now() }; subs.forEach((f) => f(cache)); }).catch(() => {}).finally(() => { loading = null; });
  return loading;
}
let wired = false;
function wire() {
  if (wired) return; wired = true;
  api.on('rig.asks', () => load());
  api.on('rig.artifacts', () => load());
  api.on('$conn', (c) => { if (c && c.phase === 'open') load(); });
}
// 응답 필요 카드 목록(모든 워크스페이스, 오래된 것부터)
export function useRigAsks() {
  const [x, set] = useState(cache);
  useEffect(() => { wire(); subs.add(set); load(); return () => { subs.delete(set); }; }, []);
  return x.asks;
}
export const rigAskTitle = (t, a) => (a.kind === 'mode_drift' ? t('rigP239.modeDrift', { seat: a.seat, mode: a.mode }) : a.kind === 'run_limit' ? t('rigP230.limitTitle', { name: a.run.name || a.run.id }) : a.kind === 'seat_permit' ? t('rigPermitNeed.line', { seat: a.seat }) : a.kind === 'proposal' ? t('rigAsk.proposal', { doc: a.proposal.target === 'definition' ? t('rigAsk.definition') : a.proposal.target, why: a.proposal.why || t('rigAsk.noWhy') })
  : a.kind === 'doc_unapproved' ? t('rigAsk.unapproved', { doc: a.doc }) : t('rigAsk.artifact', { sector: a.artifact.sector, path: a.artifact.path }));

// 승인 안 된 바뀜을 만든 쪽(보드의 구조 값) → 화면 글
export function whoText(t, w, fallback = null) {
  if (!w || !w.by) return fallback || t('rigAsk.unknown');
  if (w.by === 'seat') return t('rigAsk.bySeat', { seat: w.seat || '-', name: w.name || '-' });
  if (w.by === 'session') return t('rigAsk.bySession', { name: w.name || '-' });
  if (w.by === 'hook' || w.by === 'tool') return t('rigAsk.byProgram');
  if (w.by === 'human' || w.guess) return t('rigAsk.byHuman');
  return t('rigAsk.unknown');
}
// diff 글 → 줄마다 색(추가·빼기·덩어리 머리)
export function DiffView({ text, clipped }) { // P233: 켜기 확인의 정본 차이도 쓴다
  const t = useT();
  return (
    <pre className="mt-rigask-diff" data-role="rig-ask-diff">
      {String(text || '').replace(/\n$/, '').split('\n').map((l, i) => <span key={i} className={l.startsWith('+++') || l.startsWith('---') ? 'h' : l.startsWith('@@') ? 'at' : l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : ''}>{l}{'\n'}</span>)}
      {clipped && <span className="h">{t('rigAsk.clipped')}</span>}
    </pre>
  );
}

// P233(rig2-design 11.15의 6): 켜기 확인 창의 정본 차이. 꺼짐 → 켜짐마다 기준을 다시 잡으므로, 정본이 마지막 승인 내용과 다르면
//   "정본 <이름>이 마지막 승인 내용과 다르다(+n −m). 켜면 지금 내용이 기준이 된다"와 [차이 보기]. drift: rig.status·rig.get의 canonDrift(처음 켤 때는 빈 목록)
export function CanonDrift({ drift }) {
  const t = useT();
  const [open, setOpen] = useState({});
  if (!drift || !drift.length) return null;
  return (
    <div className="mt-rigon-drift" data-role="rig-canon-drift">
      {drift.map((d) => (
        <div key={d.doc} className="mt-rigon-warn" data-doc={d.doc}>
          <span>{d.added != null ? t('rigP233.drift', { doc: d.doc, path: d.path, added: d.added, removed: d.removed }) : t('rigP233.driftNoCount', { doc: d.doc, path: d.path })}</span>
          {d.diff && <button type="button" className="mt-rigask-link" data-action="rig-drift-diff" aria-expanded={!!open[d.doc]} onClick={() => setOpen((o) => ({ ...o, [d.doc]: !o[d.doc] }))}>{open[d.doc] ? t('rigAsk.hideDiff') : t('rigP233.showDiff')}</button>}
          {open[d.doc] && d.diff && <DiffView text={d.diff} clipped={d.clipped} />}
        </div>
      ))}
    </div>
  );
}

// 카드 하나
export function RigAskCard({ a, now = Date.now(), compact = false }) {
  const t = useT();
  const [show, setShow] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (action, extra = {}) => {
    setBusy(true);
    try {
      const r = await api.call('rig.decide', { id: a.id, action, ...extra });
      if (a.kind === 'run_limit') toast(t(action === 'accept' ? 'rigP230.accepted' : action === 'again' ? 'rigP230.againDone' : 'rigP230.paused'));
      else if (a.kind === 'seat_permit') toast(t('rigPermitNeed.done', { seat: a.seat }));
      else if (action === 'approve') toast(r && r.applied === false ? t('rigAsk.applyFailed', { reason: r.reason || '' }) : t('rigAsk.applied'), r && r.applied === false ? 'error' : 'info');
      else if (action === 'reject') toast(t('rigAsk.rejected'));
      else if (action === 'revert') toast(t('rigAsk.reverted'));
      else toast(t('rigAsk.accepted'));
      load();
    } catch (e) { toast(errText(e), 'error'); } finally { setBusy(false); }
  };
  const p = a.proposal;
  const diff = p ? p.diff : a.diff;
  const meta = a.kind === 'mode_drift' ? `${a.wsName} · @${a.sessionName || '-'} · ${ago(a.t, now)}` : a.kind === 'run_limit' ? t('rigP230.limitMeta', { ws: a.wsName, seat: a.run.seat || '-', result: a.run.result || '-', max: a.run.max ?? '-', ago: ago(a.t, now) }) : a.kind === 'seat_permit' ? `${a.wsName} · ${t('rigPermitNeed.what')} · ${ago(a.t, now)}` : a.kind === 'proposal'
    ? t('rigAsk.metaProposal', { ws: a.wsName, seat: p.seat || '-', who: p.sessionName ? `@${p.sessionName}` : '', path: p.path, added: p.added ?? 0, removed: p.removed ?? 0, ago: ago(a.t, now) })
    : a.kind === 'doc_unapproved' ? t('rigAsk.metaUnapproved', { ws: a.wsName, path: a.path, by: whoText(t, a.who, a.by), ago: ago(a.t, now) })
      : t('rigAsk.metaArtifact', { ws: a.wsName, seat: a.artifact.seat || '-', ago: ago(a.t, now) });
  return (
    <div className={`mt-rigask ${a.kind}${compact ? ' compact' : ''}`} data-role="rig-ask" data-kind={a.kind} data-ask={a.id} title={a.kind === 'mode_drift' ? t('rigP239.modeTip') : a.kind === 'seat_permit' ? t('rigPermitNeed.tip') : a.kind === 'run_limit' ? (a.run.self ? t('rigP231.limitTipSelf', { seat: a.run.self }) : t('rigP230.limitTip')) : undefined}>
      <div className="mt-rigask-title">{rigAskTitle(t, a)}</div>
      <div className="mt-rigask-meta">{meta}</div>
      {a.kind === 'seat_permit' && <div className="mt-rigask-risk" data-role="rig-ask-risk">{t('rigPermitNeed.risk')}</div>}
      {a.kind === 'run_limit' && <div className="mt-rigask-why" data-role="rig-ask-why"><span className="dim">{t('rigP230.limitWhy')}</span> {a.run.reason || '-'}</div>}{/* P230: 마지막 반려 까닭 */}{/* P226: 무인 자리가 셸로 할 수 있는 것 */}
      {diff && (
        <button type="button" className="mt-rigask-link" data-action="rig-ask-diff" aria-expanded={show} onClick={() => setShow((s) => !s)}>
          {show ? t('rigAsk.hideDiff') : a.kind === 'proposal' ? t('rigAsk.showPatch') : t('rigAsk.showChange')}
        </button>
      )}
      {show && diff && <DiffView text={diff} clipped={p ? p.clipped : a.clipped} />}
      {rejecting ? (
        <form className="mt-rigask-reject" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) act('reject', { reason: reason.trim() }); }}>
          <input autoFocus value={reason} maxLength={200} placeholder={t('rigAsk.reasonPh')} data-role="rig-ask-reason" onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setRejecting(false); }} />
          <button type="submit" className="mt-rigask-btn danger" data-action="rig-ask-reject-send" disabled={busy || !reason.trim()}>{t('rigAsk.rejectSend')}</button>
          <button type="button" className="mt-rigask-btn" onClick={() => setRejecting(false)}>{t('rigAsk.cancel')}</button>
        </form>
      ) : (
        <div className="mt-rigask-acts">
          {a.kind === 'proposal' && <>
            <button type="button" className="mt-rigask-btn primary" data-action="rig-ask-approve" disabled={busy} onClick={() => act('approve')}>{t('rigAsk.approve')}</button>
            <button type="button" className="mt-rigask-btn" data-action="rig-ask-reject" disabled={busy} onClick={() => setRejecting(true)}>{t('rigAsk.reject')}</button>
          </>}
          {a.kind === 'doc_unapproved' && <>
            {a.canRevert && <button type="button" className="mt-rigask-btn" data-action="rig-ask-revert" disabled={busy} onClick={() => act('revert')} title={t('rigAsk.revertTip')}>{t('rigAsk.revert')}</button>}
            <button type="button" className="mt-rigask-btn primary" data-action="rig-ask-accept" disabled={busy} onClick={() => act('accept')}>{t('rigAsk.accept')}</button>
          </>}
          {a.kind === 'seat_permit' && !remoteView() && <button type="button" className="mt-rigask-btn primary" data-action="rig-ask-permit" disabled={busy} onClick={() => act('approve')}>{t('rigPermitNeed.approve')}</button>}
          {a.kind === 'run_limit' && <>{/* P230(rig2-design 11.12의 3): 관리자 자리 없는 rig의 상한 */}
            <button type="button" className="mt-rigask-btn primary" data-action="rig-ask-limit-accept" disabled={busy} onClick={() => act('accept')}>{t('rigP230.accept')}</button>
            <button type="button" className="mt-rigask-btn" data-action="rig-ask-limit-again" disabled={busy} onClick={() => act('again')}>{t('rigP230.again')}</button>
            <button type="button" className="mt-rigask-btn" data-action="rig-ask-limit-pause" disabled={busy} onClick={() => act('pause')}>{t('rigP230.pause')}</button>
          </>}
          {a.kind === 'artifact' && <button type="button" className="mt-rigask-btn primary" data-action="rig-ask-accept" disabled={busy} onClick={() => act('accept')}>{t('rigAsk.accept')}</button>}
        </div>
      )}
    </div>
  );
}

// 목록(머리 + 카드들). 비면 아무것도 그리지 않는다
export function RigAskList({ asks, now, compact = false, head = true }) {
  const t = useT();
  if (!asks || !asks.length) return null;
  return (
    <div className="mt-rigask-list" data-role="rig-asks" data-count={asks.length}>
      {head && <div className="mt-rigask-head">{t('rigAsk.head', { n: asks.length })}</div>}
      {asks.map((a) => <RigAskCard key={a.id} a={a} now={now} compact={compact} />)}
    </div>
  );
}
