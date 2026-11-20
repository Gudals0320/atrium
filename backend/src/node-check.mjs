// 이슈 #18: 지원하는 Node 버전 확인. 백엔드(main.mjs), atrium CLI(bin/atrium.mjs), 업데이트 미리 보기(update-verify.mjs)가
// 다른 모듈을 불러오기 전에 부른다. 그래서 이 파일은 node: 내장 모듈만 쓴다(패키지를 불러오지 않는다).
// - Node 22.13.0은 경로에 한글이 있으면 패키지(ws)를 불러올 때 0xC0000005로 끝난다(22.14.0에서 고쳐짐).
//   이 확인은 ws를 부르기 전에 돌아서, 그 Node에서도 까닭을 남기고 끝난다
// - 압축된 Codex 기록(.jsonl.zst)을 읽는 zlib zstd는 22.15.0부터 있다. 최소 버전은 backend/package.json의 engines.node가 정한다
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');

// backend/package.json의 engines.node(예: ">=22.15"). 읽지 못하면 null
export function engineRange(file = PKG) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).engines?.node || null; } catch { return null; }
}
// ">=22.15" 같은 engines 범위(이 저장소가 쓰는 꼴만). 모르는 꼴이면 통과
export function nodeSatisfies(version, range) {
  if (!range) return true;
  const m = /^\s*>=\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?\s*$/.exec(String(range));
  if (!m) return true;
  const v = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version || '').trim());
  const have = v ? [+v[1], +v[2], +v[3]] : [0, 0, 0];
  const need = [+m[1], +(m[2] || 0), +(m[3] || 0)];
  for (let i = 0; i < 3; i++) if (have[i] !== need[i]) return have[i] > need[i];
  return true;
}
// 맞지 않으면 사람에게 보일 한 줄, 맞으면 null
export function nodeProblem(version = process.versions.node, range = engineRange()) {
  if (nodeSatisfies(version, range)) return null;
  const min = String(range).replace(/^\s*>=\s*v?/, '').trim();
  return `Node ${version}는 지원하지 않습니다. Node ${min} 이상이 필요합니다(https://nodejs.org/)`;
}
