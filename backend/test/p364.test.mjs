// P364 시험: 작업 지식 찾기(atrium know). 지어 만든 작은 저장소와 판 DB로 원천 읽기·빼기, 한국어·영어 trigram과 두 글자, --before,
// 증분 갱신(바뀜·지움·새 파일), open·unit, 걷어낸 기능 표시(앞선 원천·주제일 때만), 대체된 결정 표시(선언대로만), 사용 기록에 본문 없음,
// 워크스페이스끼리 섞이지 않음, worker thread, CLI 인자를 본다. 실제 기록은 넣지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { refresh, search, open, unit, format, closeAll, cutoffOf } from '../src/know-core.mjs';
import { mdChunks, commentChunks, lex, ftsExpr, excerpt, maskLine, normalizeRetired, retiredFlags, isTopic, normalizeSuperseded, supersededOf, parsePointer, unitsIn, ownerOfPath } from '../src/know-text.mjs';
import { kindOf, listFiles } from '../src/know-sources.mjs';
import { KnowService, indexName, sinceOf } from '../src/know.mjs';
import { Store } from '../src/store.mjs';
import { VERB_NAMES, CONTRACT_VERSION, shortHelp, KNOW_RULE } from '../src/cli-contract.mjs';
import { permOf, ORCH_SUB_VERBS, VERB_OP } from '../src/orchestration.mjs';
import { ATRIUM_ALLOW } from '../src/branch.mjs';
import { BOARD_SYSTEM_PROMPT } from '../src/launch.mjs';
import { HARNESS_PROMPT } from '../src/harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p364-'));
const DAY = 86400000;
const T0 = Date.parse('2026-11-10T12:00:00+09:00');
const at = (d) => new Date(T0 + d * DAY).toISOString();
const write = (root, rel, text) => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const setTime = (f, ms) => fs.utimesSync(f, new Date(ms), new Date(ms));
function git(root, args, date) {
  return execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', env: { ...process.env, ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) } });
}
// 지어 만든 저장소: 추적되는 문서·코드(커밋 날짜를 정함), git 밖 기록(docs/, experiments/, .atrium/records/), 빼야 할 것들
function makeRepo() {
  const root = tmp();
  execFileSync('git', ['init', '-q', '-b', 'dev', root]);
  write(root, '.gitignore', 'docs/\nexperiments/\n.atrium/\nnode_modules/\ndist/\n');
  write(root, 'README.md', '# 예시 저장소\n\n판은 세션을 띄운다.\n');
  write(root, 'src/sleep.mjs', '// P12: 잠재우기 판정은 리포 단위다(repoSleepPlan)\nexport const a = 1; // 끝\n/* P13 trust dialog is never answered\n * by the board */\nconst url = "http://example.com/x";\n');
  git(root, ['add', '-A']); git(root, ['commit', '-q', '-m', 'P12: 잠재우기 판정 첫 커밋'], at(0));
  write(root, 'src/rig-map.mjs', '// rig 지도: 역할 조직을 판에 그린다\nexport const rig = 1;\n');
  write(root, 'src/canvas.mjs', '// 캔버스 정리. 옛 rig 선은 그리지 않는다\nexport const c = 1;\n');
  git(root, ['add', '-A']); git(root, ['commit', '-q', '-m', 'P20: rig 지도와 캔버스'], at(5));
  // git 밖 기록
  setTime(write(root, 'docs/BRIEF.md', '# BRIEF\n\n## 정한 것\n\n터미널은 hc만 쓴다. 옛 herdr는 걷어냈다.\n'), T0 + 8 * DAY);
  setTime(write(root, 'docs/log/p12-sleep.md', '# P12 잠재우기\n\n측정: 증분 갱신 0.1초, 처음 짓기 2.3초. 신뢰 질문은 사람이 답한다.\n\n사용자: 이 말은 결과에 나오면 안 된다\n'), T0 + 1 * DAY);
  setTime(write(root, 'experiments/p12/review.md', '# 검토\n\nreviewer found the velocity regression in sleep plan\n'), T0 + 2 * DAY);
  setTime(write(root, 'experiments/p12/notes.txt', 'P12 실험 메모: trigram 색인 크기 60MiB\n'), T0 + 2 * DAY);
  setTime(write(root, 'experiments/p12/run.mjs', '// 이 주석은 git 밖 코드라 넣지 않는다 zebraword\n'), T0 + 2 * DAY);
  setTime(write(root, '.atrium/records/p30-u7/report.md', '# 보고\n\nherdr 클라이언트로 터미널을 붙였다. 나중 일 quokkaword\n'), T0 + 9 * DAY);
  // 빼야 할 것
  write(root, 'node_modules/pkg/readme.md', 'zebraword in node_modules\n');
  write(root, 'docs/big.md', `zebraword ${'가'.repeat(1100 * 1024)}\n`);
  write(root, 'docs/bin.md', Buffer.from([0x7a, 0x65, 0x62, 0x00, 0x72, 0x61]));
  write(root, 'docs/.env', 'zebraword=secret\n');
  write(root, 'docs/credentials.md', 'zebraword\n');
  return root;
}
// 판 DB: 이 워크스페이스 세션(p12)과 다른 워크스페이스 세션
function makeBoardDb(dir, key, otherKey) {
  const file = path.join(dir, 'board.db');
  const st = new Store(file);
  const ins = st.db.prepare('INSERT INTO sessions (session_id, name, cwd, permission_mode, settings_path, hook_token, created_at, workspace_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  ins.run('s-lead', 'lead', 'C:/x', 'default', 'x', 't', T0, key);
  ins.run('s-p12', 'p12', 'C:/x', 'default', 'x', 't', T0, key);
  ins.run('s-other', 'p99', 'C:/y', 'default', 'x', 't', T0, otherKey);
  const u = st.db.prepare('INSERT INTO work_units (id, from_session, to_session, origin, spec, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  u.run('u1', 's-lead', 's-p12', 'prompt', 'P12 잠재우기: 리포 단위 판정을 만든다. 시험 폴더 신뢰 질문 주의', 'done', T0 + 1 * DAY);
  u.run('u9', 's-other', 's-other', 'prompt', 'P99 다른 리포의 일 mongooseword', 'open', T0 + 1 * DAY);
  st.db.prepare('INSERT INTO unit_tries (id, unit_id, session_id, started_at, ended_at, result, done_text) VALUES (?, ?, ?, ?, ?, ?, ?)').run('t1', 'u1', 's-p12', T0 + DAY, T0 + 3 * DAY, 'ok', 'p12: 브랜치 worktree-p12, 끝 커밋 abc; 잠재우기 시험 통과');
  st.db.prepare("INSERT INTO decisions (session_id, name, question, why, created_at, state, answer, answered_at) VALUES (?, ?, ?, ?, ?, 'answered', ?, ?)").run('s-lead', 'lead', '잠재우기 기준을 리포로 할까?', '세션별은 너무 잦다', T0 + 2 * DAY, '좋아요 비밀답변pangolin', T0 + 2 * DAY + 1000);
  st.db.close();
  return file;
}
function setup() {
  const root = makeRepo();
  const data = tmp();
  const key = root.replace(/\\/g, '/').toLowerCase() + '/.git';
  const dbFile = makeBoardDb(data, key, 'c:/other/.git');
  const ctx = { root, key, dbFile, indexFile: path.join(data, 'know', indexName(key)), freshMs: 0 };
  return { root, data, key, dbFile, ctx };
}
const ptrs = (r) => r.results.map((x) => x.pointer);

test('P364 순수 함수: 덩어리, 주석, 검색어, 발췌, 가리기, 포인터, 단위', () => {
  const md = mdChunks('# 하나\n첫 줄\n\n## 둘\n' + Array.from({ length: 30 }, (_, i) => `줄 ${i}`).join('\n'));
  assert.deepEqual([md[0].heading, md[0].a, md[0].b], ['하나', 1, 2]);
  assert.equal(md[1].a, 4); assert.ok(md.every((c) => c.body.split('\n').length <= 17));
  const cc = commentChunks('let x;\n// P12 측정\nlet y; // 끝\n/* P77 옛\n * 제약 */\nconst u = "http://a.b";', '.mjs');
  assert.deepEqual(cc.flatMap((c) => c.lines), [2, 3, 4, 5]);
  assert.deepEqual(commentChunks('#!/bin/sh\n# 셸 주석\necho', '.sh').flatMap((c) => c.lines), [2]);
  assert.deepEqual(lex('세션을 잠재우기 rig-map.mjs the 판'), ['세션', '잠재우기', 'rig-map.mjs']);
  assert.match(ftsExpr(lex('잠재우기 rig-map.mjs')), /"잠재우기" OR "잠재우" OR "rig-map.mjs" OR "rig" OR "map" OR "mjs"/);
  assert.equal(ftsExpr(['세션']), '');
  assert.ok(excerpt('짧은 줄\n' + '아주 긴 줄 '.repeat(60) + '잠재우기 끝', ['잠재우기']).length <= 160);
  assert.equal(excerpt('사용자: 비밀\n> 인용', ['비밀']), '');
  assert.equal(maskLine('사용자: 이렇게 해'), '[대화 인용 생략]');
  assert.match(maskLine('key api_key=abcdefghijklmnop1234'), /\[redacted\]/);
  assert.deepEqual(parsePointer('docs/a.md:3-9'), { type: 'file', path: 'docs/a.md', a: 3, b: 9 });
  assert.deepEqual(parsePointer('db:work_units/u1'), { type: 'db', table: 'work_units', row: 'u1', path: 'db:work_units/u1' });
  assert.equal(parsePointer('git:abcdef1').sha, 'abcdef1');
  assert.deepEqual([...unitsIn('P12, p13a와 xp14 P15b')], ['P12', 'P13a', 'P15b']);
  assert.equal(ownerOfPath('experiments/p12/x.md'), 'P12'); assert.equal(ownerOfPath('backend/test/p364.test.mjs'), 'P364'); assert.equal(ownerOfPath('src/app.mjs'), null);
  assert.equal(kindOf('docs/log/p1.md'), 'log'); assert.equal(kindOf('experiments/p1/review.md'), 'review'); assert.equal(kindOf('.atrium/records/a/report.md'), 'record');
  assert.equal(kindOf('src/a.mjs', true), 'code'); assert.equal(kindOf('experiments/p1/a.mjs', false), null); assert.equal(kindOf('node_modules/a/b.md'), null); assert.equal(kindOf('docs/.env'), null);
  assert.equal(indexName('c:/workspace/multitask/.git'), indexName('c:/workspace/multitask/.git'));
  assert.notEqual(indexName('c:/a/x/.git'), indexName('c:/b/x/.git'));
  assert.ok(sinceOf('7d') < Date.now()); assert.throws(() => sinceOf('어제'));
});

test('P364 원천: 문서·기록·코드 주석·판 DB를 넣고 빼야 할 것(밖 코드, node_modules, 큰 파일, 바이너리, 비밀 이름, 다른 워크스페이스)은 뺀다', () => {
  const { root, ctx } = setup();
  try {
    const { files } = listFiles(root);
    const rels = files.map((f) => f.rel).sort();
    for (const want of ['README.md', 'src/sleep.mjs', 'docs/BRIEF.md', 'docs/log/p12-sleep.md', 'experiments/p12/review.md', 'experiments/p12/notes.txt', '.atrium/records/p30-u7/report.md']) assert.ok(rels.includes(want), want);
    for (const no of ['experiments/p12/run.mjs', 'node_modules/pkg/readme.md', 'docs/.env', 'docs/credentials.md']) assert.ok(!rels.includes(no), no);
    const st = refresh(ctx);
    assert.ok(st.skipped >= 2, '큰 파일과 바이너리는 건너뛴다');
    assert.deepEqual(Object.keys(st.byKind).sort(), ['code', 'db', 'doc', 'log', 'record', 'review']);
    assert.equal(search(ctx, { q: 'zebraword' }).results.length, 0, '빼야 할 것은 하나도 안 나온다');
    assert.equal(search(ctx, { q: 'mongooseword' }).results.length, 0, '다른 워크스페이스의 판 일은 안 나온다');
    const db = search(ctx, { q: '리포 단위 판정', kind: 'db' });
    assert.ok(ptrs(db).includes('db:work_units/u1'));
    assert.equal(db.results.find((x) => x.pointer === 'db:work_units/u1').unit, 'P12');
    assert.ok(ptrs(search(ctx, { q: '시험 통과', kind: 'db' })).includes('db:unit_tries/t1'));
    // 사람의 답: 색인으로는 찾지만 발췌·열기에 나오지 않는다
    const dec = search(ctx, { q: '비밀답변pangolin' });
    for (const r of dec.results) assert.doesNotMatch(r.excerpt, /pangolin/);
    const opened = open(ctx, { pointer: 'db:decisions/1' });
    assert.match(opened.text, /잠재우기 기준/); assert.doesNotMatch(opened.text, /pangolin/); assert.match(opened.text, /대화 인용 생략/);
    const log = open(ctx, { pointer: 'docs/log/p12-sleep.md:1-5' });
    assert.doesNotMatch(log.text, /나오면 안 된다/);
  } finally { closeAll(); }
});

test('P364 찾기: 한국어·영어 trigram, 두 글자 부분 문자열, 한 글자, 결과 모양(포인터·날짜·단위·종류·짧은 발췌·status 칸), 첫 줄 글자 수', () => {
  const { ctx } = setup();
  try {
    refresh(ctx);
    const ko = search(ctx, { q: '잠재우기 판정' });
    assert.equal(ko.mode, 'fts5+substring', '판정은 두 글자라 부분 문자열로 순위를 돕는다');
    assert.equal(search(ctx, { q: '잠재우기 repoSleepPlan' }).mode, 'fts5');
    assert.ok(ptrs(ko).some((p) => p.startsWith('src/sleep.mjs:1-')), ptrs(ko).join(' '));
    const r0 = ko.results.find((x) => x.pointer.startsWith('src/sleep.mjs'));
    for (const k of ['pointer', 'kind', 'date', 'unit', 'flags', 'status', 'excerpt']) assert.ok(k in r0, k);
    assert.equal(r0.status, null); assert.ok(r0.excerpt.length <= 160);
    const en = search(ctx, { q: 'velocity regression' });
    assert.deepEqual(ptrs(en), ['experiments/p12/review.md:1-3']); assert.equal(en.results[0].kind, 'review'); assert.equal(en.results[0].unit, 'P12');
    assert.ok(ptrs(search(ctx, { q: 'trust dialog' })).includes('src/sleep.mjs:1-4'), '블록 주석 줄까지 한 덩어리');
    const two = search(ctx, { q: '측정' });
    assert.equal(two.mode, 'substring'); assert.ok(ptrs(two).some((p) => p.startsWith('docs/log/p12-sleep.md')));
    assert.equal(search(ctx, { q: '판' }).mode, 'substring');
    assert.equal(search(ctx, { q: '측정 trigram 색인' }).mode, 'fts5+substring');
    assert.equal(search(ctx, { q: '판정', k: 1 }).results.length, 1);
    assert.ok(search(ctx, { q: '잠재우기', kind: 'log' }).results.every((x) => x.kind === 'log'));
    assert.throws(() => search(ctx, { q: '잠재우기', kind: 'memo' }), /--kind/);
    assert.throws(() => search(ctx, { q: '  ' }), /물음/);
    // 출력: 첫 줄의 글자 수 = 돌려준 글 전체, JSON은 total_chars
    const f = format(ko);
    assert.match(f.out, new RegExp(`^총 ${f.out.length}자 · fts5\\+substring · `));
    assert.equal(f.total, f.out.length);
    assert.equal(f.pointers.length, ko.results.length);
    const j = format(ko, true);
    assert.equal(JSON.parse(j.out).total_chars, j.out.length);
  } finally { closeAll(); }
});

test('P364 --before: 그 시각(또는 커밋) 뒤에 생긴 원천을 빼고, 그 뒤에 고친 원천은 뒤에 바뀜 표시', () => {
  const { root, ctx } = setup();
  try {
    refresh(ctx);
    assert.ok(ptrs(search(ctx, { q: 'rig 지도' })).some((p) => p.startsWith('src/rig-map.mjs')));
    assert.ok(!ptrs(search(ctx, { q: 'rig 지도', before: at(3) })).some((p) => p.startsWith('src/rig-map.mjs')), 'P20 커밋(5일) 전에는 없다');
    const first = git(root, ['rev-list', '--max-parents=0', 'HEAD']).trim();
    assert.equal(cutoffOf(first, root), Date.parse(at(0)));
    assert.ok(!ptrs(search(ctx, { q: 'rig 지도', before: first })).some((p) => p.startsWith('src/rig-map.mjs')));
    assert.ok(search(ctx, { q: '잠재우기 판정', before: first }).results.length === 0, '커밋 시각 자체는 경계 밖(앞선 것만)');
    assert.ok(search(ctx, { q: 'quokkaword' }).results.length === 1);
    assert.equal(search(ctx, { q: 'quokkaword', before: at(5) }).results.length, 0, 'git 밖 기록은 파일 시각으로');
    assert.ok(search(ctx, { q: '리포 단위 판정', kind: 'db', before: at(0.5) }).results.length === 0, '판 일은 만든 때로');
    // 앞서 생겼지만 경계 뒤에 고친 원천
    const f = path.join(root, 'docs', 'log', 'p12-sleep.md');
    fs.appendFileSync(f, '\n덧붙임 줄\n'); setTime(f, T0 + 6 * DAY);
    refresh(ctx);
    const r = search(ctx, { q: '증분 갱신', before: at(4) });
    assert.ok(r.results.length && r.results[0].flags.some((x) => x.startsWith('뒤에 바뀜')), JSON.stringify(r.results));
    assert.throws(() => search(ctx, { q: 'x y z', before: '어제쯤' }), /--before/);
    assert.throws(() => open(ctx, { pointer: 'src/rig-map.mjs:1-1', before: at(3) }), /경계 뒤/);
  } finally { closeAll(); }
});

test('P364 증분: 바뀐 것만 고치고(바뀜·지움·새 파일), 같은 내용이면 다시 넣지 않는다', () => {
  const { root, ctx } = setup();
  try {
    const full = refresh(ctx);
    assert.ok(full.indexed > 8);
    const again = refresh(ctx);
    assert.equal(again.indexed, 0); assert.equal(again.removed, 0);
    // 같은 내용, 시각만 바뀜 → 다시 넣지 않는다
    setTime(path.join(root, 'experiments', 'p12', 'notes.txt'), T0 + 7 * DAY);
    assert.equal(refresh(ctx).indexed, 0);
    // 바뀜
    write(root, 'experiments/p12/review.md', '# 검토\n\n고친 뒤 walrusword만 남았다\n');
    // 지움
    fs.rmSync(path.join(root, 'docs', 'BRIEF.md'));
    // 새 파일
    write(root, 'docs/log/p40-new.md', '# P40\n\n새 기록 ibexword\n');
    const inc = refresh(ctx);
    assert.equal(inc.indexed, 2); assert.equal(inc.removed, 1);
    assert.equal(search(ctx, { q: 'velocity regression' }).results.length, 0);
    assert.equal(search(ctx, { q: 'walrusword' }).results.length, 1);
    assert.equal(search(ctx, { q: 'ibexword' }).results[0].unit, 'P40');
    assert.equal(search(ctx, { q: 'hc만 쓴다' }).results.length, 0);
    // 새 커밋: 추적 파일의 날짜가 따라온다
    write(root, 'src/sleep.mjs', '// P12: 잠재우기 판정은 리포 단위다(repoSleepPlan) 고침\n');
    git(root, ['commit', '-qam', 'P12 고침'], at(7));
    refresh(ctx);
    assert.equal(search(ctx, { q: 'repoSleepPlan' }).results[0].date.slice(0, 10), new Date(Date.parse(at(7))).toISOString().slice(0, 10).replace(/(\d+)-(\d+)-(\d+)/, '$1-$2-$3'));
    // 처음부터(build --full)
    const f2 = refresh({ ...ctx, full: true });
    assert.equal(f2.sources, inc.sources);
  } finally { closeAll(); }
});

test('P364 open·unit: 원문(색인에 든 것만, 줄 범위와 앞뒤), 단위의 파일·기록·검토·판 일·주석·커밋을 순위와 상관없이', () => {
  const { root, ctx } = setup();
  try {
    refresh(ctx);
    const o = open(ctx, { pointer: 'docs/log/p12-sleep.md:3-3', context: 1 });
    assert.equal(o.pointer, 'docs/log/p12-sleep.md:2-4');
    assert.match(o.text, /^\s+2 {2}\n\s+3 {2}측정/);
    assert.throws(() => open(ctx, { pointer: 'node_modules/pkg/readme.md:1-1' }), /색인에 없는/);
    assert.throws(() => open(ctx, { pointer: '../../etc/passwd:1-1' }), /색인에 없는/);
    assert.throws(() => open(ctx, { pointer: 'docs/log/p12-sleep.md:99-100' }), /줄 범위/);
    const sha = git(root, ['rev-list', '--max-parents=0', 'HEAD']).trim();
    assert.match(open(ctx, { pointer: `git:${sha.slice(0, 8)}` }).text, /P12: 잠재우기 판정 첫 커밋/);
    const u = unit(ctx, { unit: 'p12' });
    const ps = ptrs(u);
    for (const want of ['docs/log/p12-sleep.md', 'experiments/p12/review.md', 'experiments/p12/notes.txt', 'db:work_units/u1', 'db:unit_tries/t1', 'src/sleep.mjs:1-1', `git:${sha.slice(0, 12)}`]) assert.ok(ps.some((p) => p.startsWith(want)), `${want} in ${ps.join(' ')}`);
    assert.ok(!ps.some((p) => p.includes('p30-u7')));
    assert.throws(() => unit(ctx, { unit: 'abc' }), /단위 번호/);
    assert.ok(!ptrs(unit(ctx, { unit: 'P12', before: at(1.5) })).some((p) => p.includes('review.md')));
    const f = format(u);
    assert.match(f.out, /^총 \d+자 · P12 · /);
  } finally { closeAll(); }
});

test('P364 걷어낸 기능: .atrium/know.json retired. 원천이 걷은 날보다 앞서고 이름이 경로·제목·첫 문장의 주제일 때만', () => {
  const r = normalizeRetired([{ name: 'rig', date: '2026-11-14', pointer: 'docs/ARCH.md:39' }, { name: 'herdr', aliases: ['pane.report_agent_session'], exclude: ['herdr-core'], date: '2026-11-12' }, { name: '' }, { name: 'x', date: '언젠가' }]);
  assert.equal(r.length, 2);
  const before = T0; const after = T0 + 10 * DAY;
  // 주제: 경로 이름, 제목, 첫 문장
  assert.ok(isTopic(r[0], { path: 'src/rig-map.mjs', heading: '', body: '아무 말' }));
  assert.ok(isTopic(r[0], { path: 'a.md', heading: 'rig 설계', body: '' }));
  assert.ok(isTopic(r[0], { path: 'a.md', heading: '', body: 'rig는 역할 조직이다. 그 밖' }));
  assert.ok(!isTopic(r[0], { path: 'a.md', heading: '캔버스', body: '캔버스 정리.\n옛 rig 선은 그리지 않는다' }), '본문 가운데 지나가는 이름은 주제가 아니다');
  assert.ok(!isTopic(r[0], { path: 'src/rigid.mjs', heading: 'bright', body: 'trigger' }), '낱말 일부는 아니다');
  assert.ok(!isTopic(r[1], { path: 'a.md', heading: 'herdr-core(hc) 고정', body: '' }), 'exclude');
  assert.ok(isTopic(r[1], { path: 'a.md', heading: 'herdr 클라이언트', body: '' }));
  const flag = (changed, path, heading, cut) => retiredFlags(r, { path, changed }, { heading, body: '' }, cut);
  assert.deepEqual(flag(before, 'src/rig-map.mjs', ''), ['걷어냄(2026-11-14, docs/ARCH.md:39)']);
  assert.deepEqual(flag(after, 'src/rig-map.mjs', ''), [], '걷은 뒤에 고친 원천(지금 글)은 표시하지 않는다');
  assert.deepEqual(flag(before, 'src/rig-map.mjs', '', Date.parse('2026-11-13')), [], '경계가 걷은 날 앞이면 그때는 살아 있었다');
  // 색인 끝까지: know.json이 없으면 표시가 없다
  const { root, ctx } = setup();
  try {
    refresh(ctx);
    assert.deepEqual(search(ctx, { q: 'rig 지도' }).results[0].flags, []);
    write(root, '.atrium/know.json', JSON.stringify({ retired: [{ name: 'rig', date: '2026-11-20', pointer: 'docs/ARCH.md:39' }, { name: 'herdr', exclude: ['herdr-core'], date: '2026-11-18' }] }));
    const rs = search(ctx, { q: 'rig 지도', k: 5 });
    const map = rs.results.find((x) => x.pointer.startsWith('src/rig-map.mjs'));
    assert.deepEqual(map.flags, ['걷어냄(2026-11-20, docs/ARCH.md:39)']);
    const canvas = search(ctx, { q: '캔버스 정리' }).results.find((x) => x.pointer.startsWith('src/canvas.mjs'));
    assert.deepEqual(canvas.flags, [], '캔버스 주석에 rig가 지나가도 주제가 아니다');
    const rep = search(ctx, { q: 'quokkaword' }).results[0];
    assert.deepEqual(rep.flags, [], 'herdr가 첫 문장에 있어도 걷은 날(11-18) 뒤 원천(11-19)이면 표시하지 않는다');
    assert.match(format(rs).out, /걷어냄\(2026-11-20/);
  } finally { closeAll(); }
});

test('P364 대체된 결정: .atrium/know.json superseded 선언대로만(포인터·단위 먼저, 옛 주장은 정확한 구절일 때만), 경계 앞, 지금 문장 자리는 빼고', () => {
  const s = normalizeSuperseded([
    { id: 'D84', old: 'docs/log/p12-sleep.md:3-3', now: '잠재우기는 세션 단위다', nowPointer: 'docs/BRIEF.md:5', since: '2026-11-15', scope: '잠재우기' },
    { id: 'U30', old: ['P30'], now: '터미널은 hc만 쓴다', nowPointer: 'docs/BRIEF.md:5', since: '2026-11-15' },
    { id: 'T1', old: { text: 'trigram 색인 크기 60MiB' }, now: '색인은 30MiB다', nowPointer: '정한 것 › 색인' },
    { id: 'DB', old: 'db:work_units/u1', now: '일은 판이 아니라 사람이 정한다' },
    { now: '' }, { old: 'x' },
  ]);
  assert.equal(s.length, 4);
  assert.deepEqual(s[2].old, [{ type: 'text', text: 'trigram 색인 크기 60MiB' }]);
  assert.equal(normalizeSuperseded([{ old: '옛날엔 그랬다', now: 'x' }])[0].old[0].type, 'text');
  assert.equal(normalizeSuperseded([{ old: 'p7', now: 'x' }])[0].old[0].type, 'unit');
  const hit = (o) => supersededOf(s, { path: 'a.md', a: 1, b: 2, unit: null, heading: '', body: '', ...o });
  assert.deepEqual(hit({ path: 'docs/log/p12-sleep.md', a: 2, b: 4 }).map((x) => x.id), ['D84'], '줄 범위가 겹치면');
  assert.deepEqual(hit({ path: 'docs/log/p12-sleep.md', a: 5, b: 9 }), [], '겹치지 않으면 아님');
  assert.deepEqual(hit({ unit: 'P30' }).map((x) => x.id), ['U30']);
  assert.deepEqual(hit({ body: 'P12 실험 메모: trigram 색인 크기 60MiB' }).map((x) => x.id), ['T1']);
  assert.deepEqual(hit({ body: 'trigram 색인의 크기는 60MiB' }), [], '비슷한 말은 아니다(정확한 구절만)');
  assert.deepEqual(hit({ path: 'docs/BRIEF.md', a: 5, b: 5, unit: 'P30' }), [], '지금 문장 자리는 대체된 것이 아니다');
  assert.deepEqual(hit({ path: 'db:work_units/u1' }).map((x) => x.id), ['DB']);
  assert.deepEqual(supersededOf(s, { path: 'docs/log/p12-sleep.md', a: 3, b: 3 }, Date.parse('2026-11-14')), [], '경계가 대체된 날 앞이면 그때는 유효');
  const { root, ctx } = setup();
  try {
    refresh(ctx);
    write(root, '.atrium/know.json', JSON.stringify({ superseded: [
      { id: 'D84', old: 'docs/log/p12-sleep.md:3-3', now: '처음 짓기는 1초다', nowPointer: 'docs/BRIEF.md:5', since: '2026-11-15', scope: '색인' },
      { id: 'U30', old: 'P30', now: '터미널은 hc만 쓴다', nowPointer: 'docs/BRIEF.md:5', since: '2026-11-15' },
    ] }));
    const r = search(ctx, { q: '증분 갱신' }).results.find((x) => x.pointer.startsWith('docs/log/p12-sleep.md'));
    assert.equal(r.status.state, 'superseded'); assert.equal(r.status.now, '처음 짓기는 1초다'); assert.equal(r.status.pointer, 'docs/BRIEF.md:5');
    assert.equal(r.flags[0], '대체됨');
    assert.deepEqual(r.notes, ['대체됨 → 지금: 처음 짓기는 1초다 (docs/BRIEF.md:5) [색인]']);
    assert.match(format({ command: 'search', mode: 'fts5', results: [r] }).out, /\n {2}대체됨 → 지금: 처음 짓기는 1초다 \(docs\/BRIEF\.md:5\)/);
    assert.equal(search(ctx, { q: 'quokkaword' }).results[0].status.id, 'U30', '단위로 맞춤');
    assert.equal(search(ctx, { q: '잠재우기 판정' }).results.find((x) => x.pointer.startsWith('src/sleep.mjs')).status, null, '선언에 없는 것은 비움');
    assert.equal(search(ctx, { q: '증분 갱신', before: at(3) }).results[0].status, null);
    assert.match(open(ctx, { pointer: 'docs/log/p12-sleep.md:3-3' }).text, /대체됨 → 지금: 처음 짓기는 1초다/);
  } finally { closeAll(); }
});

test('P364 서비스: 사용 기록(시각·세션·일·명령·물음·옵션·포인터와 글자 수)에 결과 본문이 없고, 집계는 세션·날짜별. 워크스페이스끼리 섞이지 않는다', async () => {
  const a = setup(); const bRoot = makeRepo();
  write(bRoot, 'docs/log/p77-only-b.md', '# P77\n\nyakword 다른 리포에만 있다\n');
  const bKey = bRoot.replace(/\\/g, '/').toLowerCase() + '/.git';
  const wsMap = { [a.key]: { root: a.root }, [bKey]: { root: bRoot } };
  const board = { store: { getWorkspace: (k) => wsMap[k] || null, openTryOf: (sid) => (sid === 's-p12' ? { unitId: 'u1' } : null) }, log: () => {} };
  const know = new KnowService(board, { dataDir: a.data, dbFile: a.dbFile, worker: false });
  try {
    const sA = { sessionId: 's-p12', name: 'p12', workspaceKey: a.key };
    const sB = { sessionId: 's-b', name: 'lead-b', workspaceKey: bKey };
    // P371: p12 세션이 찾으면 P12 자기 기록(docs/log/p12-sleep.md)은 빠진다. 코드 주석은 남는다
    const r = await know.verb(sA, { action: 'search', q: '잠재우기 판정', k: 2 });
    assert.match(r.out, /^총 \d+자/); assert.equal(r.total, r.out.length);
    assert.equal((await know.verb(sA, { action: 'search', q: 'yakword' })).result.results.length, 0, 'A의 색인에 B의 기록이 없다');
    assert.equal((await know.verb(sB, { action: 'search', q: 'yakword' })).result.results.length, 1);
    assert.equal((await know.verb(sB, { action: 'search', q: '리포 단위 판정', kind: 'db' })).result.results.length, 0, 'B에서 A의 판 일이 안 보인다');
    assert.notEqual(know.indexFile(a.key), know.indexFile(bKey));
    assert.ok(fs.existsSync(know.indexFile(a.key)) && fs.existsSync(know.indexFile(bKey)));
    assert.ok(know.indexFile(a.key).startsWith(path.join(a.data, 'know')), '판 데이터 폴더 know/');
    assert.ok(!fs.existsSync(path.join(a.root, '.atrium', 'know')) && !fs.readdirSync(a.root).some((n) => n.endsWith('.sqlite')), '저장소에 쓰지 않는다');
    await know.verb(sA, { action: 'open', pointer: 'docs/log/p12-sleep.md:3-3' });
    await know.verb(sA, { action: 'unit', unit: 'P12' });
    await assert.rejects(know.verb(sA, { action: 'search', q: '  ' }), /물음/);
    const lines = fs.readFileSync(know.usageFile, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(lines.length, 7);
    const l0 = lines[0];
    assert.deepEqual(l0.session, { name: 'p12', id: 's-p12' }); assert.equal(l0.unit, 'u1'); assert.equal(l0.cmd, 'search'); assert.equal(l0.q, '잠재우기 판정'); assert.deepEqual(l0.opts, { k: 2 });
    assert.ok(l0.pointers.length && l0.pointers.every((p) => typeof p.p === 'string' && p.chars > 0)); assert.equal(l0.total, r.total); assert.equal(l0.workspace, a.key);
    const raw = fs.readFileSync(know.usageFile, 'utf8');
    assert.doesNotMatch(raw, /0\.1초|velocity|excerpt|text/, '결과 본문(발췌·원문)은 남기지 않는다');
    assert.equal(lines[6].error, 'bad_request');
    const u = know.usage();
    assert.equal(u.total.calls, 7); assert.deepEqual(u.bySession.map((x) => x.key).sort(), ['lead-b', 'p12']);
    assert.equal(u.byDay.length, 1);
    const uv = know.usageVerb({});
    assert.match(uv.out, /know 사용: 호출 7번/); assert.match(uv.out, /p12 {2}\d+번/);
    assert.equal(know.usage({ since: '2999-01-01' }).total.calls, 0);
    await assert.rejects(know.verb(sA, { action: 'search', q: 'x', kind: 'memo' }), /--kind/);
    await assert.rejects(know.verb({ sessionId: 'z', name: 'z', workspaceKey: 'none' }, { q: 'x' }), /워크스페이스/);
  } finally { closeAll(); await know.close(); }
});

test('P364 worker thread: 짓기·찾기가 worker에서 돌고 판 쪽은 기다리기만 한다. 닫으면 worker도 끝난다', async () => {
  const a = setup();
  const board = { store: { getWorkspace: (k) => (k === a.key ? { root: a.root } : null), openTryOf: () => null }, log: () => {} };
  const know = new KnowService(board, { dataDir: a.data, dbFile: a.dbFile });
  try {
    let ticks = 0; const iv = setInterval(() => ticks++, 1);
    const r = await know.verb({ sessionId: 's-lead', name: 'lead', workspaceKey: a.key }, { action: 'search', q: '잠재우기 판정', json: true });
    clearInterval(iv);
    const j = JSON.parse(r.out);
    assert.equal(j.total_chars, r.out.length); assert.ok(j.results.length > 0); assert.ok(j.built, '처음 물을 때 지었다');
    assert.ok(know.worker, 'worker가 떠 있다');
    const b2 = await know.handle({ action: 'build', full: true }, { workspace: { key: a.key, root: a.root } });
    assert.ok(b2.stats.sources > 5);
    assert.ok(ticks >= 0);
  } finally { await know.close(); }
  assert.equal(know.worker, null);
});

test('P364 계약과 안내: 계약 12, know 동사, 허용 규칙, 하위 오케스트레이션도 쓴다, help·판·하네스 안내문 한 줄', () => {
  assert.equal(CONTRACT_VERSION, 13);
  assert.ok(VERB_NAMES.includes('know')); assert.equal(VERB_OP.know, 'know');
  assert.ok(ORCH_SUB_VERBS.includes('know'));
  const perm = permOf({ orch: { orchestrates: true } }, { relation: 'sub', parentId: 'p' });
  assert.ok(!perm || !perm.allowed || perm.allowed.includes('know'));
  assert.ok(ATRIUM_ALLOW.includes('Bash(atrium know *)') && ATRIUM_ALLOW.includes('PowerShell(atrium know *)'));
  assert.ok(BOARD_SYSTEM_PROMPT.includes(KNOW_RULE));
  assert.match(HARNESS_PROMPT, /atrium know <따옴표로 묶은 물음>/); assert.ok(!/[\r\n"]/.test(HARNESS_PROMPT));
  assert.ok(shortHelp().includes(KNOW_RULE)); assert.match(shortHelp(), /atrium know "<물음>"/);
});

test('P364 CLI: atrium know 인자 → /branch/know 몸(물음, -k, --kind, --before, open·unit·build, --usage --since, --json)과 보드의 글 그대로', async () => {
  const bodies = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => (b += d));
    req.on('end', () => { const body = JSON.parse(b); bodies.push({ path: req.url, body }); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ result: { out: `총 9자 · ok\n` } })); });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const env = { ATRIUM_PORT: String(srv.address().port), ATRIUM_SESSION_ID: 's1', ATRIUM_SESSION_TOKEN: 'tok' };
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('MTASK_') && !k.startsWith('ATRIUM_')));
  const run = (args) => new Promise((resolve) => execFile(process.execPath, [path.join(HERE, '..', 'bin', 'atrium-child.mjs'), 'know', ...args], { env: { ...clean, ...env }, timeout: 20000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
  try {
    const r1 = await run(['잠재우기 판정', '-k', '3', '--kind', 'log', '--before', '2026-11-20']);
    assert.equal(r1.code, 0); assert.equal(r1.stdout, '총 9자 · ok\n');
    assert.deepEqual(bodies[0], { path: '/branch/know', body: { action: 'search', q: '잠재우기 판정', k: 3, kind: 'log', before: '2026-11-20' } });
    await run(['open', 'docs/a.md:3-9', '--context', '2', '--json']);
    assert.deepEqual(bodies[1].body, { action: 'open', pointer: 'docs/a.md:3-9', context: 2, json: true });
    await run(['unit', 'P201']); assert.deepEqual(bodies[2].body, { action: 'unit', unit: 'P201' });
    await run(['build', '--full']); assert.deepEqual(bodies[3].body, { action: 'build', full: true });
    await run(['--usage', '--since', '7d']); assert.deepEqual(bodies[4].body, { action: 'usage', since: '7d' });
    await run(['신뢰', '질문']); assert.deepEqual(bodies[5].body, { action: 'search', q: '신뢰 질문' });
    const bad = await run([]); assert.equal(bad.code, 2); assert.match(bad.stderr, /물음을 준다/);
  } finally { srv.close(); }
});
