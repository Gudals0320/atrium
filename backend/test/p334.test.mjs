// P334 단위 시험: 일 기록(atrium done --record), 알림 줄(done 글·merger 정리), 안내문 한 줄과 새 안내 알림, 문서 점검(허락 밖 꼬리, 손으로 둔 docs.json이면 켜짐).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Store } from '../src/store.mjs';
import { newRuntime } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { WorkUnits, unitHeader, RECORD_TAIL } from '../src/work-units.mjs';
import { secretName, recordFolder, mainCheckoutOf, checkRecordFiles, copyRecords, recordLines, readRecord, RECORD_LINES_MAX, RECORD_FILES_MAX } from '../src/records.mjs';
import { summaryLine, mergeSummaryText } from '../src/merger.mjs';
import { BOARD_SYSTEM_PROMPT, RECORD_RULE } from '../src/launch.mjs';
import { limitOf } from './text-limits.mjs'; // P387: 글 크기 상한의 한 원본(npm run check:skill도 같은 값)
import { HARNESS_PROMPT } from '../src/harness.mjs';
import { boardSkill } from '../src/branch.mjs';
import { VERBS } from '../src/cli-contract.mjs';
import { stampOf, assumedStamp, newNews, newsLine, NEWS_HEAD, NEWS_IDS } from '../src/verbs-notice.mjs';
import { checkDocs, docsOn, warnLine, SHAPE_TAIL, WARN_MAX, loadDocConfig } from '../src/doc-check.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p334-'));
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', windowsHide: true, env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) });
function repo() {
  const dir = tmp();
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 't@example.invalid'); git(dir, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'README.md'), '# t\n'); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

test('P334 순수: 비밀 같은 이름, 폴더 이름, 줄', () => {
  for (const n of ['.env', '.env.local', 'id_rsa', 'server.pem', 'my.key', 'api-key.txt', 'secrets.md', 'token.json', '.npmrc', 'credentials.json']) assert.ok(secretName(n), n);
  for (const n of ['audit.md', 'slice-findings.md', 'notes.txt', 'report.json']) assert.ok(!secretName(n), n);
  assert.equal(recordFolder('w1', 'uabc123'), 'w1-uabc123');
  assert.equal(recordFolder('a b/c:d', 'u1'), 'a-b-c-d-u1');
  const rec = { dir: 'C:/r/.atrium/records/w-u1', files: Array.from({ length: 7 }, (_, i) => ({ name: 'f' + i + '.md', bytes: 1 })) };
  const ls = recordLines(rec);
  assert.equal(ls.length, RECORD_LINES_MAX);
  assert.equal(ls[0], '기록 C:/r/.atrium/records/w-u1/f0.md');
  assert.ok(ls.at(-1).includes('외 3개'), ls.at(-1));
  assert.deepEqual(recordLines(null), []);
});

test('P334 주 체크아웃: 워크트리의 .git 파일에서 공통 git 폴더의 부모', () => {
  const main = repo();
  const wt = path.join(tmp(), 'wt1');
  git(main, 'worktree', 'add', '-q', '-b', 'wt1', wt);
  assert.equal(path.resolve(mainCheckoutOf(wt)).toLowerCase(), path.resolve(main).toLowerCase());
  assert.equal(mainCheckoutOf(main), main);
  const plain = tmp();
  assert.equal(mainCheckoutOf(plain), plain);
});

test('P334 검사: 저장소 밖·없는 파일·폴더·.git 안·비밀 이름·크기·개수 거절, 같은 이름은 -2', () => {
  const root = repo(); const out = tmp();
  const f = (rel, body = 'x') => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
  const a = f('notes/audit.md', '# 감사\n'), b = f('other/audit.md', 'b');
  const outside = path.join(out, 'x.md'); fs.writeFileSync(outside, 'x');
  const err = (paths, re, o) => assert.throws(() => checkRecordFiles(paths, [root], o), (e) => e.code === 'bad_request' && re.test(e.message), String(re));
  err([outside], /저장소\(작업 폴더\) 밖/);
  err([path.join(root, 'nope.md')], /없다/);
  err([path.join(root, 'notes')], /파일만/);
  err(['notes/audit.md'], /절대 경로/);
  err([path.join(root, '.git', 'HEAD')], /\.git/);
  err([f('.env', 'K=1')], /비밀/);
  err([f('big.md', 'x'.repeat(50))], /너무 크다/, { fileMax: 10 });
  err(Array.from({ length: RECORD_FILES_MAX + 1 }, () => a), /너무 많다/);
  const ok = checkRecordFiles([a, b], [root]);
  assert.equal(ok.length, 2);
  const rec = copyRecords(ok, root, 'w1-u1', { now: 5 });
  assert.deepEqual(rec.files.map((x) => x.name), ['audit.md', 'audit-2.md']);
  assert.ok(rec.dir.endsWith('/.atrium/records/w1-u1'), rec.dir);
  assert.equal(fs.readFileSync(path.join(root, '.atrium/records/w1-u1/audit.md'), 'utf8'), '# 감사\n');
  // .atrium/은 git 밖(.git/info/exclude)
  assert.equal(git(root, 'status', '--porcelain', '--untracked-files=all').split('\n').filter((l) => l.includes('.atrium')).length, 0);
  assert.ok(fs.readFileSync(path.join(root, '.git/info/exclude'), 'utf8').includes('/.atrium/'));
  const doc = readRecord(rec, 'audit.md');
  assert.equal(doc.text, '# 감사\n'); assert.ok(doc.markdown);
  assert.throws(() => readRecord(rec, '../x'), /없는 파일/);
});

