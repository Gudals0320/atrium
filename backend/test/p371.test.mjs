// P371 시험: atrium know의 자기 단위 빼기(--self), 같은 글 복사본 접기, 절 단위 순위·포인터·발췌(맞은 줄 번호와 둘레),
// 제목 없는 파일·코드 주석의 절, 문서에 바꿀 문장 인용은 가리지 않기, 출력 꼬리표. 지어 만든 작은 저장소만 쓴다(실제 기록은 넣지 않는다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { refresh, search, format, closeAll, rankSections } from '../src/know-core.mjs';
import { mdChunks, commentChunks, sectionExcerpt, excerpt, maskLine, selfUnitOf, copyReason, normLines, linesOverlap, SECTION_LINES_MAX } from '../src/know-text.mjs';
import { KnowService, indexName } from '../src/know.mjs';
import { Store } from '../src/store.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p371-'));
const DAY = 86400000;
const T0 = Date.parse('2026-11-10T12:00:00+09:00');
const write = (root, rel, text, ms = T0) => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); fs.utimesSync(f, new Date(ms), new Date(ms)); return f; };
const git = (root, args) => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: new Date(T0).toISOString(), GIT_COMMITTER_DATE: new Date(T0).toISOString() } });
const LONG = Array.from({ length: 20 }, (_, i) => `- 채움 줄 ${i}: 아무 관련 없는 설명`).join('\n');
// 단위 P50의 작업 파일·기록과 그 복사본, 다른 단위 P40의 기록(여러 절), 제목 없는 글, 코드 주석
function makeRepo() {
  const root = tmp();
  execFileSync('git', ['init', '-q', '-b', 'dev', root]);
  write(root, '.gitignore', 'docs/\nexperiments/\n.atrium/\n');
  write(root, 'src/relay.mjs', 'export const a = 1;\n\n// P50: falconword 중계기는 키를 env로만 받는다\nexport const b = 2;\n');
  git(root, ['add', '-A']); git(root, ['commit', '-q', '-m', 'init']);
  // P50 자기 파일(작업 파일, 기록, 기록 사본, 지시 본문 사본)
  write(root, 'docs/log/p50-relay.md', '# P50 중계기\n\n## 지시\n\nfalconword 중계기를 시험 판에서 돌린다. 시험 판 셋업은 앞 기록을 본다.\n');
  write(root, 'experiments/head-tools/bodies/p50_body.md', '# P50 중계기\n\n## 지시\n\nfalconword 중계기를 시험 판에서 돌린다. 시험 판 셋업은 앞 기록을 본다.\n');
  write(root, 'experiments/p50/p50-record.md', '# P50 기록\n\nfalconword 중계기 시험 판 셋업을 마쳤다.\n');
  write(root, '.atrium/records/p50-u9/p50-record.md', '# P50 기록\n\nfalconword 중계기 시험 판 셋업을 마쳤다.\n');
  // P40 기록: 앞 절은 낱말 하나, 뒤 절(만드는 법)은 낱말이 몰려 있다. 기록 사본이 하나 더
  const p40 = ['# P40 기록', '', '## 재는 판', '', '시험 판: 세션 59개(셸 14), falconword 카드 수 0장', LONG, '', '## 만드는 법', '', '그냥 설명 줄', '- 카드는 리드 세션 env로 atrium-child ask를 부른다(falconword 카드 셋업, 셸에서는 안 된다)', '- 끝 줄', ''].join('\n');
  write(root, 'experiments/p40/p40-record.md', p40);
  write(root, '.atrium/records/p40-u3/p40-record.md', p40);
  // 이름이 다르지만 내용이 같은 파일(해시)
  write(root, 'docs/notes-a.md', '# 메모\n\nhawkword 측정은 프레임당 주 스레드 시간으로 본다.\n');
  write(root, 'experiments/scratch/notes-b.md', '# 메모\n\nhawkword 측정은 프레임당 주 스레드 시간으로 본다.\n');
  // 제목 없는 글(짧음)과 긴 절(SECTION_LINES_MAX 넘음)
  write(root, 'docs/plain.txt', ['머리 줄', '둘째 줄', '셋째 줄: owlword 옛 빌드는 git archive에 backend/src를 넣는다', '넷째 줄'].join('\n'));
  write(root, 'docs/long.md', ['# 긴 글', '', '## 아주 긴 절', ...Array.from({ length: SECTION_LINES_MAX + 20 }, (_, i) => (i === 70 ? 'lynxword 여기 있다' : `줄 ${i}`))].join('\n'));
  // 문서에 바꿀 문장 인용(길다)
  write(root, 'docs/log/p30-doc.md', '# P30\n\n## 바꿀 문장\n\n- testing: "휴대폰 페이지 재기는 p30-phone.mjs로 한다(세션 59 판: 셸 14, 잠든 haiku 42, 권한 질문 하나, 할 일 카드는 리드 세션 env로 atrium-child ask를 부른다) mothword."\n');
  return root;
}
function setup() {
  const root = makeRepo(); const data = tmp();
  const key = root.replace(/\\/g, '/').toLowerCase() + '/.git';
  return { root, data, key, ctx: { root, key, dbFile: null, indexFile: path.join(data, 'know', indexName(key)), freshMs: 0 } };
}
const ptrs = (r) => r.results.map((x) => x.pointer);

