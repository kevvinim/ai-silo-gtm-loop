# 실행 2: 발행 (매일 12:17, 19:47 KST)

**역할:** 승인되고 게이트를 통과한 초안만 게시한다.

**필요한 것:**
- Notion Post Queue `collection://fdd1b185-2333-4075-9afb-ce5a5150bdc0`
- Claude in Chrome: X와 Threads에 로그인된 상태

## 단계
1. **게시할 행 고르기.** 아래 조건을 **모두** 만족하는 행만 고른다.
   - Approved가 체크됨
   - Status = Drafted
   - Gate notes가 `PASS`로 시작함
   - Channel이 x 또는 threads
   - 정렬은 Created 오름차순
2. **상한 확인.** 오늘(KST) 이미 Posted인 행을 세어 플레이북 상한을 넘지 않게 한다. 남은 몫만 게시한다.
3. **게시.** 행마다 다음을 한다.
   - Text를 **글자 그대로** 붙인다. 고치지 않는다.
   - 게시물: X는 `https://x.com/compose/post`에서, Threads는 홈의 새 스레드 창에서 쓴다.
   - 답글: Reply to URL을 열고 그 글에 답한다.
   - 게시 뒤 글의 URL을 확인해 Posted URL에 넣고 Status를 Posted로 바꾼다.
   - 다음 행동까지 20분 넘게 기다린다. 한 실행에서 채널당 최대 2건까지만 게시한다.
4. **LinkedIn 행** (Approved, PASS):
   - `https://www.linkedin.com/feed/`에서 작성 창을 열고 Text를 채운 채 탭을 열어 둔다.
   - Kevin에게 "LinkedIn 글이 Chrome에 준비되어 있습니다. Post만 눌러 주세요"라고 알린다.
   - **Post 버튼은 누르지 않는다.**
5. **실패 처리.** 실패하면 Status를 Failed로 바꾸고 Gate notes 끝에 `FAIL · 원인`을 덧붙인다. 같은 행은 최대 2번까지만 시도한다.

## 멈춤 규칙
다음 중 하나라도 보이면 그 채널 게시를 즉시 멈추고 Kevin에게 알린다.
- 로그인 풀림
- 캡차
- 계정 경고
- 게시 제한 메시지

캡차는 절대 풀지 않는다.
