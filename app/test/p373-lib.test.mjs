// P373: 설정 › 런처 — 새 런처 단추를 목록 위로, 일반 하네스 런처 아래 "부가 연결" 절(SDK 런처·SDK 키 칸·쓸 수 없는 옛 API 런처)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';
import { splitLaunchers, isExtraLauncher } from '../src/renderer/lib/auth-relay.js';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const src = (f) => fs.readFileSync(path.join(R, f), 'utf8');

test('런처 나누기: SDK 런처와 옛 API 런처는 부가 연결, 나머지는 받은 순서 그대로 일반', () => {
  const rows = [
    { id: 'a', harness: 'claude' },
    { id: 'sdk', harness: 'claude-sdk' },
    { id: 'cx', harness: 'codex' },
    { id: 'old', harness: 'claude', env: { ANTHROPIC_BASE_URL: 'http://{{authRelay}}/' } },
    { id: 'gone', harness: 'claude', unusable: 'authRelay' },
    { id: 'sh', harness: 'shell' },
    { id: 'cmd', harness: 'command' },
  ];
  const { main, extra } = splitLaunchers(rows);
  assert.deepEqual(main.map((l) => l.id), ['a', 'cx', 'sh', 'cmd']);
  assert.deepEqual(extra.map((l) => l.id), ['sdk', 'old', 'gone']);
  assert.equal(isExtraLauncher({ harness: 'claude', env: { ANTHROPIC_BASE_URL: 'https://example.invalid' } }), false, '다른 게이트웨이 주소는 일반');
  assert.deepEqual(splitLaunchers(null), { main: [], extra: [] });
});

test('목록 화면: 새 런처 단추가 목록 위, 부가 연결 절이 일반 목록 아래, SDK 키 칸은 그 절 안', () => {
  const s = src('Launchers.jsx');
  const list = s.slice(s.indexOf('function LauncherList('), s.indexOf('function ModelInput('));
  const at = (x) => { const i = list.indexOf(x); assert.ok(i >= 0, x); return i; };
  assert.ok(at('data-action="launcher-new"') < at('className="mt-ln-rows"'), '새 런처는 목록 위');
  assert.ok(at('data-action="launcher-new-command"') < at('className="mt-ln-rows"'));
  assert.ok(at('data-role="launchers-main"') < at('data-role="launchers-extra"'), '부가 연결은 일반 목록 아래');
  assert.ok(at('data-role="launchers-extra"') < at('{sdkId ? null : <ApiKeyPanel />}'), 'SDK 런처가 없으면 키 칸은 부가 연결 절 머리');
  assert.match(list, /l\.id === sdkId \? <ApiKeyPanel under \/>/);
  assert.equal(list.split('data-action="launcher-new"').length, 2, '새 런처 단추는 한 곳');
  assert.match(src('styles.css'), /\.mt-ln \{ grid-template-rows: auto auto minmax\(0, 1fr\); \}/);
});

test('사전: 부가 연결 제목과 풀이, 두 언어 같은 열쇠', () => {
  assert.equal(en.p373.extraTitle, 'Add-on connections');
  assert.equal(ko.p373.extraTitle, '부가 연결');
  assert.deepEqual(Object.keys(en.p373).sort(), Object.keys(ko.p373).sort());
  for (const d of [en, ko]) for (const v of Object.values(d.p373)) assert.ok(v && v.trim());
});