// 가짜 판: 진짜 저장소, 가짜 대기열(넣은 글을 모은다)
async function board() {
  const root = repo();
  const store = new Store(path.join(tmp(), 'board.db'));
  const ws = await workspaceOf(root);
  store.insertWorkspace({ ...ws, createdAt: 1 });
  const sent = []; const casts = [];
  const b = { store, sessions: new Map(), log: () => {}, linkEvent: () => {}, sent,
    queue: { enqueue: (sid, text) => { sent.push({ sid, text }); return { deliveryId: 'd' + sent.length }; } },
    broadcastSession: (s, o) => casts.push([s.name, o && o.cause]) };
  const branch = { relIndex: () => ({ workParentOf: () => null }), rowOf: () => null };
  const units = new WorkUnits(b, branch);
  const add = (name) => { const s = { sessionId: crypto.randomUUID(), name, cwd: root, workspaceKey: ws.key, kind: 'claude', origin: 'board', rt: newRuntime({ kind: 'claude', hooked: true }), createdAt: Date.now() }; b.sessions.set(s.sessionId, s); return s; };
  const lead = add('lead'), w = add('w1');
  const unit = { id: 'u' + crypto.randomBytes(3).toString('hex'), from: lead.sessionId, to: w.sessionId, origin: 'child', spec: '감사해서 기록을 남겨라', status: 'open', createdAt: Date.now() };
  store.insertUnit(unit);
  store.insertTry({ id: 't1', unitId: unit.id, sessionId: w.sessionId, header: true, deliveryId: null, startedAt: Date.now() });
  return { root, store, b, units, lead, w, unit, sent, casts };
}

test('P334 done --record: 거절이면 닫지 않음, 받으면 복사·일 기록·위 세션 글 "기록 <경로>"·카드 요약·보기', async () => {
  const { root, store, units, w, unit, sent, casts } = await board();
  const outside = path.join(tmp(), 'leak.md'); fs.writeFileSync(outside, 'x');
  await assert.rejects(units.doneVerb(w, { result: 'ok', text: '끝', records: [outside] }), /밖/);
  assert.equal(store.getUnit(unit.id).status, 'open', '거절이면 일은 열린 채');
  assert.equal(sent.length, 0);
  const f = path.join(root, 'audit-report.md'); fs.writeFileSync(f, '# 결과\n- 하나\n');
  const r = await units.doneVerb(w, { result: 'ok', text: '감사 끝', records: [f] });
  assert.equal(r.claimedBy, 'queue');
  assert.equal(r.records.files[0].name, 'audit-report.md');
  const dir = path.join(root, '.atrium', 'records', 'w1-' + unit.id);
  assert.ok(fs.existsSync(path.join(dir, 'audit-report.md')));
  const u = store.getUnit(unit.id);
  assert.equal(u.status, 'done'); assert.equal(u.records.files.length, 1);
  assert.equal(sent.length, 1);
  const lines = sent[0].text.split('\n');
  assert.ok(lines.includes('감사 끝'));
  const rl = lines.find((l) => l.startsWith('기록 '));
  assert.ok(rl && rl.endsWith('/.atrium/records/w1-' + unit.id + '/audit-report.md'), sent[0].text);
  assert.ok(casts.some(([n, c]) => n === 'w1' && c === 'records'));
  // 카드 요약과 보기
  const brief = units.recordsOf(w.sessionId);
  assert.equal(brief.unitId, unit.id); assert.equal(brief.count, 1);
  units.recCache.clear(); // 판이 다시 떠도 표에서 읽는다
  assert.equal(units.recordsOf(w.sessionId).unitId, unit.id);
  const view = units.readRecords({ session: w.sessionId });
  assert.equal(view.doc.text, '# 결과\n- 하나\n'); assert.equal(view.session, 'w1');
  // items 칸
  const items = units.items({ sessionId: unit.from });
  assert.deepEqual(items.items[0].records.files, ['audit-report.md']);
  // git status에 안 보인다
  assert.ok(!git(root, 'status', '--porcelain', '--untracked-files=all').includes('.atrium'));
});

