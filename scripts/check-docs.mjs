#!/usr/bin/env node
// 문서 점검을 손으로 돌린다(P257). 점검 본체는 판의 backend/src/doc-check.mjs이고, 판은 지휘 세션의 턴 끝과 done 알림에 한 줄로 알린다.
//   node scripts/check-docs.mjs [워크스페이스 뿌리] [--json]
// 종료 코드: 0 어긴 것 없음, 1 어긴 것 있음(막지 않는다. 알리기만), 2 경로 없음.
import fs from 'node:fs';
import path from 'node:path';
import { checkDocs, reportLines } from '../backend/src/doc-check.mjs';

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const root = path.resolve(argv.find((a) => !a.startsWith('--')) ?? process.cwd());
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) { console.error(`경로 없음: ${root}`); process.exit(2); }
const res = await checkDocs(root);
if (json) console.log(JSON.stringify(res, null, 2));
else for (const line of reportLines(res)) console.log(line);
process.exit(res.problems.length ? 1 : 0);
