// P302: 위 왼쪽 알약 차례(세션 · 작업 중 · 작업 완료 · 내 몫, 그 뒤 응답 필요 · 문제)와 0 규칙, 사이드바 모두 접기·모두 열기, Hermes 아이콘(OMH), 사이드바 단추 왼쪽 끝
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PEOPLE_PILLS, peoplePills, topFit } from '../src/renderer/lib/top-pills.js';
import { foldAllMap, buildRows } from '../src/renderer/lib/sidebar-tree.js';
import { KINDS, kindOf, logoFor } from '../src/renderer/lib/kinds.js';
import { inboxOf } from '../src/renderer/lib/faces.js';
import { translate } from '../src/renderer/lib/i18n.js';
import { withTitleRoom, fitInset } from '../src/renderer/lib/chrome-inset.js';

const read = (p) => fs.readFileSync(new URL(`../src/renderer/${p}`, import.meta.url), 'utf8');

test('알약 차례: 세션 · 작업 중 · 작업 완료 · 내 몫, 그 뒤 응답 필요 · 문제', () => {
  assert.deepEqual(PEOPLE_PILLS, ['sessions-pill', 'working', 'review', 'decisions', 'inbox', 'problems']);
  const src = read('Chrome.jsx');
  const left = src.slice(src.indexOf('export function TopLeft('), src.indexOf('function useTopFit('));
  const at = ['<SessionsPill', 'role="working"', 'role="review"', '<DecisionPill', '<TurnPill', 'role="problems"'].map((x) => left.indexOf(x));
  assert.ok(at.every((i) => i > 0), at.join(','));
  assert.deepEqual([...at].sort((a, b) => a - b), at);
  assert.ok(left.indexOf('<SidebarButton') < at[0], '사이드바 단추가 맨 앞');
});

test('0 규칙: 세션은 늘, 나머지는 0이면 숨김. 내 몫은 붙잡은 답만 있어도 남는다', () => {
  const zero = peoplePills({ sessions: 0 });
  assert.deepEqual(zero.map((p) => [p.role, p.show]), [['sessions-pill', true], ['working', false], ['review', false], ['decisions', false], ['inbox', false], ['problems', false]]);
  const some = peoplePills({ sessions: 6, working: 2, review: 1, decisions: 3, inbox: 1, problems: 0 });
  assert.deepEqual(some.filter((p) => p.show).map((p) => `${p.role}:${p.n}`), ['sessions-pill:6', 'working:2', 'review:1', 'decisions:3', 'inbox:1']);
  const held = peoplePills({ decisions: 0, decisionsTotal: 2 }).find((p) => p.role === 'decisions');
  assert.deepEqual(held, { role: 'decisions', n: 0, show: true });
  // 창의 코드도 같은 규칙: 작업 중·작업 완료·문제는 수가 있을 때만 그린다(응답 필요·내 몫은 그 알약이 스스로 숨는다)
  const src = read('Chrome.jsx');
  assert.ok(src.includes('{working.length > 0 && <ListPill list={working}'));
  assert.ok(/if \(!n\) return null; \/\/ P214/.test(src));
  assert.ok(read('Decisions.jsx').includes('if (!total) return null;'));
});

test('작업 중 목록: working · shell_running · starting(사이드바 작업 중 묶음과 같다), 최근 움직인 것 먼저', () => {
  const list = [
    { sessionId: 'a', state: 'working', lastActivityAt: 1 }, { sessionId: 'b', state: 'shell_running', lastActivityAt: 3 },
    { sessionId: 'c', state: 'starting', lastActivityAt: 2 }, { sessionId: 'd', state: 'ready' }, { sessionId: 'e', state: 'waiting' }, { sessionId: 'f', state: 'sleeping' },
  ];
  assert.deepEqual(inboxOf(list).working.map((s) => s.sessionId), ['b', 'c', 'a']);
});

