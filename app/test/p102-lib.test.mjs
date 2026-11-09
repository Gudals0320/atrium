// P102 단위 시험: 미션 맵의 일하는 카드 번쩍임(PC styles.css·휴대폰 phone.css P102 덩어리, lib/mission-flash.js).
// opacity만 움직임, no-preference 안에서만 돎(움직임 줄이기면 멈춘 굵은 테두리), 초당 번쩍임 3번 이하, 휴대폰은 steps로 낮은 박자,
// 모든 카드가 같은 박자(시작 시각을 문서 시간 0에), 일하는 카드에만 층, 가벼움(filter·will-change·그림자 없음), 글 대비, 다른 시험이 기대는 꼴(0.x 투명도, reduce 덩어리 없음)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignFlash, onFlashStart } from '../src/renderer/lib/mission-flash.js';

const FLASH_MS = { pc: 1400, phone: 1600 }; // CSS 주기(styles.css·phone.css P102 덩어리)

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const block = (css, tag) => { const a = css.indexOf(`/* ---------- ${tag}:`); assert.ok(a >= 0, `${tag} 덩어리`); const b = css.indexOf('/* ---------- P', a + 10); return css.slice(a, b < 0 ? undefined : b); };
const noComments = (s) => s.replace(/\/\*[^]*?\*\//g, '');
const media = (s) => (s.match(/@media \(prefers-reduced-motion: no-preference\) \{([^]*?)\n\}/) || [])[1] || '';
const keyframes = (s, name) => (s.match(new RegExp(`@keyframes ${name} \\{([^]*?\\})\\s*\\}`)) || [])[1] || '';
// 키프레임 [{ at, opacity, props }]
const frames = (k) => [...k.matchAll(/(\d+)%\s*\{([^}]*)\}/g)].map((m) => ({ at: Number(m[1]) / 100, opacity: Number((m[2].match(/opacity:\s*([\d.]+)/) || [])[1]), props: [...m[2].matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]).filter((x) => x !== 'animation-timing-function') }));
// 한 주기 안의 정점 수(투명도가 올랐다 내려가는 곳)
const peaks = (fs_) => { const v = fs_.map((f) => f.opacity); let n = 0; for (let i = 0; i < v.length - 1; i++) { const p = v[(i - 1 + v.length - 1) % (v.length - 1)], c = v[i], nx = v[i + 1]; if (c > p && c >= nx) n++; } return n; };
const durOf = (s, name) => { const m = s.match(new RegExp(`animation:\\s*${name}\\s+([\\d.]+)s`)); return m ? Number(m[1]) * 1000 : null; };

test('박자: 움직임이 시작되면 시작 시각을 문서 시간 0에 맞춘다(언제 생긴 카드든 같은 박자), 없는 API에도 던지지 않는다', () => {
  // 다른 때 시작한 두 움직임 → 둘 다 startTime 0(같은 문서 시간에서 같은 자리)
  const a1 = { startTime: 1234.5 }, a2 = { startTime: 98765 }, a3 = { startTime: 0 };
  let sets = 0;
  const watched = (a) => new Proxy(a, { set(o, k, v) { if (k === 'startTime') sets++; o[k] = v; return true; } });
  const el = { getAnimations: () => [watched(a1), watched(a2), watched(a3)] };
  alignFlash(el);
  assert.deepEqual([a1.startTime, a2.startTime, a3.startTime], [0, 0, 0]);
  assert.equal(sets, 2, '이미 맞은 움직임은 건드리지 않는다');
  onFlashStart({ currentTarget: el });
  assert.equal(sets, 2, '두 번째 animationstart에서는 바꿀 것이 없다');
  // 없는 API·막힌 setter
  alignFlash(null); alignFlash({}); alignFlash({ getAnimations: () => [Object.defineProperty({}, 'startTime', { get: () => 5, set: () => { throw new Error('no'); } })] });
});

