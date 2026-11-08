// 새 세션 시작(ARCH 4절 B3): 이름, 폴더, 모델, 권한 모드, 첫 지시. 처음 쓰는 폴더면 신뢰 확인이 필요하다고 미리 보여준다.
// P4(F5): herdr가 아는 에이전트 종류를 고른다. Claude Code가 아니면 판의 hook이 없으니 상태는 herdr로만, 인자는 그 하네스의 것을 그대로 넘긴다.
// P5: 폴더는 지금 워크스페이스의 저장소 루트가 기본이다. 다른 저장소의 폴더를 고르면 그 세션은 그 저장소의 워크스페이스에 생긴다(G1).
//     종류 "셸(PowerShell)"은 에이전트 없이 패널만 연다(G2).
// P33: 띄우는 방법은 호출자(설정의 호출자 탭)다. 창 맨 위에서 호출자를 고르면 그 값으로 띄우고, 여기서 바꾼 모델은 호출자 값을 덮는다(session.spawn { launcher, model }).
//     "직접 고르기"는 옛 방식(종류, 모델, 권한 모드, 인자)이다. 왼쪽 레일의 즐겨찾기 호출자는 이 창 없이 quickSpawn으로 띄우고(P97: 먼저 이름 칸 QuickName.jsx), Shift+누르기는 그 호출자를 채워 이 창을 연다.
//     칩 "새 세션…"과 영역의 "+ 세션"은 첫 즐겨찾기 호출자를 고른 채로 연다.
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { toast, getState, wsName, openDialog, goWhenOpen } from './store.js';
import { useT, t, errText } from './lib/i18n.js';
import { kindOf } from './lib/kinds.js';
import { favoriteLaunchers, orderedLaunchers, previewLine } from './lib/launchers.js';
import { useDialog } from './dialog.js';

export const startedText = (r) => t('spawn.started', { name: r.name, kind: r.flavor ? t('spawn.startedKind', { kind: kindOf(r.flavor).label + (r.command ? t('spawn.startedCommand') : '') }) : r.command ? t('spawn.startedKind', { kind: t('launchers.harness.command') }) : r.kind !== 'claude' ? t('spawn.startedKind', { kind: r.kind === 'shell' ? t('spawn.shell') : r.kind }) : '', trust: r.trust && r.trust.needsTrust ? t('spawn.startedTrust') : '', ws: r.workspaceKey && r.workspaceKey !== getState().currentWs ? t('spawn.startedWs', { ws: wsName(r.workspaceKey) || r.workspaceRoot }) : '' });

const findLauncher = (id) => { const d = getState().launchers; return (d && d.launchers.find((l) => l.id === id)) || null; };
const MODEL_HARNESS = new Set(['claude', 'codex']);
// 개발용 판은 모델을 비운 Claude Code 호출자를 haiku로 띄운다(api.info.defaultModel)
export const devModel = (l) => (l && l.harness === 'claude' && !l.model ? (api.info || {}).defaultModel || '' : '');

let quickBusy = false;
// 지금 워크스페이스의 폴더에 그 호출자로 띄우고 그 터미널로 들어간다. 지금 워크스페이스가 없으면 폴더를 묻는 창을 연다
// P97: name은 레일 이름 칸에 친 세션 이름(없으면 판이 짓는다). 돌려주는 값: true(띄움), false(실패, 알림을 보였다), 'dialog'(새 세션 창을 열었다), null(이미 띄우는 중)
export async function quickSpawn(launcherId, name) {
  const st = getState();
  const cur = st.workspaces.find((w) => w.key === st.currentWs);
  if (!cur) { openDialog({ kind: 'spawn', launcher: launcherId }); return 'dialog'; }
  if (quickBusy) return null;
  quickBusy = true;
  const p = { cwd: cur.root, launcher: launcherId, ...(name ? { name } : {}) };
  const dm = devModel(findLauncher(launcherId));
  if (dm) p.model = dm;
  let ok = false;
  try { const r = await api.call('session.spawn', p); toast(startedText(r)); goWhenOpen(r.sessionId); ok = true; }
  catch (e) { toast(t('spawn.failed', { error: errText(e) }), 'error'); }
  quickBusy = false;
  return ok;
}