test('P371 순수 함수: 절 범위(제목 경계, 머리 절, 제목 없는 글, 긴 절), 코드 주석의 줄 자리, 절 안 발췌의 줄 번호와 둘레', () => {
  const md = mdChunks('머리말\n\n# 하나\n첫 줄\n\n둘째 줄\n## 둘\n셋');
  assert.deepEqual(md.map((c) => [c.a, c.b, c.sa, c.sb]), [[1, 1, 1, 1], [3, 6, 3, 6], [7, 8, 7, 8]]);
  assert.equal(md[1].body.split('\n')[3], '둘째 줄', 'body의 i번째 줄 = 원문 a+i줄(가운데 빈 줄도 지킨다)');
  const plain = mdChunks(Array.from({ length: 30 }, (_, i) => `줄 ${i}`).join('\n'));
  assert.ok(plain.length >= 2 && plain.every((c) => c.sa === 1 && c.sb === 30), '제목 없는 글은 통째로 한 절');
  const big = mdChunks(['# 큰', ...Array.from({ length: SECTION_LINES_MAX + 5 }, (_, i) => `줄 ${i}`)].join('\n'));
  assert.ok(big.every((c) => c.sa === c.a && c.sb === c.b), '긴 절은 덩어리가 단위');
  const cc = commentChunks('let x;\n// P12 하나\nlet y;\nlet z; // 둘\n', '.mjs');
  assert.equal(cc.length, 1); assert.deepEqual([cc[0].a, cc[0].b, cc[0].sa, cc[0].sb], [2, 4, 2, 4]);
  assert.deepEqual(cc[0].body.split('\n'), ['P12 하나', '', '둘']);
  // 절 안 발췌: 맞은 줄과 그 원문 줄 번호, 짧으면 바로 뒤 줄을 잇는다
  const ex = sectionExcerpt([{ a: 10, body: '# 제목\n앞 줄 설명\n\nalpha beta 맞은 줄\n뒤 줄 이어짐' }], ['alpha', 'beta']);
  assert.equal(ex.line, 13); assert.match(ex.text, /^alpha beta 맞은 줄 ⏎ 뒤 줄 이어짐$/);
  // 긴 줄은 맞은 낱말이 가장 많이 든 창
  const longLine = 'x '.repeat(200) + 'gamma ' + 'y '.repeat(30) + 'alpha beta gamma 끝' + ' z'.repeat(200);
  const w = sectionExcerpt([{ a: 1, body: longLine }], ['alpha', 'beta', 'gamma']);
  assert.ok(w.text.length <= 160); assert.match(w.text, /alpha beta gamma/);
  assert.equal(excerpt('사용자: 비밀\n> 인용', ['비밀']), '');
});

