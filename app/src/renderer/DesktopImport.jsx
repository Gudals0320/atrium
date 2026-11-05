// P34: "데스크톱 앱에서 가져오기" 창. 리포 열기 창에서 연다. 열 때마다 목록을 새로 읽는다(desktop.list).
// 리포별 목록, 상태 글, 기본 고름(새것과 더 씀, 지금 도는 것은 뺌), 모두 고르기·풀기, 진행 표시(desktop.import.progress)와 결과 요약(가져옴, 건너뜀과 까닭).
// 가져온 세션은 그 리포 영역에 잠든 노드로 놓인다(백엔드 desktop-import.mjs). 창은 고정 크기이고 목록 칸만 스크롤된다(P28: 창 최소 크기에서 틀이 넘치지 않는다).
import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { toast } from './store.js';
import { useT, errText, tOr } from './lib/i18n.js';
import { agoText } from './lib/labels.js';
import { useDialog } from './dialog.js';

const CAN = new Set(['new', 'more']); // 고를 수 있는 상태(나머지는 까닭만 보인다)

export function DesktopImportDialog({ onClose }) {
  const t = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const box = useDialog(() => !busy && onClose()); // P52: 가져오는 동안은 닫지 않는다(바깥 누르기와 같다)
  async function load(keepPick = false) {
    try {
      const r = await api.call('desktop.list');
      setData(r); setError(null);
      if (!keepPick) setPicked(new Set(r.repos.flatMap((g) => g.items).filter((c) => c.pick).map((c) => c.appSessionId)));
    } catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => api.on('desktop.import.progress', (d) => setProgress(d)), []);
  const items = useMemo(() => (data ? data.repos.flatMap((g) => g.items) : []), [data]);
  const pickable = items.filter((c) => CAN.has(c.status));
  const runningPicked = items.filter((c) => c.running && picked.has(c.appSessionId)).length;
  const toggle = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function run() {
    setBusy(true); setResult(null); setProgress({ done: 0, total: picked.size });
    try {
      const r = await api.call('desktop.import', { ids: [...picked] });
      setResult(r);
      toast(t('desktopImport.done', { n: r.imported.length, skipped: r.skipped.length }));
      await load();
    } catch (e) { toast(t('desktopImport.failed', { error: errText(e) }), 'error'); }
    setBusy(false); setProgress(null);
  }
  const statusText = (c) => {
    if (c.status === 'more' && c.more) return t('desktopImport.st.moreN', { prompts: c.more.prompts, answers: c.more.answers });
    if (c.status === 'imported' && c.imported) return t('desktopImport.st.importedAs', { name: c.imported.name || '?', gen: c.imported.gen });
    return t(`desktopImport.st.${c.status}`);
  };
  return (
    <div className="mt-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={box} className="mt-modal mt-dimport" data-role="desktop-import">
        <h3>{t('desktopImport.title')}</h3>
        <div className="mt-card-sub">{t('desktopImport.note')}</div>
        {error ? <div className="mt-warn mt-dimport-body" data-role="import-error">{errText(error)}</div>
          : !data ? <div className="mt-dimport-body dim">{t('desktopImport.loading')}</div>
          : <>
            <div className="mt-dimport-bar">
              <span data-role="import-counts">{t('desktopImport.counts', { total: data.total, picked: picked.size, running: data.running })}</span>
              <span className="mt-dimport-sp" />
              <button className="mt-btn small" data-action="import-all" disabled={busy || !pickable.length} onClick={() => setPicked(new Set(pickable.map((c) => c.appSessionId)))}>{t('desktopImport.selectAll')}</button>
              <button className="mt-btn small ghost" data-action="import-none" disabled={busy || !picked.size} onClick={() => setPicked(new Set())}>{t('desktopImport.selectNone')}</button>
            </div>
            <div className="mt-dimport-body mt-dimport-list" data-role="import-list">
              {!items.length && <div className="dim">{t('desktopImport.empty')}</div>}
              {data.repos.map((g) => (
                <div key={g.key || g.root || '-'} className="mt-dimport-repo" data-repo={g.name || ''}>
                  <div className="mt-dimport-repo-h" title={g.root || ''}><b>{g.name || t('desktopImport.noRepo')}</b> <span className="dim mono">{g.root || ''}</span></div>
                  {g.items.map((c) => {
                    const can = CAN.has(c.status);
                    return (
                      <label key={c.appSessionId} className={`mt-dimport-row${can ? '' : ' off'}`} data-app={c.appSessionId} data-status={c.status} data-running={c.running ? '1' : undefined} title={[c.cwd, c.convId].filter(Boolean).join('\n')}>
                        <input type="checkbox" disabled={!can || busy} checked={picked.has(c.appSessionId)} onChange={() => toggle(c.appSessionId)} />
                        <span className="mt-dimport-title">{c.title || c.convId || c.appSessionId}</span>
                        <span className={`mt-dimport-st st-${c.status}`} data-role="import-status">{statusText(c)}</span>
                        {c.running && <span className="mt-dimport-st warn" data-role="import-running">{t(c.runningWhere === 'terminal' ? 'desktopImport.runningTerminal' : 'desktopImport.running')}</span>}
                        {c.folder === 'repo' && can && <span className="mt-dimport-st" data-role="import-repo-folder" title={c.target || ''}>{t('desktopImport.repoFolder')}</span>}
                        <span className="mt-dimport-at dim">{agoText(c.lastActivityAt)}</span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          </>}
        <div className="mt-dimport-foot" data-role="import-foot">
          {busy && progress ? <span data-role="import-progress">{t('desktopImport.progress', { done: progress.done, total: progress.total })}</span>
            : result ? <span data-role="import-result" title={result.skipped.map((x) => `${x.title || x.appSessionId}: ${tOr(`desktopImport.why.${x.reason}`, x.message || x.reason)}`).join('\n')}>
              {t('desktopImport.result', { n: result.imported.length, skipped: result.skipped.length })}
              {result.skipped.length > 0 && ` · ${[...new Set(result.skipped.map((x) => tOr(`desktopImport.why.${x.reason}`, x.message || x.reason)))].join(', ')}`}
            </span>
            : runningPicked > 0 ? <span className="mt-warn" data-role="import-running-warn">{t('desktopImport.runningWarn', { n: runningPicked })}</span>
            : <span className="dim">{t('desktopImport.hint')}</span>}
        </div>
        <div className="mt-card-actions">
          <button className="mt-btn primary" data-action="import-run" disabled={busy || !picked.size || !!error} onClick={run}>{busy ? t('desktopImport.running2') : t('desktopImport.run', { n: picked.size })}</button>
          <button className="mt-btn ghost" data-action="import-close" disabled={busy} onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}
