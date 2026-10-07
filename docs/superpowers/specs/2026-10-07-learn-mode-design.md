# learn-mode 설계

## 목적
Claude Code에서 켜고 끌 수 있는 "학습 모드".
1. 파일을 바꾼 턴의 끝에 `무엇을 / 왜 / 배울 점`을 3줄로 설명한다.
2. 상태줄에 컨텍스트 사용량과 누적 토큰·비용을 항상 표시한다.

## 성공 기준
- `/learn-mode on` 후 새 세션에서 파일 수정 턴 끝에 3줄 설명이 붙는다.
- 변경이 없는 턴에는 설명이 붙지 않는다.
- 상태줄에 `📚 ctx 42% · $1.37 · 15.5k↑ 1.2k↓` 형식이 표시된다.
- `/learn-mode off` 후 규칙 주입과 상태줄 표시가 모두 멈춘다.
- 기존 Orca 상태줄 연동이 끊기지 않는다.

## 범위 밖 (YAGNI)
퀴즈, 파일 수정마다 즉시 설명, 자체 단가 계산, 패널·토스트 UI.

## 구조
```
learn-mode/
├── plugin.json
├── hooks/session-start.sh      # 토글 파일이 있으면 학습 규칙을 주입
├── skills/learn-mode/SKILL.md  # /learn-mode on|off + 설명 규칙 본문
├── scripts/statusline.sh       # 래퍼: Orca 실행 → 우리 한 줄 출력
└── test.sh                     # 샘플 JSON assert 테스트
```

## 컴포넌트

### 토글
- 상태 파일: `~/.claude/.learn-mode`. 있으면 켜짐, 없으면 꺼짐.
- `/learn-mode on`은 파일을 만들고, `off`는 지운다.

### SessionStart 훅 (`hooks/session-start.sh`)
- 토글 파일이 없으면 아무것도 출력하지 않고 종료한다.
- 있으면 `skills/learn-mode/SKILL.md`의 규칙 본문을 additional context로 출력한다.

### 학습 규칙 (`SKILL.md`)
- 파일을 수정한 턴의 끝에만 `무엇을 / 왜 / 배울 점`을 한 줄씩, 총 3줄로 쓴다.
- 변경이 없는 턴에는 생략한다.
- 용어는 쉬운 말로 풀어 쓴다.

### 상태줄 래퍼 (`scripts/statusline.sh`)
1. stdin을 한 번 읽어 변수에 저장한다.
2. 기존 Orca 스크립트(`~/.orca/agent-hooks/claude-statusline.sh`)가 있으면 같은 입력을 넘기고 출력은 버린다.
3. 토글 파일이 없으면 여기서 종료한다(Orca 전달만 수행).
4. `jq`로 다음 필드를 읽는다. 값이 없으면 기본값 0.
   - `context_window.used_percentage`
   - `cost.total_cost_usd`
   - `context_window.total_input_tokens`
   - `context_window.total_output_tokens`
5. `📚 ctx {pct}% · ${cost} · {in}↑ {out}↓` 한 줄을 출력한다. 컨텍스트 80% 이상이면 색을 바꿔 경고한다.

## 오류 처리
- `jq`가 없으면 `📚 learn-mode (jq 필요)`만 출력한다.
- Orca 스크립트가 없으면 건너뛴다.
- 어떤 경우에도 비정상 종료하지 않는다.

## 설치와 설정 변경
- 플러그인 statusLine은 사용자 설정보다 우선순위가 낮다. 이미 Orca statusLine이 있으므로 `~/.claude/settings.json`의 statusLine을 래퍼로 바꿔야 한다.
- 이 변경은 구현과 테스트 통과 후, 변경 내용을 보여주고 사용자 승인을 받은 뒤에만 한다. 기존 값은 백업한다.

## 테스트
- `test.sh`: 샘플 JSON을 래퍼에 파이프로 넣고 출력 문자열을 assert한다.
- 케이스: 정상 값, 필드 누락, 토글 꺼짐, 컨텍스트 80% 이상.
