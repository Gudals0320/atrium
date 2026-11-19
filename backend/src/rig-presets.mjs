// P228: rig 2 6단계 — "Rig 만들기" 대화상자의 세 질문(고리 하나 + 덧붙임)과 이름 붙인 바로가기 둘(docs research rig2-design.md 11.2·11.3·11.11).
// - 세 질문: (1) 언제 도나: 요청이 올 때(request) · 정해진 때마다(every: 1d, 7d, <n>h). event는 기능이 생길 때까지 묻지 않는다.
//   (2) 누가 하나: 자리 하나와 런처, keep 또는 fresh(request는 keep만). 권한 ask | scoped, "질문 없이 돌리기"(unattended) 체크.
//   (3) 덧붙임(모두 끄고 시작): 정본 문서(자리 loads, 없으면 판이 새로 만듦), 장부(+ 개선 고리: n일마다, 정본 고침은 사람 승인),
//       산출물 폴더(섹터 하나), 기계 검사(done 훅 하나, 스크립트 경로), 검토 자리(다른 런처의 fresh 자리, 반려 되돌아감 최대 2).
// - 답(answers) → { def(rig.json), guides(자리 안내), files(판이 새로 만드는 파일: 없을 때만), dirs(만들 폴더) }. rig.create(rig-setup.mjs)가 쓴다.
// - 제안을 내는 고리(개선 고리)의 입구 자리 writes에는 .atrium/drafts/<자리>/를 저절로 넣는다(11.9의 9).
// - P230(11.12): 기계 검사 done 훅은 seat(작업 자리). 정기 점검 일 글에 "바뀐 것 없으면 한 줄". 저장소 아닌 워크스페이스의 정기 점검 경고는 rig.presets의 git(창)
// - 정기 점검: scoped + 읽기 허용 목록(git·gh 조회 동사, PowerShell 읽기 cmdlet. Bash로 감싼 powershell은 넣지 않는다, 11.10) + 보고서 폴더를 쓰기 범위로.
// - 옛 3자리 틀(메인 + 워커, + 검토자, 워크트리판)은 대화상자에서 내렸다(11.1). 그 틀로 만든 rig.json은 그대로 읽고 돈다(옮기기 없음).
// - P232(rig2-design 11.14): 기본 경로는 .atrium/ 아래(정본 .atrium/canon/rules.md, 장부 .atrium/ledger/<고리>.jsonl), 산출물 폴더는 reports/ 그대로(9).
//   개선 계기에 이어진 회 수(ledger.followups → trigger.followups, 0이면 끔. "규칙이 자라는 반복 작업"은 3)(5·6·7).
//   "규칙이 자라는 반복 작업"은 scoped + git 읽기 허용 목록(GROW_ALLOW. git -C는 넣지 않는다)(10). 정기 점검 허용 목록에 npm·git ls-tree 읽기, 일 글에 세 줄(1·4·12).
//   답의 allow(Claude Code 권한 규칙 배열)를 주면 scoped 자리의 허용 목록이 된다(없으면 READ_ALLOW).

export const SEAT_NAME_RE = /^[a-z][a-z0-9_]{0,23}$/;
export const WORK_LOOP = 'work';
export const IMPROVE_LOOP = 'improve';
export const REVIEW_SEAT = 'reviewer';
export const REVIEW_MAX = 2;
export const EVERY_PRESETS = ['1d', '7d'];
export const HOURS_MAX = 24 * 30;
export const IMPROVE_DAYS_MAX = 90;
export const SECTOR_KEEP = 20;
export const PROPOSALS_DIR = '.atrium/proposals/';
export const draftsDir = (seat) => `.atrium/drafts/${seat}/`;
const guidePath = (seat) => `.atrium/seats/${seat}.txt`;
// 정기 점검의 읽기 허용 목록(Claude Code 권한 규칙 꼴). P223·P225에서 정기 점검이 이것으로 권한 질문 0번으로 돌았다
// P232(11.14의 1·4): P229 시험 A에서 물은 읽기(npm outdated·ls·view, git ls-tree)를 더한다. gh api는 쓰기 동사를 같은 접두로 받아 넣지 않는다
export const READ_ALLOW = [
  'Bash(git status:*)', 'Bash(git log:*)', 'Bash(git diff:*)', 'Bash(git show:*)', 'Bash(git branch:*)', 'Bash(git ls-tree:*)',
  'Bash(npm outdated:*)', 'Bash(npm ls:*)', 'Bash(npm view:*)',
  'Bash(gh run list:*)', 'Bash(gh run view:*)', 'Bash(gh issue list:*)', 'Bash(gh issue view:*)', 'Bash(gh pr list:*)', 'Bash(gh pr view:*)', 'Bash(gh pr checks:*)',
  'PowerShell(Get-ChildItem:*)', 'PowerShell(Get-Content:*)', 'PowerShell(Select-String:*)', 'PowerShell(Test-Path:*)', 'PowerShell(Get-Item:*)', 'PowerShell(Resolve-Path:*)', 'PowerShell(Measure-Object:*)',
];