test('CSS PC: 번쩍임은 opacity만, no-preference 안에서만 돈다, 초당 3번 이하, 주기는 lib와 같다', () => {
  const css = read('styles.css');
  const p = block(css, 'P102'), body = noComments(p);
  const k = frames(keyframes(p, 'mt-mm-flash'));
  assert.ok(k.length >= 3 && k.every((f) => f.props.length && f.props.every((x) => x === 'opacity')), `키프레임은 opacity만 ${JSON.stringify(k)}`);
  const inMedia = media(p);
  assert.match(inMedia, /\.mt-mm-flash \{[^}]*animation: mt-mm-flash /);
  assert.ok(!/animation\s*:/.test(body.replace(/@media \(prefers-reduced-motion: no-preference\) \{[^]*?\n\}/, '')), '움직임은 no-preference 안에만');
  const dur = durOf(inMedia, 'mt-mm-flash');
  assert.equal(dur, FLASH_MS.pc, 'PC 주기 1.4초');
  const perSec = peaks(k) / (dur / 1000);
  assert.ok(peaks(k) === 1 && perSec <= 3, `초당 번쩍임 ${perSec}`);
  assert.ok(perSec <= 1, '한 주기에 한 번, 1초에 한 번 아래(차분하게)');
  assert.ok(Math.max(...k.map((f) => f.opacity)) === 1 && Math.min(...k.map((f) => f.opacity)) >= 0.2, '바닥도 0.2 아래로 내려가지 않는다(완전히 꺼지지 않는다)');
});

test('CSS PC: 기본(움직임 줄이기·가벼운 판)은 움직이지 않는 강한 표시, 가볍다, 다른 시험이 기대는 꼴', () => {
  const css = read('styles.css');
  const p = block(css, 'P102'), body = noComments(p);
  const base = body.replace(/@media[^]*?\n\}/g, '');
  const rule = (base.match(/\n\.mt-mm-flash \{([^}]*)\}/) || [])[1] || '';
  assert.match(rule, /border: 2px solid var\(--mm-run\)/, '굵은(2px) 상태 색 테두리');
  assert.ok(!/opacity/.test(rule) && !/animation/.test(rule), '기본은 다 보이고 움직이지 않는다');
  assert.match(rule, /z-index: -1/); assert.match(rule, /pointer-events: none/);
  assert.match(base, /\.mt-mm-card\.t-work \{[^}]*--mm-run: var\(--st-working\);[^}]*isolation: isolate;/, '카드가 층을 글 아래에 둔다');
  assert.match(base, /\.mt-mm-card\.t-work\.shell \{ --mm-run: var\(--st-shell_running\); \}/, '일하는 셸은 초록');
  assert.match(base, /html\.mt-lite \.mt-mm-flash \{ opacity: 1;/, '가벼운 판(움직임 끔)에서도 강한 표시');
  assert.ok(!/filter|backdrop-filter|will-change|box-shadow/.test(body), 'filter·will-change·그림자 없음');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(body), '색은 토큰만');
  assert.ok(!/opacity:\s*\.\d/.test(body), '투명도는 0.x로 적는다(P85 시험)');
  assert.ok(!/prefers-reduced-motion: reduce/.test(p), 'reduce 덩어리를 더하지 않는다(P85 시험은 마지막 reduce 덩어리를 읽는다)');
  assert.ok(!/mt-mm-glint|mt-mm-sweep/.test(noComments(css)), 'P101 빛줄기는 걷었다');
});

test('CSS 휴대폰: opacity 한 겹, steps로 낮은 박자, no-preference 안에서만, 가볍다(P89)', () => {
  const ph = read('phone.css');
  const p = block(ph, 'P102'), body = noComments(p);
  const k = frames(keyframes(p, 'mt-pm-flash'));
  assert.ok(k.length >= 2 && k.every((f) => f.props.every((x) => x === 'opacity')), `키프레임은 opacity만 ${JSON.stringify(k)}`);
  const inMedia = media(p);
  assert.match(inMedia, /\.mt-pm-flash \{[^}]*animation: mt-pm-flash [\d.]+s steps\(1, end\) infinite;/, 'steps(1, end): 바뀌는 때에만 깨어난다');
  assert.ok(!/animation\s*:/.test(body.replace(/@media \(prefers-reduced-motion: no-preference\) \{[^]*?\n\}/, '')), '움직임은 no-preference 안에만');
  const dur = durOf(inMedia, 'mt-pm-flash');
  assert.equal(dur, FLASH_MS.phone, '휴대폰 주기 1.6초');
  const changes = k.filter((f, i) => i > 0 && f.opacity !== k[i - 1].opacity).length + (k[k.length - 1].opacity !== k[0].opacity ? 1 : 0);
  assert.equal(changes, 2, '한 주기에 투명도는 두 번만 바뀐다(밝게 → 옅게 → 밝게)');
  assert.ok(peaks(k) / (dur / 1000) <= 1, '초당 번쩍임 1번 아래');
  const base = body.replace(/@media[^]*?\n\}/g, '');
  assert.match(base, /\n\.mt-pm-flash \{[^}]*border: 2px solid var\(--mm-run\);/, '움직임 줄이기면 굵은 상태 색 테두리');
  assert.ok(!/filter|backdrop-filter|will-change|box-shadow/.test(body), 'filter·will-change·그림자 없음');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(body), '색은 토큰만');
});

