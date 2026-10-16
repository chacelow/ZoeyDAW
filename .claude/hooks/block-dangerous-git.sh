#!/bin/bash

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

DANGEROUS_PATTERNS=(
  "git push"
  "push --force"
  "git reset --hard"
  "reset --hard"
  "git branch -D"
  "git checkout --"
  "git checkout \."
  "git restore"
  "git clean -f"
  "git stash"
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    cat >&2 <<MSG
BLOCKED: '$COMMAND'
命中禁用模式 '$pattern'。

这条命令可能丢弃工作区里未提交的改动，而那些改动可能是用户正在写的代码。
你没有处置用户工作区的授权。

需要时请让用户自己执行，或改用不销毁数据的方式（如只 git add 你自己的文件）。
MSG
    exit 2
  fi
done

exit 0
