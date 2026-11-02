// P3 완료 기준 5(A3): 마지막으로 본 뒤 바뀐 것(새로 생긴 내 차례, 끝난 턴, 오류, 종료)을 한 줄씩 보여준다(changes.since).
// 창을 닫고 그동안 바뀐 것을 만든 뒤 창을 다시 연다. "오래"를 8초로 줄여(?awaySec=8) 본다. 기본값은 5분이다.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, shot, logger, sleep, until, REPO } from './harness.mjs';

const log = logger('a3-return');
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', cwd: path.join(REPO, 'backend') });
let { app, page } = await launch({ log, query: '?awaySec=8' });
const seen = await page.evaluate(() => window.__mt.api.call('board.markSeen', {}));
log('판을 본 시각', new Date(seen.seenAt).toISOString());
await app.close();

// 창이 닫힌 동안: a의 턴, b의 권한 요청(내 차례), exp-3 끄기(종료)
log(atrium('send', '@a', 'Reply with exactly: while-away-a', '--wait').trim().split('\n').slice(-1)[0]);
atrium('send', '@b', 'Use the Write tool to create a3-b.txt containing hi. Use no other tool.');
log(atrium('kill', 'exp-3', '--yes').match(/closed: \w+/)[0]);
for (let i = 0; i < 60; i++) { if (/b\s+waiting/.test(atrium('ls'))) break; await sleep(1000); }
log(atrium('changes', '--minutes', '2'));
await sleep(4000);

({ app, page } = await launch({ log, query: '?awaySec=8' }));
await until(() => page.evaluate(() => !!document.querySelector('[data-role="return-summary"]')), 15000);
const lines = await page.evaluate(() => [...document.querySelectorAll('[data-role="return-summary"] .mt-return-line')].map((l) => l.textContent));
log('복귀 요약', await page.evaluate(() => document.querySelector('[data-role="return-summary"] .mt-card-title').textContent), lines);
await shot(page, 'a3-1-return-summary', log);
// 줄을 누르면 그 세션으로 간다
await page.click('[data-role="return-summary"] .mt-return-line[data-kind="needs_you"]');
await sleep(800);
log('누른 뒤 초점', await page.evaluate(() => { const s = window.__mt.getState(); return s.sessions.get(s.focusId).name; }));
const b = await page.evaluate(() => [...window.__mt.getState().sessions.values()].find((s) => s.name === 'b'));
await page.evaluate((t) => window.__mt.api.call('session.answer', { session: 'b', choice: 'reject', toolUseId: t }), b.ask.toolUseId);
await app.close();
