// P6c 창 쪽 순수 규칙의 단위 시험: 마크다운 읽기(출력 보기, 메모), 할 일 상자 바꾸기, 놓은 자리의 워크스페이스, 루프 배지 글, 미션 맵 배치
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, inline, toggleTask, plainText } from '../src/renderer/lib/markdown.js';
import { wsAt, loopBadge, loopsOfSession, dur, triggerText, stopText } from '../src/renderer/lib/items.js';
import { missionLayout } from '../src/renderer/lib/mission-layout.js'; // P32: 배치를 옮겼다(나무)
import { setLanguage } from '../src/renderer/lib/i18n.js'; // P16: 한국어 글을 보는 시험은 언어를 정한다

test('I1·I3: 마크다운 블록 — 제목, 문단, 코드 블록, 인용, 목록과 할 일, 표, 가로줄', () => {
  const md = '# 결과\n\n첫 줄\n둘째 줄\n\n```js\nconst a = 1;\n- 목록 아님\n```\n\n> 인용\n\n- 하나\n- [x] 끝낸 일\n  - 하위\n1. 첫째\n2. 둘째\n\n| 이름 | 값 |\n|---|--:|\n| a | 1 |\n\n---';
  const b = parseMarkdown(md);
  assert.deepEqual(b.map((x) => x.t), ['h', 'p', 'code', 'quote', 'ul', 'ol', 'table', 'hr']);
  assert.equal(b[0].level, 1);
  assert.equal(plainText(b[1].c), '첫 줄\n둘째 줄');
  assert.deepEqual([b[2].lang, b[2].text], ['js', 'const a = 1;\n- 목록 아님'], '코드 블록 안은 그대로');
  assert.equal(b[4].items[1].checked, true);
  assert.equal(b[4].items[1].sub[0].t, 'ul', '들여 쓴 하위 목록');
  assert.equal(b[5].start, 1);
  assert.deepEqual(b[6].align, [null, 'right']);
  assert.equal(plainText(b[6].rows[0][1]), '1');
  // 닫지 않은 코드 블록은 끝까지
  assert.equal(parseMarkdown('```\nx\ny').at(0).text, 'x\ny');
});

test('I1·I3: 줄 안 꾸밈 — 코드, 굵게, 기울임, 지움, 링크. 낱말 안의 _와 HTML은 글자 그대로', () => {
  const n = inline('a `b*c*` **굵게** *기울임* ~~지움~~ [링크](https://x.y/z) snake_case_name <b>html</b>');
  const kinds = n.filter((x) => typeof x !== 'string').map((x) => x.t);
  assert.deepEqual(kinds, ['code', 'b', 'i', 's', 'a']);
  assert.equal(n.find((x) => x.t === 'code').text, 'b*c*');
  assert.equal(n.find((x) => x.t === 'a').href, 'https://x.y/z');
  assert.ok(plainText(n).includes('snake_case_name'));
  assert.ok(plainText(n).includes('<b>html</b>'));
});

test('I3: 할 일 상자 n번째 바꾸기(코드 블록 안은 세지 않는다)', () => {
  const src = '- [ ] a\n```\n- [ ] 코드\n```\n> - [ ] 인용 안\n1. [x] b';
  assert.equal(toggleTask(src, 0, true), src.replace('- [ ] a', '- [x] a'));
  assert.equal(toggleTask(src, 1, true), src.replace('> - [ ] 인용 안', '> - [x] 인용 안'));
  assert.equal(toggleTask(src, 2, false), src.replace('1. [x] b', '1. [ ] b'));
  assert.equal(toggleTask(src, 9, true), src, '없는 차례는 그대로');
});

test('I3·I4: 놓은 메모·칸반의 소속 — 가운데가 든 영역, 없으면 null', () => {
  const regs = new Map([['a', { x: 0, y: 0, w: 1000, h: 800 }], ['b', { x: 2000, y: 0, w: 500, h: 500 }]]);
  assert.equal(wsAt({ x: 700, y: 600, w: 360, h: 240 }, regs), 'a', '가운데(880, 720)가 a 안이면 노드가 조금 삐져나가도 a');
  assert.equal(wsAt({ x: 900, y: 700, w: 360, h: 240 }, regs), 'a', '가운데는 밖이어도 영역에 걸치면 그 영역');
  assert.equal(wsAt({ x: 1010, y: 700, w: 360, h: 240 }, regs), null, '떨어져 있으면(margin 0) 소속 없음');
  assert.equal(wsAt({ x: 2100, y: 100, w: 100, h: 100 }, regs), 'b');
  assert.equal(wsAt({ x: 1300, y: 100, w: 100, h: 100 }, regs), null);
  // 영역 바로 옆(margin 안)이면 가까운 영역
  assert.equal(wsAt({ x: 1080, y: 100, w: 360, h: 240 }, regs, 120), 'a', '오른쪽 80 떨어짐');
  assert.equal(wsAt({ x: 1200, y: 100, w: 360, h: 240 }, regs, 120), null, '200 떨어짐');
  assert.equal(wsAt({ x: 1500, y: 100, w: 360, h: 240 }, regs, 120), null, 'b까지 140: margin 밖');
  assert.equal(wsAt({ x: 1560, y: 100, w: 360, h: 240 }, regs, 120), 'b', 'b까지 80');
});

