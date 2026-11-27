// P388 시험: atrium know 발췌의 제약 줄(맞은 줄 가까이 "주의·상한·하지 않는다 …"가 적힌 줄을 "제약 L<줄>"로 함께)과
// 사용 기록의 hinted(지휘 세션이 지시에 적어 넘긴 위치 / 워커가 새로 찾은 위치), --usage 요약. 지어 만든 작은 저장소만 쓴다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { search, format, closeAll } from '../src/know-core.mjs';
import { sectionExcerpt, cautionWeight, cautionOf, CAUTION_WORDS, CAUTION_MAX, CAUTION_NEAR, EXCERPT_MAX, taskFileOf, hintPathsOf, hintOf } from '../src/know-text.mjs';
import { KnowService, hintsOfTask } from '../src/know.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p388-'));
const write = (root, rel, text) => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const FILL = (n, from = 0) => Array.from({ length: n }, (_, i) => `- 채움 줄 ${from + i}: 아무 관련 없는 설명`);
const BT = (s) => '`' + s + '`';

test('P388 제약 낱말: 한 곳(CAUTION_WORDS)에 한국어·영어, strong 2 · weak 1 · 없음 0', () => {
  for (const w of ['주의', '상한', '함정', '금지', '넘으면', 'must', 'never', 'limit']) assert.ok(CAUTION_WORDS.strong.includes(w), w);
  for (const w of ['하지 않는다', '않는다', '반드시', '먼저']) assert.ok(CAUTION_WORDS.weak.includes(w), w);
  assert.equal(cautionWeight('스킬 글 크기 상한(p41·p8) 때문에 짧게'), 2);
  assert.equal(cautionWeight('You MUST run the size test first'), 2);
  assert.equal(cautionWeight('the limits apply'), 2); // limit → limits
  assert.equal(cautionWeight('delimiter only'), 0); // 낱말 경계: delimiter의 limit은 아니다
  assert.equal(cautionWeight('셸 세션은 적지 않는다'), 1);
  assert.equal(cautionWeight('그냥 설명 줄'), 0);
});

test('P388 발췌: 맞은 줄 가까이 제약 줄이 있으면 caution { text, line }, 없으면 지금 그대로', () => {
  const body = ['- 시작: worktree 열기와 claude -w 흐름을 맞췄다', '- 고친 곳', '  - a.mjs 설명', '  - b.mjs 설명',
    '  - branch.mjs 판 스킬 글: 스킬 글 크기 상한(p41·p8 시험) 때문에 짧게.', '- 끝 줄입니다'].join('\n');
  const ex = sectionExcerpt([{ a: 5, body }], ['worktree', 'claude']);
  assert.equal(ex.line, 5);
  assert.deepEqual(ex.caution, { text: 'branch.mjs 판 스킬 글: 스킬 글 크기 상한(p41·p8 시험) 때문에 짧게. ⏎ 끝 줄입니다', line: 9 });
  // 제약 줄이 없으면 caution 칸이 없고 글·줄은 P371 그대로(짧은 맞은 줄 + 바로 뒤 줄)
  const plain = sectionExcerpt([{ a: 10, body: '# 제목\n앞 줄 설명\n\nalpha beta 맞은 줄\n뒤 줄 이어짐' }], ['alpha', 'beta']);
  assert.deepEqual(plain, { text: 'alpha beta 맞은 줄 ⏎ 뒤 줄 이어짐', line: 13 });
  // 멀면(CAUTION_NEAR 줄 넘게) 붙이지 않는다
  const head = 'worktree 맞은 줄입니다 설명이 깁니다 아주 길게 써서 뒤 줄을 잇지 않게 합니다 하나 둘 셋 넷 다섯 여섯 일곱';
  const far = sectionExcerpt([{ a: 1, body: [head, ...FILL(CAUTION_NEAR), '상한 줄은 멀리 있다'].join('\n') }], ['worktree']);
  assert.equal(far.caution, undefined);
  const near = sectionExcerpt([{ a: 1, body: [head, ...FILL(CAUTION_NEAR - 1), '상한 줄은 가까이 있다'].join('\n') }], ['worktree']);
  assert.equal(near.caution.line, CAUTION_NEAR + 1);
});