test('P371 문서에 바꿀 문장 인용은 발췌·원문에서 가리지 않고, 사람 말 같은 긴 인용은 그대로 가린다', () => {
  const doc = '- testing: "휴대폰 페이지 재기는 p30-phone.mjs로 한다(세션 59 판: 셸 14, 잠든 haiku 42, 권한 질문 하나, 할 일 카드는 리드 세션 env로 부른다)."';
  assert.doesNotMatch(maskLine(doc), /인용 생략/);
  assert.doesNotMatch(maskLine('- ARCH(휴대폰 화면): "휴대폰의 웹 화면은 boot.js가 휴대폰 전용 페이지를 읽는다 그리고 아래 탭 홈 세션 맵과 세션 화면이 있고 캔버스는 들이지 않는다."'), /인용 생략/);
  assert.match(maskLine('그는 "이건 사람이 한 말이라 길게 옮기면 안 되는 문장이다 하나 둘 셋 넷 다섯 여섯 일곱 여덟 아홉"이라고 했다'), /\[인용 생략\]/);
  const ex = sectionExcerpt([{ a: 5, body: doc }], ['세션', '잠든', 'haiku']);
  assert.match(ex.text, /잠든 haiku 42/); assert.equal(ex.line, 5);
  assert.match(sectionExcerpt([{ a: 1, body: '그는 "이건 사람이 한 말이라 길게 옮기면 안 되는 문장이다 하나 둘 셋 넷 다섯 여섯 일곱 여덟 아홉 열 열하나"라고 했다' }], ['사람']).text, /"…"/);
});

test('P371 자기 단위: 세션 이름·일 글의 단위, 자기 파일(작업 파일·기록·사본)은 빼고 코드 주석은 남긴다. --self면 넣는다', () => {
  assert.equal(selfUnitOf('p50', null), 'P50'); assert.equal(selfUnitOf('p50-fix', 'P12 무엇'), 'P50');
  assert.equal(selfUnitOf('helper', 'Read C:\\x\\docs\\log\\p51-a.md and do the work. P365 기준선 참고'), 'P51');
  assert.equal(selfUnitOf('helper', 'P52: 고쳐라'), 'P52');
  assert.equal(selfUnitOf('helper', '참고: P365 기준선을 다시 잰다'), null, '일 글 가운데 지나가는 단위는 쓰지 않는다');
  assert.equal(selfUnitOf('atrium-head', null), null);
  const { ctx } = setup();
  try {
    refresh(ctx);
    const all = search(ctx, { q: 'falconword 시험 판 셋업', k: 10 });
    assert.ok(ptrs(all).some((p) => p.startsWith('docs/log/p50-relay.md')), '단위가 없으면(지휘 세션) 그대로');
    assert.equal(all.self, undefined);
    const mine = search(ctx, { q: 'falconword 시험 판 셋업', k: 10, selfUnit: 'P50' });
    assert.ok(!mine.results.some((x) => /p50/i.test(x.pointer) && x.kind !== 'code'), ptrs(mine).join(' '));
    assert.ok(ptrs(mine).some((p) => p.startsWith('src/relay.mjs:3-3')), '코드 주석은 남는다');
    assert.ok(ptrs(mine).some((p) => p.startsWith('experiments/p40/p40-record.md')), '다른 단위의 기록은 그대로');
    assert.deepEqual([mine.self.unit, mine.self.included], ['P50', false]); assert.ok(mine.self.hidden >= 2);
    assert.match(format(mine).out, /\n자기 단위 P50의 것 \d+곳은 뺐다\(--self로 넣는다\)\n/);
    const withSelf = search(ctx, { q: 'falconword 시험 판 셋업', k: 10, selfUnit: 'P50', self: true });
    assert.ok(ptrs(withSelf).some((p) => p.startsWith('docs/log/p50-relay.md')));
    assert.equal(withSelf.self.hidden, 0); assert.doesNotMatch(format(withSelf).out, /자기 단위/);
  } finally { closeAll(); }
});

