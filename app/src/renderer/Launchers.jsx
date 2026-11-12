// P33 설정의 "호출자" 탭: 호출자 목록(이름, 하네스 아이콘, 명령 미리보기, 즐겨찾기, 순서, 고치기, 지우기)과 만들기·고치기 틀.
// 만들기는 두 길이다. (a) 하네스를 고르고 드롭다운(모델은 알려진 목록 + 직접 입력, 노력 수준, 권한 모드)을 조합한다. (b) 하네스 "직접 명령"을 골라 명령 한 줄을 쓴다.
// 고르는 대로 백엔드 launcher.preview가 확인하고 실제 명령줄을 미리 보인다. 고급 칸은 추가 인자, 환경 변수(이름=값), 게이트웨이 확인 주소다.
// 환경 변수 값은 판 기록에 평문으로 남으므로 API 키 같은 비밀값을 넣지 말라는 풀이를 늘 보이고, 비밀값처럼 보이는 이름이면 경고한다.
// P97: 틀 맨 위에 명령줄 붙여 넣기 칸(PasteLine). 실행 명령 칸(예: 래퍼 명령)이 있고, 추가 인자는 고급 밖에 둔다. "레일에 고정"은 만들기 단추 옆(기본 켜짐).
// P115: 연결 칸(설정의 연결 탭에서 만든 연결). 그 하네스가 쓰지 않는 프로토콜의 연결은 고를 수 없게 흐리게 까닭과 함께 보인다. 실행 명령은 모든 에이전트 하네스.
//       env에 평문 인증 값이 든 런처는 목록 위에 알린다(판은 옮기지 않는다).
// P28 원칙: 최소 창(900×600)에서도 스크롤 없이 들어간다. 목록이 길면 목록 칸만 넘긴다.
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, toast, loadLaunchers } from './store.js';
import { KindIcon } from './SessionNode.jsx';
import { Icon } from './lib/icons.jsx';
import { useT, errText } from './lib/i18n.js';
import { ICONS, orderedLaunchers, moveFavorite, launcherIcon, launcherMark, previewLine, envToText, secretNames, harnessFields, harnessModels, harnessModelLabels, modelChoices, blankLauncher, recognizedChips, fillFromParse, connectionChoices, harnessProtocols } from './lib/launchers.js';

