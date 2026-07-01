# Handoff: Telegram Crew Applications

## Repo Context

Project path:
`/Users/kravts/Documents/Codex/2026-06-18/files-mentioned-by-the-user-claude/work/wow`

Branch:
`master`

Deploy:
push to `master` triggers autodeploy.

Recent commits related to this feature:
- `c67bc11 Add Telegram crew applications`
- `f59212f Improve Telegram application form flow`
- `d8d0fd1 Support flexible birth date parsing`
- `cc67d73 Polish Telegram application UX`
- `46f8eb6 Prevent duplicate Telegram application cards`

Current status:
- Code has been pushed to `master`.
- `pnpm -r build` and `pnpm -r lint` were green after the last committed change.
- API scenario tests were not runnable locally because local Postgres was unavailable: `ECONNREFUSED 127.0.0.1:5432`.

## Feature Goal

Allow new workers to open the Telegram bot, press `/start`, and, if they are not already in SEVER App, fill out a Crew application.

Applications must be reviewable in the SEVER App Crew section. Reviewers/owners should receive a Telegram notification with the full application and photo.

## Implemented

### Contracts

Files:
- `packages/contracts/src/people.ts`
- `packages/contracts/src/common.ts`
- `packages/contracts/src/notifications.ts`

Added:
- `CrewApplicationStatus`
- `CrewApplicationDTO`
- `SubmitCrewApplicationInput`
- people service methods for list/get/submit/accept/reject applications
- event `people.application.submitted`
- permission `people.applications.review`
- advanced notification event `people.application.submitted`

### Database And People Module

Files:
- `apps/api/src/modules/people/migration.ts`
- `apps/api/src/modules/people/service.ts`
- `apps/api/src/modules/people/routes.ts`

Added:
- table `people.crew_applications`
- user fields `about` and `source`
- API:
  - `GET /api/crew-applications?status=pending`
  - `POST /api/crew-applications/:id/accept`
  - `POST /api/crew-applications/:id/reject`

Access:
- `people.applications.review`
- or `people.manage`

Accepting an application creates a normal SEVER user from application data.

Photo handling currently stores Telegram file id as `telegram-file:<file_id>` for user `photoUrl` after accept. This is not directly displayable in the web UI; the shared Avatar ignores `telegram-file:` URLs to avoid broken images.

### Notifications

Files:
- `apps/api/src/registry.ts`
- `apps/api/src/modules/notifications/index.ts`

Intended behavior:
- `people.submitApplication(...)` writes `people.crew_applications`
- service publishes `people.application.submitted`
- registry handler finds reviewers with `people.applications.review`
- checks advanced notification preference `people.application.submitted`
- creates in-app notification
- sends Telegram photo message with full application text

Potential issue:
User reports owner did not receive notification. Needs real end-to-end debugging.

### Telegram Bot

File:
`apps/api/src/core/telegramBot.ts`

Current behavior:
- unknown user after `/start` starts Crew application flow
- bot maintains application session in memory
- sends one compact application card
- sends separate question message
- deletes old question and user answer where possible
- supports one-by-one answers, numbered answers, edit mode, submit button, and `/cancel`
- protects against duplicate cards when Telegram returns `message is not modified`
- repeated `/start` during active application removes old application/question messages

Known limitation:
Application sessions are in-memory. If the bot process restarts, a partially filled application is lost.

### Crew UI

Files:
- `apps/web/src/features/crew/CrewPage.tsx`
- `apps/web/src/app/shell/AppShell.tsx`
- `apps/web/src/app/shell/WorkspaceSwitcher.tsx`

Added:
- pending applications block in Crew
- role selection
- accept/reject actions
- Crew pending application badge/count

Current UI issue:
The block only appears if `canReviewApplications && pendingApplications.length > 0`. User reports there is no visible section. Make the section always visible for reviewers, with empty state.

## User Requests Still Pending

### 1. Birth Date Input

User requested:
- remove text date recognition entirely
- keep only numeric date recognition
- support separator `.`
- likely also support `/`, `-`, and maybe space
- display date in current application card as `ДД.ММ.ГГГГ`, not `YYYY-MM-DD`

