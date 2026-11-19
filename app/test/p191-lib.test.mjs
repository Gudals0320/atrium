// P191 단위 시험: 판 안에서 rig 만들기와 고치기(lib/rig-setup.js). 대화상자 단계와 조건(말로, 미리보기 자료, 앉히기 선택. P228: 틀 길은 세 질문으로 바뀌어 p228-lib.test.mjs),
// rig 판 표 편집과 저장 자료(세 칸), 잠금, 원격은 보기만. 판 API는 가짜(P190 계약 모양)로 돌린다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  menuEntry, launcherChoices, wizardInit, wizardPickDescribe, wizardBack, wizardCanNext,
  wizardRequest, wizardAfterRequest, wizardOnBuilder, wizardAfterEnable, wizardSetSeat, builderView, keepSeats, seatCandidates, seatActions,
  previewModel, arrowLabel, seatList, tableFromDef, tableEdit, tableAdd, tableRemove, rowLocked, partLocked, canRemove, tableToSave, tableDirty, canEdit,
} from '../src/renderer/lib/rig-setup.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const WS = 'C:/w/new';

// 옛 계약 모양의 3자리 틀(P228부터 판은 만들지 않지만 그 정의는 그대로 읽고 표로 고친다)
const TEMPLATES = [
  { id: 'main-worker', title: 'Main + worker', desc: '', seats: { main: { session: 'keep' }, worker: { session: 'fresh' } }, flow: [{ from: 'main', on: 'assign', to: 'worker' }, { from: 'worker', on: 'ok', to: 'main' }], results: ['ok', 'failed'] },
  { id: 'main-worker-reviewer', title: 'Main + worker + reviewer', desc: '', seats: { main: { session: 'keep' }, worker: { session: 'fresh' }, reviewer: { session: 'fresh' } },
    flow: [{ from: 'main', on: 'assign', to: 'worker' }, { from: 'worker', on: 'ok', to: 'reviewer' }, { from: 'reviewer', on: 'rejected', to: 'worker', max: 2, else: 'main' }, { from: 'reviewer', on: 'ok', to: 'main' }], results: ['ok', 'failed', 'rejected'] },
  { id: 'main-worker-reviewer-worktree', title: '… worktree', desc: '', seats: { main: { session: 'keep' }, worker: { session: 'fresh', worktree: true }, reviewer: { session: 'fresh' } }, flow: [], results: ['ok'] },
];
const LAUNCHERS = { launchers: [{ id: 'l-claude', name: 'Claude', harness: 'claude' }, { id: 'l-codex', name: 'Codex', harness: 'codex' }, { id: 'l-sh', name: 'Shell', harness: 'shell' }, { id: 'l-cmd', name: 'Cmd', harness: 'command' }] };

// 가짜 판 API(P190 계약): 부른 것을 적고, rig.json을 기억한다
function fakeApi() {
  const calls = [];
  const st = { def: null, enabled: false, builder: null, seated: {}, n: 0, locked: [] };
  const get = () => ({ status: !st.def ? 'none' : st.enabled ? 'on' : 'off', definition: st.def, versionN: st.n || null, locked: st.locked, openCases: 0, hooks: [], tools: [], cycles: [], defaultLauncher: 'l-codex', seated: st.seated, builder: st.builder });
  const api = {
    calls, st,
    async call(m, p) {
      calls.push([m, p]);
      if (m === 'rig.get') return get();
      if (m === 'rig.describe') { st.builder = { session: 'b1', name: 'rig-builder', state: 'working' }; return { session: 'b1', name: 'rig-builder' }; }
      if (m === 'rig.enable') { assert.equal(p.confirm, true); st.enabled = true; return {}; }
      if (m === 'rig.seat') { st.seated[p.seat] = [{ sessionId: p.session, name: p.session }]; return {}; }
      if (m === 'rig.spawnSeat') { st.seated[p.seat] = [{ sessionId: 'new', name: p.seat }]; return { session: 'new', name: p.seat }; }
      if (m === 'rig.save') { st.def = { ...st.def, seats: p.seats, flow: p.flow, results: p.results }; st.n++; return { ok: true, versionN: st.n }; }
      throw new Error(`없는 메서드 ${m}`);
    },
  };
  return api;
}

