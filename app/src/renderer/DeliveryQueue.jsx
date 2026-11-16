// P158·P172: 명령줄 위(CommandBar)와 휴대폰 세션 화면(Phone)의 전달 대기열.
// P158: 대기 글 고치기(DeliveryEdit). CommandBar.jsx에서 옮겼다.
// P172: 같은 받는 세션의 대기 글은 한 상자(QueueGroup)로 묶고, 바로 보내기(스티어링, atrium prompt --now와 같은 길)와 순서 바꾸기를 둔다.
//   묶기·차례·단추 켜짐은 lib/delivery-queue.js
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, toast, fillDeliveryTexts } from './store.js';
import { deliveryText, STATE_LABEL } from './lib/labels.js';
import { useT, errText } from './lib/i18n.js';
import { insertNewline } from './lib/cmd-input.js';
import { moveOrder, steerOf } from './lib/delivery-queue.js';

// P158: 수정 실패 까닭(이미 보냄, 이미 끝남, 빈 글)
export function editErr(t, e) {
  if (e && e.code === 'already_sent') return t('deliveryEdit.alreadySent');
  if (e && e.code === 'not_editable') return t('deliveryEdit.notEditable');
  if (e && e.code === 'empty') return t('deliveryEdit.empty');
  return t('deliveryEdit.failed', { error: errText(e) });
}

// P158: 고치는 칩. Enter 저장(Shift·Alt+Enter 줄바꿈), Esc 되돌림. 저장하면 대기열 차례 그대로 새 글로 간다.
//   저장하지 않고 사라지면(되돌림, 스레드 열기 등) 붙잡은 전달을 놓는다. 고치는 동안 그 전달이 끝나면(다른 곳에서 취소 등) 닫는다
export function DeliveryEdit({ d, text, onDone }) {
  const t = useT();
  const [val, setVal] = useState(text);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const settled = useRef(false);
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, []);
  useLayoutEffect(() => { const el = ref.current; if (!el) return; el.style.height = 'auto'; const full = el.scrollHeight + (el.offsetHeight - el.clientHeight); el.style.height = `${Math.min(full, 220)}px`; el.style.overflowY = full > 220 ? 'auto' : 'hidden'; }, [val]); // 테두리까지 더해 한 줄에 스크롤 막대가 생기지 않게
  useEffect(() => () => { if (!settled.current) api.call('delivery.release', { deliveryId: d.deliveryId }).catch(() => {}); }, [d.deliveryId]);
  useEffect(() => {
    if (d.status === 'queued' || settled.current) return;
    settled.current = true;
    if (['sending', 'sent', 'confirmed', 'unconfirmed'].includes(d.status)) toast(t('deliveryEdit.alreadySent'), 'error');
    onDone(null);
  }, [d.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const cancel = () => { settled.current = true; api.call('delivery.release', { deliveryId: d.deliveryId }).catch(() => {}); onDone(null); };
  async function save() {
    if (busy) return;
    if (!val.trim()) { toast(t('deliveryEdit.empty'), 'error'); return; }
    if (val === text) { cancel(); return; }
    setBusy(true);
    try {
      const r = await api.call('delivery.update', { deliveryId: d.deliveryId, text: val });
      settled.current = true;
      onDone(r.text ?? val);
    } catch (e) {
      setBusy(false);
      toast(editErr(t, e), 'error');
      if (e && (e.code === 'already_sent' || e.code === 'not_editable' || e.code === 'not_found')) { settled.current = true; onDone(null); }
    }
  }
  const onKey = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) { e.preventDefault(); save(); return; }
    if (e.key === 'Enter' && e.altKey) { e.preventDefault(); const el = e.currentTarget; const r = insertNewline(el.value, el.selectionStart, el.selectionEnd); setVal(r.text); requestAnimationFrame(() => el.setSelectionRange(r.caret, r.caret)); }
  };
  return (
    <div className="mt-delivery mt-delivery-edit ds-queued" data-delivery={d.deliveryId} data-status={d.status} data-editing="1">
      <div className="mt-delivery-edit-head"><b>@{d.name || '?'}</b><span className="mt-delivery-st">{t('deliveryEdit.holding')}</span></div>
      <textarea ref={ref} className="mt-delivery-edit-input" rows={1} value={val} disabled={busy} spellCheck={false} data-role="delivery-edit-input" aria-label={t('deliveryEdit.inputLabel')}
        onChange={(e) => setVal(e.target.value)} onKeyDown={onKey} />
      <div className="mt-delivery-edit-foot">
        <span className="mt-delivery-edit-hint">{t('deliveryEdit.hint')}</span>
        <button className="mt-btn ghost small" data-action="delivery-edit-cancel" onClick={cancel} disabled={busy}>{t('common.cancel')}</button>
        <button className="mt-btn small primary" data-action="delivery-edit-save" onClick={save} disabled={busy}>{t('common.save')}</button>
      </div>
    </div>
  );
}

