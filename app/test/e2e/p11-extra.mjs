// P11 창 시험(시나리오 8·9): 그룹(얇은 테두리와 이름표), 메모, 칸반 노드의 생김새를 찍는다. s1(mtask-p11-plain)이 있는 P11 판에서 돈다. 만든 것은 끝에 지운다.
// 사용: node experiments/p11/tools/e2e.cjs p11-extra.mjs
import path from 'node:path';
import { launch, closeApp, logger, sleep, call, state, OUT } from './p10-lib.mjs';

const log = logger('p11-extra');
const { app, page } = await launch({ log });
const made = {};
try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1528, 960));
  if (await page.$('[data-role="sidebar"]')) await page.click('[data-action="sidebar"]');
  const s = await state(page);
  const s1 = s.sessions.find((x) => x.name === 's1');
  const r = s.nodes.s1;
  made.group = await call(page, 'group.create', { members: [s1.id], name: 'review' });
  made.memo = await call(page, 'memo.create', { workspace: s1.ws, near: { x: r.x + r.w + 80, y: r.y }, body: '# 메모\n- 결제 재시도 정리\n- [ ] 시험 더하기' });
  made.kanban = await call(page, 'kanban.create', { workspace: s1.ws, near: { x: r.x + r.w + 80, y: r.y + 300 }, title: '할 일' });
  await sleep(1500);
  await page.evaluate(() => window.__mt.getState().fitWorkspace(window.__mt.getState().sessions.get([...window.__mt.getState().sessions.keys()].find((k) => window.__mt.getState().sessions.get(k).name === 's1')).workspaceKey));
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'p11-extra-group-memo-kanban.png') });
  log('찍음');
} finally {
  try { if (made.memo) await call(page, 'memo.delete', { memo: made.memo.memoId || made.memo.id, confirm: true }); } catch (e) { log('memo 지우기', e.message); }
  try { if (made.kanban) await call(page, 'kanban.delete', { kanban: made.kanban.kanbanId || made.kanban.id, confirm: true }); } catch (e) { log('kanban 지우기', e.message); }
  try { if (made.group) await call(page, 'group.ungroup', { group: made.group.groupId }); } catch (e) { log('group 풀기', e.message); }
  await closeApp(app);
}
process.exit(0);
