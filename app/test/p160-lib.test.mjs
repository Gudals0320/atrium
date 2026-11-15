// P160 단위 시험: 휴대폰 세션 맵(lib/phone-lineage.js)이 PC 세션 맵(lib/mission-lineage.js lineageLayout)과 같은 판정으로
// 폴더 > 워크스페이스 > 단계 들여쓰기 목록을 만드는지(동료 붙음, 독립·솔로, 깊이 접기, 다른 워크스페이스 표시), 레일·괄호 길, 알약 차례, 화면 연결과 사전.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineageLayout, applyRelationStub, LINE } from '../src/renderer/lib/mission-lineage.js';
import { phoneLineage, nextOf, railPaths, peerPath, PL } from '../src/renderer/lib/phone-lineage.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const A = 'd:/work/app/.git', B = 'd:/work/docs/.git', C = 'd:/work/lab/.git', D = 'd:/work/loose/.git';
let seq = 0;
const node = (n, ws, parent = null, o = {}) => ({ id: `s:${n}`, kind: 'session', sessionId: `x-${n}`, name: n, workspaceKey: ws, state: 'ready', parentId: parent ? `s:${parent}` : null, createdAt: 100 + seq++, ...o });
const spawn = (nodes) => nodes.filter((n) => n.parentId).map((n) => ({ from: n.parentId, to: n.id, kind: 'spawn', count: 1 }));
const VG = [{ id: 'g1', name: 'Product', members: [A, B] }, { id: 'g2', name: 'Research', members: [C] }];
const flat = (m) => m.folders.flatMap((f) => f.ws.flatMap((w) => w.items.map((it) => ({ ...it, ws: w.key, folder: f.name }))));

test('소속: 폴더(사이드바 차례) > 워크스페이스(폴더 안 차례) > 세션, 폴더 밖은 끝. 폴더 머리 수와 상태 막대는 PC 띠와 같다', () => {
  seq = 0;
  const nodes = [node('lab-1', C), node('lone', D), node('lead', A), node('w1', A, 'lead'), node('doc', B)];
  const lay = lineageLayout({ nodes, edges: spawn(nodes) }, { order: [D, C, B, A], vgroups: VG, noFolder: 'No folder' });
  const m = phoneLineage(lay);
  assert.deepEqual(m.folders.map((f) => f.name), ['Product', 'Research', 'No folder']);
  assert.deepEqual(m.folders[0].ws.map((w) => w.key), [A, B], '폴더 안은 폴더 목록 차례');
  assert.equal(m.folders[2].loose, true);
  for (const f of m.folders) { const b = lay.bands.find((x) => (x.id || null) === (f.id || null)); assert.equal(f.nWs, b.nWs); assert.equal(f.sessions, b.sessions); assert.deepEqual(f.bar, b.bar); }
  assert.equal(m.order.length, nodes.length, '모든 세션이 한 번씩');
  assert.equal(new Set(m.order).size, nodes.length);
});

test('관계: 시작 → 1단계 → 2단계 들여쓰기, 위 세션 다음에 하위(깊이 우선), 레일 위 세션과 종류', () => {
  seq = 0;
  const nodes = [node('lead', A), node('w1', A, 'lead'), node('w1a', A, 'w1'), node('w2', A), node('solo', A)]; // w2는 역할 연결로만 이어진다
  const edges = [...spawn(nodes), { from: 's:lead', to: 's:w2', kind: 'role', label: 'reviewer', count: 2 }];
  const lay = lineageLayout({ nodes, edges }, { order: [A] });
  const it = flat(phoneLineage(lay));
  assert.deepEqual(it.map((x) => [x.id, x.depth, x.kind]), [['s:lead', 0, 'tree'], ['s:w1', 1, 'tree'], ['s:w1a', 2, 'tree'], ['s:w2', 1, 'tree'], ['s:solo', 0, 'solo']]);
  const by = new Map(it.map((x) => [x.id, x]));
  assert.equal(by.get('s:w1').up, 's:lead'); assert.equal(by.get('s:w1a').up, 's:w1'); assert.equal(by.get('s:lead').up, null);
  assert.equal(by.get('s:w2').rel, 'role', '역할 선은 역할 레일');
  assert.equal(by.get('s:w1').rel, 'spawn');
  assert.ok(by.get('s:lead').lead && !by.get('s:w1a').lead, '하위가 있는 세션만 리드');
  assert.equal(by.get('s:w1a').ind, 2);
  // PC 카드 깊이와 같다
  for (const x of it) assert.equal(x.kind === 'solo' ? -1 : x.depth, lay.cards.get(x.id).depth);
});

