// P224 창 시험: rig 2 R6 제안과 승인. "규칙이 자라는 반복 작업" 견본(main 자리 haiku, retro 1m, approve human)에서
// 개선 회가 정본 고침을 제안 → 위 오른쪽 "내 차례" 펼침 목록의 제안 카드(패치 보기, ko·en) → 승인 → 정본이 바뀌고 장부에 남음,
// 둘째 제안 거절(한 줄 까닭), 손으로 정본을 고쳤을 때 "승인 안 된 바뀜" 카드(ko·en)와 되돌리기.
// 판: 따로 띄운 개발용 판(atrium-dev-p224, 47998, 데이터 backend/.dev/data)만. 시험 폴더 C:\Workspace\mtask-p224-grow(견본 복사, git 없음).
// 실행: node backend/.dev/mt.cjs node app/test/e2e/p224-proposals.mjs [round]   결과는 experiments/p224/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const MODE = process.argv[3] || 'all'; // all | unapproved(손으로 고친 정본 카드만, 에이전트를 쓰지 않는다)
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p224', TAG);
const DIR = 'C:\\Workspace\\mtask-p224-grow';
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p224' || process.env.ATRIUM_PORT !== '47998') throw new Error('개발용 판(atrium-dev-p224, 47998) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp, until } = await import('./harness.mjs');
const log = logger(`p224-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1500)}` : ''}`); };
const rules = () => fs.readFileSync(path.join(DIR, 'docs', 'rules.txt'), 'utf8');
const asks = () => call('rig.asks').asks;
const ledger = (kinds) => call('rig.events', { workspace: DIR, kinds, limit: 200 }).rows;

async function openInbox(page) {
  const open = await page.$('[data-role=inbox-list]');
  if (!open) await page.click('[data-role=inbox]');
  await page.waitForSelector('[data-role=rig-asks]', { timeout: 20000 });
}
async function closeInbox(page) { if (await page.$('[data-role=inbox-list]')) await page.click('[data-role=inbox]'); await sleep(200); }
async function shotList(page, name) {
  const box = await page.locator('[data-role=inbox-list]').boundingBox();
  const tr = await page.locator('[data-role=inbox]').boundingBox();
  const x = Math.min(box.x, tr.x) - 10, y = tr.y - 10;
  await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x, y, width: Math.max(box.x + box.width, tr.x + tr.width) - x + 10, height: box.y + box.height - y + 10 } });
  log(`스크린숏 ${name}.png`);
}
async function setLang(page, lang) {
  call('settings.set', { key: 'language', value: lang });
  await page.waitForFunction((l) => document.documentElement.lang === l, lang, { timeout: 10000 }).catch(() => {});
  await sleep(400);
}

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9478'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 960 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  const before = rules();
  if (MODE === 'all') {
  // 1) 개선 회가 제안을 낸다(haiku). 첫 제안 카드를 기다린다
  log('제안을 기다린다(retro 회)');
  const first = await until(() => asks().find((a) => a.kind === 'proposal'), 8 * 60000, 3000);
  check('개선 회가 정본 제안을 냈다(사람 승인 카드)', first && first.proposal.route === 'human', { target: first.proposal.target, why: first.proposal.why, loop: first.proposal.loop, added: first.proposal.added, removed: first.proposal.removed, file: first.proposal.file });
  check('승인 전 정본은 그대로', rules() === before);
  const made = ledger('proposal_made'); check('장부 proposal_made', made.some((r) => r.ref === first.proposal.id), made.map((r) => r.shown));
  const arts = call('rig.artifacts', { workspace: DIR, sector: 'proposals' }); check('proposals 섹터에 등록(산출물 행)', arts.artifacts.some((a) => a.path === first.proposal.file && a.source === 'proposal'), arts.artifacts.map((a) => `${a.path} ${a.state}`));
  for (const lang of ['ko', 'en']) {
    await setLang(page, lang);
    await openInbox(page);
    const card = page.locator(`[data-ask="${first.id}"]`);
    await card.locator('[data-action=rig-ask-diff]').click();
    await page.waitForSelector(`[data-ask="${first.id}"] [data-role=rig-ask-diff]`);
    const text = await card.innerText();
    check(`[${lang}] 제안 카드: 제목·까닭·패치 보기·승인·거절`, /\+/.test(text) && (await card.locator('[data-action=rig-ask-approve]').count()) === 1, text.replace(/\s+/g, ' ').slice(0, 300));
    await shotList(page, `proposal-card-${lang}`);
    await card.locator('[data-action=rig-ask-diff]').click();
    await closeInbox(page);
  }
  // 2) 승인(ko)
  await setLang(page, 'ko');
  await openInbox(page);
  await page.locator(`[data-ask="${first.id}"] [data-action=rig-ask-approve]`).click();
  await until(() => rules() !== before, 20000, 300);
  check('승인 → 보드가 정본에 반영', rules() !== before, rules());
  const dec = ledger('proposal_decided,proposal_applied');
  check('장부 proposal_decided approved · proposal_applied applied', dec.some((r) => r.kind === 'proposal_decided' && r.value === 'approved' && r.ref === first.proposal.id) && dec.some((r) => r.kind === 'proposal_applied' && r.value === 'applied' && r.ref === first.proposal.id), dec.map((r) => r.shown));
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'approved-toast-ko.png'), clip: { x: 0, y: 0, width: 1600, height: 960 } });
  await sleep(4500);
  const ch = ledger('doc_changed').filter((r) => r.data && r.data.doc === 'rules');
  check('문서 감시: 보드가 쓴 바뀜(승인된 제안 반영), 승인 안 된 바뀜 아님', ch.length && ch.at(-1).value === 'board' && !ledger('doc_unapproved').length, ch.map((r) => r.shown));
  fs.writeFileSync(path.join(OUT, 'rules-after-approve.txt'), rules());
  // 3) 둘째 제안 → 거절(한 줄 까닭)
  atrium('send', '@main', 'Propose one more rule for docs/rules.txt: "- Write dates as YYYY-MM-DD." Write the whole new file to drafts/rules.txt with the Write tool and run atrium rig propose --target rules --file drafts/rules.txt --why "dates came in three formats". Then atrium done ok "proposed".');
  const second = await until(() => asks().find((a) => a.kind === 'proposal' && a.id !== first.id), 5 * 60000, 3000);
  check('둘째 제안 카드', !!second, second && second.proposal.why);
  await openInbox(page);
  const c2 = page.locator(`[data-ask="${second.id}"]`);
  await c2.locator('[data-action=rig-ask-reject]').click();
  await page.fill(`[data-ask="${second.id}"] [data-role=rig-ask-reason]`, '날짜 형식은 프로젝트마다 달라 전역 규칙으로 두지 않는다');
  await shotList(page, 'reject-reason-ko');
  await c2.locator('[data-action=rig-ask-reject-send]').click();
  await until(() => !asks().some((a) => a.id === second.id), 20000, 300);
  const rj = call('rig.proposal', { id: second.proposal.id }).proposal;
  check('거절: 상태 rejected, 까닭이 남음, 정본은 그대로', rj.state === 'rejected' && /날짜 형식/.test(rj.reason) && !/YYYY-MM-DD/.test(rules()), { state: rj.state, reason: rj.reason });
  await closeInbox(page);
  }
  // 4) 손으로 정본을 고친다 → 승인 안 된 바뀜
  const approved = rules();
  fs.writeFileSync(path.join(DIR, 'docs', 'rules.txt'), approved + '- Hand-written rule without approval.\n');
  const un = await until(() => asks().find((a) => a.kind === 'doc_unapproved'), 30000, 500);
  check('승인 안 된 바뀜 카드', un && un.doc === 'rules', { by: un.by, who: un.who, diff: un.diff });
  for (const lang of ['ko', 'en']) {
    await setLang(page, lang);
    await openInbox(page);
    const card = page.locator(`[data-ask="${un.id}"]`);
    await card.locator('[data-action=rig-ask-diff]').click();
    await shotList(page, `unapproved-card-${lang}`);
    await card.locator('[data-action=rig-ask-diff]').click();
    await closeInbox(page);
  }
  await setLang(page, 'ko');
  await openInbox(page);
  await page.locator(`[data-ask="${un.id}"] [data-action=rig-ask-revert]`).click();
  await until(() => rules() === approved, 20000, 300).catch(async (e) => { log('되돌리기 뒤 창: ' + (await page.evaluate(() => document.body.innerText.slice(0, 600)))); throw e; });
  check('되돌리기 → 승인된 내용', rules() === approved);
  check('장부 doc_unapproved · doc_reverted', ledger('doc_unapproved').length >= 1 && ledger('doc_reverted').length >= 1, ledger('doc_unapproved,doc_reverted').map((r) => r.shown));
  await closeInbox(page);
  fs.writeFileSync(path.join(OUT, 'ledger.txt'), call('rig.events', { workspace: DIR, limit: 500 }).rows.map((r) => r.shown).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'proposals.json'), JSON.stringify(call('rig.proposals', { workspace: DIR }), null, 2));
} catch (e) { check('예외', false, e.stack); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
  await closeApp(app);
  process.exit(0);
}
