// P355: 휴대폰 세션 화면의 키 줄(session.keys 허용 키·바이트), 터미널 보기의 짧은 세션 답(phone.session brief), 배치 값 기록(lay)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY_NAMES, checkKeys } from '../src/keys.mjs';
import { keysToBytes, keyBytes } from '../src/hc/model.mjs';
import { phoneHandlers, PhoneFeed } from '../src/phone.mjs';
import { teleInfo, TELE_KINDS, errorSummary, formatErrors, layLabel, layOf } from '../src/phone-errors.mjs';
import { MOBILE_KEYS } from '../../app/src/renderer/lib/mobile.js';

test('휴대폰 키 줄의 키는 모두 session.keys 허용 키이고 패널 바이트가 있다(ctrl 조합은 Ctrl+C 하나)', () => {
  for (const k of MOBILE_KEYS) assert.ok(KEY_NAMES.includes(k), k);
  assert.deepEqual(checkKeys(MOBILE_KEYS), MOBILE_KEYS);
  const b = keysToBytes(MOBILE_KEYS);
  assert.ok(b, '모르는 키가 없다(hc terminal.keys로 돌지 않는다)');
  assert.equal(keyBytes('ctrl+c'), '\x03');
  assert.equal(keyBytes('shift+tab'), '\x1b[Z');
  assert.equal(keyBytes('slash'), '/');
  assert.equal(keyBytes('backspace'), '\x7f');
  assert.equal(keyBytes('space'), ' ');
  assert.equal(keyBytes('4'), '4');
  for (const bad of ['ctrl+d', 'ctrl+u', 'ctrl+g', 'hello']) assert.throws(() => checkKeys([bad]), (e) => e.key === 'keysBad', bad);
});

function fakeBoard({ reads }) {
  const s = { sessionId: 'sid-1', name: 'a', kind: 'claude', state: 'waiting', paneId: 'p1', rt: { lastAnswer: 'x'.repeat(5000), lastAnswerAt: 1, lastPrompt: 'do it', turn: { startedAt: 2 } } };
  const sum = { sessionId: 'sid-1', name: 'a', kind: 'claude', state: 'waiting', createdAt: 1, ask: { kind: 'permission', tool: 'Bash', summary: 'Bash: mkdir x', choices: [{ n: 1, label: 'Yes' }, { n: 2, label: 'No' }] } };
  return {
    phoneFeed: new PhoneFeed({ boot: 'b' }),
    resolve: () => s, summary: () => sum,
    queue: { list: () => [] }, store: { workspaces: () => [], getDelivery: () => null },
    workspaceList: () => [],
    adapter: { readScreen: async () => { reads.n++; return 'line1\nline2'; } },
  };
}
test('phone.session brief: 터미널 보기는 기다리는 요청·대기 글만(마지막 답·지시·끝 줄 없이, 화면을 읽지 않는다)', async () => {
  const reads = { n: 0 };
  const h = phoneHandlers(fakeBoard({ reads }));
  const c = {};
  const full = await h['phone.session']({ session: 'a', lines: 40 }, c);
  assert.equal(reads.n, 1);
  assert.ok(full.lastAnswer && full.lastPrompt && full.tail != null);
  assert.equal(c.phoneOpen, 'sid-1');
  const brief = await h['phone.session']({ session: 'a', brief: true }, c);
  assert.equal(reads.n, 1, '화면을 읽지 않는다');
  assert.equal(brief.brief, true);
  assert.equal(brief.lastAnswer, null); assert.equal(brief.lastPrompt, null); assert.equal(brief.tail, null);
  assert.deepEqual(brief.ask.choices.map((x) => x.n), [1, 2]);
  assert.ok(JSON.stringify(brief).length < JSON.stringify(full).length / 3);
});

const LAY = { iw: 393, ih: 793, ch: 793, vh: 792.67, vt: 0, sw: 393, sh: 852, st: 0, sr: 0, sb: 34, sl: 0, rb: 793, tb: 793, on: 'tabs', sd: false, kb: false };
test('배치 값(lay): 받는 칸만(CSS px 소수 한 자리, 참·거짓, 아래 줄 이름), 이상한 값은 버린다', () => {
  assert.ok(TELE_KINDS.includes('lay'));
  const x = teleInfo({ k: 'lay', at: 5, lay: { ...LAY, path: 'C:/secret', on: 'evil', vh: 'big', rb: 1e9 } });
  assert.equal(x.k, 'lay'); assert.equal(x.at, 5);
  assert.equal(x.lay.iw, 393); assert.equal(x.lay.sb, 34); assert.equal(x.lay.sd, false);
  assert.ok(!('path' in x.lay) && !('on' in x.lay) && !('vh' in x.lay) && !('rb' in x.lay));
  assert.equal(layOf(null), null);
  assert.equal(teleInfo({ k: 'err', lay: LAY }).lay, undefined, '다른 종류에는 붙지 않는다');
});
test('배치 값은 기기마다 마지막 것을 요약·CLI 표에 보이고 잘림을 센다', () => {
  const entries = [
    { event: 'tele', at: 10, deviceName: 'iphone', tele: teleInfo({ k: 'lay', at: 10, lay: { ...LAY, rb: 700 } }) },
    { event: 'tele', at: 20, deviceName: 'iphone', tele: teleInfo({ k: 'lay', at: 20, lay: LAY }) },
  ];
  const s = errorSummary(entries);
  assert.equal(s.layout.iphone.lay.rb, 793);
  assert.equal(s.groups.length, 0, '배치 값은 오류 묶음이 아니다');
  const text = formatErrors(s);
  assert.match(text, /배치\(iphone/);
  assert.match(layLabel(LAY), /잘림 0\.3px/);
  assert.match(layLabel({ ...LAY, vh: 793 }), /잘림 없음/);
  assert.match(layLabel({ ...LAY, sd: true }), /홈 화면 앱/);
});