test('동료는 짝 바로 다음에 붙고 괄호 짝이 된다. 독립(계보만)은 시작 단계, 솔로는 워크스페이스 끝(PC와 같은 판정, P157)', () => {
  seq = 0;
  const nodes = [node('lead', A), node('w1', A, 'lead'), node('w2', A, 'lead'), node('mate', A), node('ind', A, 'lead'), node('alone', A), node('caller', A, null, { closedKids: 2 })];
  const g = applyRelationStub({ nodes, edges: spawn(nodes) }, [{ a: 'x-w1', b: 'x-mate', relation: 'peer' }, { a: 'x-lead', b: 'x-ind', relation: 'none' }]);
  const lay = lineageLayout(g, { order: [A] });
  const m = phoneLineage(lay);
  const w = m.folders[0].ws[0];
  const ids = w.items.map((x) => x.id);
  assert.equal(ids[ids.indexOf('s:w1') + 1], 's:mate', '동료는 짝 바로 다음(곁)');
  assert.deepEqual(w.peers, [['s:w1', 's:mate']]);
  const by = new Map(w.items.map((x) => [x.id, x]));
  assert.equal(by.get('s:mate').up, null, '동료는 위계 레일이 없다');
  assert.equal(by.get('s:ind').depth, 0, '독립은 시작 단계');
  assert.equal(by.get('s:ind').kind, 'tree');
  assert.equal(by.get('s:caller').kind, 'tree', '하위를 불렀던 세션은 솔로가 아니다');
  assert.equal(by.get('s:alone').kind, 'solo');
  assert.equal(ids[ids.length - 1], 's:alone', '솔로는 끝');
  assert.ok(w.items.findIndex((x) => x.kind === 'solo') > w.items.findIndex((x) => x.id === 's:caller'));
});

test('깊이 접기: PC FOLD 단계보다 깊은 가지는 "+n단계" 카드에서 멈추고, 편 카드는 그 가지만 끝까지', () => {
  seq = 0;
  const chain = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
  const nodes = chain.map((n, i) => node(n, A, i ? chain[i - 1] : null));
  const g = { nodes, edges: spawn(nodes) };
  const shut = flat(phoneLineage(lineageLayout(g, { order: [A] })));
  assert.equal(shut.length, LINE.FOLD + 1, '시작부터 FOLD 단계까지만 보인다');
  const tip = shut[shut.length - 1];
  assert.equal(tip.id, `s:c${LINE.FOLD}`); assert.equal(tip.fold, chain.length - 1 - LINE.FOLD, '접힌 단계 수');
  const open = flat(phoneLineage(lineageLayout(g, { order: [A], expanded: new Set([tip.id]) })));
  assert.equal(open.length, chain.length);
  assert.equal(open[open.length - 1].depth, chain.length - 1);
  assert.equal(open[open.length - 1].ind, Math.min(chain.length - 1, PL.MAXIND), '들여쓰기는 MAXIND에서 멈춘다');
});

test('다른 워크스페이스의 위 세션에서 온 세션: 1단계에서 시작, "@이름(워크스페이스)에서" 사실, 위 세션은 다른 곳 하위 수', () => {
  seq = 0;
  const nodes = [node('conductor', A), node('docs-sync', B, 'conductor'), node('child', B, 'docs-sync')];
  const lay = lineageLayout({ nodes, edges: spawn(nodes) }, { order: [A, B], vgroups: VG });
  const it = flat(phoneLineage(lay));
  const by = new Map(it.map((x) => [x.id, x]));
  assert.equal(by.get('s:docs-sync').kind, 'away'); assert.equal(by.get('s:docs-sync').depth, 1);
  assert.deepEqual(by.get('s:docs-sync').from, { id: 's:conductor', name: 'conductor', ws: A });
  assert.equal(by.get('s:docs-sync').up, null, '다른 워크스페이스 위 세션으로는 레일을 긋지 않는다(점선 꼬리)');
  assert.equal(by.get('s:child').depth, 2); assert.equal(by.get('s:child').up, 's:docs-sync');
  assert.equal(by.get('s:conductor').away, 1);
  assert.equal(by.get('s:conductor').kind, 'tree', '하위가 다른 워크스페이스에만 있어도 시작 단계(PC와 같다)');
});