const EFFORTS = ['', 'low', 'medium', 'high', 'xhigh', 'max'];
const MODES = ['manual', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'];

export function LauncherIcon({ l }) {
  const k = launcherIcon(l);
  if (k === 'shell') return <span className="mt-ln-ico"><Icon name="terminal" /></span>;
  if (k) return <span className="mt-ln-ico"><KindIcon kind={k} badge /></span>;
  return <span className="mt-ln-ico mark">{launcherMark(l)}</span>;
}

const call = async (m, p, t, ok) => { try { const r = await api.call(m, p); if (ok) toast(ok); return r; } catch (e) { toast(t('launchers.saveFailed', { error: errText(e) }), 'error'); return null; } };

function LauncherList({ data, onEdit }) {
  const t = useT();
  const rows = orderedLaunchers(data);
  const favs = data.favorites || [];
  const [sure, setSure] = useState(null); // 지우기는 두 번 누른다(한 번 누르면 '지울까요?'로 바뀐다)
  const move = (id, d) => { const ids = moveFavorite(favs, id, d); if (ids) call('launcher.order', { ids }, t); };
  const del = async (l) => { if (sure !== l.id) { setSure(l.id); return; } setSure(null); await call('launcher.delete', { id: l.id }, t, t('launchers.deleted', { name: l.name })); };
  return (
    <div className="mt-ln" data-role="launchers-list">
      <p className="mt-set-note">{t('launchers.note')}</p>
      <div className="mt-ln-rows">
        {(data.notices || []).map((n) => <div key={n.id} className="mt-ln-secret warn" data-role="launcher-plain-auth" data-launcher={n.id}>{t('connections.plainNotice', { name: n.name, names: n.env.join(', ') })}</div>)}
        {rows.map((l) => {
          const fi = favs.indexOf(l.id);
          return (
            <div key={l.id} className={`mt-ln-row${l.favorite ? ' fav' : ''}`} data-role="launcher-row" data-launcher={l.id} data-name={l.name}>
              <button type="button" className={`mt-ln-star${l.favorite ? ' on' : ''}`} data-action="launcher-favorite" title={l.favorite ? t('launchers.unfavorite') : t('launchers.favorite')} aria-pressed={l.favorite} onClick={() => call('launcher.favorite', { id: l.id, favorite: !l.favorite }, t)}>{l.favorite ? '★' : '☆'}</button>
              <LauncherIcon l={l} />
              <span className="mt-ln-name" title={l.name}>{l.name}</span>
              <span className="mt-ln-line mono" title={previewLine(l.preview, t('launchers.shellPreview'))}>{previewLine(l.preview, t('launchers.shellPreview'))}{l.preview && l.preview.env && l.preview.env.length ? <span className="dim"> · {t('launchers.envShort')}: {l.preview.env.join(', ')}</span> : null}</span>
              <span className="mt-ln-acts">
                <button type="button" className="mt-btn small ghost" data-action="launcher-up" disabled={fi <= 0} title={t('launchers.up')} onClick={() => move(l.id, -1)}>↑</button>
                <button type="button" className="mt-btn small ghost" data-action="launcher-down" disabled={fi < 0 || fi >= favs.length - 1} title={t('launchers.down')} onClick={() => move(l.id, 1)}>↓</button>
                <button type="button" className="mt-btn small" data-action="launcher-edit" onClick={() => onEdit(l)}>{t('launchers.edit')}</button>
                <button type="button" className={`mt-btn small ${sure === l.id ? 'danger' : 'ghost'}`} data-action="launcher-delete" title={t('launchers.delete')} onBlur={() => sure === l.id && setSure(null)} onClick={() => del(l)}>{sure === l.id ? t('launchers.deleteSure') : <Icon name="x" />}</button>
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-ln-foot">
        <button type="button" className="mt-btn small primary" data-action="launcher-new" onClick={() => onEdit(blankLauncher('claude'))}>{t('launchers.new')}</button>
        <button type="button" className="mt-btn small" data-action="launcher-new-command" onClick={() => onEdit(blankLauncher('command'))}>{t('launchers.newCommand')}</button>
        <span className="mt-set-hint">{t('launchers.railHint')}</span>
      </div>
    </div>
  );
}

// P72: 모델 입력칸. 누르면 아래에 하네스가 아는 모델(Codex는 Codex의 목록)이 뜨고, 고르거나 직접 친다.
// 브라우저의 datalist는 친 글자로 목록을 줄여 다른 모델이 안 보이므로 창 안 목록으로 그린다. Esc는 목록만 닫는다
function ModelInput({ value, onChange, models, labels, placeholder }) {
  const [open, setOpen] = useState(false);
  const shown = modelChoices(models, labels, value);
  const pick = (m) => { onChange(m); setOpen(false); };
  return (
    <span className="mt-ln-model">
      <input className="mt-set-text" data-field="launcher-model" value={value} autoComplete="off" spellCheck={false} role="combobox" aria-expanded={open && shown.length > 0} onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); } }} placeholder={placeholder} />
      {open && shown.length > 0 && (
        <span className="mt-ln-models" role="listbox" data-role="launcher-models">
          {shown.map((m) => <button type="button" key={m} role="option" tabIndex={-1} aria-selected={m === value} className={m === value ? 'on' : ''} data-model={m} onMouseDown={(e) => { e.preventDefault(); pick(m); }}><span className="mono">{m}</span>{labels[m] ? <span className="dim">{labels[m]}</span> : null}</button>)}
        </span>
      )}
    </span>
  );
}

// P97: 명령줄 붙여 넣기 칸. 붙여 넣거나 Enter·채우기를 누르면 백엔드 launcher.parse가 하네스·실행 명령·모델·옵션·추가 인자·환경 변수로 나누고,
// 아래 칸을 채운 뒤 무엇으로 알아봤는지 칩으로 보인다. 여러 줄(PowerShell `·bash \ 이어 쓰기)을 받으려고 textarea다(input은 붙여 넣은 줄바꿈을 지운다)
function PasteLine({ onParsed, autoFocus, except }) {
  const t = useT();
  const [text, setText] = useState('');
  const [rec, setRec] = useState(null);
  const [busy, setBusy] = useState(false);
  const last = useRef('');
  const ref = useRef(null);
  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);
  const parse = async (v = text) => {
    if (!v.trim() || busy) return;
    last.current = v; setBusy(true);
    try { const r = await api.call('launcher.parse', { text: v, ...(except ? { except } : {}) }); setRec(r.recognized); onParsed(r); }
    catch (e) { setRec(null); toast(t('launcherPaste.failed', { error: errText(e) }), 'error'); }
    setBusy(false);
  };
  const onPaste = (e) => {
    const v = e.clipboardData.getData('text');
    if (!v) return;
    e.preventDefault();
    const el = e.currentTarget;
    const next = text.slice(0, el.selectionStart) + v + text.slice(el.selectionEnd);
    setText(next); parse(next);
  };
  const lines = Math.min(4, Math.max(1, text.split(/\r?\n/).length));
  const chipText = (c) => t(c.key, { ...c.vars, ...(c.vars.field ? { field: t(`launcherPaste.field.${c.vars.field}`) } : {}), ...(c.vars.harness ? { harness: harnessLabel(c.vars.harness, t) } : {}) });
  return (
    <div className="mt-ln-paste wide" data-role="launcher-paste">
      <label className="mt-ln-f wide"><span>{t('launcherPaste.label')}</span>
        <span className="mt-ln-paste-row">
          <textarea ref={ref} className="mt-set-text mono" rows={lines} data-field="launcher-paste" value={text} spellCheck={false} autoComplete="off" placeholder={t('launcherPaste.ph')} aria-describedby="mt-ln-paste-note"
            onChange={(e) => setText(e.target.value)} onPaste={onPaste}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); parse(); } }}
            onBlur={() => { if (text.trim() && text !== last.current) parse(); }} />
          <button type="button" className="mt-btn small" data-action="launcher-parse" disabled={busy || !text.trim()} onClick={() => parse()}>{t('launcherPaste.fill')}</button>
        </span>
      </label>
      <div className="mt-ln-chips" id="mt-ln-paste-note" data-role="launcher-recognized" data-as={rec ? rec.as : ''} data-board={rec && rec.board ? '1' : '0'} aria-live="polite">
        {rec ? recognizedChips(rec).map((c, i) => <span key={i} className={`mt-ln-chip ${c.tone}`}>{chipText(c)}</span>) : <span className="mt-set-hint">{t('launcherPaste.hint')}</span>}
      </div>
    </div>
  );
}
const harnessLabel = (h, t) => (h === 'claude' ? 'Claude Code' : h === 'codex' ? 'Codex' : h === 'command' ? t('launchers.harness.command') : h === 'shell' ? t('launchers.harness.shell') : h);
// P115: 연결 고르기. 쓸 수 없는 연결은 disabled와 까닭(프로토콜)
function ConnectionSelect({ value, onChange, connections, harnesses, harness }) {
  const t = useT();
  const choices = connectionChoices(connections, harnesses, harness);
  const ps = harnessProtocols(harnesses, harness);
  const cur = choices.find((c) => c.id === value);
  return (
    <label className="mt-ln-f"><span>{t('launcherConn.label')}</span>
      <select data-field="launcher-connection" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('launcherConn.none')}</option>
        {choices.map((c) => <option key={c.id} value={c.id} disabled={!c.ok && c.id !== value} title={c.ok ? c.baseUrl : t('launcherConn.unusable', { protocol: t(`connections.protocols.${c.protocol}`) })}>{c.name}{c.ok ? '' : ` — ${t('launcherConn.unusable', { protocol: t(`connections.protocols.${c.protocol}`) })}`}</option>)}
      </select>
      <span className={`mt-set-hint${cur && !cur.ok ? ' bad' : ''}`} data-role="launcher-connection-hint">{ps.length ? t('launcherConn.hint', { harness: harnessLabel(harness, t), protocols: ps.map((p) => t(`connections.protocols.${p}`)).join(', ') }) : t('launcherConn.noProtocols')}</span>
    </label>
  );
}