test('글은 "이름 수" 꼴(세션 6, 작업 중 2)', () => {
  assert.equal(translate('ko', 'p302.working'), '작업 중'); assert.equal(translate('en', 'p302.working'), 'Working');
  assert.equal(translate('ko', 'top.sessions', { n: 6 }), '세션'); assert.equal(translate('en', 'top.sessions', { n: 6 }), 'Sessions');
  const src = read('Chrome.jsx');
  const pill = src.slice(src.indexOf('function SessionsPill('), src.indexOf('// ---------- 위 오른쪽'));
  assert.ok(pill.indexOf('mt-cp-label') < pill.indexOf('<span className="mono">{count}'), '이름이 먼저, 수가 뒤');
  const list = src.slice(src.indexOf('function ListPill('), src.indexOf('function ConnPill('));
  assert.ok(list.includes('<span className="mt-cp-label">{label}</span> <span className="mono">{list.length}</span>'));
});

test('좁은 창 접기는 새 차례에서도 잰 폭으로 정한다(왼쪽 무리가 창 왼쪽 끝에서 시작)', () => {
  // 0 + 520 + 16 + 600 + 15 = 1151
  assert.equal(topFit({ win: 1151, left: 0, fullL: 520, fullR: 600 }), 'full');
  assert.equal(topFit({ win: 1150, left: 0, fullL: 520, compactL: 300, fullR: 600 }), 'compact');
  assert.equal(topFit({ win: 900, left: 0, fullL: 520, compactL: 300, fullR: 600, compactR: 560 }), 'tight');
  assert.equal(topFit({ win: 820, left: 0, fullL: 520, compactL: 300, fullR: 600, compactR: 560 }), 'stack');
});

test('모두 접기·모두 열기: 폴더(g:ID)와 워크스페이스 전부의 접힘 기억을 바꾸고 다른 키는 둔다', () => {
  const ws = [{ key: 'A' }, { key: 'B' }, { key: 'C' }];
  const groups = [{ id: 'g1', name: 'F', members: ['A', 'B'] }];
  const before = { A: false, 'g:g1': false, OLD: true };
  const folded = foldAllMap(before, ws, groups, true);
  assert.deepEqual(folded, { A: true, B: true, C: true, 'g:g1': true, OLD: true });
  assert.deepEqual(before, { A: false, 'g:g1': false, OLD: true }, '받은 것은 바꾸지 않는다');
  const opened = foldAllMap(folded, ws, groups, false);
  assert.deepEqual(opened, { A: false, B: false, C: false, 'g:g1': false, OLD: true });
  // 접혀도 응답 필요·실행 중 줄은 남는다(P265)
  const sessions = [
    { sessionId: '1', name: 'need', workspaceKey: 'A', state: 'waiting' }, { sessionId: '2', name: 'run', workspaceKey: 'C', state: 'working' },
    { sessionId: '3', name: 'idle', workspaceKey: 'C', state: 'ready' },
  ];
  const rows = buildRows({ workspaces: ws, groups, sessions, collapsed: folded }).rows;
  const shown = rows.filter((r) => r.type === 'session').map((r) => r.s.name);
  assert.deepEqual(shown.sort(), ['need', 'run']);
  assert.ok(rows.find((r) => r.id === 'g:g1') && !rows.find((r) => r.id === 'g:g1').open);
  const all = buildRows({ workspaces: ws, groups, sessions, collapsed: opened }).rows;
  assert.deepEqual(all.filter((r) => r.type === 'session').map((r) => r.s.name).sort(), ['idle', 'need', 'run']);
});