test('P191: 이름표 메뉴 — 정의가 없으면 만들기, 있으면 보기·고치기, 원격은 보기만', () => {
  assert.equal(menuEntry(null), null);
  assert.equal(menuEntry({ state: 'error' }), null);
  assert.equal(menuEntry({ state: 'none' }), 'create');
  for (const s of ['off', 'on', 'invalid']) assert.equal(menuEntry({ state: s }), 'view');
  assert.equal(menuEntry({ state: 'none' }, { remote: true }), null, '원격 기기에는 만들기가 없다');
  assert.equal(menuEntry({ state: 'on' }, { remote: true }), 'view');
  assert.equal(canEdit({ remote: true }), false);
  assert.equal(canEdit({}), true);
});

test('P191: 런처 목록에서 셸·명령 런처는 뺀다', () => {
  assert.deepEqual(launcherChoices(LAUNCHERS).map((c) => c.id), ['l-claude', 'l-codex']);
  assert.deepEqual(launcherChoices(null), []);
});

test('P191: 대화상자 — 말로 길(글 → rig.describe → 만드는 중 → 정의가 생기면 미리보기), 실패·멈춤은 남는다', async () => {
  const api = fakeApi();
  let w = wizardPickDescribe(wizardInit({ defaultLauncher: 'l-codex' }));
  assert.equal(w.step, 'describe');
  assert.equal(w.builderLauncher, 'l-codex', '제작 세션 런처 기본값');
  assert.equal(wizardCanNext(w), false, '글이 없으면 막는다');
  w = { ...w, text: '  메인과 워커  ' };
  assert.equal(wizardCanNext(w), true);
  const req = wizardRequest(w, WS);
  assert.deepEqual(req, { method: 'rig.describe', params: { workspace: WS, text: '메인과 워커', launcher: 'l-codex' } });
  w = wizardAfterRequest(w, await api.call(req.method, req.params));
  assert.equal(w.step, 'building');
  assert.equal(w.builder.name, 'rig-builder');
  // 아직 일하는 중이면 남는다
  assert.equal(wizardOnBuilder(w, { state: 'working' }, { state: 'none' }).step, 'building');
  // 실패로 끝나고 정의가 없으면 남아서 까닭을 보인다
  const f = wizardOnBuilder(w, { state: 'done', result: 'failed', text: '검사 실패' }, { state: 'invalid' });
  assert.equal(f.step, 'building');
  assert.deepEqual(builderView(f.builder), { state: 'failed', name: 'rig-builder', session: 'b1', text: '검사 실패' });
  assert.equal(builderView({ state: 'stopped', why: '보고 없음' }).state, 'stopped');
  assert.equal(builderView(null), null);
  // 맞는 정의가 생기고(꺼짐) 끝났으면 미리보기로
  const ok = wizardOnBuilder(w, { state: 'done', result: 'ok' }, { state: 'off' });
  assert.equal(ok.step, 'preview');
  // 다른 단계에서는 소식을 무시한다
  assert.equal(wizardOnBuilder({ step: 'seat' }, { state: 'done' }, { state: 'on' }).step, 'seat');
});

test('P191: 다시 연 대화상자 — 꺼진 정의는 요약부터, 켜진 것은 앉히기부터', () => {
  assert.equal(wizardInit({ status: { state: 'off' } }).step, 'preview');
  assert.equal(wizardInit({ status: { state: 'on' } }).step, 'seat');
  assert.equal(wizardInit({ status: { state: 'none' } }).step, 'ask', 'P228: 정의가 없으면 세 질문부터');
  assert.equal(wizardBack(wizardPickDescribe(wizardInit({}))).step, 'ask');
});

test('P191: 앉히기 — 고를 세션(같은 워크스페이스, 에이전트, 살아 있음, 다른 자리에 없음)과 새로 띄우기·건너뛰기', () => {
  const ss = [
    { sessionId: 'a', name: 'a', workspaceKey: WS, kind: 'claude', state: 'idle' },
    { sessionId: 'b', name: 'b', workspaceKey: WS, kind: 'shell', state: 'idle' },
    { sessionId: 'c', name: 'c', workspaceKey: 'other', kind: 'codex', state: 'idle' },
    { sessionId: 'd', name: 'd', workspaceKey: WS, kind: 'codex', state: 'exited' },
    { sessionId: 'e', name: 'e', workspaceKey: WS, kind: 'codex', state: 'working', rigSeat: 'worker' },
    { sessionId: 'f', name: 'f', workspaceKey: WS, kind: 'codex', state: 'idle', rigSeat: 'main' },
  ];
  assert.deepEqual(seatCandidates(ss, WS, 'main').map((x) => [x.sessionId, x.current]), [['a', false], ['f', true]]);
  assert.deepEqual(seatActions(WS, { main: { kind: 'spawn' }, x: { kind: 'skip' }, y: null, z: { kind: 'session' } }), [{ method: 'rig.spawnSeat', params: { workspace: WS, seat: 'main' } }]);
  assert.deepEqual(keepSeats({ seats: [{ name: 'main', session: 'keep', launcher: 'l' }, { name: 'w', session: 'fresh' }] }, { main: [{ sessionId: 'f', name: 'f' }] }), [{ name: 'main', launcher: 'l', seated: { sessionId: 'f', name: 'f' } }]);
});

