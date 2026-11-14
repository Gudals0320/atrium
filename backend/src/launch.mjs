// 실행 계획(ARCH 4절 B3, 5절): 세션 설정 파일, claude 실행 인자, 이어 가기 명령(resume_argv), 신뢰 예상.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// http hook으로 받을 이벤트. SessionStart는 http hook을 부르지 않으므로 넣지 않는다(E2 2.5).
export const HOOK_EVENTS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'PermissionDenied', 'Notification', 'Stop', 'StopFailure', 'SubagentStop', 'SessionEnd'];

export const slash = (p) => path.resolve(p).split(path.sep).join('/');

// B3 1번: http hook(시간 제한 2초), hook 토큰, 세션 표시를 값으로 직접 쓴다. 작업 공간 env는 터미널 재시작 뒤 되살아나지 않는다(E7).
// P8(K1·K2): env(하위 세션 명령이 판과 자기를 찾는 값)와 allow(하위 세션 명령, 일 시키기·기다리기·읽기 승인 규칙. P116: atrium prompt|wait|read)를 더 받는다. 값은 branch.mjs가 만든다
// P115: settings는 설정 파일에 더할 값(연결의 apiKeyHelper 등). 판의 hook·env·승인 규칙이 이긴다
export function writeSessionSettings({ file, hookUrl, token, sessionId, timeoutSec = 2, env = null, allow = [], settings: more = null }) {
  const hook = { type: 'http', url: hookUrl, timeout: timeoutSec, headers: { Authorization: `Bearer ${token}`, 'X-MT-Session': sessionId } };
  const settings = { ...(more || {}), hooks: Object.fromEntries(HOOK_EVENTS.map((e) => [e, [{ hooks: [hook] }]])) };
  const rules = [...allow];
  if (rules.length) settings.permissions = { allow: rules };
  if (env && Object.keys(env).length) settings.env = env;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));
  return slash(file);
}

// 처음 띄울 때와 이어 갈 때가 같은 설정을 쓰도록 공통 인자를 한곳에서 만든다
// P4: 판 플러그인(스킬과 atrium 명령)을 쥐여 준다. Claude Code는 ~/.agents/skills를 읽지 않으므로 실행마다 --plugin-dir로 넘긴다(사용자 설정은 고치지 않는다).
//     짧은 안내(--append-system-prompt-file)는 판의 연결 알림을 알아듣게 한다.
// P33: extraArgs는 호출자의 추가 인자(판이 정하는 인자는 호출자 검사가 막는다). 끝에 붙인다
function commonArgs({ settingsPath, permissionMode, model, effort, pluginDir, systemPromptFile, extraArgs = [] }) {
  const a = ['--no-chrome', '--permission-mode', permissionMode, '--settings', settingsPath];
  if (model) a.push('--model', model);
  if (effort) a.push('--effort', effort);
  if (pluginDir) a.push('--plugin-dir', pluginDir);
  if (systemPromptFile) a.push('--append-system-prompt-file', systemPromptFile);
  if (extraArgs && extraArgs.length) a.push(...extraArgs);
  return a;
}

