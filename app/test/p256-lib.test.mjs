// P256 단위 시험: 휴대폰은 세션 맵으로 열고(세션 목록 화면 없음, 목록에만 있던 길은 맵 머리줄로), 세션 맵 위 검은 구간이 없고(맵 칸 규칙),
// 사용량 알약은 대표 구독 하나(기본 Claude, 고르면 바뀌고 기기에 기억, 자료가 없으면 다음 구독)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDERS, REP_KEY, REP_DEFAULT, loadRep, saveRep, repOrder, repPart, pillOf } from '../src/renderer/lib/usage.js';
import { translate } from '../src/renderer/lib/i18n.js';
import { PM, phoneFit } from '../src/renderer/lib/phone-map.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const src = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const NOW = Date.parse('2026-11-20T00:00:00Z');
const W = (id, usedPct) => ({ id, usedPct, resetsAt: NOW + 3600000 });
const view = { providers: {
  claude: { provider: 'claude', at: NOW, windows: [W('5h', 30), W('week', 41)] },
  codex: { provider: 'codex', at: NOW, windows: [W('5h', 92)] },
  agy: { provider: 'agy', at: NOW, windows: [W('gemini-5h', 12)] },
} };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

test('P256 휴대폰 기본 화면은 세션 맵, 세션 목록 화면과 그 길(목록 단추·목록으로 돌아가기)이 없다', () => {
  const p = src('Phone.jsx');
  assert.ok(!/function PhoneList\(/.test(p), '목록 화면 함수가 없다');
  assert.ok(!/<PhoneList\b/.test(p), '목록 화면을 그리지 않는다');
  assert.ok(!/data-role="phone-list"/.test(p) && !/'list'\}/.test(p));
  assert.match(p, /data-view=\{s \? 'session' : 'mission'\}/, '세션을 열지 않았으면 세션 맵');
  assert.match(p, /: <PhoneMission key=\{mapKey\} onOpen=\{\(id\) => go\(id\)\} head=\{<PhoneHead/, '바탕은 PhoneMission(세션 맵)');
  // 세션 화면의 뒤로는 맵으로(목록 글 없음)
  assert.ok(!/t\('phone\.list'\)/.test(p) && !/t\('phone\.back'\)/.test(p));
  for (const f of ['PhoneMap.jsx', 'PhoneMission.jsx']) {
    const s = src(f);
    assert.ok(!/phone-mission-back/.test(s), `${f}: 목록으로 돌아가는 단추 없음`);
    assert.match(s, /<header className="mt-ph-head">\{head\}<\/header>/, `${f}: 머리줄은 PhoneHead`);
  }
});

test('P256 목록에만 있던 길은 맵 머리줄(PhoneHead)에: 로고, 연결, 사용량, 알림, 새 세션', () => {
  const p = src('Phone.jsx');
  const i = p.indexOf('function PhoneHead('), j = p.indexOf('\n}\n', i);
  const head = p.slice(i, j);
  for (const want of ['mt-ph-brand', '<ConnPill />', '<UsagePill compact />', '<PushButton', '<PushSheet', 'data-action="phone-new"', 'onClick={onNew}']) assert.ok(head.includes(want), want);
  assert.match(p, /<PhoneHead onNew=\{\(\) => setSpawn\(true\)\} \/>/, '+ 단추가 새 세션 시트를 연다');
  assert.match(p, /tip=\{<InstallTip \/>\}/, '홈 화면 설치 안내도 맵 위에');
  // 응답 필요로 가기: 맵 위 알약(기다리는 세션 → 그 카드)과 세션 화면의 "다음"
  assert.match(src('PhoneMap.jsx'), /data-role="pl-attn"/);
  assert.match(p, /data-action="phone-next-need"/);
});

// CSS 규칙의 무게(아이디, 클래스·속성, 태그) — 이 시험에 필요한 만큼만(:is 등 없음)
const weight = (sel) => { const s = sel.replace(/::?[a-z-]+(\([^)]*\))?/g, (m) => (m.startsWith('::') ? ' x' : '.p')); return [(s.match(/#/g) || []).length, (s.match(/[.[]/g) || []).length, (s.match(/(^|[\s>+~])[a-z]/g) || []).length]; };
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const rulesFor = (css, target) => { const out = []; const re = /([^{}]+)\{([^}]*)\}/g; let m; while ((m = re.exec(css))) { for (const sel of m[1].split(',').map((x) => x.replace(/\/\*[\s\S]*?\*\//g, '').trim())) { if (sel.endsWith(target) && /(^|;)\s*top\s*:/.test(m[2])) out.push({ sel, top: /top\s*:\s*([^;]+)/.exec(m[2])[1].trim(), w: weight(sel) }); } } return out; };

test('P256 검은 구간 없음: 휴대폰 세션 맵 칸(.mt-pmap-stage.mt-sm)의 캔버스는 머리 아래 0에서 시작한다(PC 위 줄 60px 규칙을 이긴다)', () => {
  const pc = rulesFor(src('styles.css'), '.mt-ta-vp');
  const ph = rulesFor(src('phone.css'), '.mt-ta-vp');
  const pc60 = pc.find((r) => r.sel === '.mt-sm .mt-ta-vp');
  assert.ok(pc60 && pc60.top === '60px', 'PC 세션 맵은 위 줄 자리 60px');
  const fix = ph.find((r) => r.sel.includes('.mt-pmap') && r.sel.includes('.mt-sm'));
  assert.ok(fix, '휴대폰 맵 칸 규칙');
  assert.equal(fix.top, '0');
  // 휴대폰 맵 칸(.mt-pmap > .mt-pmap-stage.mt-ta.mt-sm > .mt-ta-vp)에 맞는 규칙 가운데 가장 무거운 것이 top 0
  const applies = (sel) => ['.mt-ta-vp', '.mt-sm .mt-ta-vp', '.mt-pmap .mt-ta-vp', '.mt-pmap .mt-pmap-stage.mt-sm .mt-ta-vp'].includes(sel);
  const all = [...pc, ...ph].filter((r) => applies(r.sel));
  const best = all.reduce((a, r) => (cmp(r.w, a.w) >= 0 ? r : a));
  assert.equal(best.top, '0', JSON.stringify(all));
  assert.ok(cmp(fix.w, pc60.w) > 0, '같은 무게면 싣는 차례에 따라 60px가 이길 수 있다');
});

test('P256 맞춤은 위에 붙인다: 폭에 맞춰 높이가 남아도 맵 위가 비지 않고, 세로로 긴 세계는 전과 같다', () => {
  const wide = { x: 40, y: 100, w: 1000, h: 800 };
  const f = phoneFit(wide, 390, 619);
  assert.ok(Math.abs(f.k - (390 - PM.PAD * 2) / 1000) < 1e-9, '폭에 맞춤');
  assert.ok(Math.abs(wide.y * f.k + f.y - PM.PAD) < 1e-9, '세계 위 끝이 칸 위에서 PAD만큼');
  assert.ok(Math.abs((wide.x + wide.w / 2) * f.k + f.x - 195) < 1e-9, '가로는 가운데');
  const tall = { x: 0, y: 0, w: 1000, h: 4000 };
  const g = phoneFit(tall, 390, 700);
  assert.ok(Math.abs(g.y - PM.PAD) < 1e-9 && g.y + 4000 * g.k <= 700 - PM.DOCK + 1e-6, '세로로 긴 세계: 위 PAD, 줌 단추에 가리지 않는다');
});

test('P256 사용량 대표: 기본 Claude, 자료가 없으면 다음 구독(차례 claude → codex → agy → 처음)', () => {
  assert.deepEqual(PROVIDERS, ['claude', 'codex', 'agy']);
  assert.equal(REP_DEFAULT, 'claude');
  assert.deepEqual(repOrder('claude'), ['claude', 'codex', 'agy']);
  assert.deepEqual(repOrder('codex'), ['codex', 'agy', 'claude']);
  assert.deepEqual(repOrder('agy'), ['agy', 'claude', 'codex']);
  assert.deepEqual(repOrder('nope'), ['claude', 'codex', 'agy']);
  // 기본은 Claude(가장 높은 값인 Codex 92가 아니라)
  const d = repPart(view, undefined, NOW);
  assert.equal(d.provider, 'claude'); assert.equal(d.pct, 41); assert.equal(d.level, 'ok'); assert.equal(d.picked, true);
  assert.equal(pillOf(view, NOW).level, 'high', '점·테두리 색은 전처럼 모든 구독 가운데 가장 높은 값');
  assert.equal(repPart(view, 'codex', NOW).provider, 'codex');
  assert.equal(repPart(view, 'codex', NOW).pct, 92);
  assert.equal(repPart(view, 'agy', NOW).pct, 12, 'AGY는 Gemini 창');
  // 자료 없음 → 다음
  const noClaude = { providers: { ...view.providers, claude: null } };
  assert.equal(repPart(noClaude, 'claude', NOW).provider, 'codex'); assert.equal(repPart(noClaude, 'claude', NOW).picked, false);
  const onlyClaude = { providers: { claude: view.providers.claude, codex: null, agy: { provider: 'agy', at: NOW, windows: [W('3p-5h', 50)] } } };
  assert.equal(repPart(onlyClaude, 'agy', NOW).provider, 'claude', 'AGY에 보일 창이 없으면 다음(끝이면 처음으로)');
  assert.equal(repPart({ providers: {} }, 'claude', NOW), null);
  assert.equal(repPart(null, 'claude', NOW), null);
});

test('P256 사용량 대표 기억: 기기 저장소에, 이상한 값·저장소 없음은 기본 Claude', () => {
  const s = mem();
  assert.equal(loadRep(s), 'claude');
  assert.equal(saveRep(s, 'codex'), true);
  assert.equal(s.m.get(REP_KEY), 'codex');
  assert.equal(loadRep(s), 'codex');
  assert.equal(saveRep(s, 'gpt'), false); assert.equal(loadRep(s), 'codex');
  s.setItem(REP_KEY, 'weird'); assert.equal(loadRep(s), 'claude');
  assert.equal(loadRep(null), 'claude'); assert.equal(saveRep(null, 'agy'), false);
  const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.equal(loadRep(broken), 'claude'); assert.equal(saveRep(broken, 'agy'), false);
});

test('P256 펼침에서 고르기: compact일 때만 구독 칸을 누를 수 있고 대표 표시, 사전 두 벌', () => {
  const u = src('Usage.jsx');
  assert.match(u, /pick=\{compact \? pickRep : null\}/);
  assert.match(u, /const pickRep = \(k\) => \{ setRep\(k\); saveRep\(lsOf\(\), k\); \}/);
  assert.match(u, /repPart\(v, rep, now\)/);
  for (const lang of ['ko', 'en']) for (const k of ['phoneHead.empty', 'phoneHead.rep', 'phoneHead.repHint']) assert.notEqual(translate(lang, k), k, `${lang} ${k}`);
  assert.match(translate('ko', 'phoneHead.empty'), /\+/);
});