test('P388 발췌: 맞은 줄이나 이어 보인 줄이 제약 줄이면 하나만, weak만 보였으면 strong 줄을 더한다', () => {
  const same = sectionExcerpt([{ a: 1, body: '앞 줄\nworktree 스킬 글 크기 상한을 넘으면 시험이 떨어진다\n뒤 줄에 주의 낱말' }], ['worktree']);
  assert.equal(same.line, 2); assert.equal(same.caution, undefined);
  const nextShown = sectionExcerpt([{ a: 1, body: 'worktree 짧은 줄\n상한을 올린다' }], ['worktree']);
  assert.match(nextShown.text, /⏎ 상한을 올린다/); assert.equal(nextShown.caution, undefined);
  const lead = 'worktree 줄은 셸 세션을 적지 않는다(이어 보일 뒤 줄이 붙지 않을 만큼 길게 쓴 설명 하나 둘 셋 넷 다섯 여섯)';
  const weak = sectionExcerpt([{ a: 1, body: lead + '\n채움\n채움 둘\n바이트 상한 +300을 먼저 올린다' }], ['worktree']);
  assert.equal(weak.caution.line, 4);
  // weak 낱말만 있는 줄은 물음 낱말이 있어야 붙는다
  assert.equal(sectionExcerpt([{ a: 1, body: lead.replace('적지 않는다', '적는다') + ' 일곱 여덟 아홉 열' + '\n채움\n다시 짓지 않는다' }], ['worktree']).caution, undefined);
  assert.equal(sectionExcerpt([{ a: 1, body: lead.replace('적지 않는다', '적는다') + ' 일곱 여덟 아홉 열' + '\n채움\nworktree는 다시 짓지 않는다' }], ['worktree']).caution.line, 3);
  const weakOnly = sectionExcerpt([{ a: 1, body: lead + '\n채움\n반드시 먼저 한다' }], ['worktree']);
  assert.equal(weakOnly.caution, undefined, '보인 줄에 weak가 있으면 weak 줄은 더하지 않는다');
});

test('P388 발췌: 물음 낱말이 든 제약 줄이 먼저, 그다음 세기·가까움. 길이 상한(EXCERPT_MAX·CAUTION_MAX)을 지키고 창은 제약 낱말 둘레', () => {
  const lines = [{ n: 10, t: 'worktree 맞은 줄' }, { n: 11, t: '주의: 상관없는 이야기' }, { n: 16, t: '스킬 상한 줄: 스킬 글이 길면 떨어진다' }];
  assert.equal(cautionOf(lines, 10, ['스킬'], 'worktree 맞은 줄', new Set([10])).line, 16);
  assert.equal(cautionOf(lines, 10, ['다른'], 'worktree 맞은 줄', new Set([10])).line, 11);
  assert.equal(cautionOf(lines, 10, ['스킬'], 'worktree 맞은 줄 상한', new Set([10])), null, '보인 글에 strong 제약이 있으면 하나만');
  const long = 'worktree '.repeat(40);
  const longCaution = '앞 설명 '.repeat(60) + '스킬 바이트 상한 +300(p8·p41·p46)을 올렸다' + ' 뒤 설명'.repeat(60);
  const ex = sectionExcerpt([{ a: 1, body: [long, longCaution].join('\n') }], ['worktree']);
  assert.ok(ex.text.length <= EXCERPT_MAX, ex.text.length);
  assert.ok(ex.caution.text.length <= CAUTION_MAX, ex.caution.text.length);
  assert.match(ex.caution.text, /바이트 상한 \+300/);
  // 긴 맞은 줄의 창이 제약 낱말을 잘라 냈으면 같은 줄의 제약 낱말 둘레를 제약 줄로 보인다(물음 낱말 쪽 창과 다른 곳)
  const cut = '시험 상한 1323자 안으로 줄였다 ' + '가운데 설명 '.repeat(30) + 'relationHeader 동료 머리 줄에 남아 있다';
  const same = sectionExcerpt([{ a: 90, body: cut }], ['relationheader', '머리']);
  assert.equal(same.line, 90); assert.doesNotMatch(same.text, /상한/);
  assert.equal(same.caution.line, 90); assert.match(same.caution.text, /^시험 상한 1323자/);
});

