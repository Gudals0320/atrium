// P334: 일 기록 보기. 워커가 `atrium done … --record <파일>`로 남긴 결과 파일(판이 주 체크아웃의 .atrium/records/<이름>-<일>/로 복사, git 밖)을 연다.
// - 세션 요약의 records { unitId, dir, count, files, at }(그 세션이 맡아 기록을 남긴 마지막 일)이 있으면 PC 카드 머리줄·세션 맵 카드(휴대폰 맵도)에 "기록 n" 단추가 붙는다.
// - 창은 판 API records.read { unit, file }로 읽고, 마크다운이면 Markdown으로, 그 밖의 글은 그대로 보인다. 파일이 여럿이면 위 줄에서 고른다. Esc·×로 닫는다.
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useStore, setRecordView, toast } from './store.js';
import { Markdown } from './Markdown.jsx';
import { useT, errText, fmtDateTime } from './lib/i18n.js';

// 카드의 단추(세션 요약 records가 있을 때만). where: node | map
export function RecordChip({ sessionId, where = 'node' }) {
  const t = useT();
  const rec = useStore((st) => { const s = st.sessions.get(sessionId); return s && s.records ? s.records : null; });
  if (!rec || !rec.count) return null;
  const open = (e) => { e.stopPropagation(); e.preventDefault(); setRecordView({ sessionId, unitId: rec.unitId, file: null }); };
  return (
    <button type="button" className={`mt-rec-chip nodrag ${where}`} data-action="record-open" data-role="record-chip" data-unit={rec.unitId} data-count={rec.count}
      title={t('records.chipTitle', { n: rec.count, dir: rec.dir })} onClick={open} onDoubleClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {t('records.chip', { n: rec.count })}
    </button>
  );
}

export function RecordPanel() {
  const t = useT();
  const view = useStore((st) => st.recordView);
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!view) return undefined;
    let alive = true;
    setErr(null);
    api.call('records.read', { unit: view.unitId, file: view.file || undefined }).then((d) => { if (alive) setDoc(d); }).catch((e) => alive && setErr(errText(e)));
    return () => { alive = false; };
  }, [view && view.unitId, view && view.file]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!view) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setRecordView(null); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [view]);
  useEffect(() => { if (!view) setDoc(null); }, [view]);
  if (!view) return null;
  const d = doc && doc.unitId === view.unitId ? doc : null;
  const cur = d ? d.doc : null;
  const copy = async () => { if (!cur) return; try { await navigator.clipboard.writeText(cur.path); toast(t('records.copied')); } catch { toast(cur.path); } };
  return (
    <div className="mt-record" data-role="record-view" data-unit={view.unitId} data-file={cur ? cur.name : ''}>
      <div className="mt-record-head">
        <b className="mt-record-title">{t('records.title', { name: d ? d.session : '…' })}</b>
        {d && <span className="dim mt-record-spec" title={d.spec}>{d.spec}</span>}
        <span className="mt-node-sp" />
        <button className="mt-x" data-action="record-close" title={t('records.close')} onClick={() => setRecordView(null)}>×</button>
      </div>
      {d && d.files.length > 1 && (
        <div className="mt-record-files" data-role="record-files">
          {d.files.map((f) => (
            <button key={f.name} type="button" className={`mt-record-file${cur && cur.name === f.name ? ' on' : ''}`} data-action="record-file" data-file={f.name} onClick={() => setRecordView({ ...view, file: f.name })}>{f.name}</button>
          ))}
        </div>
      )}
      {cur && (
        <div className="mt-record-path dim" data-role="record-path">
          <span title={cur.path}>{cur.path}</span>
          <button type="button" className="mt-btn small ghost" data-action="record-copy" onClick={copy}>{t('records.copyPath')}</button>
          {d.at ? <span>· {fmtDateTime(d.at)}</span> : null}
        </div>
      )}
      <div className="mt-record-body nowheel">
        {err && <div className="mt-warn">{err}</div>}
        {!d && !err && <div className="dim">{t('common.loading')}</div>}
        {cur && cur.binary && <div className="dim">{t('records.binary', { bytes: cur.bytes })}</div>}
        {cur && !cur.binary && (cur.markdown ? <Markdown text={cur.text || ''} className="mt-output-doc" /> : <pre className="mt-record-pre">{cur.text}</pre>)}
        {cur && cur.clipped && <div className="dim">{t('records.clipped')}</div>}
      </div>
    </div>
  );
}
