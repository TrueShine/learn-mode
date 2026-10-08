# learn-mode

Claude Code 학습 모드: 파일을 바꾼 턴 끝에 **무엇을 / 왜 / 배울 점** 3줄 설명 + 상태줄에 컨텍스트·누적 비용 표시.

```
📚 ctx 42% · $1.37 · 15.5k↑ 1.2k↓
```

## 설치
1. 플러그인 로드: `claude --plugin-dir <이 저장소 경로>`
2. `~/.claude/settings.json`의 `statusLine`을 교체:
   ```json
   "statusLine": { "type": "command", "command": "sh <이 저장소 경로>/scripts/statusline.sh" }
   ```
   (Orca 상태줄이 있으면 래퍼가 입력을 그대로 넘겨주므로 연동은 유지됩니다. `jq` 필요)

## 입력창 위 밴드 (데스크탑·터미널)
플러그인을 설치하면 입력창 위에 같은 한 줄이 표시됩니다 (statusLine은 터미널 전용이라 데스크탑은 이 밴드를 씁니다).
```bash
claude plugin marketplace add TrueShine/learn-mode
claude plugin install learn-mode
```
`~/.claude/.learn-mode` 파일이 있을 때만 표시됩니다. 비용은 데스크탑에서 `$—`로 나올 수 있습니다(`/usage`로 확인).

## 켜기 / 끄기
```bash
touch ~/.claude/.learn-mode   # 켜기 (새 세션부터 규칙 적용)
rm -f ~/.claude/.learn-mode   # 끄기
```

## 테스트
```bash
sh test.sh
```

설계·계획: `docs/superpowers/`
