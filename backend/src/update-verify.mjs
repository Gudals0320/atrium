// P69 새 버전 미리 보기: 업데이트가 이 폴더로 바꾸기 전에 부른다(update.mjs verifyRoot). 판을 열지 않고 모듈만 불러와 본다.
// 출력: 마지막 줄에 JSON { version, node, engines, protocols, herdrProtocols, hcGenerations, problems }
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
  const cfg = await import('./config.mjs');
  const { HC_PIN } = await import('./hc/pin.mjs');
  out.herdrProtocols = cfg.HERDR_PROTOCOLS;
  out.hcGenerations = [HC_PIN.generation];
  // P123: 0.1.6까지의 업데이터는 지금 도는 터미널 서버의 프로토콜 하나를 protocols에서 찾는다. hc 판은 hc 세대(1)를 넘기므로
  // herdr 프로토콜과 hc 세대를 함께 둔다(그래야 옛 업데이터가 hc 판에서도 이 버전으로 올라온다). 새 업데이터는 위 두 칸을 따로 본다
  out.protocols = [...new Set([...cfg.HERDR_PROTOCOLS, ...out.hcGenerations])];
  await import('./client.mjs');
  await import('./backend.mjs');
} catch (e) { out.problems.push(`불러오기 실패: ${String((e && e.message) || e).slice(0, 300)}`); }
console.log(JSON.stringify(out));
process.exit(0);
