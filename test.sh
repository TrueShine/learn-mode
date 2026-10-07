#!/bin/sh
# learn-mode 테스트. 사용법: sh test.sh
cd "$(dirname "$0")" || exit 1
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
FAIL=0

check() { # 이름, 기대 부분문자열, 실제 출력
  case "$3" in
    *"$2"*) echo "ok   $1" ;;
    *) echo "FAIL $1: '$2' not in '$3'"; FAIL=1 ;;
  esac
}
check_empty() { # 이름, 실제 출력
  if [ -z "$2" ]; then echo "ok   $1"; else echo "FAIL $1: expected empty, got '$2'"; FAIL=1; fi
}

SL="sh scripts/statusline.sh"
export LEARN_MODE_FLAG="$TMP/flag"
export LEARN_MODE_ORCA="$TMP/orca.sh"
printf '#!/bin/sh\ncat > "%s/orca_in"\necho ORCA_NOISE\n' "$TMP" > "$TMP/orca.sh"
chmod +x "$TMP/orca.sh"
touch "$LEARN_MODE_FLAG"

J='{"context_window":{"used_percentage":42.7,"total_input_tokens":15500,"total_output_tokens":1200},"cost":{"total_cost_usd":1.374}}'

out=$(printf '%s' "$J" | $SL)
check "정상 값: ctx"   "ctx 42%" "$out"
check "정상 값: 비용"  '$1.37' "$out"
check "정상 값: 토큰"  "15.5k↑ 1.2k↓" "$out"
case "$out" in *ORCA_NOISE*) echo "FAIL orca 출력이 새어나옴"; FAIL=1 ;; *) echo "ok   orca 출력 차단" ;; esac
check "orca에 입력 전달" "used_percentage" "$(cat "$TMP/orca_in")"

out=$(printf '%s' '{}' | $SL)
check "필드 누락: 0 표시" "ctx 0% · \$0.00" "$out"

out=$(printf '%s' '{"context_window":{"used_percentage":null},"cost":{}}' | $SL)
check "null 값" "ctx 0%" "$out"

out=$(printf '%s' 'not json' | $SL)
check "깨진 JSON" "learn-mode" "$out"

out=$(printf '' | $SL)
check "빈 입력" "learn-mode" "$out"

out=$(printf '%s' '{"context_window":{"used_percentage":85}}' | $SL)
check "80% 이상 경고색" "$(printf '\033[31m')" "$out"

rm -f "$LEARN_MODE_FLAG"
out=$(printf '%s' "$J" | $SL)
check_empty "토글 꺼짐: 출력 없음" "$out"

export LEARN_MODE_ORCA="$TMP/missing.sh"
touch "$LEARN_MODE_FLAG"
out=$(printf '%s' "$J" | $SL)
check "orca 없음: 계속 동작" "ctx 42%" "$out"

[ "$FAIL" = 0 ] && echo "ALL PASS" || { echo "SOME FAILED"; exit 1; }
