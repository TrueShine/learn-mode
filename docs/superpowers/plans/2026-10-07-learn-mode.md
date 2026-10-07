# learn-mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 켜고 끌 수 있는 Claude Code 학습 모드(턴 끝 3줄 설명 + 컨텍스트·비용 상태줄)를 만든다.

**Architecture:** 플러그인 하나. SessionStart 훅이 토글 파일(`~/.claude/.learn-mode`)을 보고 규칙을 주입하고, 상태줄 래퍼 스크립트가 Orca 스크립트에 입력을 전달한 뒤 `jq`로 한 줄을 출력한다. 설정 변경(`settings.json`)은 마지막 태스크에서 사용자 승인 후에만 한다.

**Tech Stack:** POSIX sh, jq, Claude Code plugin(hooks + skills)

**Spec:** `docs/superpowers/specs/2026-10-07-learn-mode-design.md`

## Global Constraints

- 토글 파일: `~/.claude/.learn-mode` (있으면 켜짐)
- 상태줄 출력 형식: `📚 ctx {pct}% · ${cost} · {in}↑ {out}↓`, 컨텍스트 80% 이상이면 색 경고
- 읽는 JSON 필드: `context_window.used_percentage`, `cost.total_cost_usd`, `context_window.total_input_tokens`, `context_window.total_output_tokens` (없으면 0)
- Orca 스크립트 경로: `~/.orca/agent-hooks/claude-statusline.sh` (없으면 건너뜀)
- 어떤 경우에도 상태줄 스크립트는 종료 코드 0
- 범위 밖: 퀴즈, 수정마다 즉시 설명, 자체 단가 계산, 패널 UI
- 스펙 정정: 플러그인 매니페스트는 루트가 아니라 `.claude-plugin/plugin.json`

## Review Focus

1. `cost`나 `context_window`가 통째로 없는 JSON(세션 초반): 0으로 표시하고 죽지 않는다.
2. `used_percentage`가 `null`이거나 소수(42.7): 정수로 내려서 표시한다.
3. stdin이 비었거나 JSON이 깨짐: 에러 없이 `📚 learn-mode`만 표시한다.
4. Orca 스크립트가 실패하거나 출력이 있음: 출력은 버리고 우리 줄만 나온다.
5. `~/.claude/.learn-mode`가 없음: 아무것도 출력하지 않는다(Orca 전달은 유지).

---

### Task 1: 상태줄 래퍼

**Files:**
- Create: `scripts/statusline.sh`
- Test: `test.sh`

**Interfaces:**
- Produces: `scripts/statusline.sh` — stdin으로 Claude Code JSON을 받고 stdout에 한 줄 출력. 환경변수 `LEARN_MODE_FLAG`(토글 파일), `LEARN_MODE_ORCA`(Orca 스크립트)로 경로를 바꿀 수 있다(테스트용, 기본값은 Global Constraints의 경로).
- Produces: `test.sh` — `sh test.sh`로 전체 테스트 실행, 실패 시 비정상 종료. Task 2가 케이스를 추가한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test.sh`:

```sh
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
```

- [ ] **Step 2: 실패 확인**

Run: `sh test.sh`
Expected: FAIL (`scripts/statusline.sh`가 없어 모든 케이스 실패)

- [ ] **Step 3: 최소 구현**

`scripts/statusline.sh`:

```sh
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
cost=$(printf '%.2f' "$cost" 2>/dev/null || echo 0.00)

if [ "$pct" -ge 80 ] 2>/dev/null; then
  printf '📚 \033[31mctx %s%%\033[0m · $%s · %s↑ %s↓\n' "$pct" "$cost" "$tin" "$tout"
else
  printf '📚 ctx %s%% · $%s · %s↑ %s↓\n' "$pct" "$cost" "$tin" "$tout"
fi
exit 0
```

- [ ] **Step 4: 통과 확인**

Run: `sh test.sh`
Expected: 모든 줄 `ok`, 마지막에 `ALL PASS`. `jq`가 없다면 `brew install jq` 후 재실행.

- [ ] **Step 5: 커밋**

```bash
git add scripts/statusline.sh test.sh
git commit -m "feat: 컨텍스트·비용 상태줄 래퍼 추가

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 훅, 스킬, 플러그인 매니페스트

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `hooks/hooks.json`
- Create: `hooks/session-start.sh`
- Create: `skills/learn-mode/SKILL.md`
- Modify: `test.sh` (훅 케이스 추가, `[ "$FAIL" = 0 ]` 마지막 줄 바로 위에 삽입)

**Interfaces:**
- Consumes: Task 1의 `test.sh`(`check`, `check_empty`, `$TMP`, `LEARN_MODE_FLAG`)
- Produces: `hooks/session-start.sh` — 토글 파일이 있으면 `SKILL.md`의 frontmatter를 뺀 본문을 stdout으로 출력, 없으면 출력 없음. 같은 `LEARN_MODE_FLAG` 환경변수를 존중한다.

- [ ] **Step 1: 실패하는 테스트 추가**

`test.sh`의 마지막 `[ "$FAIL" = 0 ] ...` 줄 바로 위에 추가:

