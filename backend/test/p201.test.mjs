// P201: pi를 판에서 실제로 쓰기. 모델 목록(pi --list-models), 하위 띄우기의 모델 찾기, 마지막 답(pi 세션 파일), 지금 모델(제공자/ID)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { parsePiModels, piModels } from '../src/pi-models.mjs';
import { AgyModels } from '../src/agy-models.mjs';
import { Launchers, describeHarnesses, HARNESSES } from '../src/launchers.mjs';
import { buildCatalog, resolveModel } from '../src/models.mjs';
import { lineModel, sameModel, readPiLastAnswer, shownModel } from '../src/model-now.mjs';
import { Backend } from '../src/backend.mjs';
import { loadConfig } from '../src/config.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'p201-'));

// pi 1.5.2 `pi --list-models`의 꼴(열 사이는 빈칸 여럿)
const LIST = [
  'provider   model                       context  max-out  thinking  images',
  'anthropic  claude-haiku-5-5            1M       128K     yes       yes   ',
  'anthropic  claude-opus-5-5             1M       128K     yes       yes   ',
  'deepseek   deepseek-flash              1M       384K     yes       yes   ',
  'deepseek   deepseek-v4-pro             1M       384K     yes       no    ',
  '',
].join('\n');

test('P201 pi 모델 목록: 표를 pi --model 꼴(제공자/ID)로 읽는다. 머리줄 앞 글과 이상한 줄은 건너뛴다', () => {
  assert.deepEqual(parsePiModels(LIST), { ok: true, models: ['anthropic/claude-haiku-5-5', 'anthropic/claude-opus-5-5', 'deepseek/deepseek-flash', 'deepseek/deepseek-v4-pro'], labels: {} });
  const noisy = `Warning: something\nfoo bar\n${LIST}anthropic  claude-haiku-5-5  1M\n-x  -y\n`;
  assert.deepEqual(parsePiModels(noisy).models, ['anthropic/claude-haiku-5-5', 'anthropic/claude-opus-5-5', 'deepseek/deepseek-flash', 'deepseek/deepseek-v4-pro'], '머리줄 앞 줄·겹친 줄·-로 시작하는 이름은 뺀다');
  assert.deepEqual(parsePiModels('provider model context\n'), { ok: false, why: 'empty' }, '로그인한 제공자가 없으면 빈 목록');
  assert.deepEqual(parsePiModels(''), { ok: false, why: 'empty' });
});

test('P201 pi 모델 목록 담아 두기: 처음엔 고정 목록(빈), 받은 뒤엔 source pi. 실패하면 아는 목록을 둔다', async () => {
  let t = 0; let runs = 0; let fail = false;
  const m = piModels({ now: () => t, ttlMs: 60000, failMs: 10000, run: async () => { runs++; if (fail) throw new Error('x'); return LIST; } });
  assert.ok(m instanceof AgyModels);
  const first = m.read();
  assert.equal(first.source, 'default'); assert.deepEqual(first.models, []);
  await m.refresh();
  const r = m.read();
  assert.equal(r.source, 'pi'); assert.equal(r.models.length, 4); assert.equal(runs, 1);
  t = 70000; fail = true;
  await m.refresh();
  assert.equal(m.read().models.length, 4, '다시 받기가 실패해도 아는 목록');
  await new Promise((r) => setImmediate(r));
  assert.equal(runs, 2, '실패한 뒤 read()가 다시 받기를 되풀이하지 않는다(전에는 끝없이 돌았다)');
  t = 70000 + 10000; fail = false;
  await m.refresh();
  assert.equal(runs, 3, 'failMs가 지나면 다시 받는다');
});

test('P201 AGY 목록은 그대로(parse·source 기본값)', async () => {
  const m = new AgyModels({ run: async () => 'g-1\tG 1\n' });
  await m.refresh();
  assert.equal(m.read().source, 'agy'); assert.deepEqual(m.read().models, ['g-1']);
});

