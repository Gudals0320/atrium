// P267: 합치기 merger를 판의 기능으로(docs research merger-feature.md). 판 쪽: 찾기·띄우기, 합치기 일 머리, 수명, .atrium/merge.json 읽기, 하위 재우기·닫기·보관, 사람에게 묻기.
// - 브랜치(워크트리)에서 일한 하위가 atrium done ok로 닫으면(work-units.mjs doneVerb → planFor) 판이 git을 읽어 본다:
//   하위 폴더가 그 워크스페이스 저장소의 워크트리이고, 브랜치가 합칠 브랜치와 다르고, 합칠 브랜치보다 앞선 커밋이 있고, 이 워크스페이스에서 기능이 켜졌는가.
//   맞으면 done 값을 부모에게 보내지 않고(claimed_by merger) 합치기 일(work_units.origin merge, from = 원래 부모, to = merger)을 만들어 그 워크스페이스·합칠 브랜치의 merger에게 넣는다.
//   아니면 지금처럼 부모에게 간다. 설정이 ask이고 이 워크스페이스의 답이 없으면 사람에게 판 카드(merger.ask 이벤트)로 한 번 묻고, 답이 올 때까지 지금처럼 부모에게 간다.
// - 하위는 그 턴이 끝나면 판이 바로 재운다(Windows에서 워크트리 폴더가 풀리게). merger가 ok로 닫으면 판이 합칠 브랜치에 하위의 끝 커밋이 들어갔는지 git으로 보고(P275 verifyMerge),
//   들어갔을 때만 하위를 닫고 보관한다(워크트리·브랜치는 merger가 지웠다). 없거나 읽지 못하면 failed와 같이 다룬다(부모에게 알림, 하위는 재운 채).
//   merger가 failed로 닫으면 그 글이 원래 부모에게만 가고 하위는 재운 채 둔다(부모가 다시 시키면 깨어나 같은 워크트리에서 잇는다).
// - merger의 ok는 부모를 깨우지 않는다: 소식(peer_news kind merge) 한 줄과 부모의 atrium items의 "합침"으로만 보인다.
// - merger는 워크스페이스 + 합칠 브랜치마다 하나(meta mergers). 합치기 일 MERGER_JOBS번을 닫으면, 또는 줄 선 일이 없고 그 워크스페이스에 브랜치에서 일하는 하위가 없으면
//   그 턴이 끝난 뒤 판이 닫고 보관한다. 남은 일은 새 merger가 받는다(같은 이름을 다시 쓴다). merger의 워크트리 폴더(.atrium/merge/<브랜치>)는 남는다.
// - 판은 git을 읽기만 한다(git.mjs branchProbe·worktreeList·revOf·isAncestor). 합치기·충돌·시험·올리기·워크트리와 브랜치 지우기는 merger 에이전트가 한다(merger-guide.md).
// - merger의 멈춤(done 없이 쉼, 오류, 닫힘)은 일 표의 멈춤 알림(unit-stops.mjs)이 그 일의 from = 원래 부모에게 알린다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { branchProbe, worktreeList, revOf, branchOf, isAncestor, worktreeRootOf } from './git.mjs';
import { shownName } from './session-label.mjs';
import { ensureAtriumDir, excludeFileOf } from './doc-check.mjs';
import { DEFAULTS, PERMISSION_MODES, resolveBotSettings } from './settings.mjs';
import { APPROVAL_ARGS } from './branch.mjs'; // P287: 종류마다 받는 승인 방식
import { workspaceNames } from './workspaces.mjs';
import { clip } from './text.mjs';

export const MERGER_JOBS = 5; // 합치기 일 다섯 번마다 새 merger(설계 13절, 설정 칸으로 내지 않는다)
export const MERGER_MODES = ['on', 'ask', 'off'];
export const MERGE_CONFIG = '.atrium/merge.json';
export const MERGE_WHERE = ['worktree', 'main'];
export const MERGER_GUIDE_FILE = fileURLToPath(new URL('./merger-guide.md', import.meta.url));
export const SLEEP_TRIES = 3; // 하위 재우기를 몇 번 해 보나(턴이 끝날 때마다 한 번)
const META_RECS = 'mergers';
const META_ANSWERS = 'mergerAnswers';
const META_ASKS = 'mergerAsks';
const META_PROBLEM = 'mergerProblem'; // P275: 마지막으로 merger를 띄우지 못한 까닭
const BRANCH_RE = /^(?![-/.])(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._\/-]{1,200}(?<![/.])$/;
const NAME_MAX = 32;
const BT = '\x60';
function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const newId = (p, n = 3) => p + crypto.randomBytes(n).toString('hex');
const slash = (p) => (p ? String(p).split(path.sep).join('/') : p);
const same = (a, b) => !!a && !!b && slash(path.resolve(a)).toLowerCase() === slash(path.resolve(b)).toLowerCase();
export const mergeKey = (ws, target) => ws + '|' + target;
export const short = (h) => (h ? String(h).slice(0, 9) : '?');
// 세션이 지금 일하는 폴더: 판의 git 조사가 본 폴더(hook의 cwd·터미널의 foreground_cwd, claude -w면 워크트리) → 없으면 띄운 폴더
export const workCwd = (s) => (s && s.git && s.git.cwd) || (s && s.cwd) || null;

export function readMergerGuide(file = MERGER_GUIDE_FILE) { try { return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); } catch (e) { return '(merger 안내 파일을 읽지 못했다: ' + e.message + ')'; } }

// .atrium/merge.json → { config: { target, where, push, guide }, source, problems }. 칸은 이 넷으로 그친다(설계 7절). 잘못된 칸은 기본값으로 두고 problems에 적는다
export function readMergeConfig(root) {
  const config = { target: null, where: 'worktree', push: false, guide: null };
  const problems = [];
  const file = root ? path.join(root, MERGE_CONFIG) : null;
  let raw = null;
  try { raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); } catch { return { config, source: null, problems }; }
  let j;
  try { j = JSON.parse(raw); } catch (e) { return { config, source: MERGE_CONFIG, problems: [MERGE_CONFIG + '을 읽지 못했다(JSON): ' + e.message] }; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { config, source: MERGE_CONFIG, problems: [MERGE_CONFIG + '은 객체여야 한다'] };
  for (const k of Object.keys(j)) if (!['target', 'where', 'push', 'guide'].includes(k)) problems.push('모르는 칸: ' + k);
  if (j.target != null) { if (typeof j.target === 'string' && BRANCH_RE.test(j.target)) config.target = j.target; else problems.push('target은 브랜치 이름이다: ' + JSON.stringify(j.target)); }
  if (j.where != null) { if (MERGE_WHERE.includes(j.where)) config.where = j.where; else problems.push('where는 worktree 또는 main이다: ' + JSON.stringify(j.where)); }
  if (j.push != null) { if (typeof j.push === 'boolean') config.push = j.push; else problems.push('push는 true 또는 false다: ' + JSON.stringify(j.push)); }
  if (j.guide != null) {
    const g = typeof j.guide === 'string' ? j.guide.trim() : '';
    if (g && !path.isAbsolute(g) && !g.split(/[\\/]/).includes('..')) config.guide = g.split('\\').join('/'); else problems.push('guide는 저장소 안 상대 경로다: ' + JSON.stringify(j.guide));
  }
  return { config, source: MERGE_CONFIG, problems };
}

// merger 이름: merger-<워크스페이스>-<브랜치>(영문 소문자로 시작, 소문자·숫자·-·_, 32자까지). 닫힌 세션의 이름은 다시 쓸 수 있다. 열린 다른 세션이 쓰면 -2, -3…
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
export function mergerNameOf({ wsName, target, taken = new Set() }) {
  const w = slug(wsName).slice(0, 12).replace(/-+$/, '');
  let base = ('merger-' + (w ? w + '-' : '') + slug(target)).slice(0, NAME_MAX).replace(/[-_]+$/, '');
  if (!/^[a-z]/.test(base)) base = 'merger';
  const has = (n) => [...taken].some((x) => String(x).toLowerCase() === n);
  if (!has(base)) return base;
  for (let i = 2; i < 100; i++) { const n = base.slice(0, NAME_MAX - String(i).length - 1) + '-' + i; if (!has(n)) return n; }
  return 'merger-' + Date.now().toString(36);
}
// merger의 워크트리 폴더(합칠 브랜치마다 하나, 세대가 바뀌어도 남는다). .atrium/은 git 밖(판이 .git/info/exclude에 둔다)
export const mergerWorktreeOf = (root, target) => slash(path.join(root, '.atrium', 'merge', slug(target) || 'target'));