```sh
# --- 훅 ---
HOOK="sh hooks/session-start.sh"
touch "$LEARN_MODE_FLAG"
out=$($HOOK)
check "훅: 규칙 주입" "무엇을" "$out"
case "$out" in *"name: learn-mode"*) echo "FAIL 훅: frontmatter가 섞여 나옴"; FAIL=1 ;; *) echo "ok   훅: frontmatter 제거" ;; esac
rm -f "$LEARN_MODE_FLAG"
check_empty "훅: 토글 꺼짐이면 출력 없음" "$($HOOK)"
```

- [ ] **Step 2: 실패 확인**

Run: `sh test.sh`
Expected: 훅 케이스 FAIL (`hooks/session-start.sh` 없음)

- [ ] **Step 3: 구현**

`.claude-plugin/plugin.json`:

```json
{
  "name": "learn-mode",
  "version": "0.1.0",
  "description": "학습 모드: 변경사항 3줄 설명 + 컨텍스트·비용 상태줄",
  "author": { "name": "TrueShine" }
}
```

`hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "sh \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh\"" }
        ]
      }
    ]
  }
}
```

`hooks/session-start.sh`:

```sh
#!/bin/sh
# 토글 파일이 있으면 학습 규칙(SKILL.md 본문)을 컨텍스트로 주입한다.
FLAG="${LEARN_MODE_FLAG:-$HOME/.claude/.learn-mode}"
[ -f "$FLAG" ] || exit 0
awk '/^---$/ { c++; next } c >= 2' "$(dirname "$0")/../skills/learn-mode/SKILL.md"
```

`skills/learn-mode/SKILL.md`:

```markdown
---
name: learn-mode
description: 학습 모드 켜기/끄기. "/learn-mode on" 또는 "/learn-mode off". 켜져 있으면 파일을 바꾼 턴의 끝에 무엇을/왜/배울 점을 3줄로 설명한다.
---

# 학습 모드

## 켜기/끄기
- 사용자가 `on`이라고 하면 `touch ~/.claude/.learn-mode` 실행 후 "학습 모드 켜짐. 새 세션부터 규칙이 적용됩니다"라고 한 줄로 알린다.
- `off`라고 하면 `rm -f ~/.claude/.learn-mode` 실행 후 "학습 모드 꺼짐"이라고 한 줄로 알린다.

## 학습 모드 규칙 (켜져 있는 동안 항상 적용)
파일을 수정한 턴의 끝에만 아래 3줄을 붙인다. 변경이 없는 턴에는 붙이지 않는다.

- **무엇을:** 바꾼 내용을 한 줄로
- **왜:** 그렇게 바꾼 이유를 한 줄로
- **배울 점:** 이 변경에서 얻을 수 있는 개념이나 요령을 한 줄로

어려운 용어는 쉬운 말로 풀어 쓴다.
```

- [ ] **Step 4: 통과 확인**

Run: `sh test.sh`
Expected: 훅 케이스 포함 모두 `ok`, `ALL PASS`

- [ ] **Step 5: 커밋**

```bash
git add .claude-plugin hooks skills test.sh
git commit -m "feat: 학습 규칙 훅·스킬·플러그인 매니페스트 추가

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 설치 (사용자 승인 필요)

**Files:**
- Modify: `~/.claude/settings.json` (`statusLine` 키만)
- Create: `~/.claude/settings.json.bak-learn-mode` (백업)

**Interfaces:**
- Consumes: Task 1의 `scripts/statusline.sh`, Task 2의 플러그인 디렉터리

- [ ] **Step 1: 백업과 변경안 제시 (적용 전에 사용자에게 보여주고 승인 받기)**

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.bak-learn-mode
```

보여줄 변경: `statusLine.command`를 `sh /Users/jiukryu/Documents/demo/learn-mode/scripts/statusline.sh`로 교체. 기존 Orca 명령은 래퍼가 `~/.orca/agent-hooks/claude-statusline.sh`로 대신 호출한다. **승인 전에는 파일을 수정하지 않는다.**

- [ ] **Step 2: 승인 후 적용**

```bash
python3 - <<'EOF'
import json, os
p = os.path.expanduser('~/.claude/settings.json')
d = json.load(open(p))
d['statusLine'] = {'type': 'command', 'command': 'sh /Users/jiukryu/Documents/demo/learn-mode/scripts/statusline.sh'}
json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False)
EOF
touch ~/.claude/.learn-mode
```

- [ ] **Step 3: 수동 검증**

Run: `claude --plugin-dir /Users/jiukryu/Documents/demo/learn-mode`
Expected: 새 세션 하단에 `📚 ctx N% · $X.XX · ...` 표시, 파일을 수정하는 요청 후 턴 끝에 3줄 설명. Orca 앱에서 세션 상태가 계속 갱신되는지도 확인.

- [ ] **Step 4: 되돌리기 방법 확인**

```bash
cp ~/.claude/settings.json.bak-learn-mode ~/.claude/settings.json && rm -f ~/.claude/.learn-mode
```

- [ ] **Step 5: 커밋 (설치 안내 README 보강 후)**

README에 설치·토글·되돌리기 3줄을 추가하고 커밋한다.

```bash
git add README.md
git commit -m "docs: 설치와 되돌리기 안내 추가

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```
