// 이슈 #18: 지원하는 Node 버전 확인. 백엔드(main.mjs), atrium CLI(bin/atrium.mjs), 업데이트 미리 보기(update-verify.mjs)가
// 다른 모듈을 불러오기 전에 부른다. 그래서 이 파일은 node: 내장 모듈만 쓴다(패키지를 불러오지 않는다).
// - Node 22.13.0은 경로에 한글이 있으면 패키지(ws)를 불러올 때 0xC0000005로 끝난다(22.14.0에서 고쳐짐).
//   이 확인은 ws를 부르기 전에 돌아서, 그 Node에서도 까닭을 남기고 끝난다
// - 압축된 Codex 기록(.jsonl.zst)을 읽는 zlib zstd는 22.15.0부터 있다
// - Node 24.10~24.13은 한글·공백 경로에서 백엔드 시험(p119·p159) 프로세스가 0xC0000409로 끝난다(24.14.0부터 없음, 영문 경로는 없음)
// 그래서 범위는 "^22.15.0 || >=24.14.0"(backend/package.json의 engines.node가 정한다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');

// backend/package.json의 engines.node(예: ">=22.15"). 읽지 못하면 null
export function engineRange(file = PKG) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).engines?.node || null; } catch { return null; }
}
// engines 범위의 한 비교: ">=24.14.0", "<23", "^22.15.0"(=">=22.15.0 <23.0.0"), "22.15.0"(같음). 모르는 꼴이면 null
const verOf = (s) => { const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(String(s || '').trim()); return m ? [+m[1], +(m[2] || 0), +(m[3] || 0)] : null; };
const cmp = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
function comparators(part) {
  const out = [];
  for (const tok of part.trim().split(/\s+/).filter(Boolean)) {
    const m = /^(>=|<=|>|<|=|\^)?(.+)$/.exec(tok);
    const v = m && verOf(m[2]);
    if (!v) return null;
    if (m[1] === '^') out.push(['>=', v], ['<', [v[0] + 1, 0, 0]]);
    else out.push([m[1] || '=', v]);
  }
  return out.length ? out : null;
}
const OPS = { '>=': (c) => c >= 0, '>': (c) => c > 0, '<': (c) => c < 0, '<=': (c) => c <= 0, '=': (c) => c === 0 };
// engines 범위(이 저장소가 쓰는 꼴: 비교들을 띄어 쓴 묶음을 "||"로 잇는다). 모르는 꼴이면 통과
export function nodeSatisfies(version, range) {
  if (!range) return true;
  const sets = String(range).split('||').map(comparators);
  if (sets.some((s) => !s)) return true;
  const have = verOf(String(version || '').trim().replace(/[-+].*$/, '')) || [0, 0, 0];
  return sets.some((set) => set.every(([op, v]) => OPS[op](cmp(have, v))));
}
// 범위를 사람이 읽을 글로: "^22.15.0 || >=24.14.0" → "22.x는 22.15 이상, 또는 24.14 이상"
const short = (v) => (v[2] ? v.join('.') : `${v[0]}.${v[1]}`);
export function rangeText(range) {
  return String(range).split('||').map((p) => {
    const t = p.trim();
    let m = /^\^(.+)$/.exec(t);
    if (m && verOf(m[1])) { const v = verOf(m[1]); return `${v[0]}.x는 ${short(v)} 이상`; }
    m = /^>=\s*(.+)$/.exec(t);
    if (m && verOf(m[1])) return `${short(verOf(m[1]))} 이상`;
    return t;
  }).join(', 또는 ');
}
// 맞지 않으면 사람에게 보일 한 줄, 맞으면 null
export function nodeProblem(version = process.versions.node, range = engineRange()) {
  if (nodeSatisfies(version, range)) return null;
  return `지원하지 않는 Node 버전입니다(${version}). 필요한 버전: ${rangeText(range)}(https://nodejs.org/)`;
}
