// 리포지토리 워크스페이스(ARCH 4절 G, 7.1, P5): 리포 열기·빈 워크스페이스 닫기 대화상자와 세션 한 줄 글.
// P6a: P5의 위쪽 워크스페이스 줄과 아래쪽 세션 줄은 캔버스의 워크스페이스 영역, 아래쪽 워크스페이스 단추, 검색으로 바꿨다(Regions.jsx, Search.jsx).
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { selectWorkspace, toast } from './store.js';
import { useT, t, errText, tMsg } from './lib/i18n.js';

// "+ 리포 열기": 폴더를 고르면 그 폴더의 리포지토리(저장소가 아니면 그 폴더)를 빈 워크스페이스로 만들고 그 영역으로 간다
export function OpenRepoDialog({ onClose }) {
  const t = useT();
  const [dir, setDir] = useState('');
  const [busy, setBusy] = useState(false);
  async function browse() { try { const p = await window.mt.pickFolder(); if (p) setDir(p); } catch {} }
  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await api.call('workspace.open', { path: dir.trim() });
      const ws = r.workspace;
      toast(r.created ? t('workspaces.created', { name: ws.name }) : t('workspaces.exists', { name: ws.name }));
      selectWorkspace(ws.key); // 목록(workspace.updated)은 응답보다 먼저 온다
      onClose();
    } catch (err) { toast(t('workspaces.openFail', { error: errText(err) }), 'error'); setBusy(false); }
  }
  return (
    <div className="mt-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="mt-modal" onSubmit={submit} data-role="ws-open">
        <h3>{t('workspaces.openTitle')}</h3>
        <div className="mt-card-sub">{t('workspaces.openNote')}</div>
        <div className="mt-row-wide">
          <input value={dir} onChange={(e) => setDir(e.target.value)} placeholder={t('workspaces.pathPlaceholder')} data-field="path" autoFocus />
          <button type="button" className="mt-btn" onClick={browse} data-action="ws-browse">{t('workspaces.browse')}</button>
        </div>
        <div className="mt-card-actions">
          <button className="mt-btn primary" disabled={busy || !dir.trim()} data-action="ws-open-submit">{t('common.open')}</button>
          <button type="button" className="mt-btn ghost" onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </form>
    </div>
  );
}

// 빈 워크스페이스 닫기(확인을 받는다)
export function CloseWsDialog({ ws, onClose }) {
  const t = useT();
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.call('workspace.close', { workspace: ws.key }).then((r) => setMsg(r)).catch((e) => setMsg({ error: e })); }, [ws.key]);
  return (
    <div className="mt-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mt-modal" data-role="ws-close">
        <h3>{t('workspaces.closeTitle', { name: ws.name })}</h3>
        <div>{!msg ? t('workspaces.confirmLoading') : msg.error ? errText(msg.error) : tMsg(msg)}</div>
        <div className="mt-card-actions">
          <button className="mt-btn danger" disabled={busy} data-action="ws-close-confirm" onClick={async () => { setBusy(true); try { await api.call('workspace.close', { workspace: ws.key, confirm: true }); onClose(); } catch (e) { toast(t('workspaces.closeFail', { error: errText(e) }), 'error'); setBusy(false); } }}>{t('common.close')}</button>
          <button className="mt-btn ghost" onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </div>
    </div>
  );
}

// 세션 줄의 한 칸에 보일 종류
export function kindLabel(s) {
  if (s.kind === 'shell') return t('sidebar.kindShell');
  if (s.kind && s.kind !== 'claude') return s.kind;
  return s.origin === 'adopted' ? t('workspaces.claudeAdopted') : 'claude';
}
// 셸의 한 줄: 쉬는 중, 또는 돌고 있는 명령과 프로세스 이름
export function shellLine(s) {
  const sh = s.shell || {};
  if (sh.atPrompt !== false) return sh.command ? t('workspaces.shellLast', { cmd: sh.command }) : t('workspaces.shellPrompt');
  return `${sh.command || '?'}${sh.procs && sh.procs.length ? ` (${sh.procs.join(', ')})` : ''}`;
}