// P4: 판 플러그인 폴더(atrium 스킬, 옛 이름 delegate 스킬, bin/atrium).
// P132: 플러그인 이름은 atrium(스킬 atrium:atrium)이다. 판이 다시 띄우는 길(launchOf → 깨우기·되살리기·다시 시작)은 늘 이 폴더를 넘긴다.
//   옛 이름 atrium-herdr(P18~P131) 폴더는 남아 있으면 같은 글로 계속 쓴다: 그 전에 띄워 아직 도는 Claude Code는 시작할 때 받은
//   --plugin-dir(옛 폴더)의 bin/atrium과 스킬(atrium-herdr:atrium)을 쓰기 때문이다. 새로 만들지는 않는다
export const PLUGIN_NAME = 'atrium';
export const OLD_PLUGIN_NAMES = ['atrium-herdr'];
export const LEGACY_PLUGIN_NAME = 'multitask-herdr'; // P18 전의 플러그인 폴더 이름(옮기기가 이어 가기 인자를 고칠 때 찾는다)
// P116: 일 시키기·기다리기·읽기는 판의 atrium 명령이다(터미널 백엔드와 상관없다). 터미널 명령을 직접 쓰라고 하지 않는다
export const BOARD_SYSTEM_PROMPT = [
  '너는 Atrium 보드가 띄운 세션 안에서 돈다. 보드와는 셸의 `atrium` 명령으로 말한다(사용법 `atrium help`).',
  '다른 에이전트에게 일을 시키거나 답을 받아 오라는 말을 들으면 `atrium prompt <이름> "<할 일>" --wait`로 시키고 그 답을 받는다. 이미 시킨 일은 `atrium wait <이름>`으로 끝나기를 기다리고, 화면은 `atrium read <이름>`으로 본다. 이름은 보드의 세션 이름이다. 결과는 한 길로 받는다: `--wait`·`atrium wait`로 당겨 오거나, 워커에게 끝나면 `atrium prompt <너> --now "…"`로 알리게 하고 기다리지 않는다(섞으면 같은 보고가 늦게 한 번 더 온다).', // P143
  '다른 에이전트에게는 `atrium prompt`로만 보낸다. 보드가 받는 쪽 차례에 맞춰 넣고 그 연결을 판에 남긴다. 터미널 명령으로 직접 보내지 않는다.',
  '"[Atrium 보드]"으로 시작하는 글은 보드가 알려 주는 연결(어느 에이전트가 너의 무슨 역할인지)이다. 이 보드의 예전 이름으로 시작하는 지난 알림도 같다.',
  '일이 서로 기다리지 않는 조각 여럿으로 나뉘거나 사용자가 워커·하위 세션·병렬·워크트리를 말하면 atrium 스킬(atrium:atrium, 옛 이름 delegate)대로 `atrium child`로 워커를 만들어 맡긴다. 수와 깊이에 상한은 없다. 워커의 모델을 말로 들으면 `atrium models`에서 골라 띄운다. 예전 이름 mtask도 같은 명령이다.', // P8(K2), P36, P41
  '보드는 오래 쉬는 리포의 세션을 모두 잠재우고, 리포가 바빠도 오래 쉰 세션은 혼자 잠재운다(sleeping). 잠든 세션에 `atrium prompt`하면 보드가 깨운 뒤 넣는다. 미리 깨우려면 `atrium wake <이름>`으로 그 세션을(리포째 잠들었으면 그 리포를) 깨운다.', // P21·P24(D4), P111, P116
  '부모·하위 세션·역할 연결은 `atrium me`가 보드의 지금 기록이다. 누구의 무엇인지, 누구에게 맡길지 헷갈리면 먼저 치고, 예전 알림과 다르면 이것을 믿는다. 매 턴 치지는 않는다.', // P81
].join('\n');
// P8(K2): skills는 더할 스킬 { 이름: SKILL.md 글 }, bin은 Bash 도구 PATH에 오르는 명령 { 파일 이름: 글 }(플러그인 bin/)
// P129: 옛 터미널 스킬(P4~P116에 둔 것)은 지운다
const OLD_TERMINAL_SKILL = 'herdr';
function writePluginAt(root, name, { skills, bin }) {
  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ name, version: '0.1.0', description: 'Atrium 보드가 띄운 에이전트에게 주는 보드 명령(atrium)과 스킬' }, null, 2));
  fs.rmSync(path.join(root, 'skills', OLD_TERMINAL_SKILL), { recursive: true, force: true });
  for (const [n, text] of Object.entries(skills)) { fs.mkdirSync(path.join(root, 'skills', n), { recursive: true }); fs.writeFileSync(path.join(root, 'skills', n, 'SKILL.md'), text); }
  if (Object.keys(bin).length) fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  for (const [n, text] of Object.entries(bin)) { const f = path.join(root, 'bin', n); fs.writeFileSync(f, text); try { fs.chmodSync(f, 0o755); } catch {} }
}
export function writeBoardPlugin({ dir, skills = {}, bin = {} }) {
  const root = path.join(dir, PLUGIN_NAME);
  writePluginAt(root, PLUGIN_NAME, { skills, bin });
  // P132: 옛 이름 폴더가 있으면(그 이름으로 띄운 세션이 아직 돌 수 있다) 같은 스킬과 명령으로 다시 쓴다
  for (const old of OLD_PLUGIN_NAMES) { const r = path.join(dir, old); if (fs.existsSync(r)) writePluginAt(r, old, { skills, bin }); }
  const promptFile = path.join(dir, 'board-system-prompt.md');
  fs.writeFileSync(promptFile, BOARD_SYSTEM_PROMPT + '\n');
  return { pluginDir: slash(root), systemPromptFile: slash(promptFile) };
}
// P115: Claude Code 밖 하네스에 주는 파일. binDir에 플러그인 bin/과 같은 명령(atrium, mtask)을 두고(그 세션의 PATH 앞에 둔다),
// dir에 하네스와 상관없는 안내문 파일(harness-system-prompt.md)을 쓴다 → { binDir, promptFile }
export function writeHarnessFiles({ dir, binDir, bin = {}, prompt }) {
  fs.mkdirSync(binDir, { recursive: true });
  for (const [name, text] of Object.entries(bin)) { const f = path.join(binDir, name); fs.writeFileSync(f, text); try { fs.chmodSync(f, 0o755); } catch {} }
  fs.mkdirSync(dir, { recursive: true });
  const promptFile = path.join(dir, 'harness-system-prompt.md');
  fs.writeFileSync(promptFile, prompt + '\n');
  return { binDir: path.resolve(binDir), promptFile: slash(promptFile) };
}
// P115: 세션 토큰 파일(Claude Code 밖 하네스의 atrium이 읽는다). 친 줄과 셸 기록에 토큰이 남지 않게 env 대신 판 데이터 폴더의 세션별 파일에 둔다
export const tokenFileOf = (sessionsDir, sessionId) => path.join(sessionsDir, `${sessionId}.token`);
export function writeTokenFile(sessionsDir, sessionId, token) { fs.mkdirSync(sessionsDir, { recursive: true }); const f = tokenFileOf(sessionsDir, sessionId); fs.writeFileSync(f, token); return f; }
// P8(K1): worktree면 Claude Code가 자기 규칙으로 워크트리를 만든다(claude -w <이름>). 판은 워크트리를 만들지 않는다. 처음 띄울 때만 넣는다
export function buildStartArgs({ sessionId, worktree = null, ...o }) { return ['--session-id', sessionId, ...(worktree ? ['--worktree', worktree] : []), ...commonArgs(o)]; }
// B3 4번: 첫 요소는 명령 이름, 경로는 슬래시(E7 2.3)
// P97: startCommand(호출자의 실행 명령, 예: 래퍼 명령 `mywrap claude`)가 있으면 그 낱말들로 시작한다. 판이 이어 갈 때 이 명령으로 시작한다
export function buildResumeArgv({ claudeCommand = 'claude', startCommand = '', sessionId, ...o }) {
  const head = String(startCommand || '').trim().split(/\s+/).filter(Boolean);
  return [...(head.length ? head : [claudeCommand]), '--resume', sessionId, ...commonArgs(o)];
}
// P97: PowerShell 패널에 칠 낱말(안전한 글자가 아니면 작은따옴표로 묶고 '는 두 번). 실행 명령 호출자는 판이 이 줄을 패널에 친다
const PS_SAFE = /^[A-Za-z0-9_\-.:/\\=]+$/;
export const psQuote = (w) => (PS_SAFE.test(String(w)) ? String(w) : `'${String(w).replace(/'/g, "''")}'`);
export const psLine = (words) => words.map(psQuote).join(' ');
// PowerShell: 친 줄 앞에 env를 붙인다($env:이름='값'; 작은따옴표는 두 번). P115: PATH는 바꾸지 않고 앞에 더한다
export const psEnvPrefix = (env) => Object.entries(env || {}).map(([k, v]) => `$env:${k}='${String(v).replace(/'/g, "''")}'; `).join('');
export const psPathPrefix = (dirs = []) => (dirs.length ? `$env:PATH='${dirs.map((d) => String(d).replace(/'/g, "''")).join(';')};' + $env:PATH; ` : '');
// C3 대책(P3): 판이 직접 이어 갈 때 agent.start에 넘기는 인자(명령 이름 없이)
export function buildResumeArgs({ sessionId, ...o }) { return ['--resume', sessionId, ...commonArgs(o)]; }