test('레일 길: 첫 하위는 위 카드 아래 변에서, 다음 하위는 앞 꺾임에서 이어 내려와 카드 왼쪽 변 앞에서 끝난다(겹치지 않는다)', () => {
  const up = { x: 0, y: 0, w: 300, h: 80 }, k1 = { x: 22, y: 90, w: 278, h: 60 }, k2 = { x: 22, y: 200, w: 278, h: 60 };
  const [d1, d2] = railPaths(up, [k1, k2]);
  assert.equal(d1, 'M8 80 V114 Q8 120 14 120 H20');
  assert.ok(d2.startsWith('M8 114 V224'), d2);
  assert.ok(d2.endsWith('H20'));
  const p = peerPath({ x: 18, y: 0, w: 282, h: 60 }, { x: 18, y: 70, w: 282, h: 60 });
  assert.equal(p.d, 'M302 30 H307 V100 H302');
  assert.deepEqual(p.ends, [[302, 30], [302, 100]]);
});

test('알약 차례: 누를 때마다 그 등급의 다음 카드(목록 차례, 끝에서 처음으로)', () => {
  const tiers = new Map([['a', 'work'], ['b', 'turn'], ['c', 'work'], ['d', 'alert']]);
  const order = ['a', 'b', 'c', 'd'], tierOf = (id) => tiers.get(id);
  assert.equal(nextOf(order, tierOf, ['work']), 'a');
  assert.equal(nextOf(order, tierOf, ['work'], 'a'), 'c');
  assert.equal(nextOf(order, tierOf, ['work'], 'c'), 'a');
  assert.equal(nextOf(order, tierOf, ['turn', 'alert'], 'b'), 'd');
  assert.equal(nextOf(order, tierOf, ['review']), null);
});

test('세는 것: 응답 필요·오류·작업 중·작업 완료(판 요약 등급)', () => {
  seq = 0;
  const nodes = [node('a', A), node('b', A), node('c', A), node('d', A)];
  const lay = lineageLayout({ nodes, edges: [] }, { order: [A] });
  const tiers = new Map([['s:a', 'turn'], ['s:b', 'work'], ['s:c', 'review'], ['s:d', 'alert']]);
  assert.deepEqual(phoneLineage(lay, { tiers }).counts, { turn: 1, alert: 1, work: 1, review: 1, all: 4 });
  assert.deepEqual(phoneLineage(null).folders, []);
});

test('화면 연결: 기본은 PhoneLineage(classic은 숨은 설정), 아래 시트 없음, 한 번 누르면 세션 열기, 길게 누르면 PC와 같은 미리 보기, 빛·완료 꼬리표', () => {
  const pm = read('PhoneMission.jsx'), pl = read('PhoneLineage.jsx'), ml = read('MissionLineage.jsx');
  assert.match(pm, /style === 'classic' \? <ClassicPhoneMission \{\.\.\.props\} \/> : <PhoneLineage \{\.\.\.props\} \/>/);
  assert.ok(!fs.existsSync(path.join(R, 'PhoneTerr.jsx')), 'P152 영토 지도는 갈음했다');
  assert.ok(!/pt-sheet|mt-pt-sheet/.test(pl), '나를 기다리는 것 시트는 위 알약으로 갈음');
  assert.match(pl, /if \(c\.dataset\.session\) onOpen\(c\.dataset\.session\);/);
  assert.match(pl, /<Peek pv=/); assert.match(ml, /export function Peek\(/);
  assert.match(pl, /\{tier === 'work' && <MissionLight role="pl-light" \/>\}/);
  assert.match(pl, /mt-mm-donetag/);
  assert.match(pl, /routing: false/, '휴대폰은 길 찾기를 하지 않는다');
  const css = read('phone.css'), blk = css.slice(css.indexOf('/* ---------- P160'));
  assert.match(blk, /\.mt-pl-fh \{ position: sticky; top: 0;/); assert.match(blk, /\.mt-pl-wh \{ position: sticky; top: var\(--pl-fh/);
  assert.match(blk, /\.mt-pl-card \.mt-mm-lspin::before \{[^}]*steps\(36, end\)/, '휴대폰 빛은 steps(36)');
  assert.ok(!/will-change|backdrop-filter|filter:/.test(blk), '가볍게(P89)');
  assert.match(blk, /html\[data-work-light="off"\] \.mt-pl-slot\.blink/, '반짝임은 판 설정 workLight를 따른다');
});

test('사전: 휴대폰 세션 맵 글이 두 벌 다 있다', () => {
  for (const d of [en, ko]) for (const k of ['from', 'away', 'none', 'open']) assert.ok(d.phoneMap && typeof d.phoneMap[k] === 'string' && d.phoneMap[k].length, k);
  assert.match(ko.phoneMap.from, /\{name\}.*\{ws\}/); assert.match(en.phoneMap.from, /\{name\}.*\{ws\}/);
  assert.match(ko.phoneMap.away, /\{n\}/); assert.match(en.phoneMap.away, /\{n\}/);
});
