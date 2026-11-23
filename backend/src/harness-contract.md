# 하네스 계약 표 (P330)

판이 띄우는 하네스마다 모델·추론 수준·승인 방식을 어떤 인자로 받는지, 판이 붙이는 인자, 세션 이어 가기, 안내문 넣기를 적는다.
코드는 `harness-contract.mjs`(표), `launchers.mjs`(런처 칸 → 인자), `harness.mjs`(어댑터), `branch.mjs`(하위 세션)에 있다.
확인한 날: 2026-11-23. 판은 그날 확인한 설치 판(아래 "확인한 판")과 공식 문서를 함께 본다. 하네스가 바뀌면 `--help`로 다시 확인하고 이 표와 `harness-contract.mjs`의 KNOWN·CONTRACTS를 함께 고친다.

## 표

| 하네스 | 실행 파일 | 대화형 시작(판) | 모델 | 모델 이름을 얻는 곳 | 추론 수준 | 승인 방식(판의 권한 모드 → 인자) | 세션·이어 가기 | 안내문 | 시작할 때 뜨는 창 | 하위 에이전트 |
|---|---|---|---|---|---|---|---|---|---|---|
| Claude Code | `claude` | `claude --session-id <id> --permission-mode <m> --settings <파일>` | `--model <별칭·ID>` | 별칭 opus·sonnet·haiku·fable 또는 전체 ID, 세션 안 `/model` | `--effort low\|medium\|high\|xhigh\|max` | `--permission-mode <m>`(manual·acceptEdits·plan·auto·dontAsk·bypassPermissions) | `--session-id`, `--resume <id>` | `--append-system-prompt-file`, 플러그인(`--plugin-dir`) | 폴더 신뢰, 로그인 | 있음(`--agents`, Task) |
| Codex | `codex` | `codex -c check_for_update_on_startup=false -c developer_instructions=…` | `-m <slug>` | Codex 모델 캐시(`models_cache.json`, `codex debug models`), 세션 안 `/model` | `-c model_reasoning_effort="<v>"`: none·minimal·low·medium·high·xhigh·max·ultra(모델이 알리는 값만) | manual·plan → 없음, acceptEdits → `--sandbox workspace-write --ask-for-approval on-request`, auto → `--approve-for-me`, dontAsk·bypassPermissions → `--dangerously-bypass-approvals-and-sandbox` | 뜬 뒤 rollout에서 앎, `codex resume <id>`, `codex fork <id>` | `-c developer_instructions=<글>` | 업데이트(판이 끈다), 폴더 신뢰, 로그인 | 있음(spawn_agent) |
| Antigravity | `agy` | `agy --add-dir <안내문 폴더> --settings <JSON>` | `--model <ID>` | `agy models` | `--effort low\|medium\|high\|xhigh\|max` | manual → 없음, plan·acceptEdits·auto → `--mode plan\|accept-edits\|auto`, dontAsk·bypassPermissions → `--dangerously-skip-permissions`(판 기본: 샌드박스가 atrium을 막는다) | 뜬 뒤 대화 기록에서 앎, `--conversation <id>` | `--add-dir` 폴더의 AGENTS.md | 폴더 신뢰, 로그인 | 있음(`--agent`) |
| pi | `pi` | `pi --session-id <id> --append-system-prompt <파일>` | `--model <제공자/ID>`(`:<thinking>` 꼬리 가능) | `pi --list-models` | `--thinking off\|minimal\|low\|medium\|high\|xhigh\|max` | 승인 체계 없음(옮기지 않는다) | `--session-id <id>`(없으면 만든다) | `--append-system-prompt` | 프로젝트 신뢰(자원 읽기) | 내장 없음(확장) |
| opencode | `opencode` | `opencode --standalone -s ses_<hex>` | 설정 글 `OPENCODE_CONFIG_CONTENT`의 `model`(대화형은 `--model`이 없다) | `opencode models` | 인자 없음(모델 이름 `#variant`) | dontAsk·bypassPermissions → `--auto`, 나머지 없음 | `-s <id>`(없으면 만든다) | 설정의 `instructions` | 업데이트 알림(설정 `update`) | 있음(subagent 모드) |
| DeepSeek (dsh) | `dsh-tui`(별칭 `dst`, `dsh --profile dsh-tui`와 같다) | `dsh-tui --patch <세션 덧씌움>`, env `DSH_TUI_NO_LAUNCHPAD=1` | 판이 넘기지 않는다(dsh 안 `/model`, 전역 기억) | dsh 안 `/model` | 판이 넘기지 않는다(dsh 안 `/effort`) | 판이 넘기지 않는다(`/permission`, Windows 기본 전체 권한) | 뜬 뒤 앎, `--resume <id>` | 덧씌움의 플러그인(시스템 프롬프트 조각) | 첫 실행 마법사, 업데이트 확인 | 있음(subagent 도구) |
| Hermes | `hermes` | `hermes --tui`, env `HERMES_EPHEMERAL_SYSTEM_PROMPT` | `-m <모델>` | Hermes 제공자의 모델 이름(`hermes model`, 세션 안 `/model`) | `--tui`는 `--reasoning`을 받지 않는다(종료 2, 세션 없음). 판은 준비된 뒤 `/reasoning <v>`를 넣는다: none·minimal·low·medium·high·xhigh·max·ultra | dontAsk·bypassPermissions → `--yolo`(`--tui`도 받는다), 나머지 없음 | 뜬 뒤 state.db에서 앎, `--resume <id>` | env `HERMES_EPHEMERAL_SYSTEM_PROMPT` | 설정 마법사(`hermes setup`) | 있음 |
| OMH (Hermes 계열) | `omh` | `omh --new`, env `HERMES_EPHEMERAL_SYSTEM_PROMPT`·`OMH_TUI_WALLPAPER=0` | env `HERMES_MODEL`(bare 실행은 `-m`을 받지 않는다) | Hermes와 같다 | Hermes와 같다(`/reasoning`) | 승인 인자 없음(옮기지 않는다) | `--resume <id>` | Hermes와 같다 | — | Hermes와 같다 |
| omo | P329 | | | | | | | | | |