// 돌고 있는 claude의 명령줄에 판의 설정 파일이 있는가(pane.process_info의 argv)
export function argvHasSettings(argv, settingsPath) {
  if (!Array.isArray(argv)) return false;
  const i = argv.indexOf('--settings');
  return i >= 0 && slash(argv[i + 1] || '').toLowerCase() === slash(settingsPath).toLowerCase();
}

// C3 대책(P3): 터미널 서버가 다시 뜬 뒤 판 세션 하나를 어떻게 되살릴지.
// - 패널이 없다(hc: 코어가 꺼지면 터미널도 끝난다): 작업 공간을 다시 만들고, 대화 기록이 있으면 판의 인자로 이어 가고 없으면 같은 세션 ID로 새로 띄운다.
// - claude가 판의 설정 파일 없이 돈다(`claude --resume <ID>`): hook을 잃었으므로 /exit 뒤 판의 인자로 다시 이어 간다.
// - 기다려도 claude가 뜨지 않았다: 대화 기록이 있으면 판의 인자로 이어 가고, 없으면 새로 띄운다.
// - 이어 가기를 시도했다가 실패한 경우(해제 이벤트)는 P1 규칙(relaunchIfEmpty)을 따른다.
export function recoveryPlan({ paneExists, agentPresent, argv = null, settingsPath, transcriptExists, waitedMs = 0, graceMs = 15000, releasedSinceRestart = false }) {
  if (!paneExists) return transcriptExists ? 'recreate_resume' : 'recreate_fresh';
  if (agentPresent) {
    if (!argv) return 'wait';
    return argvHasSettings(argv, settingsPath) ? 'ok' : 'restart_with_settings';
  }
  if (releasedSinceRestart) return 'leave'; // relaunchIfEmpty가 다룬다
  if (waitedMs < graceMs) return 'wait';
  return transcriptExists ? 'start_resume' : 'start_fresh';
}

