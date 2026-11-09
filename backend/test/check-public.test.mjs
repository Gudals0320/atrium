// 공개 저장소 검사(scripts/check-public.mjs)의 규칙. 가짜 개인 값과 가짜 토큰은 실행할 때 만든다(이 파일이 검사에 걸리지 않게).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanText, localSecrets, blockedPath, committerOk, authorOk, privateWordsFile, readPrivateWords, PRIVATE_WORDS_FILE } from '../../scripts/check-public.mjs';

const SCRIPT = fileURLToPath(new URL('../../scripts/check-public.mjs', import.meta.url));

const user = 'zq' + 'kimtest';
const home = ['C:', 'Users', user].join('\\');
const mail = `${user}@example.org`;
const sec = localSecrets({ home, user, emails: [mail], extra: '', words: [] });
const found = (text, s = sec) => scanText(text, s);

test('이 컴퓨터의 사용자 이름, 홈 폴더(두 방향 슬래시), 개인 메일을 잡고 값은 가린다', () => {
  for (const text of [`at ${home}\\AppData\\Local`, `at ${home.split('\\').join('/')}/x`, `cd /c/Users/${user}/x`, `owner ${user} 197609`, `mail ${mail}`, `json "${home.split('\\').join('\\\\')}"`]) {
    const f = found(text);
    assert.equal(f.length, 1, text);
    assert.ok(!f[0].text.includes(user), `가리지 않음: ${f[0].text}`);
  }
  assert.equal(found(`line1\nline2 ${mail}`)[0].line, 2);
});

test('자리표시와 남의 이름이 아닌 것은 지나간다', () => {
  for (const text of ['%USERPROFILE%\\.herdr', 'C:\\Users\\u\\AppData', 'C:/Users/x/a', 'C:\\Users\\<user>\\x', 'C:\\Users\\Public\\x', '\\\\.\\pipe\\C:\\Users\\...\\herdr.sock',`${user}x is another word`, 'xx' + user]) {
    assert.deepEqual(found(text), [], text);
  }
});

test('남의 홈 경로도 잡는다(세 글자 이상 이름)', () => {
  const other = ['D:', 'Users', 'someone', 'x'].join('\\');
  assert.equal(found(`p = '${other}'`)[0].kind, '사용자 홈 경로');
  assert.equal(found(`cd /c/Users/${'some'}one/x`)[0].kind, '사용자 홈 경로');
});

test('토큰과 개인 키', () => {
  const cases = [
    'sk-ant-' + 'a1'.repeat(15),
    'sk-' + 'A'.repeat(40),
    'gh' + 'p_' + 'B'.repeat(36),
    'github' + '_pat_' + 'C'.repeat(45),
    'AK' + 'IA' + 'ABCDEFGHIJKLMNOP',
    'xo' + 'xb-' + '1234567890-abc',
    '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----',
    'OPENAI_' + 'API_KEY=' + 'x'.repeat(24),
  ];
  for (const c of cases) assert.equal(found(`v = ${c}`).length, 1, c);
  for (const ok of ["const TOKEN = 'abc'", 'apiToken: info.token', 'sha 9c24478f-cdf8-4f41-be63-1bbffb78397f']) assert.deepEqual(found(ok), [], ok);
});

test('흔한 사용자 이름(user 등)은 낱말로 막지 않고, 홈 경로로만 잡는다', () => {
  const s = localSecrets({ home: ['C:', 'Users', 'user'].join('\\'), user: 'user', emails: [], extra: '', words: [] });
  assert.deepEqual(scanText('the user clicks', s), []);
  assert.equal(scanText(`at ${['C:', 'Users', 'user', 'x'].join('\\')}`, s).length, 1);
});

test('공개하지 않는 경로', () => {
  for (const p of ['experiments/p1/a.png', 'docs/research/x.md', 'docs/log/p1-backend.md', 'docs/ARCH.md', 'app/design/brand/a.svg', '.claude/launch.json', 'backend/.dev/data/board.db', '.env', 'app/.env.local', 'backend/node_modules/ws/index.js', 'x/backend.json']) assert.ok(blockedPath(p), p);
  for (const p of ['.github/images/board.png', 'app/src/main/main.mjs', '.claude/settings.json', 'README.ko.md', 'backend/test/fixtures/x.json']) assert.equal(blockedPath(p), null, p);
});

test('작성자와 커미터는 같은 규칙: 관리자의 개인 메일만 막고 기여자의 메일과 noreply는 받는다', () => {
  for (const ok of [authorOk, committerOk]) {
    assert.ok(ok('255312450+Gudals0320@users.noreply.github.com', sec));
    assert.ok(ok('noreply@github.com', sec));
    assert.ok(ok('someone@example.com', sec), '기여자의 일반 메일');
    assert.ok(!ok(mail, sec), '관리자의 개인 메일');
    assert.ok(!ok(mail.toUpperCase(), sec), '대소문자');
  }
});