// P232(11.14의 10): "규칙이 자라는 반복 작업"의 허용 목록. git 읽기 동사만. git -C는 뒤에 어떤 동사든 와서 넣지 않는다(안내 줄이 -C 없이 쓰라고 한다)
export const GROW_ALLOW = ['Bash(git log:*)', 'Bash(git show:*)', 'Bash(git diff:*)', 'Bash(git cat-file:*)'];
// P232(11.14의 9): 기본 경로. 정본·장부는 rig의 것이라 .atrium/ 아래, 산출물은 사람이 보는 결과라 저장소의 reports/
export const CANON_DEFAULT = '.atrium/canon/rules.md';
export const LEDGER_DEFAULT = `.atrium/ledger/${WORK_LOOP}.jsonl`;
export const FOLLOWUPS_MAX = 50;
export const GROW_FOLLOWUPS = 3;

// 답의 기본(모든 덧붙임이 꺼짐). 경로는 꺼져 있어도 값을 지녀, 켜면 바로 쓴다
export const DEFAULT_ANSWERS = Object.freeze({
  shortcut: null,
  trigger: 'request', every: '7d',
  seat: 'main', launcher: '', session: 'keep', permission: 'ask', unattended: false,
  task: '', allow: null,
  canon: { on: false, path: CANON_DEFAULT },
  ledger: { on: false, path: LEDGER_DEFAULT, improve: false, days: 7, followups: 0 },
  sector: { on: false, path: 'reports/' },
  check: { on: false, script: '.atrium/hooks/check.mjs' },
  review: { on: false, launcher: '' },
});

// 산출물 폴더와 장부의 경로는 자리 안내와 회의 첫 일 글(산출물 섹터 줄)이 알려 준다. 그래서 task는 경로를 적지 않는다(사람이 경로를 바꿔도 맞다)
export const CHECK_TASK = 'Regular check: look at failing CI runs, stale issues and pull requests, and outdated dependencies. Read the ledger first and do not repeat findings that are already there unless they changed. Write one short report file in the output folder and append one JSON line per finding to the ledger. Do not fix anything; list what a person should pick. If nothing changed since the last report, write one line: no change + path of the last report. Look at CI with gh run list and gh run view. Name the report reports/<YYYY-MM-DD>-<run ID>.md. If node_modules is missing, compare package.json with npm view <package> version. Then close with done and file the report as an artifact: atrium done ok "<one-line summary>" --artifact <report path>.';

// 이름 붙인 바로가기 둘(11.3). 누르면 답을 채우고, 그 뒤 사람이 바꿀 수 있다
export const SHORTCUTS = [
  {
    id: 'check', title: '정기 점검', desc: '매주 새 세션 하나가 저장소를 살펴 보고서를 산출물 폴더에 쓰고 장부에 적습니다. 고치지는 않고, 고칠 것은 사람이 고릅니다.',
    en: { title: 'Regular check', desc: 'Every week a new session looks over the repository, writes a report to the output folder, and notes it in the ledger. It fixes nothing; a person picks what to fix.' },
    answers: { trigger: 'every', every: '7d', seat: 'checker', session: 'fresh', permission: 'scoped', unattended: false, task: CHECK_TASK, allow: READ_ALLOW.slice(),
      canon: { on: false }, ledger: { on: true, path: LEDGER_DEFAULT, improve: false }, sector: { on: true, path: 'reports/' }, check: { on: false }, review: { on: false } },
  },
  {
    id: 'grow', title: '규칙이 자라는 반복 작업', desc: '같은 종류의 일을 요청마다 되풀이합니다. 자리는 매번 정본 문서를 읽고, 교정과 실패를 장부에 적습니다. 7일마다, 또는 이어진 요청(30분 안의 다음 요청)이 3번 쌓이면 장부를 읽고 정본 고침을 제안하고, 사람이 승인하면 반영됩니다.',
    en: { title: 'Repeated work with growing rules', desc: 'The same kind of task, once per request. The seat reads the canon document every time and notes corrections and failures in the ledger. Every 7 days, or after 3 follow-up requests (a next request within 30 minutes), it reads the ledger and proposes canon changes, applied when a person approves.' },
    answers: { trigger: 'request', seat: 'main', session: 'keep', permission: 'scoped', unattended: false, task: '', allow: GROW_ALLOW.slice(),
      canon: { on: true, path: CANON_DEFAULT }, ledger: { on: true, path: LEDGER_DEFAULT, improve: true, days: 7, followups: GROW_FOLLOWUPS }, sector: { on: false }, check: { on: false }, review: { on: false } },
  },
];
export const shortcutOf = (id) => SHORTCUTS.find((x) => x.id === id) || null;