// P172: 고치기 상태(명령줄과 휴대폰이 같이 쓴다). 백엔드가 그 전달을 붙잡고(보내지 않음) 전체 글을 돌려주면 그 줄이 글 칸으로 바뀐다
export function useDeliveryEditing(texts = {}) {
  const t = useT();
  const [editing, setEditing] = useState(null); // { id, text }
  async function startEdit(d) {
    try {
      const r = await api.call('delivery.hold', { deliveryId: d.deliveryId });
      setEditing({ id: d.deliveryId, text: r.text ?? texts[d.deliveryId] ?? d.text ?? '' });
    } catch (e) { toast(editErr(t, e), 'error'); }
  }
  return { editing, startEdit, stopEdit: () => setEditing(null) };
}

// P172: 바로 보내기·순서 바꾸기 실패 까닭
function queueErr(t, e) {
  if (e && e.code === 'cannot_steer') return t('deliveryQueue.now_kindBusy');
  if (e && e.code === 'editing') return t('deliveryQueue.editingNow');
  if (e && (e.code === 'already_sent' || e.code === 'not_editable')) return t('deliveryEdit.alreadySent');
  return t('deliveryQueue.failed', { error: errText(e) });
}

const shortText = (s, n = 80) => [...String(s ?? '').replace(/\s+/g, ' ')].slice(0, n).join('');