// 판정(순수). → { route, why, ask }
//   why: merger(merger 자신·합치기 일), off, answered_off, not_git, not_worktree, other_repo, parent_worktree, detached, no_target, same_branch, no_commits, ask, ok
//   P320 parent_worktree: 하위의 작업 트리 뿌리가 일을 맡긴 부모의 작업 트리 뿌리와 같다(--worktree 없이 부모 워크트리를 물려받은 보조 하위).
//     그 브랜치는 부모가 아직 일하는 브랜치라 합치지 않고 보통 done(부모에게 보고)으로 둔다. 부모가 끝날 때 부모의 done이 합친다
export function mergeVerdict({ mode = 'ask', answer = null, probe = null, repoCommonDir = null, target = null, isMerger = false, parentRoot = null }) {
  const no = (why, extra = {}) => ({ route: false, why, ask: false, ...extra });
  if (isMerger) return no('merger');
  if (mode === 'off') return no('off');
  if (!probe) return no('not_git');
  if (!probe.isWorktree) return no('not_worktree');
  if (repoCommonDir && !same(probe.commonDir, repoCommonDir)) return no('other_repo');
  if (parentRoot && probe.root && same(probe.root, parentRoot)) return no('parent_worktree');
  if (!probe.branch) return no('detached');
  if (!target) return no('no_target');
  if (probe.branch === target) return no('same_branch');
  if (!(probe.ahead > 0)) return no('no_commits');
  if (mode === 'ask' && answer !== 'on') return answer === 'off' ? no('answered_off') : no('ask', { ask: true });
  return { route: true, why: 'ok', ask: false };
}

// 합치기 일의 할 일(판이 쓰는 머리 + 하위의 done 글 그대로). 첫 줄이 카드와 알림의 일 이름이 된다
export function mergeJobText(x) {
  const yes = (v) => (v ? '켜짐' : '꺼짐');
  const lines = [
    '병합: @' + x.child + ' (' + x.branch + ' → ' + x.target + ')',
    '',
    '- 맡긴 부모: @' + x.parent,
    '- 하위: @' + x.child + (x.childKind && x.childKind !== 'claude' ? ' (종류 ' + x.childKind + ')' : ''),
    '- 하위의 워크트리: ' + slash(x.worktree),
    '- 브랜치: ' + x.branch + ', 끝 커밋 ' + (x.tip || '?') + ', 합칠 브랜치보다 앞선 커밋 ' + (x.ahead ?? '?') + '개, 커밋 안 한 변경 ' + (x.dirty ?? '?') + '개',
    '- 합칠 브랜치: ' + x.target + (x.holder ? ' (걸린 체크아웃: ' + slash(x.holder) + ')' : ' (어디에도 걸려 있지 않다: 너의 워크트리가 건다)'),
    '- 너의 워크트리: ' + slash(x.mergerWorktree),
    '- 합치는 곳(where): ' + x.where + ', 원격에 올리기(push): ' + yes(x.push) + (x.guide ? ', 저장소 안내: ' + x.guide : '') + (x.configSource ? ' (' + x.configSource + ')' : ' (기본값, ' + MERGE_CONFIG + ' 없음)'),
  ];
  if (x.problems && x.problems.length) lines.push('- ' + MERGE_CONFIG + ' 문제(기본값을 썼다): ' + x.problems.join('; '));
  lines.push('', '## @' + x.child + '의 done 글', String(x.doneText || '').replace(/\s+$/, ''));
  return lines.join('\n');
}
// P325: 치우기 일(사람이 판에서 "워크트리 치우기"를 눌렀고 이 리포는 merger가 켜져 있다). 첫 줄이 카드와 알림의 일 이름
export function discardJobText(x) {
  const lines = [
    '치우기: @' + x.child + ' (' + (x.branch || '떼어 둔 HEAD') + ', 병합하지 않고 버린다)',
    '',
    '- 세션: @' + x.child + ' (보드가 이미 닫고 보관했다)',
    '- 워크트리: ' + slash(x.worktree),
    '- 브랜치: ' + (x.branch || '없음') + ', 끝 커밋 ' + (x.tip || '?') + ', ' + (x.target || '?') + '보다 앞선 커밋 ' + (x.ahead ?? '?') + '개, 커밋 안 한 변경 ' + (x.dirty ?? '?') + '개',
    '- 할 일: ' + BT + 'git -C ' + slash(x.root) + ' worktree remove ' + (x.force ? '--force ' : '') + slash(x.worktree) + BT + (x.keepBranch || !x.branch ? ' (브랜치는 남긴다)' : ', 그다음 ' + BT + 'git -C ' + slash(x.root) + ' branch -D ' + x.branch + BT),
    '- 사람이 고른 것: 브랜치 ' + (x.keepBranch ? '남기기' : '지우기') + ', 커밋 안 한 변경 ' + (x.force ? '까지 지우기(--force)' : '있으면 지우지 않기'),
  ];
  return lines.join('\n');
}
export function discardHeader({ unitId, child }) {
  return [
    '[Atrium 보드] 관계: 너는 이 워크스페이스의 merger다. 아래는 사람이 판에서 맡긴 @' + child + '의 워크트리 치우기 일 ' + unitId + '이다(병합하지 않는다. 지금 일: ' + BT + 'atrium item' + BT + ').',
    '[Atrium 보드] 아래 명령만 하고 ' + BT + 'atrium done ok "치움 <워크트리>"' + BT + '로 닫는다. 지우지 못했으면(잠김, 변경 있음 등) 더 하지 말고 ' + BT + 'atrium done failed "못 치움: <까닭>"' + BT + '. 보드가 git으로 확인하고 사람에게 알린다.',
    '[Atrium 보드] 다른 워크트리·브랜치는 건드리지 않는다. 안내: ' + BT + 'atrium guide merger' + BT + '.',
  ].join('\n');
}
// 합치기 일 머리(세 줄, 판 알림 꼴). 첫 줄은 text.mjs RELATION_LINE 꼴이라 카드에는 아래 할 일만 지시로 보인다
export function mergeHeader({ unitId, parent, child }) {
  return [
    '[Atrium 보드] 관계: 너는 이 워크스페이스의 merger다. 아래는 @' + parent + '가 맡긴 @' + child + '의 결과를 합치는 일 ' + unitId + '이다(지금 일과 줄 선 일 수: ' + BT + 'atrium item' + BT + ').',
    '[Atrium 보드] 끝나면 ' + BT + 'atrium done ok "합침 <해시> …"' + BT + '(더 볼 것이 없다: 합쳤고 워크트리와 브랜치를 지웠다)나 ' + BT + 'atrium done failed "못 합침|합쳤지만 고침 필요|결정 필요: …"' + BT + '(부모가 봐야 한다: 워크트리를 남긴다)로 닫는다.',
    '[Atrium 보드] 하위에게 지시하지 않는다. 안내: ' + BT + 'atrium guide merger' + BT + '(처음 일에는 아래에 붙였다).',
  ].join('\n');
}
// 하위 일 머리 셋째 줄 끝(브랜치에서 일하는 하위, 기능이 꺼지지 않은 워크스페이스)
export const MERGE_CHILD_TAIL = '브랜치에서 일했으면 done ok 뒤 보드가 너를 재우고 병합을 merger에게 맡긴다: done 글에 브랜치, 끝 커밋, 돌린 시험과 결과, 사용자가 얻는 것 한 줄을 적는다.';
// merger가 failed로 닫은 글 끝에 붙는 줄(부모가 받는다)
export function mergeFailLines({ child, worktree, branch, merger }) {
  return ['[Atrium 보드] @' + merger + '가 합치지 못했거나 고침이 필요하다. @' + child + '는 재운 채 둔다(워크트리 ' + slash(worktree) + ', 브랜치 ' + branch + '). 고칠 것은 ' + BT + 'atrium prompt ' + child + ' "<할 일>"' + BT + '로 다시 시킨다(깨어나 같은 워크트리에서 잇는다). 다 고쳐 done ok가 오면 보드가 다시 merger에게 맡긴다.'];
}
// P275: merger가 ok로 닫았지만 판이 git으로 보니 합칠 브랜치에 하위의 끝 커밋이 없다(또는 읽지 못했다). failed와 같이 다루며 부모가 받는 글 맨 앞에 붙는 줄
export function mergeUnverifiedLine({ merger, child, tip, target, hash, contains }) {
  return contains === false
    ? '[Atrium 보드] @' + merger + '가 done ok로 닫았지만 보드가 확인하니 합칠 브랜치 ' + target + '(' + short(hash) + ')에 @' + child + '의 끝 커밋 ' + short(tip) + '이 없다. 합쳐지지 않은 것으로 본다.'
    : '[Atrium 보드] @' + merger + '가 done ok로 닫았지만 보드가 합칠 브랜치 ' + target + '에 @' + child + '의 끝 커밋 ' + short(tip) + '이 들어갔는지 git으로 확인하지 못했다. 합쳐지지 않은 것으로 본다.';
}
// P275: merger 종류 고르기(순수). 설정 종류가 설치돼 있으면(또는 판이 설치 목록을 모르면) 설정대로, 아니면 설치된 하네스 가운데 MERGER_FALLBACKS 차례로. 없으면 null
//   kinds: adapter.agentKinds()의 [{ kind, installed }]. 설정 모델이 Claude 기본 모델인데 종류가 Claude가 아니면 모델을 넘기지 않는다(그 하네스의 기본 모델)
export const MERGER_FALLBACKS = [{ kind: 'claude', model: 'claude-sonnet-5-5', effort: 'medium' }, { kind: 'codex', model: null, effort: 'medium' }];
// P285: read = 판이 하네스 목록을 읽었는가(readKinds). 읽지 못했으면(오류·빈 목록·시간 넘김) 설정 종류로 띄워 본다(띄우기가 실패하면 그때 부모에게).
//   읽었는데 그 종류가 없을 때만(installed: false) Claude Code → Codex로 바꾸거나 null. installed: null(where.exe가 답하지 못함)은 있는 것으로 본다
export function pickMergerSpawn({ kinds = [], set = {}, read = true } = {}) {
  const kind = String(set.mergerKind || '').trim().toLowerCase() || 'claude';
  const has = (k) => kinds.some((x) => x && x.kind === k && x.installed !== false);
  if (!read || !kinds.length || has(kind)) {
    const model = set.mergerModel && !(kind !== 'claude' && set.mergerModel === DEFAULTS.mergerModel) ? set.mergerModel : null;
    return { kind, model, effort: set.mergerEffort || null, picked: 'setting', wanted: kind };
  }
  for (const f of MERGER_FALLBACKS) if (has(f.kind)) return { ...f, picked: 'installed', wanted: kind };
  return null;
}
// P287: merger 승인 방식 고르기(순수) → { mode, from: setting | parent | null, dropped }.
//   설정 mergerPermission이 빈 값·inherit이면 부모의 방식(전과 같음). 고른 종류(kind, 바뀌어 쓰인 종류)가 받지 않는 값이면 부모 따름으로 되돌리고 dropped에 그 값.
//   받는 값: Claude Code는 세션 띄우기 창의 승인 방식 모두, 그 밖은 판이 승인 인자로 옮기는 표(branch.mjs APPROVAL_ARGS)의 키
export const permissionModesOf = (kind) => (kind === 'claude' ? [...PERMISSION_MODES] : APPROVAL_ARGS[kind] ? Object.keys(APPROVAL_ARGS[kind]) : []);
export function mergerPermissionOf({ kind, set = {}, parentMode = null } = {}) {
  const want = String(set.mergerPermission || '').trim();
  const parent = parentMode ? { mode: parentMode, from: 'parent' } : { mode: null, from: null };
  if (!want || want === 'inherit') return { ...parent, dropped: null };
  if (permissionModesOf(kind).includes(want)) return { mode: want, from: 'setting', dropped: null };
  return { ...parent, dropped: want };
}
// P285: 하네스 목록 읽기 → { kinds, read, why }. 어댑터 없음·오류·빈 목록·시간 넘김은 read: false(why에 까닭)
export const KINDS_WAIT_MS = 15_000; // agentKinds를 기다리는 시간(where.exe가 종류마다 5초까지)
export const TERM_WAIT_MS = 120_000; // 판이 막 떴을 때 터미널 서버 연결을 기다리는 시간
export const RECOVER_DELAY_MS = 10_000; // 터미널 서버에 연결된 뒤(세션 다시 붙이기가 끝나도록) 남은 합치기 일을 보기까지
export async function readKinds(adapter, { timeoutMs = KINDS_WAIT_MS } = {}) {
  if (!adapter || typeof adapter.agentKinds !== 'function') return { kinds: [], read: false, why: '판에 하네스 목록이 없다' };
  let t = null;
  try {
    const ks = await Promise.race([adapter.agentKinds(), new Promise((_, rej) => { t = setTimeout(() => rej(apiError('timeout', (timeoutMs / 1000) + '초 안에 답이 없다')), timeoutMs); })]);
    if (!Array.isArray(ks) || !ks.length) return { kinds: [], read: false, why: '빈 목록' };
    return { kinds: ks, read: true, why: null };
  } catch (e) { return { kinds: [], read: false, why: '읽기 실패: ' + (e.message || e.code || String(e)) }; } finally { if (t) clearTimeout(t); }
}
// 사람과 판 로그에 보일 읽은 목록: "claude 없음, codex 없음, pi 있음, dsh 모름"
export const kindsLine = (kinds) => (kinds || []).filter((k) => k && k.kind).map((k) => k.kind + ' ' + (k.installed === false ? '없음' : k.installed == null ? '모름' : '있음')).join(', ');
// P285: no_kind 까닭(읽은 목록을 붙인다)
export function noKindWhy({ set = {}, kinds = [] } = {}) {
  return 'merger를 띄울 하네스가 이 PC에 설치돼 있지 않다(설정 종류 ' + (String(set.mergerKind || '').trim() || 'claude') + ', Claude Code와 Codex도 없음. 판이 읽은 하네스 목록: ' + (kindsLine(kinds) || '없음') + ')';
}
// 부모에게 돌려보낼 때(merger를 띄우지 못함) 붙는 줄
export const mergeFallbackLine = (why) => '[Atrium 보드] 보드가 이 결과를 merger에게 맡기지 못해 너에게 그대로 보낸다(' + why + '). 지금처럼 네가 합친다.';
// 부모의 atrium items에 보이는 합치기 상태
export function mergeState(mu, lastTry) {
  if (!mu) return null;
  if (mu.status === 'done') return 'merged';
  if (mu.status === 'failed') return 'failed';
  if (mu.status === 'cancelled') return 'cancelled';
  return mu.to && lastTry ? 'merging' : 'queued';
}

