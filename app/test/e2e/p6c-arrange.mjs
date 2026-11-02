// P6c 창 시험: 메모·칸반이 P6a "정리"와 함께 동작한다. 영역 이름표의 "정리"는 그 워크스페이스의 메모·칸반도 블록으로 놓아(크기 그대로, 연결 없는 줄)
// 노드와 겹치지 않게 하고, "되돌리기"는 메모·칸반도 제자리로 돌린다. 끝나면 만든 메모·칸반을 지운다.
// 준비: setup-regress.mjs의 판(plain에 lead, rev, help, s3, 연결 lead → rev·help). 실행: MT_E2E_OUT=p6c node test/e2e/p6c-arrange.mjs
import { launch, logger, closeApp, shot, sleep, until, call, st, allRects, overlaps, wsKeyByName, regionOf } from './p6c-lib.mjs';

const log = logger('p6c-arrange');
const { app, page } = await launch({ log });
let memoId = null, kanbanId = null;
try {
  const key = await wsKeyByName(page, 'mtask-p6c-plain');
  const reg = await regionOf(page, key);
  // 영역 안쪽(노드들 위)에 겹쳐 둔 메모와 칸반: 정리하면 겹치지 않게 놓여야 한다
  memoId = (await call(page, 'memo.create', { text: '# 정리 시험 메모', workspace: key, x: reg.x + 100, y: reg.y + 150 })).memoId;
  kanbanId = (await call(page, 'kanban.create', { title: '정리 시험 칸반', workspace: key, x: reg.x + 500, y: reg.y + 300 })).kanbanId;
  await sleep(800);
  const before = (await allRects(page)).filter((r) => r.ws === key);
  const hits = (rs) => { const out = []; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (overlaps(rs[i], rs[j])) out.push(`${rs[i].name || rs[i].kind}×${rs[j].name || rs[j].kind}`); return out; };
  log('정리 전 겹침', hits(before));
  await page.click(`.mt-wsbtn[data-ws="${key}"]`);
  await sleep(800);
  await shot(page, 'arrange-1-before', log);
  await page.click(`.mt-region[data-ws="${key}"] [data-action=arrange]`);
  await until(async () => { const m = await st(page, (i) => window.__mt.getState().memos.get(i), memoId); return m && (m.x !== before.find((r) => r.id === memoId).x || m.y !== before.find((r) => r.id === memoId).y); }, 10000, 300);
  await sleep(800);
  const after = (await allRects(page)).filter((r) => r.ws === key);
  log('정리 뒤 겹침', hits(after), '메모', after.find((r) => r.id === memoId), '칸반', after.find((r) => r.id === kanbanId));
  await page.click(`.mt-wsbtn[data-ws="${key}"]`);
  await sleep(800);
  await shot(page, 'arrange-2-after-with-memo-kanban', log);
  await page.click(`.mt-region[data-ws="${key}"] [data-action=arrange-undo]`);
  await sleep(1200);
  const undone = (await allRects(page)).filter((r) => r.ws === key);
  const same = (id) => { const a = before.find((r) => r.id === id), b = undone.find((r) => r.id === id); return a.x === b.x && a.y === b.y; };
  log('되돌린 뒤 제자리', { memo: same(memoId), kanban: same(kanbanId), nodes: before.filter((r) => r.kind === 'session').every((r) => same(r.id)) });
  log('끝');
} catch (e) { log('실패', e.stack || e.message); await shot(page, 'arrange-fail', log).catch(() => {}); process.exitCode = 1; }
finally {
  if (memoId) await call(page, 'memo.delete', { memo: memoId, confirm: true }).catch(() => {});
  if (kanbanId) await call(page, 'kanban.delete', { kanban: kanbanId, confirm: true }).catch(() => {});
}
await closeApp(app);
process.exit();
