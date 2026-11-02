// P7(J5): 왼쪽 사이드바. 평소에는 닫혀 있고 위쪽 줄 왼쪽 단추(☰)와 Ctrl+Shift+E로 연다. 캔버스는 그 옆으로 줄어들 뿐 자리와 배율은 그대로다.
// 열린 워크스페이스(리포)마다 접히는 묶음, 그 아래 판 세션(상태 필, 내 차례 한 줄), 닫힌 세션, 판 밖의 지난 Claude Code 대화를 마지막 활동 순으로 둔다.
// 판 세션을 누르면 그 노드로 들어가고(H4), 리포 이름을 누르면 그 영역으로 간다. 닫힌 세션과 묶여 있지 않은 대화는 "판으로 열기"(J2·J4),
// 다른 곳에 묶인 대화는 흐리게 묶인 곳만 보인다. 연 상태, 접힘, 거르기 글은 창이 기억한다(창 프로필의 localStorage).
// 닫힌 세션과 판 밖 대화는 백엔드 recall.list로 읽고, recall.updated가 오면 사이드바가 열려 있을 때만 다시 읽는다.
// P10: 닫힌 세션과 판 밖 대화의 "보관"(P7의 빼기를 합침), 리포 묶음의 "오래된 것 보관"(수를 보이고 한 번 더 누른다), 맨 아래 "보관함"(접혀 있음).
// 보관함은 펼칠 때 archive.list로 읽고 리포별로 보이며, 따로 거르기 칸이 있고, "꺼내기"로 기본 목록에 되돌린다. 보관은 지우기가 아니다.
// P13: 맨 아래 "missed(지울 대화)" 함. 폴더가 없어졌거나 이 앱의 시험 폴더에서 한 대화를 폴더별(수, 크기, 마지막 활동)로 모으고, 모두·폴더 하나·하나를 Windows 휴지통으로 지운다.
//   지우기 전에 지울 수, 크기, 폴더 목록을 확인창으로 보인다. 캔버스에 대화 노드가 있는 판 밖 대화 줄은 제목을 누르면 그 노드로 간다
import './sidebar.css';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { api } from './api.js';
import { useStore, getState, selectWorkspace, toast, goWhenOpen } from './store.js';
import { StatePill } from './SessionNode.jsx';
import { ago, askLine } from './lib/labels.js';
import { useT, t, errText, tMsg, tOr } from './lib/i18n.js';
import { sidebarRows, archiveRows, SECTION_STEP, bindingText } from './lib/sidebar.js';
import { shownKind } from './lib/kinds.js'; // P25: DeepSeek(flavor)를 종류처럼 보인다
import { treeOrder, branchLabel } from './lib/branch.js'; // P8(K4): 하위 세션은 부모 아래에 들여 보인다

const KEY = 'mt.sidebar';
function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } }
const saved = load();
const side = {
  open: !!saved.open,
  collapsed: saved.collapsed && typeof saved.collapsed === 'object' ? saved.collapsed : {}, // 워크스페이스 키 → 접힘
  filter: typeof saved.filter === 'string' ? saved.filter : '',
  more: {}, // 워크스페이스 키 + 칸 → 더 보인 수(창을 다시 열면 처음으로)
  data: null, // recall.list 결과
  loading: false,
  busy: new Set(), // 여는 중인 항목
  // P10: 보관함
  archiveOpen: false, archive: null, archiveFilter: '', archiveLoading: false,
  oldAsk: null, // "오래된 것 보관"의 확인 { key, count, message }
  // P13: missed 함. missedAsk: 지우기 확인창 { scope, count, bytes, folders, message }
  missedOpen: false, missed: null, missedLoading: false, missedAsk: null,
  v: 0,
};
const subs = new Set();
function persist() { try { localStorage.setItem(KEY, JSON.stringify({ open: side.open, collapsed: side.collapsed, filter: side.filter })); } catch {} }
function bump() { side.v++; for (const f of [...subs]) f(); }
export function useSide(sel) { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => sel(side)); }
export const sideState = () => side;

