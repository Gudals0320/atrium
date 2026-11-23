// P196 창 단위 시험: Antigravity(agy) 로고·이름과 호출자 드롭다운 목록
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KINDS, kindOf, logoFor } from '../src/renderer/lib/kinds.js';
import { ICONS, AGENT_HARNESSES, harnessName, harnessOptions, iconName, launcherIcon } from '../src/renderer/lib/launchers.js';

test('P196 KINDS.agy: 이름 Antigravity, 로고 assets/kinds/agy.png(128px 투명 바탕 PNG), 레일 단추도 같은 그림', () => {
  const k = KINDS.agy;
  assert.equal(k.label, 'Antigravity');
  assert.equal(k.logo, 'assets/kinds/agy.png');
  assert.equal(k.logoBadge, undefined);
  assert.equal(logoFor(k, 'waiting'), k.logo);
  const png = fs.readFileSync(new URL('../src/renderer/assets/kinds/agy.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
  assert.equal(png.readUInt32BE(16), 128); assert.equal(png.readUInt32BE(20), 128);
  assert.equal(png[25], 6, 'RGBA(투명 바탕)');
  assert.equal(kindOf('AGY').label, 'Antigravity');
});

test('P196 하네스 이름: 백엔드 표 이름 → 종류 이름표 → ID, 명령·셸은 사전', () => {
  const t = (k) => `[${k}]`;
  assert.equal(harnessName([{ id: 'agy', label: 'Antigravity' }], 'agy', t), 'Antigravity');
  assert.equal(harnessName([], 'agy', t), 'Antigravity');
  assert.equal(harnessName(null, 'claude', t), 'Claude Code');
  assert.equal(harnessName([], 'gemini', t), 'gemini');
  assert.equal(harnessName([], 'command', t), '[launchers.harness.command]');
  assert.equal(harnessName([], 'shell', t), '[launchers.harness.shell]');
});

test('P196 하네스 드롭다운: 표가 비거나 agy가 빠져도 agy가 나오고, 겹치지 않고, 지금 값(모르는 것)도 든다', () => {
  assert.ok(AGENT_HARNESSES.includes('agy'));
  assert.deepEqual(harnessOptions([], []), AGENT_HARNESSES);
  const old = [{ id: 'claude' }, { id: 'codex' }, { id: 'opencode' }, { id: 'pi' }, { id: 'shell' }, { id: 'command' }];
  const o = harnessOptions(old, ['claude', 'codex', 'agy', 'gemini'], 'mystery');
  assert.deepEqual(o, ['claude', 'codex', 'opencode', 'pi', 'agy', 'dsh', 'hermes', 'omo', 'gemini', 'mystery']); // P270: dsh. P298: hermes. P329: omo
  assert.ok(!o.includes('shell') && !o.includes('command'));
  assert.equal(new Set(o).size, o.length);
  assert.deepEqual(harnessOptions([{ id: 'agy' }, { id: 'claude' }], [], 'agy').slice(0, 2), ['agy', 'claude']);
});

test('P196 아이콘 드롭다운: agy는 Antigravity로 보이고, 아이콘 없는 agy 호출자는 agy 로고', () => {
  assert.ok(ICONS.includes('agy'));
  assert.equal(iconName('agy'), 'Antigravity');
  assert.equal(iconName('shell', (k) => `[${k}]`), '[kinds.shell]');
  assert.equal(launcherIcon({ harness: 'agy', icon: '' }), 'agy');
});