const bad = (message) => Object.assign(new Error(message), { code: 'bad_request' });
const rel = (p) => String(p || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
// 저장소 안 상대 경로만(절대 경로·..·빈 값은 거절)
function relPath(p, what, { dir = false } = {}) {
  let r = rel(p);
  if (!r) throw bad(`${what}의 경로를 준다`);
  if (/^[A-Za-z]:/.test(r) || r.startsWith('/') || r.startsWith('~') || r.split('/').includes('..')) throw bad(`${what}의 경로는 워크스페이스 안 상대 경로다: ${p}`);
  if (dir && !r.endsWith('/')) r += '/';
  if (!dir && r.endsWith('/')) return r; // 정본은 폴더도 된다
  return r;
}
const sub = (base, over) => ({ ...base, ...(over || {}) });
const ALLOW_RULE_RE = /^[A-Za-z][A-Za-z0-9_-]*(\(.+\))?$/; // rig-amp.mjs의 자리 allow 검사와 같은 꼴

// 답 정리: 기본값을 채우고 서로 맞지 않는 것을 고친다(request는 keep만). 틀린 값은 던진다(code bad_request)
export function normalizeAnswers(a = {}) {
  const sc = a.shortcut ? shortcutOf(a.shortcut) : null;
  const d = DEFAULT_ANSWERS;
  const x = {
    ...d, ...a,
    canon: sub(d.canon, a.canon), ledger: sub(d.ledger, a.ledger), sector: sub(d.sector, a.sector), check: sub(d.check, a.check), review: sub(d.review, a.review),
    shortcut: sc ? sc.id : null,
  };
  if (!['request', 'every'].includes(x.trigger)) throw bad(`언제 도나는 request 또는 every다: ${JSON.stringify(x.trigger)}`);
  if (x.trigger === 'every') {
    const e = String(x.every || '').trim();
    const m = /^(\d+)h$/.exec(e);
    if (!EVERY_PRESETS.includes(e) && !(m && Number(m[1]) >= 1 && Number(m[1]) <= HOURS_MAX)) throw bad(`정해진 때는 ${EVERY_PRESETS.join(', ')} 또는 <n>h(1~${HOURS_MAX})다: ${JSON.stringify(x.every)}`);
    x.every = e;
  }
  x.seat = String(x.seat || '').trim();
  if (!SEAT_NAME_RE.test(x.seat)) throw bad(`자리 이름은 영문 소문자로 시작하고 소문자·숫자·_로 24자까지다: ${JSON.stringify(x.seat)}`);
  if (x.review.on && x.seat === REVIEW_SEAT) throw bad(`검토 자리를 켜면 자리 이름 ${REVIEW_SEAT}는 쓸 수 없다`);
  x.session = x.trigger === 'request' ? 'keep' : x.session === 'keep' ? 'keep' : 'fresh';
  if (!['ask', 'scoped'].includes(x.permission)) throw bad(`권한은 ask 또는 scoped다(질문 없이 돌리기는 unattended 체크): ${JSON.stringify(x.permission)}`);
  x.unattended = x.unattended === true;
  x.task = String(x.task || '').trim();
  const days = Number(x.ledger.days);
  if (x.ledger.on && x.ledger.improve && !(Number.isInteger(days) && days >= 1 && days <= IMPROVE_DAYS_MAX)) throw bad(`개선 주기는 1~${IMPROVE_DAYS_MAX}일이다: ${JSON.stringify(x.ledger.days)}`);
  if (x.canon.on) x.canon.path = relPath(x.canon.path, '정본 문서');
  if (x.ledger.on) { x.ledger.path = relPath(x.ledger.path, '장부'); if (x.ledger.path.endsWith('/')) throw bad(`장부는 파일이다: ${x.ledger.path}`); x.ledger.improve = x.ledger.improve === true; x.ledger.days = days || 7; }
  // P232(11.14의 7): 개선 계기의 이어진 회 수(0·없음이면 끔)
  const fu = x.ledger.followups == null || x.ledger.followups === '' ? 0 : Number(x.ledger.followups);
  if (x.ledger.on && x.ledger.improve && !(Number.isInteger(fu) && fu >= 0 && fu <= FOLLOWUPS_MAX)) throw bad(`이어진 회 수는 0~${FOLLOWUPS_MAX}이다(0이면 끔): ${JSON.stringify(x.ledger.followups)}`);
  x.ledger.followups = Number.isInteger(fu) && fu > 0 ? fu : 0;
  // P232: scoped 자리의 허용 목록(Claude Code 권한 규칙). git -C는 받지 않는다(어떤 동사든 뒤에 온다)
  if (x.allow != null) {
    if (!Array.isArray(x.allow) || x.allow.some((r) => typeof r !== 'string' || !ALLOW_RULE_RE.test(r.trim()))) throw bad(`허용 목록은 Claude Code 권한 규칙 배열이다(예: "Bash(git log:*)"): ${JSON.stringify(x.allow)}`);
    const c = x.allow.find((r) => /^Bash\(\s*git\s+-C\b/i.test(r.trim()));
    if (c) throw bad(`git -C는 허용 목록에 넣지 않는다(뒤에 어떤 동사든 온다): ${c}`);
    x.allow = [...new Set(x.allow.map((r) => r.trim()))];
  }
  if (x.sector.on) x.sector.path = relPath(x.sector.path, '산출물 폴더', { dir: true });
  if (x.check.on) { x.check.script = relPath(x.check.script, '기계 검사 스크립트'); if (x.check.script.endsWith('/')) throw bad(`기계 검사는 스크립트 파일이다: ${x.check.script}`); }
  return x;
}

// 스크립트 경로 → 훅의 run(해석기는 확장자로)
export function scriptRun(p) {
  const ext = (/\.[^./]+$/.exec(p) || [''])[0].toLowerCase();
  if (['.mjs', '.js', '.cjs'].includes(ext)) return ['node', p];
  if (ext === '.py') return ['python', p];
  if (ext === '.ps1') return ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', p];
  return [p];
}

// 자리 안내(일반 말)
function seatGuide(x) {
  const L = [];
  L.push(x.trigger === 'request'
    ? `${x.seat} 자리: 사람이나 다른 세션이 보낸 요청 하나를 받아 끝까지 한다. 요청마다 회가 하나 열린다.`
    : `${x.seat} 자리: 보드가 ${everyText(x.every)} 회를 열어 보낸 일을 한다. 일 글이 할 일이다.`);
  if (x.canon.on) L.push(`- 일을 시작하기 전에 정본 문서 ${x.canon.path}를 읽고 따른다. 정본은 직접 고치지 않는다(보드가 막는다).`);
  if (x.ledger.on) L.push(`- 사람의 교정, 반려, 실패, 새로 안 사실이 있으면 장부 ${x.ledger.path}에 JSON 한 줄씩 덧붙인다({"t": "<시각>", "kind": "correction|failure|fact", "text": "<한 줄>"}). 이미 적힌 것은 다시 적지 않는다.`);
  if (x.ledger.on && x.ledger.improve) {
    const target = x.canon.on ? `--target <정본 문서 이름 rules 또는 definition>` : '--target definition';
    L.push(`- 개선 회(보드가 ${x.ledger.days}일마다${x.ledger.followups ? `, 또는 이어진 회(앞 회가 끝나고 30분 안에 같은 쪽이 보낸 다음 요청)가 ${x.ledger.followups}번 쌓이면` : ''} 연다)에서는 장부를 읽고 고칠 규칙을 제안한다: 새 내용 전체를 ${draftsDir(x.seat)} 안에 쓰고 atrium rig propose ${target} --file <초안> --why "<까닭>". 사람이 승인하면 보드가 반영한다. 고칠 것이 없으면 그렇게 적고 닫는다.`);
  }
  if (x.sector.on) L.push(`- 결과 파일은 ${x.sector.path} 안에 쓰고, 닫을 때 낸다: atrium done ok "<보고>" --artifact ${x.sector.path}<파일>.`);
  if (x.check.on) L.push(`- 닫을 때 보드가 검사 스크립트 ${x.check.script}를 돌린다. 통과하지 못하면 닫기가 막히니 까닭을 고치고 다시 닫는다.`);
  if (x.review.on) L.push(`- ok로 닫으면 ${REVIEW_SEAT} 자리가 결과를 확인한다. 반려되어 다시 받으면 반려 글의 지적을 먼저 고친다(같은 회에서 ${REVIEW_MAX}번까지).`);
  L.push('- 끝나면 한 것과 확인한 것을 적어 닫는다: atrium done ok "<요약>". 하지 못했으면 atrium done failed "<까닭>".');
  return L.join('\n') + '\n';
}
function reviewGuide(x) {
  return [
    `${REVIEW_SEAT} 자리: ${x.seat} 자리가 끝낸 일을 확인한다. 직접 고치지 않는다.`,
    x.canon.on ? `- 정본 문서 ${x.canon.path}를 기준으로 본다.` : '',
    '- 넘겨받은 글의 할 일과 보고를 읽고, 결과가 할 일을 채우는지 실제로 확인한다.',
    '- 채우면: atrium done ok "<확인한 것>".',
    `- 고칠 것이 있으면: atrium done rejected "<고칠 것을 하나씩>". ${x.seat} 자리가 다시 받는다(같은 회에서 ${REVIEW_MAX}번까지).`,
    '- 확인할 수 없으면: atrium done failed "<까닭>".',
  ].filter(Boolean).join('\n') + '\n';
}
const everyText = (e) => (e === '1d' ? '매일' : e === '7d' ? '매주' : `${parseInt(e, 10)}시간마다`);
const CANON_STARTER = '# 규칙\n\n이 rig의 자리가 일마다 읽는 규칙과 사실이다. 사람이 고치거나, 개선 회의 제안을 사람이 승인해 고친다.\n\n- (여기에 규칙을 한 줄씩 적는다)\n';
const CHECK_STARTER = [
  '// rig 기계 검사(done 훅). 자리가 atrium done으로 닫을 때 보드가 돌린다(Rig 만들기가 만든 시작 파일).',
  '// 입력: stdin JSON(그 일과 결과). 출력: stdout JSON { "action": "pass" } 또는 { "action": "reject", "reason": "<까닭>" }.',
  '// check()에 확인할 것을 적는다. 예: execSync("npm test", { stdio: "ignore" })가 던지면 reject. 지금은 늘 통과한다.',
  "let input = '';",
  "process.stdin.on('data', (d) => { input += d; });",
  "process.stdin.on('end', () => {",
  '  let reason = null;',
  "  try { reason = check(JSON.parse(input || '{}')); } catch (e) { reason = String((e && e.message) || e); }",
  "  process.stdout.write(JSON.stringify(reason ? { action: 'reject', reason } : { action: 'pass' }));",
  '});',
  'function check(job) { // eslint-disable-line no-unused-vars',
  '  return null;',
  '}',
  '',
].join('\n');

// 답 + 런처 → { answers(정리한 것), def, guides, files, dirs }
//   launchers: { seat, review }(rig.json에 쓸 런처 값). kindOf(런처 값) → 종류(claude, codex 등): 허용 목록은 Claude Code 자리에만 넣는다(Codex는 쓰이지 않아 검사기가 경고)
export function presetFiles(answers, { launcher = 'claude', reviewLauncher = null, kindOf = (l) => l } = {}) {
  const x = normalizeAnswers(answers);
  const S = x.seat;
  const docs = {}; const files = {}; const dirs = new Set();
  const seat = { launcher, session: x.session };
  if (x.session === 'fresh') { seat.max_live = 1; seat.close = 'run'; }
  seat.guide = guidePath(S);
  const writes = [];
  const work = { kind: 'work', trigger: x.trigger === 'request' ? { request: S } : { every: x.every }, entry: S };
  const loops = { [WORK_LOOP]: work };
  if (x.canon.on) {
    docs.rules = { path: x.canon.path, role: 'canon' };
    seat.loads = ['rules'];
    if (x.canon.path.endsWith('/')) dirs.add(x.canon.path); else files[x.canon.path] = CANON_STARTER;
  }
  if (x.ledger.on) {
    docs.ledger = { path: x.ledger.path, role: 'ledger', git: false, owner: WORK_LOOP };
    writes.push('ledger');
    files[x.ledger.path] = '';
    if (x.ledger.improve) {
      docs.proposals = { path: PROPOSALS_DIR, role: 'sector', intake: 'register' };
      dirs.add(PROPOSALS_DIR);
      writes.push(draftsDir(S)); dirs.add(draftsDir(S));
      loops[IMPROVE_LOOP] = { kind: 'improve', trigger: { every: `${x.ledger.days}d`, ...(x.ledger.followups ? { followups: x.ledger.followups } : {}), ...(x.session === 'keep' ? { notify: S } : {}) }, entry: S, reads: ['ledger'], produces: ['proposals'], approve: 'human' };
    }
  }
  if (x.sector.on) {
    docs.output = { path: x.sector.path, role: 'sector', intake: 'register', keep: SECTOR_KEEP };
    writes.push('output'); dirs.add(x.sector.path);
    work.produces = ['output'];
  }
  if (writes.length) seat.writes = writes;
  const perm = x.unattended ? 'unattended' : x.permission;
  if (perm !== 'ask') seat.permission = perm;
  if (perm === 'scoped' && kindOf(launcher) === 'claude') seat.allow = (x.allow || READ_ALLOW).slice(); // P232: 답의 허용 목록(바로가기가 채운다)
  if (x.trigger === 'every') work.task = x.task || `Scheduled run: read ${guidePath(S)} and do the work it describes, then close with atrium done ok "<one-line summary>" (atrium done failed "<reason>" if you could not).`;
  const seats = { [S]: seat };
  const guides = { [guidePath(S)]: seatGuide(x) };
  let results = null;
  if (x.review.on) {
    const rl = reviewLauncher || launcher;
    const rv = { launcher: rl, session: 'fresh', max_live: 1, close: 'run', guide: guidePath(REVIEW_SEAT), writes: false };
    if (x.canon.on) rv.reads = ['rules'];
    if (perm !== 'ask') { rv.permission = 'scoped'; if (kindOf(rl) === 'claude') rv.allow = READ_ALLOW.slice(); }
    seats[REVIEW_SEAT] = rv;
    guides[guidePath(REVIEW_SEAT)] = reviewGuide(x);
    results = ['ok', 'failed', 'rejected'];
    work.flow = [
      { from: S, on: 'ok', to: REVIEW_SEAT },
      { from: REVIEW_SEAT, on: 'rejected', to: S, max: REVIEW_MAX },
    ];
  }
  const hooks = x.check.on ? [{ at: 'done', seat: S, run: scriptRun(x.check.script), onFail: 'block' }] : null; // P230(11.12의 5): 기계 검사는 작업 자리의 done에서만(검토 자리 done에는 돌지 않는다)
  if (x.check.on && /\.(mjs|js)$/i.test(x.check.script)) files[x.check.script] = CHECK_STARTER;
  const sc = x.shortcut ? shortcutOf(x.shortcut) : null;
  const def = {
    version: 2,
    name: sc ? sc.en.title : x.trigger === 'request' ? 'Request loop' : 'Scheduled loop',
    ...(results ? { results } : {}),
    ...(Object.keys(docs).length ? { docs } : {}),
    seats,
    loops,
    ...(hooks ? { hooks } : {}),
    ...(x.session === 'keep' ? { manager: S } : {}),
  };
  return { answers: x, def, guides, files, dirs: [...dirs] };
}

// 바로가기 답 → 대화상자의 답(기본 위에 얹는다. 꺼진 덧붙임의 경로는 기본값)
export function shortcutAnswers(id) {
  const sc = shortcutOf(id);
  if (!sc) throw bad(`모르는 바로가기: ${id}. 바로가기: ${SHORTCUTS.map((s) => s.id).join(', ')}`);
  const d = DEFAULT_ANSWERS; const a = sc.answers;
  return { ...d, ...a, shortcut: sc.id, canon: sub(d.canon, a.canon), ledger: sub(d.ledger, a.ledger), sector: sub(d.sector, a.sector), check: sub(d.check, a.check), review: sub(d.review, a.review) };
}