test('그리기: 일하는 카드에만 번쩍임 층(PC 카드, 휴대폰 카드), 시작하면 박자를 맞춘다', () => {
  const pc = read('Mission.jsx'), ph = read('PhoneMission.jsx');
  assert.match(pc, /\{tier === 'work' && <span className="mt-mm-flash" data-role="mm-flash" aria-hidden="true" onAnimationStart=\{onFlashStart\} \/>\}/);
  assert.match(ph, /\{r\.tier === 'work' && <span className="mt-pm-flash" data-role="pm-flash" aria-hidden="true" onAnimationStart=\{onFlashStart\} \/>\}/);
  // PC 층은 카드(.mt-mm-card) 안에만, 한 줄·동그라미에는 없다
  const pcRows = pc.slice(pc.indexOf("if (b.kind === 'dot')"), pc.indexOf('<div className={`mt-mm-card'));
  assert.ok(!/mt-mm-flash/.test(pcRows), 'PC 한 줄·동그라미에는 층이 없다');
  // 휴대폰 층은 카드(button.mt-pm-node) 안에만, 한 줄·동그라미에는 없다
  const card = ph.slice(ph.indexOf('<button type="button" className={`mt-pm-node'));
  assert.ok(card.indexOf('mt-pm-flash') > 0 && card.indexOf('mt-pm-flash') < card.indexOf('</button>'));
  assert.ok(!/mt-pm-flash/.test(ph.slice(ph.indexOf("if (n.kind === 'dot')"), ph.indexOf('const team = r.team'))), '휴대폰 한 줄·동그라미에는 층이 없다');
});

test('글 대비: 움직이지 않는 표시(옅은 바탕 6%)에서 모든 글 4.5 이상, 번쩍임 정점(20%)에서도 이름 7 이상·둘째 줄 4.4 이상', () => {
  const tk = read('tokens.css');
  const hex = (name) => { const m = tk.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i')); assert.ok(m, name); return [1, 3, 5].map((i) => parseInt(m[1].slice(i, i + 2), 16)); };
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const mix = (a, b, t) => a.map((x, i) => x * t + b[i] * (1 - t));
  const ratio = (a, b) => { const [h, l] = L(a) > L(b) ? [L(a), L(b)] : [L(b), L(a)]; return (h + 0.05) / (l + 0.05); };
  const css = noComments(block(read('styles.css'), 'P102'));
  const still = Number(css.match(/\n\.mt-mm-flash \{[^}]*var\(--mm-run\) (\d+)%/)[1]) / 100;
  const peak = Number(media(css).match(/var\(--mm-run\) (\d+)%/)[1]) / 100;
  for (const run of ['st-working', 'st-shell_running']) for (const card of ['mm-card-2', 'mm-card-lead-2']) {
    const bgStill = mix(hex(run), hex(card), still), bgPeak = mix(hex(run), hex(card), peak);
    for (const t of ['text', 'text-2', 'dim', 'dim-2']) assert.ok(ratio(hex(t), bgStill) >= 4.5, `${run}/${card} 멈춘 표시 위 ${t} ${ratio(hex(t), bgStill).toFixed(2)}`);
    assert.ok(ratio(hex('text'), bgPeak) >= 7, `${run}/${card} 정점 위 이름 ${ratio(hex('text'), bgPeak).toFixed(2)}`);
    assert.ok(ratio(hex('dim'), bgPeak) >= 4.4, `${run}/${card} 정점 위 둘째 줄 ${ratio(hex('dim'), bgPeak).toFixed(2)}`);
  }
});