test('P191: 미리보기 자료 — 자리 상자(차례, keep·fresh), 흐름 화살표(값, max, else, 되돌아감)', () => {
  const def = { ...TEMPLATES[1], seats: { reviewer: { session: 'fresh', launcher: 'l-codex' }, worker: { session: 'fresh', launcher: 'l-claude', worktree: true }, main: { session: 'keep', launcher: 'l-codex' } } };
  const m = previewModel(def);
  // assign을 받는 worker는 main 뒤
  const idx = (n) => m.seats.findIndex((s) => s.name === n);
  assert.ok(idx('worker') > idx('main'));
  assert.equal(m.seats.find((s) => s.name === 'main').mode, 'keep');
  assert.equal(m.seats.find((s) => s.name === 'worker').worktree, true);
  assert.equal(m.arrows.length, 4);
  const rej = m.arrows.find((a) => a.on === 'rejected');
  assert.deepEqual([rej.from, rej.to, rej.max, rej.else], ['reviewer', 'worker', 2, 'main']);
  assert.equal(arrowLabel(rej), 'rejected ≤2 → main');
  assert.equal(arrowLabel(m.arrows.find((a) => a.on === 'assign')), 'assign');
  assert.ok(m.arrows.every((a) => typeof a.d === 'string' && a.d.startsWith('M')));
  assert.deepEqual(m.results, ['ok', 'failed', 'rejected']);
  assert.ok(m.width > 0 && m.height > 0);
  assert.deepEqual(previewModel(null).seats, []);
  // rig.status 모양(자리 배열, to 배열)도 받는다
  const m2 = previewModel({ seats: [{ name: 'a', session: 'keep' }, { name: 'b' }], flow: [{ from: 'a', on: 'assign', to: ['b'] }] });
  assert.equal(m2.arrows.length, 1);
  // 같은 방향의 상한 없는 줄은 한 화살표(값 이름을 모은다)
  const m3 = previewModel({ seats: { main: { session: 'keep' }, worker: {} }, flow: [{ from: 'main', on: 'assign', to: 'worker' }, { from: 'worker', on: 'ok', to: 'main' }, { from: 'worker', on: 'failed', to: 'main' }] });
  assert.deepEqual(m3.arrows.map((a) => a.on), ['assign', 'ok · failed']);
  assert.deepEqual(m3.arrows[1].ons, ['ok', 'failed']);
  assert.deepEqual(seatList({ seats: [{ name: 'a' }] }).map((s) => s.name), ['a']);
});

const DEF = {
  name: 'x',
  seats: { main: { launcher: 'l-codex', session: 'keep' }, worker: { launcher: 'l-claude', session: 'fresh', worktree: true, tools: ['judge'], max_live: 2 }, reviewer: { launcher: 'l-codex', session: 'fresh' } },
  flow: [{ from: 'main', on: 'assign', to: 'worker' }, { from: 'worker', on: 'ok', to: 'reviewer' }, { from: 'reviewer', on: 'rejected', to: 'worker', max: 2, else: 'main' }, { from: 'reviewer', on: 'ok', to: 'main' }],
  results: ['ok', 'failed', 'rejected'],
  hooks: [{ at: 'done', run: ['node', 'h.js'] }],
};

