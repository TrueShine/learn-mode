# 데스크탑 상태 밴드 설계

## 목적
statusLine은 터미널 전용이라 데스크탑 앱에서는 컨텍스트·비용이 보이지 않는다. 플러그인 훅 모듈로 입력창 위에 같은 정보를 한 줄 밴드로 표시한다. 기존 `learn-mode` 플러그인에 추가한다.

## 성공 기준
- 데스크탑과 터미널 모두에서 입력창 위에 `📚 ctx 42% · $1.37 · 15.5k↑ 1.2k↓` 한 줄이 흐린 글씨로 표시된다.
- 컨텍스트 80% 이상이면 빨간색으로 바뀐다.
- 비용을 받을 수 없으면 `$—`로 표시한다.
- `~/.claude/.learn-mode` 파일이 없으면 밴드를 그리지 않는다.
- 수치 조회가 실패해도 세션은 계속 진행되고 밴드만 숨는다.
- 기존 터미널 statusLine과 3줄 설명 규칙은 그대로 동작한다.

## 범위 밖 (YAGNI)
토스트, `/learn-status` 명령, 레이트리밋 표시, 터미널 statusLine 교체.

## 구조
```
learn-mode/
├── hooks/
│   ├── hooks.json         # 기존 SessionStart 훅 + "modules": ["./register.tsx"]
│   ├── register.tsx       # 훅 모듈 (신규)
│   └── register.test.ts   # claude plugin test용 테스트 (신규)
```

## 동작
1. `session.start`, `turn.complete`에서 `$.session.usage()`를 호출해 `context.percent`(없을 수 있음)와 `cost.usd`(없을 수 있음)를 상태값(atom)에 저장한다. 타입 정의(`SessionUsage`)로 확인한 이름이다.
2. `turn.complete`의 usage에서 입력·출력 토큰을 모듈 변수에 누적한다. 플러그인이 다시 로드되면 0부터 다시 센다.
3. `ui.render`(`component: 'AbovePrompt'`) 훅이 상태값을 읽어 `Box`/`Text`로 한 줄을 그린다. 요소는 `$.ui.resolve(e)`로 받는다.
4. 토글 파일이 없으면 `next(e)`만 호출해 아무것도 그리지 않는다.
5. 표시 형식은 터미널 상태줄 래퍼와 같다: 토큰은 1000 이상이면 `15.5k`, 비용은 소수 둘째 자리.

## 오류 처리
- `usage()`가 예외를 던지거나 필드가 없으면 해당 갱신을 건너뛰고 이전 값을 유지한다. 처음부터 값이 없으면 밴드를 그리지 않는다.
- 훅은 항상 `next(e)`를 호출해 세션 흐름을 막지 않는다.

## 구현 중 확인할 것
- 한 `hooks.json`에 기존 `hooks`와 `modules`를 함께 둘 수 있는지는 `claude plugin validate`로 확인한다. 안 되면 모듈을 별도 플러그인 폴더로 나눈다.
- `context.percent`가 0~100인지 0~1인지는 구현 때 실제 값으로 확인한다. `turn.complete` usage의 토큰 필드 이름(`input_tokens`/`output_tokens`)도 타입 정의에서 확인한다.
- 토글 파일 읽기에 쓸 `$.fs` 호출 방식을 타입 정의에서 확인한다.
- 데스크탑이 플러그인을 로드하는 방식이 터미널의 `--plugin-dir`과 다를 수 있으므로 설치 단계에서 실제로 확인한다.

## 테스트
- `register.test.ts`를 `claude plugin test`로 실행한다. 표면은 `terminal`, `desktop` 둘 다 검사한다.
- 케이스: 정상 값, 비용 없음(`$—`), 80% 이상(빨강), 토글 꺼짐(그리지 않음), `usage()` 실패(그리지 않음).
