// P205 단위 시험(재정비 1): 시험 임시 뿌리, AGY 기본 승인(권한 생략)과 한 번 옮기기, AGY 하위 인자, 따옴표를 아는 추가 인자 나누기,
// atrium ls의 화면 질문 줄, 에이전트 종류 다시 찾기, pi 바닥 상태 줄(글 든 구분선)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { Launchers, META_KEY, AGY_BYPASS_META, normalizeLauncher, resolveLauncher, previewLauncher, splitArgs, joinArgs, defaultPermission, parseCommandLine } from '../src/launchers.mjs';
import { otherKindPlan } from '../src/branch.mjs';
import { HcAdapter, KINDS_TTL_MS } from '../src/hc/adapter.mjs';
import { screenAnswerText } from '../src/links.mjs';
import { fmtAsk } from '../bin/atrium-fmt.mjs';
import { makeRunRoot, removeRunRoot, tmpEnv, RUN_PREFIX } from '../../scripts/test-tmp.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p205-'));

test('P205 시험 임시 뿌리: 실행마다 하나 만들고, 그 뿌리만 지운다(다른 경로는 거절)', () => {
  const base = tmp();
  try {
    const root = makeRunRoot(base);
    assert.ok(path.basename(root).startsWith(RUN_PREFIX));
    fs.mkdirSync(path.join(root, 'mtask-x-1', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(root, 'mtask-x-1', 'deep', 'f.txt'), 'x');
    const env = tmpEnv(root, { PATH: 'p' });
    assert.equal(env.TEMP, root); assert.equal(env.TMP, root); assert.equal(env.TMPDIR, root); assert.equal(env.PATH, 'p');
    const keep = path.join(base, 'keep'); fs.mkdirSync(keep);
    assert.throws(() => removeRunRoot(keep, base), /시험 임시 뿌리가 아니다/, '접두어가 다르면 지우지 않는다');
    assert.throws(() => removeRunRoot(path.join(root, 'mtask-x-1'), base), /시험 임시 뿌리가 아니다/, 'base 바로 아래가 아니면 지우지 않는다');
    assert.equal(removeRunRoot(root, base), true);
    assert.equal(fs.existsSync(root), false); assert.equal(fs.existsSync(keep), true);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('P205 AGY 승인 방식 기본값: 비우면 권한 생략, 다른 하네스는 manual. 사람이 고른 값은 그대로', () => {
  assert.equal(defaultPermission('agy'), 'bypassPermissions');
  assert.equal(defaultPermission('claude'), 'manual');
  assert.equal(normalizeLauncher({ name: 'A', harness: 'agy' }).permissionMode, 'bypassPermissions');
  assert.equal(normalizeLauncher({ name: 'A', harness: 'agy', permissionMode: '' }).permissionMode, 'bypassPermissions');
  assert.equal(normalizeLauncher({ name: 'A', harness: 'agy', permissionMode: 'manual' }).permissionMode, 'manual');
  assert.equal(normalizeLauncher({ name: 'C', harness: 'claude' }).permissionMode, 'manual');
  assert.equal(normalizeLauncher({ name: 'X', harness: 'pi' }).permissionMode, '', '승인 칸이 없는 하네스는 비운다'); // P330: Codex는 승인 칸이 생겼다(pi는 승인 체계가 없다)
  assert.equal(normalizeLauncher({ name: 'X', harness: 'codex' }).permissionMode, 'manual', 'Codex 기본 승인은 manual(덧붙이지 않음)');
  // 승인 방식이 빈 옛 AGY 호출자를 풀면 권한 생략 인자
  const r = resolveLauncher({ id: 'a', name: 'A', harness: 'agy', model: '', effort: '', permissionMode: '', args: '' });
  assert.equal(r.permissionMode, 'bypassPermissions'); assert.deepEqual(r.args, ['--dangerously-skip-permissions']);
  // 붙여 넣은 agy 줄(승인 인자 없음)도 새 호출자라 권한 생략
  const p = parseCommandLine('agy --model gemini-3.8-flash-low', { kinds: ['claude', 'codex', 'agy'] });
  assert.equal(normalizeLauncher({ ...p.launcher, name: 'P' }).permissionMode, 'bypassPermissions');
});

test('P205 AGY 승인 옮기기: manual인 AGY 호출자만 한 번 권한 생략으로, 표시를 남기고 두 번째는 하지 않는다. 다른 하네스는 그대로', () => {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  try {
    const items = [
      { id: 'c1', name: 'Claude Code', harness: 'claude', icon: '', model: '', effort: '', permissionMode: 'manual', args: '', env: {}, command: '' },
      { id: 'a1', name: 'agy', harness: 'agy', icon: '', model: '', effort: '', permissionMode: 'manual', args: '', env: {}, command: '' },
      { id: 'a2', name: 'agy plan', harness: 'agy', icon: '', model: '', effort: '', permissionMode: 'plan', args: '', env: {}, command: '' },
      { id: 'x1', name: 'Codex', harness: 'codex', icon: '', model: '', effort: '', permissionMode: '', args: '', env: {}, command: '' },
    ];
    store.setMeta(META_KEY, { v: 2, items, favorites: ['c1', 'a1'] });
    const ls = new Launchers({ store });
    assert.deepEqual(ls.agyBypassMoved, ['agy']);
    const after = store.getMeta(META_KEY);
    assert.equal(after.items.find((l) => l.id === 'a1').permissionMode, 'bypassPermissions');
    assert.equal(after.items.find((l) => l.id === 'a2').permissionMode, 'plan', '사람이 고른 다른 방식은 그대로');
    assert.deepEqual(after.items.find((l) => l.id === 'c1'), items[0], 'Claude Code는 그대로');
    assert.deepEqual(after.items.find((l) => l.id === 'x1'), items[3], 'Codex는 그대로');
    assert.deepEqual(after.favorites, ['c1', 'a1']);
    assert.deepEqual(store.getMeta(AGY_BYPASS_META).moved, ['agy']);
    // 사람이 다시 manual로 돌려도 다음 켤 때 옮기지 않는다
    store.setMeta(META_KEY, { ...after, items: after.items.map((l) => (l.id === 'a1' ? { ...l, permissionMode: 'manual' } : l)) });
    const again = new Launchers({ store });
    assert.deepEqual(again.agyBypassMoved, []);
    assert.equal(store.getMeta(META_KEY).items.find((l) => l.id === 'a1').permissionMode, 'manual');
  } finally { store.close?.(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('P205 atrium child --kind agy: 부모 권한 모드가 무엇이든 권한 생략, 호출자 인자의 AGY 승인 인자는 따른다', () => {
  const L = (x = {}) => ({ items: [{ id: 'a1', name: 'AGY', harness: 'agy', model: '', effort: '', permissionMode: 'manual', args: '', ...x }], favorites: ['a1'] });
  for (const mode of ['manual', 'plan', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions']) {
    const p = otherKindPlan({ route: { type: 'kind', kind: 'agy' }, permissionMode: mode, lists: L() });
    assert.deepEqual(p.args, ['--dangerously-skip-permissions'], mode);
    assert.equal(p.record.parentPermissionMode, mode);
  }
  const own = otherKindPlan({ route: { type: 'kind', kind: 'agy' }, permissionMode: 'manual', lists: L({ args: '--mode accept-edits' }) });
  assert.deepEqual(own.args, ['--mode', 'accept-edits']); assert.equal(own.record.approvalFrom, 'launcher');
  // 이름으로 고른 AGY 호출자(route launcher)도 같다
  const byName = otherKindPlan({ route: { type: 'launcher', kind: 'agy', launcher: L().items[0] }, permissionMode: 'plan', lists: L() });
  assert.deepEqual(byName.args, ['--dangerously-skip-permissions']);
  // AGY 부모가 종류 없이 부른 하위는 부모의 하네스 인자를 그대로(따로 붙이지 않는다)
  const inh = otherKindPlan({ route: { type: 'inherit-harness', kind: 'agy', launcherDef: { ...L().items[0], args: '--mode plan' } }, permissionMode: 'manual', lists: L() });
  assert.deepEqual(inh.args, ['--mode', 'plan']);
});

test('P205 추가 인자 나누기: 따옴표(작은·큰)와 이스케이프를 알고, 따옴표 없는 옛 인자는 예전과 같다', () => {
  const old = (s) => String(s || '').split(/\s+/).filter(Boolean);
  for (const s of ['', '  ', '--search', '--effort low  --mode plan', '-c model_reasoning_effort=high --search', '--add-dir C:\\Work\\x --settings C:\\p\\s.json', '--flag=a,b\t--x']) assert.deepEqual(splitArgs(s), old(s), s);
  assert.deepEqual(splitArgs(`--settings '{"a": 1}'`), ['--settings', '{"a": 1}']);
  assert.deepEqual(splitArgs(`--settings "{\\"a\\": 1}"`), ['--settings', '{"a": 1}']);
  assert.deepEqual(splitArgs(`--name="two words" x`), ['--name=two words', 'x']);
  assert.deepEqual(splitArgs(`--p "C:\\Program Files\\x"`), ['--p', 'C:\\Program Files\\x'], '큰따옴표 안의 다른 역슬래시는 그대로');
  assert.deepEqual(splitArgs(`a '' b`), ['a', '', 'b'], '빈 따옴표는 빈 인자');
  assert.deepEqual(splitArgs(`it's`), ['its'], '닫히지 않은 따옴표는 끝까지');
  // joinArgs는 다시 나누면 같은 배열
  for (const a of [['--settings', '{"a": 1}'], ['x', "it's \"q\""], ['C:\\p\\x', 'a b'], ['', 'z']]) assert.deepEqual(splitArgs(joinArgs(a)), a, JSON.stringify(a));
  assert.equal(joinArgs(['--search', '-c', 'k=v']), '--search -c k=v', '공백·따옴표 없는 인자는 그대로');
  // 호출자 풀기: AGY 추가 인자의 JSON이 한 인자로 간다
  const r = resolveLauncher({ id: 'a', name: 'A', harness: 'agy', model: '', effort: '', permissionMode: 'manual', args: `--settings '{"theme": "dark"}'` });
  assert.deepEqual(r.args, ['--settings', '{"theme": "dark"}']);
  assert.match(previewLauncher({ id: 'a', name: 'A', harness: 'agy', model: '', effort: '', permissionMode: 'manual', args: `--settings '{"theme": "dark"}'` }).line, /--settings '\{"theme": "dark"\}'/);
  // Claude Code 추가 인자도 같은 나누기
  const c = resolveLauncher({ id: 'c', name: 'C', harness: 'claude', model: '', effort: '', permissionMode: 'manual', args: `--append-system-prompt "be brief"`, env: {} });
  assert.deepEqual(c.extraArgs, ['--append-system-prompt', 'be brief']);
});

test('P205 atrium ls 응답 필요 줄: 도구 이름·질문이 없으면 undefined 대신 알맞은 글', () => {
  assert.equal(fmtAsk({ kind: 'screen', tail: 'x', since: 1 }), '화면에서 답을 기다린다(질문 글은 atrium read로 확인)');
  assert.equal(fmtAsk({ kind: 'permission' }), '권한 요청(내용은 화면에서 확인: atrium read)');
  assert.equal(fmtAsk({}), '권한 요청(내용은 화면에서 확인: atrium read)');
  assert.equal(fmtAsk({ tool: 'Bash', question: 'Run?' }), '권한 요청 Bash — "Run?"');
  assert.equal(fmtAsk({ summary: 'Bash: ls', choices: [{ n: 1, label: 'Yes' }] }), '권한 요청 Bash: ls  선택지: 1.Yes');
  assert.equal(fmtAsk({ question: 'Allow?' }), '권한 요청 — "Allow?"');
  for (const a of [{ kind: 'screen' }, {}, { kind: 'permission', choices: [] }]) assert.doesNotMatch(fmtAsk(a), /undefined/);
});

test('P205 에이전트 종류: 결과는 잠깐만 쓰고(TTL), fresh면 다시 찾는다. 겹친 찾기는 하나로', async () => {
  let installed = new Set(['claude']); let calls = 0;
  const a = Object.create(HcAdapter.prototype);
  a._where = async (k) => { calls++; await new Promise((r) => setTimeout(r, 5)); return installed.has(k) ? `C:/bin/${k}.exe` : null; };
  const first = await a.agentKinds();
  assert.equal(first.find((k) => k.kind === 'agy').installed, false);
  const n = calls;
  installed = new Set(['claude', 'agy']); // 판이 도는 중에 AGY를 깔았다
  assert.equal((await a.agentKinds()).find((k) => k.kind === 'agy').installed, false, 'TTL 안에서는 담아 둔 것');
  assert.equal(calls, n);
  const fresh = await a.agentKinds({ fresh: true });
  assert.equal(fresh.find((k) => k.kind === 'agy').installed, true, 'fresh면 다시 찾는다');
  assert.equal(fresh.find((k) => k.kind === 'agy').path, 'C:/bin/agy.exe');
  // TTL이 지나면 다시 찾는다
  installed = new Set(['claude']);
  a._kindsAt = Date.now() - KINDS_TTL_MS - 1;
  assert.equal((await a.agentKinds()).find((k) => k.kind === 'agy').installed, false);
  // 겹친 찾기
  const before = calls;
  const [x, y] = await Promise.all([a.agentKinds({ fresh: true }), a.agentKinds({ fresh: true })]);
  assert.equal(x, y); assert.equal(calls - before, x.length, '한 번만 찾는다');
});

test('P205 pi 화면 답 읽기: 바닥 상태 줄(글 든 구분선)과 입력 칸을 답으로 내지 않는다', () => {
  const screen = [
    ' pi v1.5.2', '',
    ' What is 1+1?', '',
    ' 1+1 = 2.', '',
    '── ⠹ Working ──────────────────────────',
    '──────────────────────────────────────',
    ' > ',
    '──────────────────────────────────────',
    ' ~/work/x', ' $0.000 (sub) 1.2k/200k',
  ].join('\n');
  const out = screenAnswerText(screen, 20, { kind: 'pi' });
  assert.doesNotMatch(out, /Working/); assert.doesNotMatch(out, /\$0\.000/); assert.doesNotMatch(out, /──/);
  assert.match(out, /1\+1 = 2\./);
  // 입력 칸 테두리 없이 상태 줄만 바닥에 있어도
  const s2 = [' Q?', ' A.', '── ✓ Done ──', ' ~/work/x', ' $0.000'].join('\n');
  const o2 = screenAnswerText(s2, 20, { kind: 'pi' });
  assert.doesNotMatch(o2, /Done|\$0/); assert.match(o2, /A\./);
  // 다른 종류는 글 든 구분선을 구분선으로 보지 않는다(예전과 같다)
  assert.equal(screenAnswerText(s2, 20, { kind: 'claude' }), screenAnswerText(s2, 20, { kind: null }));
  assert.match(screenAnswerText(s2, 20, { kind: 'claude' }), /Done/);
});
