// P69 새 버전 미리 보기: 업데이트가 이 폴더로 바꾸기 전에 부른다(update.mjs verifyRoot). 판을 열지 않고 모듈만 불러와 본다.
// 출력: 마지막 줄에 JSON { version, node, engines, protocols, herdrProtocols(옛 업데이터용), hcGenerations, problems }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const out = { version: null, node: process.versions.node, engines: null, protocols: null, problems: [] };
try {
  const { nodeSatisfies, versionOfRoot } = await import('./update.mjs');
  out.version = versionOfRoot(ROOT);
  out.engines = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8')).engines?.node || null;
  if (!nodeSatisfies(out.node, out.engines)) out.problems.push(`Node ${out.node}가 ${out.engines}에 맞지 않음`);
  const { HC_PIN } = await import('./hc/pin.mjs');
  out.hcGenerations = [HC_PIN.generation];
  // P123·P129: 옛 업데이터(0.1.7까지)는 지금 도는 터미널 서버의 프로토콜 하나를 protocols(또는 herdrProtocols)에서 찾는다.
  // 옛 판(옛 터미널 백엔드)의 업데이터도 이 버전으로 올라오게 옛 프로토콜을 함께 낸다. 이 버전은 뜰 때 그 판을 hc로 옮긴다(P132: 옛 판 옮기기와 함께 계속 둔다)
  const { HERDR_PROTOCOLS } = await import('./herdr-migrate/index.mjs');
  out.herdrProtocols = HERDR_PROTOCOLS;
  out.protocols = [...new Set([...HERDR_PROTOCOLS, ...out.hcGenerations])];
  await import('./client.mjs');
  await import('./backend.mjs');
} catch (e) { out.problems.push(`불러오기 실패: ${String((e && e.message) || e).slice(0, 300)}`); }
console.log(JSON.stringify(out));
process.exit(0);