test('P191: rig 판 표 — 정의 → 표 → 저장 자료가 세 칸 그대로(다른 자리 칸은 지킨다)', () => {
  const tb = tableFromDef(DEF);
  assert.deepEqual(tb.seats.map((r) => [r.name, r.session, r.launcher, r.worktree]), [['main', 'keep', 'l-codex', false], ['worker', 'fresh', 'l-claude', true], ['reviewer', 'fresh', 'l-codex', false]]);
  assert.deepEqual(tb.flow.map((r) => [r.from, r.on, r.to, r.max, r.else]), [['main', 'assign', 'worker', '', ''], ['worker', 'ok', 'reviewer', '', ''], ['reviewer', 'rejected', 'worker', '2', 'main'], ['reviewer', 'ok', 'main', '', '']]);
  const d = tableToSave(tb);
  assert.deepEqual(Object.keys(d), ['seats', 'flow', 'results'], '저장은 세 칸만');
  const noNull = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v === null ? undefined : v)));
  assert.deepEqual(noNull(d.seats), DEF.seats, '표에 없는 칸(tools, max_live)도 그대로');
  assert.deepEqual(Object.keys(d.seats), ['main', 'worker', 'reviewer'], '지키는 자리는 모두 보낸다(rig.save는 빠진 자리를 지운다)');
  assert.equal(d.seats.main.worktree, null, 'worktree를 끈 자리는 null(rig.save가 그 칸을 뺀다)');
  assert.deepEqual(d.flow, DEF.flow);
  assert.deepEqual(d.results, DEF.results);
  assert.equal(tableDirty(tb, tb), false);
});

test('P191: rig 판 표 — 런처·max 바꾸기, 줄 더하기·지우기, 검사', () => {
  let tb = tableFromDef(DEF);
  const base = tb;
  tb = tableEdit(tb, 'seats', tb.seats[1].key, 'launcher', 'l-codex');
  tb = tableEdit(tb, 'flow', tb.flow[2].key, 'max', '3');
  assert.equal(tableDirty(tb, base), true);
  let d = tableToSave(tb);
  assert.equal(d.seats.worker.launcher, 'l-codex');
  assert.equal(d.flow[2].max, 3);
  // 줄 더하기
  tb = tableAdd(tb, 'seats', { launcher: 'l-claude' });
  assert.equal(tableToSave(tb).error.key, 'rigPanel.errSeatName', '빈 이름은 저장 전에 막는다');
  const nk = tb.seats[3].key;
  tb = tableEdit(tb, 'seats', nk, 'name', 'main');
  assert.equal(tableToSave(tb).error.key, 'rigPanel.errSeatDup');
  tb = tableEdit(tb, 'seats', nk, 'name', 'tester');
  d = tableToSave(tb);
  assert.deepEqual(d.seats.tester, { launcher: 'l-claude', session: 'fresh', worktree: null });
  tb = tableEdit(tb, 'seats', tb.seats[1].key, 'worktree', false);
  assert.equal(tableToSave(tb).seats.worker.worktree, null, '워크트리를 끄면 null');
  tb = tableEdit(tb, 'seats', tb.seats[1].key, 'worktree', true);
  tb = tableAdd(tb, 'flow');
  assert.equal(tableToSave(tb).error.key, 'rigPanel.errFlow');
  const fk = tb.flow[4].key;
  tb = tableEdit(tb, 'flow', fk, 'from', 'worker'); tb = tableEdit(tb, 'flow', fk, 'on', 'failed'); tb = tableEdit(tb, 'flow', fk, 'to', 'tester, main');
  assert.deepEqual(tableToSave(tb).flow[4], { from: 'worker', on: 'failed', to: ['tester', 'main'] });
  tb = tableEdit(tb, 'flow', fk, 'max', '0');
  assert.equal(tableToSave(tb).error.key, 'rigPanel.errMax');
  tb = tableRemove(tb, 'flow', fk);
  tb = tableAdd(tb, 'results'); tb = tableEdit(tb, 'results', tb.results[3].key, 'value', 'skipped');
  assert.deepEqual(tableToSave(tb).results, ['ok', 'failed', 'rejected', 'skipped']);
  tb = tableRemove(tb, 'seats', nk);
  assert.equal(tableToSave(tb).seats.tester, undefined);
});

test('P191: 잠금 — 보호 포인터가 가리키는 줄·칸은 잠그고, 잠긴 줄 앞의 줄은 못 지운다', () => {
  const tb = tableFromDef(DEF);
  const locked = ['/seats/main', '/flow/2/max'];
  assert.equal(rowLocked(locked, 'seats', tb.seats[0]), true);
  assert.equal(rowLocked(locked, 'seats', tb.seats[1]), false);
  assert.equal(rowLocked(locked, 'flow', tb.flow[2], 'max'), true);
  assert.equal(rowLocked(locked, 'flow', tb.flow[2], 'to'), false, '다른 칸은 고칠 수 있다');
  assert.equal(rowLocked(locked, 'flow', tb.flow[2]), true, '줄 단위로 물으면 잠김 표시');
  assert.equal(canRemove(locked, tb, 'seats', tb.seats[0]), false);
  assert.equal(canRemove(locked, tb, 'seats', tb.seats[2]), true);
  assert.equal(canRemove(locked, tb, 'flow', tb.flow[0]), false, '잠긴 줄 앞을 지우면 차례가 밀린다');
  assert.equal(canRemove(locked, tb, 'flow', tb.flow[3]), true);
  assert.equal(partLocked(['/flow'], 'flow'), true);
  assert.equal(partLocked(['/flow/1'], 'flow'), false);
  assert.equal(rowLocked(['/results'], 'results', tb.results[0]), true);
  assert.equal(rowLocked([''], 'seats', tb.seats[2]), true, '정의 전체');
  const added = tableAdd(tb, 'flow');
  assert.equal(rowLocked(['/flow/2'], 'flow', added.flow[4]), false, '새 줄은 잠그지 않는다');
  assert.equal(rowLocked(['/seats/a~1b'], 'seats', { orig: 'a/b' }), true, '포인터 이스케이프');
});

