// P308: 따옴표 꼴 atrium 명령 허용(atrium-allow.mjs)과 hook 응답
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { shellWords, atriumAllowed, preToolUseDecision, ALLOW_VERBS } from '../src/atrium-allow.mjs';
import { Backend } from '../src/backend.mjs';

const bash = (c) => atriumAllowed('Bash', { command: c });
const pwsh = (c) => atriumAllowed('PowerShell', { command: c });

test('P308 동사는 ATRIUM_ALLOW에서 온다', () => {
  for (const v of ['child', 'prompt', 'done', 'plan', 'todo', 'ask', 'me', 'read', 'wait']) assert.ok(ALLOW_VERBS.has(v), v);
  for (const v of ['kill', 'settings', 'terminal', 'send']) assert.ok(!ALLOW_VERBS.has(v), v);
});

test('P308 허용: 따옴표 꼴(Code Mode)과 맨 꼴', () => {
  for (const c of [
    "atrium 'plan' 'new' '수집'", "atrium plan new x", "'atrium' 'me'", '"atrium" "plan" list',
    "atrium 'prompt' 'lead' 'hello world'", "atrium prompt lead 'multi\nline text'", "mtask 'done' 'ok' 'report: branch p1, 12 tests'",
    'atrium "done" ok "said \\"hi\\""', "atrium child w1 --prompt 'fix the bug'", "atrium plan add M1 --title='a b'",
    "atrium 'todo' 'Run npm test'", "  atrium me  ",
  ]) assert.equal(bash(c), true, c);
  for (const c of ["& atrium 'plan' 'new' '수집'", "& 'atrium' 'done' 'ok' 'it''s fine'", "atrium \"me\"", "atrium prompt lead \"a \"\"q\"\" b\""]) assert.equal(pwsh(c), true, c);
});

test('P308 거절: 다른 명령이 섞일 수 있는 꼴', () => {
  for (const c of [
    "atrium prompt x; rm -rf /", "atrium 'prompt' 'x' && calc", "atrium me | sh", "atrium me > out.txt", "atrium me & calc",
    'atrium prompt x "$(id)"', 'atrium prompt x "`id`"', "atrium prompt x $(id)", "atrium prompt x `id`", "atrium prompt x $HOME",
    "atrium me\nrm -rf /", "atrium 'me'\ncalc", "X=1 atrium me", "/usr/bin/atrium me", "atrium.cmd me", "./atrium me",
    "atrium 'prompt' 'x' 'a; rm -rf /'", "atrium 'prompt' 'x' 'a && b'", "atrium 'prompt' 'x' 'a | b'", "atrium prompt x 'unterminated",
    "atrium kill x --yes", "atrium 'settings' 'set' 'x'", "atrium", "atrium (me)", "atrium {me}", "atrium me\\; calc", "atrium me #x",
    "echo atrium plan", "atriumx me", "atrium prompt x 'a' 'b' || calc", "atrium prompt x <in.txt",
  ]) assert.equal(bash(c), false, c);
  for (const c of ["& atrium me; calc", "atrium prompt x \"$env:PATH\"", "atrium prompt x @args", "atrium prompt x (calc)", "atrium prompt x \"`ncalc\"", "atrium prompt x \u201ca\u201d", "&atrium me"]) assert.equal(pwsh(c), false, c);
  assert.equal(atriumAllowed('Read', { command: 'atrium me' }), false);
  assert.equal(atriumAllowed('Bash', {}), false);
});

test('P308 shellWords는 따옴표를 푼다', () => {
  assert.deepEqual(shellWords("atrium 'plan' 'new' '수집'"), ['atrium', 'plan', 'new', '수집']);
  assert.deepEqual(shellWords("a --t='x y'z"), ['a', '--t=x yz']);
  assert.deepEqual(shellWords('a "b\\$c"'), ['a', 'b$c']);
  assert.deepEqual(shellWords("& 'a' 'it''s'", 'powershell'), ['a', "it's"]);
  assert.equal(shellWords("a 'it''s'", 'bash').join('|'), "a|its"); // bash에는 ''가 빈 따옴표 둘
});

test('P308 hook 응답: PreToolUse의 판 명령만 허용', () => {
  const ok = preToolUseDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: "atrium 'plan' 'list'" } });
  assert.deepEqual(ok.hookSpecificOutput.permissionDecision, 'allow');
  assert.equal(ok.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(preToolUseDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'mkdir x' } }), null);
  assert.equal(preToolUseDecision({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'atrium me' } }), null);
  assert.equal(preToolUseDecision(null), null);
});

// 판 hook 수신기(onHook)를 가짜 요청·응답으로 부른다: 토큰이 맞는 세션의 PreToolUse만 허용 본문
function callHook(headers, body) {
  const s = { sessionId: 's1', hookToken: 'tok', rt: { claudeSessionId: 'c1' } };
  const fake = { sessions: new Map([['s1', s]]), processed: [], log() {}, processHook(h, raw, allowed) { this.processed.push([raw, allowed]); } };
  fake.preToolAllow = Backend.prototype.preToolAllow;
  const req = new EventEmitter(); req.headers = headers;
  return new Promise((resolve) => {
    const res = { status: 0, head: null, writeHead(code, h) { this.status = code; this.head = h || null; }, end(b) { resolve({ status: this.status, head: this.head, body: b || '', fake }); } };
    Backend.prototype.onHook.call(fake, req, res);
    req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end');
  });
}
const pre = (command) => ({ hook_event_name: 'PreToolUse', session_id: 'c1', tool_name: 'Bash', tool_input: { command } });

test('P308 hook 수신기: 맞는 토큰의 따옴표 꼴 atrium 명령에 허용을 돌려준다', async () => {
  const ok = await callHook({ authorization: 'Bearer tok', 'x-mt-session': 's1' }, pre("atrium 'plan' 'new' 'x'"));
  assert.equal(ok.status, 200);
  assert.equal(JSON.parse(ok.body).hookSpecificOutput.permissionDecision, 'allow');
  const wrongTok = await callHook({ authorization: 'Bearer nope', 'x-mt-session': 's1' }, pre("atrium 'plan' 'new' 'x'"));
  assert.equal(wrongTok.body, '', '토큰이 틀리면 결정하지 않는다');
  const noSession = await callHook({ authorization: 'Bearer tok', 'x-mt-session': 'zz' }, { ...pre('atrium me'), session_id: 'zz' });
  assert.equal(noSession.body, '');
  const other = await callHook({ authorization: 'Bearer tok', 'x-mt-session': 's1' }, pre('mkdir x'));
  assert.equal(other.body, '', '다른 명령은 그대로 묻는다');
  const mixed = await callHook({ authorization: 'Bearer tok', 'x-mt-session': 's1' }, pre("atrium 'me' && calc"));
  assert.equal(mixed.body, '');
  await new Promise((r) => setImmediate(r));
  assert.equal(ok.fake.processed.length, 1, '허용해도 hook은 그대로 처리한다');
  assert.equal(ok.fake.processed[0][1], true, 'hook 기록에 판 허용 표시');
  assert.equal(other.fake.processed[0][1], false);
});
