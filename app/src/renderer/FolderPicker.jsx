// P48(원격 R2): 웹 화면의 PC 폴더 탐색기. "+ 리포 열기"와 새 세션 창의 폴더 고르기가 쓴다(window.mt.pickFolder, web.js).
// 백엔드가 PC의 폴더 목록을 읽는다(fs.roots: 드라이브·홈·최근 폴더, fs.list: 그 폴더의 하위 폴더). 파일은 보이지 않고 폴더만 고른다.
// Electron 창은 지금처럼 OS 대화상자를 쓴다(preload pickFolder).
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import { useT, errText } from './lib/i18n.js';

const lastOf = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || p;

function FolderPicker({ onDone, start }) {
  const t = useT();
  const [roots, setRoots] = useState(null);
  const [cur, setCur] = useState(null); // fs.list 결과
  const [typed, setTyped] = useState(start || '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const go = async (p) => {
    if (!p) return;
    setBusy(true); setError(null);
    try { const r = await api.call('fs.list', { path: p }); setCur(r); setTyped(r.path); } catch (e) { setError(errText(e)); }
    setBusy(false);
  };
  useEffect(() => {
    api.call('fs.roots').then((r) => { setRoots(r); go(start || r.recent[0] || r.home); }).catch((e) => setError(errText(e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onDone(null); } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }, [onDone]);
  const dirs = cur ? cur.dirs.filter((d) => showHidden || !d.hidden) : [];
  const Place = ({ p, label }) => <button type="button" className={`mt-fpick-place${cur && cur.path === p ? ' on' : ''}`} onClick={() => go(p)} title={p} data-path={p}>{label || p}</button>;
  return (
    <div className="mt-modal-bg mt-fpick-bg" onMouseDown={(e) => e.target === e.currentTarget && onDone(null)} onKeyDown={(e) => e.stopPropagation()}>
      <div className="mt-modal mt-fpick" data-role="folder-picker">
        <h3>{t('folderPicker.title')}</h3>
        <form className="mt-row-wide" onSubmit={(e) => { e.preventDefault(); go(typed.trim()); }}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} data-field="fpick-path" spellCheck={false} />
          <button type="submit" className="mt-btn" data-action="fpick-go">{t('folderPicker.go')}</button>
          <button type="button" className="mt-btn" disabled={!cur || !cur.parent} onClick={() => go(cur.parent)} data-action="fpick-up">{t('folderPicker.up')}</button>
        </form>
        <div className="mt-fpick-body">
          <div className="mt-fpick-side">
            {roots && <>
              <div className="mt-fpick-head">{t('folderPicker.drives')}</div>
              {roots.drives.map((d) => <Place key={d} p={d} />)}
              <Place p={roots.home} label={t('folderPicker.home')} />
              {roots.recent.length > 0 && <div className="mt-fpick-head">{t('folderPicker.recent')}</div>}
              {roots.recent.map((d) => <Place key={d} p={d} label={lastOf(d)} />)}
            </>}
          </div>
          <div className="mt-fpick-list" data-role="fpick-list" aria-busy={busy}>
            {cur && !dirs.length && <div className="dim">{t('folderPicker.empty')}</div>}
            {dirs.map((d) => <button type="button" key={d.path} className={`mt-fpick-dir${d.hidden ? ' hidden' : ''}`} onClick={() => go(d.path)} data-name={d.name}>{d.name}</button>)}
            {cur && cur.truncated && <div className="dim">{t('folderPicker.truncated', { n: cur.total })}</div>}
          </div>
        </div>
        {error && <div className="mt-pair-error">{error}</div>}
        <div className="mt-card-actions">
          <button type="button" className="mt-btn primary" disabled={!cur || busy} onClick={() => onDone(cur.path)} data-action="fpick-choose">{t('folderPicker.choose')}</button>
          <button type="button" className="mt-btn ghost" onClick={() => onDone(null)}>{t('common.cancel')}</button>
          <span className="mt-dimport-sp" />
          <label className="mt-fpick-hidden"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />{t('folderPicker.showHidden')}</label>
        </div>
      </div>
    </div>
  );
}

// 고른 폴더(취소하면 null)
export function openFolderPicker({ start } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  return new Promise((res) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; setTimeout(() => { root.unmount(); host.remove(); }, 0); res(v); };
    root.render(<FolderPicker onDone={finish} start={start} />);
  });
}