test('P388 찾기: 제약 줄이 맞은 덩어리 밖(같은 절의 다른 덩어리)에 있어도 결과의 caution과 "제약 L<줄>" 줄로 보인다', () => {
  const root = tmp(); const data = tmp();
  const long = (s) => s + ' ' + '설명을 길게 채운다. '.repeat(45);
  // 한 절(작업 기록)을 긴 줄로 채워 덩어리가 여럿이 되게 한다. 물음 낱말(owlworktree)은 앞 덩어리에만, 상한 줄은 뒤 덩어리에
  write(root, 'experiments/p40/p40-record.md', ['# P40 기록', '', '## 작업 기록', '', long('- owlworktree 시작 줄'), long('- 둘째 줄'), long('- 셋째 줄'), long('- 넷째 줄'), '- branch.mjs 판 스킬 글: 스킬 글 크기 상한(p41·p8 시험) 때문에 짧게.', '- 끝 줄입니다', '', '## 보고', '', '- 보고 줄'].join('\n'));
  write(root, 'docs/plain.md', '# 다른 글\n\nowlworktree 설명만 있다\n');
  const ctx = { root, key: 'k', dbFile: null, indexFile: path.join(data, 'i.sqlite') };
  try {
    const res = search(ctx, { q: 'owlworktree' });
    const r = res.results.find((x) => x.pointer.startsWith('experiments/p40/p40-record.md'));
    assert.ok(r, JSON.stringify(res.results));
    assert.equal(r.pointer, 'experiments/p40/p40-record.md:3-10'); assert.equal(r.line, 5);
    assert.deepEqual(r.caution, { text: 'branch.mjs 판 스킬 글: 스킬 글 크기 상한(p41·p8 시험) 때문에 짧게. ⏎ 끝 줄입니다', line: 9 });
    const plain = res.results.find((x) => x.pointer.startsWith('docs/plain.md'));
    assert.equal(plain.caution, undefined);
    const out = format(res).out;
    assert.match(out, /\n  제약 L9 branch\.mjs 판 스킬 글: 스킬 글 크기 상한/);
    assert.equal(out.split('\n')[0].match(/총 (\d+)자/)[1], String(out.length));
    assert.ok(JSON.parse(format(res, true).out).results.some((x) => x.caution && x.caution.line === 9));
  } finally { closeAll(); }
});

test('P388 힌트: 일 spec의 작업 파일, 지시 글의 경로 꼴(힌트 줄 / 다른 줄), 포인터 맞추기', () => {
  assert.equal(taskFileOf('Read C:\\Workspace\\repo\\docs\\log\\p388-know-x.md and do the work it describes.'), 'C:\\Workspace\\repo\\docs\\log\\p388-know-x.md');
  assert.equal(taskFileOf('do docs/log/p12a-y.md now'), 'docs/log/p12a-y.md');
  assert.equal(taskFileOf('그냥 일'), null);
  const h = hintPathsOf('힌트(' + BT('atrium know') + '): ' + BT('backend/src/know-core.mjs') + '(검색), know-text.mjs, lib/kinds.js, 0.59건\n- 문서 C:\\Workspace\\repo\\docs\\testing.md, styles.css, README.md, docs/ 폴더');
  assert.deepEqual([...h.hint].sort(), ['backend/src/know-core.mjs', 'know-text.mjs', 'lib/kinds.js']);
  assert.ok(h.task.has('styles.css') && h.task.has('readme.md') && [...h.task].some((p) => p.endsWith('/docs/testing.md')));
  assert.ok(![...h.hint, ...h.task].some((p) => /0\.59|^docs$/.test(p)), '숫자와 폴더는 경로가 아니다');
  assert.equal(hintOf('backend/src/know-core.mjs:1-20', h), 'hint');
  assert.equal(hintOf('backend/src/know-text.mjs:3-4', h), 'hint'); // 짧은 꼴(파일 이름)
  assert.equal(hintOf('app/src/renderer/lib/kinds.js:1-3', h), 'hint');
  assert.equal(hintOf('docs/testing.md:5-9', h), 'task'); // 절대 경로로 적은 것
  assert.equal(hintOf('app/src/renderer/styles.css:1-2', h), 'task');
  assert.equal(hintOf('backend/src/know.mjs:1-3', h), false);
  assert.equal(hintOf('db:work_units/u1', h), false);
  assert.equal(hintOf('backend/src/know-core.mjs:1-20', null), false);
});