function LauncherForm({ init, harnesses, connections = [], onDone, focusPaste = false }) {
  const t = useT();
  const [d, setD] = useState(() => ({ ...init, startCommand: init.startCommand || '', connection: init.connection || '', envText: envToText(init.env) }));
  const [kinds, setKinds] = useState([]);
  const [pv, setPv] = useState(null); // { line, env } 또는 { error }
  const [busy, setBusy] = useState(false);
  const [fav, setFav] = useState(!init.id);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const fields = harnessFields(harnesses, d.harness);
  const has = (f) => fields.includes(f);
  const body = () => ({ id: d.id || undefined, name: d.name || '…', harness: d.harness, icon: d.icon, model: d.model, effort: d.effort, permissionMode: d.permissionMode || 'manual', args: d.args, env: d.envText, command: d.command, connection: d.connection || '', startCommand: d.startCommand });
  const named = (harnesses || []).filter((h) => !['shell', 'command'].includes(h.id)).map((h) => h.id); // P115: 백엔드 하네스 표(Claude Code, Codex, opencode, pi)
  useEffect(() => { api.call('agent.kinds').then((ks) => setKinds(ks.map((k) => k.kind).filter((k) => !['claude', 'codex', 'opencode', 'pi'].includes(k)))).catch(() => {}); loadLaunchers(); }, []); // P72: 틀을 열 때 하네스 모델 목록(Codex 캐시)을 새로 받는다
  // 고르는 대로 미리보기(백엔드가 확인한다). 이름이 비었으면 이름 검사만 건너뛴다
  useEffect(() => {
    const tm = setTimeout(() => {
      if (d.harness === 'command' && !d.command.trim()) { setPv({ line: '', env: [] }); return; }
      api.call('launcher.preview', { launcher: body() }).then((r) => setPv(r.preview)).catch((e) => setPv({ error: errText(e) }));
    }, 180);
    return () => clearTimeout(tm);
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  // P97: 붙여 넣은 명령줄로 칸을 채운다(이름은 비었을 때만 제안 이름)
  const onParsed = (r) => setD((x) => { const n = fillFromParse(x, r.launcher); return { ...n, permissionMode: n.permissionMode || 'manual', envText: envToText(n.env) }; });
  const save = async () => {
    if (!d.name.trim()) { setPv({ error: t('launchers.err.name', { max: 40 }) }); return; }
    setBusy(true);
    const b = { ...body(), name: d.name };
    const r = d.id ? await call('launcher.update', { id: d.id, patch: b }, t, t('launchers.saved', { name: d.name })) : await call('launcher.create', { launcher: b, favorite: fav }, t, t(fav ? 'launcherPin.created' : 'launchers.created', { name: d.name }));
    setBusy(false);
    if (r) onDone();
  };
  const secrets = secretNames(d.envText);
  const models = harnessModels(harnesses, d.harness);
  const labels = harnessModelLabels(harnesses, d.harness);
  const shellText = t('launchers.shellPreview');
  const warns = pv && !pv.error ? pv.warns || (pv.warn ? [pv.warn] : []) : [];
  return (
    <div className="mt-ln-form" data-role="launcher-form" data-harness={d.harness}>
      <div className="mt-ln-grid">
        <PasteLine onParsed={onParsed} autoFocus={focusPaste || !init.id} except={d.id || undefined} />
        <label className="mt-ln-f"><span>{t('launchers.name')}</span><input className="mt-set-text" data-field="launcher-name" value={d.name} maxLength={40} onChange={(e) => set('name', e.target.value)} placeholder={t('launchers.namePh')} /></label>
        <label className="mt-ln-f"><span>{t('launchers.harnessLabel')}</span>
          <select data-field="launcher-harness" value={d.harness} onChange={(e) => set('harness', e.target.value)}>
            {(named.length ? named : ['claude', 'codex']).map((h) => <option key={h} value={h}>{(harnesses.find((x) => x.id === h) || {}).label || harnessLabel(h, t)}</option>)}
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
            {![...named, 'claude', 'codex', 'shell', 'command', ...kinds].includes(d.harness) && <option value={d.harness}>{d.harness}</option>}
            <option value="shell">{t('launchers.harness.shell')}</option>
            <option value="command">{t('launchers.harness.command')}</option>
          </select>
        </label>
        {has('connection') && <ConnectionSelect value={d.connection} onChange={(v) => set('connection', v)} connections={connections} harnesses={harnesses} harness={d.harness} />}
        {has('startCommand') && <label className="mt-ln-f"><span>{t('launcherStart.label')}</span><input className="mt-set-text mono" data-field="launcher-startCommand" value={d.startCommand} spellCheck={false} autoComplete="off" onChange={(e) => set('startCommand', e.target.value)} placeholder={t('launcherStart.ph')} title={t('launcherStart.title')} /></label>}
        {has('command') ? (
          <label className="mt-ln-f wide"><span>{t('launchers.command')}</span><input className="mt-set-text mono" data-field="launcher-command" value={d.command} onChange={(e) => set('command', e.target.value)} placeholder={t('launchers.commandPh')} /></label>
        ) : has('model') ? (
          <label className="mt-ln-f"><span>{t('launchers.model')}</span>
            <ModelInput value={d.model} onChange={(v) => set('model', v)} models={models} labels={labels} placeholder={t('launchers.modelPh')} />
          </label>
        ) : <span />}
        {has('effort') && <label className="mt-ln-f"><span>{t('settings.effort')}</span>
          <select data-field="launcher-effort" value={d.effort} onChange={(e) => set('effort', e.target.value)}>{EFFORTS.map((o) => <option key={o} value={o}>{o === '' ? t('settings.effortDefault') : o}</option>)}</select>
        </label>}
        {has('permissionMode') && <label className="mt-ln-f"><span>{t('settings.permissionMode')}</span>
          <select data-field="launcher-permissionMode" value={d.permissionMode || 'manual'} onChange={(e) => set('permissionMode', e.target.value)}>{MODES.map((o) => <option key={o}>{o}</option>)}</select>
        </label>}
        {/* P97: 추가 인자는 고급 밖(드롭다운으로 시작해도 같은 화면에서 실행 명령과 함께 고친다) */}
        {has('args') && <label className="mt-ln-f"><span>{t('launchers.args')}</span><input className="mt-set-text mono" data-field="launcher-args" value={d.args} onChange={(e) => set('args', e.target.value)} placeholder={t('launchers.argsPh')} /></label>}
        {has('args') ? <span /> : null}
        <div className="mt-set-sub wide">{t('launchers.advanced')}</div>
        <label className="mt-ln-f"><span>{t('launchers.icon')}</span>
          <select data-field="launcher-icon" value={d.icon} onChange={(e) => set('icon', e.target.value)}>
            <option value="">{t('launchers.iconAuto')}</option>
            {ICONS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <span />
        {has('env') && <label className="mt-ln-f wide"><span>{t('launchers.env')}</span><textarea className="mono" rows={2} data-field="launcher-env" value={d.envText} onChange={(e) => set('envText', e.target.value)} placeholder="NAME=value" /></label>}
      </div>
      {has('env') && <div className={`mt-ln-secret${secrets.length ? ' warn' : ''}`} data-role="launcher-secret">{secrets.length ? t('launchers.secretWarn', { names: secrets.join(', ') }) : t('launchers.secretNote')}</div>}
      <div className={`mt-ln-preview mono${pv && pv.error ? ' bad' : ''}`} data-role="launcher-form-preview">
        {pv && pv.error ? pv.error : pv ? <>
          <span className="dim">{pv.typed ? t('launchers.previewTyped') : pv.board ? t('launchers.previewBoard') : '$ '}</span>{previewLine(pv, shellText)}{pv.env && pv.env.length ? <span className="dim"> · {t('launchers.envShort')}: {pv.env.join(', ')}</span> : null}
        </> : '…'}
      </div>
      {warns.map((w, i) => <div key={i} className="mt-ln-secret warn" data-role={w.key === 'launcherStart.notFound' ? 'launcher-start-warn' : 'launcher-model-warn'}>{t(w.key, w.vars)}</div>)}
      <div className="mt-ln-foot">
        <button type="button" className="mt-btn small primary" data-action="launcher-save" disabled={busy} onClick={save}>{d.id ? t('launchers.save') : t('launchers.create')}</button>
        {/* P97: 만들면서 레일에 고정(기본 켜짐). 만들기 단추 바로 옆 */}
        {!d.id && <label className="mt-ln-f check mt-ln-pin"><input type="checkbox" data-field="launcher-favorite" checked={fav} onChange={(e) => setFav(e.target.checked)} /><span>{t('launcherPin.label')}</span></label>}
        <button type="button" className="mt-btn small ghost" data-action="launcher-cancel" onClick={onDone}>{t('common.cancel')}</button>
      </div>
    </div>
  );
}

// startNew: P97 레일 +로 열면 새 런처 틀(명령줄 붙여 넣기 칸에 초점)부터
export function LaunchersTab({ startNew = false }) {
  const t = useT();
  const data = useStore((st) => st.launchers);
  const [editing, setEditing] = useState(() => (startNew ? blankLauncher('claude') : null));
  if (!data) return <div className="dim">{t('settings.loading')}</div>;
  return editing ? <LauncherForm key={editing.id || 'new'} init={editing} harnesses={data.harnesses} connections={data.connections || []} focusPaste={startNew} onDone={() => setEditing(null)} /> : <LauncherList data={data} onEdit={setEditing} />;
}