test('P371 복사본: 기록 사본·지시 본문 사본·같은 내용 파일을 한 자리로 접고 다른 자리를 같은 글 꼬리표로', () => {
  const L = (t) => normLines(t);
  assert.equal(copyReason({ path: 'experiments/p40/p40-record.md', unit: 'P40' }, { path: '.atrium/records/p40-u3/p40-record.md', unit: 'P40' }), 'name');
  assert.equal(copyReason({ path: 'docs/log/p50-relay.md', unit: 'P50' }, { path: 'experiments/head-tools/x/p50_body.md', unit: 'P50' }), 'body');
  assert.equal(copyReason({ path: 'a.md', origin: 'file', hash: 'h1' }, { path: 'b.md', origin: 'file', hash: 'h1' }), 'hash');
  assert.equal(copyReason({ path: 'experiments/p40/a.md', unit: 'P40' }, { path: 'experiments/p41/a.md', unit: 'P41' }), null, '다른 단위의 같은 이름은 아니다');
  assert.equal(copyReason({ path: 'db:work_units/1', lines: L('합치기: 브랜치 worktree-p40, 끝 커밋 abc') }, { path: 'db:unit_tries/9', lines: L('합치기: 브랜치 worktree-p40, 끝 커밋 abc') }), 'text');
  assert.ok(!linesOverlap(L('하나 둘 셋 넷 다섯\n여섯 일곱 여덟 아홉'), L('하나 둘 셋 넷 다섯\n전혀 다른 줄 이다')), '반만 같으면 아니다');
  const { ctx } = setup();
  try {
    refresh(ctx);
    const r = search(ctx, { q: 'falconword 카드 셋업 리드 세션', k: 10 });
    const rec = r.results.filter((x) => /p40-record\.md/.test(x.pointer));
    assert.equal(rec.length, 1, ptrs(r).join(' '));
    assert.ok(rec[0].copies.some((p) => p.includes('p40-u3/p40-record.md')));
    const body = search(ctx, { q: 'falconword 중계기 시험 판', k: 10 });
    assert.equal(body.results.filter((x) => /p50-relay|p50_body/.test(x.pointer)).length, 1);
    const h = search(ctx, { q: 'hawkword 프레임당', k: 10 });
    assert.equal(h.results.length, 1); assert.equal(h.results[0].copies.length, 1);
    assert.match(format(h).out, /\n {2}같은 글: (?:docs\/notes-a\.md|experiments\/scratch\/notes-b\.md)\n/);
  } finally { closeAll(); }
});

test('P371 절: 맞은 낱말이 가장 몰린 절이 그 파일의 대표(포인터 = 절 범위), 발췌는 그 절의 맞은 줄, 다른 맞은 절은 꼬리표. 제목 없는 글·긴 절·코드 주석', () => {
  const { root, ctx } = setup();
  try {
    refresh(ctx);
    const text = fs.readFileSync(path.join(root, 'experiments/p40/p40-record.md'), 'utf8').split('\n');
    const how = text.findIndex((l) => l === '## 만드는 법') + 1; const hit = text.findIndex((l) => l.includes('리드 세션 env')) + 1; const last = text.findIndex((l) => l === '- 끝 줄') + 1;
    const r = search(ctx, { q: 'falconword 카드 셋업 리드 세션 env atrium-child', k: 10 }).results.find((x) => /p40-record/.test(x.pointer));
    assert.equal(r.pointer.replace(/^.*:/, ''), `${how}-${last}`, '앞 절(재는 판)이 아니라 만드는 법 절');
    assert.equal(r.heading, '만드는 법'); assert.equal(r.line, hit); assert.match(r.excerpt, /리드 세션 env로 atrium-child ask/);
    assert.deepEqual(r.also, ['3-25'], '다른 맞은 절(재는 판)은 꼬리표');
    assert.match(format({ command: 'search', mode: 'fts5', results: [r] }).out, new RegExp(`\\n {2}L${hit} .*\\n {2}같은 글: .*\\n {2}다른 절: 3-25\\n`));
    // 제목 없는 글: 통째로 한 절, 발췌는 맞은 줄(앞머리가 아니다)
    const p = search(ctx, { q: 'owlword git archive' }).results[0];
    assert.equal(p.pointer, 'docs/plain.txt:1-4'); assert.equal(p.line, 3); assert.match(p.excerpt, /owlword 옛 빌드/);
    // 긴 절: 덩어리 범위
    const lg = search(ctx, { q: 'lynxword' }).results[0];
    const [a, b] = lg.pointer.replace(/^.*:/, '').split('-').map(Number);
    assert.ok(b - a < 20 && a <= lg.line && lg.line <= b, lg.pointer);
    // 코드 주석: 주석 덩어리 범위와 그 줄
    const c = search(ctx, { q: 'falconword 중계기 env' }).results.find((x) => x.kind === 'code');
    assert.equal(c.pointer, 'src/relay.mjs:3-3'); assert.equal(c.line, 3);
    // 문서에 바꿀 문장 인용 속 맞은 줄이 발췌에 보인다
    assert.match(search(ctx, { q: 'mothword 잠든 haiku' }).results[0].excerpt, /잠든 haiku 42/);
  } finally { closeAll(); }
});