test('P388 사용 기록: 지금 일이 있는 세션은 포인터마다 hinted(hint·task·false)와 hintFile, 지휘 세션은 칸 없음. --usage 요약에 둘의 수', async () => {
  const root = tmp(); const data = tmp();
  write(root, 'backend/src/relay.mjs', 'export const a = 1;\n// hawkword 중계기는 키를 env로만 받는다\n');
  write(root, 'docs/notes.md', '# 메모\n\nhawkword 중계기 메모\n');
  write(root, 'experiments/p40/p40-record.md', '# P40 기록\n\nhawkword 중계기를 고쳤다\n');
  write(root, 'docs/log/p50-relay.md', '# P50\n\n## 지시\n\n힌트(' + BT('atrium know') + '): ' + BT('backend/src/relay.mjs') + '(중계기)\n\n- 문서는 docs/notes.md를 본다\n');
  const spec = 'Read docs/log/p50-relay.md and do the work it describes.';
  const board = { store: { getWorkspace: (k) => (k === 'k' ? { root } : null), openTryOf: (sid) => (sid === 's-w' ? { unitId: 'u1' } : null), getUnit: (id) => (id === 'u1' ? { id, spec } : null) }, log: () => {} };
  const know = new KnowService(board, { dataDir: data, dbFile: path.join(data, 'none.db'), worker: false });
  try {
    assert.equal(hintsOfTask(spec, root).file, 'docs/log/p50-relay.md');
    await know.verb({ sessionId: 's-w', name: 'p50', workspaceKey: 'k' }, { action: 'search', q: 'hawkword 중계기', k: 10 });
    await know.verb({ sessionId: 's-lead', name: 'lead', workspaceKey: 'k' }, { action: 'search', q: 'hawkword 중계기', k: 10 });
    const [w, lead] = fs.readFileSync(know.usageFile, 'utf8').trim().split('\n').map(JSON.parse);
    const by = Object.fromEntries(w.pointers.map((p) => [p.p.replace(/:.*$/, ''), p.hinted]));
    assert.deepEqual(by, { 'backend/src/relay.mjs': 'hint', 'docs/notes.md': 'task', 'experiments/p40/p40-record.md': false });
    assert.equal(w.hintFile, 'docs/log/p50-relay.md');
    assert.ok(lead.pointers.length >= 3 && lead.pointers.every((p) => !('hinted' in p)) && !('hintFile' in lead));
    const u = know.usage();
    assert.deepEqual(u.places, { pointers: w.pointers.length + lead.pointers.length, hint: 1, task: 1, fresh: 1, none: lead.pointers.length });
    const ws = u.bySession.find((x) => x.key === 'p50');
    assert.deepEqual([ws.hint, ws.task, ws.fresh], [1, 1, 1]);
    const out = know.usageVerb({}).out;
    assert.ok(out.includes(`돌려준 위치 ${u.places.pointers}곳: 지시의 힌트에 있던 것 1 · 지시의 다른 곳 1 · 새로 찾은 것 1 · 가르지 않음(지금 일 없음·옛 기록) ${lead.pointers.length}`), out);
    assert.match(out, /p50 {2}1번 {2}[\d,]+자 {2}힌트 1 · 지시 1 · 새로 1/);
    // 옛 기록(hinted 칸 없음)도 깨지지 않는다
    fs.appendFileSync(know.usageFile, JSON.stringify({ t: new Date().toISOString(), session: { name: 'old' }, cmd: 'search', pointers: [{ p: 'x.md:1-2', chars: 3 }], total: 9 }) + '\n');
    assert.equal(know.usage().places.none, lead.pointers.length + 1);
    assert.doesNotMatch(fs.readFileSync(know.usageFile, 'utf8'), /키를 env로만|caution/, '결과 본문은 남기지 않는다');
  } finally { closeAll(); await know.close(); }
});
