// P330: 하네스 계약 표. 하네스마다 모델·노력 수준·승인 방식을 어떤 인자로 받는지, 판이 붙이는 인자, 그 하네스가 아는 인자(--help).
// 근거(공식 문서·도움말·확인한 판)는 backend/src/harness-contract.md에 둔다. 런처 칸(launchers.mjs HARNESSES)·하네스 어댑터(harness.mjs ADAPTERS)·
// 하위 세션(branch.mjs)·atrium models가 이 표를 본다.
// 이 모듈은 하네스 설정·로그인 파일을 열지 않는다. 점검(runCheck)은 실행 명령에 --version·--help만 붙여 돌린다(모델을 부르지 않는다).
import { execFile } from 'node:child_process';
import { AGY_APPROVAL, HERMES_EFFORTS, hermesEffortOf, wrapperOf } from './harness.mjs';

const PERMISSION_MODES = ['manual', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']; // settings.mjs와 같다
export const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']; // claude --effort
export const CODEX_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']; // config model_reasoning_effort(models_cache supported_reasoning_levels)
export const AGY_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']; // agy --effort
export const PI_THINKING = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']; // pi --thinking
export const CODEX_EFFORT_KEY = 'model_reasoning_effort';

// 승인 방식(판의 권한 모드) → 그 하네스 인자. 빈 배열은 덧붙이지 않는다(그 하네스의 사용자 설정·기본)
// Codex(0.167): auto는 --approve-for-me(승인 요청을 자동 검토로, workspace-write 샌드박스), acceptEdits는 작업 폴더 쓰기 + 필요할 때 묻기,
//   dontAsk·bypassPermissions는 묻지 않고 샌드박스 없이. Hermes(0.23): --yolo(위험 명령 승인 생략, --tui도 받는다). opencode(2.3): --auto(거부되지 않은 권한 자동 승인)
export const CODEX_APPROVAL = {
  manual: [], plan: [],
  acceptEdits: ['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request'],
  auto: ['--approve-for-me'],
  dontAsk: ['--dangerously-bypass-approvals-and-sandbox'],
  bypassPermissions: ['--dangerously-bypass-approvals-and-sandbox'],
};
export const HERMES_APPROVAL = { manual: [], acceptEdits: [], plan: [], auto: [], dontAsk: ['--yolo'], bypassPermissions: ['--yolo'] };
export const OPENCODE_APPROVAL = { manual: [], acceptEdits: [], plan: [], auto: [], dontAsk: ['--auto'], bypassPermissions: ['--auto'] };

// 그 하네스가 아는 인자(이 PC의 --help, 확인한 판은 harness-contract.md). 추가 인자에 이 밖의 인자가 있으면 설정 탭이 경고한다(막지는 않는다)
const W = (s) => s.split(' ');
const KNOWN = {
  claude: W('--add-dir --agent --agents --allow-dangerously-skip-permissions --allowed-tools --allowedTools --append-system-prompt --autocompact --ax-screen-reader --bare --betas --brief --chrome --continue --dangerously-skip-permissions --debug --debug-file --disable-slash-commands --disallowed-tools --disallowedTools --effort --exclude-dynamic-system-prompt-sections --fallback-model --file --fork-session --ide --include-hook-events --include-partial-messages --input-format --json-schema --max-budget-usd --mcp-config --model --name --no-chrome --no-session-persistence --output-format --permission-mode --permission-prompt-tool --plugin-dir --print --remote-control --resume --safe-mode --session-id --setting-sources --settings --strict-mcp-config --system-prompt --tmux --tools --verbose --worktree -c -d -n -p -r -w'),
  codex: W('--add-dir --approve-for-me --ask-for-approval --cd --config --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust --disable --enable --image --local-provider --model --no-alt-screen --no-daemon --oss --profile --remote --remote-auth-token-env --sandbox --search --strict-config --worktree -C -a -c -i -m -p -s'),
  agy: W('--add-dir --agent --continue --conversation --dangerously-skip-permissions --disable-slash-commands --effort --log-file --mode --model --new-project --project --remote-control --sandbox --settings -c'),
  pi: W('--api-key --append-system-prompt --approve --continue --exclude-tools --extension --fork --list-models --mode --model --models --name --no-approve --no-builtin-tools --no-context-files --no-extensions --no-mcp --no-prompt-templates --no-session --no-skills --no-themes --no-tools --offline --prompt-template --provider --resume --session --session-dir --session-id --skill --system-prompt --theme --thinking --tools --tui-mode --verbose -a -c -e -n -na -nbt -nc -ne -np -ns -nt -r -t -xt'),
  opencode: W('--auto --continue --log-level --print-logs --prompt --server --session --standalone -c -s'),
  dsh: W('--backend --continue --resume --patch --profile --dump-config -c'),
  hermes: W('--accept-hooks --checkpoints --cli --continue --dev --ignore-rules --ignore-user-config --in --model --native --no-restore-cwd --pass-session-id --provider --reasoning --resume --safe-mode --skills --toolsets --tui --tui-native --worktree --yolo -c -m -r -s -t -w'),
  omh: W('--omh-home --hermes-home --scope --resume --continue --profile --onboard --new -r -c -p'),
};

// 계약 표. model.via: arg(인자) | config(설정 글로) | env(env) | slash(하네스 안 명령, 판이 넘기지 않음). effort.via: arg | config | slash(판이 준비된 뒤 넣거나 하네스 안 명령) | none
// model.source: 모델 이름을 얻는 곳(창 사전 launcherContract.source_*). boardFlags: 판이 그 하네스에 붙이는 인자(점검이 도움말에서 찾는다)
export const CONTRACTS = {
  claude: { id: 'claude', command: 'claude', model: { via: 'arg', flags: ['--model'], source: 'claude' }, effort: { via: 'arg', flag: '--effort', values: CLAUDE_EFFORTS }, approval: 'permission-mode', boardFlags: ['--permission-mode', '--settings', '--session-id', '--resume', '--plugin-dir', '--append-system-prompt-file', '--no-chrome', '--model', '--effort'], known: KNOWN.claude },
  codex: { id: 'codex', command: 'codex', model: { via: 'arg', flags: ['-m', '--model'], source: 'codex' }, effort: { via: 'config', flag: '-c', key: CODEX_EFFORT_KEY, values: CODEX_EFFORTS }, approval: CODEX_APPROVAL, boardFlags: ['-c', '-m', 'resume'], known: KNOWN.codex },
  agy: { id: 'agy', command: 'agy', model: { via: 'arg', flags: ['--model'], source: 'agy' }, effort: { via: 'arg', flag: '--effort', values: AGY_EFFORTS }, approval: AGY_APPROVAL, boardFlags: ['--model', '--add-dir', '--settings', '--conversation'], known: KNOWN.agy },
  pi: { id: 'pi', command: 'pi', model: { via: 'arg', flags: ['--model'], source: 'pi' }, effort: { via: 'arg', flag: '--thinking', values: PI_THINKING }, approval: null, boardFlags: ['--session-id', '--model', '--append-system-prompt'], known: KNOWN.pi },
  opencode: { id: 'opencode', command: 'opencode', model: { via: 'config', flags: ['-m', '--model'], source: 'opencode' }, effort: { via: 'none' }, approval: OPENCODE_APPROVAL, boardFlags: ['--standalone', '-s'], known: KNOWN.opencode },
  dsh: { id: 'dsh', command: 'dsh-tui', aliases: ['dst'], model: { via: 'slash', flags: [], source: 'dsh' }, effort: { via: 'slash', slash: '/effort' }, approval: null, boardFlags: ['--patch', '--resume'], known: KNOWN.dsh },
  hermes: { id: 'hermes', command: 'hermes', model: { via: 'arg', flags: ['-m', '--model'], source: 'hermes' }, effort: { via: 'slash', flag: '--reasoning', slash: '/reasoning', values: HERMES_EFFORTS, argRejected: true }, approval: HERMES_APPROVAL, boardFlags: ['--tui', '-m', '--resume'], known: KNOWN.hermes },
  // P309: omh(Hermes + OMH Native TUI). bare 실행은 -r/-c/-p/--onboard/--new만 받는다: 모델은 env HERMES_MODEL, 노력은 /reasoning, 승인 인자는 없다
  omh: { id: 'omh', family: 'hermes', command: 'omh', model: { via: 'env', env: 'HERMES_MODEL', flags: ['-m', '--model'], source: 'hermes' }, effort: { via: 'slash', flag: '--reasoning', slash: '/reasoning', values: HERMES_EFFORTS, argRejected: true }, approval: null, boardFlags: ['--new', '--resume'], known: KNOWN.omh },
};
// 하네스(런처 harness 또는 종류)와 실행 명령 → 그 계약(omh로 감싸면 omh). 모르는 종류는 null
export function contractOf(harness, startCommand = '') {
  if (harness === 'hermes' && wrapperOf(startCommand) === 'omh') return CONTRACTS.omh;
  return CONTRACTS[harness] || null;
}
// 명령 이름(경로·확장자 뺀 소문자) → 판이 아는 하네스 { harness, startCommand }. omh는 hermes + 실행 명령 omh, dsh-tui·dst는 dsh
const exeBase = (w) => String(w || '').replace(/^.*[\\/]/, '').replace(/\.(exe|cmd|ps1|bat)$/i, '').toLowerCase();
export function harnessOfCommand(word) {
  const b = exeBase(word);
  if (!b) return null;
  if (b === 'omh') return { harness: 'hermes', startCommand: 'omh' };
  if (b === 'claude-code') return { harness: 'claude', startCommand: '' };
  for (const c of Object.values(CONTRACTS)) if (!c.family && (c.command === b || (c.aliases || []).includes(b))) return { harness: c.id, startCommand: c.command === b ? '' : b };
  return null;
}

// 승인 방식 → 그 하네스 인자(표가 없거나 omh면 [])
export function approvalArgsFor(kind, mode, startCommand = '') {
  const c = contractOf(kind, startCommand);
  if (!c || !c.approval || typeof c.approval !== 'object') return [];
  return [...(c.approval[mode] || [])];
}
const CODEX_APPROVAL_FLAGS = new Set(['-a', '--ask-for-approval', '-s', '--sandbox', '--approve-for-me', '--dangerously-bypass-approvals-and-sandbox', '--full-auto', '--yolo']);
const CODEX_APPROVAL_KEY = /^(approval_policy|sandbox_mode)\s*=/;
const APPROVAL_FLAGS = { agy: new Set(['--mode', '--dangerously-skip-permissions']), hermes: new Set(['--yolo']), opencode: new Set(['--auto']) };
// 추가 인자에 그 하네스의 승인 인자가 있는가(있으면 런처 것이 이긴다). Codex는 -c approval_policy=…·sandbox_mode=…도 센다
export function hasApprovalArgs(kind, args = []) {
  const a = (args || []).map(String);
  if (APPROVAL_FLAGS[kind]) return a.some((x) => APPROVAL_FLAGS[kind].has(x.split('=')[0]));
  if (kind !== 'codex') return false;
  return a.some((x, i) => CODEX_APPROVAL_FLAGS.has(x.split('=')[0])
    || ((x === '-c' || x === '--config') && CODEX_APPROVAL_KEY.test(a[i + 1] || ''))
    || (x.startsWith('--config=') && CODEX_APPROVAL_KEY.test(x.slice(9))) || (x.startsWith('-c') && x.length > 2 && CODEX_APPROVAL_KEY.test(x.slice(2))));
}
// 노력 수준 → 그 하네스 인자(인자·설정으로 받는 하네스만). 받지 않는 값이면 null
export function effortArgsFor(kind, effort) {
  const c = CONTRACTS[kind];
  const e = String(effort || '').trim();
  if (!c || !e || !c.effort.values || !c.effort.values.includes(e)) return null;
  if (c.effort.via === 'config') return [c.effort.flag, c.effort.key + '="' + e + '"'];
  if (c.effort.via === 'arg') return [c.effort.flag, e];
  return null;
}
// 추가 인자에 노력 인자가 이미 있는가
export function hasEffortArg(kind, args = []) {
  const c = CONTRACTS[kind];
  if (!c || !c.effort.flag) return false;
  const a = (args || []).map(String);
  if (c.effort.via === 'config') { const k = new RegExp('^' + c.effort.key + '\\s*='); const k2 = new RegExp('^(--config=|-c)' + c.effort.key + '\\s*='); return a.some((x, i) => ((x === '-c' || x === '--config') && k.test(a[i + 1] || '')) || k2.test(x)); }
  return a.some((x) => x.split('=')[0] === c.effort.flag);
}
// 모델 → 그 하네스 인자(설정·env·하네스 안 명령으로 받는 하네스는 [])
export function modelArgsFor(kind, model, startCommand = '') {
  const c = contractOf(kind, startCommand);
  if (!model) return [];
  if (!c) return ['-m', model];
  return c.model.via === 'arg' ? [c.model.flags[0], model] : [];
}
// 판이 넘기지 못하는 모델(하네스 안 /model로만 정한다)
export const modelIgnoredLine = (kind, model) => '--model ' + model + '는 무시했다: ' + kind + '는 모델을 인자로 받지 않는다(' + kind + ' 안 /model 또는 ' + kind + ' 설정을 따른다).';
export const takesModel = (kind, startCommand = '') => { const c = contractOf(kind, startCommand); return !c || c.model.via !== 'slash'; };

// ---------- 추가 인자와 칸의 겹침 ----------
const unq = (v) => String(v == null ? '' : v).trim().replace(/^(["'])(.*)\1$/, '$2');
const MODEL_OK = /^[A-Za-z0-9._:/\[\]@+-]{1,80}$/;
// 승인 인자 하나 → { arg, mode, n }(그 하네스의 승인 표에 한 낱말로 있는 것, AGY --mode 값)
function permissionOfArg(c, a, i) {
  const w = a[i];
  if ((c.id === 'agy' || c.id === 'claude') && w === '--dangerously-skip-permissions') return { arg: w, mode: 'bypassPermissions', n: 0 };
  if (c.id === 'agy' && (w === '--mode' || w.startsWith('--mode='))) {
    const v = w.includes('=') ? w.slice(7) : a[i + 1] || '';
    const mode = { plan: 'plan', 'accept-edits': 'acceptEdits', auto: 'auto' }[v];
    return mode ? { arg: w.includes('=') ? w : w + ' ' + v, mode, n: w.includes('=') ? 0 : 1 } : null;
  }
  if (c.id === 'codex' && w === '--approve-for-me') return { arg: w, mode: 'auto', n: 0 };
  if (c.id === 'codex' && w === '--dangerously-bypass-approvals-and-sandbox') return { arg: w, mode: 'bypassPermissions', n: 0 };
  if (c.id === 'hermes' && w === '--yolo') return { arg: w, mode: 'bypassPermissions', n: 0 };
  if (c.id === 'opencode' && w === '--auto') return { arg: w, mode: 'bypassPermissions', n: 0 };
  return null;
}
// 추가 인자 낱말 → { items: [{ arg, field, value, ok, at, n }], unknown: [인자], rejected: [{ arg, why }] }
//   items: 칸과 겹치는 인자(ok면 칸으로 옮길 수 있다, 아니면 값이 계약 밖. at·n은 낱말 위치와 수), unknown: 그 하네스 도움말에 없는 인자,
//   rejected: 그 하네스가 그 모양으로 받지 않는 인자(Hermes TUI의 --reasoning, opencode·omh의 --model: 칸으로 옮기면 판이 맞는 길로 넘긴다)
export function argOverlaps(harness, words = [], startCommand = '') {
  const c = contractOf(harness, startCommand);
  const out = { items: [], unknown: [], rejected: [] };
  if (!c) return out;
  const a = (words || []).map(String);
  const add = (i, n, field, value, ok) => out.items.push({ arg: a.slice(i, i + n + 1).join(' '), field, value, ok, at: i, n: n + 1 });
  for (let i = 0; i < a.length; i++) {
    const w = a[i];
    if (!w.startsWith('-')) continue;
    const eq = w.startsWith('--') ? w.indexOf('=') : -1;
    const flag = eq > 0 ? w.slice(0, eq) : w.startsWith('--') ? w : w.slice(0, 2);
    const val = () => (eq > 0 ? { v: w.slice(eq + 1), n: 0 } : !w.startsWith('--') && w.length > 2 ? { v: w.slice(2), n: 0 } : { v: a[i + 1] != null ? a[i + 1] : '', n: a[i + 1] != null ? 1 : 0 });
    if (c.model.flags.includes(flag)) {
      const t = val(); const v = unq(t.v);
      add(i, t.n, 'model', v, MODEL_OK.test(v));
      if (c.model.via === 'config' || c.model.via === 'env') out.rejected.push({ arg: w, why: 'modelNotArg' });
      i += t.n; continue;
    }
    if (c.effort.flag && c.effort.via !== 'config' && flag === c.effort.flag) {
      const t = val(); const raw = unq(t.v);
      const v = c.effort.flag === '--reasoning' ? hermesEffortOf(raw) || raw : raw;
      add(i, t.n, 'effort', v, (c.effort.values || []).includes(v));
      if (c.effort.argRejected) out.rejected.push({ arg: w, why: 'effortNotArg' });
      i += t.n; continue;
    }
    if (c.effort.via === 'config' && (flag === '-c' || flag === '--config')) {
      const t = val();
      const m = new RegExp('^' + c.effort.key + '\\s*=\\s*(.*)$').exec(t.v);
      const mm = /^model\s*=\s*(.*)$/.exec(t.v);
      if (m) { const v = unq(m[1]); add(i, t.n, 'effort', v, c.effort.values.includes(v)); }
      else if (mm) { const v = unq(mm[1]); add(i, t.n, 'model', v, MODEL_OK.test(v)); }
      i += t.n; continue; // 그 밖의 -c 값은 그대로(Codex 설정 덮기)
    }
    const perm = permissionOfArg(c, a, i);
    if (perm) { add(i, perm.n, 'permissionMode', perm.mode, true); i += perm.n; continue; }
    if (c.known && !c.known.includes(flag) && !c.known.includes(w)) out.unknown.push(w);
  }
  return out;
}
// 겹치는 인자를 칸으로 옮긴 런처. fields: 그 하네스의 런처 칸(launchers.mjs HARNESSES fields). 칸이 없거나 값이 계약 밖이면 그대로 둔다
// split·join: launchers.mjs splitArgs·joinArgs → { launcher, moved: [{ arg, field, value }] }
export function moveArgsToFields(l, { fields = [], split, join }) {
  const words = split(l.args);
  const ov = argOverlaps(l.harness, words, l.startCommand);
  const drop = new Set(); const moved = []; const next = { ...l };
  for (const it of ov.items) {
    if (!it.ok || !fields.includes(it.field)) continue;
    next[it.field] = it.value;
    for (let k = 0; k < it.n; k++) drop.add(it.at + k);
    moved.push({ arg: it.arg, field: it.field, value: it.value });
  }
  next.args = join(words.filter((_, i) => !drop.has(i)));
  return { launcher: next, moved };
}

// ---------- 점검(설치 판·도움말에 판이 붙일 인자가 있는가) ----------
const reEsc = (s) => s.replace(/[.*+?^()|[\]\\{}$]/g, (m) => '\\' + m);
// 도움말 글에 그 인자가 있는가(낱말 경계. 하위 명령 resume도 낱말로)
export function flagInHelp(help, flag) {
  return new RegExp('(^|[\\s,\\[(|"\'])' + reEsc(flag) + '(?=$|[\\s,=\\]):|<"\'])', 'm').test(String(help || ''));
}
export const checkFlags = (help, flags = []) => [...new Set(flags)].map((flag) => ({ flag, ok: flagInHelp(help, flag) }));
export const versionLine = (out) => (String(out || '').split(/\r?\n/).map((x) => x.trim()).find(Boolean) || '').slice(0, 120);
// 명령 하나를 짧게 돌린다(창 없이, 셸 거쳐: Windows의 .cmd·.ps1 감싸개). → { code, out }
export function runShort(words, arg, { timeout = 8000, env = process.env } = {}) {
  return new Promise((resolve) => {
    execFile([...words, arg].join(' '), { shell: true, encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 2 * 1024 * 1024, env }, (e, out, err) => {
      resolve({ code: e ? (e.killed ? 'timeout' : e.code ?? 1) : 0, out: String(out || '') + String(err || '') });
    });
  });
}
// 런처 점검. words: 실행 명령 낱말, flags: 판이 붙일 인자. run은 시험에서 바꾼다
export async function runCheck({ words, flags = [], run = runShort, timeout = 8000 }) {
  const [v, h] = await Promise.all([run(words, '--version', { timeout }), run(words, '--help', { timeout })]);
  const command = words.join(' ');
  if (v.code !== 0 && h.code !== 0 && /not recognized|not found|No such file|ENOENT/i.test(v.out + h.out)) return { ok: false, command, error: 'notFound', version: '', flags: [] };
  if (v.code === 'timeout' && h.code === 'timeout') return { ok: false, command, error: 'timeout', version: '', flags: [] };
  const res = checkFlags(h.out, flags);
  return { ok: res.every((f) => f.ok), command, version: versionLine(v.code === 0 ? v.out : ''), flags: res };
}

// 설정 탭 안내: 모델 이름을 얻는 곳, 노력 값과 넘기는 길, 승인 방식이 무엇으로 바뀌는지
export function contractHint(harness, { startCommand = '', permissionMode = '' } = {}) {
  const c = contractOf(harness, startCommand);
  if (!c) return null;
  const approval = c.approval === 'permission-mode' ? ['--permission-mode', permissionMode || 'manual'] : c.approval ? [...(c.approval[permissionMode || 'manual'] || [])] : null;
  const effortHow = c.effort.via === 'config' ? c.effort.flag + ' ' + c.effort.key + '="<v>"' : c.effort.via === 'arg' ? c.effort.flag + ' <v>' : c.effort.via === 'slash' ? c.effort.slash + (c.effort.values ? ' <v>' : '') : '';
  const modelHow = c.model.via === 'arg' ? c.model.flags[0] + ' <model>' : c.model.via === 'config' ? 'OPENCODE_CONFIG_CONTENT {model}' : c.model.via === 'env' ? c.model.env + '=<model>' : '/model';
  return { id: c.id, source: c.model.source, modelVia: c.model.via, modelHow, effortVia: c.effort.via, effortHow, efforts: c.effort.values || [], approval, approvalVia: c.approval === 'permission-mode' ? 'mode' : c.approval ? 'table' : 'none' };
}
// atrium models 줄(하네스마다 판이 칸 값을 넘기는 길)
export function contractLines() {
  return Object.values(CONTRACTS).map((c) => {
    const h = contractHint(c.id);
    const model = c.model.via === 'arg' ? '--model → ' + c.model.flags[0] : c.model.via === 'config' ? '--model <제공자/모델> → 설정(OPENCODE_CONFIG_CONTENT)의 model' : c.model.via === 'env' ? '--model → env ' + c.model.env : '--model 받지 않음(' + c.command + ' 안 /model)';
    const effort = c.effort.via === 'none' ? '--effort 받지 않음' : !c.effort.values ? '--effort 받지 않음(' + c.command + ' 안 ' + c.effort.slash + ')' : '--effort ' + c.effort.values.join('|') + ' → ' + h.effortHow + (c.effort.via === 'slash' ? '(준비되면 보드가 넣는다)' : '');
    return { id: c.id, command: c.command, model, effort, text: c.id + (c.id !== c.command ? '(' + c.command + ')' : '') + ': ' + model + ' · ' + effort };
  });
}
