#!/usr/bin/env bash
#
# 把一个 GitHub issue 交给 DeepSeek，在独立 worktree 中执行。
#
# 用法：
#   scripts/delegate.sh <issue-number> <worktree-path> <prompt-file>
#
# API key 从主仓库根目录的 .env.local 读取（DEEPSEEK_API_KEY=...）。
# 该文件被 .gitignore 的 .env.* 覆盖，不会进版本库。
# 本脚本只把它传给子进程的环境变量，不打印、不写入日志。
#
# 可选覆盖：
#   DEEPSEEK_BASE_URL   默认 https://api.deepseek.com/anthropic
#   DEEPSEEK_MODEL      默认 deepseek-chat
#
# 退出码 0 只代表进程正常结束，不代表任务成功。
# headless 进程可能 exit 0、subtype 写着 success，同一条记录里却是
# is_error: true / api_error_status: 4xx，一个工具调用都没跑。
# 因此本脚本在进程结束后额外核对 payload。

set -euo pipefail

usage() { echo "用法: scripts/delegate.sh <issue-number> <worktree-path> <prompt-file>" >&2; exit 2; }
fail()  { echo "❌ $1" >&2; exit 1; }

[ $# -eq 3 ] || usage
ISSUE=$1; WORKTREE=$2; PROMPT=$3

# ---- 读取凭据 ----
# 逐个键名精确提取，不 source 整个文件，避免执行其中的任意代码。
read_env() {
  local file=$1 key=$2
  [ -f "$file" ] || return 1
  grep -m1 -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "$file" 2>/dev/null \
    | sed -E "s/^[^=]*=[[:space:]]*//; s/^[\"']//; s/[\"']$//"
}

SCRIPT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
GIT_COMMON=$(git -C "$SCRIPT_ROOT" rev-parse --git-common-dir 2>/dev/null || echo "")
MAIN_ROOT=$([ -n "$GIT_COMMON" ] && cd "$(dirname "$GIT_COMMON")" && pwd || echo "$SCRIPT_ROOT")

ENV_FILE=""
for cand in "$MAIN_ROOT/.env.local" "$SCRIPT_ROOT/.env.local"; do
  [ -f "$cand" ] && { ENV_FILE=$cand; break; }
done

: "${DEEPSEEK_API_KEY:=$([ -n "$ENV_FILE" ] && read_env "$ENV_FILE" DEEPSEEK_API_KEY || true)}"
[ -n "${DEEPSEEK_API_KEY:-}" ] || fail "找不到 DEEPSEEK_API_KEY。请在 $MAIN_ROOT/.env.local 中设置，或 export 到环境。"

BASE_URL=${DEEPSEEK_BASE_URL:-$([ -n "$ENV_FILE" ] && read_env "$ENV_FILE" DEEPSEEK_BASE_URL || true)}
BASE_URL=${BASE_URL:-https://api.deepseek.com/anthropic}
MODEL=${DEEPSEEK_MODEL:-$([ -n "$ENV_FILE" ] && read_env "$ENV_FILE" DEEPSEEK_MODEL || true)}
MODEL=${MODEL:-deepseek-chat}

[ -d "$WORKTREE" ] || fail "worktree 不存在: $WORKTREE"
[ -f "$PROMPT" ]   || fail "prompt 文件不存在: $PROMPT"
command -v jq >/dev/null || fail "需要 jq 才能核对 payload"
command -v claude >/dev/null || fail "找不到 claude CLI"

LOG_DIR="$MAIN_ROOT/.delegate-logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/issue-${ISSUE}-$(date +%Y%m%d-%H%M%S).jsonl"

# 工具白名单：不给 git push，不给 gh pr create。
# push 与开 PR 由 review 方在验收后执行。
ALLOWED='Read,Write,Edit,Glob,Grep,Bash(git add:*),Bash(git commit:*),Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(gh issue view:*),Bash(gh issue comment:*),Bash(npm:*),Bash(npx:*),Bash(pnpm:*),Bash(node:*)'

echo "issue    : #$ISSUE"
echo "worktree : $WORKTREE"
echo "model    : $MODEL @ $BASE_URL"
echo "凭据     : ${ENV_FILE:-环境变量}"
echo "log      : $LOG"
echo

set +e
(
  cd "$WORKTREE" || exit 3
  ANTHROPIC_BASE_URL="$BASE_URL" \
  ANTHROPIC_AUTH_TOKEN="$DEEPSEEK_API_KEY" \
  ANTHROPIC_MODEL="$MODEL" \
  claude -p "$(cat "$PROMPT")" \
    --output-format stream-json --verbose \
    --allowedTools "$ALLOWED"
) | tee "$LOG"
RUN_STATUS=${PIPESTATUS[0]}
set -e

# ---- payload 核对 ----
RESULT=$(jq -c 'select(.type=="result")' "$LOG" | tail -1)
[ -n "$RESULT" ] || fail "日志里没有 result 事件；进程可能根本没跑起来（退出码 $RUN_STATUS）"

IS_ERROR=$(jq -r '.is_error // false'        <<<"$RESULT")
SUBTYPE=$( jq -r '.subtype  // "unknown"'    <<<"$RESULT")
NUM_TURNS=$(jq -r '.num_turns // 0'          <<<"$RESULT")
API_ERR=$( jq -r '.api_error_status // empty'<<<"$RESULT")
TOOL_CALLS=$(jq -s '[.[] | .. | objects | select(.type? == "tool_use")] | length' "$LOG")

echo
echo "── payload 核对 ──────────────"
printf "进程退出码 : %s\n" "$RUN_STATUS"
printf "subtype    : %s\n" "$SUBTYPE"
printf "is_error   : %s\n" "$IS_ERROR"
printf "api_error  : %s\n" "${API_ERR:-无}"
printf "轮次       : %s\n" "$NUM_TURNS"
printf "工具调用   : %s\n" "$TOOL_CALLS"
echo "─────────────────────────────"

[ "$IS_ERROR" = "false" ] || fail "is_error=true，任务失败（subtype=$SUBTYPE）"
[ -z "$API_ERR" ]         || fail "api_error_status=$API_ERR，请求没打通"
[ "$TOOL_CALLS" -gt 0 ]   || fail "一个工具调用都没有，模型没有真正动手"
[ "$RUN_STATUS" -eq 0 ]   || fail "进程退出码 $RUN_STATUS"

echo
echo "✅ payload 核对通过。这只说明它真的跑了，不说明做对了。"
echo "   下一步：核对 issue #$ISSUE 的每条 AC，以及外部事实。"
echo "   改动预览：git -C $WORKTREE log --oneline origin/main..HEAD"