// 3절 trust_wait 예상: ~/.claude.json의 projects에서 폴더와 모든 상위 폴더의 hasTrustDialogAccepted(E10). 읽기만 한다.
// P1에서 더한 규칙: 폴더가 git 저장소 안이면 그 저장소 루트까지만 올라간다. 루트보다 위의 신뢰는 물려받지 않았다
// (저장소 폴더 C:/Workspace/multitask를 신뢰했는데 그 아래 따로 git init한 폴더에서 대화상자가 떴다. docs/log/p1-backend.md).
// P36(Claude Code 2.1.318 실험): 커밋이 하나도 없는 저장소는 git이 아닌 폴더처럼 상위 폴더의 신뢰를 물려받아 대화상자가 뜨지 않았다. 첫 커밋 뒤에는 떴다.
//   그래서 루트에서 멈추는 것은 커밋이 있는 저장소만이다. claude -w는 둘 다 "Workspace trust not yet accepted"로 거부했다(대화상자를 띄우지 않고 바로 끝난다)
export function predictTrust(cwd, claudeJsonPath) {
  let projects = {};
  try { projects = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf8')).projects || {}; } catch { return { needsTrust: null, reason: 'claude.json unreadable' }; }
  const gitRoot = gitTop(cwd);
  return predictTrustFrom(cwd, projects, gitRoot && repoHasCommit(cwd) ? gitRoot : null);
}
const gitOut = (cwd, args) => { try { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim(); } catch { return null; } };
export function gitTop(cwd) { return gitOut(cwd, ['rev-parse', '--show-toplevel']) || null; }
// P36: 저장소에 커밋이 하나라도 있는가(HEAD가 가리키는 커밋). 없으면 claude -w가 워크트리를 만들 곳이 없다
export function repoHasCommit(cwd) { return !!gitOut(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']); }
export function predictTrustFrom(cwd, projects, gitRoot = null) {
  const parts = slash(cwd).split('/').filter(Boolean); // ['C:', 'Workspace', ...]
  const stop = gitRoot ? slash(gitRoot).split('/').filter(Boolean).length : 1;
  for (let i = parts.length; i >= stop; i--) {
    const key = parts.slice(0, i).join('/');
    for (const k of i === 1 ? [key, key + '/'] : [key]) {
      const e = projects[k] || findCaseInsensitive(projects, k);
      if (e && e.hasTrustDialogAccepted) return { needsTrust: false, trustedBy: k };
    }
  }
  return { needsTrust: true, trustedBy: null };
}
function findCaseInsensitive(projects, key) {
  const k = key.toLowerCase();
  for (const [name, v] of Object.entries(projects)) if (name.toLowerCase() === k) return v;
  return null;
}

// 대화 기록 경로: ~/.claude/projects/<cwd의 영숫자 밖 글자를 '-'로>/<세션 ID>.jsonl(E1 2절). hook의 transcript_path가 있으면 그것을 쓴다.
export function transcriptPathFor(projectsDir, cwd, sessionId) {
  return path.join(projectsDir, path.resolve(cwd).replace(/[^A-Za-z0-9]/g, '-'), `${sessionId}.jsonl`);
}