test('P371 rankSections: 같은 절 덩어리를 묶고, 맞은 낱말 수가 많은 절이 대표, 파일 순위는 대표 절 점수', () => {
  const row = (p, sa, a, score, body) => ({ path: p, sa, sb: sa + 9, a, b: a, heading: '', body, score });
  const files = rankSections([
    row('x.md', 1, 2, -5, 'alpha'), row('x.md', 20, 21, -3, 'alpha beta'), row('x.md', 20, 25, -2, 'gamma'), row('y.md', 1, 1, -4, 'alpha'),
  ], ['alpha', 'beta', 'gamma']);
  assert.deepEqual(files.map((f) => [f.rep.row.path, f.rep.sa]), [['x.md', 20], ['y.md', 1]]);
  assert.equal(files[0].rep.cov, 3); assert.equal(files[0].rep.parts.length, 2); assert.deepEqual(files[0].others.map((s) => s.sa), [1]);
});

test('P371 서비스: p50 세션의 atrium know는 자기 단위 것을 빼고, 판의 지금 일 글로도 단위를 찾는다. 판 일·done(db)도 뺀다', async () => {
  const { root, data, key } = setup();
  const dbFile = path.join(data, 'board.db');
  const st = new Store(dbFile);
  const ins = st.db.prepare('INSERT INTO sessions (session_id, name, cwd, permission_mode, settings_path, hook_token, created_at, workspace_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  ins.run('s-lead', 'lead', 'C:/x', 'default', 'x', 't', T0, key); ins.run('s-p50', 'p50', 'C:/x', 'default', 'x', 't', T0, key); ins.run('s-h', 'helper', 'C:/x', 'default', 'x', 't', T0, key);
  const u = st.db.prepare('INSERT INTO work_units (id, from_session, to_session, origin, spec, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  u.run('u1', 's-lead', 's-p50', 'prompt', 'P50 falconword 중계기 판 일 글', 'open', T0 + DAY);
  u.run('u2', 's-lead', 's-h', 'prompt', 'Read docs/log/p50-relay.md and do the work', 'open', T0 + DAY);
  st.db.prepare('INSERT INTO unit_tries (id, unit_id, session_id, started_at) VALUES (?, ?, ?, ?)').run('t2', 'u2', 's-h', T0 + DAY);
  st.db.close();
  const board = { store: { getWorkspace: (k) => (k === key ? { root } : null), openTryOf: (sid) => (sid === 's-h' ? { unitId: 'u2' } : null), getUnit: (id) => (id === 'u2' ? { id, spec: 'Read docs/log/p50-relay.md and do the work' } : null) }, log: () => {} };
  const know = new KnowService(board, { dataDir: data, dbFile, worker: false });
  try {
    const lead = await know.verb({ sessionId: 's-lead', name: 'lead', workspaceKey: key }, { action: 'search', q: 'falconword 중계기', k: 10, json: true });
    const lp = JSON.parse(lead.out).results.map((x) => x.pointer);
    assert.ok(lp.includes('db:work_units/u1') && lp.some((p) => p.startsWith('docs/log/p50-relay.md')), lp.join(' '));
    for (const s of [{ sessionId: 's-p50', name: 'p50', workspaceKey: key }, { sessionId: 's-h', name: 'helper', workspaceKey: key }]) {
      const r = JSON.parse((await know.verb(s, { action: 'search', q: 'falconword 중계기', k: 10, json: true })).out);
      const ps = r.results.map((x) => x.pointer);
      assert.ok(!ps.includes('db:work_units/u1') && !ps.some((p) => /p50-relay|p50_body|p50-record/.test(p)), `${s.name}: ${ps.join(' ')}`);
      assert.equal(r.self.unit, 'P50'); assert.ok(r.self.hidden >= 3);
      const all = JSON.parse((await know.verb(s, { action: 'search', q: 'falconword 중계기', k: 10, json: true, self: true })).out);
      assert.ok(all.results.some((x) => x.pointer === 'db:work_units/u1'));
    }
    const lines = fs.readFileSync(know.usageFile, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(lines.at(-1).opts, { k: 10, self: true, json: true });
  } finally { closeAll(); await know.close(); }
});