// P290: 합치기 정리 알림(merger가 닫힐 때 판이 쓴다. merger 에이전트는 따로 보고하지 않는다)
//   merger가 끝낸 합치기 일은 meta.summary = 'pending'으로 표시해 두고, 그 키의 merger가 닫힐 때(retire: idle·jobs·exited, 사람이 닫음)
//   또는 판이 그 키의 merger가 없음을 알아챌 때(recover) 부모별로 묶어 알림 하나씩 보낸 뒤 'sent'로 바꾼다(판 기록이라 판이 다시 떠도 다시 보내지 않는다)
// 하위 done 글에서 "사용자가 얻는 것 …"(; 또는 줄 끝까지)
export function gainOf(text) {
  const m = /사용자가\s*얻는\s*것\s*[:：]?\s*([^;\n]+)/.exec(String(text || ''));
  return m ? clip(m[1].trim().replace(/[.。]$/, ''), 160) : null;
}
// merger done 글에서 검토 파일 경로와 dev 빌드
export function reviewOf(text) { const m = /[\w./\\-]*review\.md/.exec(String(text || '')); return m ? m[0].split('\\').join('/') : null; }
export function devBuildOf(text) { const m = /\bdev\.(\d+)\b/.exec(String(text || '')); return m ? 'dev.' + m[1] : null; }
// 합치기 일의 하위 done 글(spec의 "## @<하위>의 done 글" 아래)
export const childDoneOf = (spec) => { const s = String(spec || ''); const i = s.search(/^## @[^\n]*의 done 글$/m); return i < 0 ? '' : s.slice(s.indexOf('\n', i) + 1); };
// 정리 줄 하나(순수)
export function summaryLine(u) {
  const m = u.meta || {}; const child = '@' + (m.child || '?');
  if (u.status === 'failed') return '- ' + child + ': 실패(이미 알림)';
  const said = (m.merged && m.merged.text) || (m.merged && m.merged.line) || '';
  const parts = ['합침 ' + short(m.merged && m.merged.hash) + (m.target ? ' → ' + m.target : '')];
  const dev = devBuildOf(said); if (dev) parts.push(dev);
  const gain = gainOf(childDoneOf(u.spec)); if (gain) parts.push('사용자가 얻는 것: ' + gain);
  const rv = reviewOf(said); if (rv) parts.push('검토 ' + rv);
  const rec = u.records; // P334: 하위가 done --record로 남긴 기록(원래 일의 records, summarize가 붙인다)
  if (rec && rec.files && rec.files.length) parts.push('기록 ' + rec.dir + '/' + (rec.files.length === 1 ? rec.files[0].name : ' (' + rec.files.length + '개)'));
  return '- ' + child + ': ok, ' + parts.join(' · ');
}
// 부모 하나에게 가는 정리 알림(순수). extra: 문서 규칙 꼬리 줄
export function mergeSummaryText({ merger, units, extra = [] }) {
  const ok = units.filter((u) => u.status !== 'failed').length; const bad = units.length - ok;
  const head = '[Atrium 보드] 병합 정리: @' + merger + '가 닫히기 전에 합친 것 ' + ok + '개' + (bad ? ', 실패 ' + bad + '개' : '');
  return [head, ...units.map(summaryLine), ...(extra.length ? ['', ...extra] : [])].join('\n');
}

export class Merger {
  // b: 백엔드(sessions, store, spawn, kill, sleeper, queue, adapter, api, log). units: WorkUnits. opts.settings: () => 설정(시험)
  constructor(b, units, { settings = null, jobs = MERGER_JOBS, sleepDelayMs = 300, termWaitMs = TERM_WAIT_MS, kindsWaitMs = KINDS_WAIT_MS, recoverDelayMs = RECOVER_DELAY_MS } = {}) {
    this.b = b; this.units = units; this.jobs = jobs; this.sleepDelayMs = sleepDelayMs; this._settings = settings;
    this.termWaitMs = termWaitMs; this.kindsWaitMs = kindsWaitMs; this.recoverDelayMs = recoverDelayMs;
    this.termWaiting = new Set(); // P285: 터미널 서버를 기다리는 키(연결되면 다시 띄운다)
    // P285: 터미널 서버에 (다시) 연결되면 남은 합치기 일을 본다(판이 다시 떴을 때, 기다리던 일)
    if (b.adapter && typeof b.adapter.on === 'function') b.adapter.on('connected', () => this.recoverSoon('connected'));
    this.pendingSleep = new Map(); // 하위 세션 ID → 해 본 수(턴이 끝나면 재운다)
    this.sleeping = new Set();
    this.pendingCheck = new Set(); // 합치기 일을 닫은 merger(그 턴이 끝나면 수명을 본다)
    this.retiring = new Set(); // 닫는 중인 merger
    this.spawning = new Map(); // 키 → 띄우는 약속
    this.commonDirs = new Map(); // 워크스페이스 뿌리 → git 공통 폴더
  }
  store() { return this.b.store; }
  log(m) { if (this.b.log) this.b.log(m); }
  emit(e, v) { try { if (this.b.api && this.b.api.broadcast) this.b.api.broadcast(e, v); } catch {} }
  // P338: 병합 봇이 런처를 골랐으면 종류·모델·노력은 그 런처를 따른다(settings.mjs resolveBotSettings)
  settings() { const f = this.b.features; const find = (id) => (f && f.launchers ? f.launchers.find(id) : null); if (this._settings) return resolveBotSettings({ ...DEFAULTS, ...this._settings() }, find); try { return f && f.settings ? resolveBotSettings(f.settings.get(), find) : DEFAULTS; } catch { return DEFAULTS; } }
  nameOf(id) { return this.units.nameOf(id); }
  // ---------- 기록(판 기록 meta) ----------
  meta(k) { return this.store().getMeta(k) || {}; }
  recs() { return this.meta(META_RECS); }
  rec(key) { return this.recs()[key] || null; }
  saveRec(key, r) { const all = this.recs(); if (r) all[key] = r; else delete all[key]; this.store().setMeta(META_RECS, all); }
  recOfSession(sid) { for (const [k, r] of Object.entries(this.recs())) if (r && r.sessionId === sid) return [k, r]; return [null, null]; }
  isMerger(s) { return !!s && (!!s.mergerKey || !!this.recOfSession(s.sessionId)[0]); }
  sessionOfKey(key) { const r = this.rec(key); const s = r && r.sessionId ? this.b.sessions.get(r.sessionId) : null; return s && !s.closedAt ? s : null; }
  wsRoot(ws) { const w = this.store().getWorkspace ? this.store().getWorkspace(ws) : null; return w && w.root ? w.root : null; }
  wsName(ws) { try { return workspaceNames(this.store().workspaces()).get(ws) || null; } catch { return null; } }
  // 이 워크스페이스의 모드: 설정(on|ask|off)과 기억한 답
  modeFor(ws) { const st = this.settings(); const mode = MERGER_MODES.includes(st.mergerMode) ? st.mergerMode : 'ask'; return { mode, answer: this.meta(META_ANSWERS)[ws] || null }; }
  enabledFor(ws) { const { mode, answer } = this.modeFor(ws); return mode === 'on' || (mode === 'ask' && answer === 'on'); }

  // ---------- 하위 일 머리 한 줄 ----------
  childTail(t) {
    if (!t || this.isMerger(t)) return null;
    const info = this.units.branch && this.units.branch.info ? this.units.branch.info.get(t.sessionId) : null;
    const wt = (t.git && t.git.isWorktree) || (info && info.worktree);
    if (!wt) return null;
    const { mode, answer } = this.modeFor(t.workspaceKey);
    return mode === 'off' || (mode === 'ask' && answer === 'off') ? null : MERGE_CHILD_TAIL;
  }
  // 합치기 일 머리와 꼬리(그 merger의 처음 일이면 안내를 붙인다)
  headerFor(unit) { const m = unit.meta || {}; if (m.discard) return discardHeader({ unitId: unit.id, child: m.child || '?' }); return mergeHeader({ unitId: unit.id, parent: this.nameOf(unit.from), child: m.child || '?' }); } // P325: 치우기 일
  tailFor(unit) {
    const [k, r] = this.recOfSession(unit.to);
    if (!k || r.guided) return '';
    this.saveRec(k, { ...r, guided: true });
    return '\n\n' + readMergerGuide().trim();
  }

  // ---------- done ok의 갈래(work-units doneVerb) ----------
  async repoCommonDir(root) {
    if (this.commonDirs.has(root)) return this.commonDirs.get(root);
    const p = await branchProbe(root).catch(() => null);
    const c = p ? p.commonDir : null;
    if (c) this.commonDirs.set(root, c);
    return c;
  }
  // → null(이 기능과 상관없음) | { route: false, why, ask } | { route: true, ... }
  async planFor(child, unit) {
    if (!child || !unit || unit.origin === 'merge') return null;
    const isMerger = this.isMerger(child);
    const ws = child.workspaceKey; const root = ws ? this.wsRoot(ws) : null;
    if (!root) return null;
    const { mode, answer } = this.modeFor(ws);
    if (mode === 'off' || isMerger) return mergeVerdict({ mode, isMerger });
    const cfg = readMergeConfig(root);
    const parent = unit.from !== unit.to ? this.b.sessions.get(unit.from) || null : null; // P321: 사람이 맡긴 병합(from = 그 세션 자신)은 리포의 브랜치
    const target = cfg.config.target || (parent && parent.cwd ? await branchOf(parent.cwd).catch(() => null) : null) || (await branchOf(root).catch(() => null));
    const cwd = workCwd(child); // claude -w 하위는 띄운 폴더(s.cwd)가 아니라 판이 읽은 지금 폴더(s.git.cwd)에서 일한다
    const pcwd = workCwd(parent); // P320: 부모의 작업 트리 뿌리(같으면 같은 워크트리 보조 하위)
    const [probe, repoCommonDir, parentRoot] = await Promise.all([cwd ? branchProbe(cwd, target).catch(() => null) : null, this.repoCommonDir(root), pcwd ? worktreeRootOf(pcwd).catch(() => null) : null]);
    const v = mergeVerdict({ mode, answer, probe, repoCommonDir, target, parentRoot });
    const out = { ...v, unitId: unit.id, ws, root, target, probe, cfg };
    if (v.ask) this.ask(ws, { child: shownName(child) || child.name, branch: probe.branch, target, root });
    if (!v.route) return out;
    const list = await worktreeList(root).catch(() => null);
    const h = list ? list.find((w) => w.branch === target) : null;
    return { ...out, holder: h ? h.path : null };
  }
  // 합치기 일을 만들고 merger에게 넣는다(없으면 띄운다). done()이 부른다(동기) → { unit, merger }
  take(plan, child, unit, text) {
    const st = this.store();
    const key = mergeKey(plan.ws, plan.target);
    const c = plan.cfg.config;
    const childName = shownName(child) || child.name;
    const meta = { key, ws: plan.ws, root: slash(plan.root), target: plan.target, child: childName, childId: child.sessionId, childKind: child.kind || 'claude', parentId: unit.from,
      worktree: slash(plan.probe.root), branch: plan.probe.branch, tip: plan.probe.tip, dirty: plan.probe.dirty, ahead: plan.probe.ahead, holder: plan.holder ? slash(plan.holder) : null,
      where: c.where, push: c.push, guide: c.guide, mergerWorktree: mergerWorktreeOf(plan.root, plan.target), ...(unit.meta && unit.meta.human ? { human: true } : {}) }; // P321: 사람이 맡긴 병합
    const spec = mergeJobText({ ...meta, parent: this.nameOf(unit.from), configSource: plan.cfg.source, problems: plan.cfg.problems, doneText: text });
    const mu = { id: newId('u'), from: unit.from, to: '', origin: 'merge', spec, status: 'open', createdAt: Date.now(), source: unit.id, meta };
    st.insertUnit(mu);
    st.addEvent(child.sessionId, 'merge_open', { unitId: mu.id, source: unit.id, key, branch: meta.branch, tip: meta.tip, target: meta.target });
    this.log('merge ' + mu.id + ' @' + childName + ' ' + meta.branch + ' -> ' + meta.target + ' (' + plan.ws + ')');
    this.pendingSleep.set(child.sessionId, 0);
    this.sleepSoon(child);
    const s = this.sessionOfKey(key);
    if (s && !this.retiring.has(s.sessionId)) this.assign(st.getUnit(mu.id), s);
    else this.ensure(key).catch(() => {});
    this.changed(plan.ws);
    const r = this.rec(key);
    return { unit: mu.id, merger: s ? shownName(s) || s.name : r ? r.name : null };
  }
  // P325: 사람이 판에서 누른 치우기(worktree-session.mjs discard)를 merger 일로. 세션은 이미 닫혔다. from = 그 세션(닫힘: 알림은 판이 사람에게)
  takeDiscard(job) {
    const st = this.store();
    const key = mergeKey(job.workspace, job.target);
    const meta = { key, discard: true, ws: job.workspace, root: slash(job.root), target: job.target, child: job.name, childId: job.sessionId, childKind: job.kind || 'claude', worktree: slash(job.path), branch: job.branch, tip: job.tip, ahead: job.ahead, dirty: job.dirty, keepBranch: !!job.keepBranch, force: !!job.force, mergerWorktree: mergerWorktreeOf(job.root, job.target) };
    const mu = { id: newId('u'), from: job.sessionId, to: '', origin: 'merge', spec: discardJobText(meta), status: 'open', createdAt: Date.now(), source: null, meta };
    st.insertUnit(mu);
    st.addEvent(job.sessionId, 'discard_open', { unitId: mu.id, key, branch: meta.branch, worktree: meta.worktree, keepBranch: meta.keepBranch, force: meta.force });
    this.log('discard ' + mu.id + ' @' + job.name + ' ' + meta.worktree + ' (' + job.workspace + ')');
    const s = this.sessionOfKey(key);
    if (s && !this.retiring.has(s.sessionId)) this.assign(st.getUnit(mu.id), s);
    else this.ensure(key).catch(() => {});
    this.changed(job.workspace);
    const r = this.rec(key);
    return { unit: mu.id, merger: s ? shownName(s) || s.name : r ? r.name : null };
  }
  // P325: 치우기 일을 판이 확인한다(워크트리 목록에 그 자리가 없고, 브랜치를 지우라 했으면 브랜치도 없나) → { gone, branchGone, contains }
  async verifyDiscard(m) {
    const root = m.root || this.wsRoot(m.ws);
    if (!root) return { gone: null, branchGone: null, contains: null };
    const list = await worktreeList(root).catch(() => null);
    const gone = list ? !list.some((w) => same(w.path, m.worktree)) : null;
    const branchGone = m.branch ? !(await revOf(root, 'refs/heads/' + m.branch).catch(() => 'x')) : true;
    const contains = gone == null ? null : gone && (m.keepBranch || branchGone);
    return { gone, branchGone, contains };
  }
  // 합치기 일을 그 merger에게 넣는다(앞 일이 열려 있으면 판이 붙잡아 둔다)
  assign(mu, s) {
    const st = this.store();
    st.updateUnit(mu.id, { to: s.sessionId });
    const hold = !!st.openTryOf(s.sessionId) || st.queuedUnitsOf(s.sessionId).some((u) => u.id !== mu.id) || this.retiring.has(s.sessionId);
    st.addEvent(s.sessionId, 'unit_open', { unitId: mu.id, from: this.nameOf(mu.from), origin: 'merge', held: hold, chars: mu.spec.length });
    if (hold) { this.units.queued.add(s.sessionId); return null; }
    return this.units.dispatch(st.getUnit(mu.id));
  }
  // 그 키의 merger를 찾거나 띄우고, 맡은 merger가 없는 합치기 일을 넣는다(키마다 하나씩 차례로)
  ensure(key) {
    if (this.spawning.has(key)) return this.spawning.get(key);
    const job = this._ensure(key).finally(() => this.spawning.delete(key));
    this.spawning.set(key, job);
    return job;
  }
  async _ensure(key) {
    const st = this.store();
    const waiting = () => st.unassignedMergeUnits().filter((u) => u.meta && u.meta.key === key);
    if (!waiting().length) return null;
    let s = this.sessionOfKey(key);
    try {
      if (!s || this.retiring.has(s.sessionId)) s = await this.spawnFor(key, waiting()[0]);
    } catch (e) {
      // P285: 터미널 서버에 연결되지 않았다(판이 막 떴다 등): 부모에게 넘기지 않고 기다린다. 연결되면(recover) 다시 띄운다.
      //   연결돼 있는데 띄우기가 terminal_down이면 지금처럼 부모에게 넘긴다
      if (e.code === 'terminal_down' && this.b.adapter && this.b.adapter.connected === false) {
        this.termWaiting.add(key);
        this.log('merger spawn waits for the terminal server ' + key + ': ' + (e.message || e.code));
        try { st.addEvent(null, 'merger_wait_terminal', { key, units: waiting().map((u) => u.id) }); } catch {}
        return null;
      }
      this.log('merger spawn failed ' + key + ': ' + (e.code || e.message));
      for (const u of waiting()) this.fallback(u, e.code === 'no_kind' ? e.message : e.code || e.message || 'spawn failed');
      return null;
    }
    this.termWaiting.delete(key);
    for (const u of waiting()) this.assign(u, s);
    this.changed(key.split('|')[0]);
    return s;
  }
  // merger 띄우기(설정의 종류·모델·노력. 판에 그 종류가 없으면 부모의 종류·런처·모델). 승인 방식은 설정 mergerPermission, 빈 값이면 그 일을 맡긴 부모의 것(P287)
  async spawnFor(key, mu) {
    const b = this.b; const m = mu.meta || {};
    const ws = m.ws; const target = m.target;
    const root = this.wsRoot(ws) || m.root;
    const set = this.settings();
    const parent = b.sessions.get(mu.from) || null;
    // P285: 판이 막 떠 터미널 서버에 아직 닿지 않았으면 잠깐 기다린다(못 닿으면 terminal_down: _ensure가 일을 붙잡아 둔다)
    if (!(await this.waitTerminal())) throw apiError('terminal_down', '터미널 서버에 연결되지 않았다(' + Math.round(this.termWaitMs / 1000) + '초 기다림)');
    const kr = await readKinds(b.adapter, { timeoutMs: this.kindsWaitMs });
    if (!kr.read) this.log('merger kinds unread (' + kr.why + '), trying setting kind');
    // P275: 설치된 하네스 가운데서 고른다(설정 종류가 설치돼 있지 않으면 Claude Code → Codex). 둘 다 없으면 띄우지 않는다(부모에게 그대로, 사람에게 까닭)
    const pick = pickMergerSpawn({ kinds: kr.kinds, set, read: kr.read });
    if (!pick) {
      const why = noKindWhy({ set, kinds: kr.kinds });
      this.log('merger no_kind ' + key + ': read ' + (kindsLine(kr.kinds) || '-'));
      throw apiError('no_kind', why);
    }
    const p = { kind: pick.kind, ...(pick.model ? { model: pick.model } : {}), ...(pick.effort ? { effort: pick.effort } : {}) };
    if (pick.picked === 'installed') this.log('merger kind ' + pick.wanted + ' not installed, using ' + pick.kind + ' (read ' + kindsLine(kr.kinds) + ')');
    const taken = new Set([...b.sessions.values()].filter((x) => !x.closedAt).flatMap((x) => [x.name, shownName(x)].filter(Boolean)));
    const old = this.rec(key);
    const name = mergerNameOf({ wsName: this.wsName(ws) || path.basename(root || ''), target, taken });
    try { if (root && excludeFileOf(root)) ensureAtriumDir(root); } catch (e) { this.log('merger atrium dir ' + e.message); }
    // P287: 승인 방식은 설정 mergerPermission(빈 값이면 맡긴 부모의 것). 그 종류가 받지 않는 값이면 부모 따름과 판 로그 한 줄
    const perm = mergerPermissionOf({ kind: p.kind, set, parentMode: parent && parent.permissionMode });
    if (perm.dropped) this.log('merger permission ' + perm.dropped + ' not for kind ' + p.kind + ', using parent (' + (perm.mode || '-') + ')');
    const res = await b.spawn({ name, cwd: root, ...p, ...(perm.mode ? { permissionMode: perm.mode } : {}) });
    const s = b.sessions.get(res.sessionId);
    if (!s) throw apiError('spawn_failed', 'merger 세션이 판에 등록되지 않았다');
    s.mergerKey = key;
    const rec = { key, ws, target, root: slash(root), sessionId: s.sessionId, name: s.name, jobs: 0, gen: ((old && old.gen) || 0) + 1, spawnedAt: Date.now(), guided: false, kind: p.kind, model: p.model || null };
    this.saveRec(key, rec);
    try { if (this.store().getMeta(META_PROBLEM)) this.store().setMeta(META_PROBLEM, null); } catch {}
    try { this.store().addEvent(s.sessionId, 'merger_spawn', { key, gen: rec.gen, kind: p.kind, permissionMode: perm.mode, permissionFrom: perm.from, permissionDropped: perm.dropped, model: p.model || null, effort: p.effort || null, picked: pick.picked, wanted: pick.wanted, kindsRead: kr.read, kindsWhy: kr.why }); } catch {}
    this.log('merger ' + key + ' spawned ' + s.name + ' gen ' + rec.gen);
    return s;
  }
  // P285: 터미널 서버 연결 기다리기 → 연결됐는가. connected를 모르는 어댑터(시험 등)는 연결된 것으로 본다
  waitTerminal(ms = this.termWaitMs) {
    const a = this.b.adapter;
    if (!a || a.connected !== false) return Promise.resolve(true);
    if (typeof a.once !== 'function') return Promise.resolve(false);
    this.log('merger waits for the terminal server (' + Math.round(ms / 1000) + 's)');
    return new Promise((res) => {
      let t = null;
      const on = () => { if (t) clearTimeout(t); res(true); };
      a.once('connected', on);
      t = setTimeout(() => { (a.off || a.removeListener).call(a, 'connected', on); res(a.connected !== false); }, ms);
    });
  }
  // P285: 판이 다시 떴거나 터미널 서버에 다시 닿았다: 남은 합치기 일을 본다(세션 다시 붙이기가 끝나도록 조금 뒤에)
  recoverSoon(why) {
    if (this._recoverT) return;
    this._recoverT = setTimeout(() => { this._recoverT = null; this.recover(why).catch((e) => this.log('merger recover ' + e.message)); }, this.recoverDelayMs);
    if (this._recoverT.unref) this._recoverT.unref();
  }
  // 열린 합치기 일 가운데
  //   - 맡은 merger가 없는 일(to 빈칸: 터미널 서버를 기다렸거나, 판이 꺼진 사이 merger가 닫혀 떼어 둔 일) → 그 키의 merger에게(없으면 띄운다)
  //   - 맡은 merger 세션이 판에 없거나 닫힌 일 → 열린 시도를 closed로 닫고 다시 줄 세워 새 merger에게
  //   - 맡은 merger가 살아 있으면 그대로 둔다(다시 붙은 merger가 done 없이 쉬면 unit-stops가 부모에게 한 번 알린다. 에이전트가 끝나 셸만 남았으면
  //     work-units onExited가 일을 취소하고 부모에게 한 번 알린다)
  async recover(why = 'recover') {
    const st = this.store(); const keys = new Set(); const now = Date.now();
    for (const u of st.openMergeUnits()) {
      const key = u.meta && u.meta.key;
      if (!key) continue;
      if (!u.to) { keys.add(key); continue; }
      const s = this.b.sessions.get(u.to);
      if (s && !s.closedAt) continue;
      const tr = st.lastTryOfUnit(u.id);
      if (tr && !tr.endedAt) st.updateTry(tr.id, { endedAt: now, stopReason: 'closed' });
      st.updateUnit(u.id, { to: '' });
      try { st.addEvent(null, 'merge_requeue', { unitId: u.id, key, lostMerger: u.to, why }); } catch {}
      this.log('merge ' + u.id + ' lost its merger, requeued (' + why + ')');
      keys.add(key);
    }
    // P290: 정리 없이 사라진 merger(판이 죽었다 등)의 남은 정리를 보낸다(그 키에 열린 merger가 없을 때)
    for (const k of new Set(st.pendingMergeSummaries().map((u) => u.meta.key))) if (!this.sessionOfKey(k)) this.summarize(k, null, 'recover');
    const out = [];
    for (const k of keys) { this.termWaiting.delete(k); out.push(await this.ensure(k).catch((e) => { this.log('merger recover ' + k + ' ' + e.message); return null; })); }
    if (keys.size) this.log('merger recover (' + why + '): ' + [...keys].join(', '));
    return { keys: [...keys], spawned: out.filter(Boolean).length };
  }
  // P275: 사람이 볼 까닭(merger를 띄우지 못함). 설정 › 합치기 탭(merger.status problem)과 창 알림(merger.problem)
  problem(ws, why) {
    const p = { at: Date.now(), workspace: ws || null, workspaceName: ws ? this.wsName(ws) : null, why: String(why || '') };
    try { this.store().setMeta(META_PROBLEM, p); } catch {}
    this.emit('merger.problem', p);
    this.changed(ws);
  }
  // merger를 띄우지 못했다: 합치기 일을 취소하고 원래 done 값을 부모에게 그대로 보낸다
  fallback(mu, why) {
    const st = this.store(); const b = this.b;
    st.updateUnit(mu.id, { status: 'cancelled', closedAt: Date.now() });
    const m = mu.meta || {};
    this.problem(m.ws, why);
    if (m.discard) { // P325: 치우기 일은 판이 직접 한다
      const job = { name: m.child || '?', sessionId: m.childId, workspace: m.ws, root: m.root, path: m.worktree, branch: m.branch, keepBranch: m.keepBranch, force: m.force };
      if (b.wtSessions) b.wtSessions.removeDirect(job).then((r) => b.wtSessions.discarded(job, { via: 'board', ...r })).catch((e) => this.log('discard fallback ' + e.message));
      try { st.addEvent(m.childId || null, 'discard_fallback', { unitId: mu.id, why }); } catch {}
      return;
    }
    this.pendingSleep.delete(m.childId);
    const src = mu.source ? st.getUnit(mu.source) : null;
    const tr = src ? st.lastTryOfUnit(src.id) : null;
    const parent = b.sessions.get(mu.from);
    if (!src || !tr || !parent) return;
    const d = b.queue.enqueue(parent.sessionId, this.units.noticeOf({ unit: src, result: tr.result, text: tr.doneText, extra: [mergeFallbackLine(why)] }));
    st.updateTry(tr.id, { claimedBy: 'queue', noticeDeliveryId: d.deliveryId });
    st.addEvent(parent.sessionId, 'merge_fallback', { unitId: mu.id, source: src.id, why });
  }

  // ---------- merger가 합치기 일을 닫았다(work-units done) ----------
  // P275: merger의 ok를 믿기 전에 판이 git으로 본다: 합칠 브랜치(본 체크아웃 저장소의 로컬 브랜치 refs/heads/<target>)가 하위의 끝 커밋을 품는가.
  //   워크트리들은 브랜치 ref를 함께 쓰므로 where가 worktree든 main이든 같은 곳이다. push가 켜져도 원격은 보지 않는다(merger는 로컬에서 합친 뒤 올린다. 로컬에 없으면 원격에도 합쳐진 것이 아니다)
  //   → { hash, contains }(contains: true | false | null(읽지 못함))
  async verifyMerge(unit) {
    const m = (unit && unit.meta) || {};
    if (m.discard) return this.verifyDiscard(m); // P325
    const root = m.root || this.wsRoot(m.ws);
    if (!root || !m.target) return { hash: null, contains: null };
    const ref = 'refs/heads/' + m.target;
    const hash = await revOf(root, ref).catch(() => null);
    const contains = hash && m.tip ? await isAncestor(root, m.tip, hash).catch(() => null) : null;
    return { hash, contains };
  }
  // → { retire, extra, result }(extra: failed면 부모가 받는 글 끝 줄. result: 판이 본 결과. ok인데 확인되지 않으면 failed)
  // check: verifyMerge의 값(doneVerb가 ok일 때 먼저 읽는다). 없으면 확인하지 못한 것으로 본다
  onMergeDone(caller, unit, result, text, check = null) {
    const st = this.store();
    const m = unit.meta || {};
    const [key, rec] = this.recOfSession(caller.sessionId);
    let retire = false;
    if (key) { const jobs = (rec.jobs || 0) + 1; this.saveRec(key, { ...rec, jobs }); retire = jobs >= this.jobs; }
    if (retire) this.retiring.add(caller.sessionId);
    this.pendingCheck.add(caller.sessionId);
    const firstLine = String(text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
    const mergerName = shownName(caller) || caller.name;
    if (m.discard) return this.onDiscardDone(caller, unit, result, text, check, retire); // P325
    const failLines = mergeFailLines({ child: m.child || '?', worktree: m.worktree, branch: m.branch, merger: mergerName });
    if (result === 'ok' && check && check.contains === true) {
      st.updateUnit(unit.id, { meta: { ...m, summary: 'pending', merger: mergerName, merged: { at: Date.now(), line: clip(firstLine, 200), text: clip(String(text || ''), 600), hash: check.hash, contains: true } } }); // P290: 정리 알림에 넣을 일
      this.finishOk(caller, unit, check).catch((e) => this.log('merge finish ' + unit.id + ' ' + e.message));
      this.changed(m.ws);
      return { retire, extra: [], result: 'ok' };
    }
    if (result === 'ok') {
      // P275: ok라 했지만 합칠 브랜치에 커밋이 없다(또는 확인하지 못했다): failed와 같이. 하위는 재운 채 두고 부모에게 알린다
      const c = check || { hash: null, contains: null };
      const line = mergeUnverifiedLine({ merger: mergerName, child: m.child || '?', tip: m.tip, target: m.target, hash: c.hash, contains: c.contains });
      st.updateUnit(unit.id, { meta: { ...m, summary: 'pending', merger: mergerName, failed: { at: Date.now(), line: clip(line.replace(/^\[Atrium 보드\] /, ''), 200), unverified: true, said: clip(firstLine, 200), hash: c.hash, contains: c.contains } } });
      try { st.addEvent(caller.sessionId, 'merge_unverified', { unitId: unit.id, target: m.target, tip: m.tip, hash: c.hash, contains: c.contains }); } catch {}
      try { st.addNews({ sessionId: caller.sessionId, name: mergerName, at: Date.now(), kind: 'merge', task: '병합: @' + (m.child || '?'), text: '@' + (m.child || '?') + ' 병합 확인 실패: 끝 커밋 ' + short(m.tip) + (c.contains === false ? '이 ' + m.target + '(' + short(c.hash) + ')에 없다' : '을 ' + (m.target || '?') + '에서 확인하지 못했다'), result: 'failed' }); } catch (e) { this.log('merge news ' + e.message); }
      this.log('merge ' + unit.id + ' ok by ' + mergerName + ' but not on ' + m.target + ' (contains ' + c.contains + ')');
      this.keepAsleep(m.childId);
      this.changed(m.ws);
      return { retire, extra: [line, ...failLines], result: 'failed', unverified: true };
    }
    st.updateUnit(unit.id, { meta: { ...m, summary: 'pending', merger: mergerName, failed: { at: Date.now(), line: clip(firstLine, 200) } } });
    this.changed(m.ws);
    return { retire, extra: failLines, result: 'failed' };
  }
  // P325: merger가 치우기 일을 닫았다. ok는 판이 git으로 확인한 때만 ok. 결과는 사람에게(소식·창 알림, worktree-session.mjs discarded). 세션은 이미 닫혔다
  onDiscardDone(caller, unit, result, text, check, retire) {
    const st = this.store(); const m = unit.meta || {};
    const mergerName = shownName(caller) || caller.name;
    const firstLine = String(text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
    const c = check || { gone: null, branchGone: null, contains: null };
    const ok = result === 'ok' && c.contains === true;
    const error = ok ? null : result === 'ok' ? (c.gone === false ? 'merger가 ok로 닫았지만 워크트리가 남아 있다' : c.gone == null ? 'merger가 ok로 닫았지만 보드가 git으로 확인하지 못했다' : 'merger가 ok로 닫았지만 브랜치 ' + m.branch + '가 남아 있다') : clip(firstLine, 200) || 'merger가 치우지 못했다';
    const r = { via: 'merger', removed: c.gone === true, branchDeleted: !m.keepBranch && c.branchGone === true, error };
    st.updateUnit(unit.id, { meta: { ...m, merger: mergerName, discarded: { at: Date.now(), ok, line: clip(firstLine, 200), gone: c.gone, branchGone: c.branchGone } } });
    if (!ok) try { st.addEvent(caller.sessionId, 'discard_unverified', { unitId: unit.id, said: result, gone: c.gone, branchGone: c.branchGone }); } catch {}
    const job = { name: m.child || '?', sessionId: m.childId, workspace: m.ws, branch: m.branch, path: m.worktree, keepBranch: m.keepBranch };
    if (this.b.wtSessions) this.b.wtSessions.discarded(job, r);
    this.changed(m.ws);
    return { retire, extra: [], result: ok ? 'ok' : 'failed', ...(result === 'ok' && !ok ? { unverified: true } : {}) };
  }
  // P275: 하위가 아직 깨어 있으면(재우기가 거절됐거나 끝났으면) 다시 재운다
  keepAsleep(sid) {
    const s = sid ? this.b.sessions.get(sid) : null;
    if (!s || (s.rt && s.rt.sleep) || this.sleeping.has(sid)) return;
    if (!this.pendingSleep.has(sid)) this.pendingSleep.set(sid, 0);
    this.sleepSoon(s);
  }
  // 합침(판이 확인함): 소식 한 줄, 하위를 닫고 보관한다
  async finishOk(caller, unit, check) {
    const st = this.store(); const m = unit.meta || {};
    const hash = check ? check.hash : null;
    try { st.addNews({ sessionId: caller.sessionId, name: shownName(caller) || caller.name, at: Date.now(), kind: 'merge', task: '병합: @' + (m.child || '?'), text: '@' + (m.child || '?') + ' 합침 ' + short(hash) + (m.target ? ' → ' + m.target : ''), result: 'ok' }); } catch (e) { this.log('merge news ' + e.message); }
    this.changed(m.ws);
    if (m.childId) await this.closeChild(m.childId);
  }
  async closeChild(sid) {
    const b = this.b; const br = this.units.branch;
    this.pendingSleep.delete(sid);
    if (b.sleeper && b.sleeper.going && b.sleeper.going.has(sid)) await b.sleeper.going.get(sid).catch(() => {});
    const s = b.sessions.get(sid);
    if (!s) return null;
    if (br && br.byParentKill) br.byParentKill.add(sid); // 부모에게 닫힘 알림을 보내지 않는다
    try {
      const r = await b.kill({ session: sid, confirm: true, after: 'archive' });
      this.store().addEvent(sid, 'merge_closed', { archived: !!(r && r.after && r.after.archived) });
      this.log('merge closed child ' + s.name);
      return r;
    } catch (e) { if (br && br.byParentKill) br.byParentKill.delete(sid); this.log('merge close child ' + s.name + ' failed: ' + (e.code || e.message)); return null; }
  }

  // ---------- 상태 변화(branch bus 'session') ----------
  onSession(s, sum) {
    const sid = s.sessionId; const rest = sum.state === 'ready' || sum.state === 'error';
    if (this.pendingSleep.has(sid) && rest) this.sleepSoon(s);
    if (sum.state === 'exited' && this.isMerger(s) && !this.retiring.has(sid)) { this.retire(s, 'exited').catch(() => {}); return; }
    if (this.pendingCheck.has(sid) && rest && !this.store().openTryOf(sid)) { this.pendingCheck.delete(sid); this.lifecycle(s).catch((e) => this.log('merger lifecycle ' + e.message)); }
  }
  // 하위 재우기(턴이 끝난 뒤. 거절되면 다음 턴 끝에 다시, SLEEP_TRIES번까지)
  sleepSoon(s) {
    const sid = s.sessionId;
    if (this.sleeping.has(sid) || !this.b.sleeper) return;
    const t = setTimeout(() => {
      const x = this.b.sessions.get(sid);
      if (!x || !this.pendingSleep.has(sid) || this.sleeping.has(sid)) return;
      const state = this.b.summary ? this.b.summary(x).state : null;
      if (state !== 'ready' && state !== 'error') return;
      if (x.rt && x.rt.sleep) { this.pendingSleep.delete(sid); return; }
      const n = this.pendingSleep.get(sid) || 0;
      if (n >= SLEEP_TRIES) { this.pendingSleep.delete(sid); return; }
      this.pendingSleep.set(sid, n + 1);
      this.sleeping.add(sid);
      Promise.resolve().then(() => this.b.sleeper.sleep(x, { by: 'merge', mode: 'hand', scope: 'session' }))
        .then(() => { this.pendingSleep.delete(sid); try { this.store().addEvent(sid, 'merge_sleep', { ok: true }); } catch {} })
        .catch((e) => { this.log('merge sleep ' + x.name + ' refused: ' + (e.code || e.message)); try { this.store().addEvent(sid, 'merge_sleep', { ok: false, error: e.code || e.message }); } catch {} })
        .finally(() => this.sleeping.delete(sid));
    }, this.sleepDelayMs);
    if (t.unref) t.unref();
  }
  // 그 워크스페이스에서 브랜치(워크트리)에서 일하는 중인 하위(열린 일이 있는 세션)
  openBranchWork(ws, except) {
    const root = this.wsRoot(ws);
    return [...this.b.sessions.values()].filter((x) => x.workspaceKey === ws && x !== except && !this.isMerger(x) && this.store().openTryOf(x.sessionId)
      && ((x.git && x.git.isWorktree) || (root && workCwd(x) && !same(workCwd(x), root)))).length;
  }
  // merger의 턴이 끝났고 열린 일이 없다: 다섯 번을 채웠거나 할 일이 없으면 닫고 보관한다
  async lifecycle(s) {
    const [key, rec] = this.recOfSession(s.sessionId);
    if (!key) return null;
    if (this.retiring.has(s.sessionId) || (rec.jobs || 0) >= this.jobs) return this.retire(s, 'jobs');
    if (this.store().queuedUnitsOf(s.sessionId).length) { this.units.pump(s.sessionId); return null; }
    if (this.openBranchWork(rec.ws, s) > 0) return null;
    return this.retire(s, 'idle');
  }
  // merger를 닫고 보관한다. 줄 선 일은 떼어 두었다가 새 merger에게 넣는다
  async retire(s, why) {
    const b = this.b; const st = this.store(); const sid = s.sessionId; const br = this.units.branch;
    const [key, rec] = this.recOfSession(sid);
    this.retiring.add(sid);
    try {
      for (const u of st.queuedUnitsOf(sid)) if (u.origin === 'merge') st.updateUnit(u.id, { to: '' });
      this.units.queued.delete(sid);
      if (br && br.byParentKill) br.byParentKill.add(sid);
      if (b.sleeper && b.sleeper.going && b.sleeper.going.has(sid)) await b.sleeper.going.get(sid).catch(() => {});
      if (b.sessions.has(sid)) await b.kill({ session: sid, confirm: true, after: 'archive' }).catch((e) => this.log('merger close ' + s.name + ' failed: ' + (e.code || e.message)));
      if (key) this.saveRec(key, { ...rec, sessionId: null, jobs: 0, closedAt: Date.now(), closedWhy: why });
      try { st.addEvent(sid, 'merger_retire', { key, why, jobs: rec ? rec.jobs : null }); } catch {}
      this.log('merger ' + (key || '?') + ' retired ' + s.name + ' (' + why + ')');
      if (key) this.summarize(key, shownName(s) || s.name, why);
    } finally { this.retiring.delete(sid); this.pendingCheck.delete(sid); }
    if (key) { this.changed(rec.ws); if (st.unassignedMergeUnits().some((u) => u.meta && u.meta.key === key)) await this.ensure(key); }
    return { retired: s.name, why };
  }
  // P290: 그 키의 끝낸 합치기 일(정리 전)을 부모별로 묶어 알린다. merger: 머리에 쓸 이름(없으면 일에 적힌 이름)
  summarize(key, merger, why) {
    const st = this.store(); const b = this.b;
    let list;
    try { list = st.pendingMergeSummaries().filter((u) => u.meta.key === key); } catch (e) { this.log('merge summary ' + e.message); return []; }
    if (!list.length) return [];
    const groups = new Map();
    for (const u of list) { if (!groups.has(u.from)) groups.set(u.from, []); groups.get(u.from).push(u); }
    const out = [];
    for (const [from, units] of groups) {
      const parent = b.sessions.get(from) || null;
      const name = merger || units[units.length - 1].meta.merger || (this.rec(key) || {}).name || 'merger';
      let deliveryId = null;
      if (parent && !parent.closedAt && b.queue && !units.every((u) => u.meta && u.meta.human)) { // P321: 사람이 맡긴 병합은 정리 알림을 보내지 않는다(실패는 결정 카드, 합침은 소식)
        const extra = b.docs ? b.docs.doneLines(parent) : []; // P257 문서 규칙 꼬리(한 번)
        const withRec = units.map((u) => { let src = null; try { src = u.source ? st.getUnit(u.source) : null; } catch {} return src && src.records ? { ...u, records: src.records } : u; }); // P334
        const d = b.queue.enqueue(parent.sessionId, mergeSummaryText({ merger: name, units: withRec, extra }));
        deliveryId = d ? d.deliveryId : null;
      }
      for (const u of units) st.updateUnit(u.id, { meta: { ...u.meta, summary: deliveryId ? 'sent' : 'dropped', summaryAt: Date.now(), ...(deliveryId ? { summaryDelivery: deliveryId } : {}) } });
      try { st.addEvent(parent ? parent.sessionId : null, 'merge_summary', { key, why, merger: name, units: units.map((u) => u.id), deliveryId }); } catch {}
      this.log('merge summary ' + key + ' → ' + (parent ? parent.name : '(closed parent)') + ': ' + units.length + ' (' + why + ')');
      out.push({ parent: from, units: units.length, deliveryId });
    }
    return out;
  }
  // 일 표가 merger의 닫힘을 볼 때(units.onClosed가 줄 선 일을 취소하기 전에): 줄 선 합치기 일을 떼어 두고 새 merger에게 넣는다
  onClosing(s) {
    if (!this.isMerger(s) || this.retiring.has(s.sessionId)) return;
    const st = this.store(); const [key, rec] = this.recOfSession(s.sessionId);
    const moved = st.queuedUnitsOf(s.sessionId).filter((u) => u.origin === 'merge');
    for (const u of moved) st.updateUnit(u.id, { to: '' });
    if (key) this.saveRec(key, { ...rec, sessionId: null, jobs: 0, closedAt: Date.now(), closedWhy: 'closed' });
    this.pendingCheck.delete(s.sessionId);
    if (key) this.summarize(key, shownName(s) || s.name, 'closed'); // P290
    if (key && moved.length) { const t = setTimeout(() => this.ensure(key).catch(() => {}), 0); if (t.unref) t.unref(); }
    if (key) this.changed(rec.ws);
  }

  // ---------- 사람에게 묻기(설정 ask, 워크스페이스마다 한 번) ----------
  ask(ws, info) {
    const asks = this.meta(META_ASKS);
    if (asks[ws]) return asks[ws];
    const card = { workspace: ws, workspaceName: this.wsName(ws), root: slash(info.root), at: Date.now(), child: info.child, branch: info.branch, target: info.target };
    this.store().setMeta(META_ASKS, { ...asks, [ws]: card });
    try { this.store().addEvent(null, 'merger_ask', card); } catch {}
    this.emit('merger.ask', card);
    this.log('merger ask ' + ws);
    return card;
  }
  asks() { return Object.values(this.meta(META_ASKS)); }
  // answer: on | off(기억) | ask(잊는다: 다음 브랜치 하위의 done ok에 다시 묻는다)
  answer(ws, answer) {
    if (!['on', 'off', 'ask'].includes(answer)) throw apiError('bad_request', 'answer는 on, off, ask 가운데 하나다: ' + answer);
    const answers = this.meta(META_ANSWERS); const asks = this.meta(META_ASKS);
    if (answer === 'ask') delete answers[ws]; else answers[ws] = answer;
    delete asks[ws];
    this.store().setMeta(META_ANSWERS, answers); this.store().setMeta(META_ASKS, asks);
    try { this.store().addEvent(null, 'merger_answer', { workspace: ws, answer }); } catch {}
    const out = { workspace: ws, answer, ...this.modeFor(ws), enabled: this.enabledFor(ws) };
    this.emit('merger.answered', out);
    this.changed(ws);
    return out;
  }

  // ---------- 창이 보는 자료(merger.status) ----------
  changed(ws) { this.emit('merger.updated', { workspace: ws || null }); }
  status(ws = null) {
    const st = this.store(); const set = this.settings();
    const mergers = Object.values(this.recs()).filter((r) => r && (!ws || r.ws === ws)).map((r) => {
      const s = r.sessionId ? this.b.sessions.get(r.sessionId) : null;
      return { key: r.key, workspace: r.ws, target: r.target, name: s ? shownName(s) || s.name : r.name, sessionId: s ? s.sessionId : null, open: !!s, jobs: r.jobs || 0, jobsMax: this.jobs, gen: r.gen || 0, worktree: mergerWorktreeOf(r.root || this.wsRoot(r.ws) || '.', r.target), kind: r.kind || null, model: r.model || null };
    });
    const jobs = st.openMergeUnits().filter((u) => !ws || (u.meta && u.meta.ws === ws)).map((u) => this.jobView(u));
    const answers = this.meta(META_ANSWERS);
    return { mode: MERGER_MODES.includes(set.mergerMode) ? set.mergerMode : 'ask', enabled: ws ? this.enabledFor(ws) : null, settings: { mergerMode: set.mergerMode, mergerKind: set.mergerKind, mergerModel: set.mergerModel, mergerEffort: set.mergerEffort, mergerPermission: set.mergerPermission },
      answers: ws ? { [ws]: answers[ws] || null } : answers, asks: this.asks().filter((a) => !ws || a.workspace === ws), mergers, jobs, jobsMax: this.jobs,
      problem: (() => { const p = this.meta(META_PROBLEM); return p && p.at && (!ws || p.workspace === ws) ? p : null; })() }; // P275: merger를 띄우지 못한 마지막 까닭
  }
  // 합치기 일 하나(창이 하위 → merger 선을 그리는 자료)
  jobView(u) {
    const m = u.meta || {}; const tr = this.store().lastTryOfUnit(u.id);
    return { unit: u.id, source: u.source, state: mergeState(u, tr), ...(m.discard ? { discard: true } : {}), workspace: m.ws, target: m.target, branch: m.branch, tip: m.tip, child: m.child, childId: m.childId, childOpen: !!(m.childId && this.b.sessions.has(m.childId)), parentId: u.from, parent: this.nameOf(u.from), mergerId: u.to || null, merger: u.to ? this.nameOf(u.to) : null, createdAt: u.createdAt, closedAt: u.closedAt, hash: m.merged ? m.merged.hash || null : null };
  }
  // 부모의 atrium items 한 줄에 붙는 합치기 상태
  itemMerge(u) {
    if (!u || u.origin === 'merge') return null;
    const mu = this.store().mergeUnitOf(u.id);
    if (!mu) return null;
    const tr = this.store().lastTryOfUnit(mu.id); const m = mu.meta || {};
    return { unit: mu.id, state: mergeState(mu, tr), merger: mu.to ? this.nameOf(mu.to) : null, hash: m.merged ? m.merged.hash || null : null, line: m.failed ? m.failed.line : m.merged ? m.merged.line : null };
  }
}

// 판 API(창·휴대폰·사람의 atrium call). 설정 값은 settings.set(mergerMode, mergerKind, mergerModel, mergerEffort, mergerPermission)
export function mergerHandlers(b) {
  const m = () => { if (!b.merger) throw apiError('merger_off', 'merger 기능이 없다'); return b.merger; };
  const wsOf = async (p, required) => { if (!(p && p.workspace) && !required) return null; return (await b.resolveWorkspace(p && p.workspace)).key; };
  return {
    'merger.status': async (p = {}) => m().status(await wsOf(p, false)),
    'merger.asks': () => ({ asks: m().asks() }),
    'merger.answer': async (p = {}) => m().answer(await wsOf(p, true), String((p && p.answer) || '')),
  };
}