test('P191: 가짜 API로 표 저장 → 새 버전', async () => {
  const api = fakeApi();
  api.st.def = DEF; api.st.n = 3;
  let tb = tableFromDef((await api.call('rig.get', {})).definition);
  tb = tableEdit(tb, 'flow', tb.flow[2].key, 'max', '1');
  const r = await api.call('rig.save', { workspace: WS, ...tableToSave(tb) });
  assert.equal(r.versionN, 4);
  assert.equal(api.st.def.flow[2].max, 1);
  assert.deepEqual(api.st.def.hooks, DEF.hooks, '다른 칸은 그대로');
  assert.deepEqual(Object.keys(api.calls[1][1]).sort(), ['flow', 'results', 'seats', 'workspace']);
});

test('P191: 창 코드 — 원격은 보기만, 이름표 메뉴, 판 이벤트 rig.builder, 두 사전', () => {
  const src = read('RigSetup.jsx');
  assert.match(src, /if \(remote\) return null; \/\/ 원격 기기에는 만들기가 없다/);
  assert.match(src, /const edit = canEdit\(\{ remote \}\)/);
  for (const a of ['rig-save', 'rig-say-send', 'rig-panel-setup', 'rig-add-seat', 'rig-add-flow']) assert.match(src, new RegExp(`\\{edit && [^\\n]*data-action="${a}"|data-action="${a}"`), a);
  assert.match(src, /api\.on\(n, /);
  assert.match(src, /'rig\.builder'/);
  const reg = read('Regions.jsx');
  assert.match(reg, /menuEntry\(rig, \{ remote: remoteView\(\) \}\) === 'create'/);
  assert.match(reg, /kind: 'rigpanel'/);
  const main = read('main.jsx');
  assert.match(main, /d\.kind === 'rigcreate'/);
  assert.match(main, /d\.kind === 'rigpanel'/);
  for (const d of [en, ko]) {
    for (const k of ['menuCreate', 'menuView', 'createTitle', 'seatGo']) assert.ok(d.rigSetup[k], k);
    for (const k of ['ok', 'failed', 'stopped', 'working']) assert.ok(d.rigSetup.builder[k], k);
    for (const k of ['none', 'off', 'on', 'invalid', 'loading']) assert.ok(d.rigPanel.st[k], k);
    for (const k of ['errSeatName', 'errSeatDup', 'errLauncher', 'errFlow', 'errMax']) assert.ok(d.rigPanel[k], k);
  }
});

test('P191(P190 모양): 멈춤 까닭은 stopWhy, rig.builder 이벤트로 만드는 중이 넘어간다', () => {
  assert.deepEqual(builderView({ state: 'stopped', stopReason: 'idle_no_done', stopWhy: '보고 없이 쉰다', text: null, name: 'rig-builder' }).text, '보고 없이 쉰다');
  assert.equal(builderView({ state: 'done', result: 'failed', text: 'x' }).state, 'failed');
  assert.equal(builderView({ state: 'done', result: 'ok', text: 'y' }).state, 'ok');
  // rig.builder 이벤트 모양(working → done)으로 building이 넘어간다
  let w = { step: 'building', builder: { session: 'b1', name: 'rig-builder', state: 'working' } };
  w = wizardOnBuilder(w, { workspace: WS, session: 'b1', state: 'working' }, { state: 'none' });
  assert.equal(w.step, 'building');
  w = wizardOnBuilder(w, { workspace: WS, session: 'b1', state: 'done', result: 'ok', definitionStatus: 'off' }, { state: 'off' });
  assert.equal(w.step, 'preview');
});