test('P201 호출자: pi 목록이 하네스 설명(드롭다운)과 freshModelLists에 든다', async () => {
  const pm = piModels({ run: async () => LIST });
  const ls = Object.create(Launchers.prototype);
  ls.codexModels = null; ls.agyModels = null; ls.piModels = pm;
  const lists = await ls.freshModelLists(2000);
  assert.equal(lists.pi.source, 'pi');
  const pi = describeHarnesses(lists).find((h) => h.id === 'pi');
  assert.deepEqual(pi.models, ['anthropic/claude-haiku-5-5', 'anthropic/claude-opus-5-5', 'deepseek/deepseek-flash', 'deepseek/deepseek-v4-pro']);
  assert.equal(pi.modelSource, 'pi');
  assert.deepEqual(HARNESSES.pi.models, [], '고정 목록은 그대로 비어 있다');
});

test('P201 하위 띄우기: atrium child --kind pi --model deepseek/deepseek-flash를 찾는다(전에는 model_unknown). haiku는 여전히 Claude Code', () => {
  const cat = buildCatalog({ launchers: [], gateways: [], harnessModels: { pi: parsePiModels(LIST).models } });
  const a = resolveModel('deepseek/deepseek-flash', cat, { kind: 'pi' });
  assert.ok(a.ok); assert.equal(a.entry.kind, 'pi'); assert.equal(a.entry.model, 'deepseek/deepseek-flash');
  assert.match(a.entry.command, /--kind pi --model "?deepseek\/deepseek-flash"?$/);
  const b = resolveModel('deepseek-flash', cat);
  assert.ok(b.ok); assert.equal(b.entry.kind, 'pi');
  const c = resolveModel('haiku', cat);
  assert.ok(c.ok); assert.equal(c.entry.kind, 'claude');
  const d = resolveModel('claude-haiku-5-5', cat, { kind: 'pi' });
  assert.ok(d.ok); assert.equal(d.entry.model, 'anthropic/claude-haiku-5-5', '--kind pi면 제공자 없는 이름도 pi 모델');
  const empty = buildCatalog({ launchers: [], gateways: [], harnessModels: {} });
  assert.equal(resolveModel('deepseek/deepseek-flash', empty, { kind: 'pi' }).ok, false, '목록이 없으면 전처럼 모른다');
});

test('P201 지금 모델: pi model_change는 제공자/ID(띄운 --model 값과 같아 model_changed를 남기지 않는다)', () => {
  const line = JSON.stringify({ type: 'model_change', id: 'a', provider: 'anthropic', modelId: 'claude-haiku-4-5' });
  assert.deepEqual(lineModel('pi', line), { model: 'anthropic/claude-haiku-4-5' });
  assert.deepEqual(lineModel('pi', JSON.stringify({ type: 'model_change', modelId: 'm-1' })), { model: 'm-1' }, '제공자가 없으면 ID만');
  assert.ok(sameModel('anthropic/claude-haiku-4-5', 'claude-haiku-4-5'), '제공자 앞머리는 같은 모델');
  assert.ok(sameModel('anthropic/claude-haiku-4-5', 'anthropic/claude-haiku-4-5'));
  assert.equal(sameModel('deepseek/deepseek-flash', 'anthropic/claude-haiku-4-5'), false);
  assert.deepEqual(shownModel({ model: 'deepseek/deepseek-flash' }, { model: 'deepseek/deepseek-v4-pro' }), { model: 'deepseek/deepseek-v4-pro', effort: null });
});