export function setSidebarOpen(v) {
  side.open = v; persist(); bump();
  if (v) refresh();
}
export function toggleSidebar() { setSidebarOpen(!side.open); }
function setCollapsed(key, v) { side.collapsed = { ...side.collapsed, [key]: v }; persist(); bump(); }
function setFilter(v) { side.filter = v; persist(); bump(); }
function showMore(k) { side.more = { ...side.more, [k]: (side.more[k] || 0) + SECTION_STEP }; bump(); }

let timer = null;
export async function refresh() {
  if (side.loading) { clearTimeout(timer); timer = setTimeout(refresh, 300); return; }
  side.loading = true; bump();
  try { side.data = await api.call('recall.list'); } catch (e) { if (e.code !== 'disconnected') toast(t('sidebar.loadFail', { error: errText(e) }), 'error'); }
  side.loading = false; bump();
}
api.on('recall.updated', () => { if (!side.open) { side.data = null; side.archive = null; side.missed = null; return; } clearTimeout(timer); timer = setTimeout(() => { refresh(); if (side.archiveOpen) refreshArchive(); if (side.missedOpen) refreshMissed(); }, 400); });
api.on('$open', () => { if (side.open) refresh(); });

// ---------- P10: 보관 ----------
export async function refreshArchive() {
  side.archiveLoading = true; bump();
  try { side.archive = await api.call('archive.list'); } catch (e) { if (e.code !== 'disconnected') toast(t('archive.loadFail', { error: errText(e) }), 'error'); }
  side.archiveLoading = false; bump();
}
function setArchiveOpen(v) { side.archiveOpen = v; bump(); if (v) refreshArchive(); }
// P11: 오른쪽 레일의 보관함 단추. 사이드바를 열고 맨 아래 보관함을 펼쳐 그쪽으로 민다
export function openArchiveBox() {
  if (!side.open) setSidebarOpen(true);
  setArchiveOpen(true);
  setTimeout(() => { const el = document.querySelector('[data-role="archive-box"]'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 120);
}
function setArchiveFilter(v) { side.archiveFilter = v; bump(); }

// ---------- P13: missed(지울 대화) ----------
export async function refreshMissed() {
  side.missedLoading = true; bump();
  try { side.missed = await api.call('missed.list'); } catch (e) { if (e.code !== 'disconnected') toast(t('missed.loadFail', { error: errText(e) }), 'error'); }
  side.missedLoading = false; bump();
}
function setMissedOpen(v) { side.missedOpen = v; bump(); if (v) refreshMissed(); }
export function openMissedBox() { if (!side.open) setSidebarOpen(true); setMissedOpen(true); setTimeout(() => { const el = document.querySelector('[data-role="missed-box"]'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 120); }
// scope: { all: true } | { folder } | { convos: [id] }. 먼저 수·크기·폴더를 받아 확인창을 띄운다
async function askMissed(scope) {
  try { const r = await api.call('missed.delete', scope); side.missedAsk = { scope, ...r }; bump(); }
  catch (e) { toast(t('missed.deleteFail', { error: errText(e) }), 'error'); }
}
async function confirmMissed() {
  const a = side.missedAsk; side.missedAsk = null; bump();
  if (!a || !a.count) return;
  return run('missed', async () => {
    const r = await api.call('missed.delete', { ...a.scope, confirm: true });
    const why = r.refused && r.refused.length ? t('missed.kept', { n: r.refused.length, why: [...new Set(r.refused.map((x) => tOr(`refuse.${x.reason}`, x.label)))].join(', ') }) : '';
    toast(t('missed.trashed', { n: r.trashed }) + why + (r.failed && r.failed.length ? t('missed.failed', { n: r.failed.length }) : ''), r.failed && r.failed.length ? 'error' : 'info');
    await refreshMissed();
  });
}
export const fmtBytes = (n) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(1)}GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round((n || 0) / 1024))}KB`);
const WHY = { gone: 'missed.whyGone', code: 'missed.whyTest', tmp: 'missed.whyTmp', prefix: 'missed.whyTest' };
const ref = (c) => (c.convId && !c.sessionId ? { convo: c.convId } : { session: c.sessionId });
export function archiveItem(c) { return run(c.sessionId || c.convId, async () => { await api.call('archive.add', ref(c)); toast(c.name ? t('archive.addedNamed', { name: c.name }) : t('archive.added')); }); }
export function restoreItem(c) { return run(c.sessionId || c.convId, async () => { await api.call('archive.restore', ref(c)); toast(t('archive.restored')); if (side.archiveOpen) refreshArchive(); }); }
async function askOld(w) {
  try { const r = await api.call('archive.old', { workspace: w.key }); side.oldAsk = { key: w.key, count: r.count, message: r.message, msg: r.msg }; bump(); }
  catch (e) { toast(t('archive.oldFail', { error: errText(e) }), 'error'); }
}
function confirmOld(w) {
  side.oldAsk = null; bump();
  return run(`old:${w.key}`, async () => { const r = await api.call('archive.old', { workspace: w.key, confirm: true }); toast(t('archive.oldDone', { n: r.archived || 0 })); });
}

async function run(key, fn) {
  if (side.busy.has(key)) return;
  side.busy = new Set(side.busy); side.busy.add(key); bump();
  try { await fn(); } catch (e) { toast(e.code === 'bound' ? t('sidebar.notOpened', { error: errText(e) }) : errText(e), 'error'); }
  side.busy = new Set(side.busy); side.busy.delete(key); bump();
  refresh();
}
const devModel = () => (api.info && api.info.defaultModel) || undefined; // 개발용 프로필은 haiku(P2), 실제 판은 사용자 기본 모델
export function reopenClosed(c) {
  return run(c.sessionId, async () => {
    const r = await api.call('recall.reopen', { session: c.sessionId, ...(api.info && api.info.profile === 'dev' && !c.model ? { model: devModel() } : {}) });
    toast(r.resume ? t('sidebar.reopenedResume', { name: r.name }) : t('sidebar.reopened', { name: r.name }));
    goWhenOpen(r.sessionId);
  });
}
export function openConvo(c) {
  return run(c.convId, async () => {
    const r = await api.call('convo.open', { convo: c.convId, model: devModel() });
    if (!r.existing) toast(t('sidebar.convoOpened', { name: r.name, id: c.convId.slice(0, 8) }));
    goWhenOpen(r.sessionId);
  });
}

function useNow(ms = 15000) { const [n, set] = useState(Date.now()); useEffect(() => { const t = setInterval(() => set(Date.now()), ms); return () => clearInterval(t); }, [ms]); return n; }
const KIND_LABEL = { shell: 'sidebar.kindShell', claude: 'sidebar.kindClaude', deepseek: 'sidebar.kindDeepseek' };
const kindText = (k) => (KIND_LABEL[k] ? t(KIND_LABEL[k]) : k);

function SessionRow({ s, now, indent = 0 }) {
  const t = useT();
  const ask = s.state === 'waiting' || s.state === 'trust_wait' ? askLine(s) : '';
  const br = branchLabel(s);
  return (
    <button className={`mt-sb-row board${indent ? ' sub' : ''}`} style={indent ? { marginLeft: Math.min(indent, 4) * 14 } : undefined} data-sb="session" data-session={s.sessionId} data-name={s.name} data-indent={indent} onClick={() => getState().navigateTo && getState().navigateTo(s.sessionId, { focusTerminal: true })} title={t('sidebar.enterNode', { name: s.name }) + (br ? `
${br.title}` : '')}>
      <span className="mt-sb-line"><StatePill s={s} /><b>@{s.name}</b>{shownKind(s) !== 'claude' && <span className="mt-sb-kind">{kindText(shownKind(s))}</span>}{br && <span className="mt-sb-branch" data-role="sb-branch">{s.branch.role} · {br.short}</span>}<span className="mt-sb-time">{ago(s.lastActivityAt, now)}</span></span>
      {ask ? <span className="mt-sb-sub need">{ask}</span> : s.lastPrompt ? <span className="mt-sb-sub">{s.lastPrompt}</span> : null}
    </button>
  );
}
function ClosedRow({ c, now, busy }) {
  const t = useT();
  const why = c.binding && c.binding.bound ? bindingText(c.binding) : null;
  return (
    <div className={`mt-sb-row closed${why ? ' bound' : ''}`} data-sb="closed" data-session={c.sessionId} data-name={c.name}>
      <span className="mt-sb-line"><span className="mt-sb-tag closed">{t('sidebar.closedTag')}</span><b>@{c.name}</b>{shownKind(c) !== 'claude' && <span className="mt-sb-kind">{kindText(shownKind(c))}</span>}<span className="mt-sb-time">{ago(c.closedAt, now)}</span></span>
      <span className="mt-sb-sub">{(c.reason && tOr(`closeReason.${c.reason}`, c.reasonLabel)) || c.reasonLabel || t('sidebar.closedTag')}{c.lastPrompt ? ` · ${c.lastPrompt}` : ''}</span>
      <span className="mt-sb-acts">
        {why ? <span className="mt-sb-bound" data-bound={c.binding.where}>{why}</span>
          : <button className="mt-btn small" data-action="reopen" disabled={busy} onClick={() => reopenClosed(c)}>{busy ? t('sidebar.opening') : t('sidebar.openOnBoard')}</button>}
        <button className="mt-btn small ghost" data-action="archive" title={t('sidebar.archiveClosedTitle')} onClick={() => archiveItem(c)}>{t('common.archive')}</button>
      </span>
    </div>
  );
}
function ConvoRow({ c, now, busy }) {
  const t = useT();
  const b = c.binding || { bound: false };
  return (
    <div className={`mt-sb-row convo${b.bound ? ' bound' : ''}`} data-sb="convo" data-convo={c.convId} data-bound={b.bound ? b.where : ''} title={`${c.title || ''}\n${t('sidebar.convoId', { id: c.convId })}${c.cwd ? `\n${c.cwd}` : ''}`}>
      <span className="mt-sb-line"><span className="mt-sb-tag convo">{t('sidebar.convoTag')}</span>{c.onCanvas ? <button className="mt-sb-title link" data-action="go-convo" title={t('sidebar.goConvo')} onClick={() => getState().navigateToItem && getState().navigateToItem(`convo:${c.convId}`)}>{c.title || c.firstPrompt || c.convId.slice(0, 8)}</button> : <b className="mt-sb-title">{c.title || c.firstPrompt || c.convId.slice(0, 8)}</b>}<span className="mt-sb-time">{ago(c.lastAt, now)}</span></span>
      <span className="mt-sb-sub">{[c.folder, c.branch && `⎇ ${c.branch}`].filter(Boolean).join(' · ')}{c.lastPrompt && c.lastPrompt !== c.title ? `${c.folder || c.branch ? ' · ' : ''}${c.lastPrompt}` : ''}</span>
      <span className="mt-sb-acts">
        {b.bound ? <span className="mt-sb-bound" data-bound={b.where} title={b.sure ? '' : t('sidebar.boundUnsure')}>{bindingText(b)}</span>
          : <button className="mt-btn small" data-action="open-convo" disabled={busy} onClick={() => openConvo(c)}>{busy ? t('sidebar.opening') : t('sidebar.openOnBoard')}</button>}
        <button className="mt-btn small ghost" data-action="archive" title={t('sidebar.archiveConvoTitle')} onClick={() => archiveItem(c)}>{t('common.archive')}</button>
      </span>
    </div>
  );
}

function Section({ wsKey, kind, title, rows, render, filtering }) {
  const t = useT();
  const more = useSide((st) => st.more[`${wsKey}|${kind}`] || 0);
  if (!rows.length) return null;
  const n = filtering ? Math.max(50, SECTION_STEP + more) : SECTION_STEP + more;
  return (
    <div className="mt-sb-sec" data-sec={kind}>
      <div className="mt-sb-sec-head">{title} <span className="mt-sb-n">{rows.length}</span></div>
      {rows.slice(0, n).map(render)}
      {rows.length > n && <button className="mt-sb-more" data-action="more" onClick={() => showMore(`${wsKey}|${kind}`)}>{t('sidebar.more', { n: rows.length - n })}</button>}
    </div>
  );
}

function WorkspaceGroup({ w, sessions, data, now }) {
  const t = useT();
  const collapsedSaved = useSide((st) => !!st.collapsed[w.key]);
  const filter = useSide((st) => st.filter);
  const busy = useSide((st) => st.busy);
  const oldAsk = useSide((st) => st.oldAsk);
  const filtering = !!filter.trim();
  const rows = useMemo(() => sidebarRows({ sessions, closed: (data && data.closed) || [], convos: (data && data.convos) || [], filter }), [sessions, data, filter]);
  const tree = useMemo(() => { const at = new Map(rows.sessions.map((s, i) => [s.sessionId, i])); return treeOrder(rows.sessions, { cmp: (a, b) => at.get(a.sessionId) - at.get(b.sessionId) }); }, [rows.sessions]);
  const indent = useMemo(() => new Map(tree.map((t) => [t.item.sessionId, t.indent])), [tree]);
  const total = rows.sessions.length + rows.closed.length + rows.convos.length;
  if (filtering && !total) return null;
  const collapsed = collapsedSaved && !filtering;
  const c = w.counts || {};
  return (
    <div className={`mt-sb-ws${collapsed ? ' collapsed' : ''}`} data-ws={w.key} data-name={w.name}>
      <div className="mt-sb-ws-head">
        <button className="mt-sb-fold" data-action="fold" title={collapsed ? t('sidebar.unfold') : t('sidebar.fold')} onClick={() => setCollapsed(w.key, !collapsedSaved)}>{collapsed ? '▸' : '▾'}</button>
        <button className="mt-sb-ws-name" data-action="go-ws" title={`${w.root}\n${t('sidebar.goWs')}`} onClick={() => selectWorkspace(w.key)}>
          <span className="mt-sb-ws-icon">{w.kind === 'repo' ? '⎇' : '▢'}</span>{w.name}
        </button>
        <span className="mt-sb-ws-c">
          <span title={t('sidebar.secSessions')}>{t('sidebar.cSessions', { n: c.sessions || 0 })}</span>
          {c.working > 0 && <span className="working" title={t('state.working')}>{t('sidebar.cWorking', { n: c.working })}</span>}
          {c.needsYou > 0 && <span className="need" title={t('state.waiting')}>{t('top.turnN', { n: c.needsYou })}</span>}
          {data && data.closed.length > 0 && <span title={t('sidebar.secClosed')}>{t('sidebar.cClosed', { n: data.closed.length })}</span>}
          {data && data.convos.length > 0 && <span title={t('sidebar.secConvos')}>{t('sidebar.cConvos', { n: data.convos.length })}</span>}
          {data && data.archived > 0 && <span className="arch" data-count="archived" title={t('sidebar.archivedTitle')}>{t('sidebar.cArchived', { n: data.archived })}</span>}
        </span>
      </div>
      {!collapsed && (
        <div className="mt-sb-ws-body">
          {!total && <div className="mt-sb-empty">{t('sidebar.wsEmpty')}</div>}
          {data && (data.closed.length > 0 || data.convos.length > 0) && !filtering && (
            oldAsk && oldAsk.key === w.key
              ? <div className="mt-sb-oldask" data-role="old-ask"><span>{tMsg(oldAsk)}</span>
                  {oldAsk.count > 0 && <button className="mt-btn small" data-action="old-confirm" onClick={() => confirmOld(w)}>{t('common.archive')}</button>}
                  <button className="mt-btn small ghost" onClick={() => { side.oldAsk = null; bump(); }}>{oldAsk.count > 0 ? t('common.cancel') : t('common.close')}</button></div>
              : <div className="mt-sb-tools"><button className="mt-sb-more" data-action="archive-old" title={t('sidebar.archiveOldTitle')} onClick={() => askOld(w)} disabled={busy.has(`old:${w.key}`)}>{t('sidebar.archiveOld')}</button></div>
          )}
          <Section wsKey={w.key} kind="sessions" title={t('sidebar.secSessions')} rows={tree.map((t) => t.item)} filtering={filtering} render={(s) => <SessionRow key={s.sessionId} s={s} now={now} indent={indent.get(s.sessionId) || 0} />} />
          <Section wsKey={w.key} kind="closed" title={t('sidebar.secClosed')} rows={rows.closed} filtering={filtering} render={(x) => <ClosedRow key={x.sessionId} c={x} now={now} busy={busy.has(x.sessionId)} />} />
          <Section wsKey={w.key} kind="convos" title={t('sidebar.secConvos')} rows={rows.convos} filtering={filtering} render={(x) => <ConvoRow key={x.convId} c={x} now={now} busy={busy.has(x.convId)} />} />
        </div>
      )}
    </div>
  );
}

// P10: 보관함. 접혀 있다가 펼치면 읽는다. 리포별 묶음, 거르기, 꺼내기
function ArchivedRow({ c, now, busy }) {
  const t = useT();
  const convo = !c.sessionId;
  const auto = c.archive && c.archive.why === 'auto';
  return (
    <div className={`mt-sb-row archived ${convo ? 'convo' : 'closed'}`} data-sb="archived" data-kind={convo ? 'convo' : 'session'} data-convo={c.convId || ''} data-session={c.sessionId || ''} data-name={c.name || ''} title={convo ? `${c.title || ''}\n${t('sidebar.convoId', { id: c.convId })}${c.cwd ? `\n${c.cwd}` : ''}` : `@${c.name}`}>
      <span className="mt-sb-line"><span className="mt-sb-tag arch">{convo ? t('sidebar.convoTag') : t('sidebar.closedTag')}</span><b className="mt-sb-title">{convo ? c.title || c.firstPrompt || c.convId.slice(0, 8) : `@${c.name}`}</b><span className="mt-sb-time">{ago(convo ? c.lastAt : c.lastActivityAt || c.closedAt, now)}</span></span>
      <span className="mt-sb-sub">{auto ? t('archive.whyAuto') : t('archive.whyHand')}{convo ? [c.folder, c.branch && `⎇ ${c.branch}`].filter(Boolean).map((x) => ` · ${x}`).join('') : c.reasonLabel ? ` · ${tOr(`closeReason.${c.reason}`, c.reasonLabel)}` : ''}{c.lastPrompt && c.lastPrompt !== c.title ? ` · ${c.lastPrompt}` : ''}</span>
      <span className="mt-sb-acts"><button className="mt-btn small" data-action="restore" disabled={busy} onClick={() => restoreItem(c)}>{busy ? '…' : t('archive.restore')}</button></span>
    </div>
  );
}
function ArchiveBox({ now }) {
  const t = useT();
  const open = useSide((st) => st.archiveOpen);
  const data = useSide((st) => st.archive);
  const loading = useSide((st) => st.archiveLoading);
  const filter = useSide((st) => st.archiveFilter);
  const busy = useSide((st) => st.busy);
  const counted = useSide((st) => ((st.data && st.data.workspaces) || []).reduce((n, w) => n + (w.archived || 0), 0));
  const groups = useMemo(() => archiveRows({ workspaces: (data && data.workspaces) || [], filter }), [data, filter]);
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const box = useRef(null);
  useEffect(() => { if (open && box.current) box.current.scrollIntoView({ block: 'start' }); }, [open]); // 펼치면 보이게(목록 맨 아래에 있다)
  return (
    <div ref={box} className={`mt-sb-archive${open ? ' open' : ''}`} data-role="archive-box">
      <button className="mt-sb-archive-head" data-action="archive-box" onClick={() => setArchiveOpen(!open)} title={t('archive.boxTitle')}>
        <span>{open ? '▾' : '▸'}</span> {t('archive.box')} <span className="mt-sb-n">{open && data ? total : counted}</span>
        {data && data.days > 0 && <span className="mt-sb-dim">· {t('archive.autoDays', { n: data.days })}</span>}
      </button>
      {open && (
        <div className="mt-sb-archive-body">
          <input className="mt-sb-filter" data-role="archive-filter" placeholder={t('archive.filter')} value={filter} onChange={(e) => setArchiveFilter(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setArchiveFilter(''); }} />
          {loading && !data && <div className="mt-sb-empty">{t('common.loading')}</div>}
          {data && !total && <div className="mt-sb-empty">{filter ? t('archive.noMatch') : t('archive.empty')}</div>}
          {groups.map((g) => (
            <div key={g.key} className="mt-sb-archive-ws" data-ws={g.key} data-name={g.name}>
              <div className="mt-sb-sec-head">{g.name} <span className="mt-sb-n">{g.rows.length}</span></div>
              {g.rows.slice(0, filter ? 100 : 30).map((c) => <ArchivedRow key={c.sessionId || c.convId} c={c} now={now} busy={busy.has(c.sessionId || c.convId)} />)}
              {g.rows.length > (filter ? 100 : 30) && <div className="mt-sb-empty">{t('archive.moreRows', { n: g.rows.length - (filter ? 100 : 30) })}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// P13: missed(지울 대화) 함. 접혀 있다가 펼치면 읽는다. 폴더별 묶음(수, 크기, 마지막 활동), 모두 지우기, 폴더 지우기, 하나 지우기. 모두 확인창을 거친다
function MissedBox({ now }) {
  const t = useT();
  const open = useSide((st) => st.missedOpen);
  const data = useSide((st) => st.missed);
  const loading = useSide((st) => st.missedLoading);
  const counted = useSide((st) => (st.data ? st.data.missed || 0 : 0));
  const busy = useSide((st) => st.busy.has('missed'));
  const [unfold, setUnfold] = useState({});
  const box = useRef(null);
  useEffect(() => { if (open && box.current) box.current.scrollIntoView({ block: 'start' }); }, [open]);
  return (
    <div ref={box} className={`mt-sb-archive mt-sb-missed${open ? ' open' : ''}`} data-role="missed-box">
      <button className="mt-sb-archive-head" data-action="missed-box" onClick={() => setMissedOpen(!open)} title={t('missed.boxTitle')}>
        <span>{open ? '▾' : '▸'}</span> {t('missed.box')} <span className="mt-sb-n" data-count="missed">{open && data ? data.count : counted}</span>
        {open && data && data.count > 0 && <span className="mt-sb-dim">· {fmtBytes(data.bytes)}</span>}
      </button>
      {open && (
        <div className="mt-sb-archive-body">
          {loading && !data && <div className="mt-sb-empty">{t('common.loading')}</div>}
          {data && !data.count && <div className="mt-sb-empty">{t('missed.empty')}</div>}
          {data && data.count > 0 && <div className="mt-sb-tools"><button className="mt-btn small danger" data-action="missed-all" disabled={busy} onClick={() => askMissed({ all: true })}>{busy ? t('missed.deleting') : t('missed.deleteAll', { n: data.count })}</button><span className="mt-sb-dim">{t('missed.toTrash')}</span></div>}
          {data && data.folders.map((g) => (
            <div key={g.folder} className="mt-sb-missed-ws" data-folder={g.folder} data-why={g.why}>
              <div className="mt-sb-missed-head">
                <button className="mt-sb-fold" data-action="missed-fold" onClick={() => setUnfold((u) => ({ ...u, [g.folder]: !u[g.folder] }))}>{unfold[g.folder] ? '▾' : '▸'}</button>
                <span className="mt-sb-missed-path" title={g.folder}>{g.folder.split('/').slice(-2).join('/')}</span>
                <span className="mt-sb-tag missed">{WHY[g.why] ? t(WHY[g.why]) : g.why}</span>
              </div>
              <div className="mt-sb-missed-meta"><span data-count="folder">{t('missed.count', { n: g.count })}</span> · {fmtBytes(g.bytes)} · {ago(g.lastAt, now)}
                <button className="mt-btn small ghost" data-action="missed-folder" disabled={busy} onClick={() => askMissed({ folder: g.folder })}>{t('missed.deleteFolder')}</button></div>
              {unfold[g.folder] && g.items.map((c) => (
                <div key={c.convId} className="mt-sb-row missed" data-sb="missed" data-convo={c.convId}>
                  <span className="mt-sb-line"><b className="mt-sb-title">{c.title || c.convId.slice(0, 8)}</b><span className="mt-sb-time">{ago(c.lastAt, now)}</span></span>
                  <span className="mt-sb-sub">{fmtBytes(c.size)}{c.subagents ? ` · ${t('missed.subagents', { n: c.subagents })}` : ''} · {c.convId.slice(0, 8)}</span>
                  <span className="mt-sb-acts"><button className="mt-btn small ghost" data-action="missed-one" disabled={busy} onClick={() => askMissed({ convos: [c.convId] })}>{t('missed.deleteOne')}</button></span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
// 지우기 확인창: 지울 대화 수, 크기, 폴더 목록
export function MissedConfirm() {
  const t = useT();
  const a = useSide((st) => st.missedAsk);
  if (!a) return null;
  const close = () => { side.missedAsk = null; bump(); };
  return (
    <div className="mt-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="mt-modal" data-role="missed-confirm">
        <h3>{t('missed.confirmTitle')}</h3>
        <div className="mt-card-sub" data-role="missed-confirm-msg">{tMsg(a)}</div>
        {a.count > 0 && <div className="mt-missed-sum"><b data-count="confirm-count">{t('missed.count', { n: a.count })}</b> · <b data-count="confirm-bytes">{fmtBytes(a.bytes)}</b> · {t('missed.folders', { n: a.folders.length })}</div>}
        {a.count > 0 && <ul className="mt-missed-folders" data-role="missed-confirm-folders">{a.folders.map((f) => <li key={f.folder} data-folder={f.folder}><span className="mono">{f.folder}</span> <span className="dim">{t('missed.count', { n: f.count })} · {fmtBytes(f.bytes)}</span></li>)}</ul>}
        <div className="mt-card-sub dim">{t('missed.confirmNote')}</div>
        <div className="mt-card-actions">
          {a.count > 0 && <button className="mt-btn danger" data-action="missed-confirm" onClick={confirmMissed}>{t('missed.confirmOk')}</button>}
          <button className="mt-btn ghost" data-action="missed-cancel" onClick={close}>{a.count > 0 ? t('common.cancel') : t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}

export function SidebarToggle() {
  const t = useT();
  const open = useSide((st) => st.open);
  return <button className={`mt-sb-toggle${open ? ' on' : ''}`} data-action="sidebar" title={t('top.sidebar')} onClick={toggleSidebar}>☰</button>;
}

export function Sidebar() {
  const t = useT();
  const open = useSide((st) => st.open);
  const data = useSide((st) => st.data);
  const loading = useSide((st) => st.loading);
  const filter = useSide((st) => st.filter);
  const workspaces = useStore((st) => st.workspaces);
  const sessions = useStore((st) => st.sessions);
  const now = useNow();
  const input = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === 'E' || e.key === 'e' || e.code === 'KeyE')) { e.preventDefault(); e.stopPropagation(); toggleSidebar(); }
    };
    window.addEventListener('keydown', onKey, true); // 터미널에 초점이 있어도 받는다(Ctrl+F와 같이)
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  useEffect(() => { if (open && !data) refresh(); }, [open, data]);
  const byWs = useMemo(() => {
    const m = new Map();
    for (const s of sessions.values()) { const k = s.workspaceKey || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(s); }
    return m;
  }, [sessions]);
  const dataByWs = useMemo(() => new Map(((data && data.workspaces) || []).map((w) => [w.key, w])), [data]);
  if (!open) return null;
  return (
    <aside className="mt-sidebar" data-role="sidebar">
      <MissedConfirm />
      <div className="mt-sb-top">
        <input ref={input} className="mt-sb-filter" data-role="sidebar-filter" placeholder={t('sidebar.filter')} value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { if (filter) setFilter(''); else setSidebarOpen(false); } }} />
        <button className="mt-btn small ghost" title={t('sidebar.refresh')} data-action="sidebar-refresh" onClick={() => api.call('convo.scan').then(refresh).catch(() => refresh())}>{loading ? '…' : '↻'}</button>
        <button className="mt-btn small ghost" title={t('sidebar.closeTitle')} data-action="sidebar-close" onClick={() => setSidebarOpen(false)}>✕</button>
      </div>
      <div className="mt-sb-list">
        {!workspaces.length && <div className="mt-sb-empty">{t('sidebar.noWs')}</div>}
        {workspaces.map((w) => <WorkspaceGroup key={w.key} w={w} sessions={byWs.get(w.key) || []} data={dataByWs.get(w.key)} now={now} />)}
        {workspaces.length > 0 && <ArchiveBox now={now} />}
        <MissedBox now={now} />
      </div>
      <div className="mt-sb-foot">{data && data.scan ? t('sidebar.scanned', { n: data.scan.files, ago: ago(data.scannedAt, now) }) : loading ? t('common.loading') : ''}</div>
    </aside>
  );
}
