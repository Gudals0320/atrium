// P255 창 단위 시험: 작업 완료 모두 읽기, Codex 크레딧 표기, 메모리 칩의 CPU 글, 설정 탭(연결 없음), 두 사전
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seenTargets, cpuLine, fmtPct, creditMode, creditPillText } from '../src/renderer/lib/p255.js';
import { blankLauncher } from '../src/renderer/lib/launchers.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const NOW = 1_800_000_000_000;

test('모두 읽기: 목록의 안 본 세션 모두(겹침 없이), 빈 목록이면 없음', () => {
  const list = [{ sessionId: 'a', unseen: true }, { sessionId: 'b', unseen: false, unseenSub: true }, { sessionId: 'c' }, { sessionId: 'a', unseen: true }];
  assert.deepEqual(seenTargets(list), ['a', 'b']);
  assert.deepEqual(seenTargets([]), []);
  assert.deepEqual(seenTargets(null), []);
  // 창: 작업 완료 칩에만 모두 읽기, 세션마다 보는 것과 같은 session.markSeen
  const chrome = read('Chrome.jsx');
  assert.match(chrome, /role="review" [^\n]*readAll/);
  assert.match(chrome, /data-action="read-all"/);
  assert.match(read('store.js'), /export async function markAllSeen\(ids\)[^]*session\.markSeen/);
});

const W = (id, usedPct, resetsAt = NOW + 3600000) => ({ id, minutes: id === '5h' ? 300 : 10080, usedPct, resetsAt });
const codex = (windows, credits) => ({ provider: 'codex', windows, credits });
test('Codex 크레딧: 한도 창이 100%이고 크레딧이 있으면 남은 크레딧, 무제한, 한도 남음, 자료 없음', () => {
  const cr = { hasCredits: true, unlimited: false, balance: '46647.8239250000' };
  assert.deepEqual(creditMode(codex([W('5h', 100), W('week', 40)], cr), NOW), { kind: 'balance', n: '46,648' });
  assert.deepEqual(creditMode(codex([W('5h', 30), W('week', 100)], cr), NOW), { kind: 'balance', n: '46,648' }, '주간 창도');
  assert.equal(creditMode(codex([W('5h', 99.9), W('week', 40)], cr), NOW), null, '한도가 남으면 퍼센트');
  assert.equal(creditMode(codex([W('5h', 100, NOW - 1)], cr), NOW), null, '리셋이 지난 창은 새 창');
  assert.deepEqual(creditMode(codex([W('5h', 100)], { hasCredits: false, unlimited: true, balance: null }), NOW), { kind: 'unlimited' });
  assert.equal(creditMode(codex([W('5h', 100)], { hasCredits: false, unlimited: false, balance: '0' }), NOW), null, '크레딧이 없으면 100%');
  assert.equal(creditMode(codex([W('5h', 100)], null), NOW), null, '크레딧 자료 없음');
  assert.equal(creditMode(codex([W('5h', 100)], { hasCredits: true, unlimited: false, balance: null }), NOW), null, '잔액을 모르면');
  assert.equal(creditMode(null, NOW), null);
  assert.deepEqual(creditPillText({ kind: 'balance', n: '123' }), { key: 'p255.credit', vars: { n: '123' } });
  assert.deepEqual(creditPillText({ kind: 'unlimited' }), { key: 'p255.creditUnlimited', vars: {} });
  assert.equal(creditPillText(null), null);
  // 알약은 크레딧 모드면 창 값 대신 크레딧 글, 풍선에는 창 값도 남긴다
  const u = read('Usage.jsx');
  assert.match(u, /data-role="usage-credit-pill"/);
  assert.match(u, /const title = line\.parts\.map[^\n]*credit\(x\.provider\)[^\n]*kindName\(t, w\)/);
});

test('CPU 글: 세션들과 PC 전체, 모르면 ?, 옛 백엔드면 known false', () => {
  assert.deepEqual(cpuLine({ cpu: { sessionsPct: 3.25, systemPct: 41.6 } }), { sessions: '3.3%', system: '42%', known: true });
  assert.deepEqual(cpuLine({ cpu: { sessionsPct: null, systemPct: null } }), { sessions: '?', system: '?', known: false });
  assert.deepEqual(cpuLine({}), { sessions: '?', system: '?', known: false });
  assert.equal(fmtPct(0), '0.0%'); assert.equal(fmtPct(10), '10%'); assert.equal(fmtPct(undefined), '?');
  for (const d of [en, ko]) assert.equal(d.p255.cpu.replace('{sessions}', '1%').replace('{system}', '2%').includes('{'), false);
  assert.match(read('Chrome.jsx'), /data-role="res-cpu"/);
});

test('설정 탭 목록에 연결이 없고, 런처 틀에 연결 칸이 없다', () => {
  const s = read('Settings.jsx');
  assert.ok(!/connections/.test(s));
  assert.ok(!/ConnectionSelect|launcher-connection/.test(read('Launchers.jsx')));
  assert.equal('connection' in blankLauncher(), false);
});

test('두 사전: p255 키가 같다', () => {
  const keys = (o) => Object.keys(o).sort();
  assert.deepEqual(keys(en.p255), keys(ko.p255));
  for (const d of [en, ko]) { assert.match(d.p255.credit, /\{n\}/); assert.match(d.p255.plainAuthNotice, /\{name\}/); assert.match(d.p255.plainAuthNotice, /\{names\}/); }
});