## 판이 하는 일

- 런처 칸(모델·추론 수준·승인 방식)은 위 표의 인자로 바뀐다. 추가 인자에 같은 인자가 있으면 추가 인자가 이긴다.
- 설정 › 런처는 추가 인자에 칸과 겹치는 값이 있으면 알리고 "칸으로 옮기기"로 옮긴다. 그 하네스 도움말에 없는 인자는 경고한다(막지 않는다). 그 화면이 받지 않는 인자(Hermes TUI의 `--reasoning`, opencode·omh의 `--model`)는 칸으로 옮기라고 알린다.
- 명령 한 줄 런처의 첫 낱말이 판이 아는 하네스(`dsh-tui`·`dst`, `omh`, `codex`, `agy`, `hermes`, `pi`, `opencode`, `claude`)면 "하네스 런처로 바꾸기"를 권한다. 명령줄 붙여 넣기도 같은 결과다.
- 점검 단추는 실행 명령에 `--version`과 `--help`만 붙여 돌려(모델 호출 없음, 8초 제한) 판이 붙일 인자가 도움말에 있는지 본다.
- `atrium child --kind X --model Y --effort Z`는 위 표대로 인자를 만든다. 받지 않는 값은 빼고 판 로그와 응답에 한 줄을 남긴다. `atrium models`는 하네스마다 넘어가는 길을 한 줄씩 보인다.
- 판은 저장된 런처를 스스로 바꾸지 않는다(사람이 단추를 누르고 저장한다).

## 확인한 판(2026-11-23, `--version`)

claude 2.1.330 · codex-cli 0.167.2 · agy 1.5.14 · dsh 0.2.2-rc.5 / dsh-tui 0.20.2 · hermes 0.23.3 · omh 5.0.0 · opencode 2.3.0 · pi 1.5.2

## 출처

- Claude Code: https://code.claude.com/docs/en/cli-reference , https://code.claude.com/docs/en/model-config
- Codex: https://learn.chatgpt.com/docs/developer-commands?surface=cli , https://learn.chatgpt.com/docs/config-file/config-reference , https://github.com/openai/codex
- Antigravity CLI: https://antigravity.google/docs/cli/reference/ , https://antigravity.google/docs/cli/headless/ (공식 문서에 `--settings`가 없다. 설치 판 `--help`에는 있다)
- dsh: https://github.com/deepseek-ai/deepseek-harness (apps/cli/README.md) · dsh-tui: https://github.com/ccch1mneyyy/dsh-TUI
- Hermes: https://hermes-agent.nousresearch.com/docs/reference/cli-commands , https://hermes-agent.nousresearch.com/docs/user-guide/tui , https://hermes-agent.nousresearch.com/docs/reference/slash-commands , https://github.com/NousResearch/hermes-agent (hermes_cli/main_tui_launch.py: `--tui`가 거부하는 인자 `--api-key`·`--base-url`·`--reasoning`)
- OMH: https://github.com/rlaope/oh-my-hermes (src/commands/bare_launch.py: `--new`·`--resume`·`--continue`)
- opencode: https://opencode.ai/docs/cli/ , https://opencode.ai/docs/config/ , https://opencode.ai/docs/permissions/ , https://opencode.ai/docs/models/
- pi: https://github.com/earendil-works/pi (packages/coding-agent/docs/cli.md, docs/models.md, docs/security.md)
