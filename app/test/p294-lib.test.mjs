// P294: 위 알약 나누기(왼쪽 = 사람이 볼 것, 오른쪽 = 상태), 워크스페이스 알약 줄 없앰, ←·→ 미할당, 좁은 창 접기 규칙, 휴대폰 내 몫 시트 줄이기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boardArrowKey } from '../src/renderer/lib/keys.js';
import { topFit, PEOPLE_PILLS, STATUS_PILLS } from '../src/renderer/lib/top-pills.js';
import { translate } from '../src/renderer/lib/i18n.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const read = (p) => fs.readFileSync(new URL(`../src/renderer/${p}`, import.meta.url), 'utf8');
const BODY = { tagName: 'BODY', nodeType: 1, closest: () => null };
const PANE = { tagName: 'DIV', nodeType: 1, isContentEditable: false, closest: (s) => (s.includes('.mt-stage') ? PANE : null) };

test('←·→는 판에서 아무것도 하지 않는다(↑·↓는 그대로)', () => {
  for (const t of [BODY, PANE, null]) {
    assert.equal(boardArrowKey({ key: 'ArrowLeft', target: t }), null);
    assert.equal(boardArrowKey({ key: 'ArrowRight', target: t }), null);
    assert.equal(boardArrowKey({ key: 'ArrowDown', target: t }), 'command');
    assert.equal(boardArrowKey({ key: 'ArrowUp', target: t }), 'search');
  }
  assert.ok(!/stepWorkspace|prevWs|nextWs/.test(read('lib/keys.js')));
  assert.ok(!/stepWorkspace|prevWs|nextWs/.test(read('main.jsx')));
  assert.equal(en.boardKeys.ws, undefined); assert.equal(ko.boardKeys.ws, undefined);
  assert.ok(!/boardKeys\.ws/.test(read('Chrome.jsx')));
});

test('위 왼쪽 = 응답 필요·내 몫·작업 완료·문제·세션, 위 오른쪽 = 연결·기기·메모리·사용량·변경 내역·설정', () => {
  const src = read('Chrome.jsx');
  const left = src.slice(src.indexOf('export function TopLeft('), src.indexOf('function useTopFit('));
  const right = src.slice(src.indexOf('export function TopRight('), src.indexOf('// ---------- 도구 레일'));
  const order = ['<SessionsPill', 'role="review"', '<DecisionPill', '<TurnPill', 'role="problems"'].map((x) => left.indexOf(x)); // P302 차례
  assert.ok(order.every((i) => i > 0), order.join(','));
  assert.deepEqual([...order].sort((a, b) => a - b), order, '이 차례로');
  for (const x of ['<TurnPill', '<DecisionPill', 'ListPill', '<SessionsPill']) assert.ok(!right.includes(x), x);
  const rorder = ['<ConnPill', '<DevicesPill', '<ResourcePill', '<UsagePill', 'data-action="changes"', 'data-action="settings-open"'].map((x) => right.indexOf(x));
  assert.ok(rorder.every((i) => i > 0), rorder.join(','));
  assert.deepEqual([...rorder].sort((a, b) => a - b), rorder);
  assert.deepEqual(PEOPLE_PILLS, ['sessions-pill', 'working', 'review', 'decisions', 'inbox', 'problems']); // P302
  assert.equal(STATUS_PILLS[0], 'conn');
  // 세션 수는 세션 알약으로 옮겼고, 연결 알약은 연결이 좋으면 점만
  assert.ok(src.includes('data-role="sessions-pill"') && src.includes("setMissionOpen(!mission)"));
  const conn = src.slice(src.indexOf('function ConnPill('), src.indexOf('function ResourcePill('));
  assert.ok(conn.includes("' dot-only'") && !conn.includes("t('top.sessions'"));
});

test('워크스페이스 알약 줄(탭·묶음 칩·+n·+)은 없고, 새 워크스페이스 열기는 사이드바 워크스페이스 메뉴에 있다', () => {
  const src = read('Chrome.jsx');
  for (const x of ['data-role="workspaces"', 'WorkspaceTabs', 'WsChip', 'MoreTabs', 'data-action="ws-open"', 'mt-seg-plus', 'selectWorkspace']) assert.ok(!src.includes(x), x);
  const sb = read('Sidebar.jsx');
  assert.ok(/item\('menu-open-ws', t\('p294\.openWs'\), \(\) => openDialog\(\{ kind: 'wsopen' \}\)\)/.test(sb));
  assert.ok(sb.includes("data-action=\"go-ws\""), '사이드바 이름을 누르면 그 워크스페이스로');
  assert.equal(translate('ko', 'p294.openWs'), '새 프로젝트 열기…');
  assert.equal(translate('en', 'p294.openWs'), 'Open another workspace…');
});

