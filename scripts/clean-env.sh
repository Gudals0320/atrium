#!/bin/sh
# P372: 실제 판 세션의 env(ATRIUM_*, HERDR_*, HC_*, MTASK_*, 부모 Claude Code 표시)를 지우고, 판 값을 확인한 뒤 명령을 띄운다(시험용).
# 쓰기(워크트리 뿌리에서): sh scripts/clean-env.sh [env] [K=V]... <명령>
#   판 값은 이 감싸개 뒤에 K=V로 준다(앞에서 export하거나 감싸개 밖 env로 주면 지워진다).
#   atrium CLI·창(electron, npm start)을 부르면 판 값이 모두 시험 판을 가리켜야 돈다(app/test/e2e/lib/dev-board.mjs). 틀리면 까닭과 고치는 법을 보이고 3으로 끝난다.
#   예: sh scripts/clean-env.sh env ATRIUM_TERMINAL_SESSION=atrium-dev-p372 ATRIUM_HERDR_SESSION=atrium-dev-p372 ATRIUM_PORT=48107 \
#         ATRIUM_DATA_DIR="$PWD/backend/.dev/data" ATRIUM_CLAUDE_PROJECTS='C:\Workspace\mtask-p372-projects' ATRIUM_CLAUDE_DESKTOP=none \
#         node backend/bin/atrium.mjs --dev backend start
here=$(cd "$(dirname "$0")" && pwd)
for v in $(env | sed -n 's/^\(ATRIUM_[A-Za-z0-9_]*\|HERDR_[A-Za-z0-9_]*\|HC_[A-Za-z0-9_]*\|MTASK_[A-Za-z0-9_]*\|MT_HERDR[A-Za-z0-9_]*\|CLAUDECODE\|CLAUDE_CODE_[A-Za-z0-9_]*\|CLAUDE_PID\|XDG_CONFIG_HOME\)=.*/\1/p'); do
  unset "$v"
done
exec node "$here/../app/test/e2e/lib/dev-board.mjs" "$@"