test('비공개 낱말 목록의 낱말을 잡고, @가 든 낱말은 개인 메일로 본다', () => {
  const word = 'Zq' + 'Prodname';
  const other = `owner2@${'exam'}ple.net`;
  const s = localSecrets({ home, user, emails: [], extra: '', words: [word, other] });
  const f = scanText(`like the ${word.toLowerCase()} demo`, s);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, '개인 낱말');
  assert.ok(!f[0].text.toLowerCase().includes(word.toLowerCase()), f[0].text);
  assert.deepEqual(scanText(`${word}x is another word`, s), []);
  assert.ok(!committerOk(other, s));
  assert.ok(committerOk('someone@example.com', s));
  // env(쉼표로 나눔)도 그대로 받는다
  const e = localSecrets({ home, user, emails: [], extra: ` ${word} , ab`, words: [] });
  assert.equal(scanText(word, e).length, 1);
  assert.deepEqual(scanText('ab', e), [], '세 글자 미만은 낱말로 막지 않는다');
});

// ---------- 임시 git 저장소에서 훅이 부르는 그대로(--staged, --message, --push) ----------
// git 전역 설정은 임시 파일로 바꾼다(관리자 개인 메일 = mail). 실제 목록 파일과 env는 쓰지 않는다
const word = 'zq' + 'Hiddenname';
const noreply = '1+someone@users.noreply.github.com';
const contributor = 'someone@example.com';

