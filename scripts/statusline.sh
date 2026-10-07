#!/bin/sh
# learn-mode 상태줄 래퍼: Orca 스크립트로 입력을 전달한 뒤 컨텍스트·비용 한 줄을 출력한다.
input=$(cat)
FLAG="${LEARN_MODE_FLAG:-$HOME/.claude/.learn-mode}"
ORCA="${LEARN_MODE_ORCA:-$HOME/.orca/agent-hooks/claude-statusline.sh}"

# 1) 기존 Orca 연동 유지: 같은 입력을 넘기고 출력은 버린다.
[ -f "$ORCA" ] && printf '%s' "$input" | /bin/sh "$ORCA" >/dev/null 2>&1

# 2) 토글이 꺼져 있으면 아무것도 출력하지 않는다.
[ -f "$FLAG" ] || exit 0

if ! command -v jq >/dev/null 2>&1; then
  echo "📚 learn-mode (jq 필요)"
  exit 0
fi

row=$(printf '%s' "$input" | jq -r '
  def k: if . >= 1000 then ((. / 100 | floor) / 10 | tostring) + "k" else tostring end;
  [ (.context_window.used_percentage // 0 | floor),
    (.cost.total_cost_usd // 0),
    (.context_window.total_input_tokens // 0 | k),
    (.context_window.total_output_tokens // 0 | k) ] | @tsv' 2>/dev/null)

if [ -z "$row" ]; then
  echo "📚 learn-mode"
  exit 0
fi

pct=$(printf '%s' "$row" | cut -f1)
cost=$(printf '%s' "$row" | cut -f2)
tin=$(printf '%s' "$row" | cut -f3)
tout=$(printf '%s' "$row" | cut -f4)
cost=$(printf '%.2f' "$cost" 2>/dev/null) || cost=0.00

if [ "$pct" -ge 80 ] 2>/dev/null; then
  printf '📚 \033[31mctx %s%%\033[0m · $%s · %s↑ %s↓\n' "$pct" "$cost" "$tin" "$tout"
else
  printf '📚 ctx %s%% · $%s · %s↑ %s↓\n' "$pct" "$cost" "$tin" "$tout"
fi
exit 0
