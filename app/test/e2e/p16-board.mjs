// P16: 옛 단계의 창 시험(p12, p14, p15)을 P16 판(herdr 세션 multitask-dev-p16, 포트 47832, 이 워크트리의 backend/.dev)에서 다시 돌린다.
// MT_E2E_BOARD=p16 MT_E2E_OUT=p16을 명령줄에서 주면(experiments/p16/tools/e2e.cjs) 각 시험의 판 값 넷과 시험 폴더 이름을 바꾼다.
// 대화 목록 폴더(MTASK_CLAUDE_PROJECTS)는 시험이 정한 것을 시험 폴더 이름만 바꿔 쓴다.
import path from 'node:path';
import { REPO } from './harness.mjs';

export const P16 = process.env.MT_E2E_BOARD === 'p16';
export const P16_DEV = path.join(REPO, 'backend', '.dev');
// 시험 폴더: C:\Workspace\mtask-p15-ws\demo → C:\Workspace\mtask-p16-ws\demo
export const p16Dir = (d) => (P16 ? d.replace(/mtask-p1\d/g, 'mtask-p16') : d);
// 시험의 판 값을 P16 판 값으로. 시험이 바라는 MT_E2E_OUT 대신 p16을 받는다
export function p16Env(env) {
  if (!P16) return env;
  const out = { ...env, MTASK_HERDR_SESSION: 'multitask-dev-p16', MTASK_PORT: '47832', MTASK_DATA_DIR: path.join(P16_DEV, 'data'), MTASK_APP_USERDATA: path.join(P16_DEV, 'app') };
  if (out.MTASK_CLAUDE_PROJECTS) out.MTASK_CLAUDE_PROJECTS = p16Dir(out.MTASK_CLAUDE_PROJECTS);
  return out;
}
export const outOk = (phase) => process.env.MT_E2E_OUT === (P16 ? 'p16' : phase);