// cwd: 영역 이름표의 "+ 세션"에서 열면 그 워크스페이스의 폴더(P6a)
// launcher: 레일의 Shift+누르기로 열면 그 호출자. agentKind: 옛 길(그 종류를 직접 고르기로 연다)
export function SpawnDialog({ onClose, cwd: cwd0 = null, agentKind = null, launcher: launcher0 = null }) {
  const t = useT();
  const info = api.info || {};
  const data = getState().launchers;
  const list = orderedLaunchers(data);
  const first = favoriteLaunchers(data)[0] || list[0] || null;
  const cur = getState().workspaces.find((w) => w.key === getState().currentWs);
  const [cwd, setCwd] = useState(cwd0 || (cur && cur.root) || info.defaultCwd || '');
  const [name, setName] = useState('');
  const [lid, setLid] = useState(launcher0 || (agentKind ? '' : first ? first.id : '')); // ''면 직접 고르기
  const L = lid ? list.find((l) => l.id === lid) || null : null;
  const [lmodel, setLmodel] = useState(() => { const l = findLauncher(launcher0 || (agentKind ? '' : first ? first.id : '')); return l ? l.model || devModel(l) : ''; });
  const [kind, setKind] = useState(agentKind || 'claude');
  const [kinds, setKinds] = useState([{ kind: 'claude', installed: true }]);
  const [model, setModel] = useState(info.defaultModel || '');
  const [mode, setMode] = useState('manual');
  const [args, setArgs] = useState('');
  const [allowHerdr, setAllowHerdr] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [trust, setTrust] = useState(null);
  const [busy, setBusy] = useState(false);
  const harness = L ? L.harness : kind;
  const claude = harness === 'claude';
  const shell = harness === 'shell';
  const typed = harness === 'command'; // 직접 명령: 셸 패널에 그 줄을 친다(hook 없음, 첫 지시 없음)
  const box = useDialog(onClose); // P52: 열면 첫 칸에 초점, Esc로 닫기, 닫으면 연 단추로 초점
  const pickLauncher = (id) => { setLid(id); const l = findLauncher(id); setLmodel(l ? l.model || devModel(l) : ''); };

  useEffect(() => { api.call('agent.kinds').then((ks) => setKinds([...ks].sort((a, b) => (b.installed - a.installed) || (a.kind === 'claude' ? -1 : b.kind === 'claude' ? 1 : 0)))).catch(() => {}); }, []);
  useEffect(() => {
    if (!cwd || !claude) return setTrust(null);
    const tm = setTimeout(() => api.call('trust.predict', { cwd }).then(setTrust).catch(() => setTrust(null)), 250);
    return () => clearTimeout(tm);
  }, [cwd, claude]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const p = { cwd, name: name.trim() || undefined, prompt: shell || typed ? undefined : prompt.trim() || undefined };
      if (L) {
        p.launcher = L.id;
        if (MODEL_HARNESS.has(L.harness) && lmodel.trim() !== (L.model || '')) p.model = lmodel.trim() || undefined; // 바꾼 모델만 덮는다
      } else {
        p.kind = kind;
        if (claude) Object.assign(p, { model: model.trim() || undefined, permissionMode: mode, allowHerdr });
        else if (!shell) p.args = args.trim();
      }
      const r = await api.call('session.spawn', p);
      toast(startedText(r));
      onClose();
      goWhenOpen(r.sessionId);
    } catch (err) { toast(t('spawn.failed', { error: errText(err) }), 'error'); setBusy(false); }
  }

  return (
    <div className="mt-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form ref={box} className="mt-modal" onSubmit={submit} data-role="spawn" data-launcher={lid || ''}>
        <h3>{t('spawn.title')}</h3>
        {data && <>
          <label>{t('launchers.pick')}
            <select value={lid} onChange={(e) => pickLauncher(e.target.value)} data-field="launcher">
              {list.map((l) => <option key={l.id} value={l.id}>{l.favorite ? '★ ' : ''}{l.name}</option>)}
              <option value="">{t('launchers.custom')}</option>
            </select>
          </label>
          {L && <div className="mt-ln-preview mono" data-role="launcher-preview" title={previewLine(L.preview, t('launchers.shellPreview'))}>{previewLine(L.preview, t('launchers.shellPreview'))}{L.preview && L.preview.env && L.preview.env.length ? <span className="dim">  · {t('launchers.envShort')}: {L.preview.env.join(', ')}</span> : null}</div>}
        </>}
        {/* P48: 찾아보기. Electron 창은 OS 대화상자, 웹 화면은 PC 폴더 탐색기(window.mt.pickFolder) */}
        <label>{t('spawn.folder')}<span className="mt-row-wide"><input value={cwd} onChange={(e) => setCwd(e.target.value)} data-field="cwd" /><button type="button" className="mt-btn" data-action="spawn-browse" onClick={async () => { try { const p = await window.mt.pickFolder(); if (p) setCwd(p); } catch {} }}>{t('workspaces.browse')}</button></span></label>
        {claude && trust && trust.needsTrust && <div className="mt-warn">{t('spawn.trustNeeded')}</div>}
        {claude && trust && trust.needsTrust === false && <div className="mt-ok">{t('spawn.trusted', { by: trust.trustedBy })}</div>}
        <div className="mt-row">
          <label>{t('spawn.name')}<input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('spawn.namePh')} data-field="name" /></label>
          {L ? (MODEL_HARNESS.has(L.harness) && <label>{t('spawn.model')}<input value={lmodel} onChange={(e) => setLmodel(e.target.value)} placeholder={t('spawn.modelPh')} data-field="model" /></label>) : (
            <label>{t('spawn.kind')}
              <select value={kind} onChange={(e) => { setKind(e.target.value); setArgs(''); }} data-field="kind">
                <option value="shell">{t('spawn.shellOption')}</option>
                {kinds.map((k) => <option key={k.kind} value={k.kind} disabled={!k.installed}>{k.kind}{k.installed ? '' : t('spawn.notInstalled')}</option>)}
              </select>
            </label>
          )}
        </div>
        {L ? (typed ? <div className="mt-card-sub" data-role="command-note">{t('launchers.commandNote')}</div> : shell ? <div className="mt-card-sub" data-role="shell-note">{t('spawn.shellNote')}</div> : null)
          : shell ? <div className="mt-card-sub" data-role="shell-note">{t('spawn.shellNote')}</div> : claude ? <>
            <div className="mt-row">
              <label>{t('spawn.model')}<input value={model} onChange={(e) => setModel(e.target.value)} placeholder={t('spawn.modelPh')} data-field="model" /></label>
              <label>{t('spawn.mode')}
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  {['manual', 'acceptEdits', 'plan', 'auto'].map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
            </div>
            <label className="mt-check"><input type="checkbox" checked={allowHerdr} onChange={(e) => setAllowHerdr(e.target.checked)} data-field="allow-herdr" />{t('spawn.allowHerdr')}</label>
          </> : <>
            <label>{t('spawn.args')}<input value={args} onChange={(e) => setArgs(e.target.value)} placeholder={kind === 'codex' ? t('spawn.codexArgsPh') : ''} data-field="args" /></label>
            <div className="mt-card-sub">{t('spawn.otherNote', { kind })}</div>
          </>}
        {!shell && !typed && <label>{t('spawn.prompt')}<textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} data-field="prompt" /></label>}
        <div className="mt-card-actions">
          <button className="mt-btn primary" disabled={busy || !cwd} data-action="spawn-submit">{busy ? t('spawn.starting') : t('spawn.start')}</button>
          <button type="button" className="mt-btn ghost" onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </form>
    </div>
  );
}
