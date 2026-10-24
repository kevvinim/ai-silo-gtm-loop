# 일정: 예약 작업 3개

예약 작업은 매번 새 세션에서 실행된다. 각 작업의 프롬프트는 "해당 runs 파일을 읽고 그대로 수행하라"이다.

| 이름 | cron (KST) | 프롬프트 | PC 필요 |
|---|---|---|---|
| GTM 1 · 감지·초안·게이트 | `CRON_TZ=Asia/Seoul 47 8 * * *` | `loop/runs/01-sense-draft.md` | 예 (Chrome) |
| GTM 2 · 발행 | `CRON_TZ=Asia/Seoul 17 12 * * *`, `CRON_TZ=Asia/Seoul 47 19 * * *` | `loop/runs/02-publish.md` | 예 (Chrome) |
| GTM 3 · 측정·학습 | `CRON_TZ=Asia/Seoul 7 23 * * *` | `loop/runs/03-measure-learn.md` | 예 (Chrome) |

- **기간:** 7일. d7 측정이 끝나면 모두 끈다.
- **사람:** 하루 한 번(아침 알림 뒤) Notion에서 Approved를 체크한다. LinkedIn 글은 Post를 누른다.