test('좁은 창 접기: 모두 들면 full, 왼쪽 글을 숨겨 들면 compact, 그래도 모자라면 tight, 그래도 모자라면 stack', () => {
  // 처음에는 펼쳐 잰다
  assert.equal(topFit({ win: 1600 }), 'full');
  assert.equal(topFit({ win: 1600, fullL: 500 }), 'full');
  // 87 + 500 + 16 + 600 + 15 = 1218
  assert.equal(topFit({ win: 1600, fullL: 500, fullR: 600 }), 'full');
  assert.equal(topFit({ win: 1218, fullL: 500, fullR: 600 }), 'full', '딱 맞으면 펼친다');
  assert.equal(topFit({ win: 1217, fullL: 500, fullR: 600 }), 'compact', '모자라고 접은 폭을 모르면 접어 잰다');
  assert.equal(topFit({ win: 1000, fullL: 500, compactL: 280, fullR: 600 }), 'compact', '87 + 280 + 16 + 600 + 15 = 998');
  assert.equal(topFit({ win: 900, fullL: 500, compactL: 280, fullR: 600 }), 'tight', '오른쪽을 접은 폭을 모르면 접어 잰다');
  assert.equal(topFit({ win: 900, fullL: 500, compactL: 280, fullR: 600, compactR: 500 }), 'tight', '87 + 280 + 16 + 500 + 15 = 898');
  assert.equal(topFit({ win: 760, fullL: 500, compactL: 297, fullR: 420, compactR: 383 }), 'stack', '사이드바를 연 좁은 판 칸: 왼쪽 무리를 아래 줄로');
  // 창이 넓어지면 다시 펼친다(잰 폭을 담아 둔다)
  assert.equal(topFit({ win: 1400, fullL: 500, compactL: 280, fullR: 600 }), 'full');
  assert.equal(topFit({ win: 1050, left: 87, right: 15, gap: 16, fullL: 400, compactL: 250, fullR: 560 }), 'compact', '87 + 400 + 16 + 560 + 15 = 1078 > 1050');
});

test('좁은 창 접기의 모양: 왼쪽 알약 글은 .mt-cp-label(접으면 숨김, title에 남음), 오른쪽은 흐린 글을 숨김', () => {
  const css = read('styles.css');
  assert.ok(css.includes('.mt-cluster.tl.compact .mt-cp-label { display: none; }'));
  assert.ok(css.includes('.mt-cluster.tr.compact .mt-cp .dim { display: none; }'));
  assert.ok(css.includes('.mt-cluster.tl.stack { top: calc(17px + var(--chrome-h) + 8px); }'), '내린 줄은 오른쪽 무리 아래');
  assert.ok(css.includes('.mt-cluster.tl .mt-dropdown { left: 0; right: auto; }'), '왼쪽 알약의 펼침은 오른쪽으로 편다');
  const src = read('Chrome.jsx');
  assert.ok(src.includes("<span className=\"mt-cp-label\">{t('top.turn')}</span>") && src.includes('title={label}'));
  assert.ok(read('Decisions.jsx').includes("<span className=\"mt-cp-label\">{t('userTasks.pill')}</span>"));
  assert.ok(/data-fit=\{fit\}/.test(src) && src.includes("tr.classList.toggle('compact', next === 'tight' || next === 'stack')") && src.includes("'--mt-tl-bottom'"));
});

test('휴대폰 내 몫 시트: 글·여백을 줄이되 누를 것은 36px, 입력칸 글은 16px(iOS 확대 막기)', () => {
  const css = read('styles.css');
  const tail = css.slice(css.indexOf('/* P294: 휴대폰 내 몫 시트를 작게'));
  assert.ok(tail.length > 0);
  assert.ok(tail.includes('.mt-dc-sheet .mt-dc-input { height: 36px; padding: 0 8px; font-size: 16px; }'));
  for (const m of tail.matchAll(/min-height: (\d+)px/g)) assert.ok(Number(m[1]) >= 36, m[0]);
  assert.ok(tail.includes('.mt-dc-sheet .mt-ut-acts .mt-btn.ghost {'), '미루기·무시는 작은 글 단추');
  assert.ok(tail.includes('.mt-dc-sheet .mt-ut-last > .mt-dc-answer, .mt-dc-sheet .mt-ut-last > .mt-ut-acts { display: contents; }'), '확인·결정: 미루기·무시를 마지막 동작 줄에');
  const dec = read('Decisions.jsx');
  assert.equal((dec.match(/mt-ut-last/g) || []).length >= 2, true, '확인·결정 두 곳');
  assert.ok(dec.includes('function useMemoRow(') && tail.includes('.mt-ut-last.memo-row .mt-ut-ok'), '확인 카드가 한 줄에 안 들면 미루기·무시를 메모 줄에');
});