const piFile = (dir, rows) => { const f = path.join(dir, '2026-01-01T00-00-00-000Z_abc.jsonl'); fs.writeFileSync(f, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`); return f; };
const msg = (role, content, ts) => ({ type: 'message', id: String(ts), timestamp: new Date(ts).toISOString(), message: { role, content, timestamp: ts } });

test('P201 pi 마지막 답: 세션 파일 끝의 assistant 글(생각·도구 부르기는 뺀다). 턴의 끝이 사용자 글이면 없음', () => {
  const dir = tmp();
  try {
    const f = piFile(dir, [
      { type: 'session', version: 3, id: 'abc', cwd: 'C:/x' },
      msg('user', [{ type: 'text', text: '1+1?' }], 1000),
      msg('assistant', [{ type: 'thinking', thinking: '...' }, { type: 'toolCall', name: 'bash' }], 2000),
      { type: 'message', message: { role: 'toolResult', content: [{ type: 'text', text: 'out' }] } },
      msg('assistant', [{ type: 'thinking', thinking: 'hm' }, { type: 'text', text: '2' }, { type: 'text', text: '끝' }], 3000),
    ]);
    assert.deepEqual(readPiLastAnswer(f), { text: '2\n끝', at: 3000 });
    const g = piFile(dir, [msg('assistant', [{ type: 'text', text: 'old' }], 1000), msg('user', [{ type: 'text', text: 'q' }], 2000)]);
    assert.equal(readPiLastAnswer(g), null, '새 턴의 답이 아직 없다');
    const h = piFile(dir, [msg('user', [{ type: 'text', text: 'q' }], 1000), msg('assistant', [{ type: 'toolCall', name: 'bash' }], 2000)]);
    assert.equal(readPiLastAnswer(h), null, '글 답이 없는 턴');
    assert.equal(readPiLastAnswer(path.join(dir, 'none.jsonl')), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('P201 판의 pi 답 읽기: 세션 파일의 새 답이면 그것(source session), 새 답이 없으면 화면으로 돌아간다', async () => {
  const dir = tmp();
  try {
    const f = piFile(dir, [msg('user', [{ type: 'text', text: 'q' }], 1000), msg('assistant', [{ type: 'text', text: '2, 예' }], 2000)]);
    const emitted = [];
    const bus = new EventEmitter(); bus.on('screenAnswer', (s) => emitted.push(s.rt.lastAnswer));
    let screenReads = 0;
    const b = { bus, modelFileOf: () => f, adapter: { readScreen: async () => { screenReads++; return 'Pi banner\n 화면 답\n────────────────\n────────────────\nC:\\x\n$0.000 (sub)'; } }, readPiAnswer: Backend.prototype.readPiAnswer };
    const s = { kind: 'pi', paneId: 't1', rt: {} };
    await Backend.prototype.readScreenAnswer.call(b, s);
    assert.equal(s.rt.lastAnswer, '2, 예'); assert.equal(s.rt.answerSource, 'session'); assert.equal(s.rt.piAnswerAt, 2000);
    assert.equal(screenReads, 0);
    // 같은 답을 다시 쓰지 않는다: 새 답이 없으면 잠깐 기다린 뒤 화면
    b.readPiAnswer = function (x) { return Backend.prototype.readPiAnswer.call(this, x, { tries: 2, gapMs: 5 }); };
    await Backend.prototype.readScreenAnswer.call(b, s);
    assert.equal(s.rt.answerSource, 'screen'); assert.equal(screenReads, 1);
    // 다음 턴의 답이 파일에 들어오면 다시 세션 파일
    fs.appendFileSync(f, `${JSON.stringify(msg('user', [{ type: 'text', text: 'q2' }], 3000))}\n${JSON.stringify(msg('assistant', [{ type: 'text', text: '4' }], 4000))}\n`);
    await Backend.prototype.readScreenAnswer.call(b, s);
    assert.equal(s.rt.lastAnswer, '4'); assert.equal(s.rt.answerSource, 'session');
    assert.deepEqual(emitted.slice(-1), ['4']);
    // pi가 아닌 종류는 세션 파일을 보지 않는다
    const c = { kind: 'codex', paneId: 't2', rt: {} };
    await Backend.prototype.readScreenAnswer.call(b, c);
    assert.equal(c.rt.answerSource, 'screen');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('P201 설정: ATRIUM_PI(none이면 pi 목록을 받지 않는다)', () => {
  assert.equal(loadConfig({ argv: [], env: {} }).piCommand, 'pi');
  assert.equal(loadConfig({ argv: [], env: { ATRIUM_PI: 'none' } }).piCommand, null);
  assert.equal(loadConfig({ argv: [], env: { ATRIUM_PI: 'C:/p/pi.cmd' } }).piCommand, 'C:/p/pi.cmd');
});
