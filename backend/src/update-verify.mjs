// P69 새 버전 미리 보기: 업데이트가 이 폴더로 바꾸기 전에 부른다(update.mjs verifyRoot). 판을 열지 않고 모듈만 불러와 본다.
// 출력: 마지막 줄에 JSON { version, node, engines, protocols, problems }
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
  out.protocols = cfg.HERDR_PROTOCOLS;
  await import('./client.mjs');
  await import('./backend.mjs');
} catch (e) { out.problems.push(`불러오기 실패: ${String((e && e.message) || e).slice(0, 300)}`); }
console.log(JSON.stringify(out));
process.exit(0);
