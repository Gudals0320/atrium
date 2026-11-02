// 출력 보기(ARCH 4절 I1, P6c): 긴 답을 마크다운 문서로 보는 창. 노드 머리줄의 "출력 보기"로 연다(요약 output.long).
// - 지난 턴 넘기기(◀ ▶, 턴 목록), 바로 답장(session.send { source: 'output' }, B1 규칙 그대로), .md 저장(판 데이터 폴더의 outputs/<워크스페이스>/).
// - 마지막 턴을 보는 동안 새 답이 나오면 다시 읽는다. 캔버스 오른쪽에 떠 있고 캔버스는 그대로 움직인다.
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, getState, setOutputView, toast } from './store.js';
import { Markdown } from './Markdown.jsx';
import { StatePill } from './SessionNode.jsx';
import { agoText } from './lib/labels.js';
import { useT, errText, tOr, fmtDateTime } from './lib/i18n.js';

const SOURCE = (src) => tOr(`output.source.${src}`, src || '');

export function OutputPanel() {
  const tr = useT();
  const view = useStore((st) => st.outputView);
  const s = useStore((st) => (view ? st.sessions.get(view.sessionId) : null));
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState(null);
  const [list, setList] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(null);
  const latest = !view || view.turn == null;
  const tick = s ? s.lastAnswerAt || 0 : 0;
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!view) return;
    let alive = true;
    setErr(null);
    const read = (top) => api.call('output.get', { session: view.sessionId, turn: view.turn ?? undefined }).then((d) => { if (alive) { setDoc(d); if (top && bodyRef.current) bodyRef.current.scrollTop = 0; } }).catch((e) => alive && setErr(errText(e)));
    read(true);
    // 마지막 턴을 볼 때: 턴이 끝난(Stop hook) 직후에는 대화 기록 파일에 마지막 줄이 아직 없을 수 있어 조금 뒤 한 번 더 읽는다
    const again = latest && tick ? setTimeout(() => read(false), 1500) : null;
    return () => { alive = false; clearTimeout(again); };
  }, [view && view.sessionId, view && view.turn, latest ? tick : 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSaved(null); setReply(''); setList(false); }, [view && view.sessionId]);
  useEffect(() => {
    if (!view) return;
    const onKey = (e) => { if (e.key === 'Escape' && !(e.target && e.target.tagName === 'TEXTAREA')) setOutputView(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);
  if (!view) return null;

  const t = doc && doc.turn;
  const n = t ? t.turn : null;
  const go = (turn) => setOutputView({ sessionId: view.sessionId, turn: doc && turn === doc.turnCount ? null : turn });
  const save = async () => {
    try { const r = await api.call('output.save', { session: view.sessionId, turn: n ?? undefined }); setSaved(r); toast(tr('output.savedToast', { file: r.file })); } catch (e) { toast(tr('output.saveFailed', { error: errText(e) }), 'error'); }
  };
  const send = async () => {
    const text = reply.trim();
    if (!text || !s) return;
    setSending(true);
    try { await api.call('session.send', { target: [s.name], text, source: 'output' }); setReply(''); toast(tr('output.replied', { name: s.name })); } catch (e) { toast(tr('output.replyFailed', { error: errText(e) }), 'error'); }
    setSending(false);
  };

  return (
    <div className="mt-output" data-role="output" data-session={view.sessionId} data-turn={n ?? ''}>
      <div className="mt-output-head">
        <b className="mt-output-name" onClick={() => getState().navigateTo && getState().navigateTo(view.sessionId)} title={tr('output.goNode')}>@{s ? s.name : doc ? doc.name : '?'}</b>
        {s && <StatePill s={s} />}
        <span className="dim">{doc && doc.workspace ? doc.workspace : ''}</span>
        <span className="mt-node-sp" />
        {doc && doc.turnCount > 0 && <>
          <button className="mt-btn small ghost" data-action="turn-prev" disabled={!n || n <= 1} onClick={() => go(n - 1)}>◀</button>
          <button className="mt-btn small ghost" data-action="turn-list" onClick={() => setList((x) => !x)} title={tr('output.turnList')}>{tr('output.turnOf', { n: n ?? '-', total: doc.turnCount })}</button>
          <button className="mt-btn small ghost" data-action="turn-next" disabled={!n || n >= doc.turnCount} onClick={() => go(n + 1)}>▶</button>
        </>}
        <button className="mt-btn small" data-action="output-save" disabled={!t} onClick={save} title={tr('output.saveTitle')}>{tr('output.save')}</button>
        <button className="mt-x" data-action="output-close" title={tr('output.close')} onClick={() => setOutputView(null)}>×</button>
      </div>
      {list && doc && (
        <div className="mt-output-turns" data-role="turn-list">
          {[...doc.turns].reverse().map((x) => (
            <div key={x.turn} className={`mt-output-turn${x.turn === n ? ' on' : ''}`} data-turn={x.turn} onClick={() => { go(x.turn); setList(false); }}>
              <b>{tr('output.turn', { n: x.turn })}</b> <span className="dim">{agoText(x.answerAt)} · {tr('output.chars', { n: x.chars })}{x.long ? tr('output.long') : ''}</span>
              <div className="mt-output-turn-p">▶ {x.prompt || tr('output.noPrompt')}</div>
              <div className="mt-output-turn-a">● {x.answerHead || tr('output.noAnswer')}</div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-output-body nowheel" ref={bodyRef}>
        {err && <div className="mt-warn">{err}</div>}
        {!doc && !err && <div className="dim">{tr('common.loading')}</div>}
        {doc && !t && <div className="dim">{tr('output.empty')}</div>}
        {t && <>
          <div className="mt-output-meta dim">{tr('output.turn', { n: t.turn })}{t.answerAt ? ` · ${fmtDateTime(t.answerAt)}` : ''}{t.tools ? tr('output.tools', { n: t.tools }) : ''} · {SOURCE(doc.source)}</div>
          {t.prompt && <blockquote className="mt-output-prompt" data-role="output-prompt">{t.prompt}</blockquote>}
          <Markdown text={t.answer || ''} className="mt-output-doc" />
        </>}
        {saved && <div className="mt-ok" data-role="output-saved">{tr('output.saved', { file: saved.file, bytes: saved.bytes })}</div>}
      </div>
      <div className="mt-output-reply">
        <textarea value={reply} rows={Math.min(5, Math.max(2, reply.split('\n').length))} data-field="output-reply" spellCheck={false}
          placeholder={s && s.kind === 'shell' ? tr('output.noShellReply') : tr('output.replyPh', { name: s ? s.name : '' })} disabled={!s || s.kind === 'shell'}
          onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
        <button className="mt-btn primary" data-action="output-send" disabled={sending || !reply.trim() || !s} onClick={send}>{sending ? tr('output.sending') : tr('output.reply')}</button>
      </div>
    </div>
  );
}
