// P379: 휴대폰 입력칸 확대와 스티어링을 받지 않는 세션의 휴대폰 단추
// - iOS는 글자 16px보다 작은 입력칸에 초점이 가면 화면을 확대한다. 휴대폰 페이지(mobile.css)는 글자 크기가 16px × --mp-fs(A− 최소 0.75)라
//   입력칸의 rem 값이 15px·12px로 내려갔다(P74 "입력칸은 16px"이 P353 간소 페이지에서 깨졌다). 바닥 규칙으로 고정한다(불변식)
// - 자체 오케스트레이션 세션(OmO 등)은 스티어링 없이 대기열만(P296 결정, 바꾸지 않는다). 휴대폰 줄(rowOf)에 orch가 없어 'kind'로 보였고 단추가 흐려지지 않았다
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { steerBlock, steerOffText } from '../src/renderer/lib/steer.js';
import { sendPlan } from '../src/renderer/lib/phone.js';
import { uiFactor } from '../src/renderer/lib/mobile.js';
import { setLanguage, t } from '../src/renderer/lib/i18n.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const noComments = (s) => s.replace(/\/\*[^]*?\*\//g, '');
// CSS 규칙 목록(@media 안도 펴서): [{ sel, body }]
function rules(css) {
  const out = []; const s = noComments(css); let i = 0;
  const walk = (end) => {
    let start = i;
    while (i < end) {
      const ch = s[i];
      if (ch === '{') {
        const sel = s.slice(start, i).trim(); i++;
        if (sel.startsWith('@')) { walk(end); start = i; continue; }
        const close = s.indexOf('}', i); out.push({ sel, body: s.slice(i, close) }); i = close + 1; start = i; continue;
      }
      if (ch === '}') { i++; return; }
      i++;
    }
  };
  walk(s.length);
  return out;
}
const FLOOR_PX = 16;
const isField = (sel) => /(^|[\s>+~(,])(input|textarea|select)\b/.test(sel);

test('P379 휴대폰 입력칸: 바닥 규칙이 있고 글자 크기 설정 최소에서도 16px 아래로 내려가지 않는다', () => {
  const css = read('mobile.css');
  const floor = rules(css).find((r) => r.sel.startsWith('html.mt-mp-on :is(') && /font-size:\s*max\(16px,\s*1rem\)\s*!important/.test(r.body));
  assert.ok(floor, '바닥 규칙(html.mt-mp-on :is(input…, textarea, select) { font-size: max(16px, 1rem) !important })');
  for (const k of ['input', 'textarea', 'select']) assert.match(floor.sel, new RegExp('\\b' + k + '\\b'));
  assert.doesNotMatch(floor.sel, /\[type="text"\]|\[type="search"\]/, '글 입력칸 종류(text·search 등)를 빼지 않는다');
  // 페이지 배율(uiFactor)의 범위 전체: 1rem = 16px × 배율. max(16px, 1rem)은 늘 16 이상이고, 키우면 함께 커진다
  for (const scale of [0.1, 0.4, 0.6, 0.8, 1, 1.2, 5]) {
    const rem = 16 * uiFactor(scale);
    const px = Math.max(FLOOR_PX, rem);
    assert.ok(px >= FLOOR_PX, `배율 ${scale}: ${px}px`);
    if (rem > FLOOR_PX) assert.equal(px, rem, 'A+로 키우면 입력칸도 커진다');
  }
  assert.equal(uiFactor(0.1), 0.75, '배율 최소 0.75(바닥 없으면 12px)');
});

test('P379 휴대폰 입력칸: 다른 규칙이 !important로 바닥을 이기지 않는다(휴대폰 페이지 CSS)', () => {
  for (const f of ['mobile.css', 'mobilemap.css', 'tokens.css', 'fonts.css']) {
    if (!fs.existsSync(path.join(R, f))) continue;
    for (const r of rules(read(f))) {
      if (!isField(r.sel) || r.sel.startsWith('html.mt-mp-on :is(')) continue;
      const m = r.body.match(/font(?:-size)?\s*:[^;]*!important/);
      assert.equal(m, null, `${f}: ${r.sel} 의 !important 글자 크기가 바닥을 덮는다`);
    }
  }
});

test('P379 확대를 viewport로 막지 않는다(두 손가락 확대를 남긴다)', () => {
  const html = read('index.html');
  const vp = html.match(/<meta name="viewport" content="([^"]*)"/);
  assert.ok(vp);
  assert.doesNotMatch(vp[1], /maximum-scale|user-scalable/);
});