test('사이드바 머리의 두 단추가 접힘 기억을 바꾼다(persist), 글은 모두 접기·모두 열기', () => {
  const sb = read('Sidebar.jsx');
  assert.ok(sb.includes('data-action="fold-all"') && sb.includes('data-action="unfold-all"'));
  assert.ok(sb.includes('onClick={() => foldAll(true)}') && sb.includes('onClick={() => foldAll(false)}'));
  const fn = sb.slice(sb.indexOf('function foldAll('), sb.indexOf('function toggleExtra('));
  assert.ok(fn.includes('foldAllMap(side.collapsed, st.workspaces, st.groups, fold)') && fn.includes('persist()'));
  assert.equal(translate('ko', 'sb2.foldAll'), '모두 접기'); assert.equal(translate('ko', 'sb2.unfoldAll'), '모두 열기');
  assert.equal(translate('en', 'sb2.foldAll'), 'Collapse all'); assert.equal(translate('en', 'sb2.unfoldAll'), 'Expand all');
});

test('Hermes 아이콘 = OMH 앱 아이콘(128px png), 고지에 원본 저장소·경로·커밋·MIT 전문', () => {
  assert.equal(KINDS.hermes.logo, 'assets/kinds/hermes.png');
  assert.equal(kindOf('hermes').logo, 'assets/kinds/hermes.png');
  assert.equal(logoFor(KINDS.hermes, 'waiting'), 'assets/kinds/hermes.png');
  assert.equal(KINDS.hermes.logoBadge, undefined, '타일에 바탕이 있어 레일 단추도 같은 그림');
  const png = fs.readFileSync(new URL('../src/renderer/assets/kinds/hermes.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 128); assert.equal(png.readUInt32BE(20), 128);
  const notice = fs.readFileSync(new URL('../THIRD_PARTY_NOTICES.txt', import.meta.url), 'utf8');
  for (const x of ['https://github.com/rlaope/oh-my-hermes', 'apps/omher/src-tauri/icons/128x128.png', 'rlaope/oh-my-hermes@9da4814', 'Copyright (c) 2026 oh-my-hermes contributors', 'THE SOFTWARE IS PROVIDED "AS IS"']) assert.ok(notice.includes(x), x);
  assert.ok(read('lib/kinds.js').includes('rlaope/oh-my-hermes@9da4814'));
});

test('사이드바 단추는 왼쪽 끝에 붙은 탭(위 왼쪽 무리 left 0)', () => {
  const css = read('styles.css');
  const tail = css.slice(css.indexOf('/* P302: 사이드바 단추는'));
  assert.ok(tail.includes('.mt-cluster.tl { left: 0; }'));
  assert.ok(tail.includes('.mt-cluster.tl > .mt-cp.round[data-action="sidebar"] {') && tail.includes('border-left: 0;'));
});

test('영역 맞추기: 위 여백에 위 막대 높이를 더해 영역 이름표가 위 알약 아래에 보인다(작은 창은 높이 40%까지)', () => {
  const inset = { top: 60, left: 79, right: 74, bottom: 120 };
  assert.deepEqual(withTitleRoom(inset, 48, 1000), { top: 108, left: 79, right: 74, bottom: 120 });
  assert.equal(withTitleRoom(inset, 48, 200).top, 80, '200px 창: 40%');
  assert.equal(withTitleRoom({ top: 90 }, 48, 200).top, 90, '원래 여백보다 줄이지는 않는다');
  assert.equal(withTitleRoom({}, 0, 1000).top, 0);
  // 맞춘 영역의 위 끝이 위 알약 아래 끝(48)보다 이름표 높이 이상 아래
  const vp = fitInset({ x: 0, y: 0, w: 1000, h: 400 }, { width: 1600, height: 1000 }, withTitleRoom(inset, 48, 1000), { fill: 0.92 });
  assert.ok(vp.y >= 48 + 40, String(vp.y));
  const cv = read('Canvas.jsx');
  assert.ok(cv.includes('regionInset(), { minZoom: 0.05, maxZoom: 1 })'), '전체 보기(처음 열기 포함)');
  assert.ok(cv.includes('st.navigateToRect = (r, duration = 250) => { const el = wrapRef.current; const vp = fitInset(r, { width: el.clientWidth, height: el.clientHeight }, regionInset()'), '워크스페이스·폴더로 가기');
});