test('P334 merger 정리 줄에 기록', () => {
  const u = { status: 'done', spec: '', meta: { child: 'w1', merged: { hash: 'abcdef1234', text: 'merged' }, target: 'dev' }, records: { dir: 'C:/r/.atrium/records/w1-u1', files: [{ name: 'a.md' }] } };
  assert.ok(summaryLine(u).includes('기록 C:/r/.atrium/records/w1-u1/a.md'), summaryLine(u));
  const two = { ...u, records: { ...u.records, files: [{ name: 'a.md' }, { name: 'b.md' }] } };
  assert.ok(summaryLine(two).includes('(2개)'));
  assert.ok(!summaryLine({ ...u, records: null }).includes('기록'));
  assert.ok(mergeSummaryText({ merger: 'm', units: [u] }).includes('기록 '));
});

test('P334 안내문 한 줄: 판 안내·하네스 안내·일 머리·스킬·계약', () => {
  assert.ok(RECORD_RULE.length < limitOf('p334-record'), RECORD_RULE.length);
  assert.ok(BOARD_SYSTEM_PROMPT.includes(RECORD_RULE));
  assert.equal(BOARD_SYSTEM_PROMPT.split('\n').length, 9, '줄 수 그대로');
  assert.ok(HARNESS_PROMPT.includes('--record <파일>') && !HARNESS_PROMPT.includes('\n') && !HARNESS_PROMPT.includes('"'));
  const h = unitHeader({ parent: 'lead', unitId: 'u1' });
  assert.ok(h.split('\n')[1].endsWith(RECORD_TAIL)); assert.equal(h.split('\n').length, 3);
  assert.ok(RECORD_TAIL.length < 80);
  assert.ok(boardSkill().includes('--record <파일>') && boardSkill().includes('.atrium/records/'));
  const d = VERBS.find((v) => v.name === 'done');
  assert.ok(d.args.includes('[--record 파일]…') && d.out.includes('records'));
});

test('P334 새 안내 알림: news 칸이 없는 판(옛 세션)은 한 번 알림, 지금 판은 앎', () => {
  assert.deepEqual(newNews(stampOf({ text: 'x' })), []);
  assert.deepEqual(newNews({ contract: 9, verbs: [], hash: 'h' }), NEWS_IDS); // P375: news 칸이 없는 판은 뒤에 더한 안내(know-start·know-hint)도 모른다
  assert.deepEqual(newNews(assumedStamp(1)), NEWS_IDS);
  assert.deepEqual(newNews(assumedStamp(Date.now() + 86400000)), [], '판 기록 없이 나중에 뜬 세션은 안다고 어림');
  const l = newsLine(['records']);
  assert.ok(l.startsWith(NEWS_HEAD) && l.includes('--record') && !l.includes('\n'), l);
  assert.equal(newsLine([]), null);
});

test('P334 문서 점검: 허락 밖 파일 경고에 .atrium/records 꼬리, 잘려도 남음', () => {
  const short = warnLine({ problems: [{ code: 'shape', short: 'docs/x.md 꼴 밖' }] });
  assert.ok(short.endsWith(SHAPE_TAIL), short);
  const long = warnLine({ problems: [{ code: 'shape', short: 'x'.repeat(400) }, { code: 'budget', short: 'y' }] });
  assert.ok(long.endsWith(SHAPE_TAIL) && long.length <= WARN_MAX, long.length);
  assert.ok(!warnLine({ problems: [{ code: 'budget', short: 'a' }] }).includes('records'));
});

test('P334 문서 점검: 손으로 둔 .atrium/docs.json(off 아님)은 BRIEF·ARCH·PLAN 없이도 켜진다', async () => {
  const root = repo();
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs/reading-contract.md'), '# 계약\n' + '가'.repeat(30));
  fs.writeFileSync(path.join(root, 'docs/slice-findings.md'), '# 조사\n');
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'docs');
  assert.equal(docsOn(root), false, '설정도 살아 있는 문서도 없으면 꺼짐');
  fs.mkdirSync(path.join(root, '.atrium'));
  fs.writeFileSync(path.join(root, '.atrium/docs.json'), JSON.stringify({ dir: 'docs', budgets: { 'reading-contract.md': 20 }, total: 1000 }));
  assert.equal(loadDocConfig(root).source, '.atrium/docs.json');
  assert.equal(docsOn(root), true);
  const res = await checkDocs(root);
  assert.equal(res.on, true);
  assert.ok(res.rows.some((r) => r.file === 'docs/reading-contract.md' && r.over), JSON.stringify(res.rows));
  assert.ok(res.total.chars > 0, '예산에 적은 파일은 합계에');
  const codes = res.problems.map((p) => p.code + ':' + (p.file || ''));
  assert.ok(codes.includes('shape:docs/slice-findings.md'), codes.join(' '));
  assert.ok(!codes.includes('shape:docs/reading-contract.md'), '예산에 적은 파일은 허락');
  assert.ok(!codes.some((c) => c.startsWith('plan_') || c.startsWith('brief_')), 'PLAN·BRIEF가 없으면 그 점검은 없다');
  assert.ok(res.problems.find((p) => p.code === 'shape').text.includes('.atrium/records/'));
  // off면 꺼짐
  fs.writeFileSync(path.join(root, '.atrium/docs.json'), JSON.stringify({ dir: 'docs', off: true }));
  assert.equal(docsOn(root), false);
});
