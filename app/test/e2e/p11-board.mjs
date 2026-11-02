// P11: 옛 단계의 창 시험(p6c, p7, p8, p10)을 P11 판(herdr 세션 atrium-dev-p11, 포트 47825, 이 워크트리의 backend/.dev)에서 다시 돌린다.
// MT_E2E_BOARD=p11 MT_E2E_OUT=p11을 명령줄에서 주면 각 lib의 판 값과 시험 폴더를 experiments/p11/tools/env.cjs의 값으로 바꾼다.
// 판 밖 대화 목록은 고정 자료와 P11 시험 폴더의 대화만 읽는다(P7 판처럼 실제 ~/.claude/projects 전체를 읽지 않는다)
import path from 'node:path';
import { createRequire } from 'node:module';
import { REPO } from './harness.mjs';
import { atriumEnv } from './p9-guard.mjs';

// P13: MT_E2E_BOARD=p13이면 P13 판(experiments/p13/tools/env.cjs)
const BOARD = ['p11', 'p13', 'p16', 'p17', 'p21', 'p23', 'p26'].includes(process.env.MT_E2E_BOARD) ? process.env.MT_E2E_BOARD : null;
export const P11 = !!BOARD;
const T = P11 ? createRequire(import.meta.url)(path.join(REPO, 'experiments', BOARD, 'tools', 'env.cjs')) : null;
export const P11_DIRS = T ? T.DIRS : null;
export const boardEnv = (env) => (P11 ? { ...env, ...atriumEnv(T.P11_ENV) } : env); // P18: env.cjs(기록)의 옛 이름 MTASK_*를 ATRIUM_*로(ATRIUM_*가 이기므로)
export const outName = (phase) => (P11 ? BOARD : phase);
export const dir = (key, dflt) => (P11 ? P11_DIRS[key] : dflt);