test('I5: 루프 배지 — 돌고 있음·멈춤, 남은 횟수, 다음 시각. 그룹 루프도 그 세션의 것', (tc) => {
  setLanguage('ko'); tc.after(() => setLanguage('en'));
  const now = 1_000_000;
  const l = { loopId: 'r1', target: { kind: 'session', id: 'S' }, status: 'active', runs: 1, stop: { maxRuns: 3 }, trigger: { type: 'interval', everyMs: 60000 }, nextAt: now + 45000 };
  assert.equal(loopBadge(l, now), '⟳ 2회 남음 다음 45초');
  assert.equal(loopBadge({ ...l, status: 'paused', history: [{ kind: 'paused', nextInMs: 30000 }] }, now), '⏸ 2회 남음 이어 가면 30초 뒤');
  assert.equal(loopBadge({ ...l, stop: {}, trigger: { type: 'idle' } }, now), '⟳ 1회 쉴 때');
  assert.equal(loopBadge({ ...l, status: 'done', runs: 3 }, now), '■ 0회 남음');
  const v = { loopId: 'r2', target: { kind: 'session', id: 'Y' }, targets: [{ sessionId: 'S' }], status: 'active' }; // 루프 보기의 대상 목록
  assert.deepEqual(loopsOfSession([l, v, { loopId: 'r3', target: { kind: 'session', id: 'X' } }], 'S').map((x) => x.loopId), ['r1', 'r2']);
  assert.equal(dur(3_723_000), '1시간 2분');
  assert.equal(triggerText({ type: 'interval', everyMs: 60000, immediate: true }), '1분마다(지금 한 번 먼저)');
  assert.equal(stopText({ maxRuns: 2, untilText: 'DONE' }), '2번 · 답에 "DONE"');
  assert.equal(stopText({}), '사람이 멈출 때까지');
});

test('I6: 미션 맵 배치(P32 나무) — 사람이 0열, 지시하는 세션 → 받는 세션, 거르기, 선은 보이는 노드 사이만', () => {
  const graph = {
    nodes: [
      { id: 'human', kind: 'human', column: 0 },
      { id: 's:L', kind: 'session', name: 'lead', category: 'working', column: 0 },
      { id: 's:A', kind: 'session', name: 'a', category: 'needs_you', column: 1 },
      { id: 's:B', kind: 'session', name: 'b', category: 'idle', column: 1 },
      { id: 's:C', kind: 'session', name: 'c', category: 'idle' }, // 선이 없으면 연결 없음 칸
    ],
    edges: [{ id: 'e1', from: 'human', to: 's:A', kind: 'bar' }, { id: 'e3', from: 's:L', to: 's:A', kind: 'role' }, { id: 'e4', from: 's:L', to: 'human', kind: 'x' }, { id: 'e5', from: 's:L', to: 's:B', kind: 'prompt' }],
  };
  const lay = missionLayout(graph);
  const box = (id) => lay.boxes.get(id);
  assert.ok(box('human').x < box('s:L').x && box('s:L').x < box('s:A').x, '사람 → lead → a');
  assert.equal(box('s:A').x, box('s:B').x);
  assert.ok(box('s:A').y < box('s:B').y, '이름 순');
  assert.deepEqual(lay.loose, ['s:C']);
  assert.equal(lay.edges.length, 4, '사람 → a(나무 밖), lead → a, lead → b, lead → 사람(뒤로)');
  assert.match(lay.edges[0].d, /^M/);
  const f = missionLayout(graph, { filter: 'needs_you' });
  assert.deepEqual([...f.boxes.keys()].sort(), ['human', 's:A', 's:L'], '맞는 세션과 그 조상');
  assert.equal(f.boxes.get('s:L').ghost, true);
  assert.ok(f.edges.every((e) => f.boxes.has(e.from) && f.boxes.has(e.to)), '거른 노드의 선은 뺀다');
});