function makeRepo(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'atrium-p63-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const gcfg = path.join(base, 'gitconfig');
  fs.writeFileSync(gcfg, `[user]\n\temail = ${mail}\n[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n`);
  const env = (extra = {}) => {
    const e = { ...process.env };
    for (const k of Object.keys(e)) if (/^GIT_/.test(k) || k === 'ATRIUM_PRIVATE_WORDS') delete e[k];
    return { ...e, GIT_CONFIG_GLOBAL: gcfg, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_COMMITTER_NAME: 't', GIT_AUTHOR_EMAIL: noreply, GIT_COMMITTER_EMAIL: noreply, ...extra };
  };
  const dir = path.join(base, 'repo');
  fs.mkdirSync(dir);
  const git = (args, opts = {}) => execFileSync('git', args, { cwd: opts.cwd || dir, env: env(opts.env), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const check = (args, opts = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: opts.cwd || dir, env: env(opts.env), input: opts.input || '', encoding: 'utf8' });
  const write = (name, text) => fs.writeFileSync(path.join(dir, name), text);
  const commit = (name, text, msg, envx) => { write(name, text); git(['add', name]); git(['commit', '-q', '-m', msg], { env: envx }); return git(['rev-parse', 'HEAD']); };
  git(['init', '-q']);
  const listFile = path.join(dir, '.git', PRIVATE_WORDS_FILE);
  const setList = (lines) => fs.writeFileSync(listFile, lines.join('\r\n'));
  return { base, dir, git, check, write, commit, listFile, setList };
}
const pushLine = (sha) => `refs/heads/main ${sha} refs/heads/main ${'0'.repeat(40)}\n`;

test('비공개 낱말 목록 파일은 git 공통 폴더에 있고 워크트리에서도 같은 파일을 읽는다', (t) => {
  const r = makeRepo(t);
  r.commit('a.txt', 'hello\n', 'init');
  const wt = path.join(r.base, 'wt');
  r.git(['worktree', 'add', '-q', '-b', 'wt', wt]);
  r.setList(['# 주석 줄', '', `  ${word}  `, 'ab']);
  assert.equal(fs.realpathSync(privateWordsFile(wt)), fs.realpathSync(r.listFile));
  assert.equal(fs.realpathSync(privateWordsFile(r.dir)), fs.realpathSync(r.listFile));
  assert.deepEqual(readPrivateWords(privateWordsFile(wt)), [word, 'ab']);
  assert.deepEqual(readPrivateWords(path.join(r.base, 'none')), [], '파일이 없으면 빈 목록');
  // 워크트리에서 부른 검사도 그 목록으로 막는다
  const msg = path.join(r.base, 'msg.txt');
  fs.writeFileSync(msg, `fix the ${word.toUpperCase()} look\n`);
  const res = r.check(['--message', msg], { cwd: wt });
  assert.equal(res.status, 1, res.stderr);
  assert.match(res.stderr, /개인 낱말/);
  assert.ok(!res.stderr.toLowerCase().includes(word.toLowerCase()), '찾은 값은 가린다');
});

test('스테이지된 글, 커밋 메시지, 푸시하는 커밋에 비공개 낱말이 있으면 막는다', (t) => {
  const r = makeRepo(t);
  const clean = r.commit('a.txt', 'hello\n', 'init');
  r.setList([word]);
  // 스테이지
  r.write('b.txt', `// like the ${word} demo\n`);
  r.git(['add', 'b.txt']);
  let res = r.check(['--staged']);
  assert.equal(res.status, 1, res.stderr);
  assert.match(res.stderr, /b\.txt:1: 개인 낱말/);
  r.write('b.txt', '// like the reference demo\n');
  r.git(['add', 'b.txt']);
  res = r.check(['--staged']);
  assert.equal(res.status, 0, res.stderr);
  // 커밋 메시지(# 줄은 git이 지우므로 보지 않는다)
  const msg = path.join(r.base, 'msg.txt');
  fs.writeFileSync(msg, `match the ${word} chips\n`);
  assert.equal(r.check(['--message', msg]).status, 1);
  fs.writeFileSync(msg, `match the reference chips\n# ${word}\n`);
  assert.equal(r.check(['--message', msg]).status, 0);
  // 푸시: 파일과 메시지
  assert.equal(r.check(['--push', 'origin'], { input: pushLine(clean) }).status, 0);
  const inFile = r.commit('c.txt', `${word}\n`, 'add c');
  res = r.check(['--push', 'origin'], { input: pushLine(inFile) });
  assert.equal(res.status, 1, res.stderr);
  assert.match(res.stderr, /c\.txt:1: 개인 낱말/);
  r.git(['reset', '-q', '--hard', clean]);
  const inMsg = r.commit('d.txt', 'ok\n', `about ${word}`);
  res = r.check(['--push', 'origin'], { input: pushLine(inMsg) });
  assert.equal(res.status, 1, res.stderr);
  assert.match(res.stderr, /커밋 메시지:1: 개인 낱말/);
  // env로 준 낱말도 같다(목록 파일 없이)
  fs.rmSync(r.listFile);
  assert.equal(r.check(['--push', 'origin'], { input: pushLine(inMsg) }).status, 0);
  assert.equal(r.check(['--push', 'origin'], { input: pushLine(inMsg), env: { ATRIUM_PRIVATE_WORDS: word } }).status, 1);
});

test('푸시: 그 원격의 다른 브랜치에 이미 있는 커밋은 다시 세지 않는다(정식 릴리즈에서 main을 dev로 옮길 때)', (t) => {
  const r = makeRepo(t);
  r.setList([word]);
  const base = r.commit('a.txt', 'hello\n', 'init');
  const pub = r.commit('b.txt', `${word}\n`, 'already on dev'); // 이미 공개된 dev 커밋
  r.git(['update-ref', 'refs/remotes/origin/dev', pub]);
  const line = (sha, remoteSha) => `refs/heads/main ${sha} refs/heads/main ${remoteSha}\n`;
  let res = r.check(['--push', 'origin'], { input: line(pub, base) });
  assert.equal(res.status, 0, res.stderr);
  const fresh = r.commit('c.txt', `${word}\n`, 'new');
  res = r.check(['--push', 'origin'], { input: line(fresh, base) });
  assert.equal(res.status, 1, res.stderr);
  assert.match(res.stderr, /c\.txt:1: 개인 낱말/);
  assert.ok(!/b\.txt/.test(res.stderr), '이미 공개된 커밋은 세지 않는다');
});

test('기여자의 일반 메일 커밋은 받고, 관리자의 개인 메일(git 설정, 목록 파일)은 막는다', (t) => {
  const r = makeRepo(t);
  r.write('a.txt', 'hello\n');
  r.git(['add', 'a.txt']);
  const as = (email) => ({ env: { GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_EMAIL: email } });
  assert.equal(r.check(['--staged'], as(contributor)).status, 0, '기여자 메일');
  assert.equal(r.check(['--staged'], as(noreply)).status, 0, 'noreply');
  let res = r.check(['--staged'], { env: { GIT_COMMITTER_EMAIL: mail } });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /커미터 메일이 개인 메일이다/);
  assert.ok(!res.stderr.includes(user), '메일은 보이지 않는다');
  res = r.check(['--staged'], { env: { GIT_AUTHOR_EMAIL: mail } });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /작성자 메일이 개인 메일이다/);
  // 목록 파일에 적은 메일도 관리자 메일로 본다
  const second = `${user}2@example.net`;
  r.setList([second]);
  assert.equal(r.check(['--staged'], as(second)).status, 1);
  assert.equal(r.check(['--staged'], as(contributor)).status, 0);
  // 푸시: 커밋마다 같은 규칙
  const ok = r.commit('b.txt', 'b\n', 'by a contributor', as(contributor).env);
  assert.equal(r.check(['--push', 'origin'], { input: pushLine(ok) }).status, 0);
  const bad = r.commit('c.txt', 'c\n', 'by the owner', { GIT_COMMITTER_EMAIL: mail });
  res = r.check(['--push', 'origin'], { input: pushLine(bad) });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /커미터 메일이 개인 메일이다/);
});
