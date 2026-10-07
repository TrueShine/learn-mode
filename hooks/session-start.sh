#!/bin/sh
# 토글 파일이 있으면 학습 규칙(SKILL.md 본문)을 컨텍스트로 주입한다.
FLAG="${LEARN_MODE_FLAG:-$HOME/.claude/.learn-mode}"
[ -f "$FLAG" ] || exit 0
awk '/^---$/ { c++; next } c >= 2' "$(dirname "$0")/../skills/learn-mode/SKILL.md"
