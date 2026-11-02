// P4 창 시험 공통: 화면 맞추기, 승인 카드 누르기, 기다리기. MT_E2E_OUT=p4로 돈다.
import { sleep, until } from './harness.mjs';

export const linksOf = (page) => page.evaluate(() => [...window.__mt.getState().links.values()].map((l) => ({ id: l.linkId, from: l.fromName, to: l.toName, role: l.role, spawned: l.spawned, observed: l.observed, lastText: l.lastText, lastKind: l.lastKind, count: l.count })));
export const sid = (page, name) => page.evaluate((n) => { for (const s of window.__mt.getState().sessions.values()) if (s.name === n) return s.sessionId; return null; }, name);
export const stateOf = (page, name) => page.evaluate((n) => { for (const s of window.__mt.getState().sessions.values()) if (s.name === n) return s.state; return null; }, name);

// 이름 붙은 노드들이 한 화면에 들어오게(배율 상한 maxZoom)
export async function frame(page, names, { maxZoom = 0.6, pad = 80 } = {}) {
  await page.evaluate(([ns, mz, p]) => {
    const st = window.__mt.getState();
    const rs = [...st.sessions.values()].filter((s) => ns.includes(s.name)).map((s) => st.nodes.get(s.sessionId)).filter(Boolean);
    if (!rs.length) return;
    const x0 = Math.min(...rs.map((r) => r.x)) - p, y0 = Math.min(...rs.map((r) => r.y)) - p;
    const x1 = Math.max(...rs.map((r) => r.x + r.w)) + p, y1 = Math.max(...rs.map((r) => r.y + r.h)) + p;
    const el = document.querySelector('.mt-canvas');
    const z = Math.min(mz, el.clientWidth / (x1 - x0), el.clientHeight / (y1 - y0));
    st.setViewport({ x: (el.clientWidth - (x1 - x0) * z) / 2 - x0 * z, y: (el.clientHeight - (y1 - y0) * z) / 2 - y0 * z, zoom: z });
  }, [names, maxZoom, pad]);
  await sleep(900);
}

// 세션이 권한 요청(내 차례)이면 승인 카드의 1번을 누른다. 누른 요청을 돌려준다
export async function approveCards(page, name, log, { max = 6 } = {}) {
  const done = [];
  for (let i = 0; i < max; i++) {
    const ask = await page.evaluate((n) => { for (const s of window.__mt.getState().sessions.values()) if (s.name === n && s.state === 'waiting' && s.ask && s.ask.kind === 'permission') return s.ask.summary; return null; }, name);
    if (!ask) break;
    await frame(page, [name], { maxZoom: 0.8 });
    const btn = page.locator(`.mt-node[data-name="${name}"] .mt-card button[data-choice="1"]`);
    await btn.waitFor({ timeout: 10000 });
    await btn.click();
    log(`@${name} 승인 카드 1번 누름: ${ask}`);
    done.push(ask);
    await sleep(1500);
  }
  return done;
}

// 세션이 일을 마칠 때까지(ready). 그동안 권한 요청은 카드로 승인한다
export async function runUntilReady(page, name, log, { timeout = 180000, onTick } = {}) {
  const t0 = Date.now();
  let sawWork = false;
  for (;;) {
    const st = await stateOf(page, name);
    if (st === 'working' || st === 'waiting') sawWork = true;
    if (st === 'waiting') await approveCards(page, name, log);
    if (onTick) await onTick();
    if (sawWork && st === 'ready') return true;
    if (Date.now() - t0 > timeout) throw new Error(`${name}: ${timeout}ms 안에 끝나지 않음(${st})`);
    await sleep(400);
  }
}

// 선 위 글을 배율 1로 가운데에 두고 그 둘레를 찍는다(선 글은 판 배율대로 작아진다)
export async function labelShot(page, linkId, file, shotFn, log, { zoom = 1, w = 1100, h = 520 } = {}) {
  const box = await page.evaluate(([id, z]) => {
    const e = document.querySelector(`.mt-edge-label[data-link="${id}"], .mt-edge-label[data-repo-edge="${id}"]`);
    if (!e) return null;
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(e.style.transform);
    if (!m) return null;
    const el = document.querySelector('.mt-canvas');
    window.__mt.getState().setViewport({ x: el.clientWidth / 2 - Number(m[1]) * z, y: el.clientHeight / 2 - Number(m[2]) * z, zoom: z });
    const r = el.getBoundingClientRect();
    return { cx: r.left + el.clientWidth / 2, cy: r.top + el.clientHeight / 2 };
  }, [linkId, zoom]);
  if (!box) { log(`선 ${linkId}가 화면에 없다`); return null; }
  await sleep(900);
  const file2 = await shotFn(page, file, log);
  await page.screenshot({ path: file2.replace(/\.png$/, '-crop.png'), clip: { x: Math.max(0, box.cx - w / 2), y: Math.max(0, box.cy - h / 2), width: w, height: h } });
  log(`확대 스크린숏 ${file}-crop.png`);
  return file2;
}

export async function sendBar(page, text) {
  await page.click('[data-role=command]');
  await page.keyboard.insertText(text);
  await page.keyboard.press('Enter');
}
export { until, sleep };