test('P379 스티어링을 받지 않는 세션: 휴대폰 줄의 orch로 까닭은 orchestrates, 스티어링을 골라도 대기열로 보낸다', () => {
  // P383: OmO는 스티어링을 받게 되어(사용자 결정) 막히는 자체 오케스트레이션의 예는 Hermes다
  const orchH = { sessionId: 'o', name: 'o', kind: 'hermes', state: 'working', orch: { on: true } };
  const claudeOrch = { sessionId: 'c', name: 'c', kind: 'claude', state: 'working', orch: { on: true } };
  assert.equal(steerBlock(orchH), 'orchestrates');
  assert.equal(steerBlock(claudeOrch), 'orchestrates', 'claude 위 오케스트레이션 런처도 휴대폰이 미리 안다');
  assert.equal(steerBlock({ ...orchH, orch: undefined }), 'kind', '줄에 orch가 없으면 종류 까닭(고치기 전 휴대폰)');
  for (const s of [orchH, claudeOrch, { kind: 'opencode' }, { kind: 'claude', hooked: false }]) {
    const p = sendPlan(s, 'hi', { steer: true });
    assert.equal(p.method, 'session.send');
    assert.ok(!('steer' in p), '실패시키지 않고 대기열(steer 없이 보통 보내기)');
  }
  assert.equal(sendPlan({ kind: 'claude' }, 'hi', { steer: true }).steer, true, '받는 세션은 그대로 스티어링');
});

test('P379 휴대폰 단추 글: 짧은 까닭(일이 끝난 뒤 들어감)과 두 사전', () => {
  assert.deepEqual(Object.keys(ko.p379).sort(), Object.keys(en.p379).sort());
  setLanguage('ko');
  assert.equal(steerOffText(t, 'orchestrates'), '이 세션은 지금 일이 끝난 뒤 들어갑니다(자체 오케스트레이션 세션은 대기열로만 받음). 그냥 보내세요.');
  assert.match(steerOffText(t, 'kind'), /일이 끝난 뒤 들어갑니다\(일하는 중에 입력을 받지 못하는 종류\)/);
  setLanguage('en');
  assert.match(steerOffText(t, 'orchestrates'), /after its current work ends \(self-orchestrating sessions take the queue only\)/);
  setLanguage('ko');
});

test('P379 휴대폰 단추: 못 받는 세션이면 흐리게(aria-disabled·data-off, 색 토큰), 눌러도 켜지지 않고 까닭만', () => {
  const src = read('MobileSession.jsx');
  const btn = src.slice(src.indexOf('data-action="mp-steer"') - 200, src.indexOf('<Ic d={I.bolt} /></button>}'));
  assert.match(btn, /className=\{'mt-mp-round mt-mp-steer'/);
  assert.match(btn, /aria-disabled=\{why \? true : undefined\}/);
  assert.match(btn, /data-off=\{why \|\| undefined\}/);
  assert.match(btn, /aria-pressed=\{steer && !why\}/);
  assert.match(btn, /if \(why\) toast\(steerOffText\(t, why\)\); else setSteer/);
  assert.doesNotMatch(btn, /[^-]disabled=\{why/, '누를 수는 있어야 까닭을 본다(disabled 아님)');
  const css = rules(read('mobile.css')).find((r) => r.sel === '.mt-mp-round.mt-mp-steer[data-off]');
  assert.ok(css);
  assert.match(css.body, /color:\s*var\(--cmd-btn-ink\)/);
  assert.match(css.body, /border-style:\s*dashed/);
  assert.doesNotMatch(css.body, /opacity/, 'opacity로 흐리게 하지 않는다(docs testing CSS 규칙)');
  // 옛 휴대폰 화면(Phone.jsx)도 같은 글
  assert.match(read('Phone.jsx'), /if \(why\) toast\(steerOffText\(t, why\)\)/);
});
