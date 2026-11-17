// P194 단위 시험: rig 8단계 창 손질 셋 — 자리 표 머리(워크트리 열), 이름 바뀜(renamedFrom) 알림, 미리보기·rig 판의 런처 이름.
// 그리고 건 상태 waiting_owner를 세션 맵 요약 열과 휴대폰 맵이 끝나지 않은 건으로 보인다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launcherChoices, launcherLabel, namedLaunchers } from '../src/renderer/lib/rig-setup.js';
import { caseGroups } from '../src/renderer/lib/rig-map.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
const LAUNCHERS = { launchers: [
  { id: 'lf0a1156d', name: 'Haiku', harness: 'claude' },
  { id: 'lba8bb91a', name: 'Haiku B', harness: 'claude' },
  { id: 'lc84954a2', name: 'CodexAE', harness: 'codex' },
  { id: 'lsh', name: 'Shell', harness: 'shell' },
] };

test('P194 런처 이름: 정의의 launcher가 런처 id든 이름이든 판의 런처 이름, 종류 이름과 모르는 값은 그대로', () => {
  const ch = launcherChoices(LAUNCHERS);
  assert.equal(launcherLabel(ch, 'lf0a1156d'), 'Haiku');
  assert.equal(launcherLabel(ch, 'lc84954a2'), 'CodexAE');
  assert.equal(launcherLabel(ch, 'haiku b'), 'Haiku B', '이름(대소문자 무시)');
  assert.equal(launcherLabel(ch, 'claude'), 'claude', '종류 이름');
  assert.equal(launcherLabel(ch, 'lnope'), 'lnope');
  assert.equal(launcherLabel([], 'lf0a1156d'), 'lf0a1156d');
  assert.equal(launcherLabel(ch, ''), '');
  // 제작 세션의 보고 글 안 런처 id
  assert.equal(namedLaunchers('main(keep, launcher lf0a1156d) + worker(fresh, lba8bb91a), lnope', ch), 'main(keep, launcher Haiku) + worker(fresh, Haiku B), lnope');
  assert.equal(namedLaunchers('xlf0a1156d', ch), 'xlf0a1156d', '낱말 안은 바꾸지 않는다');
  assert.equal(namedLaunchers('그대로', []), '그대로');
  // 미리보기·판의 칸·보고 글이 이름을 쓴다
  const src = read('RigSetup.jsx');
  assert.match(src, /const launcherName = \(choices, id\) => launcherLabel\(choices, id\)/);
  assert.match(src, /namedLaunchers\(v\.text, choices\)/);
  assert.match(src, /\{value && !known && <option value=\{value\}>\{launcherLabel\(choices, value\)\}<\/option>\}/);
  assert.match(src, /if \(!data\) loadLaunchers\(\)/, '런처 목록이 없으면 받아 온다');
});

test('P194 자리 표 머리: 워크트리 열 머리가 줄을 바꾸거나 잘리지 않는다(ko·en)', () => {
  const src = read('RigSetup.jsx');
  assert.match(src, /<th className="mt-rigpanel-cbh">\{t\('rigPanel\.colWorktree'\)\}<\/th>/);
  assert.match(src, /<td className="mt-rigpanel-cb"><input type="checkbox" checked=\{r\.worktree\}/);
  const css = read('styles.css');
  assert.match(css, /\.mt-rigpanel-table th \{ white-space: nowrap; \}/);
  assert.match(css, /\.mt-rigpanel-table th\.mt-rigpanel-cbh, \.mt-rigpanel-table td\.mt-rigpanel-cb \{ width: 1%;/);
  assert.equal(ko.rigPanel.colWorktree, '워크트리'); assert.equal(en.rigPanel.colWorktree, 'Worktree');
});

test('P194 이름 바뀜: 자리 이름과 겹쳐 <이름>-<n>이 되면 띄우기 알림에 한 줄(새 세션 창·레일·휴대폰이 같은 startedText)', () => {
  const src = read('SpawnDialog.jsx');
  assert.match(src, /export const renamedText = \(r\) => \(r && r\.renamedFrom \? t\('rigMore\.spawnRenamed', \{ from: r\.renamedFrom, name: r\.name \}\) : ''\);/);
  assert.match(src, /export const startedText = \(r\) => t\('spawn\.started', .*\) \+ renamedText\(r\);/);
  assert.match(read('Phone.jsx'), /toast\(startedText\(r\)\)/);
  assert.equal(fill(ko.rigMore.spawnRenamed, { from: 'worker', name: 'worker-1' }), ' · rig 자리 이름과 겹쳐 세션 이름을 바꿨습니다: worker → @worker-1');
  assert.equal(fill(en.rigMore.spawnRenamed, { from: 'worker', name: 'worker-1' }), ' · renamed because worker is a rig seat name here: @worker-1');
});

test('P194 waiting_owner 건: 요약 열과 휴대폰 맵에 끝나지 않은 건으로, 주인의 답을 기다림', () => {
  const graph = { rig: { w1: { seats: [], flow: [], cases: [
    { id: 'ca', state: 'waiting_owner', owner: 'lead', ownerSessionId: 's1', activeSeats: [], handoffs: 4, units: [], createdAt: 2 },
    { id: 'cb', state: 'open', owner: 'lead', ownerSessionId: 's1', activeSeats: ['worker'], handoffs: 1, units: [], createdAt: 1 },
    { id: 'cc', state: 'done', owner: 'lead', ownerSessionId: 's1', activeSeats: [], handoffs: 2, units: [], createdAt: 0, closedAt: 3 },
  ] } } };
  const g = caseGroups(graph, (ws, sid) => (sid === 's1' ? 'n1' : null));
  assert.deepEqual(g.open.map((c) => c.id), ['ca', 'cb']);
  assert.equal(g.open[0].go, 'n1', '주인의 카드로 간다');
  assert.deepEqual(g.done.map((c) => c.id), ['cc']);
  assert.match(read('SummaryColumn.jsx'), /c\.state === 'waiting_owner' \? \[t\('rigMore\.caseWaitingOwner'\)/);
  assert.match(read('PhoneMap.jsx'), /c\.state === 'waiting_owner' \? t\('rigMore\.caseWaitingOwner'\)/);
  assert.equal(ko.rigMore.caseWaitingOwner, '주인의 답을 기다림'); assert.equal(en.rigMore.caseWaitingOwner, 'waiting for the owner');
});