// P172: 한 받는 세션의 대기 글 묶음. 머리(@이름·상태·대기 수) 아래에 보낼 차례대로 한 줄씩.
//   대기 글마다 위·아래(대기 글이 둘 이상일 때), 바로 보내기, 수정, 취소. 줄에 초점이 있으면 Alt+↑·↓로도 옮긴다.
//   보내는 중·보낸 글(확인을 기다림)은 맨 앞에 상태만 보인다
export function QueueGroup({ g, texts = {}, edit, onSaved, phone = false }) {
  const t = useT();
  const s = useStore((st) => st.sessions.get(g.sessionId));
  const name = (s && s.name) || g.name || '?';
  const steer = steerOf(s);
  const queuedItems = g.items.filter((d) => d.status === 'queued');
  const many = queuedItems.length > 1;
  const listRef = useRef(null);
  const missing = g.items.some((d) => d.status === 'queued' && texts[d.deliveryId] == null && d.text == null);
  useEffect(() => { if (missing) fillDeliveryTexts(); }, [missing]);
  async function move(d, dir) {
    const ids = moveOrder(g.items, d.deliveryId, dir);
    if (!ids) return;
    try { await api.call('delivery.reorder', { ids }); } catch (e) { toast(queueErr(t, e), 'error'); return; }
    // 옮긴 줄에 초점을 남긴다(키보드로 이어 옮길 수 있게)
    requestAnimationFrame(() => { const el = listRef.current && listRef.current.querySelector(`[data-delivery="${d.deliveryId}"]`); if (el) el.focus(); });
  }
  async function sendNow(d) {
    try { await api.call('delivery.now', { deliveryId: d.deliveryId }); } catch (e) { toast(queueErr(t, e), 'error'); }
  }
  const onRowKey = (e, d) => {
    if (e.target !== e.currentTarget || !e.altKey) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); move(d, e.key === 'ArrowUp' ? -1 : 1); }
  };
  const stateText = s ? (STATE_LABEL[s.state] || s.state) : '';
  return (
    <div className={`mt-dq${phone ? ' phone' : ''}`} data-role="delivery-group" data-session={g.sessionId} role="group" aria-label={t('deliveryQueue.groupLabel', { name, n: g.queued })}>
      <div className="mt-dq-head">
        <b>@{name}</b>
        {stateText && <span className="mt-dq-state" data-state={s && s.state}>{stateText}</span>}
        <span className="mt-dq-count" data-role="delivery-group-count">{t('deliveryQueue.count', { n: g.queued })}</span>
      </div>
      <ol className="mt-dq-list" ref={listRef}>
        {g.items.map((d) => {
          if (edit && edit.editing && edit.editing.id === d.deliveryId) {
            return <li key={d.deliveryId} className="mt-dq-editrow"><DeliveryEdit d={{ ...d, name }} text={edit.editing.text} onDone={(text) => { edit.stopEdit(); if (text != null && onSaved) onSaved(d.deliveryId, text); }} /></li>;
          }
          const queued = d.status === 'queued';
          const qi = queuedItems.indexOf(d);
          return (
            <li key={d.deliveryId} className={`mt-dq-item ds-${d.status}`} data-delivery={d.deliveryId} data-status={d.status} data-editing={d.editing ? '1' : undefined}
              tabIndex={queued && many ? 0 : undefined} onKeyDown={queued && many ? (e) => onRowKey(e, d) : undefined} title={queued && many ? t('deliveryQueue.keysHint') : undefined}>
              <span className="mt-dq-no" aria-hidden="true">{queued ? qi + 1 : ''}</span>
              <span className="mt-dq-text">{shortText(texts[d.deliveryId] ?? d.text, phone ? 60 : 90) || <i>{t('deliveryQueue.chars', { n: d.chars || 0 })}</i>}</span>
              <span className="mt-dq-st">{d.editing ? t('deliveryQueue.editingElsewhere') : deliveryText(queued && qi > 0 && d.reason !== 'editing' ? { ...d, reason: null } : d)}</span>{/* 기다리는 까닭은 맨 앞 글의 것이다(뒤 글은 차례를 기다린다) */}
              {!queued && <span className="mt-spin" />}
              {queued && (
                <span className="mt-dq-acts">
                  {many && <button type="button" className="mt-btn ghost small icon" data-action="delivery-up" disabled={qi === 0} onClick={() => move(d, -1)} aria-label={t('deliveryQueue.up')} title={t('deliveryQueue.up')}>↑</button>}
                  {many && <button type="button" className="mt-btn ghost small icon" data-action="delivery-down" disabled={qi === queuedItems.length - 1} onClick={() => move(d, 1)} aria-label={t('deliveryQueue.down')} title={t('deliveryQueue.down')}>↓</button>}
                  {/* 꺼진 단추는 마우스를 받지 않아 풍선 도움말이 뜨지 않는다 → 까닭은 감싼 칸에 단다 */}
                  <span className="mt-dq-nowwrap" title={t(`deliveryQueue.now_${steer.key}`)} data-steer={steer.key}><button type="button" className="mt-btn ghost small now" data-action="delivery-now" disabled={!steer.ok || !!d.editing} onClick={() => sendNow(d)} aria-label={`${t('deliveryQueue.now')}: ${t(`deliveryQueue.now_${steer.key}`)}`}>{t('deliveryQueue.now')}</button></span>
                  {edit && <button type="button" className="mt-btn ghost small" data-action="delivery-edit" disabled={!!d.editing} onClick={() => edit.startEdit(d)} title={t('deliveryEdit.editTitle')}>{t('deliveryEdit.edit')}</button>}
                  <button type="button" className="mt-btn ghost small" data-action="delivery-cancel" onClick={() => api.call('delivery.cancel', { deliveryId: d.deliveryId }).catch((e) => toast(errText(e), 'error'))}>{t('common.cancel')}</button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