Current code still has:
- `MONTH_WORDS`
- broad `parseDate()` with Russian/English/Serbian month names

Needed:
- delete `MONTH_WORDS`
- simplify `parseDate`
- add display formatter for birth date
- store ISO `YYYY-MM-DD` internally if useful for DB
- display as `DD.MM.YYYY`

Suggested behavior:
- accept `01.02.2000`, `1.2.2000`, `01/02/2000`, `01-02-2000`, maybe `01 02 2000`
- interpret as `DD MM YYYY`
- avoid ambiguous text/month parsing

### 2. Photo Question Text

Change:
`Отправьте фото человека.`

to:
`Отправьте своё фото`

Location:
`APPLICATION_STEPS`, field `photoFileId`.

### 3. Completed Application State

User requested:
- after all required fields are filled, send or keep a separate question: `Анкета заполнена. Хотите отправить?`
- after submit, do not replace the whole card with only a final text
- leave the filled application visible to the applicant as submitted

Needed:
- card status line should become something like `Анкета · отправлена`
- fields remain visible
- buttons disappear after submit
- optionally send a short separate confirmation message

### 4. Owner Notification Missing

User reports:
- after submitting, no notification arrived to owner

Investigate:
1. Did `people.submitApplication` succeed?
2. Does DB contain row in `people.crew_applications`?
3. Did `bus.publish({ type: "people.application.submitted" })` happen?
4. Does `registry.ts` handler run?
5. Does owner have `people.applications.review` or `notifications.advanced`?
6. Does owner have numeric Telegram `telegramId` linked?
7. Is advanced pref `people.application.submitted` enabled?
8. Does `sendTelegramPhoto` silently fail?

Important:
`sendTelegramPhoto` catches errors silently. For this workflow, add logging or at least make the in-app notification reliable regardless of Telegram photo failure.

### 5. Application Not Visible In SEVER App

User reports:
- application did not appear
- "there is not even such section"

Investigate:
- migration ran on server
- table exists
- row exists
- API returns pending applications
- current user permissions include `people.applications.review` or `people.manage`
- Crew section visible even when empty

Recommended UI change:
- in Crew page, always show `Анкеты` section for reviewers
- if no pending applications, show `Новых анкет нет`
- show loading/error states clearly
- keep pending count in section head

### 6. More Robust Telegram Flow

Test thoroughly:
- invalid email twice
- invalid date twice
- invalid date then valid date
- `/start` during active application
- `/cancel`
- send photo before photo step
- send list with invalid item
- edit mode then invalid field
- submit twice
- bot restart mid-application

## Suggested Next Implementation Order

1. Simplify birth date parsing and display.
2. Change photo prompt.
3. Adjust final "filled / ready to submit / submitted" Telegram states.
4. Make Crew applications section always visible for reviewers.
5. Add debugging/logging around submit/notification path.
6. Verify on production with real bot:
   - fill application
   - check DB/API
   - check Crew UI
   - check owner in-app notification
   - check owner Telegram notification

## Verification Commands

Run:
```bash
pnpm -r build
pnpm -r lint
pnpm --filter @sever/web test
```

API tests require local Postgres:
```bash
pnpm --filter @sever/api test
```

Previously API tests failed locally only because Postgres was not reachable:
`ECONNREFUSED 127.0.0.1:5432`.

## Production Debug Checklist

Check migrations:
```sql
select * from people.crew_applications order by created_at desc limit 5;
```

Check permissions:
`people.applications.review`

Check API manually:
`GET /api/crew-applications?status=pending`

Check notification pref:
`advanced:people.application.submitted`

Should default true if no explicit pref row exists.

Owner must have numeric `telegram_id`, not `@username`.

Check API logs for:
- application submit errors
- Telegram sendPhoto failures
- registry event handler errors

## User Preference

User is very sensitive to Telegram/application UX:
- keep chat clean
- avoid long explanatory text
- avoid repeated examples
- compact, presentable, minimal
- question as separate message
- card as clean status view
- no ugly bulky text blocks
